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
let isAdminAuthenticated = sessionStorage.getItem('isAdminAuth') === 'true';

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

    // Admin specific check
    if (tab === 'admin') {
        updateAdminUI();
    }
}

// ==================== SECRET ADMIN TRIGGER ====================
let _secretClickCount = 0;
let _secretClickTimer = null;

function secretAdminTrigger(el) {
    _secretClickCount++;

    // Visual pulse on logo
    el.style.transform = 'scale(0.88)';
    setTimeout(() => { el.style.transform = 'scale(1)'; }, 120);

    // Reset counter after 3 seconds of inactivity
    clearTimeout(_secretClickTimer);
    _secretClickTimer = setTimeout(() => { _secretClickCount = 0; }, 3000);

    if (_secretClickCount >= 5) {
        _secretClickCount = 0;
        clearTimeout(_secretClickTimer);

        // Show Admin nav items
        const tabAdmin       = document.getElementById('tab-admin');
        const tabAdminMobile = document.getElementById('tab-admin-mobile');
        if (tabAdmin) tabAdmin.style.display = '';
        if (tabAdminMobile) tabAdminMobile.style.display = '';

        // Navigate to Admin
        switchTab('admin');

        // Subtle easter egg toast (no icon labeling "admin")
        showToast('🔐 ยินดีต้อนรับ', '✨');
    }
}

// ==================== ADMIN SYSTEM ====================

function updateAdminUI() {
    const loginView = document.getElementById('admin-login-view');
    const dashboardView = document.getElementById('admin-dashboard-view');
    
    if (isAdminAuthenticated) {
        loginView.style.display = 'none';
        dashboardView.style.display = 'block';
        // Auto-load QR records on first login
        loadAdminRecords('qr');
    } else {
        loginView.style.display = 'block';
        dashboardView.style.display = 'none';
    }
}

async function loginAdmin() {
    const passwordInput = document.getElementById('admin-password');
    const code = passwordInput.value;
    const btn = document.getElementById('btn-admin-login');

    if (!code) {
        showToast('กรุณากรอกรหัสผ่าน', '⚠️');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span>กำลังตรวจสอบ...</span>';

    try {
        const result = await callBackend('verifyAdmin', { adminCode: code });
        if (result.success) {
            isAdminAuthenticated = true;
            sessionStorage.setItem('isAdminAuth', 'true');
            sessionStorage.setItem('adminCode', code); // Store for later actions
            showToast('เข้าสู่ระบบ Admin สำเร็จ! 🛡️', '✨');
            updateAdminUI();
            passwordInput.value = '';
        } else {
            showToast('รหัสผ่านไม่ถูกต้อง', '❌');
        }
    } catch (err) {
        showToast('เกิดข้อผิดพลาดในการตรวจสอบ', '⚠️');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>ยืนยันรหัสผ่าน ⚡</span>';
    }
}

function logoutAdmin() {
    isAdminAuthenticated = false;
    sessionStorage.removeItem('isAdminAuth');
    sessionStorage.removeItem('adminCode');
    showToast('ออกจากระบบ Admin แล้ว', '🔓');
    updateAdminUI();
}


async function clearData(type) {
    const confirmed = confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูล ${type} ทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้`);
    if (!confirmed) return;
    const adminCode = sessionStorage.getItem('adminCode');
    const action = type === 'QR' ? 'clearQRRecords' : 'clearPDFRecords';
    showToast('กำลังลบข้อมูล...', '🗑️');
    try {
        const result = await callBackend(action, { adminCode });
        if (result.success) {
            showToast(`ลบข้อมูล ${type} สำเร็จ!`, '✅');
            loadAdminRecords(type.toLowerCase());
        } else {
            showToast(result.error || 'ลบข้อมูลไม่สำเร็จ', '❌');
        }
    } catch (err) {
        showToast('เกิดข้อผิดพลาดในการสั่งลบข้อมูล', '⚠️');
    }
}

// ── Admin Data List ──────────────────────────────────────
let currentAdminTab = 'qr';
let adminQRRecords = [];
let adminPDFRecords = [];

function adminSwitchTab(tab) {
    currentAdminTab = tab;
    document.querySelectorAll('#admin-dashboard-view .type-badge').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('admin-tab-' + tab);
    if (btn) btn.classList.add('active');
    document.getElementById('admin-panel-qr').style.display = tab === 'qr' ? 'block' : 'none';
    document.getElementById('admin-panel-pdf').style.display = tab === 'pdf' ? 'block' : 'none';
    loadAdminRecords(tab);
}

async function loadAdminRecords(type) {
    const loadingEl  = document.getElementById(`admin-${type}-loading`);
    const listEl     = document.getElementById(`admin-${type}-list`);
    const emptyEl    = document.getElementById(`admin-${type}-empty`);
    const selectAll  = document.getElementById(`${type}-select-all`);

    loadingEl.style.display = 'block';
    listEl.style.display    = 'none';
    emptyEl.style.display   = 'none';
    if (selectAll) selectAll.checked = false;

    const action = type === 'qr' ? 'readQRRecords' : null;
    let records = [];

    try {
        if (type === 'qr') {
            const result = await callBackend('readQRRecords', {});
            records = result.success ? result.data : [];
            adminQRRecords = records;
        } else {
            // PDF: use GET endpoint to get records with row indices
            const res = await fetch(`${GAS_URL}?action=getPDFHistory`);
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                // data may be an array of objects (now includes _rowIndex from updated backend)
                // or an array of raw arrays (old backend) — handle both
                records = json.data.map((row, i) => {
                    if (typeof row === 'object' && !Array.isArray(row)) return row;
                    return {
                        _rowIndex: i + 2,
                        'Timestamp': row[0], 'Filename': row[1],
                        'Total Pages': row[2], 'DPI': row[3],
                        'Drive Folder URL': row[4], 'User Email': row[5]
                    };
                });
            }
            adminPDFRecords = records;
        }
    } catch (e) {
        records = [];
    }

    loadingEl.style.display = 'none';

    if (!records || records.length === 0) {
        emptyEl.style.display = 'block';
        updateSelectedCount(type, 0, 0);
        return;
    }

    listEl.innerHTML = '';
    listEl.style.display = 'block';
    renderRecords(type, records, listEl);
    updateSelectedCount(type, 0, records.length);
}

function renderRecords(type, records, container) {
    records.forEach((rec, idx) => {
        const rowId  = type === 'qr' ? (rec.qr_id || rec['qr_id'] || idx) : (rec._rowIndex || idx + 2);
        const label  = type === 'qr'
            ? `<strong style="color:#e2e8f0">${rec.type || 'URL'}</strong> · <span style="color:#94a3b8;font-size:11px;word-break:break-all;">${String(rec.data || '').slice(0, 60)}</span>`
            : `<strong style="color:#e2e8f0">${rec['Filename'] || rec[1] || 'ไฟล์'}</strong> · <span style="color:#94a3b8;font-size:11px;">${rec['Total Pages'] || rec[2] || '?'} หน้า · DPI ${rec['DPI'] || rec[3] || ''}</span>`;
        const dateVal = type === 'qr' ? rec.created_at : (rec['Timestamp'] || rec[0] || '');
        const dateStr = dateVal ? new Date(dateVal).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.15s;cursor:pointer;border-radius:10px;';
        row.onmouseenter = () => row.style.background = 'rgba(255,255,255,0.03)';
        row.onmouseleave = () => row.style.background = '';
        row.innerHTML = `
            <input type="checkbox" class="${type}-record-cb" data-id="${rowId}" style="width:16px;height:16px;cursor:pointer;flex-shrink:0;" onchange="updateSelectedCount('${type}')">
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;line-height:1.4;">${label}</div>
                <div style="font-size:11px;color:#475569;margin-top:2px;">${dateStr}</div>
            </div>
        `;
        row.onclick = (e) => {
            if (e.target.tagName === 'INPUT') return;
            const cb = row.querySelector('input[type=checkbox]');
            cb.checked = !cb.checked;
            updateSelectedCount(type);
        };
        container.appendChild(row);
    });
}

function toggleSelectAll(type) {
    const masterCb = document.getElementById(`${type}-select-all`);
    document.querySelectorAll(`.${type}-record-cb`).forEach(cb => cb.checked = masterCb.checked);
    updateSelectedCount(type);
}

function updateSelectedCount(type, selectedOverride, totalOverride) {
    const checkboxes = document.querySelectorAll(`.${type}-record-cb`);
    const total    = totalOverride !== undefined ? totalOverride : checkboxes.length;
    const selected = selectedOverride !== undefined ? selectedOverride : [...checkboxes].filter(c => c.checked).length;
    const el = document.getElementById(`${type}-selected-count`);
    if (el) el.textContent = selected > 0 ? `เลือก ${selected} / ${total} รายการ` : `เลือกทั้งหมด (${total} รายการ)`;
    const masterCb = document.getElementById(`${type}-select-all`);
    if (masterCb && checkboxes.length > 0) masterCb.indeterminate = selected > 0 && selected < total;
}

async function deleteSelected(type) {
    const checkboxes = [...document.querySelectorAll(`.${type}-record-cb:checked`)];
    if (checkboxes.length === 0) {
        showToast('กรุณาเลือกรายการที่ต้องการลบก่อน', '⚠️');
        return;
    }
    const confirmed = confirm(`ต้องการลบ ${checkboxes.length} รายการที่เลือก? การกระทำนี้ไม่สามารถย้อนกลับได้`);
    if (!confirmed) return;

    const adminCode = sessionStorage.getItem('adminCode');
    const ids = checkboxes.map(cb => cb.dataset.id);
    const action = type === 'qr' ? 'deleteQRRecord' : 'deletePDFRecord';

    showToast(`กำลังลบ ${ids.length} รายการ...`, '🗑️');
    try {
        const result = await callBackend(action, { adminCode, ids });
        if (result.success) {
            showToast(`ลบสำเร็จ ${result.deleted || ids.length} รายการ`, '✅');
            loadAdminRecords(type);
        } else {
            showToast(result.error || 'ลบไม่สำเร็จ', '❌');
        }
    } catch (err) {
        showToast('เกิดข้อผิดพลาดในการลบข้อมูล', '⚠️');
    }
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
        // Use 'cors' mode to allow reading the response from GAS
        const response = await fetch(GAS_URL, {
            method: 'POST',
            mode: 'cors', 
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify({ action, data })
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const result = await response.json();
        console.log(`Backend action '${action}' completed:`, result);
        return result; 
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
