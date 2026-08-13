document.getElementById('fileUpload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});

        // Giả sử dữ liệu nằm ở Sheet đầu tiên
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Chuyển Excel thành mảng JSON để dễ xử lý
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        console.log("Dữ liệu từ Excel:", jsonData);
        alert("Đã đọc file thành công! Hãy mở Console (F12) để xem dữ liệu thô.");
        
        // Bước tiếp theo chúng ta sẽ viết hàm đổ dữ liệu này ra bảng HTML
    };
    reader.readAsArrayBuffer(file);
});