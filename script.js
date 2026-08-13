// --- 1. HÀM CHUYỂN TAB ---
function switchTab(tabId, element) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    element.classList.add('active');
    
    document.querySelectorAll('.workspace').forEach(ws => ws.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

// --- 2. HÀM ĐỌC EXCEL ---
document.getElementById('fileUpload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('fileName').textContent = "Đang xử lý: " + file.name;

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: 0 });
        
        renderTable(jsonData);
    };
    reader.readAsArrayBuffer(file);
});

// --- 3. HÀM XỬ LÝ VÀ ĐỔ DỮ LIỆU RA BẢNG 10 CỘT ---
function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = ''; 

    const formatMoney = (num) => {
        if (num === 0) return '0';
        return parseFloat(num).toLocaleString('vi-VN');
    };

    data.forEach(row => {
        const maDon = row['Mã đơn hàng'] || row['Mã Đơn Hàng'] || row['Mã đơn'];
        if (!maDon || maDon === 0) return; 

        const doanhThu = parseFloat(row['Tổng số tiền người mua thanh toán']) || parseFloat(row['Doanh thu']) || 0;
        const voucher = parseFloat(row['Voucher từ Shopee']) || parseFloat(row['Voucher']) || 0;
        
        const phiCoDinh = parseFloat(row['Phí Cố Định']) || parseFloat(row['Phí cố định']) || 0;
        const phiDichVu = parseFloat(row['Phí Dịch Vụ']) || parseFloat(row['Phí dịch vụ']) || 0;
        const phiThanhToan = parseFloat(row['Phí thanh toán']) || parseFloat(row['Phí Thanh Toán']) || 0;
        const phiSan = parseFloat(row['Phí sàn']) || (phiCoDinh + phiDichVu + phiThanhToan);
        
        const phiVC = parseFloat(row['Phí vận chuyển mà người mua trả']) || parseFloat(row['Phí vận chuyển']) || 0;
        const hoanHuy = parseFloat(row['Hoàn/Hủy']) || 0; 
        
        const tienPhaiNhan = parseFloat(row['Tiền phải nhận']) || (doanhThu - phiSan - phiVC); 
        const sanDaTra = parseFloat(row['Số tiền được chuyển cho Người bán']) || parseFloat(row['Sàn đã trả']) || 0;
        
        const chenhLech = sanDaTra - tienPhaiNhan;
        
        let htmlChenhLech = `<strong>${formatMoney(chenhLech)}</strong>`;
        if (chenhLech < -1000) { 
            htmlChenhLech = `<span class="status-err">${formatMoney(chenhLech)}</span>`;
        } else if (chenhLech > 1000) {
            htmlChenhLech = `<span class="status-ok">+${formatMoney(chenhLech)}</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${maDon}</strong></td>
            <td>${formatMoney(doanhThu)}</td>
            <td>${formatMoney(voucher)}</td>
            <td>${formatMoney(phiSan)}</td>
            <td>${formatMoney(phiVC)}</td>
            <td>${formatMoney(hoanHuy)}</td>
            <td><strong>${formatMoney(tienPhaiNhan)}</strong></td>
            <td><strong>${formatMoney(sanDaTra)}</strong></td>
            <td>${htmlChenhLech}</td>
            <td><input type="text" class="note-input" placeholder="Ghi chú vào đây..."></td>
        `;
        tbody.appendChild(tr);
    });
}
