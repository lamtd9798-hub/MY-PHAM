/* =========================================================
   RUCOS - HỆ THỐNG ĐỐI SOÁT SHOPEE
   VERSION 1
========================================================= */


/* =========================================================
   STATE
========================================================= */

const state = {

    orders: [],
    finance: [],
    bank: [],

    results: [],
    issues: [],

    files: {
        orders: "",
        finance: "",
        bank: ""
    }

};


/* =========================================================
   CẤU HÌNH
========================================================= */

const CONFIG = {

    // Cho phép chênh lệch nhỏ do làm tròn
    tolerance: 1000

};


/* =========================================================
   PAGE INFO
========================================================= */

const pageInfo = {

    overview: {
        title: "Tổng quan đối soát",
        subtitle: "Theo dõi doanh thu, thanh toán và sai lệch"
    },

    import: {
        title: "Nhập dữ liệu",
        subtitle: "Nhập file từ Shopee và dữ liệu ngân hàng"
    },

    orders: {
        title: "Đơn hàng",
        subtitle: "Kiểm tra toàn bộ đơn phát sinh"
    },

    fees: {
        title: "Phí sàn",
        subtitle: "Phân tích các khoản Shopee đã khấu trừ"
    },

    returns: {
        title: "Hoàn / Hủy",
        subtitle: "Theo dõi đơn hoàn, đơn hủy và tiền bị thu hồi"
    },

    payments: {
        title: "Thanh toán",
        subtitle: "Kiểm tra kỳ thanh toán và tiền thực nhận"
    },

    issues: {
        title: "Sai lệch",
        subtitle: "Danh sách các đơn cần nhân viên kiểm tra"
    },

    nhansu: {
        title: "Nhân sự",
        subtitle: "Quản lý nhân sự hệ thống"
    },

    ai: {
        title: "Tích hợp AI",
        subtitle: "Phân tích dữ liệu và cảnh báo thông minh"
    }

};


/* =========================================================
   NAVIGATION
========================================================= */

document.querySelectorAll(".nav-item").forEach(button => {

    button.addEventListener("click", () => {

        openView(button.dataset.view);

    });

});


document.querySelectorAll("[data-open-view]").forEach(button => {

    button.addEventListener("click", () => {

        openView(button.dataset.openView);

    });

});


function openView(viewName) {

    document.querySelectorAll(".view").forEach(view => {

        view.classList.remove("active");

    });


    const target = document.getElementById("view-" + viewName);

    if (target) {

        target.classList.add("active");

    }


    document.querySelectorAll(".nav-item").forEach(item => {

        item.classList.toggle(
            "active",
            item.dataset.view === viewName
        );

    });


    const info = pageInfo[viewName];

    if (info) {

        document.getElementById("pageTitle").textContent = info.title;

        document.getElementById("pageSubtitle").textContent = info.subtitle;

    }

}


/* =========================================================
   FORMAT
========================================================= */

function formatMoney(value) {

    const number = Number(value) || 0;

    return number.toLocaleString("vi-VN") + " ₫";

}


function formatNumber(value) {

    return (Number(value) || 0).toLocaleString("vi-VN");

}


function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* =========================================================
   CHUẨN HÓA HEADER EXCEL
========================================================= */

function normalizeText(text) {

    return String(text ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9]/g, "");

}


function createNormalizedRow(row) {

    const result = {};

    Object.keys(row).forEach(key => {

        result[normalizeText(key)] = row[key];

    });

    return result;

}


function pick(row, aliases) {

    for (const alias of aliases) {

        const key = normalizeText(alias);

        if (
            Object.prototype.hasOwnProperty.call(row, key) &&
            row[key] !== "" &&
            row[key] !== null &&
            row[key] !== undefined
        ) {

            return row[key];

        }

    }

    return "";

}


/* =========================================================
   MONEY PARSER
========================================================= */

function parseMoney(value) {

    if (value === null || value === undefined || value === "") {
        return 0;
    }

    if (typeof value === "number") {
        return value;
    }


    let text = String(value)
        .trim()
        .replace(/[₫đ₫\s]/gi, "");


    // Ví dụ: (12.000) = -12000
    let negative = false;

    if (text.startsWith("(") && text.endsWith(")")) {

        negative = true;

        text = text.slice(1, -1);

    }


    // Xử lý dấu phân cách tiền Việt Nam
    text = text.replace(/\./g, "").replace(/,/g, "");


    const number = Number(text);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return negative ? -number : number;

}


/* =========================================================
   DATE
========================================================= */

function parseDate(value) {

    if (!value) {
        return "";
    }


    if (value instanceof Date) {

        return value.toISOString().slice(0, 10);

    }


    if (typeof value === "number") {

        const dateInfo = XLSX.SSF.parse_date_code(value);

        if (dateInfo) {

            return [
                dateInfo.y,
                String(dateInfo.m).padStart(2, "0"),
                String(dateInfo.d).padStart(2, "0")
            ].join("-");

        }

    }


    return String(value);

}


/* =========================================================
   STATUS
========================================================= */

function normalizeStatus(value) {

    const text = normalizeText(value);


    if (
        text.includes("giaothanhcong") ||
        text.includes("hoanthanh") ||
        text.includes("completed") ||
        text.includes("delivered")
    ) {

        return "delivered";

    }


    if (
        text.includes("hoantra") ||
        text.includes("trahang") ||
        text.includes("returned") ||
        text.includes("refund")
    ) {

        return "return";

    }


    if (
        text.includes("huy") ||
        text.includes("cancel")
    ) {

        return "cancelled";

    }


    return "other";

}


function statusLabel(status) {

    switch (status) {

        case "delivered":
            return "Giao thành công";

        case "return":
            return "Hoàn / Trả";

        case "cancelled":
            return "Đã hủy";

        default:
            return "Khác";

    }

}


function statusClass(status) {

    switch (status) {

        case "delivered":
            return "status-success";

        case "return":
            return "status-warning";

        case "cancelled":
            return "status-danger";

        default:
            return "status-neutral";

    }

}


/* =========================================================
   ĐỌC EXCEL
========================================================= */

async function readExcelFile(file) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();


        reader.onload = function (event) {

            try {

                const data = new Uint8Array(event.target.result);

                const workbook = XLSX.read(data, {
                    type: "array"
                });


                const firstSheet = workbook.Sheets[
                    workbook.SheetNames[0]
                ];


                const rows = XLSX.utils.sheet_to_json(
                    firstSheet,
                    {
                        defval: "",
                        raw: true
                    }
                );


                resolve(rows);

            }
            catch (error) {

                reject(error);

            }

        };


        reader.onerror = reject;

        reader.readAsArrayBuffer(file);

    });

}


/* =========================================================
   ALIASES
========================================================= */

const aliases = {

    orderId: [
        "Mã đơn hàng",
        "Mã đơn",
        "Order ID",
        "Order Id",
        "Shopee Order ID",
        "Mã đơn hàng Shopee"
    ],

    date: [
        "Ngày đặt hàng",
        "Ngày tạo đơn",
        "Order Creation Date",
        "Ngày"
    ],

    sku: [
        "SKU",
        "SKU sản phẩm",
        "SKU phân loại hàng",
        "Seller SKU",
        "Product SKU"
    ],

    product: [
        "Tên sản phẩm",
        "Sản phẩm",
        "Product Name",
        "Tên hàng"
    ],

    qty: [
        "Số lượng",
        "Quantity",
        "SL"
    ],

    status: [
        "Trạng thái đơn hàng",
        "Trạng thái",
        "Order Status"
    ],

    revenue: [
        "Doanh thu",
        "Tổng tiền sản phẩm",
        "Tổng giá trị sản phẩm",
        "Product Price",
        "Giá trị đơn hàng",
        "Subtotal"
    ],

    sellerVoucher: [
        "Voucher Shop",
        "Mã giảm giá của Shop",
        "Seller Voucher",
        "Shop Voucher",
        "Chiết khấu của Shop"
    ],

    platformVoucher: [
        "Voucher Shopee",
        "Mã giảm giá Shopee",
        "Shopee Voucher",
        "Platform Voucher",
        "Shopee hỗ trợ"
    ],

    commission: [
        "Phí cố định",
        "Phí hoa hồng",
        "Commission Fee",
        "Commission"
    ],

    serviceFee: [
        "Phí dịch vụ",
        "Service Fee"
    ],

    paymentFee: [
        "Phí thanh toán",
        "Transaction Fee",
        "Payment Fee"
    ],

    shippingFee: [
        "Phí vận chuyển",
        "Shipping Fee",
        "Phí vận chuyển người bán chịu",
        "Actual Shipping Fee"
    ],

    affiliate: [
        "Affiliate",
        "Affiliate Commission",
        "Phí tiếp thị liên kết"
    ],

    otherFee: [
        "Phí khác",
        "Other Fee",
        "Other Fees",
        "Khoản điều chỉnh"
    ],

    refund: [
        "Hoàn tiền",
        "Refund",
        "Refund Amount",
        "Tiền hoàn"
    ],

    actual: [
        "Thực nhận",
        "Tiền thực nhận",
        "Sàn đã trả",
        "Tổng tiền thanh toán",
        "Total Payout",
        "Seller Income",
        "Thu nhập"
    ],

    settlementId: [
        "Mã kỳ thanh toán",
        "Settlement ID",
        "Settlement Id",
        "Payout ID",
        "Mã thanh toán"
    ],

    bankAmount: [
        "Số tiền",
        "Amount",
        "Tiền vào",
        "Có"
    ],

    bankContent: [
        "Nội dung",
        "Description",
        "Diễn giải",
        "Transaction Description"
    ]

};


/* =========================================================
   PARSE ORDER FILE
========================================================= */

function parseOrderRows(rows) {

    const orders = [];


    rows.forEach((originalRow, index) => {

        const row = createNormalizedRow(originalRow);


        const orderId = String(
            pick(row, aliases.orderId)
        ).trim();


        if (!orderId) {
            return;
        }


        orders.push({

            rowNumber: index + 2,

            orderId,

            date: parseDate(
                pick(row, aliases.date)
            ),

            sku: String(
                pick(row, aliases.sku)
            ),

            product: String(
                pick(row, aliases.product)
            ),

            qty: Number(
                pick(row, aliases.qty)
            ) || 1,

            status: normalizeStatus(
                pick(row, aliases.status)
            ),

            revenue: Math.abs(
                parseMoney(
                    pick(row, aliases.revenue)
                )
            ),

            sellerVoucher: Math.abs(
                parseMoney(
                    pick(row, aliases.sellerVoucher)
                )
            ),

            platformVoucher: Math.abs(
                parseMoney(
                    pick(row, aliases.platformVoucher)
                )
            )

        });

    });


    return orders;

}


/* =========================================================
   PARSE FINANCE FILE
========================================================= */

function parseFinanceRows(rows) {

    const finance = [];


    rows.forEach((originalRow, index) => {

        const row = createNormalizedRow(originalRow);


        const orderId = String(
            pick(row, aliases.orderId)
        ).trim();


        if (!orderId) {
            return;
        }


        finance.push({

            rowNumber: index + 2,

            orderId,

            revenue: Math.abs(
                parseMoney(
                    pick(row, aliases.revenue)
                )
            ),

            sellerVoucher: Math.abs(
                parseMoney(
                    pick(row, aliases.sellerVoucher)
                )
            ),

            platformVoucher: Math.abs(
                parseMoney(
                    pick(row, aliases.platformVoucher)
                )
            ),

            commission: Math.abs(
                parseMoney(
                    pick(row, aliases.commission)
                )
            ),

            serviceFee: Math.abs(
                parseMoney(
                    pick(row, aliases.serviceFee)
                )
            ),

            paymentFee: Math.abs(
                parseMoney(
                    pick(row, aliases.paymentFee)
                )
            ),

            shippingFee: Math.abs(
                parseMoney(
                    pick(row, aliases.shippingFee)
                )
            ),

            affiliate: Math.abs(
                parseMoney(
                    pick(row, aliases.affiliate)
                )
            ),

            otherFee: Math.abs(
                parseMoney(
                    pick(row, aliases.otherFee)
                )
            ),

            refund: Math.abs(
                parseMoney(
                    pick(row, aliases.refund)
                )
            ),

            actual: parseMoney(
                pick(row, aliases.actual)
            ),

            settlementId: String(
                pick(row, aliases.settlementId)
            ).trim()

        });

    });


    return finance;

}


/* =========================================================
   PARSE BANK FILE
========================================================= */

function parseBankRows(rows) {

    return rows.map((originalRow, index) => {

        const row = createNormalizedRow(originalRow);


        return {

            rowNumber: index + 2,

            amount: parseMoney(
                pick(row, aliases.bankAmount)
            ),

            content: String(
                pick(row, aliases.bankContent)
            )

        };

    }).filter(item => item.amount !== 0);

}


/* =========================================================
   FILE EVENTS
========================================================= */

document.getElementById("orderFile")
    .addEventListener("change", async event => {

        await handleOrderFile(event.target.files[0]);

    });


document.getElementById("financeFile")
    .addEventListener("change", async event => {

        await handleFinanceFile(event.target.files[0]);

    });


document.getElementById("bankFile")
    .addEventListener("change", async event => {

        await handleBankFile(event.target.files[0]);

    });


async function handleOrderFile(file) {

    if (!file) {
        return;
    }

    try {

        showToast("Đang đọc file đơn hàng...");


        const rows = await readExcelFile(file);

        state.orders = parseOrderRows(rows);

        state.files.orders = file.name;


        document.getElementById("orderFileStatus").textContent =
            "✓ " + file.name;


        refreshImportStatus();


        showToast(
            `Đã đọc ${state.orders.length} dòng đơn hàng`
        );

    }
    catch (error) {

        console.error(error);

        alert("Không đọc được file đơn hàng.");

    }

}


async function handleFinanceFile(file) {

    if (!file) {
        return;
    }

    try {

        showToast("Đang đọc báo cáo thu nhập...");


        const rows = await readExcelFile(file);

        state.finance = parseFinanceRows(rows);

        state.files.finance = file.name;


        document.getElementById("financeFileStatus").textContent =
            "✓ " + file.name;


        refreshImportStatus();


        showToast(
            `Đã đọc ${state.finance.length} dòng tài chính`
        );

    }
    catch (error) {

        console.error(error);

        alert("Không đọc được file báo cáo thu nhập.");

    }

}


async function handleBankFile(file) {

    if (!file) {
        return;
    }

    try {

        const rows = await readExcelFile(file);

        state.bank = parseBankRows(rows);

        state.files.bank = file.name;


        document.getElementById("bankFileStatus").textContent =
            "✓ " + file.name;


        refreshImportStatus();


        showToast(
            `Đã đọc ${state.bank.length} giao dịch ngân hàng`
        );

    }
    catch (error) {

        console.error(error);

        alert("Không đọc được file ngân hàng.");

    }

}


/* =========================================================
   IMPORT STATUS
========================================================= */

function refreshImportStatus() {

    document.getElementById("importOrderCount").textContent =
        formatNumber(state.orders.length);


    document.getElementById("importFinanceCount").textContent =
        formatNumber(state.finance.length);


    document.getElementById("importBankCount").textContent =
        formatNumber(state.bank.length);

}


/* =========================================================
   RUN RECONCILIATION
========================================================= */

document.getElementById("btnReconcile")
    .addEventListener("click", () => {

        if (
            state.orders.length === 0 &&
            state.finance.length === 0
        ) {

            alert(
                "Bạn chưa nhập dữ liệu đơn hàng hoặc báo cáo thu nhập."
            );

            return;

        }


        reconcile();

        openView("overview");

        showToast(
            `Đã kiểm tra ${state.results.length} đơn hàng`
        );

    });


function reconcile() {

    const orderMap = buildOrderMap();

    const financeMap = buildFinanceMap();


    const allOrderIds = new Set([
        ...orderMap.keys(),
        ...financeMap.keys()
    ]);


    const results = [];

    const issues = [];


    allOrderIds.forEach(orderId => {

        const order = orderMap.get(orderId);

        const finance = financeMap.get(orderId);


        const revenue =
            order?.revenue ||
            finance?.revenue ||
            0;


        const sellerVoucher =
            finance?.sellerVoucher ||
            order?.sellerVoucher ||
            0;


        const platformVoucher =
            finance?.platformVoucher ||
            order?.platformVoucher ||
            0;


        const commission =
            finance?.commission || 0;


        const serviceFee =
            finance?.serviceFee || 0;


        const paymentFee =
            finance?.paymentFee || 0;


        const shippingFee =
            finance?.shippingFee || 0;


        const affiliate =
            finance?.affiliate || 0;


        const otherFee =
            finance?.otherFee || 0;


        const refund =
            finance?.refund || 0;


        const totalFees =
            commission +
            serviceFee +
            paymentFee +
            shippingFee +
            affiliate +
            otherFee;


        /*
            CÔNG THỨC CHUẨN HÓA:

            PHẢI NHẬN =
              DOANH THU
            - VOUCHER SHOP
            + HỖ TRỢ SÀN
            - PHÍ
            - HOÀN TIỀN
        */

        let expected =
            revenue
            - sellerVoucher
            + platformVoucher
            - totalFees
            - refund;


        if (
            order?.status === "cancelled" &&
            finance?.actual === 0
        ) {

            expected = 0;

        }


        const actual =
            finance?.actual || 0;


        const difference =
            actual - expected;


        const result = {

            orderId,

            date: order?.date || "",

            sku: order?.sku || "",

            product: order?.product || "",

            qty: order?.qty || 0,

            status: order?.status || "other",

            revenue,

            sellerVoucher,

            platformVoucher,

            commission,

            serviceFee,

            paymentFee,

            shippingFee,

            affiliate,

            otherFee,

            refund,

            totalFees,

            expected,

            actual,

            difference,

            settlementId:
                finance?.settlementId || "",

            hasOrder: !!order,

            hasFinance: !!finance

        };


        results.push(result);


        detectIssues(result, issues);

    });


    state.results = results;

    state.issues = issues;


    renderAll();

}


/* =========================================================
   GROUP ORDER
========================================================= */

function buildOrderMap() {

    const map = new Map();


    state.orders.forEach(order => {

        if (!map.has(order.orderId)) {

            map.set(
                order.orderId,
                {
                    ...order
                }
            );

        }
        else {

            const current = map.get(order.orderId);

            current.revenue += order.revenue;

            current.qty += order.qty;


            if (!current.product.includes(order.product)) {

                current.product +=
                    (current.product ? " | " : "")
                    + order.product;

            }


            if (!current.sku.includes(order.sku)) {

                current.sku +=
                    (current.sku ? " | " : "")
                    + order.sku;

            }

        }

    });


    return map;

}


/* =========================================================
   GROUP FINANCE
========================================================= */

function buildFinanceMap() {

    const map = new Map();


    state.finance.forEach(item => {

        if (!map.has(item.orderId)) {

            map.set(
                item.orderId,
                {
                    ...item
                }
            );

        }
        else {

            const current = map.get(item.orderId);


            current.revenue += item.revenue;

            current.sellerVoucher += item.sellerVoucher;

            current.platformVoucher += item.platformVoucher;

            current.commission += item.commission;

            current.serviceFee += item.serviceFee;

            current.paymentFee += item.paymentFee;

            current.shippingFee += item.shippingFee;

            current.affiliate += item.affiliate;

            current.otherFee += item.otherFee;

            current.refund += item.refund;

            current.actual += item.actual;


            if (
                !current.settlementId &&
                item.settlementId
            ) {

                current.settlementId =
                    item.settlementId;

            }

        }

    });


    return map;

}


/* =========================================================
   ISSUE DETECTION
========================================================= */

function detectIssues(result, issues) {

    if (!result.hasOrder) {

        issues.push({

            severity: "high",

            type: "missing_order",

            orderId: result.orderId,

            message:
                "Có dữ liệu tài chính nhưng không tìm thấy đơn hàng.",

            result

        });

    }


    if (!result.hasFinance) {

        issues.push({

            severity: "high",

            type: "missing_finance",

            orderId: result.orderId,

            message:
                "Có đơn hàng nhưng chưa tìm thấy dữ liệu thanh toán của sàn.",

            result

        });

    }


    if (
        result.hasFinance &&
        Math.abs(result.difference) > CONFIG.tolerance
    ) {

        issues.push({

            severity:
                Math.abs(result.difference) >= 50000
                    ? "high"
                    : "medium",

            type: "difference",

            orderId: result.orderId,

            message:
                `Chênh lệch ${formatMoney(result.difference)} giữa số phải nhận và số sàn thanh toán.`,

            result

        });

    }


    if (
        result.status === "delivered" &&
        result.expected > 0 &&
        result.actual === 0 &&
        result.hasFinance
    ) {

        issues.push({

            severity: "high",

            type: "unpaid",

            orderId: result.orderId,

            message:
                "Đơn giao thành công nhưng chưa ghi nhận tiền thanh toán.",

            result

        });

    }


    if (
        result.status === "return" ||
        result.status === "cancelled"
    ) {

        issues.push({

            severity: "low",

            type: "return",

            orderId: result.orderId,

            message:
                result.status === "return"
                    ? "Đơn hoàn/trả cần kiểm tra hàng đã quay lại kho."
                    : "Đơn đã hủy cần kiểm tra phí phát sinh.",

            result

        });

    }

}


/* =========================================================
   RENDER ALL
========================================================= */

function renderAll() {

    renderDashboard();

    renderOrders();

    renderFees();

    renderReturns();

    renderPayments();

    renderIssues();

    refreshNavigation();

}


/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {

    const data = state.results;


    const totalOrders = data.length;


    const revenue = sum(
        data.map(x => x.revenue)
    );


    const expected = sum(
        data.map(x => x.expected)
    );


    const actual = sum(
        data.map(x => x.actual)
    );


    const difference = actual - expected;


    const totalFees = sum(
        data.map(x => x.totalFees)
    );


    const delivered = data.filter(
        x => x.status === "delivered"
    ).length;


    const returns = data.filter(
        x =>
            x.status === "return" ||
            x.status === "cancelled"
    ).length;


    document.getElementById("kpiOrders").textContent =
        formatNumber(totalOrders);


    document.getElementById("kpiRevenue").textContent =
        formatMoney(revenue);


    document.getElementById("kpiExpected").textContent =
        formatMoney(expected);


    document.getElementById("kpiActual").textContent =
        formatMoney(actual);


    const differenceElement =
        document.getElementById("kpiDifference");


    differenceElement.textContent =
        formatMoney(difference);


    differenceElement.className =
        "kpi-value money " +
        (
            Math.abs(difference) <= CONFIG.tolerance
                ? "money-positive"
                : "money-negative"
        );


    document.getElementById("kpiDifferenceText").textContent =
        Math.abs(difference) <= CONFIG.tolerance
            ? "Dữ liệu đang khớp"
            : "Có chênh lệch cần kiểm tra";


    document.getElementById("kpiIssues").textContent =
        formatNumber(state.issues.length);


    document.getElementById("processOrders").textContent =
        `${formatNumber(totalOrders)} đơn`;


    document.getElementById("processDelivered").textContent =
        `${formatNumber(delivered)} đơn`;


    document.getElementById("processReturns").textContent =
        `${formatNumber(returns)} đơn`;


    document.getElementById("processFees").textContent =
        formatMoney(totalFees);


    document.getElementById("processPayment").textContent =
        formatMoney(actual);


    document.getElementById("processIssues").textContent =
        `${formatNumber(state.issues.length)} lỗi`;


    renderDashboardIssueSummary();

    renderDashboardFeeSummary();

    renderDashboardIssueTable();

}


/* =========================================================
   ISSUE SUMMARY
========================================================= */

function renderDashboardIssueSummary() {

    const container =
        document.getElementById("issueSummary");


    if (!state.issues.length) {

        container.innerHTML = `
            <div class="empty-box">
                Không phát hiện sai lệch.
            </div>
        `;

        return;

    }


    const counters = {

        difference: 0,
        missing_finance: 0,
        missing_order: 0,
        unpaid: 0,
        return: 0

    };


    state.issues.forEach(issue => {

        counters[issue.type] =
            (counters[issue.type] || 0) + 1;

    });


    container.innerHTML = `

        <div class="issue-line">
            <div class="issue-dot red"></div>

            <span>Đơn chênh lệch tiền</span>

            <strong>
                ${counters.difference}
            </strong>
        </div>

        <div class="issue-line">
            <div class="issue-dot orange"></div>

            <span>Thiếu dữ liệu thanh toán</span>

            <strong>
                ${counters.missing_finance}
            </strong>
        </div>

        <div class="issue-line">
            <div class="issue-dot blue"></div>

            <span>Đơn chưa thanh toán</span>

            <strong>
                ${counters.unpaid}
            </strong>
        </div>

        <div class="issue-line">
            <div class="issue-dot orange"></div>

            <span>Đơn hoàn / hủy cần kiểm tra</span>

            <strong>
                ${counters.return}
            </strong>
        </div>

    `;

}


/* =========================================================
   FEE SUMMARY
========================================================= */

function renderDashboardFeeSummary() {

    const container =
        document.getElementById("feeSummary");


    if (!state.results.length) {

        container.innerHTML = `
            <div class="empty-box">
                Chưa có dữ liệu phí.
            </div>
        `;

        return;

    }


    const commission =
        sum(state.results.map(x => x.commission));


    const service =
        sum(state.results.map(x => x.serviceFee));


    const payment =
        sum(state.results.map(x => x.paymentFee));


    const shipping =
        sum(state.results.map(x => x.shippingFee));


    const affiliate =
        sum(state.results.map(x => x.affiliate));


    const total =
        sum(state.results.map(x => x.totalFees));


    container.innerHTML = `

        ${feeLine("Phí hoa hồng / cố định", commission)}

        ${feeLine("Phí dịch vụ", service)}

        ${feeLine("Phí thanh toán", payment)}

        ${feeLine("Phí vận chuyển", shipping)}

        ${feeLine("Affiliate", affiliate)}

        <div class="fee-line total">
            <span>Tổng phí</span>
            <strong>${formatMoney(total)}</strong>
        </div>

    `;

}


function feeLine(name, amount) {

    return `

        <div class="fee-line">

            <span>${name}</span>

            <strong>
                ${formatMoney(amount)}
            </strong>

        </div>

    `;

}


/* =========================================================
   DASHBOARD ISSUE TABLE
========================================================= */

function renderDashboardIssueTable() {

    const body =
        document.getElementById("dashboardIssueBody");


    const issues =
        state.issues
            .filter(x => x.type === "difference")
            .slice(0, 8);


    if (!issues.length) {

        body.innerHTML = `

            <tr>
                <td colspan="7"
                    class="empty-table">

                    Không có đơn chênh lệch.

                </td>
            </tr>

        `;

        return;

    }


    body.innerHTML =
        issues.map(issue => {

            const r = issue.result;

            return `

                <tr>

                    <td>
                        <strong>
                            ${escapeHTML(r.orderId)}
                        </strong>
                    </td>

                    <td>
                        ${renderStatus(r.status)}
                    </td>

                    <td>
                        ${formatMoney(r.revenue)}
                    </td>

                    <td>
                        ${formatMoney(r.expected)}
                    </td>

                    <td>
                        ${formatMoney(r.actual)}
                    </td>

                    <td class="money-negative">
                        ${formatMoney(r.difference)}
                    </td>

                    <td>
                        ${escapeHTML(issue.message)}
                    </td>

                </tr>

            `;

        }).join("");

}


/* =========================================================
   ORDERS
========================================================= */

function renderOrders() {

    let data = [...state.results];


    const search =
        normalizeText(
            document.getElementById("orderSearch")?.value
        );


    const status =
        document.getElementById("orderStatusFilter")?.value;


    if (search) {

        data = data.filter(item => {

            const text = normalizeText(
                item.orderId +
                " " +
                item.sku +
                " " +
                item.product
            );

            return text.includes(search);

        });

    }


    if (status) {

        data = data.filter(
            item => item.status === status
        );

    }


    document.getElementById("orderTableSummary").textContent =
        `${formatNumber(data.length)} đơn`;


    const body =
        document.getElementById("orderTableBody");


    if (!data.length) {

        body.innerHTML = `

            <tr>

                <td colspan="10"
                    class="empty-table">

                    Chưa có dữ liệu đơn hàng

                </td>

            </tr>

        `;

        return;

    }


    body.innerHTML =
        data.map(item => `

            <tr>

                <td>
                    <strong>
                        ${escapeHTML(item.orderId)}
                    </strong>
                </td>

                <td>
                    ${escapeHTML(item.date)}
                </td>

                <td>
                    ${escapeHTML(item.sku)}
                </td>

                <td title="${escapeHTML(item.product)}">
                    ${escapeHTML(truncate(item.product, 35))}
                </td>

                <td>
                    ${item.qty}
                </td>

                <td>
                    ${renderStatus(item.status)}
                </td>

                <td>
                    ${formatMoney(item.revenue)}
                </td>

                <td>
                    ${formatMoney(item.expected)}
                </td>

                <td>
                    ${formatMoney(item.actual)}
                </td>

                <td class="${
                    Math.abs(item.difference) <= CONFIG.tolerance
                        ? "money-positive"
                        : "money-negative"
                }">

                    ${formatMoney(item.difference)}

                </td>

            </tr>

        `).join("");

}


/* =========================================================
   FEES
========================================================= */

function renderFees() {

    const commission =
        sum(state.results.map(x => x.commission));


    const service =
        sum(state.results.map(x => x.serviceFee));


    const payment =
        sum(state.results.map(x => x.paymentFee));


    const shipping =
        sum(state.results.map(x => x.shippingFee));


    const affiliate =
        sum(state.results.map(x => x.affiliate));


    const total =
        sum(state.results.map(x => x.totalFees));


    document.getElementById("feeCommission").textContent =
        formatMoney(commission);


    document.getElementById("feeService").textContent =
        formatMoney(service);


    document.getElementById("feePayment").textContent =
        formatMoney(payment);


    document.getElementById("feeShipping").textContent =
        formatMoney(shipping);


    document.getElementById("feeAffiliate").textContent =
        formatMoney(affiliate);


    document.getElementById("feeTotal").textContent =
        formatMoney(total);


    const body =
        document.getElementById("feeTableBody");


    if (!state.results.length) {

        body.innerHTML = `

            <tr>

                <td colspan="8"
                    class="empty-table">

                    Chưa có dữ liệu

                </td>

            </tr>

        `;

        return;

    }


    body.innerHTML =
        state.results.map(item => `

            <tr>

                <td>
                    <strong>
                        ${escapeHTML(item.orderId)}
                    </strong>
                </td>

                <td>
                    ${formatMoney(item.commission)}
                </td>

                <td>
                    ${formatMoney(item.serviceFee)}
                </td>

                <td>
                    ${formatMoney(item.paymentFee)}
                </td>

                <td>
                    ${formatMoney(item.shippingFee)}
                </td>

                <td>
                    ${formatMoney(item.affiliate)}
                </td>

                <td>
                    ${formatMoney(item.otherFee)}
                </td>

                <td>
                    <strong>
                        ${formatMoney(item.totalFees)}
                    </strong>
                </td>

            </tr>

        `).join("");

}


/* =========================================================
   RETURNS
========================================================= */

function renderReturns() {

    const data =
        state.results.filter(
            item =>
                item.status === "return" ||
                item.status === "cancelled"
        );


    const body =
        document.getElementById("returnTableBody");


    if (!data.length) {

        body.innerHTML = `

            <tr>

                <td colspan="8"
                    class="empty-table">

                    Không có đơn hoàn / hủy

                </td>

            </tr>

        `;

        return;

    }


    body.innerHTML =
        data.map(item => `

            <tr>

                <td>
                    <strong>
                        ${escapeHTML(item.orderId)}
                    </strong>
                </td>

                <td>
                    ${escapeHTML(truncate(item.product, 30))}
                </td>

                <td>
                    ${escapeHTML(item.sku)}
                </td>

                <td>
                    ${renderStatus(item.status)}
                </td>

                <td>
                    ${formatMoney(item.revenue)}
                </td>

                <td>
                    ${formatMoney(item.refund)}
                </td>

                <td>
                    <span class="status status-warning">
                        Chưa kiểm
                    </span>
                </td>

                <td>
                    Kiểm tra hàng hoàn thực tế
                </td>

            </tr>

        `).join("");

}


/* =========================================================
   PAYMENTS
========================================================= */

function renderPayments() {

    const groups = new Map();


    state.results.forEach(item => {

        const key =
            item.settlementId ||
            "CHUA_CO_MA_KY";


        if (!groups.has(key)) {

            groups.set(key, {

                settlementId: key,

                count: 0,

                expected: 0,

                actual: 0

            });

        }


        const group = groups.get(key);

        group.count++;

        group.expected += item.expected;

        group.actual += item.actual;

    });


    const body =
        document.getElementById("paymentTableBody");


    if (!groups.size) {

        body.innerHTML = `

            <tr>

                <td colspan="7"
                    class="empty-table">

                    Chưa có dữ liệu thanh toán

                </td>

            </tr>

        `;

        return;

    }


    body.innerHTML =
        [...groups.values()].map(group => {

            const difference =
                group.actual -
                group.expected;


            const bankMatch =
                findBankMatch(
                    group.settlementId,
                    group.actual
                );


            return `

                <tr>

                    <td>
                        ${
                            group.settlementId === "CHUA_CO_MA_KY"
                                ? "Chưa xác định"
                                : escapeHTML(group.settlementId)
                        }
                    </td>

                    <td>
                        ${group.count}
                    </td>

                    <td>
                        ${formatMoney(group.expected)}
                    </td>

                    <td>
                        ${formatMoney(group.actual)}
                    </td>

                    <td class="${
                        Math.abs(difference) <= CONFIG.tolerance
                            ? "money-positive"
                            : "money-negative"
                    }">

                        ${formatMoney(difference)}

                    </td>

                    <td>

                        ${
                            bankMatch
                                ? `<span class="status status-success">
                                       Đã tìm thấy
                                   </span>`
                                : `<span class="status status-neutral">
                                       Chưa đối chiếu
                                   </span>`
                        }

                    </td>

                    <td>

                        ${
                            Math.abs(difference) <= CONFIG.tolerance
                                ? `<span class="status status-success">
                                       Khớp
                                   </span>`
                                : `<span class="status status-danger">
                                       Chênh lệch
                                   </span>`
                        }

                    </td>

                </tr>

            `;

        }).join("");

}


/* =========================================================
   BANK MATCH
========================================================= */

function findBankMatch(settlementId, amount) {

    if (!state.bank.length) {
        return null;
    }


    const cleanId =
        normalizeText(settlementId);


    let match =
        state.bank.find(item => {

            if (!cleanId) {
                return false;
            }

            return normalizeText(
                item.content
            ).includes(cleanId);

        });


    if (match) {
        return match;
    }


    match =
        state.bank.find(
            item =>
                Math.abs(
                    Math.abs(item.amount) -
                    Math.abs(amount)
                ) <= CONFIG.tolerance
        );


    return match || null;

}


/* =========================================================
   ISSUES
========================================================= */

function renderIssues() {

    let data = [...state.issues];


    const search =
        normalizeText(
            document.getElementById("issueSearch")?.value
        );


    const type =
        document.getElementById("issueTypeFilter")?.value;


    if (search) {

        data = data.filter(issue =>
            normalizeText(
                issue.orderId
            ).includes(search)
        );

    }


    if (type) {

        data = data.filter(
            issue => issue.type === type
        );

    }


    document.getElementById("issueTableSummary").textContent =
        `${formatNumber(data.length)} vấn đề`;


    const body =
        document.getElementById("issueTableBody");


    if (!data.length) {

        body.innerHTML = `

            <tr>

                <td colspan="8"
                    class="empty-table">

                    Chưa phát hiện sai lệch

                </td>

            </tr>

        `;

        return;

    }


    body.innerHTML =
        data.map(issue => {

            const r = issue.result;


            return `

                <tr>

                    <td>
                        ${renderSeverity(issue.severity)}
                    </td>

                    <td>
                        <strong>
                            ${escapeHTML(issue.orderId)}
                        </strong>
                    </td>

                    <td>
                        ${renderStatus(r.status)}
                    </td>

                    <td>
                        ${formatMoney(r.expected)}
                    </td>

                    <td>
                        ${formatMoney(r.actual)}
                    </td>

                    <td class="${
                        Math.abs(r.difference) <= CONFIG.tolerance
                            ? ""
                            : "money-negative"
                    }">

                        ${formatMoney(r.difference)}

                    </td>

                    <td>
                        ${issueTypeLabel(issue.type)}
                    </td>

                    <td>
                        ${escapeHTML(issue.message)}
                    </td>

                </tr>

            `;

        }).join("");

}


/* =========================================================
   NAV COUNTS
========================================================= */

function refreshNavigation() {

    document.getElementById("navOrderCount").textContent =
        state.results.length;


    document.getElementById("navIssueCount").textContent =
        state.issues.length;


    document.getElementById("navReturnCount").textContent =
        state.results.filter(
            x =>
                x.status === "return" ||
                x.status === "cancelled"
        ).length;

}


/* =========================================================
   FILTER EVENTS
========================================================= */

document.getElementById("orderSearch")
    .addEventListener("input", renderOrders);


document.getElementById("orderStatusFilter")
    .addEventListener("change", renderOrders);


document.getElementById("issueSearch")
    .addEventListener("input", renderIssues);


document.getElementById("issueTypeFilter")
    .addEventListener("change", renderIssues);


/* =========================================================
   EXPORT ISSUES
========================================================= */

document.getElementById("btnExportIssues")
    .addEventListener("click", () => {

        if (!state.issues.length) {

            alert("Không có dữ liệu sai lệch để xuất.");

            return;

        }


        const data =
            state.issues.map(issue => {

                const r = issue.result;

                return {

                    "Mức độ":
                        severityLabel(issue.severity),

                    "Mã đơn":
                        issue.orderId,

                    "Trạng thái":
                        statusLabel(r.status),

                    "Doanh thu":
                        r.revenue,

                    "Phải nhận":
                        r.expected,

                    "Sàn đã trả":
                        r.actual,

                    "Chênh lệch":
                        r.difference,

                    "Loại lỗi":
                        issueTypeLabel(issue.type),

                    "Nội dung":
                        issue.message

                };

            });


        const worksheet =
            XLSX.utils.json_to_sheet(data);


        const workbook =
            XLSX.utils.book_new();


        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "SAI LECH"
        );


        XLSX.writeFile(
            workbook,
            "DOI_SOAT_SAI_LECH.xlsx"
        );

    });


/* =========================================================
   DEMO DATA
========================================================= */

document.getElementById("btnDemo")
    .addEventListener("click", () => {

        loadDemoData();

    });


function loadDemoData() {

    state.orders = [

        {
            orderId: "SP26080001",
            date: "2026-08-01",
            sku: "SERUM-A30",
            product: "Serum Vitamin C 30ml",
            qty: 2,
            status: "delivered",
            revenue: 600000,
            sellerVoucher: 30000,
            platformVoucher: 20000
        },

        {
            orderId: "SP26080002",
            date: "2026-08-02",
            sku: "KEM-B50",
            product: "Kem dưỡng phục hồi 50ml",
            qty: 1,
            status: "delivered",
            revenue: 450000,
            sellerVoucher: 20000,
            platformVoucher: 0
        },

        {
            orderId: "SP26080003",
            date: "2026-08-03",
            sku: "SRM-C100",
            product: "Sữa rửa mặt 100ml",
            qty: 1,
            status: "return",
            revenue: 280000,
            sellerVoucher: 0,
            platformVoucher: 0
        },

        {
            orderId: "SP26080004",
            date: "2026-08-04",
            sku: "TONER-D150",
            product: "Toner cấp ẩm 150ml",
            qty: 1,
            status: "delivered",
            revenue: 320000,
            sellerVoucher: 10000,
            platformVoucher: 15000
        },

        {
            orderId: "SP26080005",
            date: "2026-08-05",
            sku: "MASK-E",
            product: "Mặt nạ dưỡng da",
            qty: 5,
            status: "delivered",
            revenue: 250000,
            sellerVoucher: 0,
            platformVoucher: 0
        }

    ];


    state.finance = [

        {
            orderId: "SP26080001",
            revenue: 600000,
            sellerVoucher: 30000,
            platformVoucher: 20000,
            commission: 60000,
            serviceFee: 12000,
            paymentFee: 15000,
            shippingFee: 10000,
            affiliate: 30000,
            otherFee: 0,
            refund: 0,
            actual: 463000,
            settlementId: "STL-0801"
        },

        {
            orderId: "SP26080002",
            revenue: 450000,
            sellerVoucher: 20000,
            platformVoucher: 0,
            commission: 45000,
            serviceFee: 9000,
            paymentFee: 11000,
            shippingFee: 10000,
            affiliate: 0,
            otherFee: 0,
            refund: 0,
            actual: 355000,
            settlementId: "STL-0801"
        },

        {
            orderId: "SP26080003",
            revenue: 280000,
            sellerVoucher: 0,
            platformVoucher: 0,
            commission: 0,
            serviceFee: 0,
            paymentFee: 0,
            shippingFee: 25000,
            affiliate: 0,
            otherFee: 0,
            refund: 280000,
            actual: -25000,
            settlementId: "STL-0802"
        },

        {
            orderId: "SP26080004",
            revenue: 320000,
            sellerVoucher: 10000,
            platformVoucher: 15000,
            commission: 32000,
            serviceFee: 7000,
            paymentFee: 8000,
            shippingFee: 10000,
            affiliate: 20000,
            otherFee: 0,
            refund: 0,

            // cố ý sai để demo
            actual: 220000,

            settlementId: "STL-0802"
        }

        // Đơn 005 cố tình không có finance
        // để hệ thống báo thiếu thanh toán

    ];


    state.bank = [

        {
            amount: 818000,
            content: "SHOPEE STL-0801"
        }

    ];


    document.getElementById("orderFileStatus").textContent =
        "✓ Dữ liệu mẫu";


    document.getElementById("financeFileStatus").textContent =
        "✓ Dữ liệu mẫu";


    document.getElementById("bankFileStatus").textContent =
        "✓ Dữ liệu mẫu";


    refreshImportStatus();


    reconcile();


    openView("overview");


    showToast(
        "Đã nạp dữ liệu mẫu để kiểm tra giao diện."
    );

}


/* =========================================================
   RESET
========================================================= */

document.getElementById("btnReset")
    .addEventListener("click", () => {

        const ok =
            confirm(
                "Bạn có chắc muốn xóa toàn bộ dữ liệu đang nhập?"
            );


        if (!ok) {
            return;
        }


        state.orders = [];
        state.finance = [];
        state.bank = [];
        state.results = [];
        state.issues = [];


        state.files = {
            orders: "",
            finance: "",
            bank: ""
        };


        document.getElementById("orderFile").value = "";
        document.getElementById("financeFile").value = "";
        document.getElementById("bankFile").value = "";


        document.getElementById("orderFileStatus").textContent =
            "Chưa có file";


        document.getElementById("financeFileStatus").textContent =
            "Chưa có file";


        document.getElementById("bankFileStatus").textContent =
            "Chưa có file";


        refreshImportStatus();

        renderAll();


        showToast("Đã xóa dữ liệu.");

    });


/* =========================================================
   UTILITIES
========================================================= */

function sum(values) {

    return values.reduce(
        (total, value) =>
            total + (Number(value) || 0),
        0
    );

}


function truncate(text, length) {

    const value =
        String(text || "");


    if (value.length <= length) {

        return value;

    }


    return value.slice(0, length) + "...";

}


function renderStatus(status) {

    return `

        <span class="status ${statusClass(status)}">

            ${statusLabel(status)}

        </span>

    `;

}


function renderSeverity(severity) {

    if (severity === "high") {

        return `
            <span class="status status-danger">
                Cao
            </span>
        `;

    }


    if (severity === "medium") {

        return `
            <span class="status status-warning">
                Trung bình
            </span>
        `;

    }


    return `
        <span class="status status-neutral">
            Theo dõi
        </span>
    `;

}


function severityLabel(severity) {

    if (severity === "high") {
        return "Cao";
    }

    if (severity === "medium") {
        return "Trung bình";
    }

    return "Theo dõi";

}


function issueTypeLabel(type) {

    const labels = {

        difference:
            "Chênh lệch tiền",

        missing_finance:
            "Thiếu dữ liệu sàn",

        missing_order:
            "Không tìm thấy đơn",

        unpaid:
            "Chưa thanh toán",

        return:
            "Hoàn / Hủy"

    };


    return labels[type] || type;

}


/* =========================================================
   TOAST
========================================================= */

let toastTimer;


function showToast(message) {

    const toast =
        document.getElementById("toast");


    toast.textContent = message;

    toast.classList.add("show");


    clearTimeout(toastTimer);


    toastTimer = setTimeout(() => {

        toast.classList.remove("show");

    }, 2600);

}


/* =========================================================
   INITIAL
========================================================= */

refreshImportStatus();

renderAll();

openView("overview");
