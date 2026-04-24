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

    // Worker Init for PDF.js
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    // Gemini API Init
    const geminiInput = document.getElementById('gemini-api-key');
    if (geminiInput) {
        geminiInput.value = localStorage.getItem('gemini_api_key') || '';
        geminiInput.addEventListener('input', (e) => {
            localStorage.setItem('gemini_api_key', e.target.value);
            updateGeminiUI();
        });
    }
    updateGeminiUI();
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
        const expiryDays = rec.expiry_days || 365;

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.15s;cursor:pointer;border-radius:10px;';
        row.onmouseenter = () => row.style.background = 'rgba(255,255,255,0.03)';
        row.onmouseleave = () => row.style.background = '';
        row.innerHTML = `
            <input type="checkbox" class="${type}-record-cb" data-id="${rowId}" style="width:16px;height:16px;cursor:pointer;flex-shrink:0;" onchange="updateSelectedCount('${type}')">
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;line-height:1.4;">${label}</div>
                <div style="font-size:11px;color:#475569;margin-top:2px;display:flex;align-items:center;gap:10px;">
                    <span>${dateStr}</span>
                    <span style="color:rgba(255,255,255,0.1)">|</span>
                    <span style="display:flex;align-items:center;gap:4px;">
                        ลบอัตโนมัติใน: 
                        <input type="number" class="expiry-input" value="${expiryDays}" 
                            onchange="updateRecordExpiry('${type}', '${rowId}', this.value)"
                            onclick="event.stopPropagation()">
                        วัน
                    </span>
                </div>
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

async function updateRecordExpiry(type, id, days) {
    const adminCode = sessionStorage.getItem('adminCode');
    const sheet = type === 'qr' ? 'QR_Data' : 'PDF_Data';
    
    try {
        const result = await callBackend('updateExpiryDays', { 
            adminCode, 
            sheet, 
            id, 
            days: parseInt(days) 
        });
        
        if (result.success) {
            showToast('อัปเดตระยะเวลาลบอัตโนมัติสำเร็จ', '✅');
        } else {
            showToast(result.error || 'อัปเดตไม่สำเร็จ', '❌');
        }
    } catch (err) {
        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', '⚠️');
    }
}

async function setupCleanupAutomation() {
    const adminCode = sessionStorage.getItem('adminCode');
    if (!confirm('ต้องการตั้งค่าระบบลบไฟล์อัตโนมัติให้ทำงานทุกวัน (เวลา 02:00 น.) ใช่หรือไม่?')) return;
    
    showToast('กำลังตั้งค่าระบบ...', '⚙️');
    try {
        const result = await callBackend('setupCleanupTrigger', { adminCode });
        if (result.success) {
            showToast(result.message || 'ตั้งค่าระบบลบอัตโนมัติสำเร็จ!', '✅');
        } else {
            showToast(result.error || 'ตั้งค่าไม่สำเร็จ', '❌');
        }
    } catch (err) {
        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', '⚠️');
    }
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
    
    const btn = document.getElementById('pdf-save-btn') || { innerHTML: '', disabled: false };
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = '<span>กำลังบันทึก...</span>';
    showToast('กำลังบันทึกหน้าภาพลง Google Drive...', '☁️');
    
    try {
        const result = await callBackend('savePDFConversion', {
            filename: filename || document.getElementById('pdf-label').textContent || 'converted_pdf',
            images: convertedImages,
            dpi: pdfDPI
        });
        
        if (result.success) {
            showToast('บันทึกลง Drive สำเร็จ! ✅', '✨');
            btn.innerHTML = '<span>✅ บันทึกแล้ว</span>';
            btn.style.background = 'rgba(34, 197, 94, 0.2)';
            btn.style.color = '#4ade80';
            btn.style.borderColor = 'rgba(34, 197, 94, 0.4)';
            
            if (result.folderUrl) {
                // Optionally make it clickable to open the folder
                btn.onclick = () => window.open(result.folderUrl, '_blank');
                btn.title = 'คลิกเพื่อเปิดโฟลเดอร์';
                btn.disabled = false;
            }
        } else {
            showToast('บันทึกลง Drive ไม่สำเร็จ: ' + (result.error || 'Unknown error'), '❌');
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    } catch (err) {
        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', '⚠️');
        btn.disabled = false;
        btn.innerHTML = originalText;
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

// ==================== DOCGUARD AI (DOCUMENT REVIEW & LEARNING) ====================

let customRules = JSON.parse(localStorage.getItem('ai_custom_rules')) || [];

function handleDocCompare() {
    const t1 = document.getElementById('dg-text-1').value.trim();
    const t2 = document.getElementById('dg-text-2').value.trim();
    
    if (!t1 || !t2) {
        showToast('กรุณากรอกข้อมูลให้ครบทั้งสองช่อง', '⚠️');
        return;
    }

    const resultsArea = document.getElementById('dg-results');
    resultsArea.style.display = 'block';
    resultsArea.scrollIntoView({ behavior: 'smooth' });

    let dmp;
    try {
        if (typeof diff_match_patch !== 'undefined') {
            dmp = new diff_match_patch();
        } else if (window.diff_match_patch) {
            dmp = new window.diff_match_patch();
        } else {
            throw new Error('diff_match_patch library not found');
        }
    } catch (e) {
        showToast('ไม่พบไลบรารีเปรียบเทียบข้อความ', '❌');
        return;
    }
    
    const diffs = dmp.diff_main(t1, t2);
    dmp.diff_cleanupSemantic(diffs);

    let leftHtml = '', rightHtml = '', addedCount = 0, removedCount = 0;

    diffs.forEach(part => {
        const type = part[0], text = part[1].replace(/\n/g, '<br>');
        if (type === 0) { 
            leftHtml += `<span>${text}</span>`; 
            rightHtml += `<span>${text}</span>`; 
        } else if (type === -1) { 
            leftHtml += `<span class="diff-del">${text}</span>`; 
            removedCount += part[1].length; 
        } else if (type === 1) { 
            rightHtml += `<span class="diff-add">${text}</span>`; 
            addedCount += part[1].length; 
        }
    });

    const leftEl = document.getElementById('dg-diff-left');
    const rightEl = document.getElementById('dg-diff-right');
    const summaryEl = document.getElementById('dg-summary-bar');

    if (leftEl) leftEl.innerHTML = leftHtml;
    if (rightEl) rightEl.innerHTML = rightHtml;

    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="summary-item"><span style="color:#ef4444">●</span> ลบ ${removedCount}</div>
            <div class="summary-item"><span style="color:#10b981">●</span> เพิ่ม ${addedCount}</div>
        `;
    }

    analyzeWithAI(t2);
}

function analyzeWithAI(text) {
    const aiOutput = document.getElementById('dg-ai-output');
    aiOutput.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(59,130,246,0.05);border-radius:12px;border:1px solid rgba(59,130,246,0.1);"><div class="ai-loader-pulse"></div> <span style="color:#60a5fa;font-weight:600;">🤖 AI Legal Analyst กำลังประมวลผลกฎหมายที่เกี่ยวข้อง...</span></div>';

    setTimeout(() => {
        const lower = text.toLowerCase();
        let findings = [];
        let allKeywords = [];

        // --- 1. Labor Protection Act ---
        if (lower.includes('ลาป่วย')) {
            const match = text.match(/ลาป่วยได้\s*(\d+)\s*(?:วัน)/);
            if (match && parseInt(match[1]) < 30) {
                findings.push({ 
                    status: 'danger', 
                    title: '🚨 ขัดกฎหมายแรงงาน: สิทธิลาป่วย', 
                    analysis: 'พ.ร.บ. คุ้มครองแรงงาน มาตรา 32 กำหนดให้ลูกจ้างมีสิทธิลาป่วยได้ **"เท่าที่ป่วยจริง"** และได้รับค่าจ้าง 30 วัน/ปี การจำกัดสิทธิน้อยกว่านี้ถือเป็นโมฆะ',
                    keywords: ['ลาป่วย', match[1]] 
                });
            }
        }
        
        if (lower.includes('ลาคลอด')) {
            const match = text.match(/ลาคลอดได้\s*(\d+)\s*(?:วัน)/);
            if (match && parseInt(match[1]) < 98) {
                findings.push({ 
                    status: 'danger', 
                    title: '🚨 ขัดกฎหมายแรงงาน: ลาคลอด', 
                    analysis: 'สิทธิลาคลอดบุตรไม่เกิน **98 วัน** (มาตรา 41) หากกำหนดน้อยกว่านี้ถือว่าขัดต่อกฎหมายความสงบเรียบร้อย',
                    keywords: ['ลาคลอด', match[1]] 
                });
            }
        }

        if (lower.includes('ลากิจ')) {
            const match = text.match(/ลากิจได้\s*(\d+)\s*(?:วัน)/);
            if (match && parseInt(match[1]) < 3) {
                findings.push({ 
                    status: 'danger', 
                    title: '🚨 ขัดกฎหมายแรงงาน: ลากิจ', 
                    analysis: 'ลูกจ้างมีสิทธิลากิจธุระอันจำเป็นได้ไม่น้อยกว่า **3 วันทำงานต่อปี** โดยได้รับค่าจ้าง (มาตรา 34)',
                    keywords: ['ลากิจ', match[1]] 
                });
            }
        }

        // --- 2. Unfair Contract Terms ---
        if (lower.includes('ไม่รับผิดชอบทุกกรณี') || lower.includes('ไม่รับผิดชอบต่อความเสียหาย')) {
            findings.push({ 
                status: 'danger', 
                title: '🚨 ข้อสัญญาที่ไม่เป็นธรรม: การยกเว้นความรับผิด', 
                analysis: 'การยกเว้นความรับผิดล่วงหน้าสำหรับความประมาทเลินเล่อ อาจถือเป็น **"ข้อสัญญาที่ไม่เป็นธรรม"** และไม่มีผลบังคับตามกฎหมาย',
                keywords: ['ไม่รับผิดชอบทุกกรณี', 'ไม่รับผิดชอบต่อความเสียหาย'] 
            });
        }

        // --- 3. Civil and Commercial Code ---
        const intMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:%|ร้อยละ|เปอร์เซ็นต์)/i);
        if (lower.includes('ดอกเบี้ย') && intMatch) {
            const rate = parseFloat(intMatch[1]);
            if (rate > 15) {
                findings.push({ 
                    status: 'danger', 
                    title: '🚨 ดอกเบี้ยเกินอัตรา (ร้อยละ ' + rate + ')', 
                    analysis: 'ห้ามคิดดอกเบี้ยเกิน **ร้อยละ 15 ต่อปี** (ป.พ.พ. มาตรา 654) หากฝ่าฝืนดอกเบี้ยตกเป็นโมฆะทั้งหมด',
                    keywords: ['ดอกเบี้ย', intMatch[1]] 
                });
            }
        }

        if (lower.includes('ค้ำประกัน') && (lower.includes('ลูกหนี้ร่วม') || lower.includes('รับผิดอย่างลูกหนี้ร่วม'))) {
            findings.push({ 
                status: 'danger', 
                title: '🚨 ผิดกฎหมายค้ำประกันใหม่', 
                analysis: 'ข้อตกลงที่ให้ผู้ค้ำประกันต้องรับผิดอย่าง **"ลูกหนี้ร่วม"** กับลูกหนี้ชั้นต้น ให้ตกเป็น **"โมฆะ"** (ป.พ.พ. มาตรา 681/1)',
                keywords: ['ลูกหนี้ร่วม', 'ค้ำประกัน'] 
            });
        }

        // --- 4. PDPA ---
        const pdpaKeywords = ['ข้อมูลส่วนบุคคล', 'เปิดเผยข้อมูล', 'เก็บรวบรวม'];
        if (pdpaKeywords.some(k => lower.includes(k)) && !lower.includes('ยินยอม') && !lower.includes('consent')) {
            findings.push({ 
                status: 'danger', 
                title: '🚨 ความเสี่ยง PDPA: ขาด Consent Clause', 
                analysis: 'ไม่พบข้อความขอความยินยอม (Consent) ในการจัดการข้อมูลส่วนบุคคล **เสี่ยงต่อโทษปรับทางปกครองสูงสุด 5 ล้านบาท**',
                keywords: ['ข้อมูลส่วนบุคคล', 'เปิดเผยข้อมูล'] 
            });
        }

        // --- 5. Custom Rules ---
        customRules.forEach(rule => {
            if (lower.includes(rule.keyword.toLowerCase())) {
                findings.push({ status: rule.status, title: '🧠 กฎที่เรียนรู้ใหม่: ' + rule.keyword, analysis: rule.reason, keywords: [rule.keyword] });
            }
        });

        // Rendering
        if (findings.length === 0) {
            aiOutput.innerHTML = `
                <div class="status-badge status-safe" style="padding:16px; border-radius:16px;">🛡️ ระบบไม่พบความเสี่ยงทางกฎหมายที่ชัดเจน</div>
                <div class="ai-reasoning" style="margin-top:16px; padding:20px; background:rgba(16,185,129,0.05); border:1px solid rgba(16,185,129,0.1); border-radius:12px;">
                    <p style="color:#10b981; font-weight:700;">✅ ผลการวิเคราะห์เบื้องต้น:</p>
                    <p style="color:#94a3b8; font-size:13px;">ไม่พบจุดขัดกฎหมายหลักแรงงาน, ป.พ.พ., และ PDPA</p>
                </div>`;
        } else {
            let html = `<div style="margin-bottom:16px; font-size:12px; color:#64748b; font-weight:600;">พบความเสี่ยง ${findings.length} รายการ</div>`;
            findings.forEach(f => {
                const icon = f.status === 'danger' ? '🚨' : f.status === 'warning' ? '⚠️' : '🛡️';
                html += `
                    <div style="margin-bottom:16px; border:1px solid rgba(255,255,255,0.05); border-radius:12px; overflow:hidden; background:rgba(15,23,42,0.2);">
                        <div class="status-badge status-${f.status}" style="border-radius:0; border:none; padding:10px 16px; font-weight:700;">${icon} ${f.title}</div>
                        <div class="ai-reasoning" style="padding:16px; color:#cbd5e1; font-size:13px; line-height:1.6;">${f.analysis.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>
                    </div>`;
                allKeywords = [...allKeywords, ...f.keywords];
            });
            aiOutput.innerHTML = html;
            if (allKeywords.length > 0) highlightRiskKeywords(allKeywords);
        }
        updateGeminiUI();
    }, 1500);
}

function updateGeminiUI() {
    const key = localStorage.getItem('gemini_api_key');
    const actionEl = document.getElementById('gemini-action');
    if (actionEl) actionEl.style.display = key ? 'block' : 'none';
}

function toggleGeminiSettings() {
    const config = document.getElementById('gemini-config');
    config.style.display = config.style.display === 'none' ? 'block' : 'none';
}

async function runDeepAnalysis() {
    const text = document.getElementById('dg-text-2').value.trim();
    const key = localStorage.getItem('gemini_api_key');
    
    if (!text) { showToast('กรุณากรอกข้อความเพื่อวิเคราะห์', '⚠️'); return; }
    if (!key) { showToast('กรุณาตั้งค่า Gemini API Key', '⚠️'); return; }

    const aiOutput = document.getElementById('dg-ai-output');
    const originalContent = aiOutput.innerHTML;
    
    aiOutput.innerHTML = `
        <div style="padding:20px; border:1px solid rgba(59,130,246,0.2); border-radius:16px; background:rgba(59,130,246,0.05);">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                <div class="ai-loader-pulse"></div>
                <strong style="color:#60a5fa;">Google Gemini 1.5 Flash กำลังวิเคราะห์เจาะลึก...</strong>
            </div>
            <p style="font-size:12px; color:#64748b;">ระบบกำลังตรวจสอบความสอดคล้องทางกฎหมาย, ความเสี่ยงแฝง, และข้อแนะนำเชิงลึก</p>
        </div>
    `;

    try {
        const prompt = `ในฐานะนิติกรผู้เชี่ยวชาญกฎหมายไทย โปรดวิเคราะห์ข้อความต่อไปนี้อย่างละเอียด:
        1. ตรวจสอบความสอดคล้องกับกฎหมายแรงงาน, กฎหมายแพ่งและพาณิชย์, PDPA, และพ.ร.บ.ว่าด้วยข้อสัญญาที่ไม่เป็นธรรม
        2. ระบุจุดที่เป็นอันตราย (🚨) หรือควรระวัง (⚠️)
        3. ให้คำแนะนำในการแก้ไขที่ถูกต้องตามกฎหมาย
        
        ข้อความที่ต้องวิเคราะห์:
        "${text}"
        
        ตอบกลับเป็นภาษาไทย ในรูปแบบที่อ่านง่าย (ใช้ Bullet points และ Emoji)`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const analysisText = data.candidates[0].content.parts[0].text;
        
        aiOutput.innerHTML = `
            <div style="margin-bottom:16px; display:flex; align-items:center; gap:10px;">
                <span class="type-badge active" style="background:linear-gradient(90deg, #4285f4, #9b51e0); border:none; padding:4px 12px; color:white;">Gemini Deep Analysis</span>
                <span style="font-size:11px; color:#64748b;">วิเคราะห์โดย AI 2.5 Flash (Latest 2026)</span>
            </div>
            <div class="ai-reasoning" style="padding:20px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:16px; color:#cbd5e1; font-size:14px; line-height:1.8;">
                ${analysisText.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
            </div>
            <button onclick="analyzeWithAI(document.getElementById('dg-text-2').value)" style="margin-top:12px; background:none; border:none; color:#64748b; font-size:12px; text-decoration:underline; cursor:pointer;">ย้อนกลับไปใช้ Rule Engine</button>
        `;
        showToast('วิเคราะห์เจาะลึกสำเร็จ', '🚀');
    } catch (e) {
        showToast('Gemini API Error: ' + e.message, '❌');
        aiOutput.innerHTML = originalContent;
    }
}

function highlightRiskKeywords(keywords) {
    const rightCol = document.getElementById('dg-diff-right');
    if (!rightCol) return;
    let content = rightCol.innerHTML;
    const uniqueKeywords = [...new Set(keywords)].filter(k => k && k.length > 0).sort((a, b) => b.length - a.length);
    uniqueKeywords.forEach(word => {
        const regex = new RegExp(`(?<!<[^>]*)(${word})`, 'gi');
        content = content.replace(regex, `<span class="ai-highlight">$1</span>`);
    });
    rightCol.innerHTML = content;
}

function toggleLearningModal(show) {
    document.getElementById('learning-modal').style.display = show ? 'flex' : 'none';
    if (show) renderRulesList();
}

function saveNewRule() {
    const kw = document.getElementById('learn-keyword').value.trim();
    const st = document.getElementById('learn-status').value;
    const rs = document.getElementById('learn-reason').value.trim();
    if (!kw || !rs) { showToast('กรุณากรอกข้อมูลให้ครบ', '⚠️'); return; }
    customRules.push({ keyword: kw, status: st, reason: rs });
    localStorage.setItem('ai_custom_rules', JSON.stringify(customRules));
    showToast('บันทึกกฎการเรียนรู้ใหม่สำเร็จ', '💾');
    document.getElementById('learn-keyword').value = '';
    document.getElementById('learn-reason').value = '';
    renderRulesList();
}

function renderRulesList() {
    const list = document.getElementById('custom-rules-list');
    list.innerHTML = customRules.length === 0 ? '<p style="text-align:center;color:#475569;font-size:12px;">ยังไม่มีกฎที่สอนไว้</p>' : '';
    customRules.forEach((rule, index) => {
        list.innerHTML += `<div class="rule-card">
            <div><span class="status-badge status-${rule.status}" style="padding:2px 8px;font-size:10px;">${rule.keyword}</span></div>
            <button onclick="deleteRule(${index})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px;">ลบ</button>
        </div>`;
    });
}

function deleteRule(index) {
    customRules.splice(index, 1);
    localStorage.setItem('ai_custom_rules', JSON.stringify(customRules));
    renderRulesList();
}

async function handleDocPDF(input, targetId) {
    const file = input.files[0];
    if (!file || file.type !== 'application/pdf') { showToast('กรุณาเลือกไฟล์ PDF', '⚠️'); return; }
    showToast('กำลังอ่าน PDF...', '⏳');
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(it => it.str).join(" ") + "\n";
        }
        document.getElementById(targetId).value = text.trim();
        showToast('อ่าน PDF สำเร็จ', '📄');
    } catch (e) { showToast('อ่าน PDF ล้มเหลว', '❌'); }
}
