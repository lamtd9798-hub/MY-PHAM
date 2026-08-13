// ==========================================
// 1. TÍNH NĂNG CHUYỂN TAB KHÔNG GIAN LÀM VIỆC
// ==========================================
function switchTab(tabId, element) {
    // Tắt màu xanh ở tất cả các nút menu
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    // Bật màu xanh cho nút vừa bấm
    element.classList.add('active');

    // Ẩn tất cả các khung nội dung
    document.querySelectorAll('.workspace').forEach(ws => {
        ws.classList.remove('active');
    });
    // Hiển thị khung nội dung tương ứng với ID truyền vào
    document.getElementById(tabId).classList.add('active');
}

// ==========================================
// 2. TÍNH NĂNG ĐỌC EXCEL VÀ ĐỐI SOÁT
// ==========================================
document.getElementById('fileUpload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Đổi tên file hiển thị
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

function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = ''; // Xóa dữ liệu cũ

    data.forEach(row => {
        const maDon = row['Mã đơn hàng'] || row['Mã Đơn Hàng'];
        if (!maDon || maDon === 0) return; 

        // Rút gọn tên sản phẩm
        let tenSp = row['Tên sản phẩm'] || 'Sản phẩm Mỹ phẩm';
        if(tenSp.length > 35) tenSp = tenSp.substring(0, 35) + '...';

        const khachTra = parseFloat(row['Tổng số tiền người mua thanh toán']) || 0;
        
        const phiCoDinh = parseFloat(row['Phí Cố Định']) || parseFloat(row['Phí cố định']) || 0;
        const phiDichVu = parseFloat(row['Phí Dịch Vụ']) || parseFloat(row['Phí dịch vụ']) || 0;
        const phiThanhToan = parseFloat(row['Phí thanh toán']) || parseFloat(row['Phí Thanh Toán']) || 0;
        const tongPhiSan = phiCoDinh + phiDichVu + phiThanhToan;

        const thucNhanShopee = parseFloat(row['Số tiền được chuyển cho Người bán']) || parseFloat(row['Doanh thu']) || 0;
        
        const thucNhanCuaShopTinh = khachTra - tongPhiSan;
        const chenhLech = thucNhanShopee - thucNhanCuaShopTinh;
        
        // Xét trạng thái HTML
        let htmlTrangThai = `<span class="status-ok">Khớp</span>`;
        if (Math.abs(chenhLech) > 1000) { 
            htmlTrangThai = `<span class="status-err">Lệch ${chenhLech.toLocaleString('vi-VN')} đ</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${maDon}</strong></td>
            <td>${tenSp}</td>
            <td>${khachTra.toLocaleString('vi-VN')} đ</td>
            <td>${tongPhiSan.toLocaleString('vi-VN')} đ</td>
            <td><strong>${thucNhanShopee.toLocaleString('vi-VN')} đ</strong></td>
            <td>${htmlTrangThai}</td>
        `;
        tbody.appendChild(tr);
    });
}