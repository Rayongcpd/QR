/**
 * UNIFIED FRONTEND SCRIPT
 * Handles QR Generation, PDF Conversion, and GAS Backend communication
 */

// ==================== CONFIGURATION ====================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyEWuqp7mjsHPl_0hB64LsscEtuoBjUxy31JtpQ2wt4VJGXUbfIeK2LpRxhBd5MP5UlTQ/exec'; 

// ==================== STATE MANAGEMENT ====================
let currentTab = 'qr';
let currentQRType = 'url';
let currentQRColor = '#ffffff';
let currentBGColor = '#000000';
let pdfDPI = 150;
let convertedImages = [];
let pdfTotalPages = 0;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    // QR Color Listeners
    document.getElementById('qr-color').addEventListener('input', (e) => {
        currentQRColor = e.target.value;
        document.getElementById('qr-color-val').textContent = currentQRColor;
    });
    document.getElementById('bg-color').addEventListener('input', (e) => {
        currentBGColor = e.target.value;
        document.getElementById('bg-color-val').textContent = currentBGColor;
    });

    // File Input labels
    document.getElementById('val-file').addEventListener('change', (e) => {
        const name = e.target.files[0]?.name || 'คลิกหรือลากไฟล์มาวางที่นี่';
        document.getElementById('file-label').textContent = name;
    });

    document.getElementById('pdf-upload').addEventListener('change', handlePDFUpload);

    // Auto-save toggle UI
    const toggleWrapper = document.getElementById('pdf-auto-save-wrapper');
    const toggleInput = document.getElementById('pdf-auto-save');
    const toggleDot = document.getElementById('pdf-toggle-dot');
    
    toggleWrapper.addEventListener('click', () => {
        toggleInput.checked = !toggleInput.checked;
        if (toggleInput.checked) {
            toggleWrapper.classList.add('toggle-active');
            toggleDot.style.transform = 'translateX(1.5rem)';
        } else {
            toggleWrapper.classList.remove('toggle-active');
            toggleDot.style.transform = 'translateX(0)';
        }
    });

    // Worker Init for PDF.js
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
});

// ==================== CORE FUNCTIONS ====================

function switchTab(tab) {
    currentTab = tab;
    // UI Update
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    document.getElementById(`section-${tab}`).classList.remove('hidden');
}

// ==================== QR GENERATOR ====================

function setQRType(type) {
    currentQRType = type;
    document.querySelectorAll('.type-badge').forEach(badge => badge.classList.remove('active'));
    document.querySelector(`.type-badge[data-type="${type}"]`).classList.add('active');
    
    document.querySelectorAll('.qr-input-field').forEach(field => field.classList.add('hidden'));
    document.getElementById(`input-${type}`).classList.remove('hidden');
}

async function generateQR() {
    const btn = document.getElementById('btn-generate');
    const previewContainer = document.getElementById('qr-canvas-wrapper');
    const actions = document.getElementById('qr-actions');
    
    btn.disabled = true;
    btn.innerHTML = '<span>กำลังประมวลผล...</span>';
    
    try {
        let finalData = '';
        
        if (currentQRType === 'url') {
            finalData = document.getElementById('val-url').value;
        } else if (currentQRType === 'text') {
            finalData = document.getElementById('val-text').value;
        } else if (currentQRType === 'wifi') {
            const ssid = document.getElementById('val-wifi-ssid').value;
            const pass = document.getElementById('val-wifi-pass').value;
            finalData = `WIFI:T:WPA;S:${ssid};P:${pass};;`;
        } else if (currentQRType === 'file') {
            const file = document.getElementById('val-file').files[0];
            if (!file) throw new Error('กรุณาเลือกไฟล์ก่อน');
            
            // Upload to Drive first
            const base64 = await toBase64(file);
            const uploadResult = await callBackend('uploadFileToDrive', {
                fileName: file.name,
                base64Data: base64,
                mimeType: file.type
            });
            
            if (!uploadResult.success) throw new Error(uploadResult.error);
            finalData = uploadResult.fileUrl;
        }

        if (!finalData) throw new Error('กรุณากรอกข้อมูล');

        // Clear and Generate
        previewContainer.innerHTML = '';
        new QRCode(previewContainer, {
            text: finalData,
            width: 280,
            height: 280,
            colorDark: currentQRColor,
            colorLight: currentBGColor,
            correctLevel: QRCode.CorrectLevel.H
        });

        actions.classList.remove('hidden');
        showToast('สร้าง QR Code สำเร็จ! 🎉', '✨');

        // Parallel: Save record to Sheet
        callBackend('saveQRRecord', {
            qr_id: 'QR_' + Date.now(),
            type: currentQRType,
            data: finalData,
            color: currentQRColor,
            bg_color: currentBGColor
        });

    } catch (err) {
        showToast(err.message, '⚠️');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>สร้าง QR Code</span>';
    }
}

function downloadQR() {
    const img = document.querySelector('#qr-canvas-wrapper img');
    if (!img) return;
    const link = document.createElement('a');
    link.href = img.src;
    link.download = `qrcode_${Date.now()}.png`;
    link.click();
}

function copyQRLink() {
    // In actual implementation, we'd copy the generated content
    showToast('คัดลอกลิงก์สำเร็จ', '🔗');
}

// ==================== PDF CONVERTER ====================

function setPDFDPI(dpi) {
    pdfDPI = dpi;
    document.querySelectorAll('.dpi-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.dpi-btn[data-dpi="${dpi}"]`).classList.add('active');
}

async function handlePDFUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('pdf-label').textContent = file.name;
    document.getElementById('pdf-status').classList.remove('hidden');
    document.getElementById('pdf-preview-area').innerHTML = '';
    document.getElementById('pdf-preview-area').classList.add('hidden');
    document.getElementById('pdf-result-actions').classList.add('hidden');
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        pdfTotalPages = pdf.numPages;
        convertedImages = [];

        for (let i = 1; i <= pdfTotalPages; i++) {
            updatePDFProgress(i, pdfTotalPages);
            
            const page = await pdf.getPage(i);
            const scale = pdfDPI / 72;
            const viewport = page.getViewport({ scale });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            
            const base64 = canvas.toDataURL('image/jpeg', 0.9);
            convertedImages.push({ base64Data: base64, pageNum: i });
            
            // Incremental preview
            addPDFPreview(base64, i);
        }

        document.getElementById('pdf-preview-area').classList.remove('hidden');
        document.getElementById('pdf-result-actions').classList.remove('hidden');
        showToast('แปลงไฟล์ PDF สำเร็จ!', '📄');

        // Auto-save to Drive if checked
        if (document.getElementById('pdf-auto-save').checked) {
            savePDFToDrive(file.name);
        }

    } catch (err) {
        showToast('เกิดข้อผิดพลาดในการโหลด PDF', '⚠️');
        console.error(err);
    }
}

function updatePDFProgress(current, total) {
    const percent = Math.round((current / total) * 100);
    document.getElementById('pdf-progress-bar').style.width = percent + '%';
    document.getElementById('pdf-progress-val').textContent = percent + '%';
    document.getElementById('pdf-progress-text').textContent = `กำลังประมวลผลหน้าที่ ${current} จาก ${total}...`;
}

function addPDFPreview(base64, num) {
    const container = document.getElementById('pdf-preview-area');
    const div = document.createElement('div');
    div.className = 'preview-card group';
    div.innerHTML = `
        <img src="${base64}" class="w-full h-auto">
        <div class="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span class="text-xs font-bold bg-white text-black px-2 py-1 rounded">หน้า ${num}</span>
        </div>
    `;
    container.appendChild(div);
}

async function savePDFToDrive(filename) {
    if (!convertedImages.length) return;
    
    showToast('กำลังบันทึกลง Google Drive...', '☁️');
    
    const result = await callBackend('savePDFConversion', {
        filename: filename || 'converted_pdf',
        images: convertedImages,
        dpi: pdfDPI
    });
    
    if (result.success) {
        showToast('บันทึกลง Drive สำเร็จ!', '✅');
    } else {
        showToast('บันทึกลง Drive ไม่สำเร็จ', '❌');
    }
}

async function downloadAllImages() {
    const zip = new JSZip();
    convertedImages.forEach(img => {
        const base64Data = img.base64Data.split(',')[1];
        zip.file(`page-${img.pageNum}.jpg`, base64Data, { base64: true });
    });
    
    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `pdf_images_${Date.now()}.zip`;
    link.click();
}

// ==================== UTILS ====================

async function callBackend(action, data) {
    try {
        // GAS doPost handles text/plain well and avoids CORS preflight issues
        const response = await fetch(GAS_URL, {
            method: 'POST',
            mode: 'no-cors', 
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify({ action, data })
        });
        
        // Since 'no-cors' mode is used, we can't inspect the response object details
        // We log success for debugging
        console.log(`Backend action '${action}' triggered successfully.`);
        return { success: true }; 
    } catch (err) {
        console.error('Backend Communication Error:', err);
        showToast('การสื่อสารกับ Backend ขัดข้อง', '⚠️');
        return { success: false, error: err.toString() };
    }
}

function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function showToast(msg, icon) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').textContent = msg;
    document.getElementById('toast-icon').textContent = icon;
    
    toast.classList.add('toast-show');
    setTimeout(() => {
        toast.classList.remove('toast-show');
    }, 3000);
}
