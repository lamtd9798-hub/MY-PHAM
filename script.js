/* =========================================================
   RUCOS - ĐỐI SOÁT SHOPEE + THỐNG KÊ / QUY ĐỔI SKU
   VERSION 3
========================================================= */

const state = {
    orders: [],
    finance: [],
    bank: [],
    results: [],
    issues: [],

    rawOrderRows: [],
    skuRows: [],
    skuStats: [],
    selectedSkuStatuses: new Set(),
    statusFilterInitialized: false,
    skuCountMode: "rows",

    baseSkus: [],
    conversionRules: {},

    files: { orders: "", finance: "", bank: "" }
};

const CONFIG = { tolerance: 1000 };

/* =========================================================
   QUY ĐỔI MẪU - THEO BẢNG BẠN GỬI
========================================================= */

const DEFAULT_BASE_SKUS = [
    "RTB",
    "REWD",
    "ROE",
    "OBM-100326-2",
    "REWGS",
    "RKN",
    "REWS",
    "RCS"
];

const DEFAULT_CONVERSION_RULES = {
    "RTB":       { "RTB": 1, "REWD": 1 },
    "2REWD":     { "REWD": 3 },
    "2RCS":      { "RCS": 3 },
    "ROE":       { "ROE": 1 },
    "CROE":      { "ROE": 1, "OBM-100326-2": 1 },
    "REWGS":     { "REWGS": 1 },
    "RKN":       { "RKN": 1 },
    "REWS":      { "REWS": 1 },
    "REWD":      { "REWD": 1 },
    "RCS":       { "RCS": 1 }
};

const STORAGE_BASE_SKUS = "rucos_base_skus_v1";
const STORAGE_CONVERSION_RULES = "rucos_conversion_rules_v1";

const pageInfo = {
    overview: { title: "Tổng quan đối soát", subtitle: "Theo dõi doanh thu, thanh toán và sai lệch" },
    import: { title: "Nhập dữ liệu", subtitle: "Nhập file Shopee và dữ liệu phục vụ đối soát" },
    "sku-stats": { title: "Thống kê & quy đổi SKU", subtitle: "Đếm SKU cột T và quy đổi combo / quà tặng thành số lượng kho" },
    orders: { title: "Đơn hàng", subtitle: "Kiểm tra toàn bộ đơn phát sinh" },
    fees: { title: "Phí sàn", subtitle: "Phân tích các khoản Shopee đã khấu trừ" },
    returns: { title: "Hoàn / Hủy", subtitle: "Theo dõi đơn hoàn, đơn hủy và tiền bị thu hồi" },
    payments: { title: "Thanh toán", subtitle: "Kiểm tra kỳ thanh toán và tiền thực nhận" },
    issues: { title: "Sai lệch", subtitle: "Danh sách các đơn cần nhân viên kiểm tra" },
    nhansu: { title: "Nhân sự", subtitle: "Quản lý nhân sự hệ thống" },
    ai: { title: "Tích hợp AI", subtitle: "Phân tích dữ liệu và cảnh báo thông minh" }
};

document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => openView(button.dataset.view));
});

document.querySelectorAll("[data-open-view]").forEach(button => {
    button.addEventListener("click", () => openView(button.dataset.openView));
});

function openView(viewName) {
    document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));

    const target = document.getElementById("view-" + viewName);
    if (target) target.classList.add("active");

    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.toggle("active", item.dataset.view === viewName);
    });

    const info = pageInfo[viewName];

    if (info) {
        document.getElementById("pageTitle").textContent = info.title;
        document.getElementById("pageSubtitle").textContent = info.subtitle;
    }
}

function formatMoney(value) {
    return (Number(value) || 0).toLocaleString("vi-VN") + " ₫";
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

function parseMoney(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return value;

    let text = String(value).trim().replace(/[₫đ\s]/gi, "");
    let negative = false;

    if (text.startsWith("(") && text.endsWith(")")) {
        negative = true;
        text = text.slice(1, -1);
    }

    const dotCount = (text.match(/\./g) || []).length;
    const commaCount = (text.match(/,/g) || []).length;

    if (dotCount > 0 && commaCount > 0) {
        const lastDot = text.lastIndexOf(".");
        const lastComma = text.lastIndexOf(",");
        const decimalSep = lastDot > lastComma ? "." : ",";
        const thousandSep = decimalSep === "." ? "," : ".";

        text = text.split(thousandSep).join("");

        if (decimalSep === ",") {
            text = text.replace(",", ".");
        }

    } else if (dotCount > 1) {
        text = text.replace(/\./g, "");

    } else if (commaCount > 1) {
        text = text.replace(/,/g, "");

    } else if (dotCount === 1) {
        const decimals = text.length - text.lastIndexOf(".") - 1;

        if (decimals === 3) {
            text = text.replace(".", "");
        }

    } else if (commaCount === 1) {
        const decimals = text.length - text.lastIndexOf(",") - 1;

        if (decimals === 3) {
            text = text.replace(",", "");
        } else {
            text = text.replace(",", ".");
        }
    }

    const number = Number(text);

    if (!Number.isFinite(number)) return 0;

    return negative ? -number : number;
}

function parseDate(value) {
    if (!value) return "";

    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }

    if (typeof value === "number" && typeof XLSX !== "undefined") {
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

function sum(values) {
    return values.reduce(
        (total, value) => total + (Number(value) || 0),
        0
    );
}

function truncate(text, length) {
    const value = String(text || "");

    return value.length <= length
        ? value
        : value.slice(0, length) + "...";
}

function normalizeStatus(value) {
    const text = normalizeText(value);

    if (
        text.includes("giaothanhcong") ||
        text.includes("hoanthanh") ||
        text.includes("completed") ||
        text.includes("delivered") ||
        text === "dagiao" ||
        text.startsWith("nguoimuaxacnhandanhanduochang")
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
    if (status === "delivered") return "Giao thành công";
    if (status === "return") return "Hoàn / Trả";
    if (status === "cancelled") return "Đã hủy";

    return "Khác";
}

function statusClass(status) {
    if (status === "delivered") return "status-success";
    if (status === "return") return "status-warning";
    if (status === "cancelled") return "status-danger";

    return "status-neutral";
}

function renderStatus(status) {
    return `
        <span class="status ${statusClass(status)}">
            ${statusLabel(status)}
        </span>
    `;
}

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
        "SKU sản phẩm",
        "SKU",
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
        "Trạng Thái Đơn Hàng",
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

async function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = event => {
            try {
                const data = new Uint8Array(event.target.result);

                const workbook = XLSX.read(data, {
                    type: "array"
                });

                const firstSheet =
                    workbook.Sheets[
                        workbook.SheetNames[0]
                    ];

                const rows =
                    XLSX.utils.sheet_to_json(
                        firstSheet,
                        {
                            defval: "",
                            raw: true
                        }
                    );

                resolve(rows);

            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function parseOrderRows(rows) {
    const orders = [];

    rows.forEach((originalRow, index) => {
        const row = createNormalizedRow(originalRow);

        const orderId =
            String(
                pick(row, aliases.orderId)
            ).trim();

        if (!orderId) return;

        orders.push({
            rowNumber: index + 2,
            orderId,

            date:
                parseDate(
                    pick(row, aliases.date)
                ),

            sku:
                String(
                    pick(row, aliases.sku)
                ).trim(),

            product:
                String(
                    pick(row, aliases.product)
                ).trim(),

            qty:
                Number(
                    pick(row, aliases.qty)
                ) || 1,

            status:
                normalizeStatus(
                    pick(row, aliases.status)
                ),

            rawStatus:
                String(
                    pick(row, aliases.status)
                ).trim(),

            revenue:
                Math.abs(
                    parseMoney(
                        pick(row, aliases.revenue)
                    )
                ),

            sellerVoucher:
                Math.abs(
                    parseMoney(
                        pick(row, aliases.sellerVoucher)
                    )
                ),

            platformVoucher:
                Math.abs(
                    parseMoney(
                        pick(row, aliases.platformVoucher)
                    )
                )
        });
    });

    return orders;
}

function parseShopeeSkuRows(rows) {
    const result = [];

    rows.forEach((originalRow, index) => {
        const row =
            createNormalizedRow(originalRow);

        const sku =
            String(
                pick(row, aliases.sku)
            ).trim();

        if (!sku) return;

        result.push({
            rowNumber: index + 2,

            orderId:
                String(
                    pick(row, aliases.orderId)
                ).trim(),

            status:
                String(
                    pick(row, aliases.status)
                ).trim(),

            sku,

            product:
                String(
                    pick(row, aliases.product)
                ).trim(),

            quantity:
                Math.max(
                    0,
                    Number(
                        pick(row, aliases.qty)
                    ) || 0
                )
        });
    });

    return result;
}

function parseFinanceRows(rows) {
    const finance = [];

    rows.forEach((originalRow, index) => {
        const row =
            createNormalizedRow(originalRow);

        const orderId =
            String(
                pick(row, aliases.orderId)
            ).trim();

        if (!orderId) return;

        finance.push({
            rowNumber: index + 2,
            orderId,

            revenue:
                Math.abs(
                    parseMoney(
                        pick(row, aliases.revenue)
                    )
                ),

            sellerVoucher:
                Math.abs(
                    parseMoney(
                        pick(row, aliases.sellerVoucher)
                    )
                ),

            platformVoucher:
                Math.abs(
                    parseMoney(
                        pick(row, aliases.platformVoucher)
                    )
                ),

            commission:
                Math.abs(
                    parseMoney(
                        pick(row, aliases.commission)
                    )
                ),

            serviceFee:
                Math.abs(
                    parseMoney(
                        pick(row, aliases.serviceFee)
                    )
                ),

            paymentFee:
                Math.abs(
                    parseMoney(
                        pick(row, aliases.paymentFee)
                    )
                ),

            shippingFee:
                Math.abs(
                    parseMoney(
                        pick(row, aliases.shippingFee)
                    )
                ),

            affiliate:
                Math.abs(
                    parseMoney(
                        pick(row, aliases.affiliate)
                    )
                ),

            otherFee:
                Math.abs(
                    parseMoney(
                        pick(row, aliases.otherFee)
                    )
                ),

            refund:
                Math.abs(
                    parseMoney(
                        pick(row, aliases.refund)
                    )
                ),

            actual:
                parseMoney(
                    pick(row, aliases.actual)
                ),

            settlementId:
                String(
                    pick(row, aliases.settlementId)
                ).trim()
        });
    });

    return finance;
}

function parseBankRows(rows) {
    return rows
        .map((originalRow, index) => {
            const row =
                createNormalizedRow(originalRow);

            return {
                rowNumber: index + 2,

                amount:
                    parseMoney(
                        pick(row, aliases.bankAmount)
                    ),

                content:
                    String(
                        pick(row, aliases.bankContent)
                    )
            };
        })
        .filter(
            item => item.amount !== 0
        );
}

document
    .getElementById("orderFile")
    .addEventListener(
        "change",
        async event =>
            handleOrderFile(
                event.target.files[0]
            )
    );

document
    .getElementById("financeFile")
    .addEventListener(
        "change",
        async event =>
            handleFinanceFile(
                event.target.files[0]
            )
    );

document
    .getElementById("bankFile")
    .addEventListener(
        "change",
        async event =>
            handleBankFile(
                event.target.files[0]
            )
    );

async function handleOrderFile(file) {
    if (!file) return;

    try {
        showToast(
            "Đang đọc file đơn hàng Shopee..."
        );

        const rows =
            await readExcelFile(file);

        state.rawOrderRows = rows;
        state.orders =
            parseOrderRows(rows);

        state.skuRows =
            parseShopeeSkuRows(rows);

        state.files.orders =
            file.name;

        state.statusFilterInitialized =
            false;

        state.selectedSkuStatuses.clear();

        document
            .getElementById(
                "orderFileStatus"
            )
            .textContent =
            "✓ " + file.name;

        refreshImportStatus();
        renderSkuStatusFilters();
        rebuildSkuStatistics();
        refreshNavigation();

        showToast(
            `Đã đọc ${state.skuRows.length} dòng SKU từ file Shopee`
        );

    } catch (error) {
        console.error(error);

        alert(
            "Không đọc được file đơn hàng Shopee."
        );
    }
}

async function handleFinanceFile(file) {
    if (!file) return;

    try {
        showToast(
            "Đang đọc báo cáo thu nhập..."
        );

        const rows =
            await readExcelFile(file);

        state.finance =
            parseFinanceRows(rows);

        state.files.finance =
            file.name;

        document
            .getElementById(
                "financeFileStatus"
            )
            .textContent =
            "✓ " + file.name;

        refreshImportStatus();

        showToast(
            `Đã đọc ${state.finance.length} dòng tài chính`
        );

    } catch (error) {
        console.error(error);

        alert(
            "Không đọc được file báo cáo thu nhập."
        );
    }
}

async function handleBankFile(file) {
    if (!file) return;

    try {
        const rows =
            await readExcelFile(file);

        state.bank =
            parseBankRows(rows);

        state.files.bank =
            file.name;

        document
            .getElementById(
                "bankFileStatus"
            )
            .textContent =
            "✓ " + file.name;

        refreshImportStatus();

        showToast(
            `Đã đọc ${state.bank.length} giao dịch ngân hàng`
        );

    } catch (error) {
        console.error(error);

        alert(
            "Không đọc được file ngân hàng."
        );
    }
}

function refreshImportStatus() {
    document
        .getElementById(
            "importOrderCount"
        )
        .textContent =
        formatNumber(
            state.skuRows.length ||
            state.orders.length
        );

    document
        .getElementById(
            "importFinanceCount"
        )
        .textContent =
        formatNumber(
            state.finance.length
        );

    document
        .getElementById(
            "importBankCount"
        )
        .textContent =
        formatNumber(
            state.bank.length
        );
}

/* =========================================================
   3 TRẠNG THÁI MẶC ĐỊNH
========================================================= */

function isDefaultSkuStatus(status) {
    const text =
        normalizeText(status);

    return (
        text === "danggiao" ||
        text === "dagiao" ||
        text.startsWith(
            "nguoimuaxacnhandanhanduochang"
        )
    );
}

function renderSkuStatusFilters() {
    const container =
        document.getElementById(
            "skuStatusFilters"
        );

    if (!state.skuRows.length) {
        container.innerHTML = `
            <div class="empty-box">
                Hãy nhập file đơn hàng Shopee trước.
            </div>
        `;

        return;
    }

    const counts =
        new Map();

    state.skuRows.forEach(row => {
        const status =
            row.status || "(Trống)";

        counts.set(
            status,
            (counts.get(status) || 0) + 1
        );
    });

    const statuses =
        [...counts.keys()]
            .sort(
                (a, b) =>
                    a.localeCompare(
                        b,
                        "vi"
                    )
            );

    if (!state.statusFilterInitialized) {
        state.selectedSkuStatuses =
            new Set(
                statuses.filter(
                    isDefaultSkuStatus
                )
            );

        state.statusFilterInitialized =
            true;
    }

    container.innerHTML =
        statuses.map(
            (status, index) => {
                const checked =
                    state.selectedSkuStatuses
                        .has(status);

                const display =
                    status.length > 75
                        ? status.slice(
                            0,
                            75
                        ) + "..."
                        : status;

                return `
                    <label
                        class="status-check ${checked ? "checked" : ""}"
                        title="${escapeHTML(status)}"
                    >
                        <input
                            type="checkbox"
                            class="sku-status-checkbox"
                            data-status-index="${index}"
                            ${checked ? "checked" : ""}
                        >

                        <span class="status-check-text">
                            <strong>
                                ${escapeHTML(display)}
                            </strong>

                            <small>
                                ${formatNumber(counts.get(status))}
                                dòng SKU
                            </small>
                        </span>
                    </label>
                `;
            }
        )
        .join("");

    document
        .querySelectorAll(
            ".sku-status-checkbox"
        )
        .forEach(
            (checkbox, index) => {
                checkbox
                    .addEventListener(
                        "change",
                        () => {
                            const status =
                                statuses[index];

                            if (
                                checkbox.checked
                            ) {
                                state
                                    .selectedSkuStatuses
                                    .add(status);

                            } else {
                                state
                                    .selectedSkuStatuses
                                    .delete(status);
                            }

                            renderSkuStatusFilters();
                            rebuildSkuStatistics();
                        }
                    );
            }
        );
}

/* =========================================================
   THỐNG KÊ CỘT T
========================================================= */

function rebuildSkuStatistics() {
    const countMode =
        document
            .getElementById(
                "skuCountMode"
            )
            ?.value ||
        state.skuCountMode ||
        "rows";

    state.skuCountMode =
        countMode;

    const statsMap =
        new Map();

    let filteredRows = 0;
    let countedUnits = 0;

    state.skuRows.forEach(row => {
        if (
            !state
                .selectedSkuStatuses
                .has(row.status)
        ) {
            return;
        }

        filteredRows++;

        /*
            rows =
            MỖI LẦN SKU XUẤT HIỆN Ở CỘT T = 1

            quantity =
            CỘNG CỘT AF
        */

        const add =
            countMode === "quantity"
                ? (row.quantity || 0)
                : 1;

        countedUnits += add;

        if (
            !statsMap.has(row.sku)
        ) {
            statsMap.set(
                row.sku,
                {
                    sku: row.sku,
                    product: row.product,
                    count: 0,
                    rawRows: 0,
                    quantitySum: 0
                }
            );
        }

        const item =
            statsMap.get(row.sku);

        item.count += add;

        item.rawRows += 1;

        item.quantitySum +=
            row.quantity || 0;

        if (
            !item.product &&
            row.product
        ) {
            item.product =
                row.product;
        }
    });

    state.skuStats =
        [...statsMap.values()]
            .sort(
                (a, b) =>
                    b.count -
                        a.count ||
                    a.sku.localeCompare(
                        b.sku
                    )
            );

    const convertedTotals =
        calculateConvertedTotals();

    const convertedGrandTotal =
        sum(
            Object.values(
                convertedTotals
            )
        );

    document
        .getElementById(
            "skuFilteredRows"
        )
        .textContent =
        formatNumber(
            filteredRows
        );

    document
        .getElementById(
            "skuUniqueCount"
        )
        .textContent =
        formatNumber(
            state.skuStats.length
        );

    document
        .getElementById(
            "skuTotalCount"
        )
        .textContent =
        formatNumber(
            countedUnits
        );

    document
        .getElementById(
            "skuConvertedTotal"
        )
        .textContent =
        formatNumber(
            convertedGrandTotal
        );

    renderSkuStatisticsTable();
    renderConvertedTotals();
    refreshNavigation();
}

document
    .getElementById(
        "skuCountMode"
    )
    .addEventListener(
        "change",
        rebuildSkuStatistics
    );

document
    .getElementById(
        "btnOpenSkuStats"
    )
    .addEventListener(
        "click",
        () => {
            openView(
                "sku-stats"
            );

            if (
                !state.skuRows.length
            ) {
                showToast(
                    "Hãy chọn file đơn hàng Shopee ở Bước 1 trước."
                );
            }
        }
    );

/* =========================================================
   LƯU QUY ĐỔI
========================================================= */

function loadConversionConfig() {
    try {
        const savedBase =
            JSON.parse(
                localStorage.getItem(
                    STORAGE_BASE_SKUS
                ) || "null"
            );

        const savedRules =
            JSON.parse(
                localStorage.getItem(
                    STORAGE_CONVERSION_RULES
                ) || "null"
            );

        state.baseSkus =
            Array.isArray(
                savedBase
            ) &&
            savedBase.length
                ? savedBase
                : [
                    ...DEFAULT_BASE_SKUS
                ];

        state.conversionRules =
            savedRules &&
            typeof savedRules ===
                "object"
                ? savedRules
                : JSON.parse(
                    JSON.stringify(
                        DEFAULT_CONVERSION_RULES
                    )
                );

    } catch {
        state.baseSkus =
            [...DEFAULT_BASE_SKUS];

        state.conversionRules =
            JSON.parse(
                JSON.stringify(
                    DEFAULT_CONVERSION_RULES
                )
            );
    }
}

function saveConversionConfig() {
    localStorage.setItem(
        STORAGE_BASE_SKUS,
        JSON.stringify(
            state.baseSkus
        )
    );

    localStorage.setItem(
        STORAGE_CONVERSION_RULES,
        JSON.stringify(
            state.conversionRules
        )
    );
}

function getConversionFactor(
    sourceSku,
    baseSku
) {
    const value =
        state
            .conversionRules
            ?.[sourceSku]
            ?.[baseSku];

    return Number(value) || 0;
}

function setConversionFactor(
    sourceSku,
    baseSku,
    value
) {
    if (
        !state
            .conversionRules[
                sourceSku
            ]
    ) {
        state
            .conversionRules[
                sourceSku
            ] = {};
    }

    const number =
        Math.max(
            0,
            Number(value) || 0
        );

    state
        .conversionRules[
            sourceSku
        ][baseSku] =
        number;

    saveConversionConfig();
}

function hasAnyConversion(
    sourceSku
) {
    return state.baseSkus
        .some(
            baseSku =>
                getConversionFactor(
                    sourceSku,
                    baseSku
                ) > 0
        );
}

function calculateConvertedTotals() {
    const totals = {};

    state.baseSkus
        .forEach(
            baseSku =>
                totals[baseSku] = 0
        );

    state.skuStats
        .forEach(item => {
            state.baseSkus
                .forEach(
                    baseSku => {
                        totals[baseSku] +=
                            item.count *
                            getConversionFactor(
                                item.sku,
                                baseSku
                            );
                    }
                );
        });

    return totals;
}

/* =========================================================
   BẢNG GIỐNG HÌNH 2
========================================================= */

function renderSkuStatisticsTable() {
    const head =
        document.getElementById(
            "skuStatsHead"
        );

    const body =
        document.getElementById(
            "skuStatsBody"
        );

    const foot =
        document.getElementById(
            "skuStatsFoot"
        );

    const warning =
        document.getElementById(
            "conversionWarning"
        );

    head.innerHTML = `
        <tr>
            <th>SKU sản phẩm</th>
            <th>Tên sản phẩm</th>
            <th>Số lượng SKU</th>

            ${state.baseSkus
                .map(
                    baseSku => `
                        <th class="base-sku-header">
                            ${escapeHTML(baseSku)}

                            <button
                                class="remove-base-sku"
                                data-base-sku="${escapeHTML(baseSku)}"
                                title="Xóa cột"
                            >
                                ×
                            </button>
                        </th>
                    `
                )
                .join("")}

            <th>Trạng thái quy đổi</th>
        </tr>
    `;

    if (
        !state.skuStats.length
    ) {
        body.innerHTML = `
            <tr>
                <td
                    colspan="${4 + state.baseSkus.length}"
                    class="empty-table"
                >
                    Không có SKU trong các trạng thái đang tích.
                </td>
            </tr>
        `;

        foot.innerHTML = "";

        warning
            .classList
            .add("hidden");

        bindRemoveBaseSkuButtons();

        return;
    }

    const unmapped = [];

    body.innerHTML =
        state.skuStats
            .map(item => {
                const mapped =
                    hasAnyConversion(
                        item.sku
                    );

                if (!mapped) {
                    unmapped.push(
                        item.sku
                    );
                }

                return `
                    <tr>
                        <td>
                            <strong>
                                ${escapeHTML(item.sku)}
                            </strong>
                        </td>

                        <td class="product-name-cell">
                            ${escapeHTML(item.product)}
                        </td>

                        <td class="sku-qty">
                            ${formatNumber(item.count)}
                        </td>

                        ${state.baseSkus
                            .map(
                                baseSku => `
                                    <td>
                                        <input
                                            class="conversion-input"
                                            type="number"
                                            min="0"
                                            step="1"
                                            data-source-sku="${escapeHTML(item.sku)}"
                                            data-base-sku="${escapeHTML(baseSku)}"
                                            value="${getConversionFactor(item.sku, baseSku)}"
                                        >
                                    </td>
                                `
                            )
                            .join("")}

                        <td>
                            ${
                                mapped
                                    ? `
                                        <span class="sku-mapped">
                                            Đã cấu hình
                                        </span>
                                    `
                                    : `
                                        <span class="sku-unmapped">
                                            Chưa cấu hình
                                        </span>
                                    `
                            }
                        </td>
                    </tr>
                `;
            })
            .join("");

    const totals =
        calculateConvertedTotals();

    foot.innerHTML = `
        <tr>
            <td>
                <strong>
                    TỔNG QUY ĐỔI
                </strong>
            </td>

            <td>
                SL SKU × hệ số quy đổi
            </td>

            <td>
                <strong>
                    ${formatNumber(
                        sum(
                            state
                                .skuStats
                                .map(
                                    x =>
                                        x.count
                                )
                        )
                    )}
                </strong>
            </td>

            ${state.baseSkus
                .map(
                    baseSku => `
                        <td class="conversion-total-highlight">
                            ${formatNumber(
                                totals[baseSku] || 0
                            )}
                        </td>
                    `
                )
                .join("")}

            <td></td>
        </tr>
    `;

    if (
        unmapped.length
    ) {
        warning
            .classList
            .remove("hidden");

        warning.innerHTML = `
            ⚠ Có
            <strong>
                ${unmapped.length}
            </strong>
            SKU chưa cấu hình quy đổi:

            <strong>
                ${unmapped
                    .map(
                        escapeHTML
                    )
                    .join(", ")}
            </strong>.

            Hãy nhập hệ số ngay trên dòng tương ứng.
            Dữ liệu sẽ tự lưu trên trình duyệt.
        `;

    } else {
        warning
            .classList
            .add("hidden");

        warning.innerHTML = "";
    }

    document
        .querySelectorAll(
            ".conversion-input"
        )
        .forEach(input => {
            input.addEventListener(
                "change",
                () => {
                    const sourceSku =
                        input.dataset.sourceSku;

                    const baseSku =
                        input.dataset.baseSku;

                    setConversionFactor(
                        sourceSku,
                        baseSku,
                        input.value
                    );

                    rebuildSkuStatistics();
                }
            );
        });

    bindRemoveBaseSkuButtons();
}

function bindRemoveBaseSkuButtons() {
    document
        .querySelectorAll(
            ".remove-base-sku"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    const sku =
                        button.dataset.baseSku;

                    if (
                        !confirm(
                            `Xóa cột quy đổi ${sku}?`
                        )
                    ) {
                        return;
                    }

                    state.baseSkus =
                        state.baseSkus
                            .filter(
                                x =>
                                    x !== sku
                            );

                    Object
                        .values(
                            state.conversionRules
                        )
                        .forEach(
                            rule => {
                                if (
                                    rule &&
                                    typeof rule ===
                                        "object"
                                ) {
                                    delete rule[sku];
                                }
                            }
                        );

                    saveConversionConfig();
                    rebuildSkuStatistics();
                }
            );
        });
}

function renderConvertedTotals() {
    const body =
        document.getElementById(
            "convertedTotalsBody"
        );

    const totals =
        calculateConvertedTotals();

    const rows =
        state.baseSkus
            .map(
                sku => ({
                    sku,
                    total:
                        totals[sku] ||
                        0
                })
            )
            .filter(
                x =>
                    x.total > 0
            )
            .sort(
                (a, b) =>
                    b.total -
                    a.total
            );

    if (!rows.length) {
        body.innerHTML = `
            <tr>
                <td
                    colspan="2"
                    class="empty-table"
                >
                    Chưa có dữ liệu quy đổi.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        rows.map(
            item => `
                <tr class="total-converted-table">
                    <td>
                        <strong>
                            ${escapeHTML(item.sku)}
                        </strong>
                    </td>

                    <td>
                        ${formatNumber(item.total)}
                    </td>
                </tr>
            `
        )
        .join("");
}

document
    .getElementById(
        "btnAddBaseSku"
    )
    .addEventListener(
        "click",
        () => {
            const value =
                prompt(
                    "Nhập SKU kho / SKU quy đổi muốn thêm:"
                );

            if (!value) return;

            const sku =
                value
                    .trim()
                    .toUpperCase();

            if (!sku) return;

            if (
                state.baseSkus
                    .some(
                        x =>
                            x.toUpperCase() ===
                            sku
                    )
            ) {
                alert(
                    "SKU quy đổi này đã tồn tại."
                );

                return;
            }

            state.baseSkus.push(
                sku
            );

            saveConversionConfig();
            rebuildSkuStatistics();
        }
    );

document
    .getElementById(
        "btnResetConversions"
    )
    .addEventListener(
        "click",
        () => {
            if (
                !confirm(
                    "Khôi phục bảng quy đổi mẫu theo bảng bạn đã gửi?"
                )
            ) {
                return;
            }

            state.baseSkus =
                [
                    ...DEFAULT_BASE_SKUS
                ];

            state.conversionRules =
                JSON.parse(
                    JSON.stringify(
                        DEFAULT_CONVERSION_RULES
                    )
                );

            saveConversionConfig();
            rebuildSkuStatistics();

            showToast(
                "Đã khôi phục quy đổi mẫu."
            );
        }
    );

/* =========================================================
   XUẤT EXCEL
========================================================= */

document
    .getElementById(
        "btnExportSku"
    )
    .addEventListener(
        "click",
        () => {
            if (
                !state.skuStats.length
            ) {
                alert(
                    "Chưa có dữ liệu SKU để xuất."
                );

                return;
            }

            const totals =
                calculateConvertedTotals();

            const detail =
                state.skuStats
                    .map(
                        item => {
                            const row = {
                                "SKU sản phẩm":
                                    item.sku,

                                "Tên sản phẩm":
                                    item.product,

                                "Số lượng SKU":
                                    item.count
                            };

                            state.baseSkus
                                .forEach(
                                    baseSku => {
                                        row[baseSku] =
                                            getConversionFactor(
                                                item.sku,
                                                baseSku
                                            );
                                    }
                                );

                            row[
                                "Trạng thái quy đổi"
                            ] =
                                hasAnyConversion(
                                    item.sku
                                )
                                    ? "Đã cấu hình"
                                    : "Chưa cấu hình";

                            return row;
                        }
                    );

            const totalRow = {
                "SKU sản phẩm":
                    "TỔNG QUY ĐỔI",

                "Tên sản phẩm":
                    "SL SKU × hệ số quy đổi",

                "Số lượng SKU":
                    sum(
                        state
                            .skuStats
                            .map(
                                x =>
                                    x.count
                            )
                    )
            };

            state.baseSkus
                .forEach(
                    baseSku => {
                        totalRow[baseSku] =
                            totals[baseSku] ||
                            0;
                    }
                );

            detail.push(
                totalRow
            );

            const converted =
                state.baseSkus
                    .map(
                        baseSku => ({
                            "SKU kho / SKU quy đổi":
                                baseSku,

                            "Tổng số lượng cần chuẩn bị":
                                totals[baseSku] ||
                                0
                        })
                    );

            const wb =
                XLSX.utils.book_new();

            const ws1 =
                XLSX.utils
                    .json_to_sheet(
                        detail
                    );

            const ws2 =
                XLSX.utils
                    .json_to_sheet(
                        converted
                    );

            XLSX.utils
                .book_append_sheet(
                    wb,
                    ws1,
                    "THONG KE SKU"
                );

            XLSX.utils
                .book_append_sheet(
                    wb,
                    ws2,
                    "TONG QUY DOI"
                );

            XLSX.writeFile(
                wb,
                "THONG_KE_QUY_DOI_SKU_SHOPEE.xlsx"
            );
        }
    );

/* =========================================================
   ĐỐI SOÁT TÀI CHÍNH
========================================================= */

document
    .getElementById(
        "btnReconcile"
    )
    .addEventListener(
        "click",
        () => {
            if (
                state.orders.length ===
                    0 &&
                state.finance.length ===
                    0
            ) {
                alert(
                    "Bạn chưa nhập dữ liệu đơn hàng hoặc báo cáo thu nhập."
                );

                return;
            }

            reconcile();

            openView(
                "overview"
            );

            showToast(
                `Đã kiểm tra ${state.results.length} đơn hàng`
            );
        }
    );

function buildOrderMap() {
    const map =
        new Map();

    state.orders
        .forEach(
            order => {
                if (
                    !map.has(
                        order.orderId
                    )
                ) {
                    map.set(
                        order.orderId,
                        {
                            ...order
                        }
                    );

                } else {
                    const current =
                        map.get(
                            order.orderId
                        );

                    current.revenue +=
                        order.revenue;

                    current.qty +=
                        order.qty;

                    if (
                        order.product &&
                        !current.product
                            .includes(
                                order.product
                            )
                    ) {
                        current.product +=
                            (
                                current.product
                                    ? " | "
                                    : ""
                            ) +
                            order.product;
                    }

                    if (
                        order.sku &&
                        !current.sku
                            .includes(
                                order.sku
                            )
                    ) {
                        current.sku +=
                            (
                                current.sku
                                    ? " | "
                                    : ""
                            ) +
                            order.sku;
                    }
                }
            }
        );

    return map;
}

function buildFinanceMap() {
    const map =
        new Map();

    state.finance
        .forEach(
            item => {
                if (
                    !map.has(
                        item.orderId
                    )
                ) {
                    map.set(
                        item.orderId,
                        {
                            ...item
                        }
                    );

                } else {
                    const current =
                        map.get(
                            item.orderId
                        );

                    [
                        "revenue",
                        "sellerVoucher",
                        "platformVoucher",
                        "commission",
                        "serviceFee",
                        "paymentFee",
                        "shippingFee",
                        "affiliate",
                        "otherFee",
                        "refund",
                        "actual"
                    ]
                    .forEach(
                        key =>
                            current[key] +=
                                item[key]
                    );

                    if (
                        !current.settlementId &&
                        item.settlementId
                    ) {
                        current.settlementId =
                            item.settlementId;
                    }
                }
            }
        );

    return map;
}

function reconcile() {
    const orderMap =
        buildOrderMap();

    const financeMap =
        buildFinanceMap();

    const allOrderIds =
        new Set([
            ...orderMap.keys(),
            ...financeMap.keys()
        ]);

    const results = [];
    const issues = [];

    allOrderIds
        .forEach(
            orderId => {
                const order =
                    orderMap.get(
                        orderId
                    );

                const finance =
                    financeMap.get(
                        orderId
                    );

                const revenue =
                    order?.revenue ||
                    finance?.revenue ||
                    0;

                const sellerVoucher =
                    finance
                        ?.sellerVoucher ||
                    order
                        ?.sellerVoucher ||
                    0;

                const platformVoucher =
                    finance
                        ?.platformVoucher ||
                    order
                        ?.platformVoucher ||
                    0;

                const commission =
                    finance
                        ?.commission ||
                    0;

                const serviceFee =
                    finance
                        ?.serviceFee ||
                    0;

                const paymentFee =
                    finance
                        ?.paymentFee ||
                    0;

                const shippingFee =
                    finance
                        ?.shippingFee ||
                    0;

                const affiliate =
                    finance
                        ?.affiliate ||
                    0;

                const otherFee =
                    finance
                        ?.otherFee ||
                    0;

                const refund =
                    finance
                        ?.refund ||
                    0;

                const totalFees =
                    commission +
                    serviceFee +
                    paymentFee +
                    shippingFee +
                    affiliate +
                    otherFee;

                let expected =
                    revenue -
                    sellerVoucher +
                    platformVoucher -
                    totalFees -
                    refund;

                if (
                    order?.status ===
                        "cancelled" &&
                    finance?.actual ===
                        0
                ) {
                    expected = 0;
                }

                const actual =
                    finance?.actual ||
                    0;

                const difference =
                    actual -
                    expected;

                const result = {
                    orderId,
                    date:
                        order?.date ||
                        "",

                    sku:
                        order?.sku ||
                        "",

                    product:
                        order?.product ||
                        "",

                    qty:
                        order?.qty ||
                        0,

                    status:
                        order?.status ||
                        "other",

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
                        finance
                            ?.settlementId ||
                        "",

                    hasOrder:
                        !!order,

                    hasFinance:
                        !!finance
                };

                results.push(
                    result
                );

                detectIssues(
                    result,
                    issues
                );
            }
        );

    state.results =
        results;

    state.issues =
        issues;

    renderAll();
}

function detectIssues(
    result,
    issues
) {
    if (!result.hasOrder) {
        issues.push({
            severity: "high",
            type: "missing_order",
            orderId:
                result.orderId,
            message:
                "Có dữ liệu tài chính nhưng không tìm thấy đơn hàng.",
            result
        });
    }

    if (!result.hasFinance) {
        issues.push({
            severity: "high",
            type:
                "missing_finance",
            orderId:
                result.orderId,
            message:
                "Có đơn hàng nhưng chưa tìm thấy dữ liệu thanh toán của sàn.",
            result
        });
    }

    if (
        result.hasFinance &&
        Math.abs(
            result.difference
        ) >
        CONFIG.tolerance
    ) {
        issues.push({
            severity:
                Math.abs(
                    result.difference
                ) >= 50000
                    ? "high"
                    : "medium",

            type:
                "difference",

            orderId:
                result.orderId,

            message:
                `Chênh lệch ${formatMoney(result.difference)} giữa số phải nhận và số sàn thanh toán.`,

            result
        });
    }

    if (
        result.status ===
            "delivered" &&
        result.expected > 0 &&
        result.actual === 0 &&
        result.hasFinance
    ) {
        issues.push({
            severity:
                "high",

            type:
                "unpaid",

            orderId:
                result.orderId,

            message:
                "Đơn giao thành công nhưng chưa ghi nhận tiền thanh toán.",

            result
        });
    }

    if (
        result.status ===
            "return" ||
        result.status ===
            "cancelled"
    ) {
        issues.push({
            severity:
                "low",

            type:
                "return",

            orderId:
                result.orderId,

            message:
                result.status ===
                    "return"
                    ? "Đơn hoàn/trả cần kiểm tra hàng đã quay lại kho."
                    : "Đơn đã hủy cần kiểm tra phí phát sinh.",

            result
        });
    }
}

function renderAll() {
    renderDashboard();
    renderOrders();
    renderFees();
    renderReturns();
    renderPayments();
    renderIssues();
    rebuildSkuStatistics();
    refreshNavigation();
}

function renderDashboard() {
    const data =
        state.results;

    const totalOrders =
        data.length;

    const revenue =
        sum(
            data.map(
                x => x.revenue
            )
        );

    const expected =
        sum(
            data.map(
                x => x.expected
            )
        );

    const actual =
        sum(
            data.map(
                x => x.actual
            )
        );

    const difference =
        actual -
        expected;

    const totalFees =
        sum(
            data.map(
                x =>
                    x.totalFees
            )
        );

    const delivered =
        data.filter(
            x =>
                x.status ===
                "delivered"
        ).length;

    const returns =
        data.filter(
            x =>
                x.status ===
                    "return" ||
                x.status ===
                    "cancelled"
        ).length;

    document
        .getElementById(
            "kpiOrders"
        )
        .textContent =
        formatNumber(
            totalOrders
        );

    document
        .getElementById(
            "kpiRevenue"
        )
        .textContent =
        formatMoney(
            revenue
        );

    document
        .getElementById(
            "kpiExpected"
        )
        .textContent =
        formatMoney(
            expected
        );

    document
        .getElementById(
            "kpiActual"
        )
        .textContent =
        formatMoney(
            actual
        );

    const diffEl =
        document
            .getElementById(
                "kpiDifference"
            );

    diffEl.textContent =
        formatMoney(
            difference
        );

    diffEl.className =
        "kpi-value money " +
        (
            Math.abs(
                difference
            ) <=
            CONFIG.tolerance
                ? "money-positive"
                : "money-negative"
        );

    document
        .getElementById(
            "kpiDifferenceText"
        )
        .textContent =
        Math.abs(
            difference
        ) <=
        CONFIG.tolerance
            ? "Dữ liệu đang khớp"
            : "Có chênh lệch cần kiểm tra";

    document
        .getElementById(
            "kpiIssues"
        )
        .textContent =
        formatNumber(
            state.issues.length
        );

    document
        .getElementById(
            "processOrders"
        )
        .textContent =
        `${formatNumber(totalOrders)} đơn`;

    document
        .getElementById(
            "processDelivered"
        )
        .textContent =
        `${formatNumber(delivered)} đơn`;

    document
        .getElementById(
            "processReturns"
        )
        .textContent =
        `${formatNumber(returns)} đơn`;

    document
        .getElementById(
            "processFees"
        )
        .textContent =
        formatMoney(
            totalFees
        );

    document
        .getElementById(
            "processPayment"
        )
        .textContent =
        formatMoney(
            actual
        );

    document
        .getElementById(
            "processIssues"
        )
        .textContent =
        `${formatNumber(state.issues.length)} lỗi`;

    renderDashboardIssueSummary();
    renderDashboardFeeSummary();
    renderDashboardIssueTable();
}

function renderDashboardIssueSummary() {
    const container =
        document
            .getElementById(
                "issueSummary"
            );

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

    state.issues
        .forEach(
            issue =>
                counters[
                    issue.type
                ] =
                (
                    counters[
                        issue.type
                    ] || 0
                ) + 1
        );

    container.innerHTML = `
        <div class="issue-line">
            <div class="issue-dot red"></div>
            <span>Đơn chênh lệch tiền</span>
            <strong>${counters.difference}</strong>
        </div>

        <div class="issue-line">
            <div class="issue-dot orange"></div>
            <span>Thiếu dữ liệu thanh toán</span>
            <strong>${counters.missing_finance}</strong>
        </div>

        <div class="issue-line">
            <div class="issue-dot blue"></div>
            <span>Đơn chưa thanh toán</span>
            <strong>${counters.unpaid}</strong>
        </div>

        <div class="issue-line">
            <div class="issue-dot orange"></div>
            <span>Đơn hoàn / hủy cần kiểm tra</span>
            <strong>${counters.return}</strong>
        </div>
    `;
}

function feeLine(
    name,
    amount
) {
    return `
        <div class="fee-line">
            <span>${name}</span>
            <strong>${formatMoney(amount)}</strong>
        </div>
    `;
}

function renderDashboardFeeSummary() {
    const container =
        document
            .getElementById(
                "feeSummary"
            );

    if (!state.results.length) {
        container.innerHTML = `
            <div class="empty-box">
                Chưa có dữ liệu phí.
            </div>
        `;

        return;
    }

    const commission =
        sum(
            state.results.map(
                x =>
                    x.commission
            )
        );

    const service =
        sum(
            state.results.map(
                x =>
                    x.serviceFee
            )
        );

    const payment =
        sum(
            state.results.map(
                x =>
                    x.paymentFee
            )
        );

    const shipping =
        sum(
            state.results.map(
                x =>
                    x.shippingFee
            )
        );

    const affiliate =
        sum(
            state.results.map(
                x =>
                    x.affiliate
            )
        );

    const total =
        sum(
            state.results.map(
                x =>
                    x.totalFees
            )
        );

    container.innerHTML =
        feeLine(
            "Phí hoa hồng / cố định",
            commission
        ) +
        feeLine(
            "Phí dịch vụ",
            service
        ) +
        feeLine(
            "Phí thanh toán",
            payment
        ) +
        feeLine(
            "Phí vận chuyển",
            shipping
        ) +
        feeLine(
            "Affiliate",
            affiliate
        ) +
        `
            <div class="fee-line total">
                <span>Tổng phí</span>
                <strong>${formatMoney(total)}</strong>
            </div>
        `;
}

function renderDashboardIssueTable() {
    const body =
        document
            .getElementById(
                "dashboardIssueBody"
            );

    const issues =
        state.issues
            .filter(
                x =>
                    x.type ===
                    "difference"
            )
            .slice(
                0,
                8
            );

    if (!issues.length) {
        body.innerHTML = `
            <tr>
                <td
                    colspan="7"
                    class="empty-table"
                >
                    Không có đơn chênh lệch.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        issues
            .map(
                issue => {
                    const r =
                        issue.result;

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
                }
            )
            .join("");
}

function renderOrders() {
    let data =
        [...state.results];

    const search =
        normalizeText(
            document
                .getElementById(
                    "orderSearch"
                )
                ?.value
        );

    const status =
        document
            .getElementById(
                "orderStatusFilter"
            )
            ?.value;

    if (search) {
        data =
            data.filter(
                item =>
                    normalizeText(
                        item.orderId +
                        " " +
                        item.sku +
                        " " +
                        item.product
                    )
                    .includes(
                        search
                    )
            );
    }

    if (status) {
        data =
            data.filter(
                item =>
                    item.status ===
                    status
            );
    }

    document
        .getElementById(
            "orderTableSummary"
        )
        .textContent =
        `${formatNumber(data.length)} đơn`;

    const body =
        document
            .getElementById(
                "orderTableBody"
            );

    if (!data.length) {
        body.innerHTML = `
            <tr>
                <td
                    colspan="10"
                    class="empty-table"
                >
                    Chưa có dữ liệu đối soát đơn hàng
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        data
            .map(
                item => `
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
                            Math.abs(item.difference) <=
                            CONFIG.tolerance
                                ? "money-positive"
                                : "money-negative"
                        }">
                            ${formatMoney(item.difference)}
                        </td>
                    </tr>
                `
            )
            .join("");
}

function renderFees() {
    const commission =
        sum(
            state.results.map(
                x =>
                    x.commission
            )
        );

    const service =
        sum(
            state.results.map(
                x =>
                    x.serviceFee
            )
        );

    const payment =
        sum(
            state.results.map(
                x =>
                    x.paymentFee
            )
        );

    const shipping =
        sum(
            state.results.map(
                x =>
                    x.shippingFee
            )
        );

    const affiliate =
        sum(
            state.results.map(
                x =>
                    x.affiliate
            )
        );

    const total =
        sum(
            state.results.map(
                x =>
                    x.totalFees
            )
        );

    document.getElementById("feeCommission").textContent = formatMoney(commission);
    document.getElementById("feeService").textContent = formatMoney(service);
    document.getElementById("feePayment").textContent = formatMoney(payment);
    document.getElementById("feeShipping").textContent = formatMoney(shipping);
    document.getElementById("feeAffiliate").textContent = formatMoney(affiliate);
    document.getElementById("feeTotal").textContent = formatMoney(total);

    const body =
        document
            .getElementById(
                "feeTableBody"
            );

    if (!state.results.length) {
        body.innerHTML = `
            <tr>
                <td colspan="8" class="empty-table">
                    Chưa có dữ liệu
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        state.results
            .map(
                item => `
                    <tr>
                        <td>
                            <strong>
                                ${escapeHTML(item.orderId)}
                            </strong>
                        </td>

                        <td>${formatMoney(item.commission)}</td>
                        <td>${formatMoney(item.serviceFee)}</td>
                        <td>${formatMoney(item.paymentFee)}</td>
                        <td>${formatMoney(item.shippingFee)}</td>
                        <td>${formatMoney(item.affiliate)}</td>
                        <td>${formatMoney(item.otherFee)}</td>

                        <td>
                            <strong>
                                ${formatMoney(item.totalFees)}
                            </strong>
                        </td>
                    </tr>
                `
            )
            .join("");
}

function renderReturns() {
    const data =
        state.results
            .filter(
                item =>
                    item.status ===
                        "return" ||
                    item.status ===
                        "cancelled"
            );

    const body =
        document
            .getElementById(
                "returnTableBody"
            );

    if (!data.length) {
        body.innerHTML = `
            <tr>
                <td
                    colspan="8"
                    class="empty-table"
                >
                    Không có đơn hoàn / hủy
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        data
            .map(
                item => `
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
                `
            )
            .join("");
}

function renderPayments() {
    const groups =
        new Map();

    state.results
        .forEach(
            item => {
                const key =
                    item.settlementId ||
                    "CHUA_CO_MA_KY";

                if (
                    !groups.has(key)
                ) {
                    groups.set(
                        key,
                        {
                            settlementId:
                                key,

                            count:
                                0,

                            expected:
                                0,

                            actual:
                                0
                        }
                    );
                }

                const group =
                    groups.get(key);

                group.count++;

                group.expected +=
                    item.expected;

                group.actual +=
                    item.actual;
            }
        );

    const body =
        document
            .getElementById(
                "paymentTableBody"
            );

    if (!groups.size) {
        body.innerHTML = `
            <tr>
                <td
                    colspan="7"
                    class="empty-table"
                >
                    Chưa có dữ liệu thanh toán
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        [...groups.values()]
            .map(
                group => {
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
                                    group.settlementId ===
                                    "CHUA_CO_MA_KY"
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
                                Math.abs(difference) <=
                                CONFIG.tolerance
                                    ? "money-positive"
                                    : "money-negative"
                            }">
                                ${formatMoney(difference)}
                            </td>

                            <td>
                                ${
                                    bankMatch
                                        ? `
                                            <span class="status status-success">
                                                Đã tìm thấy
                                            </span>
                                        `
                                        : `
                                            <span class="status status-neutral">
                                                Chưa đối chiếu
                                            </span>
                                        `
                                }
                            </td>

                            <td>
                                ${
                                    Math.abs(difference) <=
                                    CONFIG.tolerance
                                        ? `
                                            <span class="status status-success">
                                                Khớp
                                            </span>
                                        `
                                        : `
                                            <span class="status status-danger">
                                                Chênh lệch
                                            </span>
                                        `
                                }
                            </td>
                        </tr>
                    `;
                }
            )
            .join("");
}

function findBankMatch(
    settlementId,
    amount
) {
    if (!state.bank.length) {
        return null;
    }

    const cleanId =
        normalizeText(
            settlementId
        );

    let match =
        state.bank.find(
            item =>
                cleanId &&
                normalizeText(
                    item.content
                )
                .includes(cleanId)
        );

    if (match) return match;

    match =
        state.bank.find(
            item =>
                Math.abs(
                    Math.abs(item.amount) -
                    Math.abs(amount)
                ) <=
                CONFIG.tolerance
        );

    return match || null;
}

function renderSeverity(
    severity
) {
    if (
        severity === "high"
    ) {
        return `
            <span class="status status-danger">
                Cao
            </span>
        `;
    }

    if (
        severity === "medium"
    ) {
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

function severityLabel(
    severity
) {
    if (
        severity === "high"
    ) {
        return "Cao";
    }

    if (
        severity === "medium"
    ) {
        return "Trung bình";
    }

    return "Theo dõi";
}

function issueTypeLabel(
    type
) {
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

function renderIssues() {
    let data =
        [...state.issues];

    const search =
        normalizeText(
            document
                .getElementById(
                    "issueSearch"
                )
                ?.value
        );

    const type =
        document
            .getElementById(
                "issueTypeFilter"
            )
            ?.value;

    if (search) {
        data =
            data.filter(
                issue =>
                    normalizeText(
                        issue.orderId
                    )
                    .includes(
                        search
                    )
            );
    }

    if (type) {
        data =
            data.filter(
                issue =>
                    issue.type ===
                    type
            );
    }

    document
        .getElementById(
            "issueTableSummary"
        )
        .textContent =
        `${formatNumber(data.length)} vấn đề`;

    const body =
        document
            .getElementById(
                "issueTableBody"
            );

    if (!data.length) {
        body.innerHTML = `
            <tr>
                <td
                    colspan="8"
                    class="empty-table"
                >
                    Chưa phát hiện sai lệch
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        data
            .map(
                issue => {
                    const r =
                        issue.result;

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
                                Math.abs(r.difference) <=
                                CONFIG.tolerance
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
                }
            )
            .join("");
}

function refreshNavigation() {
    document
        .getElementById(
            "navOrderCount"
        )
        .textContent =
        state.results.length ||
        new Set(
            state.orders
                .map(
                    x =>
                        x.orderId
                )
        ).size;

    document
        .getElementById(
            "navIssueCount"
        )
        .textContent =
        state.issues.length;

    document
        .getElementById(
            "navReturnCount"
        )
        .textContent =
        state.results
            .filter(
                x =>
                    x.status ===
                        "return" ||
                    x.status ===
                        "cancelled"
            )
            .length;

    document
        .getElementById(
            "navSkuCount"
        )
        .textContent =
        state.skuStats.length;
}

document
    .getElementById(
        "orderSearch"
    )
    .addEventListener(
        "input",
        renderOrders
    );

document
    .getElementById(
        "orderStatusFilter"
    )
    .addEventListener(
        "change",
        renderOrders
    );

document
    .getElementById(
        "issueSearch"
    )
    .addEventListener(
        "input",
        renderIssues
    );

document
    .getElementById(
        "issueTypeFilter"
    )
    .addEventListener(
        "change",
        renderIssues
    );

document
    .getElementById(
        "btnExportIssues"
    )
    .addEventListener(
        "click",
        () => {
            if (
                !state.issues.length
            ) {
                alert(
                    "Không có dữ liệu sai lệch để xuất."
                );

                return;
            }

            const data =
                state.issues
                    .map(
                        issue => {
                            const r =
                                issue.result;

                            return {
                                "Mức độ":
                                    severityLabel(
                                        issue.severity
                                    ),

                                "Mã đơn":
                                    issue.orderId,

                                "Trạng thái":
                                    statusLabel(
                                        r.status
                                    ),

                                "Doanh thu":
                                    r.revenue,

                                "Phải nhận":
                                    r.expected,

                                "Sàn đã trả":
                                    r.actual,

                                "Chênh lệch":
                                    r.difference,

                                "Loại lỗi":
                                    issueTypeLabel(
                                        issue.type
                                    ),

                                "Nội dung":
                                    issue.message
                            };
                        }
                    );

            const worksheet =
                XLSX.utils
                    .json_to_sheet(
                        data
                    );

            const workbook =
                XLSX.utils
                    .book_new();

            XLSX.utils
                .book_append_sheet(
                    workbook,
                    worksheet,
                    "SAI LECH"
                );

            XLSX.writeFile(
                workbook,
                "DOI_SOAT_SAI_LECH.xlsx"
            );
        }
    );

/* =========================================================
   DEMO
========================================================= */

document
    .getElementById(
        "btnDemo"
    )
    .addEventListener(
        "click",
        loadDemoData
    );

function loadDemoData() {
    state.orders = [
        {
            orderId:
                "SP26080001",

            date:
                "2026-08-01",

            sku:
                "REWD",

            product:
                "Kem trắng nách Extra White & Deodorant Cream",

            qty: 1,
            status: "delivered",
            revenue: 280000,
            sellerVoucher: 0,
            platformVoucher: 0
        },

        {
            orderId:
                "SP26080002",

            date:
                "2026-08-01",

            sku:
                "2REWD",

            product:
                "[Mua 2 tặng 1] Extra White & Deodorant Cream",

            qty: 1,
            status: "delivered",
            revenue: 560000,
            sellerVoucher: 0,
            platformVoucher: 0
        },

        {
            orderId:
                "SP26080003",

            date:
                "2026-08-01",

            sku:
                "2RCS",

            product:
                "[Mua 2 tặng 1] Confidence Stick",

            qty: 1,
            status: "delivered",
            revenue: 580000,
            sellerVoucher: 0,
            platformVoucher: 0
        },

        {
            orderId:
                "SP26080004",

            date:
                "2026-08-01",

            sku:
                "RTB",

            product:
                "[Mua 1 tặng 1] Tranex Brightening Body Cream",

            qty: 1,
            status: "delivered",
            revenue: 320000,
            sellerVoucher: 0,
            platformVoucher: 0
        }
    ];

    state.skuRows = [
        {
            orderId:
                "SP26080001",

            status:
                "Đang giao",

            sku:
                "REWD",

            product:
                "Kem trắng nách Extra White & Deodorant Cream",

            quantity: 1
        },

        {
            orderId:
                "SP26080002",

            status:
                "Đang giao",

            sku:
                "2REWD",

            product:
                "[Mua 2 tặng 1] Extra White & Deodorant Cream",

            quantity: 1
        },

        {
            orderId:
                "SP26080003",

            status:
                "Đã giao",

            sku:
                "2RCS",

            product:
                "[Mua 2 tặng 1] Confidence Stick",

            quantity: 1
        },

        {
            orderId:
                "SP26080004",

            status:
                "Người mua xác nhận đã nhận được hàng, tuy nhiên Người mua vẫn có thể gửi yêu cầu Trả hàng/Hoàn tiền",

            sku:
                "RTB",

            product:
                "[Mua 1 tặng 1] Tranex Brightening Body Cream",

            quantity: 1
        },

        {
            orderId:
                "SP26080005",

            status:
                "Chờ giao hàng",

            sku:
                "RCS",

            product:
                "Confidence Stick",

            quantity: 1
        }
    ];

    state.finance = [];
    state.bank = [];
    state.results = [];
    state.issues = [];

    state.statusFilterInitialized =
        false;

    state.selectedSkuStatuses.clear();

    document
        .getElementById(
            "orderFileStatus"
        )
        .textContent =
        "✓ Dữ liệu mẫu";

    document
        .getElementById(
            "financeFileStatus"
        )
        .textContent =
        "Chưa có file";

    document
        .getElementById(
            "bankFileStatus"
        )
        .textContent =
        "Chưa có file";

    refreshImportStatus();
    renderSkuStatusFilters();
    rebuildSkuStatistics();
    renderAll();

    openView(
        "sku-stats"
    );

    showToast(
        "Đã nạp dữ liệu mẫu thống kê SKU."
    );
}

/* =========================================================
   RESET
========================================================= */

document
    .getElementById(
        "btnReset"
    )
    .addEventListener(
        "click",
        () => {
            if (
                !confirm(
                    "Bạn có chắc muốn xóa toàn bộ dữ liệu đang nhập? Bảng quy đổi SKU vẫn được giữ lại."
                )
            ) {
                return;
            }

            state.orders = [];
            state.finance = [];
            state.bank = [];
            state.results = [];
            state.issues = [];
            state.rawOrderRows = [];
            state.skuRows = [];
            state.skuStats = [];

            state
                .selectedSkuStatuses
                .clear();

            state.statusFilterInitialized =
                false;

            state.files = {
                orders: "",
                finance: "",
                bank: ""
            };

            document
                .getElementById(
                    "orderFile"
                )
                .value = "";

            document
                .getElementById(
                    "financeFile"
                )
                .value = "";

            document
                .getElementById(
                    "bankFile"
                )
                .value = "";

            document
                .getElementById(
                    "orderFileStatus"
                )
                .textContent =
                "Chưa có file";

            document
                .getElementById(
                    "financeFileStatus"
                )
                .textContent =
                "Chưa có file";

            document
                .getElementById(
                    "bankFileStatus"
                )
                .textContent =
                "Chưa có file";

            refreshImportStatus();
            renderSkuStatusFilters();
            renderAll();

            showToast(
                "Đã xóa dữ liệu."
            );
        }
    );

let toastTimer;

function showToast(message) {
    const toast =
        document.getElementById(
            "toast"
        );

    toast.textContent =
        message;

    toast
        .classList
        .add("show");

    clearTimeout(
        toastTimer
    );

    toastTimer =
        setTimeout(
            () => {
                toast
                    .classList
                    .remove(
                        "show"
                    );
            },
            2600
        );
}

/* =========================================================
   INITIAL
========================================================= */

loadConversionConfig();
refreshImportStatus();
renderSkuStatusFilters();
renderAll();
openView("overview");
