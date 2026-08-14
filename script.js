/* =========================================================
   RUCOS - SHOPEE SKU STATISTICS + TABS V5
   Chỉ tập trung: nhập file Shopee -> lọc trạng thái -> thống kê -> quy đổi
========================================================= */

const state = {
    fileName: "",
    skuRows: [],
    skuStats: [],
    selectedStatuses: new Set(),
    statusFilterInitialized: false,
    countMode: "rows",
    baseSkus: [],
    conversionRules: {}
};

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
    RTB: { RTB: 1, REWD: 1 },
    "2REWD": { REWD: 3 },
    "2RCS": { RCS: 3 },
    ROE: { ROE: 1 },
    CROE: { ROE: 1, "OBM-100326-2": 1 },
    REWGS: { REWGS: 1 },
    RKN: { RKN: 1 },
    REWS: { REWS: 1 },
    REWD: { REWD: 1 },
    RCS: { RCS: 1 }
};

const STORAGE_BASE_SKUS = "rucos_v4_base_skus";
const STORAGE_CONVERSION_RULES = "rucos_v4_conversion_rules";

const PAGE_INFO = {
    overview: {
        title: "Tổng quan thống kê Shopee",
        subtitle: "Thống kê SKU và quy đổi số lượng hàng thực tế cần chuẩn bị"
    },
    import: {
        title: "Nhập dữ liệu Shopee",
        subtitle: "Giai đoạn hiện tại chỉ cần file đơn hàng gốc từ Shopee"
    },
    "sku-stats": {
        title: "Thống kê & quy đổi SKU",
        subtitle: "Đếm SKU theo trạng thái và quy đổi combo / quà tặng"
    },
    orders: {
        title: "Đơn hàng Shopee",
        subtitle: "Danh sách dòng sản phẩm đọc trực tiếp từ file đơn hàng Shopee"
    },
    fees: {
        title: "Phí sàn",
        subtitle: "Module đối soát phí - sẽ nối file tài chính khi có dữ liệu"
    },
    returns: {
        title: "Hoàn / Hủy",
        subtitle: "Theo dõi các đơn hoàn, trả hoặc hủy có trong file Shopee"
    },
    payments: {
        title: "Thanh toán",
        subtitle: "Module thanh toán - sẽ nối file thu nhập/settlement khi có dữ liệu"
    },
    issues: {
        title: "Sai lệch",
        subtitle: "Module phát hiện sai lệch tài chính - sẽ triển khai khi có dữ liệu đối soát"
    }
};

const ALIASES = {
    orderId: ["Mã đơn hàng", "Mã đơn", "Order ID", "Shopee Order ID"],
    status: ["Trạng Thái Đơn Hàng", "Trạng thái đơn hàng", "Trạng thái", "Order Status"],
    sku: ["SKU sản phẩm", "SKU", "Seller SKU", "Product SKU"],
    product: ["Tên sản phẩm", "Sản phẩm", "Product Name", "Tên hàng"],
    quantity: ["Số lượng", "Quantity", "SL"]
};

/* ======================== DOM HELPERS ======================== */
function $(id) {
    return document.getElementById(id);
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

function sum(values) {
    return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

/* ======================== NAVIGATION ======================== */
document.querySelectorAll(".nav-item[data-view]").forEach(button => {
    button.addEventListener("click", () => openView(button.dataset.view));
});

document.querySelectorAll("[data-open-view]").forEach(button => {
    button.addEventListener("click", () => openView(button.dataset.openView));
});

if ($("btnGoImport")) $("btnGoImport").addEventListener("click", () => openView("import"));

function openView(viewName) {
    document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
    const target = $("view-" + viewName);
    if (target) target.classList.add("active");

    document.querySelectorAll(".nav-item[data-view]").forEach(item => {
        item.classList.toggle("active", item.dataset.view === viewName);
    });

    const info = PAGE_INFO[viewName];
    if (info) {
        $("pageTitle").textContent = info.title;
        $("pageSubtitle").textContent = info.subtitle;
    }

    if (viewName === "orders") renderOrdersTab();
    if (viewName === "returns") renderReturnsTab();
}

/* ======================== EXCEL ======================== */
async function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = event => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: "array" });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, {
                    defval: "",
                    raw: true
                });
                resolve(rows);
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function parseShopeeRows(rows) {
    const parsed = [];

    rows.forEach((originalRow, index) => {
        const row = createNormalizedRow(originalRow);
        const sku = String(pick(row, ALIASES.sku)).trim();
        if (!sku) return;

        parsed.push({
            rowNumber: index + 2,
            orderId: String(pick(row, ALIASES.orderId)).trim(),
            status: String(pick(row, ALIASES.status)).trim(),
            sku,
            product: String(pick(row, ALIASES.product)).trim(),
            quantity: Math.max(0, Number(pick(row, ALIASES.quantity)) || 0)
        });
    });

    return parsed;
}

function validateShopeeFile(rows, parsedRows, fileName) {
    if (!rows.length) {
        return "File không có dữ liệu.";
    }

    if (!parsedRows.length) {
        if (normalizeText(fileName).includes("thongkequydoisku")) {
            return "Đây có vẻ là file kết quả thống kê đã xuất ra. Hãy chọn file đơn hàng gốc Shopee dạng Order.all....xlsx.";
        }
        return "Không tìm thấy cột 'SKU sản phẩm'. Hãy chọn file đơn hàng gốc xuất trực tiếp từ Shopee.";
    }

    const hasStatus = parsedRows.some(row => row.status);
    if (!hasStatus) {
        return "Đã đọc được SKU nhưng không tìm thấy cột 'Trạng Thái Đơn Hàng'. File này có thể không phải file Order.all... của Shopee.";
    }

    return "";
}

$("orderFile").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;

    try {
        showToast("Đang đọc file Shopee...");
        const rows = await readExcelFile(file);
        const parsedRows = parseShopeeRows(rows);
        const validationError = validateShopeeFile(rows, parsedRows, file.name);

        if (validationError) {
            state.fileName = "";
            state.skuRows = [];
            state.skuStats = [];
            state.selectedStatuses.clear();
            state.statusFilterInitialized = false;
            $("orderFileStatus").textContent = "✕ " + validationError;
            $("orderFileStatus").className = "upload-file-status error";
            event.target.value = "";
            renderAll();
            alert(validationError);
            return;
        }

        state.fileName = file.name;
        state.skuRows = parsedRows;
        state.skuStats = [];
        state.selectedStatuses.clear();
        state.statusFilterInitialized = false;

        $("orderFileStatus").textContent = "✓ " + file.name;
        $("orderFileStatus").className = "upload-file-status success";

        renderStatusFilters();
        rebuildSkuStatistics();
        renderImportSummary();
        renderTopFileState();

        showToast(`Đã đọc ${formatNumber(parsedRows.length)} dòng SKU từ Shopee.`);
    } catch (error) {
        console.error(error);
        $("orderFileStatus").textContent = "✕ Không đọc được file.";
        $("orderFileStatus").className = "upload-file-status error";
        alert("Không đọc được file Excel. Hãy kiểm tra lại file Shopee.");
    }
});

/* ======================== DEFAULT STATUS ======================== */
function isDefaultStatus(status) {
    const text = normalizeText(status);
    return (
        text === "danggiao" ||
        text === "dagiao" ||
        text.startsWith("nguoimuaxacnhandanhanduochang")
    );
}

function renderStatusFilters() {
    const container = $("skuStatusFilters");

    if (!state.skuRows.length) {
        container.innerHTML = '<div class="empty-box">Hãy nhập file đơn hàng Shopee trước.</div>';
        return;
    }

    const counts = new Map();
    state.skuRows.forEach(row => {
        const status = row.status || "(Trống)";
        counts.set(status, (counts.get(status) || 0) + 1);
    });

    const statuses = [...counts.keys()].sort((a, b) => a.localeCompare(b, "vi"));

    if (!state.statusFilterInitialized) {
        state.selectedStatuses = new Set(statuses.filter(isDefaultStatus));
        state.statusFilterInitialized = true;
    }

    container.innerHTML = statuses.map((status, index) => {
        const checked = state.selectedStatuses.has(status);
        const display = status.length > 82 ? status.slice(0, 82) + "..." : status;

        return `
            <label class="status-check ${checked ? "checked" : ""}" title="${escapeHTML(status)}">
                <input type="checkbox" class="status-checkbox" data-index="${index}" ${checked ? "checked" : ""}>
                <span class="status-check-text">
                    <strong>${escapeHTML(display)}</strong>
                    <small>${formatNumber(counts.get(status))} dòng SKU</small>
                </span>
            </label>
        `;
    }).join("");

    document.querySelectorAll(".status-checkbox").forEach((checkbox, index) => {
        checkbox.addEventListener("change", () => {
            const status = statuses[index];
            if (checkbox.checked) state.selectedStatuses.add(status);
            else state.selectedStatuses.delete(status);

            renderStatusFilters();
            rebuildSkuStatistics();
        });
    });
}

/* ======================== SKU STATS ======================== */
$("skuCountMode").addEventListener("change", () => {
    state.countMode = $("skuCountMode").value;
    rebuildSkuStatistics();
});

function rebuildSkuStatistics() {
    state.countMode = $("skuCountMode").value || state.countMode || "rows";

    const statsMap = new Map();
    let filteredRows = 0;
    let totalCount = 0;

    state.skuRows.forEach(row => {
        if (!state.selectedStatuses.has(row.status)) return;

        filteredRows++;
        const add = state.countMode === "quantity" ? (row.quantity || 0) : 1;
        totalCount += add;

        if (!statsMap.has(row.sku)) {
            statsMap.set(row.sku, {
                sku: row.sku,
                product: row.product,
                count: 0,
                rawRows: 0,
                quantitySum: 0
            });
        }

        const item = statsMap.get(row.sku);
        item.count += add;
        item.rawRows += 1;
        item.quantitySum += row.quantity || 0;
        if (!item.product && row.product) item.product = row.product;
    });

    state.skuStats = [...statsMap.values()].sort((a, b) =>
        b.count - a.count || a.sku.localeCompare(b.sku)
    );

    const convertedTotals = calculateConvertedTotals();
    const convertedGrandTotal = sum(Object.values(convertedTotals));

    $("skuFilteredRows").textContent = formatNumber(filteredRows);
    $("skuUniqueCount").textContent = formatNumber(state.skuStats.length);
    $("skuTotalCount").textContent = formatNumber(totalCount);
    $("skuConvertedTotal").textContent = formatNumber(convertedGrandTotal);

    $("overviewFilteredRows").textContent = formatNumber(filteredRows);
    $("overviewUniqueSku").textContent = formatNumber(state.skuStats.length);
    $("overviewSkuCount").textContent = formatNumber(totalCount);
    $("overviewConvertedTotal").textContent = formatNumber(convertedGrandTotal);
    $("overviewCountModeText").textContent = state.countMode === "rows"
        ? "Đếm số lần SKU xuất hiện"
        : "Cộng theo cột Số lượng";

    $("navSkuCount").textContent = state.skuStats.length;

    renderConversionTable();
    renderConvertedTotals();
    renderOverviewSkuTable();
    renderOverviewFileSummary();
    renderImportSummary();
}

/* ======================== CONVERSION CONFIG ======================== */
function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadConversionConfig() {
    try {
        const savedBase = JSON.parse(localStorage.getItem(STORAGE_BASE_SKUS) || "null");
        const savedRules = JSON.parse(localStorage.getItem(STORAGE_CONVERSION_RULES) || "null");

        state.baseSkus = Array.isArray(savedBase) && savedBase.length
            ? savedBase
            : [...DEFAULT_BASE_SKUS];

        state.conversionRules = savedRules && typeof savedRules === "object"
            ? savedRules
            : deepClone(DEFAULT_CONVERSION_RULES);
    } catch (error) {
        state.baseSkus = [...DEFAULT_BASE_SKUS];
        state.conversionRules = deepClone(DEFAULT_CONVERSION_RULES);
    }
}

function saveConversionConfig() {
    localStorage.setItem(STORAGE_BASE_SKUS, JSON.stringify(state.baseSkus));
    localStorage.setItem(STORAGE_CONVERSION_RULES, JSON.stringify(state.conversionRules));
}

function getConversionFactor(sourceSku, baseSku) {
    return Number(state.conversionRules?.[sourceSku]?.[baseSku]) || 0;
}

function setConversionFactor(sourceSku, baseSku, value) {
    if (!state.conversionRules[sourceSku]) state.conversionRules[sourceSku] = {};
    const number = Math.max(0, Number(value) || 0);
    state.conversionRules[sourceSku][baseSku] = number;
    saveConversionConfig();
}

function hasAnyConversion(sourceSku) {
    return state.baseSkus.some(baseSku => getConversionFactor(sourceSku, baseSku) > 0);
}

function calculateConvertedTotals() {
    const totals = {};
    state.baseSkus.forEach(baseSku => totals[baseSku] = 0);

    state.skuStats.forEach(item => {
        state.baseSkus.forEach(baseSku => {
            totals[baseSku] += item.count * getConversionFactor(item.sku, baseSku);
        });
    });

    return totals;
}

function renderConversionTable() {
    const head = $("skuStatsHead");
    const body = $("skuStatsBody");
    const foot = $("skuStatsFoot");
    const warning = $("conversionWarning");

    head.innerHTML = `
        <tr>
            <th>SKU sản phẩm</th>
            <th>Tên sản phẩm</th>
            <th>Số lượng SKU</th>
            ${state.baseSkus.map(baseSku => `
                <th class="base-sku-header">
                    ${escapeHTML(baseSku)}
                    <button class="remove-base-sku" data-base-sku="${escapeHTML(baseSku)}" title="Xóa cột">×</button>
                </th>
            `).join("")}
            <th>Quy đổi</th>
        </tr>
    `;

    if (!state.skuStats.length) {
        body.innerHTML = `
            <tr><td colspan="${4 + state.baseSkus.length}" class="empty-table">Không có SKU trong các trạng thái đang chọn.</td></tr>
        `;
        foot.innerHTML = "";
        warning.classList.add("hidden");
        bindRemoveBaseSkuButtons();
        return;
    }

    const unmapped = [];

    body.innerHTML = state.skuStats.map(item => {
        const mapped = hasAnyConversion(item.sku);
        if (!mapped) unmapped.push(item.sku);

        return `
            <tr>
                <td><strong>${escapeHTML(item.sku)}</strong></td>
                <td class="product-name-cell">${escapeHTML(item.product)}</td>
                <td class="sku-qty">${formatNumber(item.count)}</td>
                ${state.baseSkus.map(baseSku => {
                    const factor = getConversionFactor(item.sku, baseSku);
                    return `
                        <td>
                            <input
                                class="conversion-input"
                                type="number"
                                min="0"
                                step="1"
                                inputmode="numeric"
                                data-source-sku="${escapeHTML(item.sku)}"
                                data-base-sku="${escapeHTML(baseSku)}"
                                value="${factor === 0 ? "" : factor}"
                                aria-label="${escapeHTML(item.sku)} sang ${escapeHTML(baseSku)}"
                            >
                        </td>
                    `;
                }).join("")}
                <td>
                    ${mapped
                        ? '<span class="sku-mapped">Đã cấu hình</span>'
                        : '<span class="sku-unmapped">Chưa cấu hình</span>'}
                </td>
            </tr>
        `;
    }).join("");

    const totals = calculateConvertedTotals();

    foot.innerHTML = `
        <tr>
            <td><strong>TỔNG QUY ĐỔI</strong></td>
            <td>SL SKU × hệ số quy đổi</td>
            <td>${formatNumber(sum(state.skuStats.map(item => item.count)))}</td>
            ${state.baseSkus.map(baseSku => `
                <td class="conversion-total-highlight">${formatNumber(totals[baseSku] || 0)}</td>
            `).join("")}
            <td></td>
        </tr>
    `;

    if (unmapped.length) {
        warning.classList.remove("hidden");
        warning.innerHTML = `⚠ Có <strong>${unmapped.length}</strong> SKU chưa cấu hình quy đổi: <strong>${unmapped.map(escapeHTML).join(", ")}</strong>. Hãy nhập hệ số ở dòng tương ứng.`;
    } else {
        warning.classList.add("hidden");
        warning.innerHTML = "";
    }

    document.querySelectorAll(".conversion-input").forEach(input => {
        input.addEventListener("focus", () => input.select());

        input.addEventListener("change", () => {
            const raw = String(input.value || "").trim();
            const finalValue = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
            setConversionFactor(input.dataset.sourceSku, input.dataset.baseSku, finalValue);
            rebuildSkuStatistics();
        });
    });

    bindRemoveBaseSkuButtons();
}

function bindRemoveBaseSkuButtons() {
    document.querySelectorAll(".remove-base-sku").forEach(button => {
        button.addEventListener("click", () => {
            const sku = button.dataset.baseSku;
            if (!confirm(`Xóa cột quy đổi ${sku}?`)) return;

            state.baseSkus = state.baseSkus.filter(item => item !== sku);
            Object.values(state.conversionRules).forEach(rule => {
                if (rule && typeof rule === "object") delete rule[sku];
            });

            saveConversionConfig();
            rebuildSkuStatistics();
        });
    });
}

$("btnAddBaseSku").addEventListener("click", () => {
    const value = prompt("Nhập SKU kho / SKU quy đổi muốn thêm:");
    if (!value) return;

    const sku = value.trim().toUpperCase();
    if (!sku) return;

    if (state.baseSkus.some(item => item.toUpperCase() === sku)) {
        alert("SKU quy đổi này đã tồn tại.");
        return;
    }

    state.baseSkus.push(sku);
    saveConversionConfig();
    rebuildSkuStatistics();
});

$("btnResetConversions").addEventListener("click", () => {
    if (!confirm("Khôi phục bảng quy đổi mẫu ban đầu?")) return;

    state.baseSkus = [...DEFAULT_BASE_SKUS];
    state.conversionRules = deepClone(DEFAULT_CONVERSION_RULES);
    saveConversionConfig();
    rebuildSkuStatistics();
    showToast("Đã khôi phục bảng quy đổi mẫu.");
});

function renderConvertedTotals() {
    const body = $("convertedTotalsBody");
    const totals = calculateConvertedTotals();

    const rows = state.baseSkus
        .map(sku => ({ sku, total: totals[sku] || 0 }))
        .filter(item => item.total > 0)
        .sort((a, b) => b.total - a.total);

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="2" class="empty-table">Chưa có dữ liệu quy đổi.</td></tr>';
        return;
    }

    body.innerHTML = rows.map(item => `
        <tr class="total-converted-table">
            <td><strong>${escapeHTML(item.sku)}</strong></td>
            <td class="center">${formatNumber(item.total)}</td>
        </tr>
    `).join("");
}

/* ======================== OVERVIEW + IMPORT SUMMARY ======================== */
function renderOverviewSkuTable() {
    const body = $("overviewSkuBody");
    const data = state.skuStats.slice(0, 10);

    if (!data.length) {
        body.innerHTML = '<tr><td colspan="4" class="empty-table">Chưa có dữ liệu</td></tr>';
        return;
    }

    body.innerHTML = data.map(item => `
        <tr>
            <td><strong>${escapeHTML(item.sku)}</strong></td>
            <td>${escapeHTML(item.product)}</td>
            <td class="center"><strong>${formatNumber(item.count)}</strong></td>
            <td class="center">
                ${hasAnyConversion(item.sku)
                    ? '<span class="status-pill ok">Đã cấu hình</span>'
                    : '<span class="status-pill warn">Chưa cấu hình</span>'}
            </td>
        </tr>
    `).join("");
}

function renderOverviewFileSummary() {
    $("overviewFileName").textContent = state.fileName || "Chưa nhập file";

    if (!state.skuRows.length) {
        $("overviewFileSummary").innerHTML = '<div class="empty-box">Chọn file đơn hàng gốc Shopee để bắt đầu.</div>';
        return;
    }

    const statuses = new Set(state.skuRows.map(row => row.status));
    const rawSkus = new Set(state.skuRows.map(row => row.sku));

    $("overviewFileSummary").innerHTML = `
        <div class="summary-row"><span>Dòng SKU đọc được</span><strong>${formatNumber(state.skuRows.length)}</strong></div>
        <div class="summary-row"><span>Trạng thái khác nhau</span><strong>${formatNumber(statuses.size)}</strong></div>
        <div class="summary-row"><span>SKU khác nhau trong file</span><strong>${formatNumber(rawSkus.size)}</strong></div>
    `;
}

function renderImportSummary() {
    const statuses = new Set(state.skuRows.map(row => row.status));
    const rawSkus = new Set(state.skuRows.map(row => row.sku));

    $("importOrderCount").textContent = formatNumber(state.skuRows.length);
    $("importStatusCount").textContent = formatNumber(statuses.size);
    $("importRawSkuCount").textContent = formatNumber(rawSkus.size);
}

function renderTopFileState() {
    const pill = $("topFilePill");
    const text = $("topFileText");

    if (state.fileName) {
        pill.classList.add("loaded");
        text.textContent = state.fileName;
    } else {
        pill.classList.remove("loaded");
        text.textContent = "Chưa có file Shopee";
    }
}


/* ======================== ĐƠN HÀNG + HOÀN/HỦY ======================== */
function buildUniqueOrderCount() {
    const ids = new Set(
        state.skuRows
            .map(row => String(row.orderId || "").trim())
            .filter(Boolean)
    );
    return ids.size;
}

function isReturnOrCancelStatus(status) {
    const text = normalizeText(status);
    return (
        text.includes("trahang") ||
        text.includes("hoantra") ||
        text.includes("refund") ||
        text.includes("returned") ||
        text.includes("dahuy") ||
        text.includes("huy") ||
        text.includes("cancel")
    );
}

function renderOrdersTab() {
    const body = $("orderTableBody");
    const summary = $("orderTableSummary");
    if (!body || !summary) return;

    let data = [...state.skuRows];
    const search = normalizeText($("orderSearch")?.value || "");

    if (search) {
        data = data.filter(row =>
            normalizeText(
                `${row.orderId} ${row.sku} ${row.product} ${row.status}`
            ).includes(search)
        );
    }

    summary.textContent = `${formatNumber(data.length)} dòng sản phẩm · ${formatNumber(buildUniqueOrderCount())} mã đơn`;

    if (!data.length) {
        body.innerHTML = `<tr><td colspan="5" class="empty-table">${state.skuRows.length ? "Không tìm thấy dữ liệu phù hợp." : "Hãy nhập file Shopee trước."}</td></tr>`;
        return;
    }

    body.innerHTML = data.map(row => `
        <tr>
            <td><strong>${escapeHTML(row.orderId || "-")}</strong></td>
            <td>${escapeHTML(row.status || "-")}</td>
            <td><strong>${escapeHTML(row.sku)}</strong></td>
            <td>${escapeHTML(row.product || "")}</td>
            <td class="center">${formatNumber(row.quantity || 0)}</td>
        </tr>
    `).join("");
}

function renderReturnsTab() {
    const body = $("returnTableBody");
    const summary = $("returnTableSummary");
    if (!body || !summary) return;

    const data = state.skuRows.filter(row => isReturnOrCancelStatus(row.status));
    const uniqueOrders = new Set(data.map(row => row.orderId).filter(Boolean)).size;

    summary.textContent = `${formatNumber(data.length)} dòng · ${formatNumber(uniqueOrders)} mã đơn`;

    if (!data.length) {
        body.innerHTML = `<tr><td colspan="5" class="empty-table">${state.skuRows.length ? "Không có đơn hoàn / hủy trong file đang nhập." : "Hãy nhập file Shopee trước."}</td></tr>`;
        return;
    }

    body.innerHTML = data.map(row => `
        <tr>
            <td><strong>${escapeHTML(row.orderId || "-")}</strong></td>
            <td>${escapeHTML(row.status || "-")}</td>
            <td><strong>${escapeHTML(row.sku)}</strong></td>
            <td>${escapeHTML(row.product || "")}</td>
            <td class="center">${formatNumber(row.quantity || 0)}</td>
        </tr>
    `).join("");
}

function refreshNavCounts() {
    const navOrder = $("navOrderCount");
    const navReturn = $("navReturnCount");

    if (navOrder) navOrder.textContent = formatNumber(buildUniqueOrderCount());

    if (navReturn) {
        const returnOrders = new Set(
            state.skuRows
                .filter(row => isReturnOrCancelStatus(row.status))
                .map(row => row.orderId)
                .filter(Boolean)
        );
        navReturn.textContent = formatNumber(returnOrders.size);
    }
}

if ($("orderSearch")) {
    $("orderSearch").addEventListener("input", renderOrdersTab);
}

/* ======================== EXPORT ======================== */
$("btnExportSku").addEventListener("click", () => {
    if (!state.skuStats.length) {
        alert("Chưa có dữ liệu SKU để xuất.");
        return;
    }

    const totals = calculateConvertedTotals();
    const detail = state.skuStats.map(item => {
        const row = {
            "SKU sản phẩm": item.sku,
            "Tên sản phẩm": item.product,
            "Số lượng SKU": item.count
        };

        state.baseSkus.forEach(baseSku => {
            row[baseSku] = getConversionFactor(item.sku, baseSku) || "";
        });

        row["Trạng thái quy đổi"] = hasAnyConversion(item.sku) ? "Đã cấu hình" : "Chưa cấu hình";
        return row;
    });

    const totalRow = {
        "SKU sản phẩm": "TỔNG QUY ĐỔI",
        "Tên sản phẩm": "SL SKU × hệ số quy đổi",
        "Số lượng SKU": sum(state.skuStats.map(item => item.count))
    };

    state.baseSkus.forEach(baseSku => {
        totalRow[baseSku] = totals[baseSku] || 0;
    });

    detail.push(totalRow);

    const converted = state.baseSkus.map(baseSku => ({
        "SKU kho / SKU quy đổi": baseSku,
        "Tổng số lượng cần chuẩn bị": totals[baseSku] || 0
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detail), "THONG KE SKU");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(converted), "TONG QUY DOI");
    XLSX.writeFile(workbook, "THONG_KE_QUY_DOI_SKU_SHOPEE.xlsx");
});

/* ======================== ACTIONS ======================== */
$("btnOpenSkuStats").addEventListener("click", () => {
    if (!state.skuRows.length) {
        alert("Hãy chọn file đơn hàng gốc Shopee trước.");
        return;
    }
    openView("sku-stats");
});

$("btnReset").addEventListener("click", () => {
    if (!confirm("Xóa file và toàn bộ dữ liệu đang thống kê? Bảng hệ số quy đổi vẫn được giữ lại.")) return;

    state.fileName = "";
    state.skuRows = [];
    state.skuStats = [];
    state.selectedStatuses.clear();
    state.statusFilterInitialized = false;
    $("orderFile").value = "";
    $("orderFileStatus").textContent = "Chưa có file";
    $("orderFileStatus").className = "upload-file-status";

    renderAll();
    openView("overview");
    showToast("Đã xóa dữ liệu đang nhập.");
});

/* ======================== TOAST ======================== */
let toastTimer;
function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

/* ======================== RENDER ALL ======================== */
function renderAll() {
    renderTopFileState();
    renderImportSummary();
    renderStatusFilters();
    rebuildSkuStatistics();
    renderOverviewFileSummary();
    renderOrdersTab();
    renderReturnsTab();
    refreshNavCounts();
}

loadConversionConfig();
renderAll();
openView("overview");
