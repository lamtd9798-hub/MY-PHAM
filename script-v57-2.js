window.addEventListener("error", event => {
    console.error("RUCOS runtime error:", event.error || event.message);
    let box = document.getElementById("runtimeErrorBox");
    if (!box) {
        box = document.createElement("div");
        box.id = "runtimeErrorBox";
        box.className = "runtime-error";
        document.body.appendChild(box);
    }
    box.textContent = "Lỗi chương trình: " + (event.message || "Không xác định") + ". Hãy chụp màn hình thông báo này gửi lại để kiểm tra.";
});

/* =========================================================
   RUCOS - SHOPEE SKU STATISTICS V4
   Chỉ tập trung: nhập file Shopee -> lọc trạng thái -> thống kê -> quy đổi
========================================================= */

const state = {
    // File nhập gần nhất
    fileName: "",

    // Toàn bộ dữ liệu đã lưu từ nhiều lần upload
    skuRows: [],
    imports: [],
    skuStats: [],

    // Bộ lọc trạng thái
    selectedStatuses: new Set(),
    statusFilterInitialized: false,

    // Ngày báo cáo đang xem
    selectedDates: new Set(),
    dateFilterInitialized: false,

    // Bộ lọc riêng cho từng ca khi nhập file
    shiftFilters: {
        morning: {
            sourceDate: "",
            sourceDates: new Set(),
            statuses: new Set()
        },
        afternoon: {
            sourceDate: "",
            sourceDates: new Set(),
            statuses: new Set()
        }
    },
    activeShiftTab: "morning",

    countMode: "rows",
    baseSkus: [],
    conversionRules: {},

    // Supabase Cloud
    user: null,
    cloudReady: false,

    // V40 - phân quyền
    userRole: "NHAN_VIEN",
    roleSource: "default",
    roleLoaded: false
};

const INVENTORY_LOCAL_KEY = "rucos_inventory_v28";
const DB_INVENTORY_ITEMS = "inventory_items";
const DB_INVENTORY_STOCKTAKES = "inventory_stocktakes";
const DB_INVENTORY_TRANSACTIONS = "inventory_transactions";
const DB_INVENTORY_TRANSIT_SNAPSHOTS = "inventory_transit_snapshots";
const DB_INVENTORY_TRANSIT_ROWS = "inventory_transit_rows";
const DB_INVENTORY_RETURN_RECEIPTS = "inventory_return_receipts";

// V39 - Lịch sử hóa đơn Cloud
const DB_INVOICE_IMPORTS = "invoice_imports";
const DB_INVOICE_GROUPS = "invoice_groups";
const DB_INVOICE_LINES = "invoice_lines";
const DB_INVOICE_ORDER_LINKS = "invoice_order_links";

// V54 - danh sách trạng thái hóa đơn MISA có Mã ĐH của sàn.
const DB_MISA_ORDER_IMPORTS_V54 = "misa_order_invoice_imports";
const DB_MISA_ORDER_ROWS_V54 = "misa_order_invoice_rows";

const inventoryState = {
    items: [],
    stocktakes: [],
    transactions: [],
    loaded: false,
    cloudReady: false,
    mode: "local",
    movementRows: [],
    activeTab: "overview",
    reconcileCounts: {},
    currentDate: "",
    reconcileDate: "",
    misaAssignment: null,
    transitSnapshot: null,
    transitCloudReady: false,

    // V51 - xác nhận hàng hoàn thực sự nhập lại kho.
    returnReceipts: [],
    returnReceiptCloudReady: false
};

const DEFAULT_INVENTORY_ITEMS = [
    { itemCode: "WH-REWD", name: "Kem nách", shopeeSku: "REWD", invoiceKeyword: "Extra White & Deodorant Cream 35g", openingQty: 5248, physicalQty: 1246, safetyStock: 200, unitPrice: 178000, stocktakeDate: "2026-08-13", sortOrder: 1 },
    { itemCode: "WH-REWS", name: "Smooth", shopeeSku: "REWS", invoiceKeyword: "Extra White & Smooth Cream 80g", openingQty: 0, physicalQty: 550, safetyStock: 100, unitPrice: 178000, stocktakeDate: "2026-08-13", sortOrder: 2 },
    { itemCode: "WH-RTB", name: "Tranex Brightening", shopeeSku: "RTB", invoiceKeyword: "Tranex Brightening Body Cream 200g", openingQty: 706, physicalQty: 801, safetyStock: 150, unitPrice: 360000, stocktakeDate: "2026-08-13", sortOrder: 3 },
    { itemCode: "WH-RHBS", name: "TDC đường đen mật ong", shopeeSku: "RHBS", invoiceKeyword: "Honey Black Sugar Body Scrub 450g", openingQty: 493, physicalQty: 398, safetyStock: 80, unitPrice: 157000, stocktakeDate: "2026-08-13", sortOrder: 4 },
    { itemCode: "WH-RKN", name: "Kem nghệ", shopeeSku: "RKN", invoiceKeyword: "Curcumin Cream 80g", openingQty: 110, physicalQty: 442, safetyStock: 100, unitPrice: 105000, stocktakeDate: "2026-08-13", sortOrder: 5 },
    { itemCode: "WH-SER120", name: "Serum 120ml", shopeeSku: "", invoiceKeyword: "", openingQty: 23, physicalQty: 23, safetyStock: 10, unitPrice: 206000, stocktakeDate: "2026-08-13", sortOrder: 6 },
    { itemCode: "WH-REWGS", name: "Serum 250ml", shopeeSku: "REWGS", invoiceKeyword: "Extra White & Glow Serum 250ml", openingQty: 84, physicalQty: 39, safetyStock: 20, unitPrice: 395000, stocktakeDate: "2026-08-13", sortOrder: 7 },
    { itemCode: "WH-LOT120", name: "Lotion 120ml", shopeeSku: "", invoiceKeyword: "", openingQty: 0, physicalQty: 0, safetyStock: 10, unitPrice: 206000, stocktakeDate: "2026-08-13", sortOrder: 8 },
    { itemCode: "WH-LOT250", name: "Lotion 250ml", shopeeSku: "", invoiceKeyword: "", openingQty: 0, physicalQty: 0, safetyStock: 10, unitPrice: 395000, stocktakeDate: "2026-08-13", sortOrder: 9 },
    { itemCode: "WH-RCS", name: "Lăn nách", shopeeSku: "RCS", invoiceKeyword: "Confidence Stick 25ml", openingQty: 4995, physicalQty: 1513, safetyStock: 250, unitPrice: 198000, stocktakeDate: "2026-08-13", sortOrder: 10 },
    { itemCode: "WH-ROE", name: "Body oil", shopeeSku: "ROE", invoiceKeyword: "Retinol Oil Essence 160ml", openingQty: 706, physicalQty: 516, safetyStock: 100, unitPrice: 378000, stocktakeDate: "2026-08-13", sortOrder: 11 },
    { itemCode: "WH-COMBO", name: "Combo oil + mist", shopeeSku: "", invoiceKeyword: "", openingQty: 285, physicalQty: 151, safetyStock: 50, unitPrice: 520000, stocktakeDate: "2026-08-13", sortOrder: 12 }
];

const DEFAULT_BASE_SKUS = [
    "RTB",
    "REWD",
    "ROE",
    "OBM-100326-2",
    "REWGS",
    "RKN",
    "REWS",
    "RCS",
    "RHBS"
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
    RCS: { RCS: 1 },

    // [Combo 6] Body Oil + Confidence Stick
    "R-CB06": { ROE: 1, RCS: 1 },

    // Honey Black Sugar Body Scrub
    RHBS: { RHBS: 1 }
};


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
        title: "Thống kê SKU theo ngày",
        subtitle: "Chọn năm → chọn ngày → upload file Sáng / Chiều → lọc và quy đổi"
    },
    "invoice-stats": {
        title: "Thống kê hóa đơn",
        subtitle: "Upload bảng kê hóa đơn → gom theo tên hàng → tổng hợp số lượng và giá trị"
    },
    "inventory-flow": {
        title: "Tồn kho & luân chuyển",
        subtitle: "Theo dõi tồn kho thực tế → hàng giữ đơn → đang giao → đã giao → hóa đơn MISA"
    },
    history: {
        title: "Lịch sử thống kê",
        subtitle: "Xem lại từng ngày báo cáo, cấu hình buổi sáng / buổi chiều và bảng tổng"
    },
    orders: {
        title: "Đơn hàng Shopee",
        subtitle: "Danh sách dữ liệu đọc trực tiếp từ file đơn hàng Shopee"
    },
    fees: {
        title: "Phí sàn & tài chính Shopee",
        subtitle: "Upload file tài chính → phân tích phí → thực nhận → lưu Cloud"
    },
    returns: {
        title: "Hoàn / Hủy & nhập lại kho",
        subtitle: "Theo dõi hàng hoàn đang về → xác nhận thực nhận → cộng lại tồn kho đúng thời điểm"
    },
    payments: {
        title: "Thanh toán Shopee",
        subtitle: "Theo dõi các đợt settlement, số tiền đã/chờ thanh toán và đơn chưa thấy trong file"
    },
    issues: {
        title: "Sai lệch tài chính",
        subtitle: "Phát hiện thiếu mã đơn, đơn không khớp Cloud, chênh công thức và đơn đã giao chưa thấy tài chính"
    }
};

const ALIASES = {
    orderId: ["Mã đơn hàng", "Mã đơn", "Order ID", "Shopee Order ID"],

    // File Order.all... của Shopee: cột C = Ngày đặt hàng
    orderDate: ["Ngày đặt hàng", "Ngày tạo đơn", "Order Creation Date", "Order Date", "Ngày"],

    status: ["Trạng Thái Đơn Hàng", "Trạng thái đơn hàng", "Trạng thái", "Order Status"],
    sku: ["SKU sản phẩm", "SKU", "Seller SKU", "Product SKU"],
    product: ["Tên sản phẩm", "Sản phẩm", "Product Name", "Tên hàng"],
    quantity: ["Số lượng", "Quantity", "SL"]
};

const SHOPEE_STATUS_OPTIONS = [
    "Chờ giao hàng",
    "Chờ xác nhận",
    "Đã giao",
    "Đã hủy",
    "Đang giao",
    "Người mua xác nhận đã nhận được hàng, tuy nhiên Người mua vẫn có thể gửi yêu cầu Trả hàng/Hoàn tiền"
];

const DEFAULT_SHIFT_STATUSES = [
    "Đang giao",
    "Đã giao",
    "Người mua xác nhận đã nhận được hàng, tuy nhiên Người mua vẫn có thể gửi yêu cầu Trả hàng/Hoàn tiền"
];

function createDefaultShiftStatusSet() {
    return new Set(DEFAULT_SHIFT_STATUSES);
}

// V57.0 - Lưu nhiều NGÀY ĐƠN trong cột selected_statuses hiện có để không cần đổi SQL.
// Marker này chỉ là metadata nội bộ, không bao giờ hiển thị như một trạng thái Shopee.
const SHIFT_DATE_MARKER = "__RUCOS_DATE__:";

function normalizeShiftDateList(values, fallbackDate = "") {
    const list = Array.isArray(values) ? values : [...(values || [])];
    const result = [...new Set(list.map(String).map(x => x.trim()).filter(Boolean))].sort();
    if (!result.length && fallbackDate) result.push(fallbackDate);
    return result;
}

function encodeShiftStoredStatuses(statuses, sourceDates) {
    const cleanStatuses = [...(statuses || [])]
        .map(String)
        .filter(value => value && !value.startsWith(SHIFT_DATE_MARKER));

    const dateMarkers = normalizeShiftDateList(sourceDates)
        .map(dateKey => `${SHIFT_DATE_MARKER}${dateKey}`);

    return [...cleanStatuses, ...dateMarkers];
}

function decodeShiftStoredConfig(values, fallbackSourceDate = "") {
    const raw = Array.isArray(values) ? values.map(String) : [];
    const statuses = raw.filter(value => !value.startsWith(SHIFT_DATE_MARKER));
    const sourceDates = raw
        .filter(value => value.startsWith(SHIFT_DATE_MARKER))
        .map(value => value.slice(SHIFT_DATE_MARKER.length))
        .filter(Boolean);

    return {
        statuses,
        sourceDates: normalizeShiftDateList(sourceDates, fallbackSourceDate)
    };
}

function getShiftSelectedDates(filter) {
    if (!(filter.sourceDates instanceof Set)) {
        const values = Array.isArray(filter.sourceDates) ? filter.sourceDates : [];
        filter.sourceDates = new Set(normalizeShiftDateList(values, filter.sourceDate || ""));
    }

    // Giữ sourceDate cũ để tương thích với các bản trước và các chỗ chưa nâng cấp.
    filter.sourceDate = [...filter.sourceDates].sort()[0] || "";
    return filter.sourceDates;
}

function setShiftSelectedDates(filter, values) {
    filter.sourceDates = new Set(normalizeShiftDateList(values));
    filter.sourceDate = [...filter.sourceDates].sort()[0] || "";
}

function shiftDateMatches(filter, sourceOrderDate) {
    const selected = getShiftSelectedDates(filter);
    return !selected.size || selected.has(sourceOrderDate);
}

function formatShiftSelectedDates(filter, fallbackDate = "") {
    const dates = [...getShiftSelectedDates(filter)].sort();
    if (!dates.length && fallbackDate) return formatDateLabel(fallbackDate);
    return dates.map(formatDateLabel).join(" + ");
}


/* ======================== SUPABASE CLOUD ======================== */
const APP_VERSION = "V57.2";
const APP_BUILD_DATE = "2026-08-17";
const APP_CACHE_VERSION = "572";

const systemHealthStateV38 = {
    running: false,
    checkedAt: "",
    checks: []
};

const SUPABASE_URL = "https://mnqwnnxmemegruwtyyox.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fmlR3AtJuEiqqNMLp7nCMQ_0FNiyBIr";

const DB_ROWS = "shopee_rows";
const DB_IMPORTS = "imports";
const DB_TARGETS = "conversion_targets";
const DB_RULES = "conversion_rules";
const BOOTSTRAP_ADMIN_EMAIL = "lamtd9798@gmail.com";

let supabaseClient = null;

function initSupabaseClient() {
    if (!window.supabase?.createClient) {
        throw new Error("Không tải được thư viện Supabase.");
    }

    if (!supabaseClient) {
        supabaseClient = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY,
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            }
        );
    }

    return supabaseClient;
}

function setCloudStatus(message, mode = "ok") {
    const badge = document.querySelector(".saved-db-badge");
    if (!badge) return;

    badge.textContent = message;
    badge.classList.remove("syncing", "error");

    if (mode === "syncing") badge.classList.add("syncing");
    if (mode === "error") badge.classList.add("error");
}

async function cloudSelectAll(tableName, orderColumn = null) {
    const client = initSupabaseClient();
    const pageSize = 1000;
    let from = 0;
    const result = [];

    while (true) {
        let query = client
            .from(tableName)
            .select("*")
            .range(from, from + pageSize - 1);

        if (orderColumn) {
            query = query.order(orderColumn, { ascending: true });
        }

        const { data, error } = await query;
        if (error) throw error;

        const batch = data || [];
        result.push(...batch);

        if (batch.length < pageSize) break;
        from += pageSize;
    }

    return result;
}

function cloudRowToState(row) {
    return {
        rowKey: row.row_key,

        // orderDate trong giao diện = NGÀY THỐNG KÊ do người dùng chọn.
        orderDate: row.report_date || row.order_date || "",
        reportDate: row.report_date || row.order_date || "",

        // Ngày thực tế đọc từ file Shopee vẫn được giữ riêng.
        sourceOrderDate: row.order_date || "",
        orderDateRaw: row.order_date || "",

        importSlot: row.import_slot || "",
        orderId: row.order_id || "",
        status: row.status || "",
        sku: row.sku || "",
        product: row.product || "",
        quantity: Number(row.quantity || 0),
        sourceFile: row.source_file || "",
        updatedAt: row.updated_at || ""
    };
}

function cloudImportToState(info) {
    const decodedFilter = decodeShiftStoredConfig(
        info.selected_statuses,
        info.source_date || ""
    );

    return {
        hash: info.file_hash,
        fileName: info.file_name || "",
        fileSize: Number(info.file_size || 0),
        importedAt: info.imported_at || "",
        rowCount: Number(info.row_count || 0),
        added: Number(info.added || 0),
        updated: Number(info.updated || 0),
        unchanged: Number(info.unchanged || 0),
        dates: Array.isArray(info.dates) ? info.dates : [],
        reportDate: info.report_date || (Array.isArray(info.dates) && info.dates.length === 1 ? info.dates[0] : ""),
        importSlot: info.import_slot || "",
        sourceDate: decodedFilter.sourceDates[0] || info.source_date || "",
        sourceDates: decodedFilter.sourceDates,
        selectedStatuses: decodedFilter.statuses,
        savedAllRows: Boolean(info.saved_all_rows)
    };
}


function inventoryDbRowToState(row) {
    return {
        itemCode: row.item_code || "",
        name: row.name || "",
        shopeeSku: row.shopee_sku || "",
        invoiceKeyword: row.invoice_keyword || "",
        openingQty: Number(row.opening_qty || 0),
        physicalQty: Number(row.physical_qty || 0),
        safetyStock: Number(row.safety_stock || 0),
        leadTimeDays: Number(row.lead_time_days ?? 5),
        targetCoverDays: Number(row.target_cover_days ?? 14),
        unitPrice: Number(row.unit_price || 0),
        stocktakeDate: row.stocktake_date || "",
        sortOrder: Number(row.sort_order || 0),
        active: row.is_active !== false,
        updatedAt: row.updated_at || ""
    };
}

function inventoryStateToDbRow(item) {
    return {
        item_code: item.itemCode,
        name: item.name,
        shopee_sku: item.shopeeSku || null,
        invoice_keyword: item.invoiceKeyword || null,
        opening_qty: Number(item.openingQty || 0),
        physical_qty: Number(item.physicalQty || 0),
        safety_stock: Number(item.safetyStock || 0),
        lead_time_days: Math.max(0, Number(item.leadTimeDays ?? 5)),
        target_cover_days: Math.max(1, Number(item.targetCoverDays ?? 14)),
        unit_price: Number(item.unitPrice || 0),
        stocktake_date: item.stocktakeDate || null,
        sort_order: Number(item.sortOrder || 0),
        is_active: item.active !== false,
        updated_by: state.user?.id || null,
        updated_at: new Date().toISOString()
    };
}

function saveInventoryLocal() {
    try {
        localStorage.setItem(
            INVENTORY_LOCAL_KEY,
            JSON.stringify({
                items: inventoryState.items,
                stocktakes: inventoryState.stocktakes,
                transactions: inventoryState.transactions,
                transitSnapshot: inventoryState.transitSnapshot,
                returnReceipts: inventoryState.returnReceipts
            })
        );
    } catch (error) {
        console.warn("Không lưu được tồn kho cục bộ", error);
    }
}

function loadInventoryLocal() {
    try {
        const saved = JSON.parse(localStorage.getItem(INVENTORY_LOCAL_KEY) || "null");
        if (saved && Array.isArray(saved.items) && saved.items.length) {
            inventoryState.items = saved.items;
            inventoryState.stocktakes = Array.isArray(saved.stocktakes) ? saved.stocktakes : [];
            inventoryState.transactions = Array.isArray(saved.transactions) ? saved.transactions : [];
            inventoryState.transitSnapshot = saved.transitSnapshot || null;
            inventoryState.returnReceipts = Array.isArray(saved.returnReceipts) ? saved.returnReceipts : [];
        } else {
            inventoryState.items = DEFAULT_INVENTORY_ITEMS.map(item => ({ ...item }));
            inventoryState.stocktakes = [];
            inventoryState.transactions = [];
            inventoryState.transitSnapshot = null;
            inventoryState.returnReceipts = [];
            saveInventoryLocal();
        }
    } catch (error) {
        inventoryState.items = DEFAULT_INVENTORY_ITEMS.map(item => ({ ...item }));
        inventoryState.stocktakes = [];
        inventoryState.transactions = [];
        inventoryState.transitSnapshot = null;
        inventoryState.returnReceipts = [];
    }
    inventoryState.loaded = true;
    inventoryState.cloudReady = false;
    inventoryState.mode = "local";
}


async function loadLatestInventoryTransitSnapshot(client) {
    inventoryState.transitCloudReady = false;

    try {
        const { data: snapshots, error: snapshotError } = await client
            .from(DB_INVENTORY_TRANSIT_SNAPSHOTS)
            .select("*")
            .order("imported_at", { ascending: false })
            .limit(1);

        if (snapshotError) throw snapshotError;

        const snapshot = snapshots?.[0];

        if (!snapshot) {
            inventoryState.transitSnapshot = null;
            inventoryState.transitCloudReady = true;
            return;
        }

        const { data: rows, error: rowError } = await client
            .from(DB_INVENTORY_TRANSIT_ROWS)
            .select("*")
            .eq("snapshot_id", snapshot.id)
            .order("row_no", { ascending: true });

        if (rowError) throw rowError;

        inventoryState.transitSnapshot = {
            id: snapshot.id,
            snapshotDate: snapshot.snapshot_date || "",
            importedAt: snapshot.imported_at || "",
            fileName: snapshot.file_name || "",
            rowCount: Number(snapshot.row_count || 0),
            orderCount: Number(snapshot.order_count || 0),
            statusCounts: snapshot.status_counts || {},
            rows: (rows || []).map(row => ({
                rowNumber: Number(row.row_no || 0),
                orderId: row.order_id || "",
                orderDate: row.order_date || "",
                orderDateRaw: row.order_date || "",
                status: row.status || "",
                sku: row.sku || "",
                product: row.product || "",
                quantity: Number(row.quantity || 0),
                sourceFile: snapshot.file_name || "",
                snapshotDate: snapshot.snapshot_date || "",
                updatedAt: snapshot.imported_at || ""
            }))
        };

        inventoryState.transitCloudReady = true;
        saveInventoryLocal();
    } catch (error) {
        console.warn("Transit snapshot Cloud chưa sẵn sàng:", error);
        inventoryState.transitCloudReady = false;
        // Giữ snapshot local cũ nếu có, tránh làm hỏng toàn bộ module tồn kho.
    }
}


async function loadInventoryReturnReceiptsV51(client = null) {
    inventoryState.returnReceiptCloudReady = false;

    if (!state.user) {
        return inventoryState.returnReceipts || [];
    }

    try {
        const supabase = client || initSupabaseClient();
        const { data, error } = await supabase
            .from(DB_INVENTORY_RETURN_RECEIPTS)
            .select("*")
            .order("received_date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(3000);

        if (error) throw error;

        inventoryState.returnReceipts = (data || []).map(row => ({
            id: row.id || "",
            orderId: row.order_id || "",
            itemCode: row.item_code || "",
            quantity: Number(row.quantity || 0),
            receivedDate: row.received_date || "",
            sourceStatus: row.source_status || "",
            note: row.note || "",
            transactionId: row.transaction_id || "",
            confirmedBy: row.confirmed_by || "",
            confirmedEmail: row.confirmed_email || "",
            createdAt: row.created_at || ""
        }));

        inventoryState.returnReceiptCloudReady = true;
        saveInventoryLocal();
        return inventoryState.returnReceipts;
    } catch (error) {
        console.warn("V51 return receipts Cloud chưa sẵn sàng:", error);
        inventoryState.returnReceiptCloudReady = false;
        return inventoryState.returnReceipts || [];
    }
}

async function loadInventoryData() {
    if (!state.user) {
        loadInventoryLocal();
        return;
    }

    try {
        const client = initSupabaseClient();
        const [
            { data: itemRows, error: itemError },
            { data: stocktakeRows, error: stocktakeError },
            { data: transactionRows, error: transactionError }
        ] = await Promise.all([
            client.from(DB_INVENTORY_ITEMS).select("*").order("sort_order", { ascending: true }),
            client.from(DB_INVENTORY_STOCKTAKES).select("*").order("stocktake_date", { ascending: false }).limit(1200),
            client.from(DB_INVENTORY_TRANSACTIONS).select("*").order("transaction_date", { ascending: false }).limit(3000)
        ]);

        if (itemError) throw itemError;
        if (stocktakeError) throw stocktakeError;
        if (transactionError) throw transactionError;

        inventoryState.items = (itemRows || []).map(inventoryDbRowToState);
        inventoryState.stocktakes = stocktakeRows || [];
        inventoryState.transactions = (transactionRows || []).map(row => ({
            id: row.id || "",
            transactionDate: row.transaction_date || "",
            itemCode: row.item_code || "",
            type: row.transaction_type || "",
            quantity: Number(row.quantity || 0),
            reference: row.reference || "",
            note: row.note || "",
            source: row.source || "manual",
            createdBy: row.created_by || "",
            createdAt: row.created_at || ""
        }));

        if (!inventoryState.items.length) {
            inventoryState.items = DEFAULT_INVENTORY_ITEMS.map(item => ({ ...item }));
            const { error } = await client.from(DB_INVENTORY_ITEMS).upsert(
                inventoryState.items.map(inventoryStateToDbRow),
                { onConflict: "item_code" }
            );
            if (error) throw error;
        }

        inventoryState.loaded = true;
        inventoryState.cloudReady = true;
        inventoryState.mode = "cloud";

        await loadLatestInventoryTransitSnapshot(client);
        await loadInventoryReturnReceiptsV51(client);
        saveInventoryLocal();

        // V45: badge menu tồn kho phải hiện ngay sau khi tải Cloud,
        // không cần chờ người dùng mở tab Tồn kho.
        if ($("navInventoryCount")) {
            $("navInventoryCount").textContent = formatNumber(
                inventoryState.items.filter(item => item.active !== false).length
            );
        }
    } catch (error) {
        console.warn("Inventory Cloud chưa sẵn sàng, dùng LocalStorage:", error);
        loadInventoryLocal();

        if ($("navInventoryCount")) {
            $("navInventoryCount").textContent = formatNumber(
                inventoryState.items.filter(item => item.active !== false).length
            );
        }
    }
}

async function saveInventoryItems({ createStocktake = true } = {}) {
    assertPermissionV40("INVENTORY_WRITE");
    inventoryState.items = inventoryState.items
        .filter(item => item.name && item.itemCode)
        .map((item, index) => ({ ...item, sortOrder: index + 1 }));

    saveInventoryLocal();

    let stocktakePayload = [];

    if (createStocktake && inventoryState.items.length) {
        stocktakePayload = inventoryState.items.map(item => ({
            stocktake_date: item.stocktakeDate || getLocalTodayKey(),
            item_code: item.itemCode,
            physical_qty: Number(item.physicalQty || 0),
            unit_price: Number(item.unitPrice || 0),
            note: "Cập nhật tồn thực tế từ RUCOS",
            created_by: state.user?.id || null
        }));
    }

    if (inventoryState.cloudReady && state.user) {
        const client = initSupabaseClient();
        const payload = inventoryState.items.map(inventoryStateToDbRow);

        const { error } = await client
            .from(DB_INVENTORY_ITEMS)
            .upsert(payload, { onConflict: "item_code" });

        if (error) throw error;

        if (stocktakePayload.length) {
            const { data: inserted, error: stocktakeError } = await client
                .from(DB_INVENTORY_STOCKTAKES)
                .insert(stocktakePayload)
                .select("*");

            if (stocktakeError) throw stocktakeError;
            inventoryState.stocktakes.unshift(...(inserted || []));
        }
    } else if (stocktakePayload.length) {
        const now = new Date().toISOString();

        inventoryState.stocktakes.unshift(
            ...stocktakePayload.map((row, index) => ({
                id: `local-stocktake-${Date.now()}-${index}`,
                ...row,
                created_at: now
            }))
        );
    }

    saveInventoryLocal();
}

async function dbGetAll(storeName) {
    if (storeName === DB_ROWS) {
        return (await cloudSelectAll(DB_ROWS, "report_date")).map(cloudRowToState);
    }

    if (storeName === DB_IMPORTS) {
        return (await cloudSelectAll(DB_IMPORTS, "imported_at")).map(cloudImportToState);
    }

    return await cloudSelectAll(storeName);
}

async function dbGet(storeName, key) {
    const client = initSupabaseClient();
    const keyColumn =
        storeName === DB_ROWS ? "row_key" :
        storeName === DB_IMPORTS ? "file_hash" :
        storeName === DB_TARGETS ? "target_sku" :
        null;

    if (!keyColumn) return null;

    const { data, error } = await client
        .from(storeName)
        .select("*")
        .eq(keyColumn, key)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    if (storeName === DB_ROWS) return cloudRowToState(data);
    if (storeName === DB_IMPORTS) return cloudImportToState(data);
    return data;
}

async function dbPutManyRows(rows) {
    if (!rows.length) return;

    const client = initSupabaseClient();
    const chunkSize = 400;

    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize).map(row => ({
            row_key: row.rowKey,

            // Ngày có trong file Shopee.
            order_date: row.sourceOrderDate || null,

            // Ngày người dùng chọn trước khi upload.
            report_date: row.reportDate || row.orderDate || null,
            import_slot: row.importSlot || null,

            order_id: row.orderId || null,
            status: row.status || null,
            sku: row.sku,
            product: row.product || null,
            quantity: Number(row.quantity || 0),
            source_file: row.sourceFile || null,
            updated_at: row.updatedAt || new Date().toISOString()
        }));

        const { error } = await client
            .from(DB_ROWS)
            .upsert(chunk, { onConflict: "row_key" });

        if (error) throw error;
    }
}

async function dbPutImport(importInfo) {
    const client = initSupabaseClient();

    const payload = {
        file_hash: importInfo.hash,
        file_name: importInfo.fileName,
        file_size: importInfo.fileSize,
        imported_at: importInfo.importedAt,
        row_count: importInfo.rowCount,
        added: importInfo.added,
        updated: importInfo.updated,
        unchanged: importInfo.unchanged,
        dates: importInfo.dates || [],
        report_date: importInfo.reportDate || null,
        import_slot: importInfo.importSlot || null,
        source_date: importInfo.sourceDate || null,
        selected_statuses: encodeShiftStoredStatuses(
            importInfo.selectedStatuses || [],
            importInfo.sourceDates || (importInfo.sourceDate ? [importInfo.sourceDate] : [])
        ),
        saved_all_rows: Boolean(importInfo.savedAllRows)
    };

    const { error } = await client
        .from(DB_IMPORTS)
        .upsert(payload, { onConflict: "file_hash" });

    if (error) throw error;
}

async function dbClearAllSavedData() {
    const client = initSupabaseClient();

    const { error: rowsError } = await client
        .from(DB_ROWS)
        .delete()
        .neq("row_key", "__never__");

    if (rowsError) throw rowsError;

    const { error: importsError } = await client
        .from(DB_IMPORTS)
        .delete()
        .neq("file_hash", "__never__");

    if (importsError) throw importsError;
}

async function dbDeleteSavedDate(dateKey) {
    const client = initSupabaseClient();

    const { error: rowError } = await client
        .from(DB_ROWS)
        .delete()
        .eq("report_date", dateKey);

    if (rowError) throw rowError;

    // Cho phép upload lại các file từng chứa ngày vừa xóa.
    const { error: importError } = await client
        .from(DB_IMPORTS)
        .delete()
        .contains("dates", [dateKey]);

    if (importError) throw importError;
}


async function dbReplaceShiftData(reportDate, slot, rows, importInfo) {
    const client = initSupabaseClient();

    const dbRows = rows.map(row => ({
        row_key: row.rowKey,
        order_date: row.sourceOrderDate || null,
        report_date: row.reportDate || row.orderDate || null,
        import_slot: row.importSlot || slot,
        order_id: row.orderId || null,
        status: row.status || null,
        sku: row.sku,
        product: row.product || null,
        quantity: Number(row.quantity || 0),
        source_file: row.sourceFile || null,
        updated_at: row.updatedAt || new Date().toISOString()
    }));

    const dbImport = {
        file_hash: importInfo.hash,
        file_name: importInfo.fileName,
        file_size: importInfo.fileSize,
        imported_at: importInfo.importedAt,
        row_count: importInfo.rowCount,
        added: importInfo.added,
        updated: importInfo.updated,
        unchanged: importInfo.unchanged,
        dates: importInfo.dates || [],
        report_date: importInfo.reportDate || reportDate,
        import_slot: importInfo.importSlot || slot,
        source_date: importInfo.sourceDate || null,
        selected_statuses: encodeShiftStoredStatuses(
            importInfo.selectedStatuses || [],
            importInfo.sourceDates || (importInfo.sourceDate ? [importInfo.sourceDate] : [])
        ),
        saved_all_rows: Boolean(importInfo.savedAllRows)
    };

    const { error } = await client.rpc("replace_shift_data", {
        p_report_date: reportDate,
        p_slot: slot,
        p_rows: dbRows,
        p_import: dbImport
    });

    if (error) throw error;
}

async function saveShiftFilterConfigToCloud(reportDate, slot) {
    if (!reportDate) return;

    const latest = getLatestImportForSlot(reportDate, slot);
    if (!latest) return;

    const filter = getShiftFilter(slot);
    const client = initSupabaseClient();

    const sourceDates = [...getShiftSelectedDates(filter)].sort();
    const primarySourceDate = sourceDates[0] || "";

    const { error } = await client
        .from(DB_IMPORTS)
        .update({
            source_date: primarySourceDate || null,
            selected_statuses: encodeShiftStoredStatuses(filter.statuses, sourceDates)
        })
        .eq("file_hash", latest.hash);

    if (error) throw error;

    latest.sourceDate = primarySourceDate;
    latest.sourceDates = sourceDates;
    latest.selectedStatuses = [...filter.statuses];
}

const shiftFilterSaveTimers = { morning: null, afternoon: null };

function queueSaveShiftFilterConfig(slot) {
    clearTimeout(shiftFilterSaveTimers[slot]);

    shiftFilterSaveTimers[slot] = setTimeout(() => {
        const reportDate = getSelectedReportDate();

        saveShiftFilterConfigToCloud(reportDate, slot)
            .then(() => {
                renderStatsShiftSummaries(reportDate);
                renderHistory();
            })
            .catch(error => {
                console.error("Không lưu được bộ lọc ca:", error);
            });
    }, 350);
}


function createPersistentRowKey(row) {
    const reportDate = row.reportDate || row.orderDate || "";
    const slot = row.importSlot || "morning";
    const order = normalizeText(row.orderId || "");
    const sku = normalizeText(row.sku || "");
    const product = normalizeText(row.product || "");
    const sourceDate = row.sourceOrderDate || "";
    const rowNumber = Number(row.rowNumber || 0);

    // V14 thay toàn bộ dữ liệu của một ca khi upload lại,
    // nên dùng cả số dòng Excel để bảo toàn mọi dòng, kể cả SKU trùng.
    return `${reportDate}|${slot}|${sourceDate}|${rowNumber}|${order}|${sku}|${product}`;
}

async function createFileFingerprint(file) {
    try {
        if (window.crypto?.subtle) {
            const buffer = await file.arrayBuffer();
            const digest = await crypto.subtle.digest("SHA-256", buffer);

            return [...new Uint8Array(digest)]
                .map(byte => byte.toString(16).padStart(2, "0"))
                .join("");
        }
    } catch (error) {
        console.warn("Không tạo được SHA-256, dùng fingerprint dự phòng.", error);
    }

    return `${file.name}|${file.size}|${file.lastModified}`;
}

function rowsAreDifferent(oldRow, newRow) {
    if (!oldRow) return true;

    return (
        oldRow.orderDate !== newRow.orderDate ||
        oldRow.sourceOrderDate !== newRow.sourceOrderDate ||
        oldRow.status !== newRow.status ||
        oldRow.sku !== newRow.sku ||
        oldRow.product !== newRow.product ||
        Number(oldRow.quantity || 0) !== Number(newRow.quantity || 0)
    );
}

async function loadSavedDataFromDb({ resetFilters = false } = {}) {
    try {
        setCloudStatus("☁️ Đang đồng bộ...", "syncing");

        const [rows, imports] = await Promise.all([
            dbGetAll(DB_ROWS),
            dbGetAll(DB_IMPORTS)
        ]);

        state.skuRows = rows.sort((a, b) => {
            const dateCompare = String(a.orderDate || "").localeCompare(String(b.orderDate || ""));
            if (dateCompare !== 0) return dateCompare;
            return String(a.orderId || "").localeCompare(String(b.orderId || ""));
        });

        state.imports = imports.sort((a, b) =>
            String(b.importedAt || "").localeCompare(String(a.importedAt || ""))
        );

        state.fileName = state.imports[0]?.fileName || "";
        state.cloudReady = true;

        if (resetFilters) {
            state.selectedStatuses.clear();
            state.statusFilterInitialized = false;
            state.selectedDates.clear();
            state.dateFilterInitialized = false;
        }

        setCloudStatus("☁️ Supabase Cloud");
    } catch (error) {
        console.error("Không tải được dữ liệu cloud:", error);
        state.cloudReady = false;
        setCloudStatus("☁️ Lỗi đồng bộ", "error");
        throw error;
    }
}


/* =========================================================
   V40 - PHÂN QUYỀN NGƯỜI DÙNG
========================================================= */

const ROLE_LABELS_V40 = {
    ADMIN: "ADMIN",
    KHO: "KHO",
    KETOAN: "KẾ TOÁN",
    NHAN_VIEN: "NHÂN VIÊN"
};

const ROLE_PERMISSIONS_V40 = {
    ADMIN: new Set([
        "VIEW",
        "UPLOAD_SHOPEE",
        "EDIT_CONVERSION",
        "DELETE_SHOPEE",
        "UPLOAD_INVOICE",
        "DELETE_INVOICE",
        "INVENTORY_WRITE",
        "TRANSIT_UPLOAD",
        "MANAGE_USERS",
        "MANAGE_INVOICE_LINKS",
        "UPLOAD_FINANCE",
        "DELETE_FINANCE"
    ]),

    KHO: new Set([
        "VIEW",
        "INVENTORY_WRITE",
        "TRANSIT_UPLOAD"
    ]),

    KETOAN: new Set([
        "VIEW",
        "UPLOAD_INVOICE",
        "MANAGE_INVOICE_LINKS",
        "UPLOAD_FINANCE"
    ]),

    NHAN_VIEN: new Set([
        "VIEW",
        "UPLOAD_SHOPEE"
    ])
};

function normalizeRoleV40(role) {
    const value = String(role || "").trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(ROLE_LABELS_V40, value)
        ? value
        : "NHAN_VIEN";
}

function roleLabelV40(role = state.userRole) {
    return ROLE_LABELS_V40[normalizeRoleV40(role)] || "NHÂN VIÊN";
}

function hasPermissionV40(permission) {
    const role = normalizeRoleV40(state.userRole);
    return ROLE_PERMISSIONS_V40[role]?.has(permission) || false;
}

function permissionMessageV40(permission) {
    const map = {
        UPLOAD_SHOPEE: "Chỉ ADMIN hoặc NHÂN VIÊN được upload file Shopee Sáng/Chiều.",
        EDIT_CONVERSION: "Chỉ ADMIN được sửa hệ số/quy đổi SKU.",
        DELETE_SHOPEE: "Chỉ ADMIN được xóa dữ liệu Shopee Cloud.",
        UPLOAD_INVOICE: "Chỉ ADMIN hoặc KẾ TOÁN được upload file MISA/hóa đơn.",
        DELETE_INVOICE: "Chỉ ADMIN được xóa lịch sử hóa đơn Cloud.",
        INVENTORY_WRITE: "Chỉ ADMIN hoặc KHO được cập nhật tồn kho, nhập/xuất và kiểm kê.",
        TRANSIT_UPLOAD: "Chỉ ADMIN hoặc KHO được upload snapshot luân chuyển.",
        MANAGE_USERS: "Chỉ ADMIN được phân quyền người dùng.",
        MANAGE_INVOICE_LINKS: "Chỉ ADMIN hoặc KẾ TOÁN được tạo/sửa liên kết Mã đơn Shopee ↔ Số hóa đơn MISA.",
        UPLOAD_FINANCE: "Chỉ ADMIN hoặc KẾ TOÁN được upload file tài chính Shopee.",
        DELETE_FINANCE: "Chỉ ADMIN được xóa snapshot tài chính Cloud."
    };

    return map[permission] || "Tài khoản hiện tại không có quyền thực hiện thao tác này.";
}

function requirePermissionV40(permission, { alertUser = true } = {}) {
    if (hasPermissionV40(permission)) return true;

    if (alertUser) {
        alert(
            `${permissionMessageV40(permission)}\n\n` +
            `Vai trò hiện tại: ${roleLabelV40()}.`
        );
    }

    return false;
}

function assertPermissionV40(permission) {
    if (!hasPermissionV40(permission)) {
        throw new Error(
            `ROLE_FORBIDDEN: ${permissionMessageV40(permission)} ` +
            `(Vai trò: ${roleLabelV40()})`
        );
    }
}

async function loadUserAccessV40() {
    if (!state.user) {
        state.userRole = "NHAN_VIEN";
        state.roleSource = "none";
        state.roleLoaded = false;
        return;
    }

    const email = String(state.user.email || "").trim().toLowerCase();

    try {
        const client = initSupabaseClient();
        const { data, error } = await client.rpc("app_user_context");

        if (error) throw error;

        const payload = Array.isArray(data) ? data[0] : data;
        state.userRole = normalizeRoleV40(payload?.role);
        state.roleSource = "cloud";
        state.roleLoaded = true;
    } catch (error) {
        console.warn("V40 chưa đọc được role Cloud, dùng fallback:", error);

        // Fallback chỉ để tránh khóa chính chủ nếu SQL V40 chưa chạy.
        // Bảo mật thật nằm ở SQL/RLS V40.
        state.userRole =
            email === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()
                ? "ADMIN"
                : "NHAN_VIEN";

        state.roleSource = "fallback";
        state.roleLoaded = false;
    }
}

function applyPermissionElementV40(id, permission, { hide = false } = {}) {
    const element = $(id);
    if (!element) return;

    const allowed = hasPermissionV40(permission);

    if (hide) {
        element.classList.toggle("v40-permission-hidden", !allowed);
        element.classList.toggle("hidden", !allowed && id === "btnManageRoles");
    } else {
        element.classList.toggle("v40-permission-locked", !allowed);

        if ("disabled" in element) {
            element.disabled = !allowed;
        }

        const parentLabel =
            element.tagName === "INPUT" && element.type === "file"
                ? element.closest("label")
                : null;

        if (parentLabel) {
            parentLabel.classList.toggle("v40-permission-locked", !allowed);
            parentLabel.title = allowed
                ? ""
                : permissionMessageV40(permission);
        }

        if (!allowed) {
            element.title = permissionMessageV40(permission);
        } else if (
            element.title === permissionMessageV40(permission)
        ) {
            element.removeAttribute("title");
        }
    }
}

function applyRoleUiV40() {
    const role = normalizeRoleV40(state.userRole);
    const badge = $("cloudUserRole");

    if (badge) {
        badge.className =
            "v40-role-badge " +
            (
                role === "ADMIN"
                    ? "role-admin"
                    : role === "KHO"
                        ? "role-kho"
                        : role === "KETOAN"
                            ? "role-ketoan"
                            : "role-nhan-vien"
            );

        badge.textContent = roleLabelV40(role);
        badge.title =
            `Vai trò Cloud: ${roleLabelV40(role)}` +
            (state.roleSource === "fallback"
                ? " · đang dùng fallback vì chưa đọc được SQL V40"
                : "");
    }

    if ($("adminDeleteEmailBox")) {
        $("adminDeleteEmailBox").textContent = state.user?.email || "-";
    }

    // Admin-only
    applyPermissionElementV40("btnReset", "DELETE_SHOPEE", { hide: true });
    applyPermissionElementV40("btnManageRoles", "MANAGE_USERS", { hide: true });
    applyPermissionElementV40("btnAddBaseSku", "EDIT_CONVERSION", { hide: true });
    applyPermissionElementV40("btnResetConversions", "EDIT_CONVERSION", { hide: true });

    // Shopee upload
    applyPermissionElementV40("morningFile", "UPLOAD_SHOPEE");
    applyPermissionElementV40("afternoonFile", "UPLOAD_SHOPEE");

    // Invoice / MISA
    applyPermissionElementV40("invoiceFileInput", "UPLOAD_INVOICE");
    applyPermissionElementV40("inventoryMisaFileInput", "UPLOAD_INVOICE");
    applyPermissionElementV40("btnInventoryMisaChooseFile", "UPLOAD_INVOICE");
    applyPermissionElementV40("v50BridgeFileInput", "MANAGE_INVOICE_LINKS");
    applyPermissionElementV40("btnV50ManualLink", "MANAGE_INVOICE_LINKS");
    applyPermissionElementV40("financeFileInputV53", "UPLOAD_FINANCE");
    applyPermissionElementV40("btnFinanceChooseV53", "UPLOAD_FINANCE");
    applyPermissionElementV40("btnFinanceDeleteV53", "DELETE_FINANCE", { hide: true });

    // Inventory
    applyPermissionElementV40("inventoryStockFileInput", "INVENTORY_WRITE");
    applyPermissionElementV40("btnInventoryEdit", "INVENTORY_WRITE");
    applyPermissionElementV40("btnInventoryAddTransaction", "INVENTORY_WRITE");
    applyPermissionElementV40("btnInventoryCommitReconcile", "INVENTORY_WRITE");
    applyPermissionElementV40("btnInventoryAddItem", "INVENTORY_WRITE");
    applyPermissionElementV40("btnInventoryEditorSave", "INVENTORY_WRITE");

    // Transit snapshot
    applyPermissionElementV40("inventoryTransitFileInput", "TRANSIT_UPLOAD");
    applyPermissionElementV40("btnInventoryTransitChooseFile", "TRANSIT_UPLOAD");

    // Dynamic conversion cells
    document.querySelectorAll(".conversion-input").forEach(input => {
        const allowed = hasPermissionV40("EDIT_CONVERSION");
        input.disabled = !allowed;
        input.classList.toggle("v40-permission-locked", !allowed);
        if (!allowed) input.title = permissionMessageV40("EDIT_CONVERSION");
    });

    document.querySelectorAll(".remove-base-sku").forEach(button => {
        button.classList.toggle(
            "v40-permission-hidden",
            !hasPermissionV40("EDIT_CONVERSION")
        );
    });

    // Dynamic delete transaction
    document.querySelectorAll("[data-inventory-tx-delete]").forEach(button => {
        button.classList.toggle(
            "v40-permission-hidden",
            !hasPermissionV40("INVENTORY_WRITE")
        );
    });

    // Dynamic invoice-history delete
    document.querySelectorAll("[data-invoice-history-delete]").forEach(button => {
        button.classList.toggle(
            "v40-permission-hidden",
            !hasPermissionV40("DELETE_INVOICE")
        );
    });
}

/* ======================== ROLE MANAGER ======================== */

const roleManagerStateV40 = {
    users: [],
    loading: false
};

function showRoleManagerErrorV40(message = "") {
    const box = $("v40RoleManagerError");
    if (!box) return;
    box.textContent = message;
    box.classList.toggle("show", Boolean(message));
}

function roleOptionsV40(selectedRole, locked = false) {
    return Object.keys(ROLE_LABELS_V40).map(role => `
        <option value="${role}" ${role === selectedRole ? "selected" : ""}>
            ${escapeHTML(ROLE_LABELS_V40[role])}
        </option>
    `).join("");
}

function renderRoleManagerV40() {
    const body = $("v40RoleTableBody");
    const info = $("v40RoleManagerInfo");

    if (!body) return;

    if (roleManagerStateV40.loading) {
        body.innerHTML =
            '<tr><td colspan="5" class="empty-table">Đang tải danh sách tài khoản...</td></tr>';
        if (info) info.textContent = "Đang tải...";
        return;
    }

    const users = roleManagerStateV40.users || [];

    if (info) {
        info.textContent = `${users.length} tài khoản`;
    }

    if (!users.length) {
        body.innerHTML =
            '<tr><td colspan="5" class="empty-table">Chưa có tài khoản để phân quyền.</td></tr>';
        return;
    }

    body.innerHTML = users.map((user, index) => {
        const role = normalizeRoleV40(user.role);
        const email = String(user.email || "");
        const bootstrap =
            email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

        return `
            <tr>
                <td>${index + 1}</td>

                <td>
                    <strong>${escapeHTML(email || "-")}</strong>
                    ${bootstrap
                        ? '<div class="v40-bootstrap-admin">ADMIN GỐC</div>'
                        : ""}
                </td>

                <td>
                    <span class="v40-role-current ${role}">
                        ${escapeHTML(roleLabelV40(role))}
                    </span>
                </td>

                <td>
                    <select
                        data-v40-role-select="${escapeHTML(user.user_id || "")}"
                        ${bootstrap ? "disabled" : ""}
                    >
                        ${roleOptionsV40(role, bootstrap)}
                    </select>
                </td>

                <td>
                    <button
                        type="button"
                        class="v40-role-save"
                        data-v40-role-save="${escapeHTML(user.user_id || "")}"
                        ${bootstrap ? "disabled" : ""}
                    >
                        ${bootstrap ? "Đã khóa" : "Lưu quyền"}
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

async function loadRoleManagerV40() {
    if (!requirePermissionV40("MANAGE_USERS")) return;

    roleManagerStateV40.loading = true;
    showRoleManagerErrorV40("");
    renderRoleManagerV40();

    try {
        const client = initSupabaseClient();
        const { data, error } = await client.rpc("admin_list_user_roles");

        if (error) throw error;

        roleManagerStateV40.users = Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Load role manager V40:", error);
        roleManagerStateV40.users = [];
        showRoleManagerErrorV40(
            error?.message || "Không tải được danh sách phân quyền."
        );
    } finally {
        roleManagerStateV40.loading = false;
        renderRoleManagerV40();
    }
}

async function saveUserRoleV40(userId) {
    if (!requirePermissionV40("MANAGE_USERS")) return;

    const select = document.querySelector(
        `[data-v40-role-select="${CSS.escape(userId)}"]`
    );

    const button = document.querySelector(
        `[data-v40-role-save="${CSS.escape(userId)}"]`
    );

    if (!select) return;

    const role = normalizeRoleV40(select.value);

    if (!confirm(
        `Đổi quyền tài khoản này thành ${roleLabelV40(role)}?`
    )) return;

    if (button) {
        button.disabled = true;
        button.textContent = "Đang lưu...";
    }

    showRoleManagerErrorV40("");

    try {
        const client = initSupabaseClient();
        const { error } = await client.rpc(
            "admin_set_user_role",
            {
                p_user_id: userId,
                p_role: role
            }
        );

        if (error) throw error;

        await loadRoleManagerV40();

        // Nếu admin vừa đổi chính tài khoản đang đăng nhập (trừ admin gốc),
        // nạp lại context ngay.
        if (userId === state.user?.id) {
            await loadUserAccessV40();
            updateUserUi();
            applyRoleUiV40();
        }

        showToast("Đã cập nhật quyền người dùng.");
    } catch (error) {
        console.error("Save role V40:", error);
        showRoleManagerErrorV40(
            error?.message || "Không lưu được quyền người dùng."
        );
    } finally {
        if (button && document.body.contains(button)) {
            button.disabled = false;
            button.textContent = "Lưu quyền";
        }
    }
}

async function openRoleManagerV40() {
    if (!requirePermissionV40("MANAGE_USERS")) return;

    $("roleManagerModal")?.classList.remove("hidden");
    await loadRoleManagerV40();
}

function closeRoleManagerV40() {
    $("roleManagerModal")?.classList.add("hidden");
    showRoleManagerErrorV40("");
}

$("btnManageRoles")?.addEventListener("click", openRoleManagerV40);
$("btnCloseRoleManager")?.addEventListener("click", closeRoleManagerV40);
$("btnCloseRoleManagerFooter")?.addEventListener("click", closeRoleManagerV40);
$("btnRefreshRoleManager")?.addEventListener("click", loadRoleManagerV40);

$("roleManagerModal")?.addEventListener("click", event => {
    if (event.target === $("roleManagerModal")) {
        closeRoleManagerV40();
    }
});

$("v40RoleTableBody")?.addEventListener("click", event => {
    const button = event.target.closest("[data-v40-role-save]");
    if (!button) return;
    saveUserRoleV40(button.dataset.v40RoleSave);
});

document.addEventListener("keydown", event => {
    if (
        event.key === "Escape" &&
        !$("roleManagerModal")?.classList.contains("hidden")
    ) {
        closeRoleManagerV40();
    }
});


/* ======================== AUTHENTICATION ======================== */
function showAuthError(message = "") {
    const box = $("authError");
    if (!box) return;

    box.textContent = message;
    box.classList.toggle("show", Boolean(message));
}

function setAuthGateVisible(visible) {
    $("authGate")?.classList.toggle("hidden", !visible);
}

function updateUserUi() {
    const email = state.user?.email || "-";
    if ($("cloudUserEmail")) $("cloudUserEmail").textContent = email;
    applyRoleUiV40();
}

async function signInUser(email, password) {
    const client = initSupabaseClient();

    const { data, error } = await client.auth.signInWithPassword({
        email,
        password
    });

    if (error) throw error;
    return data.session;
}

async function signOutUser() {
    const client = initSupabaseClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
}

async function enterAuthenticatedApp(session) {
    state.user = session?.user || null;

    if (!state.user) {
        setAuthGateVisible(true);
        return;
    }

    await loadUserAccessV40();
    updateUserUi();
    setAuthGateVisible(false);

    await Promise.all([
        loadSavedDataFromDb({ resetFilters: true }),
        loadConversionConfigFromCloud()
    ]);

    await loadInventoryData();

    // V39: lịch sử hóa đơn Cloud là nguồn dùng chung nhiều máy.
    // Lần đầu sau nâng cấp sẽ tự migrate cache V27/V38 nếu có.
    await syncInvoiceHistoryCloudV39({
        migrateLocal: true,
        loadLatestIfEmpty: true
    });

    // V50: tải bảng cầu nối Mã đơn Shopee ↔ Số hóa đơn.
    await loadInvoiceOrderLinksV50({ silent: true });

    // V54: tải danh sách hóa đơn MISA đã/chưa phát hành để ghép trực tiếp Mã ĐH của sàn.
    await loadMisaOrderCloudV54({ silent: true });

    // V53: tải snapshot tài chính Shopee mới nhất nếu SQL V53 đã sẵn sàng.
    await loadFinanceCloudV53({ silent: true });

    const savedUi = readUiStateV17();

    const reportDates = [...new Set(
        state.skuRows.map(row => row.orderDate).filter(Boolean)
    )].sort();

    const latestReportDate = reportDates.length
        ? reportDates[reportDates.length - 1]
        : getLocalTodayKey();

    let initialReportDate = savedUi.reportDate || latestReportDate;

    // V45:
    // - Ở màn Thống kê SKU chi tiết, vẫn cho giữ ngày chưa có dữ liệu để chuẩn bị upload.
    // - Ở Tổng quan / Tồn kho / Hóa đơn..., nếu ngày đã lưu không còn dữ liệu thì tự về ngày mới nhất có dữ liệu.
    const canKeepEmptyReportDate = savedUi.view === "sku-stats";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(initialReportDate)) {
        initialReportDate = latestReportDate;
    } else if (
        reportDates.length &&
        !reportDates.includes(initialReportDate) &&
        !canKeepEmptyReportDate
    ) {
        initialReportDate = latestReportDate;
    }

    state.selectedDates = new Set([initialReportDate]);
    state.dateFilterInitialized = true;

    if ($("reportDateInput")) {
        $("reportDateInput").value = initialReportDate;
    }

    if ($("calendarYearSelect")) {
        const savedYear = Number(savedUi.calendarYear);
        const dateYear = Number(initialReportDate.slice(0, 4));

        const preferredYear =
            savedYear >= CALENDAR_MIN_YEAR && savedYear <= CALENDAR_MAX_YEAR
                ? savedYear
                : dateYear;

        if (preferredYear >= CALENDAR_MIN_YEAR && preferredYear <= CALENDAR_MAX_YEAR) {
            $("calendarYearSelect").value = String(preferredYear);
        }
    }

    if ($("calendarMonthSelect")) {
        const savedMonth = Number(savedUi.calendarMonth);
        const dateMonth = Number(initialReportDate.slice(5, 7));
        const preferredMonth = savedMonth >= 1 && savedMonth <= 12
            ? savedMonth
            : dateMonth;

        $("calendarMonthSelect").value = String(
            preferredMonth >= 1 && preferredMonth <= 12 ? preferredMonth : 1
        );
    }

    loadShiftConfigurationForReportDate(initialReportDate);

    renderAll();

    const allowedViews = [
        "sku-stats",
        "invoice-stats"
    ];

    const restoreView = allowedViews.includes(savedUi.view)
        ? savedUi.view
        : "sku-stats";

    openView(restoreView);

    // V38: kiểm tra hệ thống nền sau khi toàn bộ dữ liệu Cloud đã tải.
    setTimeout(() => {
        runSystemHealthCheckV38({ silent: true }).catch(error => {
            console.warn(`${APP_VERSION} health check:`, error);
        });
    }, 150);

    if (restoreView === "sku-stats") {
        if (savedUi.skuMode === "detail") {
            openStatsDay(initialReportDate);
        } else {
            showStatsCalendar();
        }
    }
}

$("authForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    const button = $("btnLogin");

    showAuthError("");
    button.disabled = true;
    button.textContent = "ĐANG ĐĂNG NHẬP...";

    try {
        const session = await signInUser(email, password);
        await enterAuthenticatedApp(session);
        $("loginPassword").value = "";
    } catch (error) {
        console.error(error);
        showAuthError(
            error?.message === "Invalid login credentials"
                ? "Email hoặc mật khẩu không đúng."
                : (error?.message || "Không đăng nhập được.")
        );
    } finally {
        button.disabled = false;
        button.textContent = "ĐĂNG NHẬP";
    }
});

$("btnLogout")?.addEventListener("click", async () => {
    try {
        await signOutUser();

        state.user = null;
        state.userRole = "NHAN_VIEN";
        state.roleSource = "none";
        state.roleLoaded = false;
        state.skuRows = [];
        state.imports = [];
        state.skuStats = [];

        renderAll();
        setAuthGateVisible(true);
        $("loginPassword").value = "";
    } catch (error) {
        console.error(error);
        alert("Không đăng xuất được.");
    }
});


/* ======================== DOM HELPERS ======================== */
function $(id) {
    return document.getElementById(id);
}

function formatNumber(value) {
    return (Number(value) || 0).toLocaleString("vi-VN");
}


/* ======================== NGÀY ĐẶT HÀNG ======================== */
function normalizeOrderDate(value) {
    if (value === null || value === undefined || value === "") return "";

    // Trường hợp XLSX trả về Date.
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, "0");
        const d = String(value.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }

    // Trường hợp Excel serial date.
    if (typeof value === "number" && typeof XLSX !== "undefined") {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) {
            return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
        }
    }

    const text = String(value).trim();

    // Shopee thường trả: 2026-08-13 00:01
    let match = text.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (match) {
        return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
    }

    // Hỗ trợ dạng 13/08/2026 hoặc 13-08-2026.
    match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) {
        return `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
    }

    return "";
}

function formatDateLabel(dateKey) {
    if (!dateKey) return "(Không có ngày)";
    const parts = dateKey.split("-");
    if (parts.length !== 3) return dateKey;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
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
    button.addEventListener("click", () => {
        const viewName = button.dataset.view;
        openView(viewName);

        // Yêu cầu V16: bấm "Thống kê SKU" luôn quay về lịch 12 tháng.
        if (viewName === "sku-stats") {
            showStatsCalendar();
        }
    });
});

document.querySelectorAll("[data-open-view]").forEach(button => {
    button.addEventListener("click", () => openView(button.dataset.openView));
});

if ($("btnGoImport")) {
    $("btnGoImport").addEventListener("click", () => {
        openView("sku-stats");
        showStatsCalendar();
    });
}

if ($("btnImportGoCalendar")) {
    $("btnImportGoCalendar").addEventListener("click", () => {
        openView("sku-stats");
        showStatsCalendar();
    });
}


/* ======================== V17 - GHI NHỚ MÀN HÌNH ĐANG XEM ======================== */
const STORAGE_UI_STATE_V17 = "rucos_ui_state_v17";

function readUiStateV17() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_UI_STATE_V17) || "{}");
    } catch (error) {
        return {};
    }
}

function writeUiStateV17(patch = {}) {
    try {
        const current = readUiStateV17();

        localStorage.setItem(
            STORAGE_UI_STATE_V17,
            JSON.stringify({
                ...current,
                ...patch,
                updatedAt: new Date().toISOString()
            })
        );
    } catch (error) {
        console.warn("Không lưu được trạng thái giao diện.", error);
    }
}

function getCurrentViewNameV17() {
    const active = document.querySelector(".view.active");
    return active?.id?.replace(/^view-/, "") || "sku-stats";
}

function persistCurrentUiStateV17() {
    const selectedDate = [...state.selectedDates][0] || getSelectedReportDate() || "";
    const detail = $("statsDetailScreen");
    const calendar = $("statsCalendarScreen");

    let skuMode = "calendar";

    if (detail && !detail.classList.contains("hidden")) {
        skuMode = "detail";
    } else if (calendar && !calendar.classList.contains("hidden")) {
        skuMode = "calendar";
    }

    writeUiStateV17({
        view: getCurrentViewNameV17(),
        reportDate: selectedDate,
        skuMode,
        calendarYear: $("calendarYearSelect")?.value || "",
        calendarMonth: $("calendarMonthSelect")?.value || ""
    });
}

/* ======================== V57.0 - GHI NHỚ VỊ TRÍ CUỘN ======================== */
const STORAGE_SCROLL_STATE_V565 = "rucos_scroll_state_v565";
let scrollCaptureFrameV565 = 0;
let restoringScrollV565 = false;
let restoreTimersV565 = [];

function readScrollStateV565() {
    try {
        return JSON.parse(sessionStorage.getItem(STORAGE_SCROLL_STATE_V565) || "{}");
    } catch (error) {
        return {};
    }
}

function writeScrollStateV565(data) {
    try {
        sessionStorage.setItem(STORAGE_SCROLL_STATE_V565, JSON.stringify(data || {}));
    } catch (error) {
        console.warn("Không lưu được vị trí cuộn.", error);
    }
}

function getScrollableElementsV565(viewName) {
    const view = $("view-" + viewName);
    if (!view) return [];

    const nodes = Array.from(view.querySelectorAll("*"));
    return nodes.filter(el => {
        if (!(el instanceof HTMLElement)) return false;
        const style = getComputedStyle(el);
        const overflowX = style.overflowX;
        const overflowY = style.overflowY;
        const canX = /auto|scroll/.test(overflowX) && el.scrollWidth > el.clientWidth + 2;
        const canY = /auto|scroll/.test(overflowY) && el.scrollHeight > el.clientHeight + 2;
        return canX || canY;
    });
}

function getScrollElementKeyV565(el, index) {
    if (el.id) return `id:${el.id}`;
    const explicit = el.getAttribute("data-scroll-memory-key");
    if (explicit) return `data:${explicit}`;

    const classKey = Array.from(el.classList || [])
        .filter(Boolean)
        .slice(0, 4)
        .join(".");
    return `auto:${el.tagName.toLowerCase()}:${classKey}:${index}`;
}

function saveScrollPositionV565(viewName = getCurrentViewNameV17()) {
    if (!viewName || restoringScrollV565) return;

    const all = readScrollStateV565();
    const containers = {};

    getScrollableElementsV565(viewName).forEach((el, index) => {
        const key = getScrollElementKeyV565(el, index);
        containers[key] = {
            top: Math.max(0, Number(el.scrollTop) || 0),
            left: Math.max(0, Number(el.scrollLeft) || 0)
        };
    });

    all[viewName] = {
        x: Math.max(0, Number(window.scrollX) || 0),
        y: Math.max(0, Number(window.scrollY) || 0),
        containers,
        savedAt: Date.now()
    };
    writeScrollStateV565(all);
}

function clearRestoreTimersV565() {
    restoreTimersV565.forEach(timer => clearTimeout(timer));
    restoreTimersV565 = [];
}

function restoreScrollPositionV565(viewName = getCurrentViewNameV17()) {
    if (!viewName) return;
    const saved = readScrollStateV565()[viewName];
    if (!saved) return;

    clearRestoreTimersV565();
    restoringScrollV565 = true;

    const apply = () => {
        if (getCurrentViewNameV17() !== viewName) return;

        window.scrollTo({
            left: Math.max(0, Number(saved.x) || 0),
            top: Math.max(0, Number(saved.y) || 0),
            behavior: "auto"
        });

        const savedContainers = saved.containers || {};
        getScrollableElementsV565(viewName).forEach((el, index) => {
            const key = getScrollElementKeyV565(el, index);
            const pos = savedContainers[key];
            if (!pos) return;
            el.scrollTop = Math.max(0, Number(pos.top) || 0);
            el.scrollLeft = Math.max(0, Number(pos.left) || 0);
        });
    };

    requestAnimationFrame(() => {
        apply();
        restoreTimersV565.push(setTimeout(apply, 60));
        restoreTimersV565.push(setTimeout(apply, 180));
        restoreTimersV565.push(setTimeout(() => {
            apply();
            restoringScrollV565 = false;
        }, 420));
    });
}

function scheduleSaveScrollV565() {
    if (restoringScrollV565 || scrollCaptureFrameV565) return;
    scrollCaptureFrameV565 = requestAnimationFrame(() => {
        scrollCaptureFrameV565 = 0;
        saveScrollPositionV565();
    });
}

window.addEventListener("scroll", scheduleSaveScrollV565, { passive: true });
document.addEventListener("scroll", scheduleSaveScrollV565, true);
window.addEventListener("pagehide", () => {
    persistCurrentUiStateV17();
    saveScrollPositionV565();
});
window.addEventListener("beforeunload", saveScrollPositionV565);
window.addEventListener("blur", saveScrollPositionV565);
window.addEventListener("focus", () => restoreScrollPositionV565());
window.addEventListener("pageshow", () => restoreScrollPositionV565());

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        persistCurrentUiStateV17();
        saveScrollPositionV565();
    } else {
        restoreScrollPositionV565();
    }
});

function openView(viewName, options = {}) {
    const previousView = getCurrentViewNameV17();
    if (previousView) saveScrollPositionV565(previousView);
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
    if (viewName === "fees") renderFinanceAllV53();
    if (viewName === "payments") renderFinanceAllV53();
    if (viewName === "issues") renderFinanceAllV53();
    if (viewName === "returns") renderReturnsTab();
    if (viewName === "history") renderHistory();
    if (viewName === "invoice-stats") { renderInvoiceStats(); renderMisaInvoiceHubV54(); }
    if (viewName === "inventory-flow") {
        renderInventoryModule();
        applyRoleUiV40();
    }

    if (viewName === "overview") {
        renderOperationalAlertsV38();
        renderSystemHealthPanelV38();
    }

    if (viewName === "sku-stats") {
        // Chỉ cập nhật dữ liệu; sidebar sẽ quyết định hiện lịch hay chi tiết.
        renderStatsCalendar();

        const detail = $("statsDetailScreen");
        const reportDate = [...state.selectedDates][0] || getSelectedReportDate();

        if (detail && !detail.classList.contains("hidden") && reportDate) {
            if ($("reportDateInput")) $("reportDateInput").value = reportDate;
            loadShiftConfigurationForReportDate(reportDate);
            renderDateFilters();
            rebuildSkuStatistics();
        }
    }
    writeUiStateV17({ view: viewName });

    if (options.restoreScroll !== false) {
        restoreScrollPositionV565(viewName);
    }
}

/* ======================== EXCEL ======================== */
async function readExcelFile(file) {
    if (typeof XLSX === "undefined") {
        throw new Error("Không tải được thư viện đọc Excel. Hãy kiểm tra kết nối Internet rồi tải lại trang.");
    }
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

        const rawOrderDate = pick(row, ALIASES.orderDate);

        parsed.push({
            rowNumber: index + 2,
            orderId: String(pick(row, ALIASES.orderId)).trim(),

            // Dùng cột "Ngày đặt hàng" để lọc theo ngày.
            orderDate: normalizeOrderDate(rawOrderDate),
            orderDateRaw: String(rawOrderDate ?? "").trim(),

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

function getLocalTodayKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function addDaysToDateKey(dateKey, days) {
    if (!dateKey) return "";
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getSelectedReportDate() {
    return $("reportDateInput")?.value || "";
}

function slotLabel(slot) {
    return slot === "morning" ? "Buổi sáng" : "Buổi chiều";
}

function getShiftFilter(slot) {
    if (!state.shiftFilters[slot]) {
        state.shiftFilters[slot] = {
            sourceDate: "",
            sourceDates: new Set(),
            statuses: createDefaultShiftStatusSet()
        };
    }

    if (!(state.shiftFilters[slot].statuses instanceof Set)) {
        state.shiftFilters[slot].statuses = new Set(state.shiftFilters[slot].statuses || []);
    }

    getShiftSelectedDates(state.shiftFilters[slot]);
    return state.shiftFilters[slot];
}

function getLatestImportForSlot(reportDate, slot) {
    return state.imports
        .filter(info =>
            info.reportDate === reportDate &&
            info.importSlot === slot
        )
        .sort((a, b) =>
            String(b.importedAt || "").localeCompare(String(a.importedAt || ""))
        )[0] || null;
}

function normalizeRowSlot(row) {
    return row.importSlot === "afternoon" ? "afternoon" : "morning";
}

function getRawRowsForReportSlot(reportDate, slot) {
    return state.skuRows.filter(row =>
        row.orderDate === reportDate &&
        normalizeRowSlot(row) === slot
    );
}

function getFilteredRowsForReportSlot(reportDate, slot, customFilter = null) {
    const filter = customFilter || getShiftFilter(slot);
    const rows = getRawRowsForReportSlot(reportDate, slot);

    return rows.filter(row => {
        const dateOk = shiftDateMatches(filter, row.sourceOrderDate);
        const statusOk = filter.statuses instanceof Set
            ? filter.statuses.has(row.status)
            : false;
        return dateOk && statusOk;
    });
}

function getAvailableDateCounts(reportDate, slot) {
    const counts = new Map();

    getRawRowsForReportSlot(reportDate, slot).forEach(row => {
        const key = row.sourceOrderDate || "";
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
    });

    return counts;
}

function getAvailableStatusCounts(reportDate, slot) {
    const filter = getShiftFilter(slot);
    const counts = new Map();

    getRawRowsForReportSlot(reportDate, slot)
        .filter(row => shiftDateMatches(filter, row.sourceOrderDate))
        .forEach(row => {
            const key = row.status || "";
            if (!key) return;
            counts.set(key, (counts.get(key) || 0) + 1);
        });

    return counts;
}

function getObservedStatuses(reportDate, slot) {
    const observed = [...new Set(
        getRawRowsForReportSlot(reportDate, slot)
            .map(row => row.status)
            .filter(Boolean)
    )];

    const merged = [...SHOPEE_STATUS_OPTIONS];

    observed.forEach(status => {
        if (!merged.includes(status)) merged.push(status);
    });

    return merged;
}

function countShiftResult(reportDate, slot) {
    return getFilteredRowsForReportSlot(reportDate, slot).length;
}

function uniqueSkuCountForRows(rows) {
    return new Set(rows.map(row => row.sku).filter(Boolean)).size;
}


function loadShiftConfigurationForReportDate(reportDate) {
    ["morning", "afternoon"].forEach(slot => {
        const latest = getLatestImportForSlot(reportDate, slot);
        const filter = getShiftFilter(slot);

        if (latest) {
            const savedDates = latest.sourceDates?.length
                ? latest.sourceDates
                : [latest.sourceDate || reportDate];

            setShiftSelectedDates(filter, savedDates);

            filter.statuses = latest.selectedStatuses?.length
                ? new Set(latest.selectedStatuses)
                : createDefaultShiftStatusSet();
        } else {
            // Mặc định tiện cho quy trình hiện tại:
            // sáng lấy ngày hôm trước, chiều lấy ngày báo cáo.
            setShiftSelectedDates(filter, [
                slot === "morning"
                    ? addDaysToDateKey(reportDate, -1)
                    : reportDate
            ]);

            filter.statuses = createDefaultShiftStatusSet();
        }
    });

    syncShiftInputsFromState();
}

function renderAvailableDates(slot) {
    const reportDate = getSelectedReportDate();
    const container = $(slot === "morning" ? "morningAvailableDates" : "afternoonAvailableDates");
    if (!container) return;

    const filter = getShiftFilter(slot);
    const counts = getAvailableDateCounts(reportDate, slot);
    const dates = [...counts.keys()].sort();

    if (!dates.length) {
        container.innerHTML = '<span style="font-size:8px;color:#9aa7af">Chưa có file để đọc danh sách ngày.</span>';
        return;
    }

    const selectedDates = getShiftSelectedDates(filter);

    container.innerHTML = dates.map(dateKey => `
        <button
            type="button"
            class="available-date-btn ${selectedDates.has(dateKey) ? "active" : ""}"
            aria-pressed="${selectedDates.has(dateKey) ? "true" : "false"}"
            data-available-date-slot="${slot}"
            data-available-date="${escapeHTML(dateKey)}"
        >
            ${formatDateLabel(dateKey)}
            <small>${formatNumber(counts.get(dateKey))} dòng</small>
        </button>
    `).join("");

    document.querySelectorAll(`[data-available-date-slot="${slot}"]`).forEach(button => {
        button.addEventListener("click", () => {
            const dateKey = button.dataset.availableDate;
            const selected = getShiftSelectedDates(filter);

            if (selected.has(dateKey)) {
                if (selected.size <= 1) {
                    showToast("Cần giữ ít nhất 1 ngày đơn được chọn.");
                    return;
                }
                selected.delete(dateKey);
            } else {
                selected.add(dateKey);
            }

            filter.sourceDate = [...selected].sort()[0] || "";

            renderAvailableDates(slot);
            renderShiftStatusFilters(slot);
            renderUploadSlotStatuses();
            rebuildSkuStatistics();
            queueSaveShiftFilterConfig(slot);
        });
    });
}

function syncShiftInputsFromState() {
    const morning = getShiftFilter("morning");
    const afternoon = getShiftFilter("afternoon");

    if ($("morningSourceDate")) $("morningSourceDate").value = [...getShiftSelectedDates(morning)].sort()[0] || "";
    if ($("afternoonSourceDate")) $("afternoonSourceDate").value = [...getShiftSelectedDates(afternoon)].sort()[0] || "";

    renderAvailableDates("morning");
    renderAvailableDates("afternoon");
    renderShiftStatusFilters("morning");
    renderShiftStatusFilters("afternoon");
    renderUploadSlotStatuses();
}

function renderShiftStatusFilters(slot) {
    const container = $(slot === "morning" ? "morningStatusFilters" : "afternoonStatusFilters");
    if (!container) return;

    const reportDate = getSelectedReportDate();
    const filter = getShiftFilter(slot);
    const statusCounts = getAvailableStatusCounts(reportDate, slot);
    const statuses = getObservedStatuses(reportDate, slot);

    container.innerHTML = statuses.map((status, index) => {
        const checked = filter.statuses.has(status);
        const count = statusCounts.get(status) || 0;

        const shortText = status.length > 72
            ? status.slice(0, 72) + "..."
            : status;

        return `
            <label class="shift-status-check ${checked ? "checked" : ""}" title="${escapeHTML(status)}">
                <input
                    type="checkbox"
                    data-shift-status="${slot}"
                    data-shift-status-index="${index}"
                    ${checked ? "checked" : ""}
                >
                <span>
                    ${escapeHTML(shortText)}
                    ${count ? `<span class="shift-filter-preview">${formatNumber(count)}</span>` : ""}
                </span>
            </label>
        `;
    }).join("");

    document.querySelectorAll(`[data-shift-status="${slot}"]`).forEach((checkbox, index) => {
        checkbox.addEventListener("change", () => {
            const status = statuses[index];

            if (checkbox.checked) filter.statuses.add(status);
            else filter.statuses.delete(status);

            renderShiftStatusFilters(slot);
            renderUploadSlotStatuses();
            rebuildSkuStatistics();
            queueSaveShiftFilterConfig(slot);
        });
    });
}

function setShiftTab(slot) {
    state.activeShiftTab = slot;
}

function renderReportDateUi({ reloadShiftConfig = false } = {}) {
    const input = $("reportDateInput");
    const label = $("reportDateLabel");

    if (!input) return;

    if (!input.value) {
        input.value = getLocalTodayKey();
    }

    if (label) label.textContent = formatDateLabel(input.value);

    if (reloadShiftConfig) {
        loadShiftConfigurationForReportDate(input.value);
    } else {
        renderUploadSlotStatuses();
    }
}

function formatStatusList(statuses) {
    if (!statuses?.length) return "Chưa chọn trạng thái";

    return statuses.map(status => {
        if (status.startsWith("Người mua xác nhận")) {
            return "Người mua đã nhận hàng";
        }
        return status;
    }).join(", ");
}

function renderUploadSlotStatuses() {
    const reportDate = getSelectedReportDate();

    ["morning", "afternoon"].forEach(slot => {
        const element = $(slot === "morning" ? "morningFileStatus" : "afternoonFileStatus");
        if (!element) return;

        const latest = getLatestImportForSlot(reportDate, slot);
        const rawRows = getRawRowsForReportSlot(reportDate, slot);

        element.className = "stats-upload-file-status";

        if (!latest) {
            element.innerHTML = `Chưa upload file ${slot === "morning" ? "sáng" : "chiều"}.`;
            return;
        }

        element.innerHTML = `
            <strong>✓ ${escapeHTML(latest.fileName)}</strong><br>
            ${formatNumber(rawRows.length)} dòng · ${formatDateTimeVi(latest.importedAt)}
        `;
    });
}

async function processShopeeUpload(file, slot, inputElement) {
    if (!requirePermissionV40("UPLOAD_SHOPEE")) {
        if (inputElement) inputElement.value = "";
        return;
    }

    if (!file) return;

    const reportDate = getSelectedReportDate();
    const filter = getShiftFilter(slot);

    if (!reportDate) {
        alert("Hãy chọn NGÀY BÁO CÁO trước.");
        inputElement.value = "";
        return;
    }

    try {
        showToast(`Đang đọc TOÀN BỘ file ${slotLabel(slot).toLowerCase()}...`);
        setCloudStatus("☁️ Đang đồng bộ...", "syncing");

        const rows = await readExcelFile(file);
        const parsedAll = parseShopeeRows(rows);
        const validationError = validateShopeeFile(rows, parsedAll, file.name);

        if (validationError) {
            inputElement.value = "";
            setCloudStatus("☁️ Supabase Cloud");
            alert(validationError);
            return;
        }

        if (!parsedAll.length) {
            inputElement.value = "";
            setCloudStatus("☁️ Supabase Cloud");
            alert("File không có dòng SKU hợp lệ.");
            return;
        }

        const nowIso = new Date().toISOString();
        const baseFingerprint = await createFileFingerprint(file);
        const importKey = `${reportDate}|${slot}|${baseFingerprint}`;

        // V14: LƯU TOÀN BỘ DÒNG CỦA FILE.
        const rowsToSave = parsedAll.map(row => {
            const savedRow = {
                ...row,
                sourceOrderDate: row.orderDate || "",
                orderDate: reportDate,
                reportDate,
                importSlot: slot,
                updatedAt: nowIso,
                sourceFile: file.name
            };

            savedRow.rowKey = createPersistentRowKey(savedRow);
            return savedRow;
        });

        // Nếu ngày đang chọn không có trong file, tự chọn ngày phù hợp đầu tiên.
        const availableDates = [...new Set(
            parsedAll.map(row => row.orderDate).filter(Boolean)
        )].sort();

        const previousSelectedDates = [...getShiftSelectedDates(filter)];
        const validSelectedDates = previousSelectedDates.filter(dateKey => availableDates.includes(dateKey));

        if (validSelectedDates.length) {
            setShiftSelectedDates(filter, validSelectedDates);
        } else {
            setShiftSelectedDates(filter, [
                slot === "morning"
                    ? (availableDates[0] || "")
                    : (availableDates[availableDates.length - 1] || "")
            ]);
        }

        // Nếu chưa có trạng thái được chọn thì dùng mặc định.
        if (!filter.statuses?.size) {
            filter.statuses = createDefaultShiftStatusSet();
        }

        await dbReplaceShiftData(
            reportDate,
            slot,
            rowsToSave,
            {
                hash: importKey,
                fileName: file.name,
                fileSize: file.size,
                importedAt: nowIso,
                rowCount: rowsToSave.length,
                added: rowsToSave.length,
                updated: 0,
                unchanged: 0,
                dates: [reportDate],
                reportDate,
                importSlot: slot,
                sourceDate: [...getShiftSelectedDates(filter)].sort()[0] || "",
                sourceDates: [...getShiftSelectedDates(filter)].sort(),
                selectedStatuses: [...filter.statuses],
                savedAllRows: true
            }
        );

        await loadSavedDataFromDb({ resetFilters: false });

        state.selectedDates = new Set([reportDate]);
        state.dateFilterInitialized = true;

        inputElement.value = "";

        // Nạp lại config vừa lưu nhưng không lọc mất dữ liệu.
        loadShiftConfigurationForReportDate(reportDate);

        renderAll();
        setShiftTab(slot);
        openStatsDay(reportDate);

        setCloudStatus("☁️ Supabase Cloud");

        const filteredRows = getFilteredRowsForReportSlot(reportDate, slot);

        showToast(
            `${slotLabel(slot)}: đã đọc toàn bộ ${formatNumber(rowsToSave.length)} dòng; ` +
            `bộ lọc hiện tại lấy ${formatNumber(filteredRows.length)} dòng.`
        );
    } catch (error) {
        console.error(error);
        inputElement.value = "";
        setCloudStatus("☁️ Lỗi đồng bộ", "error");

        alert(
            "Không đọc hoặc lưu được file.\n\n" +
            (error?.message || "")
        );
    }
}

$("morningFile")?.addEventListener("change", event => {
    processShopeeUpload(event.target.files[0], "morning", event.target);
});

$("afternoonFile")?.addEventListener("change", event => {
    processShopeeUpload(event.target.files[0], "afternoon", event.target);
});

$("morningSourceDate")?.addEventListener("change", event => {
    setShiftSelectedDates(getShiftFilter("morning"), event.target.value ? [event.target.value] : []);
    renderAvailableDates("morning");
    renderShiftStatusFilters("morning");
    renderUploadSlotStatuses();
    rebuildSkuStatistics();
    queueSaveShiftFilterConfig("morning");
});

$("afternoonSourceDate")?.addEventListener("change", event => {
    setShiftSelectedDates(getShiftFilter("afternoon"), event.target.value ? [event.target.value] : []);
    renderAvailableDates("afternoon");
    renderShiftStatusFilters("afternoon");
    renderUploadSlotStatuses();
    rebuildSkuStatistics();
    queueSaveShiftFilterConfig("afternoon");
});

$("reportDateInput")?.addEventListener("change", event => {
    const reportDate = event.target.value;

    state.selectedDates = new Set([reportDate]);
    state.dateFilterInitialized = true;

    renderReportDateUi({ reloadShiftConfig: true });
    rebuildSkuStatistics();
});

document.querySelectorAll("[data-shift-tab]").forEach(button => {
    button.addEventListener("click", () => setShiftTab(button.dataset.shiftTab));
});

document.querySelectorAll("[data-status-all]").forEach(button => {
    button.addEventListener("click", () => {
        const slot = button.dataset.statusAll;
        getShiftFilter(slot).statuses = new Set(getObservedStatuses(getSelectedReportDate(), slot));
        renderShiftStatusFilters(slot);
        renderUploadSlotStatuses();
        rebuildSkuStatistics();
        queueSaveShiftFilterConfig(slot);
    });
});

document.querySelectorAll("[data-status-clear]").forEach(button => {
    button.addEventListener("click", () => {
        const slot = button.dataset.statusClear;
        getShiftFilter(slot).statuses.clear();
        renderShiftStatusFilters(slot);
        renderUploadSlotStatuses();
        rebuildSkuStatistics();
        queueSaveShiftFilterConfig(slot);
    });
});

/* ======================== LỌC THEO NGÀY ĐẶT HÀNG ======================== */
function renderDateFilters() {
    const select = $("statsReportDateSelect");

    const savedDates = [...new Set(
        state.skuRows.map(row => row.orderDate).filter(Boolean)
    )].sort().reverse();

    let selectedDate = [...state.selectedDates][0] || getSelectedReportDate() || getLocalTodayKey();

    // Ngày mới chưa có dữ liệu vẫn được giữ để người dùng upload.
    const dates = [...new Set([selectedDate, ...savedDates].filter(Boolean))];

    if (select) {
        select.innerHTML = dates.map(dateKey => `
            <option value="${escapeHTML(dateKey)}" ${dateKey === selectedDate ? "selected" : ""}>
                ${formatDateLabel(dateKey)}
            </option>
        `).join("");
    }

    state.selectedDates = new Set([selectedDate]);
    state.dateFilterInitialized = true;

    renderStatsShiftSummaries(selectedDate);
}


/* ======================== V16 - LỊCH 12 THÁNG ======================== */
const CALENDAR_MIN_YEAR = 2026;
const CALENDAR_MAX_YEAR = 2035;

const VI_MONTH_NAMES = [
    "Tháng 1","Tháng 2","Tháng 3","Tháng 4",
    "Tháng 5","Tháng 6","Tháng 7","Tháng 8",
    "Tháng 9","Tháng 10","Tháng 11","Tháng 12"
];

function formatDateKey(year, monthIndex, day) {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDaysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
}

function getMondayFirstOffset(year, monthIndex) {
    // JS: 0=CN, 1=T2 ... -> đổi thành T2=0 ... CN=6
    const jsDay = new Date(year, monthIndex, 1).getDay();
    return (jsDay + 6) % 7;
}

function getCalendarDayMeta(dateKey) {
    const rows = state.skuRows.filter(row => row.orderDate === dateKey);

    const morningRows = rows.filter(row => normalizeRowSlot(row) === "morning");
    const afternoonRows = rows.filter(row => normalizeRowSlot(row) === "afternoon");

    return {
        hasData: rows.length > 0,
        hasMorning: morningRows.length > 0 || Boolean(getLatestImportForSlot(dateKey, "morning")),
        hasAfternoon: afternoonRows.length > 0 || Boolean(getLatestImportForSlot(dateKey, "afternoon")),
        morningRows: morningRows.length,
        afternoonRows: afternoonRows.length,
        totalRows: rows.length
    };
}

function getCalendarYearDefault() {
    const current = new Date().getFullYear();

    if (current >= CALENDAR_MIN_YEAR && current <= CALENDAR_MAX_YEAR) {
        return current;
    }

    const selected = [...state.selectedDates][0];
    const selectedYear = Number(String(selected || "").slice(0, 4));

    if (selectedYear >= CALENDAR_MIN_YEAR && selectedYear <= CALENDAR_MAX_YEAR) {
        return selectedYear;
    }

    return CALENDAR_MIN_YEAR;
}

function getDashboardReportGroups() {
    return getReportDateGroups().map(group => ({
        ...group,
        total: Number(group.morning || 0) + Number(group.afternoon || 0)
    }));
}

function aggregateGroups(groups) {
    return groups.reduce(
        (acc, item) => {
            acc.morning += Number(item.morning || 0);
            acc.afternoon += Number(item.afternoon || 0);
            acc.total += Number(item.total ?? ((item.morning || 0) + (item.afternoon || 0)));
            return acc;
        },
        { morning: 0, afternoon: 0, total: 0 }
    );
}

function formatShortDayRange(year, monthIndex, startDay, endDay) {
    const mm = String(monthIndex + 1).padStart(2, "0");
    return `${String(startDay).padStart(2, "0")}–${String(endDay).padStart(2, "0")}/${mm}/${year}`;
}

function getMonthWeekBuckets(year, monthIndex, groups) {
    const daysInMonth = getDaysInMonth(year, monthIndex);
    const firstOffset = getMondayFirstOffset(year, monthIndex);
    const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    const monthGroups = groups.filter(item => item.dateKey.startsWith(monthPrefix));

    const buckets = [];
    let gridStartDay = 1 - firstOffset;
    let weekNo = 1;

    while (gridStartDay <= daysInMonth) {
        const visibleStart = Math.max(1, gridStartDay);
        const visibleEnd = Math.min(daysInMonth, gridStartDay + 6);

        const selected = monthGroups.filter(item => {
            const day = Number(item.dateKey.slice(8, 10));
            return day >= visibleStart && day <= visibleEnd;
        });

        const total = aggregateGroups(selected);

        buckets.push({
            label: `Tuần ${weekNo}`,
            range: formatShortDayRange(year, monthIndex, visibleStart, visibleEnd),
            ...total
        });

        gridStartDay += 7;
        weekNo++;
    }

    return buckets;
}

function getMonthBuckets(year, groups) {
    return Array.from({ length: 12 }, (_, monthIndex) => {
        const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
        const selected = groups.filter(item => item.dateKey.startsWith(prefix));
        return {
            label: `Tháng ${monthIndex + 1}`,
            ...aggregateGroups(selected)
        };
    });
}

function getYearBuckets(groups) {
    return Array.from(
        { length: CALENDAR_MAX_YEAR - CALENDAR_MIN_YEAR + 1 },
        (_, index) => {
            const year = CALENDAR_MIN_YEAR + index;
            const prefix = `${year}-`;
            const selected = groups.filter(item => item.dateKey.startsWith(prefix));
            return {
                label: String(year),
                ...aggregateGroups(selected)
            };
        }
    );
}

function renderGroupedColumnChart(containerId, items, options = {}) {
    const container = $(containerId);
    if (!container) return;

    const visibleItems = options.hideZero
        ? items.filter(item => Number(item.total || 0) > 0)
        : items;

    if (
        !visibleItems.length ||
        !visibleItems.some(item =>
            Number(item.morning || 0) > 0 ||
            Number(item.afternoon || 0) > 0
        )
    ) {
        container.innerHTML =
            '<div class="hchart-empty">Chưa có dữ liệu để vẽ biểu đồ.</div>';
        return;
    }

    const maxValue = Math.max(
        ...visibleItems.flatMap(item => [
            Number(item.morning || 0),
            Number(item.afternoon || 0)
        ]),
        1
    );

    const chartClass = options.compact
        ? "grouped-column-chart compact"
        : "grouped-column-chart";

    container.innerHTML = `
        <div class="${chartClass}">
            ${visibleItems.map(item => {
                const morning = Number(item.morning || 0);
                const afternoon = Number(item.afternoon || 0);

                const morningHeight = (morning / maxValue) * 100;
                const afternoonHeight = (afternoon / maxValue) * 100;

                return `
                    <div class="gchart-group"
                         title="${escapeHTML(item.label)} · Sáng ${formatNumber(morning)} · Chiều ${formatNumber(afternoon)}">

                        <div class="gchart-bars">
                            <div class="gchart-bar-wrap">
                                <div class="gchart-value">
                                    ${morning ? formatNumber(morning) : ""}
                                </div>
                                <div
                                    class="gchart-bar morning ${morning ? "" : "zero"}"
                                    style="height:${morning ? morningHeight : 0}%"
                                ></div>
                            </div>

                            <div class="gchart-bar-wrap">
                                <div class="gchart-value">
                                    ${afternoon ? formatNumber(afternoon) : ""}
                                </div>
                                <div
                                    class="gchart-bar afternoon ${afternoon ? "" : "zero"}"
                                    style="height:${afternoon ? afternoonHeight : 0}%"
                                ></div>
                            </div>
                        </div>

                        <div class="gchart-label" title="${escapeHTML(item.label)}">
                            ${escapeHTML(item.label)}
                        </div>
                    </div>
                `;
            }).join("")}
        </div>

        <div class="gchart-legend">
            <span><i class="morning"></i>Buổi sáng</span>
            <span><i class="afternoon"></i>Buổi chiều</span>
        </div>
    `;
}

function renderDailyQuantityChart(year, monthIndex, groups) {
    const container = $("dailyQuantityChart");
    if (!container) return;

    const days = getDaysInMonth(year, monthIndex);
    const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

    const dayMap = new Map(
        groups
            .filter(item => item.dateKey.startsWith(prefix))
            .map(item => [Number(item.dateKey.slice(8, 10)), item])
    );

    const items = Array.from({ length: days }, (_, index) => {
        const day = index + 1;
        const data = dayMap.get(day) || {};

        return {
            day,
            morning: Number(data.morning || 0),
            afternoon: Number(data.afternoon || 0)
        };
    });

    const maxValue = Math.max(
        ...items.flatMap(item => [item.morning, item.afternoon]),
        1
    );

    container.innerHTML = items.map(item => {
        const morningHeight = (item.morning / maxValue) * 100;
        const afternoonHeight = (item.afternoon / maxValue) * 100;

        return `
            <div class="daily-bar-col"
                 title="Ngày ${item.day}: Sáng ${formatNumber(item.morning)} · Chiều ${formatNumber(item.afternoon)}">

                <div class="daily-pair-bars">
                    <div class="daily-single-wrap">
                        <div class="daily-single-value">
                            ${item.morning ? formatNumber(item.morning) : ""}
                        </div>

                        <div
                            class="daily-single-bar morning ${item.morning ? "" : "zero"}"
                            style="height:${item.morning ? morningHeight : 0}%"
                        ></div>
                    </div>

                    <div class="daily-single-wrap">
                        <div class="daily-single-value">
                            ${item.afternoon ? formatNumber(item.afternoon) : ""}
                        </div>

                        <div
                            class="daily-single-bar afternoon ${item.afternoon ? "" : "zero"}"
                            style="height:${item.afternoon ? afternoonHeight : 0}%"
                        ></div>
                    </div>
                </div>

                <div class="daily-bar-label">${item.day}</div>
            </div>
        `;
    }).join("");
}

function renderDashboardMonthCalendar(year, monthIndex, groups) {
    const container = $("selectedMonthCalendar");
    if (!container) return;

    const days = getDaysInMonth(year, monthIndex);
    const offset = getMondayFirstOffset(year, monthIndex);
    const weekdays = ["T2","T3","T4","T5","T6","T7","CN"];
    const today = getLocalTodayKey();

    const groupMap = new Map(groups.map(item => [item.dateKey, item]));
    let savedDayCount = 0;
    let daysHtml = "";

    for (let i = 0; i < offset; i++) {
        daysHtml += '<div class="calendar-day-empty"></div>';
    }

    for (let day = 1; day <= days; day++) {
        const dateKey = formatDateKey(year, monthIndex, day);
        const meta = getCalendarDayMeta(dateKey);
        const group = groupMap.get(dateKey);
        const filteredTotal = group
            ? Number(group.morning || 0) + Number(group.afternoon || 0)
            : 0;

        if (meta.hasData) savedDayCount++;

        daysHtml += `
            <button
                type="button"
                class="calendar-day ${meta.hasData ? "saved" : ""} ${dateKey === today ? "today" : ""}"
                data-calendar-date="${dateKey}"
                title="${formatDateLabel(dateKey)} · Tổng ${formatNumber(filteredTotal)}"
            >
                <span class="calendar-day-number">${day}</span>
                ${filteredTotal ? `<span class="calendar-day-total">${formatNumber(filteredTotal)}</span>` : ""}

                <span class="day-slot-dots">
                    <i class="day-slot-dot morning ${meta.hasMorning ? "on" : ""}"></i>
                    <i class="day-slot-dot afternoon ${meta.hasAfternoon ? "on" : ""}"></i>
                </span>
            </button>
        `;
    }

    container.innerHTML = `
        <div class="month-weekdays">
            ${weekdays.map(dayName => `<span>${dayName}</span>`).join("")}
        </div>

        <div class="month-days">
            ${daysHtml}
        </div>
    `;

    if ($("selectedMonthDayCount")) {
        $("selectedMonthDayCount").textContent = `${savedDayCount} ngày có dữ liệu`;
    }

    document.querySelectorAll("[data-calendar-date]").forEach(button => {
        button.addEventListener("click", () => {
            openStatsDay(button.dataset.calendarDate);
        });
    });
}

function renderWeeklyDashboard(year, monthIndex, groups) {
    const items = getMonthWeekBuckets(year, monthIndex, groups);
    const body = $("weeklyStatsBody");

    if (body) {
        body.innerHTML = items.map((item, index) => `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${escapeHTML(item.label)}</strong></td>
                <td>${escapeHTML(item.range)}</td>
                <td>${formatNumber(item.morning)}</td>
                <td>${formatNumber(item.afternoon)}</td>
                <td class="analytics-total">${formatNumber(item.total)}</td>
            </tr>
        `).join("");
    }

    renderGroupedColumnChart("weeklyStatsChart", items, { compact: true });

    if ($("weeklyStatsSubtitle")) {
        $("weeklyStatsSubtitle").textContent =
            `${VI_MONTH_NAMES[monthIndex]} năm ${year}.`;
    }
}

function renderMonthlyDashboard(year, groups) {
    const items = getMonthBuckets(year, groups);
    const body = $("monthlyStatsBody");

    if (body) {
        body.innerHTML = items.map((item, index) => `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${escapeHTML(item.label)}</strong></td>
                <td>${formatNumber(item.morning)}</td>
                <td>${formatNumber(item.afternoon)}</td>
                <td class="analytics-total">${formatNumber(item.total)}</td>
            </tr>
        `).join("");
    }

    renderGroupedColumnChart("monthlyStatsChart", items);

    if ($("monthlyStatsSubtitle")) {
        $("monthlyStatsSubtitle").textContent = `12 tháng của năm ${year}.`;
    }

    if ($("monthlyChartYearLabel")) {
        $("monthlyChartYearLabel").textContent = `2 cột Sáng / Chiều · Năm ${year}`;
    }
}

function renderYearlyDashboard(groups) {
    const items = getYearBuckets(groups);
    const body = $("yearlyStatsBody");

    if (body) {
        body.innerHTML = items.map((item, index) => `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${escapeHTML(item.label)}</strong></td>
                <td>${formatNumber(item.morning)}</td>
                <td>${formatNumber(item.afternoon)}</td>
                <td class="analytics-total">${formatNumber(item.total)}</td>
            </tr>
        `).join("");
    }

    renderGroupedColumnChart("yearlyStatsChart", items);
}

function renderStatsCalendar() {
    const yearSelect = $("calendarYearSelect");
    const monthSelect = $("calendarMonthSelect");

    if (!yearSelect || !monthSelect) return;

    let year = Number(yearSelect.value) || getCalendarYearDefault();
    let month = Number(monthSelect.value) || 1;

    if (year < CALENDAR_MIN_YEAR || year > CALENDAR_MAX_YEAR) {
        year = getCalendarYearDefault();
        yearSelect.value = String(year);
    }

    if (month < 1 || month > 12) {
        month = 1;
        monthSelect.value = "1";
    }

    const monthIndex = month - 1;
    const groups = getDashboardReportGroups();
    const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
    const selectedMonthGroups = groups.filter(item => item.dateKey.startsWith(monthPrefix));
    const monthTotal = aggregateGroups(selectedMonthGroups);
    const activeDays = selectedMonthGroups.filter(item => item.total > 0).length;
    const average = activeDays ? monthTotal.total / activeDays : 0;

    if ($("selectedMonthTitle")) {
        $("selectedMonthTitle").textContent = `${VI_MONTH_NAMES[monthIndex]} / ${year}`;
    }

    if ($("dailyChartSubtitle")) {
        $("dailyChartSubtitle").textContent =
            `${VI_MONTH_NAMES[monthIndex]} năm ${year} · Sáng + Chiều.`;
    }

    if ($("selectedMonthTotal")) {
        $("selectedMonthTotal").textContent = formatNumber(monthTotal.total);
    }

    if ($("selectedMonthActiveDays")) {
        $("selectedMonthActiveDays").textContent = formatNumber(activeDays);
    }

    if ($("selectedMonthAverage")) {
        $("selectedMonthAverage").textContent = formatNumber(
            Math.round(average * 10) / 10
        );
    }

    renderDashboardMonthCalendar(year, monthIndex, groups);
    renderDailyQuantityChart(year, monthIndex, groups);
    renderWeeklyDashboard(year, monthIndex, groups);
    renderMonthlyDashboard(year, groups);
    renderYearlyDashboard(groups);
}

function showStatsCalendar() {
    const calendar = $("statsCalendarScreen");
    const detail = $("statsDetailScreen");
    const yearSelect = $("calendarYearSelect");
    const monthSelect = $("calendarMonthSelect");

    if (calendar) calendar.classList.remove("hidden");
    if (detail) detail.classList.add("hidden");

    const selectedDate = [...state.selectedDates][0];
    const selectedYear = Number(String(selectedDate || "").slice(0, 4));
    const selectedMonth = Number(String(selectedDate || "").slice(5, 7));

    if (
        yearSelect &&
        selectedYear >= CALENDAR_MIN_YEAR &&
        selectedYear <= CALENDAR_MAX_YEAR
    ) {
        yearSelect.value = String(selectedYear);
    }

    if (
        monthSelect &&
        selectedMonth >= 1 &&
        selectedMonth <= 12
    ) {
        monthSelect.value = String(selectedMonth);
    }

    renderStatsCalendar();

    writeUiStateV17({
        view: "sku-stats",
        skuMode: "calendar",
        calendarYear: yearSelect?.value || "",
        calendarMonth: monthSelect?.value || ""
    });
}

function showStatsDetail() {
    const calendar = $("statsCalendarScreen");
    const detail = $("statsDetailScreen");

    if (calendar) calendar.classList.add("hidden");
    if (detail) detail.classList.remove("hidden");
    writeUiStateV17({
        view: "sku-stats",
        skuMode: "detail",
        reportDate: [...state.selectedDates][0] || getSelectedReportDate() || ""
    });
}

function openStatsDay(dateKey) {
    if (!dateKey) return;

    state.selectedDates = new Set([dateKey]);
    state.dateFilterInitialized = true;

    if ($("reportDateInput")) {
        $("reportDateInput").value = dateKey;
    }

    loadShiftConfigurationForReportDate(dateKey);

    openView("sku-stats", { restoreScroll: false });
    showStatsDetail();

    renderReportDateUi();
    renderDateFilters();
    syncShiftInputsFromState();
    rebuildSkuStatistics();

    writeUiStateV17({
        view: "sku-stats",
        skuMode: "detail",
        reportDate: dateKey,
        calendarYear: String(dateKey).slice(0, 4),
        calendarMonth: String(Number(String(dateKey).slice(5, 7)))
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
}

$("calendarMonthSelect")?.addEventListener("change", event => {
    writeUiStateV17({
        view: "sku-stats",
        skuMode: "calendar",
        calendarMonth: event.target.value,
        calendarYear: $("calendarYearSelect")?.value || ""
    });
    renderStatsCalendar();
});

$("calendarYearSelect")?.addEventListener("change", event => {
    writeUiStateV17({
        view: "sku-stats",
        skuMode: "calendar",
        calendarYear: event.target.value,
        calendarMonth: $("calendarMonthSelect")?.value || ""
    });
    renderStatsCalendar();
});
$("btnBackCalendar")?.addEventListener("click", showStatsCalendar);


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
    // V13: trạng thái được chọn riêng lúc nhập BUỔI SÁNG / BUỔI CHIỀU.
}

/* ======================== SKU STATS ======================== */
$("skuCountMode").addEventListener("change", () => {
    state.countMode = $("skuCountMode").value;
    rebuildSkuStatistics();
});


function renderStatsShiftSummaries(reportDate) {
    const morning = getLatestImportForSlot(reportDate, "morning");
    const afternoon = getLatestImportForSlot(reportDate, "afternoon");

    const morningRows = reportDate
        ? getFilteredRowsForReportSlot(reportDate, "morning")
        : [];

    const afternoonRows = reportDate
        ? getFilteredRowsForReportSlot(reportDate, "afternoon")
        : [];

    const morningEl = $("morningConfigSummary");
    const afternoonEl = $("afternoonConfigSummary");

    if (morningEl) {
        morningEl.textContent = morning
            ? `${formatShiftSelectedDates(getShiftFilter("morning"), reportDate)} · ${formatNumber(morningRows.length)} dòng`
            : "Chưa có dữ liệu";
    }

    if (afternoonEl) {
        afternoonEl.textContent = afternoon
            ? `${formatShiftSelectedDates(getShiftFilter("afternoon"), reportDate)} · ${formatNumber(afternoonRows.length)} dòng`
            : "Chưa có dữ liệu";
    }

    if ($("morningFilteredCount")) {
        $("morningFilteredCount").textContent =
            `${formatNumber(morningRows.length)} dòng / ${formatNumber(uniqueSkuCountForRows(morningRows))} SKU`;
    }

    if ($("afternoonFilteredCount")) {
        $("afternoonFilteredCount").textContent =
            `${formatNumber(afternoonRows.length)} dòng / ${formatNumber(uniqueSkuCountForRows(afternoonRows))} SKU`;
    }
}

$("statsReportDateSelect")?.addEventListener("change", event => {
    const dateKey = event.target.value;
    if (!dateKey) return;

    state.selectedDates = new Set([dateKey]);
    state.dateFilterInitialized = true;

    if ($("reportDateInput")) $("reportDateInput").value = dateKey;

    loadShiftConfigurationForReportDate(dateKey);
    rebuildSkuStatistics();
    renderStatsShiftSummaries(dateKey);
});

$("btnOpenHistory")?.addEventListener("click", () => openView("history"));


/* ======================== V57.2 - TỰ ĐỘNG TRỪ ĐƠN HỦY TỪ FILE CHIỀU ======================== */
function normalizeOrderIdV571(value) {
    return String(value || "").trim().toUpperCase();
}

function isCancelledShopeeStatusV571(status) {
    const text = normalizeText(status || "");
    return text === "dahuy" || text === "huy" || text.startsWith("dahuy");
}

function getCountableRowsV571(reportDate, slot) {
    // Đơn đã hủy tuyệt đối không được cộng vào lượng cần chuẩn bị,
    // kể cả khi người dùng vô tình bật trạng thái "Đã hủy" trong popup lọc.
    return getFilteredRowsForReportSlot(reportDate, slot)
        .filter(row => !isCancelledShopeeStatusV571(row.status));
}

function getCancellationDeductionInfoV571(reportDate, morningRowsOverride = null) {
    // V57.2: File BUỔI CHIỀU của ngày D chỉ dùng để rà lại đơn ĐẶT NGÀY D-1.
    // Ví dụ reportDate = 15/08 thì chỉ lấy các dòng trong file chiều có:
    //   Ngày đặt hàng = 14/08  VÀ  Trạng thái = Đã hủy.
    // Sau đó mới đối chiếu Mã đơn với phần Buổi sáng đã được tính để trừ đúng đơn.
    const previousOrderDate = reportDate ? addDaysToDateKey(reportDate, -1) : "";
    const afternoonRaw = reportDate ? getRawRowsForReportSlot(reportDate, "afternoon") : [];
    const cancelledOrders = new Map();

    afternoonRaw.forEach(row => {
        if (!isCancelledShopeeStatusV571(row.status)) return;

        const sourceOrderDate = normalizeOrderDate(row.sourceOrderDate || "") || row.sourceOrderDate || "";
        if (!previousOrderDate || sourceOrderDate !== previousOrderDate) return;

        const key = normalizeOrderIdV571(row.orderId);
        if (!key) return;
        if (!cancelledOrders.has(key)) {
            cancelledOrders.set(key, {
                orderId: row.orderId || key,
                status: row.status || "Đã hủy",
                sourceOrderDate,
                rows: []
            });
        }
        cancelledOrders.get(key).rows.push(row);
    });

    const morningRows = Array.isArray(morningRowsOverride)
        ? morningRowsOverride
        : (reportDate ? getCountableRowsV571(reportDate, "morning") : []);

    const deductionRows = morningRows.filter(row => {
        const key = normalizeOrderIdV571(row.orderId);
        if (!key || !cancelledOrders.has(key)) return false;

        // Chỉ trừ đúng phần đơn ngày D-1 đã được tính trong Buổi sáng.
        const sourceOrderDate = normalizeOrderDate(row.sourceOrderDate || "") || row.sourceOrderDate || "";
        return sourceOrderDate === previousOrderDate;
    });

    const matchedOrderKeys = new Set(
        deductionRows.map(row => normalizeOrderIdV571(row.orderId)).filter(Boolean)
    );

    const unitTotal = deductionRows.reduce((total, row) => {
        return total + (state.countMode === "quantity" ? Number(row.quantity || 0) : 1);
    }, 0);

    return {
        previousOrderDate,
        cancelledOrders,
        deductionRows,
        matchedOrderKeys,
        detectedOrderCount: cancelledOrders.size,
        matchedOrderCount: matchedOrderKeys.size,
        unitTotal
    };
}
function renderCancellationCardV571(reportDate, morningRowsOverride = null) {
    const info = getCancellationDeductionInfoV571(reportDate, morningRowsOverride);
    const summary = $("cancelAutoSummaryV571");
    const deduct = $("cancelAutoDeductV571");
    const button = $("btnCancelDetailV571");

    if (summary) {
        if (!getLatestImportForSlot(reportDate, "afternoon")) {
            summary.textContent = "Chưa có file chiều để đối chiếu.";
        } else if (!info.detectedOrderCount) {
            summary.textContent = info.previousOrderDate
                ? `File chiều ${formatDateLabel(reportDate)} chưa phát hiện đơn ĐẶT ${formatDateLabel(info.previousOrderDate)} bị Đã hủy.`
                : "File chiều chưa phát hiện đơn hủy của ngày trước.";
        } else {
            summary.textContent = `${formatNumber(info.detectedOrderCount)} đơn đặt ${formatDateLabel(info.previousOrderDate)} đã hủy trong file chiều ${formatDateLabel(reportDate)} · ${formatNumber(info.matchedOrderCount)} đơn được trừ`;
        }
    }

    if (deduct) {
        deduct.textContent = info.matchedOrderCount
            ? `Đã tự động trừ khỏi Buổi sáng: ${formatNumber(info.unitTotal)} ${state.countMode === "quantity" ? "sản phẩm" : "dòng SKU"}.`
            : `Chỉ trừ đơn đặt ${formatDateLabel(info.previousOrderDate)} nếu Mã đơn đó đã được tính trong Buổi sáng.`;
    }

    if (button) button.disabled = !info.detectedOrderCount;
    renderCancellationDetailV571(reportDate, info);
    return info;
}

function renderCancellationDetailV571(reportDate, providedInfo = null) {
    const body = $("cancelDetailBodyV571");
    const summary = $("cancelDetailSummaryV571");
    if (!body) return;

    const info = providedInfo || getCancellationDeductionInfoV571(reportDate);
    const afternoonStatusMap = new Map();
    info.cancelledOrders.forEach((value, key) => afternoonStatusMap.set(key, value.status || "Đã hủy"));

    if (summary) {
        summary.textContent = `File chiều ${formatDateLabel(reportDate)}: ${formatNumber(info.detectedOrderCount)} đơn đặt ${formatDateLabel(info.previousOrderDate)} đã hủy · ${formatNumber(info.matchedOrderCount)} đơn khớp Buổi sáng và được trừ.`;
    }

    if (!info.deductionRows.length) {
        body.innerHTML = '<tr><td colspan="7" class="empty-table">Có đơn đặt ngày trước bị hủy trong file chiều, nhưng chưa có Mã đơn nào trùng với phần Buổi sáng đang được tính.</td></tr>';
        return;
    }

    body.innerHTML = info.deductionRows.map((row, index) => {
        const key = normalizeOrderIdV571(row.orderId);
        const deductValue = state.countMode === "quantity" ? Number(row.quantity || 0) : 1;
        return `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${escapeHTML(row.orderId || "-")}</strong></td>
                <td>${row.sourceOrderDate ? formatDateLabel(row.sourceOrderDate) : "-"}</td>
                <td><strong>${escapeHTML(row.sku || "-")}</strong></td>
                <td>${escapeHTML(row.product || "-")}</td>
                <td class="center cancel-value-v571">-${formatNumber(deductValue)}</td>
                <td><span class="cancel-status-v571">${escapeHTML(afternoonStatusMap.get(key) || "Đã hủy")}</span></td>
            </tr>`;
    }).join("");
}

function openShiftFilterModalV571() {
    $("shiftFilterModalV571")?.classList.remove("hidden");
}
function closeShiftFilterModalV571() {
    $("shiftFilterModalV571")?.classList.add("hidden");
}
function openCancelDetailModalV571() {
    const reportDate = [...state.selectedDates][0] || getSelectedReportDate() || "";
    renderCancellationDetailV571(reportDate);
    $("cancelDetailModalV571")?.classList.remove("hidden");
}
function closeCancelDetailModalV571() {
    $("cancelDetailModalV571")?.classList.add("hidden");
}

document.querySelectorAll("[data-open-shift-filter-v571]").forEach(button => {
    button.addEventListener("click", openShiftFilterModalV571);
});
$("btnCloseShiftFilterV571")?.addEventListener("click", closeShiftFilterModalV571);
$("btnDoneShiftFilterV571")?.addEventListener("click", closeShiftFilterModalV571);
$("shiftFilterModalV571")?.addEventListener("click", event => {
    if (event.target === $("shiftFilterModalV571")) closeShiftFilterModalV571();
});

$("btnCancelDetailV571")?.addEventListener("click", openCancelDetailModalV571);
$("btnCloseCancelDetailV571")?.addEventListener("click", closeCancelDetailModalV571);
$("btnDoneCancelDetailV571")?.addEventListener("click", closeCancelDetailModalV571);
$("cancelDetailModalV571")?.addEventListener("click", event => {
    if (event.target === $("cancelDetailModalV571")) closeCancelDetailModalV571();
});

function rebuildSkuStatistics() {
    const modeSelect = $("skuCountMode");
    state.countMode = modeSelect?.value || state.countMode || "rows";

    const reportDate = [...state.selectedDates][0] || "";
    const statsMap = new Map();

    const morningRows = reportDate ? getCountableRowsV571(reportDate, "morning") : [];
    const afternoonRows = reportDate ? getCountableRowsV571(reportDate, "afternoon") : [];
    const cancellationInfo = getCancellationDeductionInfoV571(reportDate, morningRows);

    let morningTotal = 0;
    let afternoonTotal = 0;
    let cancelledTotal = 0;

    function ensureItem(row) {
        if (!statsMap.has(row.sku)) {
            statsMap.set(row.sku, {
                sku: row.sku,
                product: row.product,
                morning: 0,
                afternoon: 0,
                cancelled: 0,
                count: 0
            });
        }
        const item = statsMap.get(row.sku);
        if (!item.product && row.product) item.product = row.product;
        return item;
    }

    function rowValue(row) {
        return state.countMode === "quantity" ? Number(row.quantity || 0) : 1;
    }

    morningRows.forEach(row => {
        const add = rowValue(row);
        const item = ensureItem(row);
        item.morning += add;
        morningTotal += add;
    });

    afternoonRows.forEach(row => {
        const add = rowValue(row);
        const item = ensureItem(row);
        item.afternoon += add;
        afternoonTotal += add;
    });

    // V57.2: chỉ lấy trạng thái Đã hủy của đơn ĐẶT NGÀY D-1 từ file chiều ngày D,
    // rồi trừ các Mã đơn thực sự đã được cộng trong Buổi sáng.
    cancellationInfo.deductionRows.forEach(row => {
        const subtract = rowValue(row);
        const item = ensureItem(row);
        item.cancelled += subtract;
        cancelledTotal += subtract;
    });

    statsMap.forEach(item => {
        item.count = Math.max(0, Number(item.morning || 0) + Number(item.afternoon || 0) - Number(item.cancelled || 0));
    });

    state.skuStats = [...statsMap.values()]
        .filter(item => item.morning || item.afternoon || item.cancelled || item.count)
        .sort((a, b) => b.count - a.count || a.sku.localeCompare(b.sku));

    const totalCount = Math.max(0, morningTotal + afternoonTotal - cancelledTotal);
    const convertedTotals = calculateConvertedTotals();
    const convertedGrandTotal = sum(Object.values(convertedTotals));

    if ($("skuMorningCount")) $("skuMorningCount").textContent = formatNumber(morningTotal);
    if ($("skuAfternoonCount")) $("skuAfternoonCount").textContent = formatNumber(afternoonTotal);
    if ($("skuTotalCount")) $("skuTotalCount").textContent = formatNumber(totalCount);
    if ($("skuConvertedTotal")) $("skuConvertedTotal").textContent = formatNumber(convertedGrandTotal);

    if ($("overviewFilteredRows")) $("overviewFilteredRows").textContent = formatNumber(totalCount);
    if ($("overviewUniqueSku")) $("overviewUniqueSku").textContent = formatNumber(state.skuStats.length);
    if ($("overviewSkuCount")) $("overviewSkuCount").textContent = formatNumber(totalCount);
    if ($("overviewConvertedTotal")) $("overviewConvertedTotal").textContent = formatNumber(convertedGrandTotal);

    if ($("overviewCountModeText")) {
        $("overviewCountModeText").textContent = state.countMode === "rows"
            ? "Sáng + Chiều - Hủy"
            : "Cộng theo Số lượng và trừ đơn hủy";
    }

    if ($("navSkuCount")) $("navSkuCount").textContent = state.skuStats.length;

    const scopeText = $("skuTableScopeText");
    if (scopeText) {
        scopeText.textContent = reportDate
            ? `NGÀY BÁO CÁO ${formatDateLabel(reportDate)} · Sáng ${formatNumber(morningTotal)} · Chiều ${formatNumber(afternoonTotal)} · Hủy -${formatNumber(cancelledTotal)} · Tổng ${formatNumber(totalCount)}`
            : "Chưa chọn ngày báo cáo.";
    }

    renderConversionTable();
    renderConvertedTotals();
    renderCancellationCardV571(reportDate, morningRows);
    renderOverviewSkuTable();
    renderOverviewFileSummary();
    renderImportSummary();
    renderUploadSlotStatuses();
    renderStatsShiftSummaries(reportDate);
    renderHistory();
}

/* ======================== CONVERSION CONFIG ======================== */
function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function flattenDefaultRules() {
    const rows = [];

    Object.entries(DEFAULT_CONVERSION_RULES).forEach(([sourceSku, rule]) => {
        Object.entries(rule).forEach(([targetSku, factor]) => {
            const number = Number(factor) || 0;

            if (number > 0) {
                rows.push({
                    source_sku: sourceSku,
                    target_sku: targetSku,
                    factor: number,
                    updated_at: new Date().toISOString()
                });
            }
        });
    });

    return rows;
}

async function seedDefaultConversionCloud() {
    const client = initSupabaseClient();

    const targetRows = DEFAULT_BASE_SKUS.map((sku, index) => ({
        target_sku: sku,
        sort_order: index,
        updated_at: new Date().toISOString()
    }));

    const { error: targetError } = await client
        .from(DB_TARGETS)
        .upsert(targetRows, { onConflict: "target_sku" });

    if (targetError) throw targetError;

    const ruleRows = flattenDefaultRules();

    if (ruleRows.length) {
        const { error: ruleError } = await client
            .from(DB_RULES)
            .upsert(ruleRows, { onConflict: "source_sku,target_sku" });

        if (ruleError) throw ruleError;
    }
}

async function loadConversionConfigFromCloud() {
    const client = initSupabaseClient();

    let { data: targets, error: targetError } = await client
        .from(DB_TARGETS)
        .select("*")
        .order("sort_order", { ascending: true });

    if (targetError) throw targetError;

    let { data: rules, error: rulesError } = await client
        .from(DB_RULES)
        .select("*");

    if (rulesError) throw rulesError;

    if (!targets?.length) {
        await seedDefaultConversionCloud();

        const targetReload = await client
            .from(DB_TARGETS)
            .select("*")
            .order("sort_order", { ascending: true });

        if (targetReload.error) throw targetReload.error;
        targets = targetReload.data || [];
    }

    if (!rules?.length) {
        await seedDefaultConversionCloud();

        const rulesReload = await client
            .from(DB_RULES)
            .select("*");

        if (rulesReload.error) throw rulesReload.error;
        rules = rulesReload.data || [];
    }

    state.baseSkus = (targets || []).map(row => row.target_sku);

    state.conversionRules = {};

    (rules || []).forEach(row => {
        if (!state.conversionRules[row.source_sku]) {
            state.conversionRules[row.source_sku] = {};
        }

        state.conversionRules[row.source_sku][row.target_sku] =
            Number(row.factor) || 0;
    });
}

function getConversionFactor(sourceSku, baseSku) {
    return Number(state.conversionRules?.[sourceSku]?.[baseSku]) || 0;
}

async function setConversionFactor(sourceSku, baseSku, value) {
    assertPermissionV40("EDIT_CONVERSION");

    const client = initSupabaseClient();
    const number = Math.max(0, Number(value) || 0);

    if (!state.conversionRules[sourceSku]) {
        state.conversionRules[sourceSku] = {};
    }

    if (number <= 0) {
        delete state.conversionRules[sourceSku][baseSku];

        const { error } = await client
            .from(DB_RULES)
            .delete()
            .eq("source_sku", sourceSku)
            .eq("target_sku", baseSku);

        if (error) throw error;
        return;
    }

    state.conversionRules[sourceSku][baseSku] = number;

    const { error } = await client
        .from(DB_RULES)
        .upsert({
            source_sku: sourceSku,
            target_sku: baseSku,
            factor: number,
            updated_at: new Date().toISOString()
        }, { onConflict: "source_sku,target_sku" });

    if (error) throw error;
}

async function addConversionTargetCloud(sku) {
    assertPermissionV40("EDIT_CONVERSION");

    const client = initSupabaseClient();

    const { error } = await client
        .from(DB_TARGETS)
        .upsert({
            target_sku: sku,
            sort_order: state.baseSkus.length,
            updated_at: new Date().toISOString()
        }, { onConflict: "target_sku" });

    if (error) throw error;

    if (!state.baseSkus.includes(sku)) {
        state.baseSkus.push(sku);
    }
}

async function removeConversionTargetCloud(sku) {
    assertPermissionV40("EDIT_CONVERSION");

    const client = initSupabaseClient();

    const { error: ruleError } = await client
        .from(DB_RULES)
        .delete()
        .eq("target_sku", sku);

    if (ruleError) throw ruleError;

    const { error: targetError } = await client
        .from(DB_TARGETS)
        .delete()
        .eq("target_sku", sku);

    if (targetError) throw targetError;

    state.baseSkus = state.baseSkus.filter(item => item !== sku);

    Object.values(state.conversionRules).forEach(rule => {
        if (rule && typeof rule === "object") {
            delete rule[sku];
        }
    });
}

async function resetConversionCloud() {
    assertPermissionV40("EDIT_CONVERSION");

    const client = initSupabaseClient();

    const { error: ruleError } = await client
        .from(DB_RULES)
        .delete()
        .neq("source_sku", "__never__");

    if (ruleError) throw ruleError;

    const { error: targetError } = await client
        .from(DB_TARGETS)
        .delete()
        .neq("target_sku", "__never__");

    if (targetError) throw targetError;

    await seedDefaultConversionCloud();
    await loadConversionConfigFromCloud();
}

function hasAnyConversion(sourceSku) {
    return state.baseSkus.some(baseSku => getConversionFactor(sourceSku, baseSku) > 0);
}

function calculateConvertedTotalsForField(fieldName) {
    const totals = {};
    state.baseSkus.forEach(baseSku => totals[baseSku] = 0);

    state.skuStats.forEach(item => {
        const sourceCount = Number(item[fieldName] || 0);

        state.baseSkus.forEach(baseSku => {
            totals[baseSku] +=
                sourceCount *
                getConversionFactor(item.sku, baseSku);
        });
    });

    return totals;
}

function calculateConvertedTotals() {
    return calculateConvertedTotalsForField("count");
}

function renderConversionTable() {
    const head = $("skuStatsHead");
    const body = $("skuStatsBody");
    const foot = $("skuStatsFoot");
    const warning = $("conversionWarning");
    const colgroup = $("skuStatsColgroup");

    if (!head || !body || !foot || !warning || !colgroup) return;

    colgroup.innerHTML = `
        <col style="width:42px">
        <col style="width:88px">
        <col style="width:410px">
        <col style="width:74px">
        <col style="width:74px">
        <col style="width:72px">
        <col style="width:78px">
        ${state.baseSkus.map(baseSku =>
            `<col style="width:${baseSku === "OBM-100326-2" ? 102 : 62}px">`
        ).join("")}
        <col style="width:90px">
    `;

    head.innerHTML = `
        <tr>
            <th class="stt-col">STT</th>
            <th class="sku-header-cell">SKU sản phẩm</th>
            <th class="product-header-cell">Tên sản phẩm</th>
            <th class="stat-shift-col">Buổi sáng</th>
            <th class="stat-shift-col">Buổi chiều</th>
            <th class="stat-cancel-col-v571">Hủy (-)</th>
            <th class="stat-total-col">TỔNG</th>

            ${state.baseSkus.map(baseSku => `
                <th class="base-sku-header ${baseSku === "OBM-100326-2" ? "wide-base-sku" : ""}">
                    ${escapeHTML(baseSku)}
                    <button class="remove-base-sku" data-base-sku="${escapeHTML(baseSku)}" title="Xóa cột">×</button>
                </th>
            `).join("")}

            <th>Quy đổi</th>
        </tr>
    `;

    if (!state.skuStats.length) {
        body.innerHTML = `
            <tr>
                <td colspan="${8 + state.baseSkus.length}" class="empty-table">
                    Chưa có dữ liệu Sáng / Chiều cho ngày báo cáo đang chọn.
                </td>
            </tr>
        `;

        foot.innerHTML = "";
        warning.classList.add("hidden");
        bindRemoveBaseSkuButtons();
        return;
    }

    const unmapped = [];

    body.innerHTML = state.skuStats.map((item, index) => {
        const mapped = hasAnyConversion(item.sku);

        if (!mapped) unmapped.push(item.sku);

        return `
            <tr>
                <td class="stt-col">${index + 1}</td>

                <td class="sku-code-cell">
                    <strong>${escapeHTML(item.sku)}</strong>
                </td>

                <td class="product-name-cell">
                    ${escapeHTML(item.product)}
                </td>

                <td class="stat-shift-col">
                    ${item.morning ? formatNumber(item.morning) : ""}
                </td>

                <td class="stat-shift-col">
                    ${item.afternoon ? formatNumber(item.afternoon) : ""}
                </td>

                <td class="stat-cancel-col-v571">
                    ${item.cancelled ? `-${formatNumber(item.cancelled)}` : ""}
                </td>

                <td class="stat-total-col stat-total-value">
                    ${formatNumber(item.count)}
                </td>

                ${state.baseSkus.map(baseSku => {
                    const factor = getConversionFactor(item.sku, baseSku);
                    const wideClass = baseSku === "OBM-100326-2" ? "wide-base-sku-cell" : "";

                    return `
                        <td class="${wideClass}">
                            <input
                                class="conversion-input"
                                type="number"
                                min="0"
                                step="1"
                                inputmode="numeric"
                                data-source-sku="${escapeHTML(item.sku)}"
                                data-base-sku="${escapeHTML(baseSku)}"
                                value="${factor === 0 ? "" : factor}"
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
    const morningTotal = sum(state.skuStats.map(item => item.morning));
    const afternoonTotal = sum(state.skuStats.map(item => item.afternoon));
    const cancelledTotal = sum(state.skuStats.map(item => item.cancelled));
    const grandTotal = sum(state.skuStats.map(item => item.count));

    foot.innerHTML = `
        <tr>
            <td class="stt-col"></td>
            <td class="sku-code-cell"><strong>TỔNG</strong></td>
            <td>Sáng + Chiều - Hủy</td>
            <td class="stat-shift-col">${formatNumber(morningTotal)}</td>
            <td class="stat-shift-col">${formatNumber(afternoonTotal)}</td>
            <td class="stat-cancel-col-v571">${cancelledTotal ? `-${formatNumber(cancelledTotal)}` : ""}</td>
            <td class="stat-total-col">${formatNumber(grandTotal)}</td>

            ${state.baseSkus.map(baseSku => `
                <td class="conversion-total-highlight ${baseSku === "OBM-100326-2" ? "wide-base-sku-cell" : ""}">
                    ${formatNumber(totals[baseSku] || 0)}
                </td>
            `).join("")}

            <td></td>
        </tr>
    `;

    if (unmapped.length) {
        warning.classList.remove("hidden");
        warning.innerHTML =
            `⚠ Có <strong>${unmapped.length}</strong> SKU chưa cấu hình quy đổi: ` +
            `<strong>${unmapped.map(escapeHTML).join(", ")}</strong>.`;
    } else {
        warning.classList.add("hidden");
        warning.innerHTML = "";
    }

    document.querySelectorAll(".conversion-input").forEach(input => {
        const canEditConversion = hasPermissionV40("EDIT_CONVERSION");
        input.disabled = !canEditConversion;
        input.classList.toggle("v40-permission-locked", !canEditConversion);
        if (!canEditConversion) {
            input.title = permissionMessageV40("EDIT_CONVERSION");
        }

        input.addEventListener("focus", () => {
            if (hasPermissionV40("EDIT_CONVERSION")) input.select();
        });

        input.addEventListener("change", async () => {
            if (!requirePermissionV40("EDIT_CONVERSION")) {
                await loadConversionConfigFromCloud();
                rebuildSkuStatistics();
                return;
            }
            const raw = String(input.value || "").trim();
            const finalValue = raw === ""
                ? 0
                : Math.max(0, Number(raw) || 0);

            try {
                setCloudStatus("☁️ Đang lưu quy đổi...", "syncing");

                await setConversionFactor(
                    input.dataset.sourceSku,
                    input.dataset.baseSku,
                    finalValue
                );

                rebuildSkuStatistics();
                setCloudStatus("☁️ Supabase Cloud");
            } catch (error) {
                console.error(error);
                setCloudStatus("☁️ Lỗi lưu quy đổi", "error");
                alert("Không lưu được hệ số quy đổi lên cloud.");

                await loadConversionConfigFromCloud();
                rebuildSkuStatistics();
            }
        });
    });

    bindRemoveBaseSkuButtons();
}

function bindRemoveBaseSkuButtons() {
    document.querySelectorAll(".remove-base-sku").forEach(button => {
        button.classList.toggle(
            "v40-permission-hidden",
            !hasPermissionV40("EDIT_CONVERSION")
        );

        button.addEventListener("click", async () => {
            if (!requirePermissionV40("EDIT_CONVERSION")) return;
            const sku = button.dataset.baseSku;
            if (!confirm(`Xóa cột quy đổi ${sku} khỏi dữ liệu cloud?`)) return;

            try {
                setCloudStatus("☁️ Đang cập nhật...", "syncing");
                await removeConversionTargetCloud(sku);
                rebuildSkuStatistics();
                setCloudStatus("☁️ Supabase Cloud");
            } catch (error) {
                console.error(error);
                setCloudStatus("☁️ Lỗi đồng bộ", "error");
                alert("Không xóa được SKU quy đổi trên cloud.");
            }
        });
    });
}

$("btnAddBaseSku").addEventListener("click", async () => {
    if (!requirePermissionV40("EDIT_CONVERSION")) return;
    const value = prompt("Nhập SKU kho / SKU quy đổi muốn thêm:");
    if (!value) return;

    const sku = value.trim().toUpperCase();
    if (!sku) return;

    if (state.baseSkus.some(item => item.toUpperCase() === sku)) {
        alert("SKU quy đổi này đã tồn tại.");
        return;
    }

    try {
        setCloudStatus("☁️ Đang cập nhật...", "syncing");
        await addConversionTargetCloud(sku);
        rebuildSkuStatistics();
        setCloudStatus("☁️ Supabase Cloud");
    } catch (error) {
        console.error(error);
        setCloudStatus("☁️ Lỗi đồng bộ", "error");
        alert("Không thêm được SKU quy đổi lên cloud.");
    }
});

$("btnResetConversions").addEventListener("click", async () => {
    if (!requirePermissionV40("EDIT_CONVERSION")) return;
    if (!confirm("Khôi phục bảng quy đổi mẫu trên CLOUD? Thay đổi quy đổi hiện tại sẽ bị ghi lại.")) return;

    try {
        setCloudStatus("☁️ Đang khôi phục...", "syncing");
        await resetConversionCloud();
        rebuildSkuStatistics();
        setCloudStatus("☁️ Supabase Cloud");
        showToast("Đã khôi phục bảng quy đổi mẫu trên cloud.");
    } catch (error) {
        console.error(error);
        setCloudStatus("☁️ Lỗi đồng bộ", "error");
        alert("Không khôi phục được bảng quy đổi.");
    }
});

function renderConvertedTotals() {
    const body = $("convertedTotalsBody");

    const morningTotals = calculateConvertedTotalsForField("morning");
    const afternoonTotals = calculateConvertedTotalsForField("afternoon");
    const cancelledTotals = calculateConvertedTotalsForField("cancelled");
    const totalTotals = calculateConvertedTotalsForField("count");

    const rows = state.baseSkus
        .map(sku => ({
            sku,
            label: sku,
            morning: morningTotals[sku] || 0,
            afternoon: afternoonTotals[sku] || 0,
            cancelled: cancelledTotals[sku] || 0,
            total: totalTotals[sku] || 0
        }))
        .filter(item => item.total > 0 || item.cancelled > 0)
        .sort((a, b) => b.total - a.total);

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty-table">Chưa có dữ liệu quy đổi.</td></tr>';
        const chart = $("convertedTotalsChart");
        if (chart) chart.innerHTML = '<div class="hchart-empty">Chưa có dữ liệu để vẽ biểu đồ.</div>';
        return;
    }

    body.innerHTML = rows.map((item, index) => `
        <tr class="total-converted-table">
            <td class="stt-col">${index + 1}</td>
            <td class="converted-sku-cell"><strong>${escapeHTML(item.sku)}</strong></td>
            <td class="converted-shift-value">${item.morning ? formatNumber(item.morning) : ""}</td>
            <td class="converted-shift-value">${item.afternoon ? formatNumber(item.afternoon) : ""}</td>
            <td class="converted-cancel-value-v571">${item.cancelled ? `-${formatNumber(item.cancelled)}` : ""}</td>
            <td class="converted-total-value">${formatNumber(item.total)}</td>
        </tr>
    `).join("");

    renderGroupedColumnChart(
        "convertedTotalsChart",
        rows.slice(0, 12).map(item => ({ ...item, morning: Math.max(0, item.morning - item.cancelled) })),
        { hideZero: true, compact: true }
    );
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
    const dates = new Set(state.skuRows.map(row => row.orderDate).filter(Boolean));
    $("overviewFileName").textContent = state.skuRows.length
        ? `${formatNumber(dates.size)} ngày dữ liệu đã lưu`
        : "Chưa có dữ liệu";

    if (!state.skuRows.length) {
        $("overviewFileSummary").innerHTML =
            '<div class="empty-box">Nhập file đơn hàng Shopee để bắt đầu. Dữ liệu sẽ được lưu lên Supabase Cloud và dùng chung trên các máy.</div>';
        return;
    }

    const statuses = new Set(state.skuRows.map(row => row.status));
    const rawSkus = new Set(state.skuRows.map(row => row.sku));
    const orders = new Set(state.skuRows.map(row => row.orderId).filter(Boolean));

    $("overviewFileSummary").innerHTML = `
        <div class="summary-row"><span>Ngày đã lưu</span><strong>${formatNumber(dates.size)}</strong></div>
        <div class="summary-row"><span>Dòng SKU đang lưu</span><strong>${formatNumber(state.skuRows.length)}</strong></div>
        <div class="summary-row"><span>Mã đơn khác nhau</span><strong>${formatNumber(orders.size)}</strong></div>
        <div class="summary-row"><span>SKU khác nhau</span><strong>${formatNumber(rawSkus.size)}</strong></div>
        <div class="summary-row"><span>Lần upload đã lưu</span><strong>${formatNumber(state.imports.length)}</strong></div>
    `;
}

function renderImportSummary() {
    const statuses = new Set(state.skuRows.map(row => row.status));
    const rawSkus = new Set(state.skuRows.map(row => row.sku));

    if ($("importOrderCount")) $("importOrderCount").textContent = formatNumber(state.skuRows.length);
    if ($("importStatusCount")) $("importStatusCount").textContent = formatNumber(statuses.size);
    if ($("importRawSkuCount")) $("importRawSkuCount").textContent = formatNumber(rawSkus.size);
}

function formatDateTimeVi(isoText) {
    if (!isoText) return "-";
    const date = new Date(isoText);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function renderSavedDays() {
    const body = $("savedDaysBody");
    if (!body) return;

    const groups = getReportDateGroups();
    const allOrders = new Set(
        state.skuRows.map(row => row.orderId).filter(Boolean)
    );

    if ($("savedDayCount")) $("savedDayCount").textContent = formatNumber(groups.length);
    if ($("savedOrderCount")) $("savedOrderCount").textContent = formatNumber(allOrders.size);
    if ($("savedImportCount")) $("savedImportCount").textContent = formatNumber(state.imports.length);
    if ($("savedLastImport")) {
        $("savedLastImport").textContent =
            state.imports[0]?.importedAt
                ? formatDateTimeVi(state.imports[0].importedAt)
                : "-";
    }

    if (!groups.length) {
        body.innerHTML = '<tr><td colspan="7" class="empty-table">Chưa có dữ liệu được lưu.</td></tr>';
        return;
    }

    body.innerHTML = groups.slice(0, 10).map(group => `
        <tr>
            <td><strong>${formatDateLabel(group.dateKey)}</strong></td>
            <td class="center">${getLatestImportForSlot(group.dateKey, "morning") ? "✓" : ""}</td>
            <td class="center">${getLatestImportForSlot(group.dateKey, "afternoon") ? "✓" : ""}</td>
            <td class="center">${formatNumber(group.morning + group.afternoon)}</td>
            <td class="center">${formatNumber(group.orders.size)}</td>
            <td>${formatDateTimeVi(group.updatedAt)}</td>
            <td class="center">
                <button type="button" class="btn-view-history" data-quick-history="${escapeHTML(group.dateKey)}">
                    Xem
                </button>
            </td>
        </tr>
    `).join("");

    document.querySelectorAll("[data-quick-history]").forEach(button => {
        button.addEventListener("click", () => {
            const dateKey = button.dataset.quickHistory;
            openStatsDay(dateKey);
        });
    });
}


function renderTopFileState() {
    const pill = $("topFilePill");
    const text = $("topFileText");

    if (state.skuRows.length) {
        const days = new Set(state.skuRows.map(row => row.orderDate).filter(Boolean));
        pill.classList.add("loaded");
        text.textContent =
            `Đã lưu ${formatNumber(days.size)} ngày · ${formatNumber(state.skuRows.length)} dòng`;
    } else {
        pill.classList.remove("loaded");
        text.textContent = "Chưa có dữ liệu Shopee";
    }
}


/* ======================== ĐƠN HÀNG + HOÀN/HỦY ======================== */
function uniqueOrderCount(rows = state.skuRows) {
    return new Set(
        rows
            .map(row => String(row.orderId || "").trim())
            .filter(Boolean)
    ).size;
}

function isReturnOrCancelStatus(status) {
    const text = normalizeText(status);
    return (
        text.includes("trahang") ||
        text.includes("hoantra") ||
        text.includes("returned") ||
        text.includes("refund") ||
        text.includes("dahuy") ||
        text.includes("huy") ||
        text.includes("cancel")
    );
}


/* =========================================================
   V56 - ĐỒNG BỘ TRẠNG THÁI HÓA ĐƠN SANG ĐƠN HÀNG & TỒN KHO
========================================================= */
function invoiceStatusMetaV56(row){
    if(!row){return {key:"missing",label:"Chưa thấy MISA",note:"Chưa có dữ liệu MISA cho mã đơn này."};}
    if(row.pub && row.cqtPending){
        return {key:"cqt",label:"Đã phát hành · CQT",note:`CQT: ${row.pub.taxAuthorityStatus||"chưa hoàn tất"}`};
    }
    if(row.pub){return {key:"published",label:"Đã phát hành",note:"Đã ghép chính xác theo Mã ĐH của sàn."};}
    if(row.unpub){return {key:"unpublished",label:"Chưa phát hành",note:row.unpub.unissuedReason||"Đang chờ phát hành."};}
    if(row.delivered){return {key:"missing",label:"Đã giao · chưa MISA",note:"Đơn đã giao nhưng chưa thấy trong danh sách MISA."};}
    return {key:"tracking",label:"Theo dõi",note:"Chưa đến bước kết luận hóa đơn."};
}

function buildOrderInvoiceMapV56(){
    const map=new Map();
    try{
        buildMisaDirectRowsV54().forEach(row=>map.set(row.key,row));
    }catch(error){
        console.warn("V56 chưa tạo được map hóa đơn theo đơn:",error);
    }
    return map;
}

function invoiceStatusBadgeV56(orderRow){
    const meta=invoiceStatusMetaV56(orderRow);
    return `<span class="invoice-v56-status ${escapeHTML(meta.key)}">${escapeHTML(meta.label)}</span>`;
}

function buildInventoryInvoiceSummaryV56(){
    const orderMap=buildOrderInvoiceMapV56();
    const latestLines=typeof v41GetLatestShopeeLines==="function" ? v41GetLatestShopeeLines() : (state.skuRows||[]);
    const byItem=new Map();

    latestLines.forEach(row=>{
        const orderId=String(row.orderId||"").trim();
        if(!orderId)return;
        const orderKey=normalizeOrderReferenceV41(orderId);
        const invoiceRow=orderMap.get(orderKey)||null;
        const parts=typeof expandShopeeRowToInventorySkus==="function" ? expandShopeeRowToInventorySkus(row) : [];

        parts.forEach(part=>{
            const resolved=typeof resolveInventoryItemFromTransit==="function"
                ? resolveInventoryItemFromTransit(row,part.baseSku)
                : {item:null};
            const itemCode=String(resolved?.item?.itemCode||"").trim();
            if(!itemCode)return;
            if(!byItem.has(itemCode))byItem.set(itemCode,{orders:new Map()});
            const bucket=byItem.get(itemCode);
            if(!bucket.orders.has(orderKey)){
                bucket.orders.set(orderKey,{orderId,invoiceRow,quantity:0});
            }
            bucket.orders.get(orderKey).quantity+=Number(part.quantity||0);
        });
    });

    const result=new Map();
    byItem.forEach((bucket,itemCode)=>{
        const orders=[...bucket.orders.values()];
        const published=orders.filter(x=>x.invoiceRow?.pub);
        const unpublished=orders.filter(x=>x.invoiceRow?.unpub);
        const missingDelivered=orders.filter(x=>x.invoiceRow?.delivered&&!x.invoiceRow?.pub&&!x.invoiceRow?.unpub);
        const cqt=orders.filter(x=>x.invoiceRow?.cqtPending);
        const invoiceNos=[...new Set(published.map(x=>String(x.invoiceRow?.pub?.invoiceNo||"").trim()).filter(Boolean))];
        const latestPublished=published.slice().sort((a,b)=>String(b.invoiceRow?.pub?.invoiceDate||"").localeCompare(String(a.invoiceRow?.pub?.invoiceDate||"")))[0]||null;
        result.set(itemCode,{totalOrders:orders.length,published:published.length,unpublished:unpublished.length,missingDelivered:missingDelivered.length,cqt:cqt.length,invoiceNos,latestInvoiceNo:latestPublished?.invoiceRow?.pub?.invoiceNo||"",latestInvoiceDate:latestPublished?.invoiceRow?.pub?.invoiceDate||""});
    });
    return result;
}

function inventoryInvoiceStatusHtmlV56(summary){
    if(!summary||!summary.totalOrders)return '<span class="invoice-v56-status tracking">Chưa có đơn</span>';
    const parts=[];
    if(summary.published)parts.push(`<span class="invoice-v56-mini published">HĐ ${formatNumber(summary.published)}</span>`);
    if(summary.unpublished)parts.push(`<span class="invoice-v56-mini unpublished">Chờ ${formatNumber(summary.unpublished)}</span>`);
    if(summary.missingDelivered)parts.push(`<span class="invoice-v56-mini missing">Thiếu ${formatNumber(summary.missingDelivered)}</span>`);
    if(summary.cqt)parts.push(`<span class="invoice-v56-mini cqt">CQT ${formatNumber(summary.cqt)}</span>`);
    return `<div class="invoice-v56-mini-group">${parts.join("")||'<span class="invoice-v56-mini tracking">Theo dõi</span>'}</div><small class="invoice-v56-order-count">${formatNumber(summary.totalOrders)} đơn có SKU này</small>`;
}

function renderOrdersTab() {
    const body = $("orderTableBody");
    const summary = $("orderTableSummary");
    if (!body || !summary) return;

    const invoiceMap=buildOrderInvoiceMapV56();
    const directRows=[...invoiceMap.values()];
    const uniqueOrders=new Set((state.skuRows||[]).map(r=>String(r.orderId||"").trim()).filter(Boolean));

    if($("orderV56Total")) $("orderV56Total").textContent=formatNumber(uniqueOrders.size);
    if($("orderV56Published")) $("orderV56Published").textContent=formatNumber(directRows.filter(x=>x.pub).length);
    if($("orderV56Unpublished")) $("orderV56Unpublished").textContent=formatNumber(directRows.filter(x=>x.unpub).length);
    if($("orderV56Missing")) $("orderV56Missing").textContent=formatNumber(directRows.filter(x=>x.delivered&&!x.pub&&!x.unpub).length);
    if($("orderV56Cqt")) $("orderV56Cqt").textContent=formatNumber(directRows.filter(x=>x.cqtPending).length);

    if($("orderInvoiceSourceV56")){
        const pub=latestMisaImportV54("published"),unpub=latestMisaImportV54("unpublished");
        $("orderInvoiceSourceV56").innerHTML=`MISA đã phát hành: <strong>${pub?formatNumber(pub.rowCount):"0"}</strong> dòng · Chưa phát hành Shopee: <strong>${unpub?formatNumber(unpub.rowCount):"0"}</strong> dòng · Ghép bằng <strong>Mã đơn Shopee = Mã ĐH của sàn</strong>.`;
    }

    let data = [...state.skuRows];
    const search = normalizeText($("orderSearch")?.value || "");
    const invoiceFilter=$("orderInvoiceFilterV56")?.value||"all";

    data=data.filter(row=>{
        const orderKey=normalizeOrderReferenceV41(row.orderId||"");
        const inv=invoiceMap.get(orderKey)||null;
        const meta=invoiceStatusMetaV56(inv);
        if(invoiceFilter!=="all"){
            if(invoiceFilter==="published" && !inv?.pub)return false;
            if(invoiceFilter==="unpublished" && !inv?.unpub)return false;
            if(invoiceFilter==="missing" && !(inv?.delivered&&!inv?.pub&&!inv?.unpub))return false;
            if(invoiceFilter==="cqt" && !inv?.cqtPending)return false;
        }
        if(!search)return true;
        return normalizeText(`${row.orderId} ${row.status} ${row.sku} ${row.product} ${inv?.pub?.invoiceNo||""} ${inv?.unpub?.unissuedReason||""} ${meta.label}`).includes(search);
    });

    summary.textContent = `${formatNumber(data.length)} dòng sản phẩm · ${formatNumber(uniqueOrderCount(data))} mã đơn sau lọc`;

    if (!data.length) {
        body.innerHTML = `<tr><td colspan="10" class="empty-table">${state.skuRows.length ? "Không tìm thấy dữ liệu phù hợp." : "Hãy nhập file Shopee trước."}</td></tr>`;
        return;
    }

    body.innerHTML = data.map(row => {
        const inv=invoiceMap.get(normalizeOrderReferenceV41(row.orderId||""))||null;
        const meta=invoiceStatusMetaV56(inv);
        const invoiceNo=inv?.pub?.invoiceNo||"";
        const invoiceDate=inv?.pub?.invoiceDate||"";
        const cqt=inv?.pub?.taxAuthorityStatus||"";
        const note=inv?.unpub?.unissuedReason || (inv?.cqtPending?`CQT: ${cqt||"chưa hoàn tất"}`:meta.note);
        return `<tr class="order-v56-row ${escapeHTML(meta.key)}">
            <td><strong>${escapeHTML(row.orderId || "-")}</strong></td>
            <td>${escapeHTML(row.status || "-")}</td>
            <td><strong>${escapeHTML(row.sku || "-")}</strong></td>
            <td>${escapeHTML(row.product || "")}</td>
            <td class="center">${formatNumber(row.quantity || 0)}</td>
            <td>${invoiceStatusBadgeV56(inv)}</td>
            <td><strong class="order-v56-invoice-no">${escapeHTML(invoiceNo||"—")}</strong></td>
            <td>${invoiceDate?formatDateLabel(invoiceDate):"—"}</td>
            <td>${escapeHTML(cqt||"—")}</td>
            <td><span class="order-v56-note">${escapeHTML(note||"—")}</span></td>
        </tr>`;
    }).join("");
}

const returnStateV51 = {
    selected: null,
    search: "",
    filter: "all"
};

function getReturnReceiptKeyV51(orderId, itemCode) {
    return `${String(orderId || "").trim().toUpperCase()}|${String(itemCode || "").trim().toUpperCase()}`;
}

function getReturnReceiptMapV51() {
    const map = new Map();
    (inventoryState.returnReceipts || []).forEach(row => {
        map.set(getReturnReceiptKeyV51(row.orderId, row.itemCode), row);
    });
    return map;
}

function buildReturnCandidatesV51() {
    if (!inventoryState.loaded) loadInventoryLocal();

    const rows = buildInventoryMovementRows();
    const grouped = new Map();

    rows
        .filter(row => ["returning", "cancelled"].includes(row.bucket))
        .forEach(row => {
            const itemCode = String(row.itemCode || "").trim();
            const orderId = String(row.orderId || "").trim();
            if (!itemCode || !orderId) return;

            const key = getReturnReceiptKeyV51(orderId, itemCode);
            if (!grouped.has(key)) {
                grouped.set(key, {
                    key,
                    orderId,
                    itemCode,
                    itemName: row.itemName || "",
                    rawSkus: new Set(),
                    quantity: 0,
                    status: row.status || "",
                    bucket: row.bucket,
                    snapshotDate: row.reportDate || inventoryState.transitSnapshot?.snapshotDate || "",
                    sourceOrderDate: row.sourceOrderDate || ""
                });
            }

            const current = grouped.get(key);
            current.quantity += Number(row.quantity || 0);
            if (row.rawSku) current.rawSkus.add(row.rawSku);
            if (row.bucket === "returning") current.bucket = "returning";
            if (row.status) current.status = row.status;
        });

    const receiptMap = getReturnReceiptMapV51();

    return [...grouped.values()].map(row => ({
        ...row,
        rawSkus: [...row.rawSkus],
        receipt: receiptMap.get(row.key) || null
    }));
}

function returnCandidateValueV51(candidate) {
    const item = (inventoryState.items || []).find(x => x.itemCode === candidate.itemCode);
    return Number(candidate.quantity || 0) * Number(item?.unitPrice || 0);
}

function renderReturnKpisV51(candidates) {
    const returning = candidates.filter(x => x.bucket === "returning");
    const cancelled = candidates.filter(x => x.bucket === "cancelled");
    const confirmed = (inventoryState.returnReceipts || []);
    const waiting = returning.filter(x => !x.receipt);

    const sumQty = rows => rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

    const returningOrders = new Set(returning.map(x => x.orderId)).size;
    const cancelledOrders = new Set(cancelled.map(x => x.orderId)).size;
    const confirmedOrders = new Set(confirmed.map(x => x.orderId)).size;
    const confirmedValue = confirmed.reduce((sum, row) => {
        const item = (inventoryState.items || []).find(x => x.itemCode === row.itemCode);
        return sum + Number(row.quantity || 0) * Number(item?.unitPrice || 0);
    }, 0);

    if ($("returnReturningQtyV51")) $("returnReturningQtyV51").textContent = formatNumber(sumQty(returning));
    if ($("returnReturningOrdersV51")) $("returnReturningOrdersV51").textContent = `${formatNumber(returningOrders)} đơn`;
    if ($("returnWaitingQtyV51")) $("returnWaitingQtyV51").textContent = formatNumber(sumQty(waiting));
    if ($("returnConfirmedQtyV51")) $("returnConfirmedQtyV51").textContent = formatNumber(sumQty(confirmed));
    if ($("returnConfirmedOrdersV51")) $("returnConfirmedOrdersV51").textContent = `${formatNumber(confirmedOrders)} đơn đã xác nhận`;
    if ($("returnCancelledQtyV51")) $("returnCancelledQtyV51").textContent = formatNumber(sumQty(cancelled));
    if ($("returnCancelledOrdersV51")) $("returnCancelledOrdersV51").textContent = `${formatNumber(cancelledOrders)} đơn · không tự cộng kho`;
    if ($("returnConfirmedValueV51")) $("returnConfirmedValueV51").textContent = inventoryMoney(confirmedValue);
}

function renderReturnReceiptsV51() {
    const body = $("returnReceiptBodyV51");
    const summary = $("returnReceiptSummaryV51");
    if (!body || !summary) return;

    const rows = [...(inventoryState.returnReceipts || [])].sort((a, b) =>
        `${b.receivedDate}|${b.createdAt}`.localeCompare(`${a.receivedDate}|${a.createdAt}`)
    );

    summary.textContent = `${formatNumber(rows.length)} lần xác nhận · ${formatNumber(new Set(rows.map(x => x.orderId)).size)} đơn`;

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="7" class="empty-table">Chưa có lịch sử nhập hoàn.</td></tr>';
        return;
    }

    body.innerHTML = rows.map(row => `
        <tr>
            <td><strong>${row.receivedDate ? formatDateLabel(row.receivedDate) : "—"}</strong></td>
            <td><span class="returns-v51-order">${escapeHTML(row.orderId || "—")}</span></td>
            <td><strong>${escapeHTML(row.itemCode || "—")}</strong></td>
            <td class="center returns-v51-qty-good">+${formatNumber(row.quantity || 0)}</td>
            <td>${escapeHTML(row.confirmedEmail || "—")}</td>
            <td>${escapeHTML(row.note || row.sourceStatus || "—")}</td>
            <td class="right">
                ${hasPermissionV40("INVENTORY_WRITE")
                    ? `<button type="button" class="returns-v51-reverse-btn" data-return-reverse-v51="${escapeHTML(row.id)}">Hoàn tác</button>`
                    : ""}
            </td>
        </tr>
    `).join("");
}

function renderCancelledReturnsV51(candidates) {
    const body = $("returnCancelledBodyV51");
    if (!body) return;

    const rows = candidates.filter(x => x.bucket === "cancelled");
    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="5" class="empty-table">Chưa có đơn hủy trong snapshot hiện tại.</td></tr>';
        return;
    }

    body.innerHTML = rows.map(row => `
        <tr>
            <td><span class="returns-v51-order">${escapeHTML(row.orderId)}</span></td>
            <td><strong>${escapeHTML(row.itemCode)}</strong></td>
            <td>${escapeHTML(row.itemName || "")}</td>
            <td class="center">${formatNumber(row.quantity)}</td>
            <td><span class="returns-v51-cancelled-badge">Đã hủy · không cộng kho</span><div class="returns-v51-status-sub">${escapeHTML(row.status || "")}</div></td>
        </tr>
    `).join("");
}

function renderReturnsTab() {
    const body = $("returnTableBody");
    const summary = $("returnTableSummary");
    const notice = $("returnV51Notice");
    if (!body || !summary) return;

    const candidates = buildReturnCandidatesV51();
    renderReturnKpisV51(candidates);
    renderReturnReceiptsV51();
    renderCancelledReturnsV51(candidates);

    if (notice) {
        if (!inventoryState.transitSnapshot?.rows?.length) {
            notice.className = "returns-v51-notice warning";
            notice.innerHTML = '⚠ Chưa có snapshot luân chuyển. Hãy vào <strong>Tồn kho & luân chuyển → Upload đơn luân chuyển</strong> để xác định hàng đang hoàn.';
        } else if (!inventoryState.returnReceiptCloudReady && state.user) {
            notice.className = "returns-v51-notice warning";
            notice.innerHTML = '⚠ Chưa đọc được bảng Cloud V51. Nếu bạn chưa chạy SQL V51, hãy chạy trước rồi bấm <strong>Đồng bộ lại</strong>.';
        } else {
            notice.className = "returns-v51-notice good";
            notice.innerHTML = `✓ Snapshot <strong>${escapeHTML(inventoryState.transitSnapshot.fileName || "")}</strong> · ${formatNumber(inventoryState.returnReceipts?.length || 0)} lần nhập hoàn đã lưu Cloud.`;
        }
    }

    let rows = candidates.filter(x => x.bucket === "returning");
    const search = normalizeText($("returnSearchV51")?.value || returnStateV51.search || "");
    const filter = $("returnStatusFilterV51")?.value || returnStateV51.filter || "all";
    returnStateV51.search = $("returnSearchV51")?.value || "";
    returnStateV51.filter = filter;

    if (search) {
        rows = rows.filter(row => normalizeText([
            row.orderId,
            row.itemCode,
            row.itemName,
            row.status,
            ...(row.rawSkus || [])
        ].join(" ")).includes(search));
    }

    if (filter === "waiting") rows = rows.filter(row => !row.receipt);
    if (filter === "confirmed") rows = rows.filter(row => Boolean(row.receipt));

    summary.textContent = `${formatNumber(rows.length)} dòng hoàn · ${formatNumber(new Set(rows.map(x => x.orderId)).size)} mã đơn`;

    if (!rows.length) {
        body.innerHTML = `
            <tr><td colspan="9" class="empty-table">
                ${candidates.some(x => x.bucket === "returning")
                    ? "Không có dòng phù hợp bộ lọc."
                    : "Snapshot hiện tại chưa có hàng ở trạng thái hoàn đang về."}
            </td></tr>`;
        return;
    }

    body.innerHTML = rows.map((row, index) => {
        const receipt = row.receipt;
        return `
            <tr class="${receipt ? "returns-v51-row-confirmed" : ""}">
                <td>${index + 1}</td>
                <td><span class="returns-v51-order">${escapeHTML(row.orderId)}</span></td>
                <td><span class="returns-v51-returning-badge">Hoàn đang về</span><div class="returns-v51-status-sub">${escapeHTML(row.status || "")}</div></td>
                <td><strong>${escapeHTML(row.itemCode)}</strong>${row.rawSkus?.length ? `<div class="returns-v51-status-sub">${escapeHTML(row.rawSkus.join(", "))}</div>` : ""}</td>
                <td>${escapeHTML(row.itemName || "")}</td>
                <td class="center"><strong>${formatNumber(row.quantity)}</strong></td>
                <td>${row.snapshotDate ? formatDateLabel(row.snapshotDate) : "—"}</td>
                <td>
                    ${receipt
                        ? `<span class="returns-v51-confirmed-badge">✓ Đã nhập kho +${formatNumber(receipt.quantity)}</span><div class="returns-v51-status-sub">${formatDateLabel(receipt.receivedDate)}</div>`
                        : '<span class="returns-v51-waiting-badge">Chưa cộng tồn</span>'}
                </td>
                <td>
                    ${receipt
                        ? '<span class="returns-v51-done-text">Đã xác nhận</span>'
                        : hasPermissionV40("INVENTORY_WRITE")
                            ? `<button type="button" class="returns-v51-confirm-btn" data-return-confirm-v51="${escapeHTML(row.key)}">✓ Xác nhận nhập kho</button>`
                            : '<span class="returns-v51-done-text">Chỉ ADMIN/KHO</span>'}
                </td>
            </tr>
        `;
    }).join("");
}

function refreshNavCounts() {
    const orderBadge = $("navOrderCount");
    const returnBadge = $("navReturnCount");

    if (orderBadge) {
        orderBadge.textContent = formatNumber(uniqueOrderCount());
    }

    if (returnBadge) {
        const candidates = inventoryState.transitSnapshot?.rows?.length
            ? buildReturnCandidatesV51()
            : [];

        returnBadge.textContent = formatNumber(
            candidates.length
                ? new Set(candidates.map(row => row.orderId)).size
                : uniqueOrderCount(state.skuRows.filter(row => isReturnOrCancelStatus(row.status)))
        );
    }

    const feeBadge = $("navFeeCount");
    const paymentBadge = $("navPaymentCount");
    const issueBadge = $("navIssueCount");
    if (feeBadge) feeBadge.textContent = formatNumber(new Set(financeStateV53.rows.map(r => r.orderId).filter(Boolean)).size);
    if (paymentBadge) paymentBadge.textContent = formatNumber(financeStateV53.rows.filter(r => normalizeFinanceStatusV53(r.paymentStatus) === "pending").length);
    if (issueBadge) issueBadge.textContent = formatNumber(buildFinanceIssuesV53().issues.length);
}


if ($("orderSearch")) {
    $("orderSearch").addEventListener("input", renderOrdersTab);
    $("orderInvoiceFilterV56")?.addEventListener("change", renderOrdersTab);
}


function closeReturnConfirmModalV51() {
    const modal = $("returnConfirmModalV51");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("return-v51-modal-open");
    returnStateV51.selected = null;
}

function openReturnConfirmModalV51(candidateKey) {
    if (!requirePermissionV40("INVENTORY_WRITE")) return;

    const candidate = buildReturnCandidatesV51().find(row => row.key === candidateKey);
    if (!candidate) {
        alert("Không còn tìm thấy dòng hoàn này trong snapshot hiện tại.");
        return;
    }
    if (candidate.receipt) {
        alert("Dòng này đã được xác nhận nhập hoàn trước đó.");
        return;
    }

    returnStateV51.selected = candidate;
    const modal = $("returnConfirmModalV51");
    if (!modal) return;

    if ($("returnReceivedDateV51")) $("returnReceivedDateV51").value = getLocalTodayKey();
    if ($("returnReceivedQtyV51")) $("returnReceivedQtyV51").value = String(candidate.quantity || "");
    if ($("returnReceivedNoteV51")) $("returnReceivedNoteV51").value = "";

    if ($("returnConfirmContextV51")) {
        $("returnConfirmContextV51").innerHTML = `
            <div><span>Mã đơn</span><strong>${escapeHTML(candidate.orderId)}</strong></div>
            <div><span>SKU kho</span><strong>${escapeHTML(candidate.itemCode)}</strong></div>
            <div><span>Sản phẩm</span><strong>${escapeHTML(candidate.itemName || "—")}</strong></div>
            <div><span>SL snapshot</span><strong>${formatNumber(candidate.quantity)}</strong></div>
        `;
    }

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("return-v51-modal-open");
}

async function confirmReturnToStockV51() {
    if (!requirePermissionV40("INVENTORY_WRITE")) return;
    const candidate = returnStateV51.selected;
    if (!candidate) return;

    const receivedDate = $("returnReceivedDateV51")?.value || "";
    const quantity = Number($("returnReceivedQtyV51")?.value || 0);
    const note = String($("returnReceivedNoteV51")?.value || "").trim();

    if (!receivedDate) {
        alert("Hãy chọn ngày thực tế hàng nhập lại kho.");
        return;
    }
    if (!(quantity > 0)) {
        alert("Số lượng thực nhận phải lớn hơn 0.");
        return;
    }
    if (quantity > Number(candidate.quantity || 0)) {
        if (!confirm(`Bạn đang xác nhận ${formatNumber(quantity)} SP, lớn hơn SL hoàn trong snapshot ${formatNumber(candidate.quantity)}. Vẫn tiếp tục?`)) {
            return;
        }
    }

    const button = $("btnReturnConfirmSaveV51");
    if (button) {
        button.disabled = true;
        button.textContent = "Đang lưu...";
    }

    try {
        const client = initSupabaseClient();
        const { data, error } = await client.rpc("confirm_inventory_return_v51", {
            p_order_id: candidate.orderId,
            p_item_code: candidate.itemCode,
            p_quantity: quantity,
            p_received_date: receivedDate,
            p_source_status: candidate.status || "",
            p_note: note
        });

        if (error) throw error;

        closeReturnConfirmModalV51();
        await loadInventoryData();
        renderReturnsTab();
        renderInventoryModule();
        refreshNavCounts();

        alert(`Đã nhập hoàn ${formatNumber(quantity)} SP vào ${candidate.itemCode}. Tồn lý thuyết đã được cộng lại.`);
        return data;
    } catch (error) {
        console.error("V51 confirm return error:", error);
        const message = String(error?.message || error || "");
        if (message.includes("RETURN_ALREADY_CONFIRMED")) {
            alert("Đơn/SKU này đã được xác nhận nhập hoàn trước đó. Hệ thống không cộng kho lần thứ hai.");
        } else {
            alert(`Không lưu được nhập hoàn. ${message}`);
        }
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "✓ Xác nhận nhập kho";
        }
    }
}

async function reverseReturnReceiptV51(receiptId) {
    if (!requirePermissionV40("INVENTORY_WRITE")) return;
    const receipt = (inventoryState.returnReceipts || []).find(row => row.id === receiptId);
    if (!receipt) return;

    if (!confirm(`Hoàn tác nhập hoàn ${formatNumber(receipt.quantity)} SP của đơn ${receipt.orderId}?\n\nNghiệp vụ + Hoàn nhập sẽ bị xóa và tồn lý thuyết giảm lại.`)) {
        return;
    }

    try {
        const client = initSupabaseClient();
        const { error } = await client.rpc("reverse_inventory_return_v51", {
            p_receipt_id: receiptId
        });
        if (error) throw error;

        await loadInventoryData();
        renderReturnsTab();
        renderInventoryModule();
        refreshNavCounts();
    } catch (error) {
        console.error("V51 reverse return error:", error);
        alert(`Không hoàn tác được. ${error?.message || error}`);
    }
}

$("returnSearchV51")?.addEventListener("input", renderReturnsTab);
$("returnStatusFilterV51")?.addEventListener("change", renderReturnsTab);
$("btnReturnRefreshV51")?.addEventListener("click", async () => {
    await loadInventoryData();
    renderReturnsTab();
    refreshNavCounts();
});
$("btnReturnModalCloseV51")?.addEventListener("click", closeReturnConfirmModalV51);
$("btnReturnModalCancelV51")?.addEventListener("click", closeReturnConfirmModalV51);
$("btnReturnConfirmSaveV51")?.addEventListener("click", confirmReturnToStockV51);

$("returnConfirmModalV51")?.addEventListener("click", event => {
    if (event.target === $("returnConfirmModalV51")) closeReturnConfirmModalV51();
});

document.addEventListener("click", event => {
    const confirmButton = event.target.closest("[data-return-confirm-v51]");
    if (confirmButton) {
        openReturnConfirmModalV51(confirmButton.dataset.returnConfirmV51 || "");
        return;
    }

    const reverseButton = event.target.closest("[data-return-reverse-v51]");
    if (reverseButton) {
        reverseReturnReceiptV51(reverseButton.dataset.returnReverseV51 || "");
    }
});

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
            "Buổi sáng": item.morning || 0,
            "Buổi chiều": item.afternoon || 0,
            "Đơn hủy (-)": item.cancelled || 0,
            "Số lượng SKU sau trừ hủy": item.count
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
        "Buổi sáng": sum(state.skuStats.map(item => item.morning)),
        "Buổi chiều": sum(state.skuStats.map(item => item.afternoon)),
        "Đơn hủy (-)": sum(state.skuStats.map(item => item.cancelled)),
        "Số lượng SKU sau trừ hủy": sum(state.skuStats.map(item => item.count))
    };

    state.baseSkus.forEach(baseSku => {
        totalRow[baseSku] = totals[baseSku] || 0;
    });

    detail.push(totalRow);

    const convertedMorning = calculateConvertedTotalsForField("morning");
    const convertedAfternoon = calculateConvertedTotalsForField("afternoon");
    const convertedCancelled = calculateConvertedTotalsForField("cancelled");
    const converted = state.baseSkus.map(baseSku => ({
        "SKU kho / SKU quy đổi": baseSku,
        "Buổi sáng": convertedMorning[baseSku] || 0,
        "Buổi chiều": convertedAfternoon[baseSku] || 0,
        "Đơn hủy (-)": convertedCancelled[baseSku] || 0,
        "Tổng số lượng cần chuẩn bị": totals[baseSku] || 0
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detail), "THONG KE SKU");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(converted), "TONG QUY DOI");
    XLSX.writeFile(workbook, "THONG_KE_QUY_DOI_SKU_SHOPEE.xlsx");
});


/* ======================== V20 - ADMIN DELETE ======================== */
function createAdminVerificationClient() {
    return window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        }
    );
}

function getSavedReportDates() {
    return [...new Set(
        state.skuRows.map(row => row.orderDate).filter(Boolean)
    )].sort().reverse();
}

function getDeleteScope() {
    return document.querySelector('input[name="adminDeleteScope"]:checked')?.value || "day";
}

function getMonthLabel(monthKey) {
    const match = /^(\d{4})-(\d{2})$/.exec(monthKey || "");
    if (!match) return monthKey || "-";
    return `Tháng ${Number(match[2])}/${match[1]}`;
}

function showAdminDeleteError(message = "") {
    const box = $("adminDeleteError");
    if (!box) return;
    box.textContent = message;
    box.classList.toggle("show", Boolean(message));
}

function renderAdminDeleteTargetInfo() {
    const scope = getDeleteScope();
    const target = $("adminDeleteTargetSelect")?.value || "";
    const info = $("adminDeleteTargetInfo");

    if (!info) return;

    if (!target) {
        info.textContent = "Chưa có dữ liệu phù hợp để xóa.";
        return;
    }

    if (scope === "day") {
        const rows = state.skuRows.filter(row => row.orderDate === target);
        const imports = state.imports.filter(item => item.reportDate === target);
        const morningRows = rows.filter(row => normalizeRowSlot(row) === "morning").length;
        const afternoonRows = rows.filter(row => normalizeRowSlot(row) === "afternoon").length;

        info.innerHTML =
            `<strong>${formatDateLabel(target)}</strong> · ` +
            `${formatNumber(rows.length)} dòng ` +
            `(Sáng ${formatNumber(morningRows)} / Chiều ${formatNumber(afternoonRows)}) · ` +
            `${formatNumber(imports.length)} file`;
    } else {
        const rows = state.skuRows.filter(row => String(row.orderDate || "").startsWith(target));
        const imports = state.imports.filter(item => String(item.reportDate || "").startsWith(target));
        const dayCount = new Set(rows.map(row => row.orderDate).filter(Boolean)).size;

        info.innerHTML =
            `<strong>${getMonthLabel(target)}</strong> · ` +
            `${formatNumber(dayCount)} ngày · ` +
            `${formatNumber(rows.length)} dòng · ` +
            `${formatNumber(imports.length)} file`;
    }
}

function renderAdminDeleteTargets() {
    const scope = getDeleteScope();
    const select = $("adminDeleteTargetSelect");
    const label = $("adminDeleteTargetLabel");

    if (!select || !label) return;

    const dates = getSavedReportDates();

    if (scope === "day") {
        label.textContent = "CHỌN NGÀY CẦN XÓA";

        select.innerHTML = dates.length
            ? dates.map(dateKey => `
                <option value="${escapeHTML(dateKey)}">
                    ${formatDateLabel(dateKey)}
                </option>
            `).join("")
            : '<option value="">Không có ngày dữ liệu</option>';
    } else {
        label.textContent = "CHỌN THÁNG CẦN XÓA";

        const months = [...new Set(
            dates.map(dateKey => dateKey.slice(0, 7))
        )].sort().reverse();

        select.innerHTML = months.length
            ? months.map(monthKey => `
                <option value="${escapeHTML(monthKey)}">
                    ${getMonthLabel(monthKey)}
                </option>
            `).join("")
            : '<option value="">Không có tháng dữ liệu</option>';
    }

    const currentDate = [...state.selectedDates][0] || getSelectedReportDate() || "";

    if (scope === "day" && dates.includes(currentDate)) {
        select.value = currentDate;
    }

    if (scope === "month") {
        const currentMonth = currentDate.slice(0, 7);
        if ([...select.options].some(option => option.value === currentMonth)) {
            select.value = currentMonth;
        }
    }

    renderAdminDeleteTargetInfo();
}

function openAdminDeleteModal() {
    if (!requirePermissionV40("DELETE_SHOPEE")) return;
    showAdminDeleteError("");
    if ($("adminDeletePassword")) $("adminDeletePassword").value = "";

    renderAdminDeleteTargets();
    $("adminDeleteModal")?.classList.remove("hidden");

    setTimeout(() => $("adminDeletePassword")?.focus(), 80);
}

function closeAdminDeleteModal() {
    $("adminDeleteModal")?.classList.add("hidden");
    if ($("adminDeletePassword")) $("adminDeletePassword").value = "";
    showAdminDeleteError("");
}

async function verifyAdminAndDelete(scope, target, password) {
    assertPermissionV40("DELETE_SHOPEE");

    if (!password) throw new Error("Hãy nhập mật khẩu admin.");

    const adminEmail = String(state.user?.email || "").trim();
    if (!adminEmail) throw new Error("Không xác định được tài khoản admin đang đăng nhập.");

    const adminClient = createAdminVerificationClient();

    try {
        const { data, error: loginError } = await adminClient.auth.signInWithPassword({
            email: adminEmail,
            password
        });

        if (loginError || !data?.user) {
            throw new Error("Mật khẩu admin không đúng.");
        }

        const { data: context, error: contextError } =
            await adminClient.rpc("app_user_context");

        if (contextError) throw contextError;

        const role = normalizeRoleV40(
            (Array.isArray(context) ? context[0] : context)?.role
        );

        if (role !== "ADMIN") {
            throw new Error("Tài khoản xác thực không có vai trò ADMIN.");
        }

        const { data: result, error: deleteError } = await adminClient.rpc(
            "admin_delete_shopee_data",
            {
                p_scope: scope,
                p_target: target
            }
        );

        if (deleteError) throw deleteError;
        return result;
    } finally {
        await adminClient.auth.signOut().catch(() => {});
    }
}

async function refreshAfterAdminDelete(scope, target) {
    await loadSavedDataFromDb({ resetFilters: true });

    const remainingDates = getSavedReportDates();
    const nextDate = remainingDates[0] || getLocalTodayKey();

    state.selectedDates = new Set([nextDate]);
    state.dateFilterInitialized = true;

    if ($("reportDateInput")) $("reportDateInput").value = nextDate;

    loadShiftConfigurationForReportDate(nextDate);
    renderAll();

    openView("sku-stats");
    showStatsCalendar();

    const label = scope === "day"
        ? formatDateLabel(target)
        : getMonthLabel(target);

    showToast(`Đã xóa dữ liệu ${label}.`);
}

document.querySelectorAll('input[name="adminDeleteScope"]').forEach(radio => {
    radio.addEventListener("change", () => {
        document.querySelectorAll("[data-admin-scope-card]").forEach(card => {
            card.classList.toggle(
                "active",
                card.dataset.adminScopeCard === getDeleteScope()
            );
        });

        renderAdminDeleteTargets();
    });
});

$("adminDeleteTargetSelect")?.addEventListener("change", renderAdminDeleteTargetInfo);
$("btnCloseAdminDelete")?.addEventListener("click", closeAdminDeleteModal);
$("btnCancelAdminDelete")?.addEventListener("click", closeAdminDeleteModal);

$("adminDeleteModal")?.addEventListener("click", event => {
    if (event.target === $("adminDeleteModal")) closeAdminDeleteModal();
});

document.addEventListener("keydown", event => {
    if (
        event.key === "Escape" &&
        !$("adminDeleteModal")?.classList.contains("hidden")
    ) {
        closeAdminDeleteModal();
    }
});

$("btnConfirmAdminDelete")?.addEventListener("click", async () => {
    const scope = getDeleteScope();
    const target = $("adminDeleteTargetSelect")?.value || "";
    const password = $("adminDeletePassword")?.value || "";
    const button = $("btnConfirmAdminDelete");

    if (!target) {
        showAdminDeleteError("Chưa có ngày/tháng dữ liệu để xóa.");
        return;
    }

    if (!password) {
        showAdminDeleteError("Hãy nhập mật khẩu admin.");
        $("adminDeletePassword")?.focus();
        return;
    }

    const displayTarget = scope === "day"
        ? formatDateLabel(target)
        : getMonthLabel(target);

    if (!confirm(
        `XÁC NHẬN XÓA ${scope === "day" ? "NGÀY" : "THÁNG"} ${displayTarget}?\n\n` +
        "Dữ liệu đã xóa không thể hoàn tác."
    )) return;

    showAdminDeleteError("");
    button.disabled = true;
    button.textContent = "ĐANG XÁC THỰC...";

    try {
        await verifyAdminAndDelete(scope, target, password);
        closeAdminDeleteModal();
        await refreshAfterAdminDelete(scope, target);
    } catch (error) {
        console.error(error);

        const message = String(error?.message || "");

        showAdminDeleteError(
            message.includes("Invalid login credentials") ||
            message.includes("Mật khẩu admin")
                ? "Mật khẩu admin không đúng."
                : message.includes("ADMIN_ONLY")
                    ? "Tài khoản này chưa được cấp quyền admin trong Supabase."
                    : (message || "Không xóa được dữ liệu.")
        );

        $("adminDeletePassword")?.select();
    } finally {
        button.disabled = false;
        button.textContent = "XÁC NHẬN XÓA";
    }
});




/* ======================== V28 - TỒN KHO & LUÂN CHUYỂN ======================== */

const DEFAULT_MISA_CODE_ALIASES = {
    REWD: ["REWD", "TEST.1"],
    RCS: ["RCS", "TEST.2"],
    RKN: ["RCC"],
    REWS: ["REWS ver2", "TEST.REWS"],
    RTB: ["RTB"],
    RHBS: ["RHBS"],
    ROE: ["ROE", "RROS"],
    REWGS: ["REWGS250"]
};


function inventoryMoney(value) {
    return `${formatNumber(Math.round(Number(value) || 0))} đ`;
}

const DEFAULT_TRANSIT_NAME_ALIASES = {
    "WH-REWD": [
        "extra white deodorant cream 35g",
        "deodorant cream 35g",
        "kem trang nach",
        "kem nach"
    ],
    "WH-REWS": [
        "extra white smooth cream 80g",
        "smooth cream 80g",
        "smooth"
    ],
    "WH-RTB": [
        "tranex brightening body cream 200g",
        "tranex brightening",
        "tranex"
    ],
    "WH-RHBS": [
        "honey black sugar body scrub 450g",
        "body scrub 450g",
        "duong den mat ong"
    ],
    "WH-RKN": [
        "curcumin cream 80g",
        "kem nghe",
        "curcumin"
    ],
    "WH-SER120": [
        "serum 120ml",
        "body serum 120ml",
        "glow serum 120ml"
    ],
    "WH-REWGS": [
        "extra white glow body serum 250ml",
        "body serum 250ml",
        "serum 250ml"
    ],
    "WH-LOT120": [
        "lotion 120ml",
        "body lotion 120ml"
    ],
    "WH-LOT250": [
        "lotion 250ml",
        "body lotion 250ml"
    ],
    "WH-RCS": [
        "confidence stick 25ml",
        "lan nach",
        "confidence stick"
    ],
    "WH-ROE": [
        "retinol oil essence 160ml",
        "body oil",
        "retinol oil"
    ],
    "WH-COMBO": [
        "combo oil mist",
        "combo body oil body mist",
        "body oil body mist",
        "set body oil body mist"
    ]
};

function getInventoryItemCodeSuffix(item) {
    return String(item?.itemCode || "")
        .replace(/^WH[-_]?/i, "")
        .trim();
}

function getInventoryTransitNameTokens(item) {
    const values = [
        item?.name || "",
        item?.invoiceKeyword || "",
        ...(DEFAULT_TRANSIT_NAME_ALIASES[item?.itemCode] || [])
    ];

    return [...new Set(
        values
            .map(value => normalizeText(value))
            .filter(value => value.length >= 4)
    )];
}

function resolveInventoryItemFromTransit(row, baseSku) {
    const activeItems = inventoryState.items
        .filter(item => item.active !== false);

    const rawSku = normalizeText(row?.sku || "");
    const normalizedBaseSku = normalizeText(baseSku || "");
    const productName = normalizeText(row?.product || "");

    // 1. SKU ưu tiên đã nhập thủ công - chỉ là từ điển ghép, không phải nguồn dữ liệu.
    const manualSkuMatch = activeItems.find(item => {
        const configuredSku = normalizeText(item.shopeeSku || "");
        return configuredSku && (
            configuredSku === normalizedBaseSku ||
            configuredSku === rawSku
        );
    });

    if (manualSkuMatch) {
        return { item: manualSkuMatch, method: "sku-ưu-tiên" };
    }

    // 2. Thử ghép trực tiếp mã kho WH-XXX với SKU XXX trong file.
    const itemCodeMatch = activeItems.find(item => {
        const suffix = normalizeText(getInventoryItemCodeSuffix(item));
        return suffix && (
            suffix === normalizedBaseSku ||
            suffix === rawSku
        );
    });

    if (itemCodeMatch) {
        return { item: itemCodeMatch, method: "mã-file" };
    }

    // 3. Tự nhận diện bằng tên sản phẩm NGAY TRONG FILE LUÂN CHUYỂN.
    if (productName) {
        let best = null;

        activeItems.forEach(item => {
            const tokens = getInventoryTransitNameTokens(item);

            tokens.forEach(token => {
                let score = 0;

                if (productName === token) {
                    score = 10000 + token.length;
                } else if (productName.includes(token)) {
                    score = 5000 + token.length;
                } else if (
                    productName.length >= 6 &&
                    token.includes(productName)
                ) {
                    score = 2500 + productName.length;
                }

                if (score > 0 && (!best || score > best.score)) {
                    best = { item, score };
                }
            });
        });

        if (best) {
            return { item: best.item, method: "tên-trong-file" };
        }
    }

    return { item: null, method: "chưa-ghép" };
}

function getInventoryItemMapByShopeeSku() {
    // Giữ hàm này cho tương thích code cũ/MISA.
    // V34 không dùng nó làm nguồn ghép chính cho file luân chuyển.
    const map = new Map();

    inventoryState.items.forEach(item => {
        const sku = String(item.shopeeSku || "").trim();
        if (sku) map.set(sku, item);
    });

    return map;
}

function getLatestDailyShopeeLinesForInventory(asOfDate = "") {
    const latest = new Map();

    state.skuRows.forEach(row => {
        const reportDate = row.reportDate || row.orderDate || "";

        if (asOfDate && reportDate && reportDate > asOfDate) {
            return;
        }

        const orderId = String(row.orderId || "").trim();
        const sku = String(row.sku || "").trim();
        if (!sku) return;

        const key = `${orderId || row.rowKey || "NOORDER"}|${sku}`;
        const slotRank = normalizeRowSlot(row) === "afternoon" ? 2 : 1;
        const rank = `${reportDate}|${slotRank}|${row.updatedAt || ""}`;

        const previous = latest.get(key);

        if (!previous || rank > previous.__rank) {
            latest.set(key, { ...row, __rank: rank });
        }
    });

    return [...latest.values()];
}

function getTransitSnapshotRowsForInventory() {
    if (!inventoryState.transitSnapshot?.rows?.length) {
        return [];
    }

    return inventoryState.transitSnapshot.rows.map(row => ({
        ...row,
        reportDate: inventoryState.transitSnapshot.snapshotDate || "",
        sourceOrderDate: row.orderDate || "",
        sourceFile: inventoryState.transitSnapshot.fileName || "",
        updatedAt: inventoryState.transitSnapshot.importedAt || ""
    }));
}

function classifyInventoryShopeeStatus(status) {
    const textValue = normalizeText(status);

    // V51: trạng thái hoàn thật phải được nhận trước "đã giao".
    // Câu "người mua đã nhận ... vẫn có thể gửi yêu cầu trả hàng" chỉ là thời hạn khiếu nại,
    // không được xem là hàng đang hoàn.
    const isReturnWindowOnly =
        textValue.includes("nguoimuaxacnhandanhanduochang") &&
        textValue.includes("vancotheguiyeucautrahang");

    const isExplicitReturn =
        textValue.includes("dangtrahang") ||
        textValue.includes("yeucautrahanghoantien") ||
        textValue.includes("trahangthanhcong") ||
        textValue.includes("dahoantien") ||
        textValue.includes("returning") ||
        textValue.includes("returned");

    if (isExplicitReturn && !isReturnWindowOnly) return "returning";
    if (textValue.includes("dahuy") || textValue.includes("cancel")) return "cancelled";
    if (textValue.includes("nguoimuaxacnhandanhanduochang")) return "delivered";
    if (textValue.includes("dagiao") || textValue.includes("delivered")) return "delivered";
    if (textValue.includes("danggiao") || textValue.includes("shipping") || textValue.includes("intransit")) return "in_transit";
    if (textValue.includes("chogiaohang") || textValue.includes("choxacnhan") || textValue.includes("topickup")) return "reserved";
    return "other";
}

function inventoryBucketLabel(bucket) {
    return {
        reserved: "Đã giữ cho đơn",
        in_transit: "Đang giao",
        delivered: "Đã giao",
        returning: "Hoàn đang về",
        cancelled: "Đã hủy",
        other: "Khác"
    }[bucket] || "Khác";
}

function expandShopeeRowToInventorySkus(row) {
    const sku = String(row.sku || "").trim();
    const quantity = Number(row.quantity || 0);
    if (!sku || quantity <= 0) return [];

    const rule = state.conversionRules?.[sku];
    if (rule && Object.keys(rule).length) {
        return Object.entries(rule)
            .map(([baseSku, factor]) => ({
                baseSku,
                quantity: quantity * Number(factor || 0)
            }))
            .filter(item => item.quantity > 0);
    }

    return [{ baseSku: sku, quantity }];
}

function buildInventoryMovementRows(asOfDate = "") {
    // V34:
    // Dashboard hiện tại: CHỈ dùng snapshot file luân chuyển riêng.
    // Không lấy số lượng/trạng thái từ Thống kê SKU.
    //
    // Khi có asOfDate: chỉ phần tính lịch sử tồn lý thuyết mới dùng dữ liệu
    // ngày/ca cũ, vì snapshot hiện tại không thể đại diện lịch sử.
    const sourceRows = asOfDate
        ? getLatestDailyShopeeLinesForInventory(asOfDate)
        : getTransitSnapshotRowsForInventory();

    const result = [];

    sourceRows.forEach(row => {
        const bucket = classifyInventoryShopeeStatus(row.status);
        const expanded = expandShopeeRowToInventorySkus(row);

        expanded.forEach(part => {
            const resolved = resolveInventoryItemFromTransit(row, part.baseSku);
            const item = resolved.item;

            result.push({
                orderId: row.orderId || "-",
                reportDate:
                    row.reportDate ||
                    inventoryState.transitSnapshot?.snapshotDate ||
                    row.orderDate ||
                    "",
                sourceOrderDate: row.sourceOrderDate || row.orderDate || "",
                rawSku: row.sku || "",
                baseSku: part.baseSku,
                itemCode: item?.itemCode || "",
                itemName: item?.name || row.product || "",
                quantity: Number(part.quantity || 0),
                status: row.status || "",
                bucket,
                matchMethod: resolved.method,
                sourceType: asOfDate ? "daily-history" : "transit-snapshot"
            });
        });
    });

    if (!asOfDate) {
        inventoryState.movementRows = result;
    }

    return result;
}

function getInventoryMisaTokens(item) {
    const aliases = DEFAULT_MISA_CODE_ALIASES[String(item.shopeeSku || "").trim()] || [];

    const customTokens = String(item.invoiceKeyword || "")
        .split(/[|,;\n]+/)
        .map(value => value.trim())
        .filter(Boolean);

    return [...new Set([...aliases, ...customTokens])];
}

function isMisaLineMatchedToInventoryItem(line, item) {
    const lineCode = normalizeText(line.productCode || "");
    const lineName = normalizeText(line.productName || "");
    const tokens = getInventoryMisaTokens(item);

    if (!tokens.length) return false;

    // Ưu tiên 1: Mã hàng MISA khớp chính xác.
    for (const token of tokens) {
        const normalizedToken = normalizeText(token);
        if (lineCode && normalizedToken && lineCode === normalizedToken) {
            return true;
        }
    }

    // Ưu tiên 2: từ khóa tên hàng MISA.
    for (const token of tokens) {
        const normalizedToken = normalizeText(token);

        // Mã ngắn như RCS/RTB không dùng để dò trong tên sản phẩm.
        if (normalizedToken.length < 5) continue;

        if (lineName && normalizedToken && lineName.includes(normalizedToken)) {
            return true;
        }
    }

    return false;
}

function getIssuedMisaLines() {
    if (typeof ensureInvoiceStatsLoaded === "function") {
        ensureInvoiceStatsLoaded();
    }

    return Array.isArray(invoiceState.lineRows)
        ? invoiceState.lineRows.filter(line => line?.issued === true)
        : [];
}

function buildInventoryMisaAssignment() {
    const issuedLines = getIssuedMisaLines();
    const qtyByItemCode = new Map();
    const unmatched = [];

    if (!issuedLines.length) {
        return {
            detailed: false,
            issuedLines: [],
            issuedQty: 0,
            mappedQty: 0,
            qtyByItemCode,
            unmatched
        };
    }

    const activeItems = inventoryState.items
        .filter(item => item.active !== false);

    let issuedQty = 0;
    let mappedQty = 0;

    issuedLines.forEach(line => {
        const qty = Number(line.quantity || 0);
        if (qty <= 0) return;

        issuedQty += qty;

        const matchedItem = activeItems.find(item =>
            isMisaLineMatchedToInventoryItem(line, item)
        );

        if (!matchedItem) {
            unmatched.push(line);
            return;
        }

        qtyByItemCode.set(
            matchedItem.itemCode,
            Number(qtyByItemCode.get(matchedItem.itemCode) || 0) + qty
        );

        mappedQty += qty;
    });

    return {
        detailed: true,
        issuedLines,
        issuedQty,
        mappedQty,
        qtyByItemCode,
        unmatched
    };
}

function getLegacyInventoryInvoiceQty(item) {
    // Chỉ dùng cho dữ liệu hóa đơn đã lưu từ V29 trở về trước
    // vì bản cũ chưa giữ Số hóa đơn ở từng dòng.
    const keyword = normalizeText(item.invoiceKeyword || "");
    if (!keyword) return 0;

    return (invoiceState.rows || []).reduce((sum, row) => {
        const product = normalizeText(row.productName || "");
        return product.includes(keyword)
            ? sum + Number(row.quantity || 0)
            : sum;
    }, 0);
}


function getInventoryTransitStatusSummary(rows = []) {
    const summary = {
        reserved: 0,
        in_transit: 0,
        delivered: 0,
        returning: 0,
        cancelled: 0,
        other: 0
    };

    rows.forEach(row => {
        const bucket = classifyInventoryShopeeStatus(row.status);
        summary[bucket] = Number(summary[bucket] || 0) + Number(row.quantity || 0);
    });

    return summary;
}

function getInventoryTransitObservedStatuses(rows = []) {
    const counts = new Map();

    rows.forEach(row => {
        const status = String(row.status || "").trim();
        if (!status) return;
        counts.set(status, Number(counts.get(status) || 0) + Number(row.quantity || 0));
    });

    return [...counts.entries()]
        .map(([status, quantity]) => ({ status, quantity }))
        .sort((a, b) => b.quantity - a.quantity);
}

function renderInventoryTransitSourceCard() {
    const box = $("inventoryTransitSourceCard");
    if (!box) return;

    const snapshot = inventoryState.transitSnapshot;

    if (!snapshot?.rows?.length) {
        box.classList.remove("loaded", "warning");
        box.innerHTML = `
            <div class="inventory-transit-source-icon">🚚</div>
            <div class="inventory-transit-source-copy">
                <strong>Chưa có file đơn luân chuyển Shopee</strong>
                <span>
                    V33 không còn lấy Giữ đơn / Đang giao / Đã giao / Hoàn đang về từ bảng Thống kê SKU.
                    Hãy upload file Order.all... chứa trạng thái hiện tại của các đơn cần theo dõi.
                </span>
            </div>
            <div class="inventory-transit-source-actions">
                <button type="button" class="btn btn-primary" data-trigger-transit-upload>
                    Upload file luân chuyển
                </button>
            </div>
        `;

        box.querySelector("[data-trigger-transit-upload]")?.addEventListener("click", () => {
            $("inventoryTransitFileInput")?.click();
        });

        return;
    }

    const movement = getInventoryTransitStatusSummary(snapshot.rows);
    const statuses = getInventoryTransitObservedStatuses(snapshot.rows);
    const mappedRows = buildInventoryMovementRows();
    const mappedQty = mappedRows
        .filter(row => row.itemCode)
        .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const unmatchedQty = mappedRows
        .filter(row => !row.itemCode)
        .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const hasDelivered = movement.delivered > 0;

    box.classList.add("loaded");
    box.classList.toggle("warning", !hasDelivered);

    const importedText = snapshot.importedAt
        ? formatDateTimeVi(snapshot.importedAt)
        : (snapshot.snapshotDate ? formatDateLabel(snapshot.snapshotDate) : "-");

    box.innerHTML = `
        <div class="inventory-transit-source-icon">🚚</div>

        <div class="inventory-transit-source-copy">
            <strong>${escapeHTML(snapshot.fileName || "File luân chuyển Shopee")}</strong>
            <span>
                Snapshot đang dùng · ${formatNumber(snapshot.orderCount || 0)} đơn ·
                ${formatNumber(snapshot.rowCount || snapshot.rows.length)} dòng ·
                cập nhật ${escapeHTML(importedText)} ·
                <strong>${formatNumber(mappedQty)} SP đã tự ghép vào kho</strong>
                ${unmatchedQty ? ` · <span class="inventory-transit-no-delivered">${formatNumber(unmatchedQty)} SP chưa ghép</span>` : ""}.
                ${!hasDelivered
                    ? '<span class="inventory-transit-no-delivered"> File này không có trạng thái “Đã giao”, nên cột Đã giao hiện = 0.</span>'
                    : ""}
            </span>

            <div class="inventory-transit-statuses">
                <span class="inventory-transit-status-chip">Giữ đơn <strong>${formatNumber(movement.reserved)}</strong></span>
                <span class="inventory-transit-status-chip">Đang giao <strong>${formatNumber(movement.in_transit)}</strong></span>
                <span class="inventory-transit-status-chip">Đã giao <strong>${formatNumber(movement.delivered)}</strong></span>
                <span class="inventory-transit-status-chip">Hoàn về <strong>${formatNumber(movement.returning)}</strong></span>
                ${statuses.slice(0, 3).map(item => `
                    <span class="inventory-transit-source-badge" title="${escapeHTML(item.status)}">
                        ${escapeHTML(item.status.length > 28 ? item.status.slice(0, 28) + "…" : item.status)}
                    </span>
                `).join("")}
            </div>
        </div>

        <div class="inventory-transit-source-actions">
            <button type="button" class="btn btn-light" data-trigger-transit-upload>
                Thay file snapshot
            </button>
        </div>
    `;

    box.querySelector("[data-trigger-transit-upload]")?.addEventListener("click", () => {
        $("inventoryTransitFileInput")?.click();
    });
}

async function saveInventoryTransitSnapshotCloud(snapshot) {
    assertPermissionV40("TRANSIT_UPLOAD");

    if (!inventoryState.cloudReady || !state.user) {
        return null;
    }

    const client = initSupabaseClient();

    const statusCounts = {};
    snapshot.rows.forEach(row => {
        const status = String(row.status || "").trim() || "(Trống)";
        statusCounts[status] = Number(statusCounts[status] || 0) + Number(row.quantity || 0);
    });

    const { data: savedSnapshot, error: snapshotError } = await client
        .from(DB_INVENTORY_TRANSIT_SNAPSHOTS)
        .insert({
            snapshot_date: snapshot.snapshotDate,
            file_name: snapshot.fileName,
            row_count: snapshot.rowCount,
            order_count: snapshot.orderCount,
            status_counts: statusCounts,
            created_by: state.user.id
        })
        .select("*")
        .single();

    if (snapshotError) throw snapshotError;

    const snapshotId = savedSnapshot.id;
    const chunkSize = 500;

    for (let start = 0; start < snapshot.rows.length; start += chunkSize) {
        const batch = snapshot.rows.slice(start, start + chunkSize).map((row, index) => ({
            snapshot_id: snapshotId,
            row_no: Number(row.rowNumber || start + index + 1),
            order_id: row.orderId || null,
            order_date: row.orderDate || null,
            status: row.status || null,
            sku: row.sku || null,
            product: row.product || null,
            quantity: Number(row.quantity || 0)
        }));

        const { error: rowError } = await client
            .from(DB_INVENTORY_TRANSIT_ROWS)
            .insert(batch);

        if (rowError) {
            // Xóa snapshot header để tránh để lại snapshot rỗng/lỗi.
            await client
                .from(DB_INVENTORY_TRANSIT_SNAPSHOTS)
                .delete()
                .eq("id", snapshotId)
                .catch(() => {});
            throw rowError;
        }
    }

    return {
        ...snapshot,
        id: snapshotId,
        importedAt: savedSnapshot.imported_at || snapshot.importedAt,
        statusCounts: savedSnapshot.status_counts || statusCounts
    };
}

async function processInventoryTransitUpload(file) {
    if (!requirePermissionV40("TRANSIT_UPLOAD")) {
        if ($("inventoryTransitFileInput")) $("inventoryTransitFileInput").value = "";
        return;
    }

    if (!file) return;

    const sourceCard = $("inventoryTransitSourceCard");

    try {
        if (sourceCard) {
            sourceCard.classList.add("loaded");
            sourceCard.classList.remove("warning");
            sourceCard.innerHTML = `
                <div class="inventory-transit-source-icon">🚚</div>
                <div class="inventory-transit-source-copy">
                    <strong>Đang đọc ${escapeHTML(file.name)}</strong>
                    <span class="inventory-transit-uploading">
                        Đang kiểm tra Mã đơn, SKU, số lượng và trạng thái hiện tại...
                    </span>
                </div>
                <div class="inventory-transit-source-actions"></div>
            `;
        }

        showToast("Đang đọc file đơn luân chuyển Shopee...");

        const rows = await readExcelFile(file);
        const parsedRows = parseShopeeRows(rows);
        const validationError = validateShopeeFile(rows, parsedRows, file.name);

        if (validationError) {
            throw new Error(validationError);
        }

        const usableRows = parsedRows.filter(row =>
            row.sku &&
            Number(row.quantity || 0) > 0 &&
            String(row.status || "").trim()
        );

        if (!usableRows.length) {
            throw new Error("File không có dòng đơn hàng hợp lệ để theo dõi luân chuyển.");
        }

        const orderCount = new Set(
            usableRows.map(row => row.orderId).filter(Boolean)
        ).size;

        const now = new Date();
        const nowIso = now.toISOString();

        const snapshot = {
            id: "",
            snapshotDate: getLocalTodayKey(),
            importedAt: nowIso,
            fileName: file.name,
            rowCount: usableRows.length,
            orderCount,
            rows: usableRows.map(row => ({
                ...row,
                sourceFile: file.name,
                snapshotDate: getLocalTodayKey(),
                updatedAt: nowIso
            }))
        };

        let savedSnapshot = snapshot;

        if (inventoryState.cloudReady && state.user) {
            if (!inventoryState.transitCloudReady) {
                throw new Error(
                    "Chưa có bảng Cloud cho đơn luân chuyển. Hãy chạy SQL V33 trong Supabase trước rồi upload lại."
                );
            }

            savedSnapshot = await saveInventoryTransitSnapshotCloud(snapshot);
        }

        inventoryState.transitSnapshot = savedSnapshot;
        inventoryState.movementRows = [];
        saveInventoryLocal();

        renderInventoryModule();
        renderInventoryTransitSourceCard();

        const movement = getInventoryTransitStatusSummary(savedSnapshot.rows);

        showToast(
            `Đã thay snapshot luân chuyển: ${formatNumber(orderCount)} đơn · ` +
            `Đang giao ${formatNumber(movement.in_transit)} · ` +
            `Giữ đơn ${formatNumber(movement.reserved)}.`
        );
    } catch (error) {
        console.error(error);
        alert("Không lưu được file đơn luân chuyển.\n\n" + (error?.message || ""));
        renderInventoryTransitSourceCard();
    } finally {
        if ($("inventoryTransitFileInput")) {
            $("inventoryTransitFileInput").value = "";
        }
    }
}


function parseInventoryNumberFromNote(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const normalized = raw.replace(/\s+/g, "").replace(/,/g, "");
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}
function parseInventoryReconcileNote(note) {
    const textValue = String(note || "");
    const theoryMatch = textValue.match(/Lý\s*thuyết\s*([+-]?\d[\d.,]*)/i);
    const actualMatch = textValue.match(/Thực\s*tế\s*([+-]?\d[\d.,]*)/i);
    const varianceMatch = textValue.match(/Chênh\s*([+-]?\d[\d.,]*)/i);
    const theory = theoryMatch ? parseInventoryNumberFromNote(theoryMatch[1]) : null;
    const actual = actualMatch ? parseInventoryNumberFromNote(actualMatch[1]) : null;
    let variance = varianceMatch ? parseInventoryNumberFromNote(varianceMatch[1]) : null;
    if (variance === null && theory !== null && actual !== null) variance = actual - theory;
    if (theory === null || actual === null || variance === null) return null;
    return { theory, actual, variance };
}
function getLatestInventoryReconcileRecord(itemCode) {
    const rows = (inventoryState.stocktakes || [])
        .filter(row => row.item_code === itemCode)
        .map(row => {
            const hasExplicitTheory = row.theoretical_qty !== null && row.theoretical_qty !== undefined;
            const hasExplicitVariance = row.variance_qty !== null && row.variance_qty !== undefined;

            if (hasExplicitTheory && hasExplicitVariance) {
                const theory = Number(row.theoretical_qty || 0);
                const actual = Number(row.physical_qty || 0);
                const variance = Number(row.variance_qty || 0);
                return {
                    row,
                    parsed: {
                        theory,
                        actual,
                        variance,
                        varianceValue:
                            row.variance_value !== null && row.variance_value !== undefined
                                ? Number(row.variance_value || 0)
                                : variance * Number(row.unit_price || 0),
                        status: String(row.reconcile_status || "").toUpperCase(),
                        baselineDate: row.baseline_date || ""
                    }
                };
            }

            const parsed = parseInventoryReconcileNote(row.note);
            return { row, parsed };
        })
        .filter(entry => entry.parsed)
        .sort((a, b) => {
            const d = String(b.row.stocktake_date || "").localeCompare(String(a.row.stocktake_date || ""));
            return d || String(b.row.created_at || "").localeCompare(String(a.row.created_at || ""));
        });

    if (!rows.length) return null;

    const latest = rows[0];
    const variance = Number(latest.parsed.variance || 0);

    return {
        date: latest.row.stocktake_date || "",
        createdAt: latest.row.created_at || "",
        baselineDate: latest.parsed.baselineDate || latest.row.baseline_date || "",
        theory: Number(latest.parsed.theory || 0),
        actual: Number(latest.parsed.actual || 0),
        variance,
        varianceValue:
            latest.parsed.varianceValue !== undefined
                ? Number(latest.parsed.varianceValue || 0)
                : variance * Number(latest.row.unit_price || 0),
        status: latest.parsed.status || (
            variance === 0 ? "MATCH" : variance < 0 ? "SHORTAGE" : "SURPLUS"
        )
    };
}
function getInventoryReconcileStatusV36(record) {
    if (!record) return { key: "pending", label: "Chưa đối chiếu" };
    const variance = Number(record.variance || 0);
    if (variance === 0) return { key: "match", label: "✓ Khớp" };
    if (variance < 0) return { key: "shortage", label: `Thiếu ${formatNumber(Math.abs(variance))}` };
    return { key: "surplus", label: `Thừa ${formatNumber(variance)}` };
}
function buildInventoryReconcileOverviewV36(summary) {
    const records = summary.map(item => ({ item, record: item.lastReconcile })).filter(x => x.record?.date);
    const latestDate = records.map(x => x.record.date).sort().reverse()[0] || "";
    const currentRecords = latestDate ? records.filter(x => x.record.date === latestDate) : [];
    const stats = {latestDate,counted:currentRecords.length,totalItems:summary.length,matched:0,shortage:0,surplus:0,varianceQty:0,varianceValue:0};
    currentRecords.forEach(({item,record}) => {
        const variance=Number(record.variance||0);
        stats.varianceQty += variance;
        stats.varianceValue += variance * Number(item.unitPrice||0);
        if (variance===0) stats.matched++; else if (variance<0) stats.shortage++; else stats.surplus++;
    });
    return stats;
}
function renderInventoryReconcileOverviewV36(summary) {
    const stats = buildInventoryReconcileOverviewV36(summary);
    if ($("inventoryReconcileOverviewDate")) $("inventoryReconcileOverviewDate").textContent =
        stats.latestDate ? `Lần chốt gần nhất: ${formatDateLabel(stats.latestDate)}` : "Chưa có lần đối chiếu nào được chốt";
    if ($("inventoryOverviewReconcileCount")) $("inventoryOverviewReconcileCount").textContent=`${formatNumber(stats.counted)}/${formatNumber(stats.totalItems)}`;
    if ($("inventoryOverviewMatched")) $("inventoryOverviewMatched").textContent=formatNumber(stats.matched);
    if ($("inventoryOverviewShortage")) $("inventoryOverviewShortage").textContent=formatNumber(stats.shortage);
    if ($("inventoryOverviewSurplus")) $("inventoryOverviewSurplus").textContent=formatNumber(stats.surplus);
    if ($("inventoryOverviewVarianceQty")) $("inventoryOverviewVarianceQty").textContent=stats.counted?`${stats.varianceQty>0?"+":""}${formatNumber(stats.varianceQty)}`:"—";
    if ($("inventoryOverviewVarianceValue")) $("inventoryOverviewVarianceValue").textContent=stats.counted?inventoryMoney(stats.varianceValue):"—";
    const hint=$("inventoryReconcileOverviewHint"); if(!hint)return; hint.classList.remove("ok","warning");
    if(!stats.latestDate){hint.textContent="Chưa thể kết luận kho khớp hay lệch. Hãy vào “Kiểm kê & đối chiếu”, nhập số đếm thực tế rồi Chốt kiểm kê.";return;}
    if(stats.counted<stats.totalItems){hint.classList.add("warning");hint.textContent=`Ngày ${formatDateLabel(stats.latestDate)} mới đối chiếu ${stats.counted}/${stats.totalItems} mặt hàng. Còn ${stats.totalItems-stats.counted} mặt hàng chưa có kết quả.`;return;}
    if(stats.shortage===0&&stats.surplus===0){hint.classList.add("ok");hint.textContent=`✓ Kho khớp tại lần kiểm ngày ${formatDateLabel(stats.latestDate)}: ${stats.totalItems}/${stats.totalItems} mặt hàng không chênh lệch.`;return;}
    hint.classList.add("warning"); hint.textContent=`⚠ Lần kiểm ${formatDateLabel(stats.latestDate)} có ${stats.shortage} mặt hàng thiếu và ${stats.surplus} mặt hàng thừa. Chênh tổng ${stats.varianceQty>0?"+":""}${formatNumber(stats.varianceQty)} sản phẩm.`;
}
function buildInventorySummary() {
    if (!inventoryState.loaded) loadInventoryLocal();

    const movementRows = buildInventoryMovementRows();
    const misaAssignment = buildInventoryMisaAssignment();
    inventoryState.misaAssignment = misaAssignment;

    const theoryAsOfDate = getLocalTodayKey();
    const theoryRows = buildInventoryLedgerAsOf(theoryAsOfDate);
    const theoryByItemCode = new Map(theoryRows.map(row => [row.itemCode, row]));

    const byItemCode = new Map();

    movementRows.forEach(row => {
        if (!row.itemCode) return;

        if (!byItemCode.has(row.itemCode)) {
            byItemCode.set(row.itemCode, {
                reserved: 0,
                in_transit: 0,
                delivered: 0,
                returning: 0,
                cancelled: 0,
                other: 0,
                transitSkus: new Set(),
                matchMethods: new Set()
            });
        }

        const bucket = byItemCode.get(row.itemCode);
        bucket[row.bucket] =
            Number(bucket[row.bucket] || 0) +
            Number(row.quantity || 0);

        if (row.rawSku) bucket.transitSkus.add(String(row.rawSku));
        if (row.matchMethod) bucket.matchMethods.add(String(row.matchMethod));
    });

    return inventoryState.items
        .filter(item => item.active !== false)
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
        .map(item => {
            const movement = byItemCode.get(item.itemCode) || {
                reserved: 0,
                in_transit: 0,
                delivered: 0,
                returning: 0,
                cancelled: 0,
                other: 0,
                transitSkus: new Set(),
                matchMethods: new Set()
            };

            const invoiceQty = misaAssignment.detailed
                ? Number(misaAssignment.qtyByItemCode.get(item.itemCode) || 0)
                : getLegacyInventoryInvoiceQty(item);

            const physical = Number(item.physicalQty || 0);
            const reserved = Number(movement.reserved || 0);
            const delivered = Number(movement.delivered || 0);

            const theoryRow = theoryByItemCode.get(item.itemCode) || null;
            const currentTheoretical = theoryRow ? Number(theoryRow.theoretical || 0) : physical;

            // V47: khả dụng phải dựa trên tồn hệ thống hiện tại, không lấy số kiểm cũ
            // rồi trừ đơn mới phát sinh sau ngày kiểm kê.
            const available = Math.max(0, currentTheoretical - reserved);
            const lastReconcile = getLatestInventoryReconcileRecord(item.itemCode);
            const reconcileStatus = getInventoryReconcileStatusV36(lastReconcile);

            // V35:
            // Nếu MISA đã xuất nhiều hơn "Đã giao" của snapshot hiện tại,
            // hai nguồn rõ ràng không cùng phạm vi -> KHÔNG hiển thị Chờ HĐ = 0.
            const invoiceScopeMismatch = invoiceQty > delivered && invoiceQty > 0;
            const waitingInvoiceComparable = !invoiceScopeMismatch;
            const waitingInvoice = waitingInvoiceComparable
                ? Math.max(0, delivered - invoiceQty)
                : null;

            return {
                ...item,
                reserved: Number(movement.reserved || 0),
                in_transit: Number(movement.in_transit || 0),
                delivered: Number(movement.delivered || 0),
                returning: Number(movement.returning || 0),
                cancelled: Number(movement.cancelled || 0),
                other: Number(movement.other || 0),
                transitSkus: [...movement.transitSkus],
                transitMatchMethods: [...movement.matchMethods],
                invoiceQty,
                waitingInvoice,
                waitingInvoiceComparable,
                invoiceScopeMismatch,
                invoiceDataMode: misaAssignment.detailed ? "invoice-number" : "legacy",
                available,
                currentTheoretical,
                currentTheoryDate: theoryAsOfDate,

                // V47 - giải thích công thức tồn ngay trên bảng chính
                baselineDate: theoryRow?.baselineDate || item.stocktakeDate || "",
                baselineQty: Number(theoryRow?.baselineQty ?? physical),
                ledgerInbound: Number(theoryRow?.inbound || 0),
                ledgerReturnIn: Number(theoryRow?.returnIn || 0),
                ledgerShopeeOut: Number(theoryRow?.shopeeOutDelta || 0),
                ledgerOutOther: Number(theoryRow?.outOther || 0),
                ledgerAdjustment: Number(theoryRow?.adjustment || 0),

                lastReconcile,
                reconcileStatus,
                stockValue: currentTheoretical * Number(item.unitPrice || 0)
            };
        });
}

function getInventoryUnmappedSkus() {
    const unresolved = buildInventoryMovementRows()
        .filter(row => !row.itemCode);

    const unique = new Map();

    unresolved.forEach(row => {
        const sku = String(row.rawSku || row.baseSku || "").trim() || "(không có SKU)";
        const name = String(row.itemName || "").trim();
        const key = `${sku}|${name}`;

        if (!unique.has(key)) {
            unique.set(key, {
                sku,
                name,
                quantity: 0
            });
        }

        unique.get(key).quantity += Number(row.quantity || 0);
    });

    return [...unique.values()]
        .sort((a, b) => b.quantity - a.quantity);
}

function renderInventoryFlowBars(summary) {
    const box = $("inventoryFlowBars");
    if (!box) return;

    const totals = {
        reserved: summary.reduce((s, x) => s + x.reserved, 0),
        in_transit: summary.reduce((s, x) => s + x.in_transit, 0),
        delivered: summary.reduce((s, x) => s + x.delivered, 0),
        invoiced: summary.reduce((s, x) => s + x.invoiceQty, 0),
        returning: summary.reduce((s, x) => s + x.returning, 0)
    };
    const maxValue = Math.max(...Object.values(totals), 1);
    const rows = [
        ["reserved", "Đã giữ cho đơn"],
        ["in_transit", "Đang giao"],
        ["delivered", "Đã giao"],
        ["invoiced", "Đã xuất HĐ (MISA)"],
        ["returning", "Hoàn đang về"]
    ];

    box.innerHTML = rows.map(([key, label]) => `
        <div class="inventory-flow-row">
            <div class="inventory-flow-label">${label}</div>
            <div class="inventory-flow-track">
                <div class="inventory-flow-fill ${key}" style="width:${(totals[key] / maxValue) * 100}%"></div>
            </div>
            <div class="inventory-flow-value">${formatNumber(totals[key])}</div>
        </div>
    `).join("");
}

function renderInventoryMisaInfo(summary) {
    const box = $("inventoryMisaInfo");
    if (!box) return;

    if (typeof ensureInvoiceStatsLoaded === "function") {
        ensureInvoiceStatsLoaded();
    }

    if (!invoiceState.rows?.length) {
        box.innerHTML = `
            <strong>Chưa có file hóa đơn MISA đang xem.</strong><br>
            Vào <b>Thống kê hóa đơn</b> và upload/xem một file.
            V30 sẽ chỉ tính các dòng có <b>Số hóa đơn</b>.
        `;
        return;
    }

    const dateText = invoiceState.dateFrom
        ? (invoiceState.dateFrom === invoiceState.dateTo
            ? formatDateLabel(invoiceState.dateFrom)
            : `${formatDateLabel(invoiceState.dateFrom)} → ${formatDateLabel(invoiceState.dateTo)}`)
        : "Không xác định";

    const assignment = inventoryState.misaAssignment || buildInventoryMisaAssignment();
    const totalMapped = summary.reduce((s, x) => s + Number(x.invoiceQty || 0), 0);

    if (!assignment.detailed) {
        box.innerHTML = `
            <strong>⚠ ${escapeHTML(invoiceState.fileName || "File MISA")}</strong><br>
            File này đang được xem từ dữ liệu lưu của bản cũ, chưa giữ chi tiết cột <b>Số hóa đơn</b>.

            <div class="inventory-misa-warning">
                Hãy <strong>upload lại file MISA một lần</strong> ở mục Thống kê hóa đơn.
                Sau đó V30 mới xác nhận chính xác dòng nào đã phát hành hóa đơn.
                Hiện cột “Đã xuất HĐ” đang dùng cách ghép tên sản phẩm cũ.
            </div>
        `;
        return;
    }

    const unmatchedGroups = new Map();

    assignment.unmatched.forEach(line => {
        const key = `${line.productCode || "-"}|${line.productName || "-"}`;

        if (!unmatchedGroups.has(key)) {
            unmatchedGroups.set(key, {
                productCode: line.productCode || "-",
                productName: line.productName || "-",
                quantity: 0
            });
        }

        unmatchedGroups.get(key).quantity += Number(line.quantity || 0);
    });

    const unmatchedList = [...unmatchedGroups.values()]
        .sort((a, b) => b.quantity - a.quantity);

    box.innerHTML = `
        <strong>✓ ${escapeHTML(invoiceState.fileName || "File MISA")}</strong><br>
        Ngày hóa đơn: <b>${escapeHTML(dateText)}</b> ·
        ${formatNumber(invoiceState.invoiceCount || 0)} số hóa đơn.

        <div class="inventory-misa-rule">
            <strong>Quy tắc V30:</strong>
            chỉ tính dòng có <b>Số hóa đơn</b> và không bị hủy/không hợp lệ.
            Hàng khuyến mại vẫn được tính số lượng xuất kho.
        </div>

        <div class="inventory-misa-grid">
            <div class="inventory-misa-stat">
                <span>DÒNG ĐÃ PHÁT HÀNH</span>
                <strong>${formatNumber(invoiceState.issuedLineCount || assignment.issuedLines.length)}</strong>
            </div>

            <div class="inventory-misa-stat">
                <span>SL ĐÃ XUẤT HĐ</span>
                <strong>${formatNumber(assignment.issuedQty)}</strong>
            </div>

            <div class="inventory-misa-stat">
                <span>SL ĐÃ GHÉP KHO</span>
                <strong>${formatNumber(totalMapped)}</strong>
            </div>

            <div class="inventory-misa-stat">
                <span>SL CHƯA MAP</span>
                <strong>${formatNumber(Math.max(0, assignment.issuedQty - assignment.mappedQty))}</strong>
            </div>

            <div class="inventory-misa-stat">
                <span>NHÓM HÀNG HÓA ĐƠN</span>
                <strong>${formatNumber(invoiceState.rows.length)}</strong>
            </div>

            <div class="inventory-misa-stat">
                <span>TỔNG TIỀN TT</span>
                <strong>${inventoryMoney(getInvoiceTotals().payment)}</strong>
            </div>
        </div>

        ${unmatchedList.length ? `
            <div class="inventory-misa-unmapped">
                <strong>Chưa ghép được vào kho:</strong><br>
                ${unmatchedList.slice(0, 12).map(item => `
                    <span class="inventory-misa-code-chip"
                          title="${escapeHTML(item.productName)}">
                        ${escapeHTML(item.productCode)} · ${formatNumber(item.quantity)}
                    </span>
                `).join("")}
            </div>
        ` : ""}
    `;
}


/* ======================== V31 - KIỂM KÊ & ĐỐI CHIẾU KHO ======================== */

function inventoryTxLabel(type) {
    return {
        INBOUND: "Nhập kho",
        RETURN_IN: "Hoàn nhập kho",
        OUT_OTHER: "Xuất kho khác",
        ADJUSTMENT: "Điều chỉnh"
    }[type] || type || "Khác";
}

function inventorySignedTransactionEffect(tx) {
    const qty = Number(tx.quantity || 0);

    if (tx.type === "INBOUND") return qty;
    if (tx.type === "RETURN_IN") return qty;
    if (tx.type === "OUT_OTHER") return -Math.abs(qty);
    if (tx.type === "ADJUSTMENT") return qty;

    return 0;
}

function inventoryTransactionDbPayload(tx) {
    return {
        transaction_date: tx.transactionDate,
        item_code: tx.itemCode,
        transaction_type: tx.type,
        quantity: Number(tx.quantity || 0),
        reference: tx.reference || null,
        note: tx.note || null,
        source: tx.source || "manual",
        created_by: state.user?.id || null
    };
}

async function addInventoryTransactionFromForm() {
    if (!requirePermissionV40("INVENTORY_WRITE")) return;

    const transactionDate = $("inventoryTxDate")?.value || getLocalTodayKey();
    const itemCode = $("inventoryTxItem")?.value || "";
    const type = $("inventoryTxType")?.value || "INBOUND";
    let quantity = Number($("inventoryTxQty")?.value || 0);
    const reference = String($("inventoryTxReference")?.value || "").trim();
    const note = String($("inventoryTxNote")?.value || "").trim();

    if (!itemCode) {
        alert("Hãy chọn mặt hàng.");
        return;
    }

    if (!Number.isFinite(quantity) || quantity === 0) {
        alert("Số lượng phải khác 0.");
        return;
    }

    if (type !== "ADJUSTMENT") {
        quantity = Math.abs(quantity);
    }

    const item = inventoryState.items.find(row => row.itemCode === itemCode);

    const tx = {
        id: `local-tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        transactionDate,
        itemCode,
        type,
        quantity,
        reference,
        note,
        source: "manual",
        createdBy: state.user?.id || "",
        createdAt: new Date().toISOString()
    };

    const button = $("btnInventoryAddTransaction");
    if (button) {
        button.disabled = true;
        button.textContent = "ĐANG LƯU...";
    }

    try {
        if (inventoryState.cloudReady && state.user) {
            const client = initSupabaseClient();
            const { data, error } = await client
                .from(DB_INVENTORY_TRANSACTIONS)
                .insert(inventoryTransactionDbPayload(tx))
                .select("*")
                .single();

            if (error) throw error;

            tx.id = data.id;
            tx.createdAt = data.created_at || tx.createdAt;
        }

        inventoryState.transactions.unshift(tx);
        saveInventoryLocal();

        if ($("inventoryTxQty")) $("inventoryTxQty").value = "";
        if ($("inventoryTxReference")) $("inventoryTxReference").value = "";
        if ($("inventoryTxNote")) $("inventoryTxNote").value = "";

        renderInventoryTransactions();
        renderInventoryCurrentStock();
        renderInventoryReconciliation();
        showToast(`Đã ghi ${inventoryTxLabel(type)} ${formatNumber(quantity)} ${item?.name || ""}.`);
    } catch (error) {
        console.error(error);
        alert("Không lưu được biến động kho.\n\n" + (error?.message || ""));
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "+ Ghi nhận biến động";
        }
    }
}

async function deleteInventoryTransaction(id) {
    if (!requirePermissionV40("INVENTORY_WRITE")) return;

    const tx = inventoryState.transactions.find(row => row.id === id);
    if (!tx) return;

    const item = inventoryState.items.find(row => row.itemCode === tx.itemCode);
    const ok = confirm(
        `Xóa biến động kho này?\n\n` +
        `${inventoryTxLabel(tx.type)} · ${item?.name || tx.itemCode}\n` +
        `Ngày: ${tx.transactionDate ? formatDateLabel(tx.transactionDate) : "-"}\n` +
        `SL: ${formatNumber(tx.quantity)}`
    );

    if (!ok) return;

    try {
        if (inventoryState.cloudReady && state.user && !String(id).startsWith("local-")) {
            const client = initSupabaseClient();
            const { error } = await client
                .from(DB_INVENTORY_TRANSACTIONS)
                .delete()
                .eq("id", id);

            if (error) throw error;
        }

        inventoryState.transactions = inventoryState.transactions.filter(row => row.id !== id);
        saveInventoryLocal();

        renderInventoryTransactions();
        renderInventoryCurrentStock();
        renderInventoryReconciliation();
        showToast("Đã xóa biến động kho.");
    } catch (error) {
        alert("Không xóa được biến động kho.\n\n" + (error?.message || ""));
    }
}

function getLatestStocktakeForItem(item, asOfDate) {
    const candidates = (inventoryState.stocktakes || [])
        .filter(row =>
            row.item_code === item.itemCode &&
            row.stocktake_date &&
            (!asOfDate || row.stocktake_date <= asOfDate)
        )
        .sort((a, b) => {
            const dateCompare = String(b.stocktake_date).localeCompare(String(a.stocktake_date));
            if (dateCompare) return dateCompare;
            return String(b.created_at || "").localeCompare(String(a.created_at || ""));
        });

    if (candidates.length) {
        return {
            date: candidates[0].stocktake_date,
            quantity: Number(candidates[0].physical_qty || 0),
            unitPrice: Number(candidates[0].unit_price || item.unitPrice || 0),
            source: "stocktake"
        };
    }

    const fallbackDate = item.stocktakeDate || "";

    if (!asOfDate || !fallbackDate || fallbackDate <= asOfDate) {
        return {
            date: fallbackDate || asOfDate || getLocalTodayKey(),
            quantity: Number(item.physicalQty || 0),
            unitPrice: Number(item.unitPrice || 0),
            source: "item"
        };
    }

    return {
        date: "",
        quantity: 0,
        unitPrice: Number(item.unitPrice || 0),
        source: "none"
    };
}

function getOutboundShopeeByItemAsOf(asOfDate) {
    const rows = buildInventoryMovementRows(asOfDate);
    const result = new Map();

    rows.forEach(row => {
        if (!row.itemCode) return;

        // Hàng được xem là đã rời kho khi đang giao / đã giao / hoàn đang về.
        if (!["in_transit", "delivered", "returning"].includes(row.bucket)) {
            return;
        }

        result.set(
            row.itemCode,
            Number(result.get(row.itemCode) || 0) + Number(row.quantity || 0)
        );
    });

    return result;
}

function getTransactionsForItemPeriod(itemCode, afterDate, toDate) {
    return (inventoryState.transactions || []).filter(tx =>
        tx.itemCode === itemCode &&
        tx.transactionDate &&
        (!afterDate || tx.transactionDate > afterDate) &&
        (!toDate || tx.transactionDate <= toDate)
    );
}

function summarizeInventoryTransactions(itemCode, afterDate, toDate) {
    const txs = getTransactionsForItemPeriod(itemCode, afterDate, toDate);

    return txs.reduce((acc, tx) => {
        const qty = Number(tx.quantity || 0);

        if (tx.type === "INBOUND") acc.inbound += Math.abs(qty);
        if (tx.type === "RETURN_IN") acc.returnIn += Math.abs(qty);
        if (tx.type === "OUT_OTHER") acc.outOther += Math.abs(qty);
        if (tx.type === "ADJUSTMENT") acc.adjustment += qty;

        return acc;
    }, {
        inbound: 0,
        returnIn: 0,
        outOther: 0,
        adjustment: 0
    });
}

function buildInventoryLedgerAsOf(asOfDate) {
    const currentOutbound = getOutboundShopeeByItemAsOf(asOfDate);

    return inventoryState.items
        .filter(item => item.active !== false)
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
        .map(item => {
            const baseline = getLatestStocktakeForItem(item, asOfDate);
            const baselineOutboundMap = baseline.date
                ? getOutboundShopeeByItemAsOf(baseline.date)
                : new Map();

            const baselineOutbound = Number(baselineOutboundMap.get(item.itemCode) || 0);
            const outboundNow = Number(currentOutbound.get(item.itemCode) || 0);
            const shopeeOutDelta = outboundNow - baselineOutbound;

            const tx = summarizeInventoryTransactions(
                item.itemCode,
                baseline.date,
                asOfDate
            );

            const theoretical =
                Number(baseline.quantity || 0) +
                tx.inbound +
                tx.returnIn -
                shopeeOutDelta -
                tx.outOther +
                tx.adjustment;

            return {
                itemCode: item.itemCode,
                name: item.name,
                shopeeSku: item.shopeeSku,
                unitPrice: Number(item.unitPrice || baseline.unitPrice || 0),
                baselineDate: baseline.date,
                baselineQty: Number(baseline.quantity || 0),
                inbound: tx.inbound,
                returnIn: tx.returnIn,
                shopeeOutDelta,
                outOther: tx.outOther,
                adjustment: tx.adjustment,
                theoretical,
                theoreticalValue: theoretical * Number(item.unitPrice || baseline.unitPrice || 0)
            };
        });
}

function renderInventoryCurrentStock() {
    const body = $("inventoryCurrentBody");
    const foot = $("inventoryCurrentFoot");
    if (!body || !foot) return;

    const asOfDate = $("inventoryCurrentDate")?.value || inventoryState.currentDate || getLocalTodayKey();
    inventoryState.currentDate = asOfDate;

    if ($("inventoryCurrentDate") && !$("inventoryCurrentDate").value) {
        $("inventoryCurrentDate").value = asOfDate;
    }

    const rows = buildInventoryLedgerAsOf(asOfDate);

    const totals = rows.reduce((acc, row) => {
        acc.baseline += row.baselineQty;
        acc.inbound += row.inbound;
        acc.returnIn += row.returnIn;
        acc.shopeeOut += row.shopeeOutDelta;
        acc.outOther += row.outOther;
        acc.adjustment += row.adjustment;
        acc.theoretical += row.theoretical;
        acc.value += row.theoreticalValue;
        return acc;
    }, {
        baseline:0,inbound:0,returnIn:0,shopeeOut:0,outOther:0,adjustment:0,theoretical:0,value:0
    });

    if ($("inventoryCurrentBaselineTotal")) $("inventoryCurrentBaselineTotal").textContent = formatNumber(totals.baseline);
    if ($("inventoryCurrentInboundTotal")) $("inventoryCurrentInboundTotal").textContent = formatNumber(totals.inbound + totals.returnIn);
    if ($("inventoryCurrentOutboundTotal")) $("inventoryCurrentOutboundTotal").textContent = formatNumber(totals.shopeeOut + totals.outOther);
    if ($("inventoryCurrentTheoryTotal")) $("inventoryCurrentTheoryTotal").textContent = formatNumber(totals.theoretical);

    body.innerHTML = rows.map((row,index) => `
        <tr>
            <td>${index+1}</td>
            <td><button type="button" class="inventory-ledger-sku-link" data-inventory-ledger="${escapeHTML(row.itemCode)}">${escapeHTML(row.itemCode)}</button></td>
            <td>
                <button type="button" class="inventory-ledger-name-link" data-inventory-ledger="${escapeHTML(row.itemCode)}">${escapeHTML(row.name)}</button>
                <div class="muted">Mặt hàng tồn kho</div>
            </td>
            <td>${row.baselineDate ? formatDateLabel(row.baselineDate) : "-"}</td>
            <td><strong>${formatNumber(row.baselineQty)}</strong></td>
            <td class="positive-col">${row.inbound ? `+${formatNumber(row.inbound)}` : "0"}</td>
            <td class="positive-col">${row.returnIn ? `+${formatNumber(row.returnIn)}` : "0"}</td>
            <td class="negative-col">${row.shopeeOutDelta > 0 ? `-${formatNumber(row.shopeeOutDelta)}` : row.shopeeOutDelta < 0 ? `+${formatNumber(Math.abs(row.shopeeOutDelta))}` : "0"}</td>
            <td class="negative-col">${row.outOther ? `-${formatNumber(row.outOther)}` : "0"}</td>
            <td>${row.adjustment > 0 ? "+" : ""}${formatNumber(row.adjustment)}</td>
            <td class="theory-col">${formatNumber(row.theoretical)}</td>
            <td>${inventoryMoney(row.unitPrice)}</td>
            <td><strong>${inventoryMoney(row.theoreticalValue)}</strong></td>
        </tr>
    `).join("");

    foot.innerHTML = `
        <tr>
            <td></td>
            <td>TỔNG</td>
            <td>${formatNumber(rows.length)} mặt hàng</td>
            <td></td>
            <td>${formatNumber(totals.baseline)}</td>
            <td>${formatNumber(totals.inbound)}</td>
            <td>${formatNumber(totals.returnIn)}</td>
            <td>${formatNumber(totals.shopeeOut)}</td>
            <td>${formatNumber(totals.outOther)}</td>
            <td>${totals.adjustment > 0 ? "+" : ""}${formatNumber(totals.adjustment)}</td>
            <td>${formatNumber(totals.theoretical)}</td>
            <td></td>
            <td>${inventoryMoney(totals.value)}</td>
        </tr>
    `;
}

function renderInventoryTransactionItemOptions() {
    const select = $("inventoryTxItem");
    if (!select) return;

    const currentValue = select.value;

    select.innerHTML = inventoryState.items
        .filter(item => item.active !== false)
        .sort((a,b) => Number(a.sortOrder||0)-Number(b.sortOrder||0))
        .map(item => `
            <option value="${escapeHTML(item.itemCode)}">
                ${escapeHTML(item.itemCode)} · ${escapeHTML(item.name)}
            </option>
        `).join("");

    if (currentValue && [...select.options].some(o => o.value === currentValue)) {
        select.value = currentValue;
    }
}

function renderInventoryTransactions() {
    renderInventoryTransactionItemOptions();

    const body = $("inventoryTxBody");
    const filter = $("inventoryTxFilter")?.value || "all";
    if (!body) return;

    const rows = [...(inventoryState.transactions || [])]
        .filter(tx => filter === "all" || tx.type === filter)
        .sort((a,b) =>
            String(b.transactionDate || "").localeCompare(String(a.transactionDate || "")) ||
            String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
        );

    const totals = (inventoryState.transactions || []).reduce((acc, tx) => {
        const qty = Number(tx.quantity || 0);
        if (tx.type === "INBOUND") acc.inbound += Math.abs(qty);
        if (tx.type === "RETURN_IN") acc.returnIn += Math.abs(qty);
        if (tx.type === "OUT_OTHER") acc.outOther += Math.abs(qty);
        if (tx.type === "ADJUSTMENT") acc.adjustment += qty;
        return acc;
    }, { inbound:0, returnIn:0, outOther:0, adjustment:0 });

    if ($("inventoryTxKpiSubtitle")) {
        $("inventoryTxKpiSubtitle").textContent =
            `${formatNumber(inventoryState.transactions.length)} giao dịch đã lưu`;
    }

    if ($("inventoryTxSummary")) {
        $("inventoryTxSummary").innerHTML = `
            <div class="inventory-tx-mini in">
                <span>NHẬP KHO</span>
                <strong>+${formatNumber(totals.inbound)}</strong>
            </div>
            <div class="inventory-tx-mini return">
                <span>HOÀN NHẬP KHO</span>
                <strong>+${formatNumber(totals.returnIn)}</strong>
            </div>
            <div class="inventory-tx-mini out">
                <span>XUẤT KHÁC</span>
                <strong>-${formatNumber(totals.outOther)}</strong>
            </div>
            <div class="inventory-tx-mini adjust">
                <span>ĐIỀU CHỈNH</span>
                <strong>${totals.adjustment > 0 ? "+" : ""}${formatNumber(totals.adjustment)}</strong>
            </div>
        `;
    }

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="10" class="empty-table">Chưa có biến động kho phù hợp.</td></tr>';
        return;
    }

    const itemMap = new Map(inventoryState.items.map(item => [item.itemCode, item]));

    body.innerHTML = rows.map((tx,index) => {
        const item = itemMap.get(tx.itemCode);
        return `
            <tr>
                <td>${index+1}</td>
                <td>${tx.transactionDate ? formatDateLabel(tx.transactionDate) : "-"}</td>
                <td>${escapeHTML(tx.itemCode)}</td>
                <td>${escapeHTML(item?.name || "-")}</td>
                <td><span class="inventory-tx-type ${escapeHTML(tx.type)}">${inventoryTxLabel(tx.type)}</span></td>
                <td><strong>${tx.type === "ADJUSTMENT" && tx.quantity > 0 ? "+" : ""}${formatNumber(tx.quantity)}</strong></td>
                <td>${escapeHTML(tx.reference || "-")}</td>
                <td>${escapeHTML(tx.note || "-")}</td>
                <td>${tx.createdBy === state.user?.id ? "Bạn" : (tx.createdBy ? "Nhân viên" : "-")}</td>
                <td>
                    <button type="button"
                            class="inventory-tx-delete"
                            data-inventory-tx-delete="${escapeHTML(tx.id)}">
                        Xóa
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    document.querySelectorAll("[data-inventory-tx-delete]").forEach(button => {
        button.addEventListener("click", () => deleteInventoryTransaction(button.dataset.inventoryTxDelete));
    });

    applyRoleUiV40();
}

function renderInventoryReconciliation() {
    const body = $("inventoryReconcileBody");
    const foot = $("inventoryReconcileFoot");
    if (!body || !foot) return;

    const dateInput = $("inventoryReconcileDate");
    const asOfDate = dateInput?.value || inventoryState.reconcileDate || getLocalTodayKey();
    inventoryState.reconcileDate = asOfDate;

    if (dateInput && !dateInput.value) {
        dateInput.value = asOfDate;
    }

    const rows = buildInventoryLedgerAsOf(asOfDate);

    const stats = {
        matched: 0,
        shortage: 0,
        surplus: 0,
        varianceQty: 0,
        varianceValue: 0,
        counted: 0,
        theoretical: 0,
        actual: 0
    };

    body.innerHTML = rows.map((row,index) => {
        const rawActual = inventoryState.reconcileCounts[row.itemCode];
        const hasActual = rawActual !== undefined && rawActual !== null && rawActual !== "";
        const actual = hasActual ? Number(rawActual) : null;
        const variance = hasActual ? actual - row.theoretical : null;
        const varianceValue = hasActual ? variance * row.unitPrice : null;

        let status = "pending";
        let label = "Chưa đếm";

        if (hasActual) {
            stats.counted++;
            stats.actual += actual;
            stats.varianceQty += variance;
            stats.varianceValue += varianceValue;

            if (variance === 0) {
                stats.matched++;
                status = "match";
                label = "✓ Khớp";
            } else if (variance < 0) {
                stats.shortage++;
                status = "shortage";
                label = `Thiếu ${formatNumber(Math.abs(variance))}`;
            } else {
                stats.surplus++;
                status = "surplus";
                label = `Thừa ${formatNumber(variance)}`;
            }
        }

        stats.theoretical += row.theoretical;

        const varianceClass =
            !hasActual ? "" :
            variance < 0 ? "negative" :
            variance > 0 ? "positive" : "zero";

        return `
            <tr>
                <td>${index+1}</td>
                <td>${escapeHTML(row.itemCode)}</td>
                <td>${escapeHTML(row.name)}</td>
                <td>${row.baselineDate ? formatDateLabel(row.baselineDate) : "-"}</td>
                <td>${formatNumber(row.baselineQty)}</td>
                <td>${formatNumber(row.inbound)}</td>
                <td>${formatNumber(row.returnIn)}</td>
                <td>${formatNumber(row.shopeeOutDelta)}</td>
                <td>${formatNumber(row.outOther)}</td>
                <td>${row.adjustment > 0 ? "+" : ""}${formatNumber(row.adjustment)}</td>
                <td class="theory-col">${formatNumber(row.theoretical)}</td>
                <td class="actual-col">
                    <input
                        type="number"
                        min="0"
                        step="1"
                        class="inventory-reconcile-input"
                        data-reconcile-item="${escapeHTML(row.itemCode)}"
                        value="${hasActual ? escapeHTML(String(rawActual)) : ""}"
                        placeholder="Đếm"
                    >
                </td>
                <td class="inventory-variance ${varianceClass}">
                    ${hasActual ? (variance > 0 ? "+" : "") + formatNumber(variance) : "—"}
                </td>
                <td class="inventory-variance ${varianceClass}">
                    ${hasActual ? inventoryMoney(varianceValue) : "—"}
                </td>
                <td>
                    <span class="inventory-reconcile-status ${status}">${label}</span>
                </td>
            </tr>
        `;
    }).join("");

    document.querySelectorAll("[data-reconcile-item]").forEach(input => {
        input.addEventListener("change", () => {
            const code = input.dataset.reconcileItem;
            inventoryState.reconcileCounts[code] = input.value;
            renderInventoryReconciliation();
        });
    });

    if ($("reconcileCountedCount")) $("reconcileCountedCount").textContent = `${formatNumber(stats.counted)}/${formatNumber(rows.length)}`;
    if ($("reconcileMatchedCount")) $("reconcileMatchedCount").textContent = formatNumber(stats.matched);
    if ($("reconcileShortageCount")) $("reconcileShortageCount").textContent = formatNumber(stats.shortage);
    if ($("reconcileSurplusCount")) $("reconcileSurplusCount").textContent = formatNumber(stats.surplus);
    if ($("reconcileVarianceQty")) {
        $("reconcileVarianceQty").textContent =
            `${stats.varianceQty > 0 ? "+" : ""}${formatNumber(stats.varianceQty)}`;
    }
    if ($("reconcileVarianceValue")) {
        $("reconcileVarianceValue").textContent = inventoryMoney(stats.varianceValue);
    }

    foot.innerHTML = `
        <tr>
            <td></td>
            <td>TỔNG</td>
            <td>${formatNumber(rows.length)} mặt hàng · Đã đếm ${formatNumber(stats.counted)}</td>
            <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            <td>${formatNumber(stats.theoretical)}</td>
            <td>${stats.counted ? formatNumber(stats.actual) : "—"}</td>
            <td>${stats.counted ? `${stats.varianceQty > 0 ? "+" : ""}${formatNumber(stats.varianceQty)}` : "—"}</td>
            <td>${stats.counted ? inventoryMoney(stats.varianceValue) : "—"}</td>
            <td></td>
        </tr>
    `;
}

async function commitInventoryReconciliation() {
    if (!requirePermissionV40("INVENTORY_WRITE")) return;

    const asOfDate = $("inventoryReconcileDate")?.value || getLocalTodayKey();
    const rows = buildInventoryLedgerAsOf(asOfDate);

    const counted = rows
        .filter(row => {
            const value = inventoryState.reconcileCounts[row.itemCode];
            return value !== undefined && value !== null && value !== "";
        })
        .map(row => ({
            ...row,
            actual: Math.max(0, Number(inventoryState.reconcileCounts[row.itemCode]) || 0)
        }));

    if (!counted.length) {
        alert("Bạn chưa nhập số kiểm thực tế cho mặt hàng nào.");
        return;
    }

    const shortage = counted.filter(row => row.actual < row.theoretical).length;
    const surplus = counted.filter(row => row.actual > row.theoretical).length;
    const matched = counted.filter(row => row.actual === row.theoretical).length;

    if (counted.length < rows.length) {
        const continuePartial = confirm(
            `Bạn mới đếm ${counted.length}/${rows.length} mặt hàng.

` +
            `Nếu tiếp tục, V48 chỉ chốt ${counted.length} SKU đã nhập; các SKU còn lại giữ nguyên mốc cũ.

` +
            `Tiếp tục chốt một phần?`
        );
        if (!continuePartial) return;
    }

    const ok = confirm(
        `Chốt kiểm kê ngày ${formatDateLabel(asOfDate)}?\n\n` +
        `Đã đếm: ${counted.length} mặt hàng\n` +
        `Khớp: ${matched}\nThiếu: ${shortage}\nThừa: ${surplus}\n\n` +
        `Sau khi chốt, số đếm thực tế sẽ trở thành mốc tính tồn mới; chênh lệch được lưu riêng trên Cloud.`
    );

    if (!ok) return;

    const button = $("btnInventoryCommitReconcile");
    if (button) {
        button.disabled = true;
        button.textContent = "ĐANG CHỐT...";
    }

    try {
        const countedMap = new Map(counted.map(row => [row.itemCode, row]));

        inventoryState.items = inventoryState.items.map(item => {
            const found = countedMap.get(item.itemCode);
            if (!found) return item;

            return {
                ...item,
                physicalQty: found.actual,
                stocktakeDate: asOfDate
            };
        });

        saveInventoryLocal();

        if (inventoryState.cloudReady && state.user) {
            const client = initSupabaseClient();

            const changedItems = inventoryState.items
                .filter(item => countedMap.has(item.itemCode))
                .map(inventoryStateToDbRow);

            const { error: itemError } = await client
                .from(DB_INVENTORY_ITEMS)
                .upsert(changedItems, { onConflict: "item_code" });

            if (itemError) throw itemError;

            const payload = counted.map(row => {
                const variance = row.actual - row.theoretical;
                const varianceValue = variance * Number(row.unitPrice || 0);
                const status = variance === 0 ? "MATCH" : variance < 0 ? "SHORTAGE" : "SURPLUS";

                return {
                    stocktake_date: asOfDate,
                    item_code: row.itemCode,
                    physical_qty: row.actual,
                    unit_price: Number(row.unitPrice || 0),

                    // V47 - lưu cấu trúc đối chiếu rõ ràng trên Cloud
                    baseline_date: row.baselineDate || null,
                    theoretical_qty: Number(row.theoretical || 0),
                    variance_qty: variance,
                    variance_value: varianceValue,
                    reconcile_status: status,

                    note:
                        `Kiểm kê V48 · Lý thuyết ${row.theoretical} · ` +
                        `Thực tế ${row.actual} · Chênh ${variance} · ` +
                        `Giá trị chênh ${varianceValue} · ${status}`,
                    created_by: state.user?.id || null
                };
            });

            const { data: inserted, error: stocktakeError } = await client
                .from(DB_INVENTORY_STOCKTAKES)
                .insert(payload)
                .select("*");

            if (stocktakeError) throw stocktakeError;
            inventoryState.stocktakes.unshift(...(inserted || []));
        } else {
            const now = new Date().toISOString();
            inventoryState.stocktakes.unshift(
                ...counted.map((row,index) => {
                    const variance = row.actual - row.theoretical;
                    const varianceValue = variance * Number(row.unitPrice || 0);
                    const status = variance === 0 ? "MATCH" : variance < 0 ? "SHORTAGE" : "SURPLUS";
                    return {
                        id:`local-reconcile-${Date.now()}-${index}`,
                        stocktake_date:asOfDate,
                        item_code:row.itemCode,
                        physical_qty:row.actual,
                        unit_price:Number(row.unitPrice||0),
                        baseline_date:row.baselineDate||null,
                        theoretical_qty:Number(row.theoretical||0),
                        variance_qty:variance,
                        variance_value:varianceValue,
                        reconcile_status:status,
                        note:
                            `Kiểm kê V48 · Lý thuyết ${row.theoretical} · ` +
                            `Thực tế ${row.actual} · Chênh ${variance} · ` +
                            `Giá trị chênh ${varianceValue} · ${status}`,
                        created_at:now
                    };
                })
            );
        }

        inventoryState.reconcileCounts = {};
        saveInventoryLocal();

        renderInventoryModule();
        renderInventoryCurrentStock();
        renderInventoryReconciliation();
        showToast(`Đã chốt kiểm kê ${formatDateLabel(asOfDate)}.`);
    } catch (error) {
        console.error(error);
        alert("Không chốt được kiểm kê.\n\n" + (error?.message || ""));
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "✅ Chốt kiểm kê";
        }
    }
}

function clearInventoryReconcileCounts() {
    inventoryState.reconcileCounts = {};
    renderInventoryReconciliation();
}


function renderInventoryMisaUploadInfo() {
    const box = $("inventoryMisaUploadInfo");
    if (!box) return;

    if (!invoiceState?.rows?.length) {
        box.classList.remove("loaded");
        box.innerHTML = `
            <div class="inventory-misa-upload-icon">🧾</div>
            <div class="inventory-misa-upload-copy">
                <strong>Chưa có file MISA đang xem</strong>
                <span>Upload file đã phát hành hóa đơn để hệ thống xác định số lượng đã xuất HĐ.</span>
            </div>
            <div class="inventory-misa-upload-effect">
                <span>ẢNH HƯỞNG TỒN VẬT LÝ</span>
                <strong>0</strong>
                <small>Không trừ lần 2</small>
            </div>
        `;
        return;
    }

    const assignment = inventoryState.misaAssignment || buildInventoryMisaAssignment();

    const dateText = invoiceState.dateFrom
        ? (
            invoiceState.dateFrom === invoiceState.dateTo
                ? formatDateLabel(invoiceState.dateFrom)
                : `${formatDateLabel(invoiceState.dateFrom)} → ${formatDateLabel(invoiceState.dateTo)}`
        )
        : "Không xác định";

    box.classList.add("loaded");
    box.innerHTML = `
        <div class="inventory-misa-upload-icon">✅</div>
        <div class="inventory-misa-upload-copy">
            <strong>${escapeHTML(invoiceState.fileName || "File MISA")}</strong>
            <span>
                Ngày HĐ: <b>${escapeHTML(dateText)}</b> ·
                ${formatNumber(invoiceState.invoiceCount || 0)} số HĐ ·
                ${formatNumber(invoiceState.issuedLineCount || assignment.issuedLines?.length || 0)} dòng đã phát hành ·
                <b>${formatNumber(assignment.issuedQty || 0)} sản phẩm đã xuất HĐ</b>.
            </span>
        </div>
        <div class="inventory-misa-upload-effect">
            <span>ẢNH HƯỞNG TỒN VẬT LÝ</span>
            <strong>0</strong>
            <small>Chỉ đổi trạng thái HĐ</small>
        </div>
    `;
}

function renderInventoryMisaTab() {
    const summary = buildInventorySummary();
    renderInventoryMisaUploadInfo();

    // Tái sử dụng nội dung đối chiếu chi tiết từ khối overview
    const temp = $("inventoryMisaInfoV31");
    if (temp) {
        const original = $("inventoryMisaInfo");

        if (original) {
            renderInventoryMisaInfo(summary);
            temp.innerHTML = original.innerHTML;
        }
    }

    const body = $("inventoryMisaDetailBody");
    if (!body) return;

    if (!summary.length) {
        body.innerHTML = '<tr><td colspan="7" class="empty-table">Chưa có dữ liệu.</td></tr>';
        return;
    }

    body.innerHTML = summary.map((item,index) => `
        <tr>
            <td>${index+1}</td>
            <td>${escapeHTML(item.itemCode)}</td>
            <td>${escapeHTML(item.name)}</td>
            <td>${formatNumber(item.delivered || 0)}</td>
            <td><strong>${formatNumber(item.invoiceQty || 0)}</strong></td>
            <td>
                ${item.waitingInvoiceComparable
                    ? formatNumber(item.waitingInvoice || 0)
                    : '<span class="inventory-waiting-dash" title="Khác kỳ nên không tính Chờ HĐ">—</span>'}
            </td>
            <td>
                ${item.invoiceScopeMismatch
                    ? '<span class="inventory-reconcile-status surplus">Khác kỳ</span>'
                    : '<span class="inventory-reconcile-status match">Có thể đối chiếu</span>'}
            </td>
        </tr>
    `).join("");
}

function setInventoryTab(tabName) {
    const allowed = ["overview","current","transactions","reconcile","misa"];
    const tab = allowed.includes(tabName) ? tabName : "overview";
    inventoryState.activeTab = tab;

    document.querySelectorAll("[data-inventory-tab]").forEach(button => {
        button.classList.toggle("active", button.dataset.inventoryTab === tab);
    });

    const panes = {
        overview: $("inventoryTabOverview"),
        current: $("inventoryTabCurrent"),
        transactions: $("inventoryTabTransactions"),
        reconcile: $("inventoryTabReconcile"),
        misa: $("inventoryTabMisa")
    };

    Object.entries(panes).forEach(([key,pane]) => {
        pane?.classList.toggle("active", key === tab);
    });

    if (tab === "current") renderInventoryCurrentStock();
    if (tab === "transactions") renderInventoryTransactions();
    if (tab === "reconcile") renderInventoryReconciliation();
    if (tab === "misa") renderInventoryMisaTab();
}

/* =========================================================
   V48 - NHẬT KÝ LUÂN CHUYỂN TỪNG SKU
========================================================= */
const inventoryLedgerStateV48 = {
    itemCode: "",
    asOfDate: "",
    typeFilter: "stock",
    search: ""
};

function inventoryLedgerDateTimeV48(dateKey, isoValue = "") {
    const dateText = dateKey ? formatDateLabel(dateKey) : "-";
    if (!isoValue) return dateText;
    try {
        const d = new Date(isoValue);
        if (Number.isNaN(d.getTime())) return dateText;
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${dateText} ${hh}:${mm}`;
    } catch (_) {
        return dateText;
    }
}

function inventoryLedgerSourceLabelV48(source) {
    return { stocktake:"Kiểm kê", manual:"Kho", shopee:"Shopee", misa:"MISA" }[source] || source || "Khác";
}

function inventoryLedgerManualTypeV48(type) {
    const map = {
        INBOUND:{ operation:"Nhập kho", route:"Nhà cung cấp → Kho", sign:1 },
        RETURN_IN:{ operation:"Hoàn đã nhập kho", route:"ĐVVC / Khách → Kho", sign:1 },
        OUT_OTHER:{ operation:"Xuất kho khác", route:"Kho → Xuất khác", sign:-1 },
        ADJUSTMENT:{ operation:"Điều chỉnh kho", route:"Điều chỉnh sổ → Tồn hệ thống", sign:0 }
    };
    return map[type] || { operation:inventoryTxLabel(type), route:"Kho → Kho", sign:0 };
}

function getInventoryOrderPositionMapV48(itemCode, asOfDate) {
    const map = new Map();
    buildInventoryMovementRows(asOfDate)
        .filter(row => row.itemCode === itemCode)
        .forEach(row => {
            const orderId = String(row.orderId || "-").trim() || "-";
            const existing = map.get(orderId) || {
                orderId,
                reportDate:row.reportDate || asOfDate || "",
                orderDate:row.sourceOrderDate || "",
                status:row.status || "",
                bucket:row.bucket || "other",
                offsiteQty:0,
                totalQty:0,
                rawSkus:new Set()
            };
            const qty = Number(row.quantity || 0);
            existing.totalQty += qty;
            if (["in_transit","delivered","returning"].includes(row.bucket)) existing.offsiteQty += qty;
            if (row.rawSku) existing.rawSkus.add(String(row.rawSku));
            if ((row.reportDate || "") >= (existing.reportDate || "")) {
                existing.reportDate = row.reportDate || existing.reportDate;
                existing.orderDate = row.sourceOrderDate || existing.orderDate;
                existing.status = row.status || existing.status;
                existing.bucket = row.bucket || existing.bucket;
            }
            map.set(orderId, existing);
        });
    return map;
}

function buildInventoryShopeeDeltaEventsV48(itemCode, baselineDate, asOfDate) {
    const baselineMap = getInventoryOrderPositionMapV48(itemCode, baselineDate);
    const currentMap = getInventoryOrderPositionMapV48(itemCode, asOfDate);
    const events = [];
    new Set([...baselineMap.keys(), ...currentMap.keys()]).forEach(key => {
        const before = baselineMap.get(key);
        const after = currentMap.get(key);
        const beforeQty = Number(before?.offsiteQty || 0);
        const afterQty = Number(after?.offsiteQty || 0);
        const delta = afterQty - beforeQty;
        if (!delta) return;
        const positiveOut = delta > 0;
        const qty = Math.abs(delta);
        const display = after || before || {};
        events.push({
            id:`shopee-${key}-${asOfDate}`,
            date:display.reportDate || asOfDate || baselineDate || "",
            iso:"",
            source:"shopee",
            category:"stock",
            operation:positiveOut ? "Hàng Shopee rời kho" : "Giảm hàng ngoài kho",
            reference:display.orderId || key,
            route:positiveOut ? `Kho → ${inventoryBucketLabel(display.bucket || "in_transit")}` : "Luân chuyển Shopee → Kho lý thuyết",
            impact:-delta,
            referenceQty:qty,
            note:positiveOut ? `${display.status || inventoryBucketLabel(display.bucket)} · phát sinh sau mốc kiểm` : `Số hàng ngoài kho giảm so với mốc kiểm; cộng lại ${formatNumber(qty)} vào tồn lý thuyết.`,
            createdBy:"Shopee"
        });
    });
    return events;
}

function buildInventoryMisaEventsV48(item, baselineDate, asOfDate) {
    return getIssuedMisaLines()
        .filter(line => {
            if (!isMisaLineMatchedToInventoryItem(line, item)) return false;
            const date = line.invoiceDate || "";
            if (baselineDate && date && date < baselineDate) return false;
            if (asOfDate && date && date > asOfDate) return false;
            return true;
        })
        .map((line,index) => ({
            id:`misa-${line.invoiceNo || index}-${line.productCode || ""}`,
            date:line.invoiceDate || asOfDate || "",
            iso:"",
            source:"misa",
            category:"reference",
            operation:"Hóa đơn đã phát hành",
            reference:line.invoiceNo || "Không có Số HĐ",
            route:"Đã giao → Đã xuất hóa đơn",
            impact:0,
            referenceQty:Number(line.quantity || 0),
            note:`${line.productCode || ""}${line.productName ? ` · ${line.productName}` : ""}`.replace(/^ · /,""),
            createdBy:"MISA"
        }));
}

function buildInventoryLedgerV48(itemCode, asOfDate) {
    const item = inventoryState.items.find(row => row.itemCode === itemCode);
    if (!item) return null;
    const ledgerRow = buildInventoryLedgerAsOf(asOfDate).find(row => row.itemCode === itemCode);
    if (!ledgerRow) return null;
    const summaryItem = buildInventorySummary().find(row => row.itemCode === itemCode) || {};
    const events = [{
        id:`baseline-${itemCode}-${ledgerRow.baselineDate}`,
        date:ledgerRow.baselineDate || asOfDate,
        iso:"",
        source:"stocktake",
        category:"baseline",
        operation:"Mốc kiểm kê",
        reference:ledgerRow.baselineDate ? `Kiểm kê ${formatDateLabel(ledgerRow.baselineDate)}` : "Mốc tồn",
        route:"Số đếm thực tế → Mốc hệ thống",
        impact:null,
        referenceQty:Number(ledgerRow.baselineQty || 0),
        note:`Bắt đầu công thức tồn từ ${formatNumber(ledgerRow.baselineQty || 0)} sản phẩm.`,
        createdBy:"Kiểm kê"
    }];

    getTransactionsForItemPeriod(itemCode, ledgerRow.baselineDate, asOfDate).forEach(tx => {
        const def = inventoryLedgerManualTypeV48(tx.type);
        const rawQty = Number(tx.quantity || 0);
        const impact = tx.type === "ADJUSTMENT" ? rawQty : def.sign * Math.abs(rawQty);
        events.push({
            id:`tx-${tx.id}`,
            date:tx.transactionDate || "",
            iso:tx.createdAt || "",
            source:"manual",
            category:"stock",
            operation:def.operation,
            reference:tx.reference || "-",
            route:def.route,
            impact,
            referenceQty:Math.abs(rawQty),
            note:tx.note || "Biến động kho ghi nhận thủ công.",
            createdBy:tx.createdBy === state.user?.id ? "Bạn" : (tx.createdBy ? "Nhân viên" : "-")
        });
    });

    events.push(...buildInventoryShopeeDeltaEventsV48(itemCode, ledgerRow.baselineDate, asOfDate));
    events.push(...buildInventoryMisaEventsV48(item, ledgerRow.baselineDate, asOfDate));
    events.sort((a,b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.iso || "").localeCompare(String(a.iso || "")));

    const stockImpact = events.reduce((sum,event) => sum + (typeof event.impact === "number" ? event.impact : 0), 0);
    const calculated = Number(ledgerRow.baselineQty || 0) + stockImpact;
    const formulaDiff = Number(ledgerRow.theoretical || 0) - calculated;
    const currentSnapshotRows = buildInventoryMovementRows()
        .filter(row => row.itemCode === itemCode)
        .sort((a,b) => {
            const order = {reserved:0,in_transit:1,delivered:2,returning:3,cancelled:4,other:5};
            const c=(order[a.bucket] ?? 9)-(order[b.bucket] ?? 9);
            return c || String(a.orderId || "").localeCompare(String(b.orderId || ""));
        });
    return { item, ledgerRow, summaryItem, events, currentSnapshotRows, stockImpact, calculated, formulaDiff };
}

function inventoryLedgerMeaningV48(row) {
    if (row.bucket === "reserved") return {cls:"reserved",text:"Giảm khả dụng, chưa rời kho"};
    if (["in_transit","delivered"].includes(row.bucket)) return {cls:"outside",text:"Đang ở ngoài kho"};
    if (row.bucket === "returning") return {cls:"returning",text:"Ngoài kho, đang hoàn về"};
    return {cls:"other",text:"Không trừ thêm tồn"};
}

function renderInventoryLedgerV48() {
    const modal = $("inventoryLedgerModal");
    if (!modal || !inventoryLedgerStateV48.itemCode) return;
    const asOfDate = $("inventoryLedgerAsOfDate")?.value || inventoryLedgerStateV48.asOfDate || getLocalTodayKey();
    inventoryLedgerStateV48.asOfDate = asOfDate;
    const data = buildInventoryLedgerV48(inventoryLedgerStateV48.itemCode, asOfDate);
    if (!data) return;
    const {item,ledgerRow,summaryItem,events,currentSnapshotRows,calculated,formulaDiff} = data;

    if ($("inventoryLedgerTitle")) $("inventoryLedgerTitle").textContent = `${item.itemCode} · ${item.name}`;
    if ($("inventoryLedgerSubtitle")) $("inventoryLedgerSubtitle").textContent = `Mốc ${ledgerRow.baselineDate ? formatDateLabel(ledgerRow.baselineDate) : "-"} → ${formatDateLabel(asOfDate)} · SKU Shopee ${item.shopeeSku || "chưa cấu hình"}`;

    const formulaBox = $("inventoryLedgerFormulaStatus");
    if (formulaBox) {
        const ok = Math.abs(Number(formulaDiff || 0)) < .0001;
        formulaBox.className = `inventory-ledger-formula-status ${ok ? "" : "warning"}`;
        formulaBox.innerHTML = `<span><strong>${ok ? "✓ Công thức tồn đang khớp" : "⚠ Công thức cần kiểm tra"}</strong><br>Mốc ${formatNumber(ledgerRow.baselineQty)} ${data.stockImpact >= 0 ? "+" : "−"} ${formatNumber(Math.abs(data.stockImpact))} = <b>${formatNumber(calculated)}</b> · Tồn LT hệ thống = <b>${formatNumber(ledgerRow.theoretical)}</b></span><span>Chênh công thức: <strong>${formulaDiff > 0 ? "+" : ""}${formatNumber(formulaDiff)}</strong></span>`;
    }

    const kpis = [
        ["MỐC KIỂM",ledgerRow.baselineQty,ledgerRow.baselineDate ? formatDateLabel(ledgerRow.baselineDate) : "-",""],
        ["+ NHẬP",ledgerRow.inbound,"Nhập sau mốc","positive"],
        ["+ HOÀN NHẬP",ledgerRow.returnIn,"Đã nhận lại kho","positive"],
        ["− SHOPEE",ledgerRow.shopeeOutDelta,"Rời kho sau mốc","negative"],
        ["− XUẤT KHÁC",ledgerRow.outOther,"Xuất ngoài Shopee","negative"],
        ["± ĐIỀU CHỈNH",ledgerRow.adjustment,"Điều chỉnh thủ công",ledgerRow.adjustment < 0 ? "negative" : "positive"],
        ["TỒN LÝ THUYẾT",ledgerRow.theoretical,`Tới ${formatDateLabel(asOfDate)}`,"available"],
        ["KHẢ DỤNG",Math.max(0,Number(ledgerRow.theoretical || 0)-Number(summaryItem.reserved || 0)),`Giữ đơn ${formatNumber(summaryItem.reserved || 0)}`,"available"]
    ];
    if ($("inventoryLedgerKpis")) $("inventoryLedgerKpis").innerHTML = kpis.map(([label,value,note,cls]) => {
        const n=Number(value || 0);
        const prefix=String(label).startsWith("+") && n>0 ? "+" : String(label).startsWith("−") && n>0 ? "−" : (String(label).startsWith("±") && n>0 ? "+" : (String(label).startsWith("±") && n<0 ? "−" : ""));
        return `<div class="inventory-ledger-kpi ${cls || ""}"><span>${escapeHTML(label)}</span><strong>${prefix}${formatNumber(Math.abs(n))}</strong><small>${escapeHTML(note || "")}</small></div>`;
    }).join("");

    const filter = $("inventoryLedgerTypeFilter")?.value || inventoryLedgerStateV48.typeFilter || "all";
    const rawSearch = $("inventoryLedgerSearch")?.value || inventoryLedgerStateV48.search || "";
    const search = normalizeText(rawSearch);
    inventoryLedgerStateV48.typeFilter = filter;
    inventoryLedgerStateV48.search = rawSearch;
    const filteredEvents = events.filter(event => {
        if (filter === "stock" && event.category !== "stock" && event.source !== "stocktake") return false;
        if (filter === "manual" && event.source !== "manual") return false;
        if (filter === "shopee" && event.source !== "shopee") return false;
        if (filter === "misa" && event.source !== "misa") return false;
        return !search || normalizeText([event.operation,event.reference,event.route,event.note,event.createdBy].join(" ")).includes(search);
    });

    const timelineBody = $("inventoryLedgerTimelineBody");
    if (timelineBody) timelineBody.innerHTML = filteredEvents.length ? filteredEvents.map(event => {
        const hasImpact = typeof event.impact === "number";
        const impact = Number(event.impact || 0);
        const impactClass = !hasImpact || impact===0 ? "zero" : impact>0 ? "plus" : "minus";
        const impactText = !hasImpact ? "Mốc" : impact===0 ? "0" : `${impact>0?"+":"−"}${formatNumber(Math.abs(impact))}`;
        return `<tr><td>${escapeHTML(inventoryLedgerDateTimeV48(event.date,event.iso))}</td><td><span class="inventory-ledger-source ${escapeHTML(event.source)}">${escapeHTML(inventoryLedgerSourceLabelV48(event.source))}</span></td><td><span class="inventory-ledger-operation">${escapeHTML(event.operation)}</span></td><td><span class="inventory-ledger-ref">${escapeHTML(event.reference || "-")}</span></td><td>${escapeHTML(event.route || "-")}</td><td class="center"><span class="inventory-ledger-impact ${impactClass}">${impactText}</span></td><td class="center">${formatNumber(event.referenceQty || 0)}</td><td>${escapeHTML(event.note || "-")}</td><td>${escapeHTML(event.createdBy || "-")}</td></tr>`;
    }).join("") : '<tr><td colspan="9" class="empty-table">Không có dòng nhật ký phù hợp bộ lọc.</td></tr>';

    const orderBody = $("inventoryLedgerOrdersBody");
    const orderInvoiceMapV56=buildOrderInvoiceMapV56();
    if (orderBody) orderBody.innerHTML = currentSnapshotRows.length ? currentSnapshotRows.map((row,index) => {
        const meaning=inventoryLedgerMeaningV48(row);
        const inv=orderInvoiceMapV56.get(normalizeOrderReferenceV41(row.orderId||""))||null;
        const meta=invoiceStatusMetaV56(inv);
        return `<tr><td>${index+1}</td><td><span class="inventory-ledger-ref">${escapeHTML(row.orderId || "-")}</span></td><td>${row.sourceOrderDate ? formatDateLabel(row.sourceOrderDate) : "-"}</td><td>${escapeHTML(row.rawSku || row.baseSku || "-")}</td><td class="center"><strong>${formatNumber(row.quantity || 0)}</strong></td><td>${escapeHTML(row.status || "-")}</td><td>${escapeHTML(inventoryBucketLabel(row.bucket))}</td><td>${invoiceStatusBadgeV56(inv)}</td><td><strong>${escapeHTML(inv?.pub?.invoiceNo||"—")}</strong></td><td>${escapeHTML(inv?.pub?.taxAuthorityStatus||"—")}</td><td><span class="inventory-ledger-order-meaning ${meaning.cls}">${escapeHTML(meaning.text)}</span><small class="inventory-ledger-v56-note">${escapeHTML(meta.note||"")}</small></td></tr>`;
    }).join("") : '<tr><td colspan="11" class="empty-table">SKU này không phát sinh trong snapshot luân chuyển hiện tại.</td></tr>';

    if ($("inventoryLedgerOrderCount")) {
        const uniqueOrders=new Set(currentSnapshotRows.map(row=>row.orderId).filter(Boolean));
        $("inventoryLedgerOrderCount").textContent=`${formatNumber(uniqueOrders.size)} đơn · ${formatNumber(currentSnapshotRows.reduce((s,r)=>s+Number(r.quantity||0),0))} SP`;
    }
}

function openInventoryLedgerV48(itemCode) {
    const item=inventoryState.items.find(row=>row.itemCode===itemCode);
    if (!item) return;
    inventoryLedgerStateV48.itemCode=itemCode;
    inventoryLedgerStateV48.asOfDate=getLocalTodayKey();
    inventoryLedgerStateV48.typeFilter="stock";
    inventoryLedgerStateV48.search="";
    const modal=$("inventoryLedgerModal");
    if (!modal) return;
    if ($("inventoryLedgerAsOfDate")) $("inventoryLedgerAsOfDate").value=inventoryLedgerStateV48.asOfDate;
    if ($("inventoryLedgerTypeFilter")) $("inventoryLedgerTypeFilter").value="stock";
    if ($("inventoryLedgerSearch")) $("inventoryLedgerSearch").value="";
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden","false");
    document.body.classList.add("inventory-ledger-open");
    renderInventoryLedgerV48();
}

function closeInventoryLedgerV48() {
    const modal=$("inventoryLedgerModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden","true");
    document.body.classList.remove("inventory-ledger-open");
}


function renderInventoryModule() {
    if (!inventoryState.loaded) loadInventoryLocal();

    const summary = buildInventorySummary();
    const search = normalizeText($("inventorySearchInput")?.value || "");
    const filtered = summary.filter(item =>
        !search ||
        normalizeText(item.itemCode).includes(search) ||
        normalizeText(item.name).includes(search) ||
        normalizeText(item.shopeeSku).includes(search) ||
        (item.transitSkus || []).some(sku => normalizeText(sku).includes(search))
    );

    const totals = summary.reduce((acc, item) => {
        acc.opening += Number(item.openingQty || 0);
        acc.physical += Number(item.physicalQty || 0);
        acc.baseline += Number(item.baselineQty || 0);
        acc.inbound += Number(item.ledgerInbound || 0);
        acc.returnIn += Number(item.ledgerReturnIn || 0);
        acc.shopeeOut += Number(item.ledgerShopeeOut || 0);
        acc.outOther += Number(item.ledgerOutOther || 0);
        acc.adjustment += Number(item.ledgerAdjustment || 0);
        acc.theoretical += Number(item.currentTheoretical || 0);
        acc.reserved += Number(item.reserved || 0);
        acc.available += Number(item.available || 0);
        acc.transit += Number(item.in_transit || 0);
        acc.delivered += Number(item.delivered || 0);
        acc.returning += Number(item.returning || 0);
        acc.invoiced += Number(item.invoiceQty || 0);
        acc.value += Number(item.stockValue || 0);

        if (item.waitingInvoiceComparable) {
            acc.waitingInvoice += Number(item.waitingInvoice || 0);
        } else {
            acc.waitingInvoiceHasMismatch = true;
        }

        return acc;
    }, {
        opening:0,
        physical:0,
        baseline:0,
        inbound:0,
        returnIn:0,
        shopeeOut:0,
        outOther:0,
        adjustment:0,
        theoretical:0,
        reserved:0,
        available:0,
        transit:0,
        delivered:0,
        returning:0,
        invoiced:0,
        value:0,
        waitingInvoice:0,
        waitingInvoiceHasMismatch:false
    });

    if ($("inventoryPhysicalTotal")) $("inventoryPhysicalTotal").textContent = formatNumber(totals.physical);
    if ($("inventoryTheoreticalTotal")) $("inventoryTheoreticalTotal").textContent = formatNumber(totals.theoretical);
    if ($("inventoryReservedTotal")) $("inventoryReservedTotal").textContent = formatNumber(totals.reserved);
    if ($("inventoryAvailableTotal")) $("inventoryAvailableTotal").textContent = formatNumber(totals.available);
    if ($("inventoryTransitTotal")) $("inventoryTransitTotal").textContent = formatNumber(totals.transit);
    if ($("inventoryDeliveredTotal")) $("inventoryDeliveredTotal").textContent = formatNumber(totals.delivered);
    if ($("inventoryInvoicedTotal")) $("inventoryInvoicedTotal").textContent = formatNumber(totals.invoiced);
    if ($("inventoryStockValue")) $("inventoryStockValue").textContent = inventoryMoney(totals.value);
    if ($("navInventoryCount")) $("navInventoryCount").textContent = formatNumber(summary.length);

    renderInventoryReconcileOverviewV36(summary);

    const latestStocktake = summary.map(x => x.stocktakeDate).filter(Boolean).sort().reverse()[0] || "";
    if ($("inventorySummarySubtitle")) {
        $("inventorySummarySubtitle").textContent =
            `${formatNumber(summary.length)} mặt hàng · Kiểm kê gần nhất ${latestStocktake ? formatDateLabel(latestStocktake) : "chưa có"} · ` +
            `Snapshot luân chuyển: ${inventoryState.transitSnapshot?.fileName ? escapeHTML(inventoryState.transitSnapshot.fileName) : "chưa upload"} · ` +
            `Đang giao ${formatNumber(totals.transit)} · Đã giao ${formatNumber(totals.delivered)}`;
    }

    const badge = $("inventoryCloudBadge");
    if (badge) {
        badge.className = `inventory-cloud-badge ${inventoryState.cloudReady ? "cloud" : "local"}`;
        badge.textContent = inventoryState.cloudReady
            ? "☁️ Tồn kho đã lưu Cloud"
            : "💻 Tồn kho đang lưu trên máy";
    }

    const unmapped = getInventoryUnmappedSkus();
    const scopeMismatch = summary.filter(item => item.invoiceScopeMismatch);
    const warning = $("inventoryWarningBox");

    if (warning) {
        const messages = [];

        if (!inventoryState.transitSnapshot?.rows?.length) {
            messages.push(
                `<strong>Chưa có snapshot đơn luân chuyển Shopee.</strong> ` +
                `Các cột Giữ đơn / Đang giao / Đã giao / Hoàn đang về đang để 0 để tránh lấy nhầm dữ liệu từ Thống kê SKU.`
            );
        }

        const reconcileOverview = buildInventoryReconcileOverviewV36(summary);
        if (!reconcileOverview.latestDate) {
            messages.push(
                `<strong>Chưa có lần kiểm kê đối chiếu nào được chốt.</strong> ` +
                `V48 chưa thể kết luận kho “Khớp / Thiếu / Thừa”. Hãy vào tab <b>Kiểm kê & đối chiếu</b> để nhập số đếm thực tế.`
            );
        } else if (reconcileOverview.counted < reconcileOverview.totalItems) {
            messages.push(
                `<strong>Lần đối chiếu ${formatDateLabel(reconcileOverview.latestDate)} chưa đủ mặt hàng.</strong> ` +
                `Đã kiểm ${reconcileOverview.counted}/${reconcileOverview.totalItems} mặt hàng.`
            );
        }

        if (unmapped.length) {
            messages.push(
                `Có <strong>${unmapped.length} mặt hàng trong FILE LUÂN CHUYỂN chưa tự ghép được vào kho</strong>: ` +
                `${unmapped.slice(0, 8).map(item =>
                    `${escapeHTML(item.sku)}${item.name ? ` – ${escapeHTML(item.name)}` : ""} (${formatNumber(item.quantity)})`
                ).join("; ")}. ` +
                `V35 đã thử bằng SKU và tên sản phẩm trong chính file. Chỉ khi tên/mã quá khác mới cần điền “SKU ưu tiên” thủ công.`
            );
        }

        if (scopeMismatch.length) {
            messages.push(
                `<strong>${scopeMismatch.length} mặt hàng đang “khác kỳ” giữa MISA và snapshot luân chuyển.</strong> ` +
                `V35 sẽ hiển thị <strong>Chờ HĐ = —</strong> ở các dòng này thay vì 0. ` +
                `Đã xuất HĐ chỉ dùng để đối chiếu kế toán, không dùng để trừ Tồn thực tế lần nữa.`
            );
        }

        if (messages.length) {
            warning.classList.remove("hidden");
            warning.innerHTML = `⚠ ${messages.join("<br>⚠ ")}`;
        } else {
            warning.classList.add("hidden");
            warning.innerHTML = "";
        }
    }

    const body = $("inventorySummaryBody");
    const foot = $("inventorySummaryFoot");
    const inventoryInvoiceSummaryV56 = buildInventoryInvoiceSummaryV56();
    if (body && foot) {
        if (!filtered.length) {
            body.innerHTML = '<tr><td colspan="26" class="empty-table">Không có mặt hàng phù hợp.</td></tr>';
            foot.innerHTML = "";
        } else {
            body.innerHTML = filtered.map((item, index) => {
                const safety = Number(item.safetyStock || 0);
                const alertClass = item.available <= 0 ? "out" : item.available <= safety ? "low" : "ok";
                const alertText = item.available <= 0 ? "Hết khả dụng" : item.available <= safety ? "Sắp hết" : "Ổn";
                const variance = item.lastReconcile ? Number(item.lastReconcile.variance || 0) : null;
                const varianceValue = item.lastReconcile
                    ? Number(item.lastReconcile.varianceValue ?? (variance * Number(item.unitPrice || 0)))
                    : null;
                const invoiceOrderSummaryV56 = inventoryInvoiceSummaryV56.get(item.itemCode) || null;

                const signed = value => {
                    const n = Number(value || 0);
                    return `${n > 0 ? "+" : ""}${formatNumber(n)}`;
                };

                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td><button type="button" class="inventory-ledger-sku-link" data-inventory-ledger="${escapeHTML(item.itemCode)}" title="Xem nhật ký ${escapeHTML(item.itemCode)}">${escapeHTML(item.itemCode)}</button></td>
                        <td>
                            <button type="button" class="inventory-ledger-name-link" data-inventory-ledger="${escapeHTML(item.itemCode)}" title="Xem nhật ký mặt hàng">${escapeHTML(item.name)}</button>
                            ${
                                item.transitSkus?.length
                                    ? `<div>
                                        <span class="inventory-transit-item-source">
                                            File luân chuyển: ${escapeHTML(item.transitSkus.join(", "))}
                                        </span>
                                        ${item.transitMatchMethods?.length
                                            ? `<span class="inventory-transit-map-method">
                                                · tự ghép ${escapeHTML(item.transitMatchMethods.join(", "))}
                                               </span>`
                                            : ""}
                                       </div>`
                                    : inventoryState.transitSnapshot?.rows?.length
                                        ? '<span class="inventory-transit-item-empty">Không phát sinh trong snapshot hiện tại</span>'
                                        : '<span class="inventory-transit-item-empty">Chưa upload file luân chuyển</span>'
                            }
                        </td>

                        <td class="inventory-num">${formatNumber(item.openingQty || 0)}</td>

                        <td class="inventory-num inventory-col-physical">
                            ${formatNumber(item.baselineQty || 0)}
                            <span class="inventory-theory-date-v36">
                                ${item.baselineDate ? formatDateLabel(item.baselineDate) : "chưa có mốc"}
                            </span>
                        </td>

                        <td class="inventory-num inventory-v47-positive">
                            ${item.ledgerInbound ? `+${formatNumber(item.ledgerInbound)}` : "0"}
                        </td>
                        <td class="inventory-num inventory-v47-positive">
                            ${item.ledgerReturnIn ? `+${formatNumber(item.ledgerReturnIn)}` : "0"}
                        </td>
                        <td class="inventory-num inventory-v47-negative">
                            ${item.ledgerShopeeOut > 0
                                ? `−${formatNumber(item.ledgerShopeeOut)}`
                                : item.ledgerShopeeOut < 0
                                    ? `+${formatNumber(Math.abs(item.ledgerShopeeOut))}`
                                    : "0"}
                        </td>
                        <td class="inventory-num inventory-v47-negative">
                            ${item.ledgerOutOther ? `−${formatNumber(item.ledgerOutOther)}` : "0"}
                        </td>
                        <td class="inventory-num inventory-v47-adjustment">
                            ${signed(item.ledgerAdjustment)}
                        </td>

                        <td class="inventory-num inventory-col-theory-v36 inventory-v47-theory-strong">
                            ${formatNumber(item.currentTheoretical || 0)}
                            <span class="inventory-theory-date-v36">tới ${formatDateLabel(item.currentTheoryDate)}</span>
                        </td>
                        <td class="inventory-num inventory-col-reserved">${formatNumber(item.reserved || 0)}</td>
                        <td class="inventory-num inventory-col-available">${formatNumber(item.available || 0)}</td>

                        <td class="inventory-num inventory-col-variance-v36">
                            ${item.lastReconcile
                                ? `<span class="inventory-stock-variance ${variance===0?"zero":variance<0?"shortage":"surplus"}">${variance>0?"+":""}${formatNumber(variance)}</span>`
                                : '<span class="inventory-stock-variance pending">—</span>'}
                        </td>

                        <td class="right inventory-v47-variance-value-cell ${variance===null?"pending":variance<0?"shortage":variance>0?"surplus":"match"}">
                            ${item.lastReconcile ? inventoryMoney(varianceValue) : "—"}
                        </td>

                        <td class="center inventory-col-result-v36">
                            <span class="inventory-stock-result-v36 ${escapeHTML(item.reconcileStatus.key)}">${escapeHTML(item.reconcileStatus.label)}</span>
                            ${item.lastReconcile?.date ? `<span class="inventory-stock-result-date-v36">${formatDateLabel(item.lastReconcile.date)}</span>` : ""}
                        </td>

                        <td class="inventory-num inventory-col-transit">${formatNumber(item.in_transit || 0)}</td>
                        <td class="inventory-num inventory-col-delivered">${formatNumber(item.delivered || 0)}</td>
                        <td class="inventory-num inventory-col-returning">${formatNumber(item.returning || 0)}</td>

                        <td class="center inventory-v56-order-status-cell">
                            ${inventoryInvoiceStatusHtmlV56(invoiceOrderSummaryV56)}
                        </td>

                        <td class="center inventory-v56-invoice-no-cell">
                            ${invoiceOrderSummaryV56?.latestInvoiceNo
                                ? `<strong>${escapeHTML(invoiceOrderSummaryV56.latestInvoiceNo)}</strong>${invoiceOrderSummaryV56.latestInvoiceDate?`<small>${formatDateLabel(invoiceOrderSummaryV56.latestInvoiceDate)}</small>`:""}`
                                : "—"}
                        </td>

                        <td class="inventory-num inventory-col-invoice">
                            ${formatNumber(item.invoiceQty || 0)}
                            ${item.invoiceScopeMismatch
                                ? '<span class="inventory-scope-mismatch" title="MISA và snapshot luân chuyển đang khác phạm vi dữ liệu">khác kỳ</span>'
                                : (item.invoiceQty > 0
                                    ? '<span class="inventory-invoice-ok" title="Không phát hiện lỗi phạm vi theo kiểm tra hiện tại">MISA</span>'
                                    : "")}
                        </td>

                        <td class="inventory-num inventory-col-waiting">
                            ${item.waitingInvoiceComparable
                                ? formatNumber(item.waitingInvoice || 0)
                                : `<span class="inventory-waiting-dash"
                                         title="Không tính Chờ HĐ vì MISA và snapshot đang khác kỳ">—</span>
                                   <span class="inventory-waiting-note">khác kỳ</span>`}
                        </td>

                        <td class="right">${inventoryMoney(item.unitPrice || 0)}</td>
                        <td class="right"><strong>${inventoryMoney(item.stockValue || 0)}</strong></td>
                        <td class="center"><span class="inventory-alert-pill ${alertClass}">${alertText}</span></td>
                    </tr>
                `;
            }).join("");

            foot.innerHTML = `
                <tr>
                    <td></td>
                    <td>TỔNG</td>
                    <td>${formatNumber(summary.length)} mặt hàng</td>

                    <td class="center">${formatNumber(totals.opening)}</td>
                    <td class="center">${formatNumber(totals.baseline)}</td>
                    <td class="center">${formatNumber(totals.inbound)}</td>
                    <td class="center">${formatNumber(totals.returnIn)}</td>
                    <td class="center">${formatNumber(totals.shopeeOut)}</td>
                    <td class="center">${formatNumber(totals.outOther)}</td>
                    <td class="center">${totals.adjustment > 0 ? "+" : ""}${formatNumber(totals.adjustment)}</td>
                    <td class="center">${formatNumber(totals.theoretical)}</td>
                    <td class="center">${formatNumber(totals.reserved)}</td>
                    <td class="center">${formatNumber(totals.available)}</td>

                    <td class="center">—</td>
                    <td class="center">—</td>
                    <td class="center">Xem từng SKU</td>

                    <td class="center">${formatNumber(totals.transit)}</td>
                    <td class="center">${formatNumber(totals.delivered)}</td>
                    <td class="center">${formatNumber(totals.returning)}</td>

                    <td class="center">Theo đơn</td>
                    <td class="center">—</td>
                    <td class="center">${formatNumber(totals.invoiced)}</td>
                    <td class="center">
                        ${totals.waitingInvoiceHasMismatch
                            ? '<span class="inventory-waiting-dash" title="Có mặt hàng khác kỳ nên không cộng tổng Chờ HĐ">—</span>'
                            : formatNumber(totals.waitingInvoice)}
                    </td>

                    <td></td>
                    <td class="right">${inventoryMoney(totals.value)}</td>
                    <td></td>
                </tr>
            `;
        }
    }

    if ($("inventoryInvoiceSourceLabel")) {
        if (!invoiceState?.rows?.length) {
            $("inventoryInvoiceSourceLabel").textContent = "Chưa có file hóa đơn MISA";
        } else if (Array.isArray(invoiceState.lineRows) && invoiceState.lineRows.length) {
            $("inventoryInvoiceSourceLabel").textContent =
                `Theo Số HĐ · ${invoiceState.fileName || "file MISA"}`;
        } else {
            $("inventoryInvoiceSourceLabel").textContent =
                `Dữ liệu cũ · cần upload lại MISA`;
        }
    }

    renderInventoryFlowBars(summary);
    renderInventoryMisaInfo(summary);
    renderInventoryOrderAgingV49();
    renderInventoryForecastV52();
    renderInventoryMovementTable();

    if (!inventoryState.currentDate) {
        inventoryState.currentDate = getLocalTodayKey();
    }
    if (!inventoryState.reconcileDate) {
        inventoryState.reconcileDate = getLocalTodayKey();
    }

    if ($("inventoryCurrentDate") && !$("inventoryCurrentDate").value) {
        $("inventoryCurrentDate").value = inventoryState.currentDate;
    }
    if ($("inventoryReconcileDate") && !$("inventoryReconcileDate").value) {
        $("inventoryReconcileDate").value = inventoryState.reconcileDate;
    }
    if ($("inventoryTxDate") && !$("inventoryTxDate").value) {
        $("inventoryTxDate").value = getLocalTodayKey();
    }

    renderInventoryTransactionItemOptions();
    renderInventoryMisaUploadInfo();
    renderInventoryTransitSourceCard();
    setInventoryTab(inventoryState.activeTab || "overview");
}


/* =========================================================
   V49 - TUỔI ĐƠN LUÂN CHUYỂN & CẢNH BÁO GIAO CHẬM
========================================================= */
const inventoryAgingStateV49 = {
    statusFilter: "all",
    bucketFilter: "all",
    search: ""
};

function inventoryAgingReferenceDateV49() {
    const snapshotDate = normalizeOrderDate(
        inventoryState.transitSnapshot?.snapshotDate || ""
    );

    if (snapshotDate) return snapshotDate;

    const movementDates = (inventoryState.movementRows || [])
        .map(row => normalizeOrderDate(row.reportDate || ""))
        .filter(Boolean)
        .sort();

    return movementDates.at(-1) || getLocalTodayKey();
}

function inventoryAgingBucketV49(ageDays) {
    if (ageDays === null || ageDays === undefined || Number.isNaN(ageDays) || ageDays < 0) {
        return "unknown";
    }
    if (ageDays <= 2) return "0_2";
    if (ageDays <= 4) return "3_4";
    return "5_plus";
}

function inventoryAgingBucketLabelV49(bucket) {
    return {
        "0_2": "0–2 ngày",
        "3_4": "3–4 ngày",
        "5_plus": "≥ 5 ngày",
        unknown: "Không rõ ngày"
    }[bucket] || "Không rõ ngày";
}

function inventoryAgingStatusPriorityV49(bucket) {
    return {
        returning: 5,
        in_transit: 4,
        reserved: 3,
        delivered: 2,
        other: 1,
        cancelled: 0
    }[bucket] ?? 0;
}

function buildInventoryOrderAgingRowsV49() {
    const referenceDate = inventoryAgingReferenceDateV49();
    const movementRows = inventoryState.movementRows?.length
        ? [...inventoryState.movementRows]
        : buildInventoryMovementRows();

    const orderMap = new Map();

    movementRows.forEach(row => {
        if (["cancelled", "other"].includes(row.bucket)) return;

        const orderId = String(row.orderId || "").trim();
        if (!orderId || orderId === "-") return;

        const orderDate = normalizeOrderDate(row.sourceOrderDate || row.reportDate || "");
        const ageDays = orderDate && referenceDate
            ? v38DateDiffDays(orderDate, referenceDate)
            : null;
        const ageBucket = inventoryAgingBucketV49(ageDays);

        if (!orderMap.has(orderId)) {
            orderMap.set(orderId, {
                orderId,
                orderDate,
                ageDays,
                ageBucket,
                reportDate: normalizeOrderDate(row.reportDate || "") || referenceDate,
                bucket: row.bucket,
                rawStatuses: new Set(),
                skuQty: new Map(),
                itemNames: new Set(),
                quantity: 0
            });
        }

        const order = orderMap.get(orderId);

        if (orderDate && (!order.orderDate || orderDate < order.orderDate)) {
            order.orderDate = orderDate;
            order.ageDays = referenceDate ? v38DateDiffDays(orderDate, referenceDate) : null;
            order.ageBucket = inventoryAgingBucketV49(order.ageDays);
        }

        if (inventoryAgingStatusPriorityV49(row.bucket) > inventoryAgingStatusPriorityV49(order.bucket)) {
            order.bucket = row.bucket;
        }

        if (row.status) order.rawStatuses.add(String(row.status).trim());
        if (row.itemName) order.itemNames.add(String(row.itemName).trim());

        const sku = String(row.baseSku || row.rawSku || "").trim() || "(không SKU)";
        order.skuQty.set(
            sku,
            Number(order.skuQty.get(sku) || 0) + Number(row.quantity || 0)
        );
        order.quantity += Number(row.quantity || 0);
    });

    return [...orderMap.values()].map(order => {
        const isLateTransit =
            order.ageBucket === "5_plus" &&
            ["reserved", "in_transit", "returning"].includes(order.bucket);

        let warningKey = "ok";
        let warningLabel = "Bình thường";
        let warningDetail = "Trong ngưỡng theo dõi.";

        if (order.ageBucket === "unknown") {
            warningKey = "unknown";
            warningLabel = "Thiếu ngày đơn";
            warningDetail = "Không tính được tuổi đơn.";
        } else if (isLateTransit) {
            warningKey = "critical";
            warningLabel = "Cần xử lý";
            warningDetail = `${formatNumber(order.ageDays)} ngày nhưng hàng vẫn đang xử lý ngoài kho.`;
        } else if (order.ageBucket === "5_plus") {
            warningKey = "late";
            warningLabel = order.bucket === "delivered" ? "Đã giao lâu" : "Đơn cũ";
            warningDetail = order.bucket === "delivered"
                ? "Đã giao; nên kiểm tra bước hóa đơn/đối soát."
                : "Nên kiểm tra trạng thái thực tế.";
        } else if (order.ageBucket === "3_4") {
            warningKey = "watch";
            warningLabel = "Theo dõi";
            warningDetail = "Đơn đã 3–4 ngày.";
        }

        return {
            ...order,
            isLateTransit,
            warningKey,
            warningLabel,
            warningDetail,
            skus: [...order.skuQty.entries()].map(([sku, quantity]) => ({ sku, quantity })),
            statuses: [...order.rawStatuses]
        };
    }).sort((a, b) => {
        const ageA = a.ageDays === null ? -1 : a.ageDays;
        const ageB = b.ageDays === null ? -1 : b.ageDays;
        if (ageA !== ageB) return ageB - ageA;
        return String(a.orderId).localeCompare(String(b.orderId));
    });
}

function inventoryAgingSkuHtmlV49(order) {
    if (!order.skus?.length) return "—";

    const visible = order.skus.slice(0, 5);
    const extra = order.skus.length - visible.length;

    return `
        <div class="inventory-aging-skus">
            ${visible.map(item => `
                <span class="inventory-aging-sku-chip">
                    ${escapeHTML(item.sku)} × ${formatNumber(item.quantity)}
                </span>
            `).join("")}
            ${extra > 0 ? `<span class="inventory-aging-sku-more">+${extra} SKU</span>` : ""}
        </div>
    `;
}

function renderInventoryOrderAgingV49() {
    const body = $("inventoryAgingBody");
    if (!body) return;

    const allRows = buildInventoryOrderAgingRowsV49();
    const referenceDate = inventoryAgingReferenceDateV49();

    const counts = {
        fresh: allRows.filter(row => row.ageBucket === "0_2").length,
        watch: allRows.filter(row => row.ageBucket === "3_4").length,
        late: allRows.filter(row => row.ageBucket === "5_plus").length,
        unknown: allRows.filter(row => row.ageBucket === "unknown").length,
        lateTransit: allRows.filter(row => row.isLateTransit).length,
        totalQty: allRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
    };

    const knownAges = allRows
        .map(row => row.ageDays)
        .filter(value => Number.isFinite(value) && value >= 0);
    const oldestAge = knownAges.length ? Math.max(...knownAges) : null;
    const oldestRow = oldestAge === null
        ? null
        : allRows.find(row => row.ageDays === oldestAge);

    if ($("inventoryAgingTotalOrders")) $("inventoryAgingTotalOrders").textContent = formatNumber(allRows.length);
    if ($("inventoryAgingTotalQty")) $("inventoryAgingTotalQty").textContent = `${formatNumber(counts.totalQty)} SP trong snapshot`;
    if ($("inventoryAgingFreshOrders")) $("inventoryAgingFreshOrders").textContent = formatNumber(counts.fresh);
    if ($("inventoryAgingWatchOrders")) $("inventoryAgingWatchOrders").textContent = formatNumber(counts.watch);
    if ($("inventoryAgingLateOrders")) $("inventoryAgingLateOrders").textContent = formatNumber(counts.late);
    if ($("inventoryAgingLateTransit")) $("inventoryAgingLateTransit").textContent = formatNumber(counts.lateTransit);
    if ($("inventoryAgingOldest")) $("inventoryAgingOldest").textContent = oldestAge === null ? "—" : `${formatNumber(oldestAge)} ngày`;
    if ($("inventoryAgingOldestOrder")) $("inventoryAgingOldestOrder").textContent = oldestRow ? `Mã đơn ${oldestRow.orderId}` : "Chưa có dữ liệu";
    if ($("inventoryAgingReferenceDate")) $("inventoryAgingReferenceDate").textContent = `Ngày snapshot: ${referenceDate ? formatDateLabel(referenceDate) : "—"}`;
    if ($("inventoryAgingSubtitle")) {
        $("inventoryAgingSubtitle").textContent = referenceDate
            ? `Tính tuổi đơn tới snapshot ${formatDateLabel(referenceDate)}. Đơn ≥5 ngày còn Giữ đơn / Đang giao / Hoàn về được cảnh báo đỏ.`
            : "Chưa xác định được ngày snapshot để tính tuổi đơn.";
    }

    const total = Math.max(1, allRows.length);
    const pct = value => `${Math.max(0, (Number(value || 0) / total) * 100)}%`;
    if ($("inventoryAgingBarFresh")) $("inventoryAgingBarFresh").style.width = pct(counts.fresh);
    if ($("inventoryAgingBarWatch")) $("inventoryAgingBarWatch").style.width = pct(counts.watch);
    if ($("inventoryAgingBarLate")) $("inventoryAgingBarLate").style.width = pct(counts.late);
    if ($("inventoryAgingBarUnknown")) $("inventoryAgingBarUnknown").style.width = pct(counts.unknown);

    const statusFilter = $("inventoryAgingStatusFilter")?.value || inventoryAgingStateV49.statusFilter || "all";
    const bucketFilter = $("inventoryAgingBucketFilter")?.value || inventoryAgingStateV49.bucketFilter || "all";
    const rawSearch = $("inventoryAgingSearch")?.value || inventoryAgingStateV49.search || "";
    const search = normalizeText(rawSearch);

    inventoryAgingStateV49.statusFilter = statusFilter;
    inventoryAgingStateV49.bucketFilter = bucketFilter;
    inventoryAgingStateV49.search = rawSearch;

    const rows = allRows.filter(row => {
        const statusOk =
            statusFilter === "all" ||
            (statusFilter === "open"
                ? ["reserved", "in_transit", "returning"].includes(row.bucket)
                : row.bucket === statusFilter);

        const bucketOk = bucketFilter === "all" || row.ageBucket === bucketFilter;

        const searchOk = !search || normalizeText([
            row.orderId,
            row.orderDate,
            row.statuses.join(" "),
            row.skus.map(item => item.sku).join(" "),
            [...row.itemNames].join(" ")
        ].join(" ")).includes(search);

        return statusOk && bucketOk && searchOk;
    });

    if (!allRows.length) {
        body.innerHTML = '<tr><td colspan="9" class="empty-table">Chưa có đơn phù hợp trong snapshot luân chuyển.</td></tr>';
        return;
    }

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="9" class="empty-table">Không có đơn phù hợp bộ lọc hiện tại.</td></tr>';
        return;
    }

    body.innerHTML = rows.slice(0, 800).map((row, index) => {
        const rowClass = row.warningKey === "critical"
            ? "critical"
            : row.warningKey === "watch"
                ? "watch"
                : row.warningKey === "late"
                    ? "late"
                    : "";

        return `
            <tr class="inventory-aging-row ${rowClass}">
                <td>${index + 1}</td>
                <td><strong class="inventory-aging-order">${escapeHTML(row.orderId)}</strong></td>
                <td>${row.orderDate ? formatDateLabel(row.orderDate) : "—"}</td>
                <td class="center">
                    <span class="inventory-aging-days ${escapeHTML(row.ageBucket)}">
                        ${row.ageDays === null || row.ageDays < 0 ? "—" : `${formatNumber(row.ageDays)} ngày`}
                    </span>
                </td>
                <td>
                    <span class="inventory-bucket-pill ${escapeHTML(row.bucket)}">
                        ${escapeHTML(inventoryBucketLabel(row.bucket))}
                    </span>
                    ${row.statuses.length ? `<small class="inventory-aging-raw-status" title="${escapeHTML(row.statuses.join(" | "))}">${escapeHTML(row.statuses[0])}</small>` : ""}
                </td>
                <td>${inventoryAgingSkuHtmlV49(row)}</td>
                <td class="center"><strong>${formatNumber(row.quantity)}</strong></td>
                <td>
                    <span class="inventory-aging-bucket ${escapeHTML(row.ageBucket)}">
                        ${escapeHTML(inventoryAgingBucketLabelV49(row.ageBucket))}
                    </span>
                </td>
                <td>
                    <span class="inventory-aging-warning ${escapeHTML(row.warningKey)}">
                        ${escapeHTML(row.warningLabel)}
                    </span>
                    <small class="inventory-aging-warning-detail">${escapeHTML(row.warningDetail)}</small>
                </td>
            </tr>
        `;
    }).join("");
}




/* =========================================================
   V54 - MISA 3 FILE / ĐỐI CHIẾU MÃ ĐƠN SÀN
========================================================= */
const misaOrderStateV54 = {
    imports: [],
    publishedImportId: "",
    unpublishedImportId: "",
    publishedRows: [],
    unpublishedRows: [],
    loading: false,
    cloudReady: false
};

function mapMisaImportCloudV54(row) {
    return {
        id: String(row?.id || ""),
        importType: String(row?.import_type || ""),
        fileHash: row?.file_hash || "",
        fileName: row?.file_name || "",
        sheetName: row?.sheet_name || "",
        sourceRowCount: Number(row?.source_row_count || 0),
        rowCount: Number(row?.row_count || 0),
        filteredOutCount: Number(row?.filtered_out_count || 0),
        importedAt: row?.imported_at || "",
        createdEmail: row?.created_email || ""
    };
}

function mapMisaOrderRowCloudV54(row) {
    return {
        id: Number(row?.id || 0),
        importId: String(row?.import_id || ""),
        importType: String(row?.import_type || ""),
        rowNo: Number(row?.row_no || 0),
        platformOrderId: String(row?.platform_order_id || "").trim(),
        misaOrderId: String(row?.misa_order_id || "").trim(),
        invoiceNo: String(row?.invoice_no || "").trim(),
        invoiceDate: row?.invoice_date || "",
        invoiceSymbol: String(row?.invoice_symbol || "").trim(),
        totalPayment: Number(row?.total_payment || 0),
        orderStatus: String(row?.order_status || "").trim(),
        platformPaymentStatus: String(row?.platform_payment_status || "").trim(),
        orderCreatedAt: String(row?.order_created_at || "").trim(),
        platformPaidAt: String(row?.platform_paid_at || "").trim(),
        channel: String(row?.channel || "").trim(),
        shop: String(row?.shop || "").trim(),
        invoiceType: String(row?.invoice_type || "").trim(),
        invoiceStatus: String(row?.invoice_status || "").trim(),
        issueStatus: String(row?.issue_status || "").trim(),
        taxAuthorityStatus: String(row?.tax_authority_status || "").trim(),
        suggestedIssueAt: String(row?.suggested_issue_at || "").trim(),
        unissuedReason: String(row?.unissued_reason || "").trim(),
        refundRequestId: String(row?.refund_request_id || "").trim(),
        buyerName: String(row?.buyer_name || "").trim(),
        storeName: String(row?.store_name || "").trim(),
        raw: row?.raw || {}
    };
}

function findMisaOrderHeaderRowV54(matrix, importType) {
    const limit = Math.min(matrix?.length || 0, 80);
    for (let i = 0; i < limit; i++) {
        const headers = matrix[i] || [];
        const platformOrder = findInvoiceHeaderIndex(headers, ["Mã ĐH của sàn", "Mã đơn của sàn", "Mã đơn sàn"]);
        const misaOrder = findInvoiceHeaderIndex(headers, ["Mã đơn MISA eShop", "Mã đơn MISA"]);
        const invoiceNo = findInvoiceHeaderIndex(headers, ["Số hóa đơn", "Số HĐ"]);
        const issueStatus = findInvoiceHeaderIndex(headers, ["Trạng thái phát hành"]);
        if (platformOrder >= 0 && misaOrder >= 0 && (importType === "published" ? invoiceNo >= 0 : issueStatus >= 0)) {
            return i;
        }
    }
    return -1;
}

function misaDateTextV54(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const dd=String(value.getDate()).padStart(2,"0"), mm=String(value.getMonth()+1).padStart(2,"0"), yyyy=value.getFullYear();
        const hh=String(value.getHours()).padStart(2,"0"), mi=String(value.getMinutes()).padStart(2,"0"), ss=String(value.getSeconds()).padStart(2,"0");
        return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
    }
    return String(value ?? "").trim();
}

function misaRawObjectV54(headers,row) {
    const obj={};
    (headers||[]).forEach((h,i)=>{
        const key=String(h||`COL_${i+1}`).trim()||`COL_${i+1}`;
        obj[key]=row?.[i] instanceof Date ? row[i].toISOString() : (row?.[i] ?? "");
    });
    return obj;
}

function parseMisaOrderListV54(matrix, file, importType, sheetName="") {
    if (!Array.isArray(matrix) || !matrix.length) throw new Error("File MISA không có dữ liệu.");
    const headerRowIndex=findMisaOrderHeaderRowV54(matrix,importType);
    if(headerRowIndex<0) throw new Error(importType==="published" ? "Không tìm thấy tiêu đề Mã ĐH của sàn + Mã đơn MISA eShop + Số hóa đơn." : "Không tìm thấy tiêu đề Mã ĐH của sàn + Mã đơn MISA eShop + Trạng thái phát hành.");
    const headers=matrix[headerRowIndex]||[];
    const idx=(aliases)=>findInvoiceHeaderIndex(headers,aliases);
    const col={
        stt:idx(["STT"]), invoiceDate:idx(["Ngày hóa đơn"]), invoiceSymbol:idx(["Ký hiệu"]), invoiceNo:idx(["Số hóa đơn","Số HĐ"]),
        misaOrderId:idx(["Mã đơn MISA eShop","Mã đơn MISA"]), totalPayment:idx(["Tổng thanh toán"]), buyerName:idx(["Tên người mua"]),
        orderStatus:idx(["Trạng thái đơn"]), platformPaymentStatus:idx(["Trạng thái sàn thanh toán"]), orderCreatedAt:idx(["Thời gian tạo đơn"]), platformPaidAt:idx(["Thời gian sàn thanh toán"]),
        platformOrderId:idx(["Mã ĐH của sàn","Mã đơn của sàn","Mã đơn sàn"]), invoiceType:idx(["Loại hóa đơn"]), invoiceStatus:idx(["Trạng thái hóa đơn","Trạng thái HĐ"]),
        issueStatus:idx(["Trạng thái phát hành"]), taxAuthorityStatus:idx(["Trạng thái gửi CQT"]), storeName:idx(["Cửa hàng"]),
        suggestedIssueAt:idx(["Ngày phát hành đề xuất"]), channel:idx(["Kênh bán hàng"]), shop:idx(["Gian hàng"]), unissuedReason:idx(["Lý do chưa phát hành"]), refundRequestId:idx(["Mã yêu cầu hoàn"])
    };
    const all=[];
    for(let i=headerRowIndex+1;i<matrix.length;i++){
        const row=matrix[i]||[];
        if(!row.some(v=>String(v??"").trim())) continue;
        const get=k=>col[k]>=0?row[col[k]]:"";
        const platformOrderId=String(get("platformOrderId")??"").trim();
        const misaOrderId=String(get("misaOrderId")??"").trim();
        if(!platformOrderId && !misaOrderId) continue;
        all.push({
            rowNo:i+1, platformOrderId, misaOrderId,
            invoiceNo:String(get("invoiceNo")??"").trim(), invoiceDate:normalizeOrderDate(get("invoiceDate"))||"", invoiceSymbol:String(get("invoiceSymbol")??"").trim(),
            totalPayment:toInvoiceNumber(get("totalPayment")), orderStatus:String(get("orderStatus")??"").trim(), platformPaymentStatus:String(get("platformPaymentStatus")??"").trim(),
            orderCreatedAt:misaDateTextV54(get("orderCreatedAt")), platformPaidAt:misaDateTextV54(get("platformPaidAt")), channel:String(get("channel")??"").trim(), shop:String(get("shop")??"").trim(),
            invoiceType:String(get("invoiceType")??"").trim(), invoiceStatus:String(get("invoiceStatus")??"").trim(), issueStatus:String(get("issueStatus")??"").trim(), taxAuthorityStatus:String(get("taxAuthorityStatus")??"").trim(),
            suggestedIssueAt:misaDateTextV54(get("suggestedIssueAt")), unissuedReason:String(get("unissuedReason")??"").trim(), refundRequestId:String(get("refundRequestId")??"").trim(), buyerName:String(get("buyerName")??"").trim(), storeName:String(get("storeName")??"").trim(),
            raw:misaRawObjectV54(headers,row)
        });
    }
    if(!all.length) throw new Error("Không tìm thấy dòng đơn MISA hợp lệ.");
    let rows=all;
    if(importType==="unpublished" && col.channel>=0){
        rows=all.filter(r=>normalizeText(r.channel).includes("shopee"));
    }
    return {importType,fileName:file.name,fileSize:file.size,sheetName,sourceRowCount:all.length,rowCount:rows.length,filteredOutCount:all.length-rows.length,rows};
}

async function fetchMisaRowsV54(importId){
    if(!importId) return [];
    const client=initSupabaseClient(),result=[];let from=0;const page=1000;
    while(true){
        const {data,error}=await client.from(DB_MISA_ORDER_ROWS_V54).select("*").eq("import_id",importId).order("row_no",{ascending:true}).range(from,from+page-1);
        if(error) throw error; result.push(...(data||[])); if((data||[]).length<page) break; from+=page;
    }
    return result.map(mapMisaOrderRowCloudV54);
}

async function loadMisaOrderCloudV54({silent=false}={}){
    if(!state.user) return;
    misaOrderStateV54.loading=true;
    try{
        const imports=(await cloudSelectAll(DB_MISA_ORDER_IMPORTS_V54,"imported_at")).map(mapMisaImportCloudV54).sort((a,b)=>String(b.importedAt).localeCompare(String(a.importedAt)));
        misaOrderStateV54.imports=imports;
        const latestPub=imports.find(x=>x.importType==="published");
        const latestUnpub=imports.find(x=>x.importType==="unpublished");
        misaOrderStateV54.publishedImportId=latestPub?.id||"";
        misaOrderStateV54.unpublishedImportId=latestUnpub?.id||"";
        const [pubRows,unpubRows]=await Promise.all([fetchMisaRowsV54(misaOrderStateV54.publishedImportId),fetchMisaRowsV54(misaOrderStateV54.unpublishedImportId)]);
        misaOrderStateV54.publishedRows=pubRows; misaOrderStateV54.unpublishedRows=unpubRows; misaOrderStateV54.cloudReady=true;
        renderMisaInvoiceHubV54();
    }catch(error){
        misaOrderStateV54.cloudReady=false;
        if(!silent) alert("Không đọc được dữ liệu MISA V54. Hãy chạy SQL V54 trước.\n\n"+(error?.message||"")); else console.warn("MISA V54 chưa sẵn sàng:",error?.message||error);
    }finally{misaOrderStateV54.loading=false;}
}

async function importMisaOrderListV54(file,importType){
    if(!requirePermissionV40("UPLOAD_INVOICE")) return;
    if(!file) return;
    const input=importType==="published"?$("misaPublishedInputV54"):$("misaUnpublishedInputV54");
    const notice=$("v54MisaImportNotice");
    try{
        if(notice){notice.className="v54-import-notice";notice.textContent="Đang đọc file MISA...";}
        const read=await readInvoiceExcelFile(file);
        const parsed=parseMisaOrderListV54(read.matrix,file,importType,read.sheetName||"");
        const hash=await createFileFingerprint(file); const client=initSupabaseClient();
        const {data:begin,error:beginError}=await client.rpc("begin_misa_order_import_v54",{p_import:{importType,fileHash:hash,fileName:file.name,fileSize:file.size,sheetName:parsed.sheetName,sourceRowCount:parsed.sourceRowCount,rowCount:parsed.rowCount,filteredOutCount:parsed.filteredOutCount}});
        if(beginError) throw beginError;
        const importId=begin?.import_id||begin?.importId||begin; if(!importId) throw new Error("RPC không trả về import_id.");
        for(let i=0;i<parsed.rows.length;i+=500){
            const {error}=await client.rpc("append_misa_order_rows_v54",{p_import_id:importId,p_rows:parsed.rows.slice(i,i+500)}); if(error) throw error;
            if(notice) notice.textContent=`Đang lưu ${Math.min(i+500,parsed.rows.length)}/${parsed.rows.length} dòng...`;
        }
        const {data:finalize,error:finalError}=await client.rpc("finalize_misa_order_import_v54",{p_import_id:importId}); if(finalError) throw finalError;
        await loadMisaOrderCloudV54({silent:true}); await loadInvoiceOrderLinksV50({silent:true});
        const autoLinks=Number(finalize?.auto_links||0);
        if(notice){notice.className="v54-import-notice good";notice.innerHTML=`✓ Đã lưu <strong>${formatNumber(parsed.rowCount)}</strong> dòng ${importType==="published"?"đã phát hành":"chưa phát hành Shopee"}. ${parsed.filteredOutCount?`Đã bỏ ${formatNumber(parsed.filteredOutCount)} dòng sàn khác. `:""}${autoLinks?`Tự nối chính xác ${formatNumber(autoLinks)} Mã đơn Shopee ↔ Số HĐ.`:""}`;}
        showToast(`Đã upload ${importType==="published"?"HĐ đã phát hành":"HĐ chưa phát hành"} MISA.`);
    }catch(error){console.error("V54 import MISA",error); if(notice){notice.className="v54-import-notice danger";notice.textContent=`Không upload được: ${error?.message||error}`;} alert("Không upload được file MISA.\n\n"+(error?.message||""));}
    finally{if(input) input.value="";}
}

function latestMisaImportV54(type){return misaOrderStateV54.imports.find(x=>x.importType===type)||null;}

function buildShopeeOrderGroupsV54(){
    const map=new Map();
    (state.skuRows||[]).forEach(row=>{
        const id=String(row.orderId||"").trim(); if(!id) return; const key=normalizeOrderReferenceV41(id); if(!key) return;
        if(!map.has(key)) map.set(key,{key,orderId:id,orderDate:row.sourceOrderDate||row.orderDate||"",reportDate:row.orderDate||"",status:row.status||"",qty:0,skus:new Map()});
        const g=map.get(key); g.qty+=Number(row.quantity||0); if(row.sku) g.skus.set(row.sku,Number(g.skus.get(row.sku)||0)+Number(row.quantity||0)); if(!g.status&&row.status)g.status=row.status; if(!g.orderDate&&(row.sourceOrderDate||row.orderDate))g.orderDate=row.sourceOrderDate||row.orderDate;
    });
    return [...map.values()].sort((a,b)=>String(b.orderDate).localeCompare(String(a.orderDate))||a.orderId.localeCompare(b.orderId));
}

function buildInvoiceDetailByNoV54(){
    const map=new Map();
    (invoiceState.lineRows||[]).filter(r=>r?.issued===true&&String(r.invoiceNo||"").trim()).forEach(r=>{
        const key=normalizeInvoiceNoV50(r.invoiceNo); if(!key)return; if(!map.has(key))map.set(key,{invoiceNo:r.invoiceNo,lines:0,qty:0,items:new Map()}); const g=map.get(key); g.lines++; g.qty+=Number(r.quantity||0); const item=String(r.productCode||r.productName||"").trim(); if(item)g.items.set(item,Number(g.items.get(item)||0)+Number(r.quantity||0));
    });
    return map;
}

function buildMisaDirectRowsV54(){
    const pubMap=new Map(),unpubMap=new Map();
    misaOrderStateV54.publishedRows.forEach(r=>{const k=normalizeOrderReferenceV41(r.platformOrderId);if(k&&!pubMap.has(k))pubMap.set(k,r);});
    misaOrderStateV54.unpublishedRows.forEach(r=>{const k=normalizeOrderReferenceV41(r.platformOrderId);if(k&&!unpubMap.has(k))unpubMap.set(k,r);});
    const detailMap=buildInvoiceDetailByNoV54();
    return buildShopeeOrderGroupsV54().map(order=>{
        const pub=pubMap.get(order.key)||null,unpub=pub?null:(unpubMap.get(order.key)||null); const misa=pub||unpub; const detail=pub?detailMap.get(normalizeInvoiceNoV50(pub.invoiceNo)):null;
        const delivered=classifyInventoryShopeeStatus(order.status)==="delivered";
        let statusKey="missing",statusLabel="Chưa thấy trong MISA";
        if(pub){statusKey="published";statusLabel="Đã phát hành";} else if(unpub){statusKey="unpublished";statusLabel="Chưa phát hành";}
        const tax=normalizeText(pub?.taxAuthorityStatus||""); const cqtPending=Boolean(pub)&&(!tax||tax.includes("chuagui")||tax.includes("chuatiepnhan")||tax.includes("tuchoi"));
        return {...order,pub,unpub,misa,detail,delivered,statusKey,statusLabel,cqtPending};
    });
}

function renderMisaInvoiceHubV54(){
    const pub=latestMisaImportV54("published"),unpub=latestMisaImportV54("unpublished");
    const pubInfo=$("v54PublishedFileInfo"),unpubInfo=$("v54UnpublishedFileInfo");
    if(pubInfo)pubInfo.textContent=pub?`${pub.fileName} · ${formatNumber(pub.rowCount)} dòng · ${pub.importedAt?formatDateTimeVi(pub.importedAt):"—"}`:"Chưa có file đã phát hành trên Cloud.";
    if(unpubInfo)unpubInfo.textContent=unpub?`${unpub.fileName} · ${formatNumber(unpub.rowCount)} dòng Shopee${unpub.filteredOutCount?` · bỏ ${formatNumber(unpub.filteredOutCount)} dòng sàn khác`:""} · ${unpub.importedAt?formatDateTimeVi(unpub.importedAt):"—"}`:"Chưa có file chưa phát hành trên Cloud.";
    const notice=$("v54MisaImportNotice"); if(notice&&!notice.classList.contains("danger")){
        const detailReady=Boolean(invoiceState?.lineRows?.length); const sourceCount=[Boolean(pub),Boolean(unpub),detailReady].filter(Boolean).length;
        notice.className=`v54-import-notice ${sourceCount===3?"good":sourceCount?"warning":""}`;
        notice.innerHTML=sourceCount===3?"✓ Đã có đủ 3 nguồn MISA. Có thể đối chiếu Mã đơn → trạng thái HĐ → Số HĐ → chi tiết SKU.":`Đang có <strong>${sourceCount}/3</strong> nguồn MISA. Upload thêm nguồn còn thiếu để đối chiếu đầy đủ hơn.`;
    }
    renderMisaDirectTableV54();
    renderInvoiceWorkQueueV55();
    // V56: trạng thái HĐ được dùng trực tiếp ở Đơn hàng và Tồn kho.
    renderOrdersTab();
    if (inventoryState.loaded) renderInventoryModule();
}

function renderMisaDirectTableV54(){
    const all=buildMisaDirectRowsV54();
    const published=all.filter(x=>x.pub),unpublished=all.filter(x=>x.unpub),deliveredMissing=all.filter(x=>x.delivered&&!x.pub&&!x.unpub),cqt=all.filter(x=>x.cqtPending),detail=all.filter(x=>x.detail);
    if($("v54ShopeeOrderCount"))$("v54ShopeeOrderCount").textContent=formatNumber(all.length);
    if($("v54PublishedMatchCount"))$("v54PublishedMatchCount").textContent=formatNumber(published.length);
    if($("v54UnpublishedMatchCount"))$("v54UnpublishedMatchCount").textContent=formatNumber(unpublished.length);
    if($("v54DeliveredMissingCount"))$("v54DeliveredMissingCount").textContent=formatNumber(deliveredMissing.length);
    if($("v54CqtPendingCount"))$("v54CqtPendingCount").textContent=formatNumber(cqt.length);
    if($("v54DetailMatchedCount"))$("v54DetailMatchedCount").textContent=formatNumber(detail.length);
    const summary=$("v54DirectSummary"); if(summary)summary.innerHTML=`MISA đã phát hành: <strong>${formatNumber(misaOrderStateV54.publishedRows.length)}</strong> dòng · MISA chưa phát hành Shopee: <strong>${formatNumber(misaOrderStateV54.unpublishedRows.length)}</strong> dòng · Chi tiết hóa đơn đang xem: <strong>${formatNumber(invoiceState?.invoiceCount||0)}</strong> số HĐ.`;
    let rows=all; const search=normalizeText($("v54InvoiceOrderSearch")?.value||""); const filter=$("v54InvoiceStatusFilter")?.value||"all";
    if(search)rows=rows.filter(x=>normalizeText(`${x.orderId} ${x.misa?.invoiceNo||""} ${x.misa?.misaOrderId||""} ${x.status}`).includes(search));
    if(filter==="published")rows=rows.filter(x=>x.pub); else if(filter==="unpublished")rows=rows.filter(x=>x.unpub); else if(filter==="missing")rows=rows.filter(x=>!x.pub&&!x.unpub); else if(filter==="cqt")rows=rows.filter(x=>x.cqtPending);
    const body=$("v54DirectBody"); if(!body)return;
    if(!rows.length){body.innerHTML='<tr><td colspan="11" class="empty-table">Không có đơn phù hợp bộ lọc.</td></tr>';return;}
    body.innerHTML=rows.slice(0,800).map((x,i)=>{
        const m=x.misa; let resultClass=x.statusKey,resultLabel=x.statusLabel,note="";
        if(x.pub&&x.cqtPending){resultClass="cqt";note="Cần theo dõi CQT";} else if(x.unpub){note=x.unpub.unissuedReason||"Đang chờ phát hành";} else if(!x.pub&&!x.unpub){note=x.delivered?"Đơn đã giao nhưng chưa thấy MISA":"Chưa đến bước kết luận HĐ";}
        const detailHtml=x.detail?`<span class="v54-detail-pill">${formatNumber(x.detail.lines)} dòng · ${formatNumber(x.detail.qty)} SP</span>`:'—';
        return `<tr><td>${i+1}</td><td>${escapeHTML(x.orderId)}</td><td>${x.orderDate?formatDateLabel(x.orderDate):'—'}</td><td>${escapeHTML(x.status||'—')}</td><td><span class="v54-status-pill ${resultClass}">${escapeHTML(resultLabel)}</span></td><td><strong>${escapeHTML(m?.invoiceNo||'—')}</strong></td><td>${m?.invoiceDate?formatDateLabel(m.invoiceDate):'—'}</td><td class="right">${m?invoiceMoney(m.totalPayment):'—'}</td><td>${escapeHTML(x.pub?.taxAuthorityStatus||'—')}</td><td>${detailHtml}</td><td><span class="v54-status-pill ${resultClass}">${escapeHTML(resultLabel)}</span>${note?`<small class="v54-result-note">${escapeHTML(note)}</small>`:''}</td></tr>`;
    }).join("");
}



/* =========================================================
   V55 - HÀNG CHỜ HÓA ĐƠN & SLA PHÁT HÀNH
========================================================= */
function v55DateKeyFromAny(value){
    if(!value) return "";
    const normalized=normalizeOrderDate(value);
    if(normalized) return normalized;
    const text=String(value||"").trim();
    const m=text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if(m) return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
    return "";
}

function v55DaysBetween(fromKey,toKey){
    if(!fromKey||!toKey) return null;
    const a=Date.parse(`${fromKey}T00:00:00`), b=Date.parse(`${toKey}T00:00:00`);
    if(Number.isNaN(a)||Number.isNaN(b)) return null;
    return Math.floor((b-a)/86400000);
}

function v55PriorityForRow(row,today){
    const dueDate=row.unpub ? (v55DateKeyFromAny(row.unpub.suggestedIssueAt)||row.orderDate||"") : "";
    const overdueDays=dueDate ? v55DaysBetween(dueDate,today) : null;

    if(row.delivered&&!row.pub&&!row.unpub){
        return {key:"urgent",label:"KHẨN",rank:1,note:"Đơn đã giao nhưng chưa thấy trong MISA",dueDate,overdueDays:null};
    }
    if(row.unpub && overdueDays!==null && overdueDays>=3){
        return {key:"urgent",label:"KHẨN",rank:1,note:`Quá hạn phát hành ${overdueDays} ngày`,dueDate,overdueDays};
    }
    if(row.unpub && overdueDays!==null && overdueDays>=1){
        return {key:"warning",label:"CAO",rank:2,note:`Quá hạn phát hành ${overdueDays} ngày`,dueDate,overdueDays};
    }
    if(row.cqtPending){
        return {key:"cqt",label:"CQT",rank:2,note:"Đã phát hành nhưng trạng thái CQT chưa hoàn tất",dueDate,overdueDays};
    }
    if(row.unpub){
        return {key:"pending",label:"CHỜ",rank:3,note:row.unpub.unissuedReason||"Đang chờ phát hành",dueDate,overdueDays};
    }
    if(row.pub){
        return {key:"done",label:"XONG",rank:9,note:"Đã phát hành",dueDate,overdueDays};
    }
    return {key:"info",label:"THEO DÕI",rank:7,note:"Chưa đến bước kết luận hóa đơn",dueDate,overdueDays};
}

function buildInvoiceWorkQueueV55(){
    const today=getLocalTodayKey();
    return buildMisaDirectRowsV54().map(row=>{
        const priority=v55PriorityForRow(row,today);
        const overdue=Boolean(row.unpub && priority.overdueDays!==null && priority.overdueDays>0);
        const done=Boolean(row.pub && !row.cqtPending);
        const actionable=Boolean((row.delivered&&!row.pub&&!row.unpub)||row.unpub||row.cqtPending);
        return {...row,priority,overdue,done,actionable};
    }).sort((a,b)=>a.priority.rank-b.priority.rank || Number(b.priority.overdueDays||0)-Number(a.priority.overdueDays||0) || String(a.orderDate||"").localeCompare(String(b.orderDate||"")));
}

function v55LateText(row){
    if(!row.unpub) return "—";
    const d=row.priority.overdueDays;
    if(d===null) return "—";
    if(d<0) return `còn ${Math.abs(d)} ngày`;
    if(d===0) return "hôm nay";
    return `+${d} ngày`;
}

function renderInvoiceWorkQueueV55(){
    const all=buildInvoiceWorkQueueV55();
    const actionable=all.filter(x=>x.actionable);
    const missing=all.filter(x=>x.delivered&&!x.pub&&!x.unpub);
    const unpublished=all.filter(x=>x.unpub);
    const overdue=all.filter(x=>x.overdue);
    const cqt=all.filter(x=>x.cqtPending);
    const done=all.filter(x=>x.done);

    if($("v55NeedActionCount")) $("v55NeedActionCount").textContent=formatNumber(actionable.length);
    if($("v55MissingMisaCount")) $("v55MissingMisaCount").textContent=formatNumber(missing.length);
    if($("v55UnpublishedCount")) $("v55UnpublishedCount").textContent=formatNumber(unpublished.length);
    if($("v55OverdueCount")) $("v55OverdueCount").textContent=formatNumber(overdue.length);
    if($("v55CqtCount")) $("v55CqtCount").textContent=formatNumber(cqt.length);
    if($("v55DoneCount")) $("v55DoneCount").textContent=formatNumber(done.length);

    const summary=$("v55QueueSummary");
    if(summary){
        summary.innerHTML=`Có <strong>${formatNumber(actionable.length)}</strong> việc đang mở · `+
            `<strong>${formatNumber(missing.length)}</strong> đơn đã giao chưa thấy MISA · `+
            `<strong>${formatNumber(overdue.length)}</strong> đơn quá hạn phát hành · `+
            `<strong>${formatNumber(cqt.length)}</strong> hóa đơn còn vướng CQT.`;
    }

    let rows=all;
    const filter=$("v55InvoiceQueueFilter")?.value||"action";
    const search=normalizeText($("v55InvoiceQueueSearch")?.value||"");
    if(filter==="action") rows=rows.filter(x=>x.actionable);
    else if(filter==="missing") rows=rows.filter(x=>x.delivered&&!x.pub&&!x.unpub);
    else if(filter==="unpublished") rows=rows.filter(x=>x.unpub);
    else if(filter==="overdue") rows=rows.filter(x=>x.overdue);
    else if(filter==="cqt") rows=rows.filter(x=>x.cqtPending);
    else if(filter==="done") rows=rows.filter(x=>x.done);
    if(search){
        rows=rows.filter(x=>normalizeText(`${x.orderId} ${x.misa?.invoiceNo||""} ${x.unpub?.unissuedReason||""} ${x.pub?.taxAuthorityStatus||""} ${x.status||""}`).includes(search));
    }

    const body=$("v55InvoiceQueueBody");
    if(!body) return;
    if(!rows.length){
        body.innerHTML='<tr><td colspan="11" class="empty-table">Không có đơn phù hợp bộ lọc.</td></tr>';
        return;
    }
    body.innerHTML=rows.slice(0,800).map((x,i)=>{
        const misa=x.misa;
        const misaStatus=x.pub?"Đã phát hành":(x.unpub?"Chưa phát hành":"Chưa thấy MISA");
        const reason=x.unpub?.unissuedReason || (x.cqtPending?`CQT: ${x.pub?.taxAuthorityStatus||"chưa hoàn tất"}`:x.priority.note||"");
        const due=x.priority.dueDate?formatDateLabel(x.priority.dueDate):"—";
        return `<tr class="v55-row-${x.priority.key}">
            <td>${i+1}</td>
            <td><strong>${escapeHTML(x.orderId)}</strong></td>
            <td>${x.orderDate?formatDateLabel(x.orderDate):"—"}</td>
            <td>${escapeHTML(x.status||"—")}</td>
            <td>${due}</td>
            <td><span class="v55-late-pill ${x.overdue?'late':''}">${escapeHTML(v55LateText(x))}</span></td>
            <td><span class="v55-misa-pill ${x.statusKey}">${escapeHTML(misaStatus)}</span></td>
            <td><strong>${escapeHTML(misa?.invoiceNo||"—")}</strong></td>
            <td>${escapeHTML(x.pub?.taxAuthorityStatus||"—")}</td>
            <td class="v55-reason">${escapeHTML(reason||"—")}</td>
            <td><span class="v55-priority-pill ${x.priority.key}">${escapeHTML(x.priority.label)}</span></td>
        </tr>`;
    }).join("");
}

$("v55InvoiceQueueSearch")?.addEventListener("input",renderInvoiceWorkQueueV55);
$("v55InvoiceQueueFilter")?.addEventListener("change",renderInvoiceWorkQueueV55);

$("misaPublishedInputV54")?.addEventListener("change",event=>{const file=event.target.files?.[0];if(file)importMisaOrderListV54(file,"published");});
$("misaUnpublishedInputV54")?.addEventListener("change",event=>{const file=event.target.files?.[0];if(file)importMisaOrderListV54(file,"unpublished");});
$("btnMisaV54Refresh")?.addEventListener("click",async()=>{await loadMisaOrderCloudV54({silent:false});await loadInvoiceOrderLinksV50({silent:true});showToast("Đã đồng bộ dữ liệu MISA V54.");});
$("v54InvoiceOrderSearch")?.addEventListener("input",renderMisaDirectTableV54);
$("v54InvoiceStatusFilter")?.addEventListener("change",renderMisaDirectTableV54);

/* =========================================================
   V53 - ĐỐI SOÁT TÀI CHÍNH SHOPEE
========================================================= */
const DB_FINANCE_IMPORTS_V53 = "finance_imports";
const DB_FINANCE_ROWS_V53 = "finance_rows";

const financeStateV53 = {
    imports: [],
    rows: [],
    currentImportId: "",
    loading: false,
    search: "",
    statusFilter: "all"
};

const FINANCE_ALIASES_V53 = {
    orderId: ["Mã đơn hàng","Mã đơn","Shopee Order ID","Order ID","Order No","Mã đơn Shopee"],
    transactionDate: ["Ngày giao dịch","Ngày đơn","Ngày tạo","Transaction Date","Order Date","Ngày ghi nhận"],
    payoutDate: ["Ngày thanh toán","Ngày chuyển khoản","Payout Date","Settlement Date","Ngày đối soát","Ngày giải ngân"],
    payoutId: ["Mã thanh toán","Mã đối soát","Payout ID","Settlement ID","Mã đợt thanh toán","Mã giao dịch"],
    paymentStatus: ["Trạng thái thanh toán","Payment Status","Payout Status","Settlement Status","Trạng thái"],
    gross: ["Tổng tiền đơn hàng","Tổng tiền người mua thanh toán","Tổng số tiền người mua thanh toán","Buyer Paid","Order Amount","Gross Amount","Doanh thu","Tổng tiền hàng"],
    commissionFee: ["Phí hoa hồng","Commission Fee","Commission"],
    serviceFee: ["Phí dịch vụ","Service Fee","Service Fees"],
    transactionFee: ["Phí thanh toán","Transaction Fee","Payment Fee","Phí giao dịch"],
    shippingFee: ["Phí vận chuyển","Shipping Fee","Actual Shipping Fee","Phí vận chuyển thực tế"],
    voucherCost: ["Mã giảm giá của Người bán","Voucher người bán","Seller Voucher","Seller Discount","Giảm giá người bán","Khuyến mãi người bán"],
    refundAmount: ["Hoàn tiền","Refund","Refund Amount","Số tiền hoàn","Trả hàng hoàn tiền"],
    otherFee: ["Phí khác","Other Fee","Other Fees","Chi phí khác"],
    adjustment: ["Điều chỉnh","Adjustment","Other Adjustment","Điều chỉnh khác"],
    netAmount: ["Tiền thực nhận","Số tiền thanh toán","Net Income","Payout Amount","Settlement Amount","Net Amount","Thực nhận","Tổng thanh toán"]
};

function parseFinanceNumberV53(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    let text = String(value ?? "").trim();
    if (!text) return 0;
    let negative = false;
    if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1,-1); }
    text = text.replace(/\s+/g, "").replace(/₫|đ|vnd/gi, "");
    const hasDot = text.includes(".");
    const hasComma = text.includes(",");
    if (hasDot && hasComma) {
        const lastDot = text.lastIndexOf(".");
        const lastComma = text.lastIndexOf(",");
        if (lastComma > lastDot) text = text.replace(/\./g, "").replace(",", ".");
        else text = text.replace(/,/g, "");
    } else if (hasComma) {
        const parts = text.split(",");
        text = parts.length === 2 && parts[1].length <= 2 ? `${parts[0].replace(/\./g,"")}.${parts[1]}` : text.replace(/,/g, "");
    } else if (hasDot) {
        const parts = text.split(".");
        if (!(parts.length === 2 && parts[1].length <= 2)) text = text.replace(/\./g, "");
    }
    text = text.replace(/[^0-9.\-]/g, "");
    const n = Number(text);
    if (!Number.isFinite(n)) return 0;
    return negative ? -Math.abs(n) : n;
}
function financeCostV53(value){ return Math.abs(parseFinanceNumberV53(value)); }
function financeMoneyV53(value){ return `${formatNumber(Math.round(Number(value||0)))} đ`; }

function normalizeFinanceHeaderV53(value){ return normalizeText(String(value ?? "")); }
function findFinanceColumnV53(headers, aliases){
    const normalized = headers.map(normalizeFinanceHeaderV53);
    for (const alias of aliases || []) {
        const needle = normalizeFinanceHeaderV53(alias);
        const exact = normalized.findIndex(v => v === needle);
        if (exact >= 0) return exact;
    }
    for (const alias of aliases || []) {
        const needle = normalizeFinanceHeaderV53(alias);
        if (needle.length < 5) continue;
        const partial = normalized.findIndex(v => v.includes(needle) || needle.includes(v));
        if (partial >= 0) return partial;
    }
    return -1;
}
function detectFinanceHeaderV53(matrix){
    let best = {rowIndex:-1, score:-1, map:{}, headers:[]};
    const limit = Math.min(matrix.length, 70);
    for (let r=0;r<limit;r++){
        const headers = (matrix[r]||[]).map(v=>String(v??"").trim());
        if (headers.filter(Boolean).length < 2) continue;
        const map = {};
        let score=0;
        Object.entries(FINANCE_ALIASES_V53).forEach(([key,aliases])=>{
            const col=findFinanceColumnV53(headers,aliases); map[key]=col; if(col>=0) score += ["orderId","netAmount","gross"].includes(key)?3:1;
        });
        if (map.orderId>=0) score += 3;
        if (map.netAmount>=0 || map.gross>=0) score += 3;
        if (score > best.score) best={rowIndex:r,score,map,headers};
    }
    return best;
}
async function readFinanceWorkbookV53(file){
    if(typeof XLSX==="undefined") throw new Error("Không tải được thư viện Excel.");
    const buffer=await file.arrayBuffer();
    const wb=XLSX.read(new Uint8Array(buffer),{type:"array",cellDates:true});
    let best=null;
    wb.SheetNames.forEach(sheetName=>{
        const matrix=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:"",raw:true});
        const detected=detectFinanceHeaderV53(matrix);
        if(!best || detected.score>best.detected.score) best={sheetName,matrix,detected};
    });
    if(!best || best.detected.score<4) throw new Error("Không nhận diện được bảng tài chính. Cần ít nhất cột tiền hoặc Mã đơn/Trạng thái rõ ràng.");
    return best;
}
function financeRawObjectV53(headers,row){
    const obj={}; headers.forEach((h,i)=>{ const key=String(h||`COL_${i+1}`).trim()||`COL_${i+1}`; obj[key]=row[i] instanceof Date?row[i].toISOString():row[i]; }); return obj;
}
function normalizeFinanceStatusV53(value){
    const n=normalizeText(value||"");
    if(!n) return "unknown";
    if(["dathanhtoan","hoantat","completed","paid","released","dachuyenkhoan","success","successful"].some(x=>n.includes(x))) return "paid";
    if(["cho","dangxuly","pending","processing","processingpayout","waiting","chothanhtoan"].some(x=>n.includes(x))) return "pending";
    return "unknown";
}
function parseFinanceWorkbookV53(workbook,file){
    const {matrix,detected,sheetName}=workbook;
    const {rowIndex,map,headers}=detected;
    const rows=[];
    for(let i=rowIndex+1;i<matrix.length;i++){
        const row=matrix[i]||[];
        if(!row.some(v=>String(v??"").trim())) continue;
        const get=key=>map[key]>=0?row[map[key]]:"";
        const orderId=String(get("orderId")??"").trim();
        const gross=parseFinanceNumberV53(get("gross"));
        const commissionFee=financeCostV53(get("commissionFee"));
        const serviceFee=financeCostV53(get("serviceFee"));
        const transactionFee=financeCostV53(get("transactionFee"));
        const shippingFee=financeCostV53(get("shippingFee"));
        const voucherCost=financeCostV53(get("voucherCost"));
        const refundAmount=financeCostV53(get("refundAmount"));
        const otherFee=financeCostV53(get("otherFee"));
        const adjustment=parseFinanceNumberV53(get("adjustment"));
        const netAmount=parseFinanceNumberV53(get("netAmount"));
        const hasMoney=[gross,commissionFee,serviceFee,transactionFee,shippingFee,voucherCost,refundAmount,otherFee,adjustment,netAmount].some(v=>Math.abs(v)>0);
        if(!orderId && !hasMoney) continue;
        const platformFees=commissionFee+serviceFee+transactionFee+shippingFee+otherFee;
        const formulaComparable=map.gross>=0 && map.netAmount>=0;
        const expectedNet=formulaComparable?gross-platformFees-voucherCost-refundAmount+adjustment:0;
        const variance=formulaComparable?netAmount-expectedNet:0;
        rows.push({
            rowNo:i+1, orderId,
            transactionDate:normalizeOrderDate(get("transactionDate"))||"",
            payoutDate:normalizeOrderDate(get("payoutDate"))||"",
            payoutId:String(get("payoutId")??"").trim(),
            paymentStatus:String(get("paymentStatus")??"").trim(),
            gross, commissionFee, serviceFee, transactionFee, shippingFee, voucherCost, refundAmount, otherFee, adjustment, netAmount,
            platformFees, expectedNet, variance, formulaComparable,
            raw:financeRawObjectV53(headers,row)
        });
    }
    if(!rows.length) throw new Error("Không đọc được dòng tài chính nào từ sheet đã nhận diện.");
    const mapping={sheetName,headerRow:rowIndex+1,score:detected.score};
    Object.keys(FINANCE_ALIASES_V53).forEach(key=>mapping[key]=map[key]>=0?headers[map[key]]:"");
    const dates=rows.flatMap(r=>[r.transactionDate,r.payoutDate]).filter(Boolean).sort();
    const totals=financeTotalsV53(rows);
    return {rows,mapping,periodFrom:dates[0]||"",periodTo:dates.at(-1)||"",totals};
}
function financeTotalsV53(rows=financeStateV53.rows){
    return rows.reduce((a,r)=>{
        a.gross+=Number(r.gross||0); a.commission+=Number(r.commissionFee||0); a.service+=Number(r.serviceFee||0); a.transaction+=Number(r.transactionFee||0); a.shipping+=Number(r.shippingFee||0); a.voucher+=Number(r.voucherCost||0); a.refund+=Number(r.refundAmount||0); a.other+=Number(r.otherFee||0); a.adjustment+=Number(r.adjustment||0); a.net+=Number(r.netAmount||0); return a;
    },{gross:0,commission:0,service:0,transaction:0,shipping:0,voucher:0,refund:0,other:0,adjustment:0,net:0});
}
function currentFinanceImportV53(){ return financeStateV53.imports.find(x=>x.id===financeStateV53.currentImportId)||financeStateV53.imports[0]||null; }
function mapFinanceImportCloudV53(row){ return {id:row.id,fileHash:row.file_hash||"",fileName:row.file_name||"",fileSize:Number(row.file_size||0),importedAt:row.imported_at||"",periodFrom:row.period_from||"",periodTo:row.period_to||"",rowCount:Number(row.row_count||0),grossTotal:Number(row.gross_total||0),feeTotal:Number(row.fee_total||0),discountTotal:Number(row.discount_total||0),refundTotal:Number(row.refund_total||0),netTotal:Number(row.net_total||0),mapping:row.mapping||{},createdEmail:row.created_email||""}; }
function mapFinanceRowCloudV53(row){ return {id:row.id,rowNo:Number(row.row_no||0),orderId:row.order_id||"",transactionDate:row.transaction_date||"",payoutDate:row.payout_date||"",payoutId:row.payout_id||"",paymentStatus:row.payment_status||"",gross:Number(row.gross||0),commissionFee:Number(row.commission_fee||0),serviceFee:Number(row.service_fee||0),transactionFee:Number(row.transaction_fee||0),shippingFee:Number(row.shipping_fee||0),voucherCost:Number(row.voucher_cost||0),refundAmount:Number(row.refund_amount||0),otherFee:Number(row.other_fee||0),adjustment:Number(row.adjustment||0),netAmount:Number(row.net_amount||0),expectedNet:Number(row.expected_net||0),variance:Number(row.variance||0),formulaComparable:Boolean(row.formula_comparable),raw:row.raw||{},platformFees:Number(row.commission_fee||0)+Number(row.service_fee||0)+Number(row.transaction_fee||0)+Number(row.shipping_fee||0)+Number(row.other_fee||0)}; }
async function fetchFinanceRowsV53(importId){
    if(!importId) return [];
    const client=initSupabaseClient(), result=[]; let from=0; const page=1000;
    while(true){ const {data,error}=await client.from(DB_FINANCE_ROWS_V53).select("*").eq("import_id",importId).order("row_no",{ascending:true}).range(from,from+page-1); if(error) throw error; result.push(...(data||[])); if((data||[]).length<page) break; from+=page; }
    return result.map(mapFinanceRowCloudV53);
}
async function loadFinanceCloudV53({silent=false}={}){
    if(!state.user) return;
    financeStateV53.loading=true;
    try{
        const imports=await cloudSelectAll(DB_FINANCE_IMPORTS_V53,"imported_at");
        financeStateV53.imports=imports.map(mapFinanceImportCloudV53).sort((a,b)=>String(b.importedAt).localeCompare(String(a.importedAt)));
        if(!financeStateV53.currentImportId || !financeStateV53.imports.some(x=>x.id===financeStateV53.currentImportId)) financeStateV53.currentImportId=financeStateV53.imports[0]?.id||"";
        financeStateV53.rows=await fetchFinanceRowsV53(financeStateV53.currentImportId);
        renderFinanceAllV53(); refreshNavCounts();
    }catch(error){ if(!silent){console.error(error); alert("Không đọc được dữ liệu tài chính Cloud.\n\n"+(error?.message||""));} else console.warn("Finance V53 chưa sẵn sàng:",error?.message||error); }
    finally{financeStateV53.loading=false;}
}
async function selectFinanceImportV53(importId){ financeStateV53.currentImportId=importId||""; financeStateV53.rows=await fetchFinanceRowsV53(financeStateV53.currentImportId); renderFinanceAllV53(); refreshNavCounts(); }
async function importFinanceFileV53(file){
    if(!requirePermissionV40("UPLOAD_FINANCE")) return;
    if(!file) return;
    const button=$("btnFinanceChooseV53"); if(button){button.disabled=true;button.textContent="Đang đọc...";}
    try{
        const wb=await readFinanceWorkbookV53(file); const parsed=parseFinanceWorkbookV53(wb,file); const hash=await createFileFingerprint(file); const t=parsed.totals; const feeTotal=t.commission+t.service+t.transaction+t.shipping+t.other;
        const client=initSupabaseClient();
        const {data:begin,error:beginError}=await client.rpc("begin_finance_import_v53",{p_import:{fileHash:hash,fileName:file.name,fileSize:file.size,periodFrom:parsed.periodFrom||null,periodTo:parsed.periodTo||null,rowCount:parsed.rows.length,grossTotal:t.gross,feeTotal,discountTotal:t.voucher,refundTotal:t.refund,netTotal:t.net,mapping:parsed.mapping}}); if(beginError) throw beginError;
        const importId=begin?.import_id||begin?.importId||begin; if(!importId) throw new Error("RPC không trả về import_id.");
        for(let i=0;i<parsed.rows.length;i+=400){ const chunk=parsed.rows.slice(i,i+400); const {error}=await client.rpc("append_finance_rows_v53",{p_import_id:importId,p_rows:chunk}); if(error) throw error; if(button) button.textContent=`Đang lưu ${Math.min(i+chunk.length,parsed.rows.length)}/${parsed.rows.length}`; }
        financeStateV53.currentImportId=String(importId); await loadFinanceCloudV53({silent:false}); showToast(`Đã lưu ${formatNumber(parsed.rows.length)} dòng tài chính lên Cloud.`);
    }catch(error){ console.error("Import finance V53:",error); alert("Không upload được file tài chính.\n\n"+(error?.message||"")); }
    finally{ if(button){button.disabled=false;button.textContent="⬆ Upload file tài chính";} if($("financeFileInputV53")) $("financeFileInputV53").value=""; }
}
async function deleteFinanceImportV53(){
    if(!requirePermissionV40("DELETE_FINANCE")) return; const current=currentFinanceImportV53(); if(!current) return;
    if(!confirm(`Xóa snapshot tài chính:\n${current.fileName}\n\nDữ liệu chi tiết của snapshot này cũng sẽ bị xóa.`)) return;
    try{ const client=initSupabaseClient(); const {error}=await client.rpc("admin_delete_finance_import_v53",{p_import_id:current.id}); if(error) throw error; financeStateV53.currentImportId=""; await loadFinanceCloudV53(); showToast("Đã xóa snapshot tài chính."); }catch(error){alert("Không xóa được snapshot.\n\n"+(error?.message||""));}
}
function buildFinanceOrderGroupsV53(){
    const map=new Map(); financeStateV53.rows.forEach((r,idx)=>{ const key=r.orderId||`__ROW_${idx+1}`; if(!map.has(key)) map.set(key,{orderId:r.orderId||"",transactionDate:r.transactionDate||"",payoutIds:new Set(),statuses:[],gross:0,fees:0,voucher:0,refund:0,net:0,variance:0,formulaComparable:false,rows:0}); const g=map.get(key); g.rows++; if(r.transactionDate && (!g.transactionDate || r.transactionDate<g.transactionDate)) g.transactionDate=r.transactionDate; if(r.payoutId) g.payoutIds.add(r.payoutId); if(r.paymentStatus) g.statuses.push(r.paymentStatus); g.gross+=r.gross||0; g.fees+=r.platformFees||0; g.voucher+=r.voucherCost||0; g.refund+=r.refundAmount||0; g.net+=r.netAmount||0; g.variance+=r.variance||0; g.formulaComparable=g.formulaComparable||r.formulaComparable; });
    return [...map.values()].map(g=>{ const cls=g.statuses.map(normalizeFinanceStatusV53); g.statusClass=cls.includes("paid")?"paid":cls.includes("pending")?"pending":"unknown"; g.statusLabel=g.statuses.filter(Boolean)[0]||(g.statusClass==="paid"?"Đã thanh toán":g.statusClass==="pending"?"Chờ thanh toán":"Chưa rõ"); return g; });
}
function buildFinancePayoutGroupsV53(){
    const map=new Map(); financeStateV53.rows.forEach((r,idx)=>{ const status=normalizeFinanceStatusV53(r.paymentStatus); const key=r.payoutId||r.payoutDate||`NO_BATCH_${status}`; if(!map.has(key)) map.set(key,{key,payoutId:r.payoutId||"",payoutDate:r.payoutDate||"",statusClass:status,statusLabel:r.paymentStatus||"",orders:new Set(),gross:0,fees:0,refund:0,net:0,rows:0}); const g=map.get(key); g.rows++; if(r.orderId)g.orders.add(r.orderId); if(r.payoutDate && (!g.payoutDate||r.payoutDate<g.payoutDate))g.payoutDate=r.payoutDate; if(g.statusClass==="unknown" && status!=="unknown")g.statusClass=status; if(!g.statusLabel&&r.paymentStatus)g.statusLabel=r.paymentStatus; g.gross+=r.gross||0;g.fees+=r.platformFees||0;g.refund+=(r.refundAmount||0)+(r.voucherCost||0);g.net+=r.netAmount||0; }); return [...map.values()].sort((a,b)=>String(b.payoutDate).localeCompare(String(a.payoutDate))); }
function buildFinanceIssuesV53(){
    const issues=[]; const financeOrders=new Set(financeStateV53.rows.map(r=>String(r.orderId||"").trim()).filter(Boolean)); const shopeeOrders=new Set(state.skuRows.map(r=>String(r.orderId||"").trim()).filter(Boolean));
    const missingOrderRows=financeStateV53.rows.filter(r=>!String(r.orderId||"").trim()); if(missingOrderRows.length) issues.push({level:"medium",type:"Thiếu Mã đơn",orderId:"—",amount:missingOrderRows.reduce((s,r)=>s+Math.abs(r.netAmount||0),0),detail:`${formatNumber(missingOrderRows.length)} dòng tài chính không có Mã đơn nên không thể ghép chính xác với Shopee.`});
    const unknown=[...financeOrders].filter(id=>!shopeeOrders.has(id)); unknown.slice(0,300).forEach(id=>{ const rows=financeStateV53.rows.filter(r=>r.orderId===id); issues.push({level:"medium",type:"Mã đơn không thấy trên Shopee Cloud",orderId:id,amount:rows.reduce((s,r)=>s+(r.netAmount||0),0),detail:"Mã đơn có trong file tài chính nhưng không có trong dữ liệu Shopee đang lưu."}); });
    const deliveredMap=new Map(); state.skuRows.forEach(r=>{ if(classifyInventoryShopeeStatus(r.status)!=="delivered")return; const id=String(r.orderId||"").trim(); if(!id)return; if(!deliveredMap.has(id))deliveredMap.set(id,{orderId:id,orderDate:r.sourceOrderDate||r.orderDate||"",status:r.status||"",qty:0,skus:new Map()}); const g=deliveredMap.get(id); g.qty+=Number(r.quantity||0); g.skus.set(r.sku,Number(g.skus.get(r.sku)||0)+Number(r.quantity||0)); });
    const deliveredMissing=[...deliveredMap.values()].filter(o=>!financeOrders.has(o.orderId)); deliveredMissing.slice(0,300).forEach(o=>issues.push({level:"info",type:"Đã giao chưa thấy tài chính",orderId:o.orderId,amount:0,detail:`Đơn đã giao ${o.orderDate?formatDateLabel(o.orderDate):""} nhưng chưa xuất hiện trong snapshot tài chính đang chọn.`}));
    const formula=buildFinanceOrderGroupsV53().filter(g=>g.formulaComparable&&Math.abs(g.variance)>1); formula.slice(0,300).forEach(g=>issues.push({level:"high",type:"Chênh công thức tiền",orderId:g.orderId||"—",amount:g.variance,detail:`Thực nhận lệch ${financeMoneyV53(g.variance)} so với công thức từ các cột đã nhận diện. Cần kiểm tra các cột phí/điều chỉnh còn thiếu.`}));
    return {issues,missingOrderRows,unknown,deliveredMissing,formula,deliveredMap};
}
function renderFinanceMappingV53(current){
    const box=$("financeMappingV53"); if(!box)return; if(!current){box.innerHTML="";return;} const labels={orderId:"Mã đơn",gross:"Tổng tiền",commissionFee:"Hoa hồng",serviceFee:"Dịch vụ",transactionFee:"Thanh toán",shippingFee:"Vận chuyển",voucherCost:"Voucher Seller",refundAmount:"Hoàn tiền",netAmount:"Thực nhận",payoutId:"Mã settlement",paymentStatus:"Trạng thái"}; box.innerHTML=Object.entries(labels).map(([k,l])=>{const v=current.mapping?.[k]||"";return `<span class="finance-v53-map-chip ${v?"":"missing"}"><b>${escapeHTML(l)}</b>${v?`→ ${escapeHTML(v)}`:"chưa nhận diện"}</span>`}).join("");
}
function renderFinanceFeeBreakdownV53(t){
    const box=$("financeFeeBreakdownV53");if(!box)return; const rows=[['Phí hoa hồng',t.commission],['Phí dịch vụ',t.service],['Phí thanh toán/giao dịch',t.transaction],['Phí vận chuyển',t.shipping],['Phí khác',t.other],['Voucher người bán',t.voucher],['Hoàn tiền',t.refund]]; const max=Math.max(1,...rows.map(x=>x[1])); box.innerHTML=rows.map(([name,val])=>`<div class="finance-v53-fee-row"><strong>${escapeHTML(name)}</strong><div class="finance-v53-fee-track"><div class="finance-v53-fee-bar" style="width:${Math.min(100,val/max*100)}%"></div></div><span class="finance-v53-fee-amount">${financeMoneyV53(val)}</span><span class="finance-v53-fee-rate">${t.gross?((val/t.gross)*100).toFixed(2):'0.00'}%</span></div>`).join("");
}
function renderFinanceQualityV53(current,issuesInfo){
    const box=$("financeQualityV53");if(!box)return; if(!current){box.innerHTML='<div class="empty-table">Chưa có snapshot.</div>';return;} const hasOrder=Boolean(current.mapping?.orderId); const hasNet=Boolean(current.mapping?.netAmount); const formula=issuesInfo.formula.length; box.innerHTML=`<div class="finance-v53-quality-item ${hasOrder?'':'warning'}"><div class="finance-v53-quality-icon">${hasOrder?'✓':'!'}</div><div><strong>${hasOrder?'Có Mã đơn để đối chiếu':'Chưa nhận diện Mã đơn'}</strong><span>${hasOrder?'Có thể so với dữ liệu đơn Shopee Cloud.':'Các bảng đối chiếu đơn sẽ bị hạn chế.'}</span></div></div><div class="finance-v53-quality-item ${hasNet?'':'warning'}"><div class="finance-v53-quality-icon">${hasNet?'✓':'!'}</div><div><strong>${hasNet?'Có cột Thực nhận':'Chưa nhận diện Thực nhận'}</strong><span>${hasNet?'Có thể tổng hợp số tiền settlement.':'Cần kiểm tra tên cột trong file.'}</span></div></div><div class="finance-v53-quality-item ${formula?'warning':''}"><div class="finance-v53-quality-icon">${formula?'!':'✓'}</div><div><strong>${formula?`${formatNumber(formula)} đơn chênh công thức`:'Chưa thấy chênh công thức rõ ràng'}</strong><span>Chỉ tính trên các cột hệ thống đã nhận diện; không thay thế đối soát chính thức.</span></div></div>`;
}
function renderFinanceOrdersV53(){
    const body=$("financeOrderBodyV53"),summary=$("financeOrderSummaryV53");if(!body)return; let rows=buildFinanceOrderGroupsV53(); const search=normalizeText($("financeOrderSearchV53")?.value||""); const status=$("financeOrderStatusV53")?.value||"all"; if(search)rows=rows.filter(g=>normalizeText(`${g.orderId} ${[...g.payoutIds].join(' ')} ${g.statusLabel}`).includes(search)); if(status!=="all")rows=rows.filter(g=>g.statusClass===status); if(summary)summary.textContent=`${formatNumber(rows.length)} nhóm đơn · ${formatNumber(financeStateV53.rows.length)} dòng tài chính`; if(!rows.length){body.innerHTML='<tr><td colspan="10" class="empty-table">Không có dữ liệu phù hợp.</td></tr>';return;} body.innerHTML=rows.map((g,i)=>`<tr><td>${i+1}</td><td><strong>${escapeHTML(g.orderId||'—')}</strong>${g.rows>1?`<div class="muted">${g.rows} dòng</div>`:''}</td><td>${g.transactionDate?formatDateLabel(g.transactionDate):'—'}</td><td class="finance-v53-money">${financeMoneyV53(g.gross)}</td><td class="finance-v53-money negative">${financeMoneyV53(g.fees)}</td><td>${financeMoneyV53(g.voucher)}</td><td>${financeMoneyV53(g.refund)}</td><td class="finance-v53-money">${financeMoneyV53(g.net)}</td><td>${escapeHTML([...g.payoutIds].join(', ')||'—')}</td><td><span class="finance-v53-status ${g.statusClass}">${escapeHTML(g.statusLabel||'Chưa rõ')}</span></td></tr>`).join("");
}
function renderFinancePaymentsV53(){
    const current=currentFinanceImportV53(); if($("financePaymentSnapshotV53"))$("financePaymentSnapshotV53").textContent=current?`${current.fileName} · ${formatNumber(financeStateV53.rows.length)} dòng · ${current.periodFrom?formatDateLabel(current.periodFrom):'—'} → ${current.periodTo?formatDateLabel(current.periodTo):'—'}`:'Chưa có snapshot tài chính.'; const groups=buildFinancePayoutGroupsV53(); const paidRows=financeStateV53.rows.filter(r=>normalizeFinanceStatusV53(r.paymentStatus)==='paid'),pendingRows=financeStateV53.rows.filter(r=>normalizeFinanceStatusV53(r.paymentStatus)==='pending'),unknownRows=financeStateV53.rows.filter(r=>normalizeFinanceStatusV53(r.paymentStatus)==='unknown'); const sum=a=>a.reduce((s,r)=>s+Number(r.netAmount||0),0); if($("financePayoutBatchCountV53"))$("financePayoutBatchCountV53").textContent=formatNumber(groups.length); if($("financePaidAmountV53"))$("financePaidAmountV53").textContent=financeMoneyV53(sum(paidRows)); if($("financePaidRowsV53"))$("financePaidRowsV53").textContent=`${formatNumber(paidRows.length)} dòng`; if($("financePendingAmountV53"))$("financePendingAmountV53").textContent=financeMoneyV53(sum(pendingRows)); if($("financePendingRowsV53"))$("financePendingRowsV53").textContent=`${formatNumber(pendingRows.length)} dòng`; if($("financeUnknownAmountV53"))$("financeUnknownAmountV53").textContent=financeMoneyV53(sum(unknownRows)); if($("financeUnknownRowsV53"))$("financeUnknownRowsV53").textContent=`${formatNumber(unknownRows.length)} dòng`; const body=$("financePayoutBodyV53"); if(body)body.innerHTML=groups.length?groups.map((g,i)=>`<tr><td>${i+1}</td><td><strong>${escapeHTML(g.payoutId||g.key||'—')}</strong></td><td>${g.payoutDate?formatDateLabel(g.payoutDate):'—'}</td><td><span class="finance-v53-status ${g.statusClass}">${escapeHTML(g.statusLabel||'Chưa rõ')}</span></td><td>${formatNumber(g.orders.size)}</td><td>${financeMoneyV53(g.gross)}</td><td>${financeMoneyV53(g.fees)}</td><td>${financeMoneyV53(g.refund)}</td><td class="finance-v53-money">${financeMoneyV53(g.net)}</td></tr>`).join(""):'<tr><td colspan="9" class="empty-table">Chưa có dữ liệu thanh toán.</td></tr>'; const missingBody=$("financeMissingPaymentBodyV53"),info=buildFinanceIssuesV53(); if(missingBody){const rows=[...info.deliveredMap.values()].filter(o=>!new Set(financeStateV53.rows.map(r=>r.orderId).filter(Boolean)).has(o.orderId)); missingBody.innerHTML=rows.length?rows.slice(0,300).map((o,i)=>`<tr><td>${i+1}</td><td><strong>${escapeHTML(o.orderId)}</strong></td><td>${o.orderDate?formatDateLabel(o.orderDate):'—'}</td><td>${escapeHTML(o.status||'Đã giao')}</td><td>${[...o.skus.entries()].map(([s,q])=>`${escapeHTML(s)} × ${formatNumber(q)}`).join('<br>')}</td><td><span class="finance-v53-status pending">Chưa thấy trong snapshot</span></td></tr>`).join(""):'<tr><td colspan="6" class="empty-table">Không có đơn đã giao bị thiếu trong phạm vi dữ liệu hiện có.</td></tr>';}
}
function renderFinanceIssuesV53(){
    const info=buildFinanceIssuesV53(); if($("financeIssueCountV53"))$("financeIssueCountV53").textContent=formatNumber(info.issues.length); if($("financeMissingOrderIdV53"))$("financeMissingOrderIdV53").textContent=formatNumber(info.missingOrderRows.length); if($("financeUnknownOrderV53"))$("financeUnknownOrderV53").textContent=formatNumber(info.unknown.length); if($("financeDeliveredMissingV53"))$("financeDeliveredMissingV53").textContent=formatNumber(info.deliveredMissing.length); if($("financeFormulaMismatchV53"))$("financeFormulaMismatchV53").textContent=formatNumber(info.formula.length); const body=$("financeIssueBodyV53"); if(body)body.innerHTML=info.issues.length?info.issues.slice(0,600).map((x,i)=>`<tr><td>${i+1}</td><td><span class="finance-v53-issue-level ${x.level}">${x.level==='high'?'CAO':x.level==='medium'?'CẦN XEM':'THÔNG TIN'}</span></td><td><strong>${escapeHTML(x.type)}</strong></td><td>${escapeHTML(x.orderId||'—')}</td><td class="finance-v53-money ${Number(x.amount)<0?'negative':''}">${x.amount?financeMoneyV53(x.amount):'—'}</td><td>${escapeHTML(x.detail||'')}</td></tr>`).join(""):'<tr><td colspan="6" class="empty-table">Chưa phát hiện cảnh báo tài chính từ snapshot hiện tại.</td></tr>';
}
function renderFinanceAllV53(){
    const current=currentFinanceImportV53(),t=financeTotalsV53(),feeTotal=t.commission+t.service+t.transaction+t.shipping+t.other,issuesInfo=buildFinanceIssuesV53(); const select=$("financeImportSelectV53"); if(select){select.innerHTML=financeStateV53.imports.length?financeStateV53.imports.map(x=>`<option value="${escapeHTML(x.id)}" ${x.id===financeStateV53.currentImportId?'selected':''}>${escapeHTML(x.fileName)} · ${x.periodFrom?formatDateLabel(x.periodFrom):'—'}${x.periodTo&&x.periodTo!==x.periodFrom?' → '+formatDateLabel(x.periodTo):''}</option>`).join(''):'<option value="">Chưa có snapshot</option>';}
    const notice=$("financeNoticeV53"); if(notice){notice.className='finance-v53-notice'+(current?' good':''); notice.innerHTML=current?`✓ Đang xem <strong>${escapeHTML(current.fileName)}</strong> · ${formatNumber(financeStateV53.rows.length)} dòng · upload ${current.importedAt?formatDateTimeVi(current.importedAt):'—'}${current.createdEmail?' · '+escapeHTML(current.createdEmail):''}`:'Chưa có dữ liệu tài chính. Hãy upload file thu nhập/đối soát của Shopee.';}
    if($("financeGrossV53"))$("financeGrossV53").textContent=financeMoneyV53(t.gross); if($("financeFeesV53"))$("financeFeesV53").textContent=financeMoneyV53(feeTotal); if($("financeDiscountV53"))$("financeDiscountV53").textContent=financeMoneyV53(t.voucher); if($("financeRefundV53"))$("financeRefundV53").textContent=financeMoneyV53(t.refund); if($("financeNetV53"))$("financeNetV53").textContent=financeMoneyV53(t.net); if($("financeFeeRateV53"))$("financeFeeRateV53").textContent=`Tỷ lệ phí: ${t.gross?((feeTotal/t.gross)*100).toFixed(2):'—'}%`;
    renderFinanceMappingV53(current); renderFinanceFeeBreakdownV53(t); renderFinanceQualityV53(current,issuesInfo); renderFinanceOrdersV53(); renderFinancePaymentsV53(); renderFinanceIssuesV53();
}

$("btnFinanceChooseV53")?.addEventListener("click",()=>$("financeFileInputV53")?.click());
$("financeFileInputV53")?.addEventListener("change",e=>importFinanceFileV53(e.target.files?.[0]));
$("btnFinanceRefreshV53")?.addEventListener("click",()=>loadFinanceCloudV53({silent:false}));
$("btnFinanceDeleteV53")?.addEventListener("click",deleteFinanceImportV53);
$("financeImportSelectV53")?.addEventListener("change",e=>selectFinanceImportV53(e.target.value));
$("financeOrderSearchV53")?.addEventListener("input",renderFinanceOrdersV53);
$("financeOrderStatusV53")?.addEventListener("change",renderFinanceOrdersV53);
$("btnOpenFinanceFromPaymentsV53")?.addEventListener("click",()=>openView("fees"));
$("btnOpenFinanceFromIssuesV53")?.addEventListener("click",()=>openView("fees"));

/* =========================================================
   V52 - DỰ BÁO TỒN KHO & ĐỀ XUẤT NHẬP HÀNG
========================================================= */
const inventoryForecastStateV52 = {
    filter: "all",
    search: ""
};

function inventoryDateToUtcV52(dateKey) {
    const parts = String(dateKey || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function inventoryDateDiffDaysV52(fromDate, toDate) {
    const a = inventoryDateToUtcV52(fromDate);
    const b = inventoryDateToUtcV52(toDate);
    if (a === null || b === null) return null;
    return Math.floor((b - a) / 86400000);
}

function inventoryAddDaysV52(dateKey, days) {
    const utc = inventoryDateToUtcV52(dateKey);
    if (utc === null) return "";
    const d = new Date(utc + Number(days || 0) * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}

function buildInventoryDemandHistoryV52() {
    const latestRows = getLatestDailyShopeeLinesForInventory();
    const demandByItem = new Map();
    let referenceDate = "";
    let earliestDate = "";

    latestRows.forEach(row => {
        const bucket = classifyInventoryShopeeStatus(row.status);

        // Tốc độ bán phục vụ nhập hàng: lấy đơn còn hiệu lực / đã giao,
        // bỏ Hủy và Hoàn đang về để tránh đề xuất nhập quá cao.
        if (!["reserved", "in_transit", "delivered"].includes(bucket)) return;

        const orderDate = String(row.orderDate || row.sourceOrderDate || "").trim();
        if (!orderDate) return;

        if (!referenceDate || orderDate > referenceDate) referenceDate = orderDate;
        if (!earliestDate || orderDate < earliestDate) earliestDate = orderDate;

        expandShopeeRowToInventorySkus(row).forEach(part => {
            const resolved = resolveInventoryItemFromTransit(row, part.baseSku);
            const item = resolved.item;
            if (!item?.itemCode) return;

            if (!demandByItem.has(item.itemCode)) {
                demandByItem.set(item.itemCode, new Map());
            }

            const daily = demandByItem.get(item.itemCode);
            daily.set(orderDate, Number(daily.get(orderDate) || 0) + Number(part.quantity || 0));
        });
    });

    if (!referenceDate) {
        referenceDate = inventoryState.transitSnapshot?.snapshotDate || getLatestSavedReportDate() || getLocalTodayKey();
    }

    return { demandByItem, referenceDate, earliestDate };
}

function inventoryWindowAverageV52(dailyMap, referenceDate, windowDays) {
    const entries = [...(dailyMap || new Map()).entries()]
        .filter(([date]) => date && date <= referenceDate)
        .sort((a,b) => a[0].localeCompare(b[0]));

    if (!entries.length || !referenceDate) {
        return { total: 0, average: 0, observedDays: 0, startDate: "" };
    }

    const windowStart = inventoryAddDaysV52(referenceDate, -(Number(windowDays || 1) - 1));
    const valid = entries.filter(([date]) => date >= windowStart && date <= referenceDate);
    if (!valid.length) {
        return { total: 0, average: 0, observedDays: 0, startDate: "" };
    }

    const firstDate = valid[0][0];
    const span = inventoryDateDiffDaysV52(firstDate, referenceDate);
    const observedDays = Math.max(1, Math.min(Number(windowDays || 1), Number(span ?? 0) + 1));
    const total = valid.reduce((sum, [,qty]) => sum + Number(qty || 0), 0);

    return {
        total,
        average: total / observedDays,
        observedDays,
        startDate: firstDate
    };
}

function inventoryForecastStatusV52(row) {
    if (row.available <= 0) {
        return { key: "urgent", label: "Hết / cần nhập ngay", detail: "Khả dụng LT đã bằng 0." };
    }

    if (row.velocity <= 0) {
        if (row.available <= row.safetyStock) {
            return { key: "reorder", label: "Dưới tồn an toàn", detail: "Chưa có tốc độ bán nhưng tồn đã thấp hơn ngưỡng an toàn." };
        }
        return { key: "nodata", label: "Chưa đủ dữ liệu bán", detail: "Chưa có đơn hợp lệ để tính tốc độ bán." };
    }

    if (row.daysCover <= row.leadTimeDays || row.available <= row.safetyStock) {
        return { key: "urgent", label: "Cần nhập ngay", detail: `Tồn chỉ đủ khoảng ${row.daysCover.toFixed(1)} ngày.` };
    }

    if (row.suggestedQty > 0) {
        return { key: "reorder", label: "Nên đặt hàng", detail: "Khả dụng đã chạm điểm đặt hàng." };
    }

    if (row.daysCover <= row.targetCoverDays) {
        return { key: "watch", label: "Theo dõi", detail: `Còn khoảng ${row.daysCover.toFixed(1)} ngày bán.` };
    }

    return { key: "ok", label: "Tồn ổn", detail: `Còn khoảng ${row.daysCover.toFixed(1)} ngày bán.` };
}

function buildInventoryForecastRowsV52() {
    const summary = buildInventorySummary();
    const demand = buildInventoryDemandHistoryV52();

    const rows = summary.map(item => {
        const daily = demand.demandByItem.get(item.itemCode) || new Map();
        const avg7 = inventoryWindowAverageV52(daily, demand.referenceDate, 7);
        const avg30 = inventoryWindowAverageV52(daily, demand.referenceDate, 30);

        // Ưu tiên nhịp bán gần đây nếu đang tăng; lấy max(7N, 30N) để tránh thiếu hàng.
        const velocity = Math.max(Number(avg7.average || 0), Number(avg30.average || 0));
        const available = Math.max(0, Number(item.available || 0));
        const safetyStock = Math.max(0, Number(item.safetyStock || 0));
        const leadTimeDays = Math.max(0, Number(item.leadTimeDays ?? 5));
        const targetCoverDays = Math.max(1, Number(item.targetCoverDays ?? 14));

        const daysCover = velocity > 0 ? available / velocity : null;
        const reorderPoint = velocity > 0
            ? Math.ceil(velocity * leadTimeDays + safetyStock)
            : safetyStock;
        const targetStock = velocity > 0
            ? Math.ceil(velocity * (leadTimeDays + targetCoverDays) + safetyStock)
            : safetyStock;

        let suggestedQty = 0;
        if (velocity > 0) {
            suggestedQty = available <= reorderPoint
                ? Math.max(0, Math.ceil(targetStock - available))
                : 0;
        } else if (available < safetyStock) {
            suggestedQty = Math.max(0, Math.ceil(safetyStock - available));
        }

        const row = {
            ...item,
            available,
            safetyStock,
            leadTimeDays,
            targetCoverDays,
            avg7,
            avg30,
            velocity,
            daysCover,
            reorderPoint,
            targetStock,
            suggestedQty,
            suggestedValue: suggestedQty * Number(item.unitPrice || 0)
        };

        row.forecastStatus = inventoryForecastStatusV52(row);
        return row;
    });

    return {
        rows,
        referenceDate: demand.referenceDate,
        earliestDate: demand.earliestDate
    };
}

function inventoryForecastDaysTextV52(days) {
    if (days === null || !Number.isFinite(days)) return "—";
    if (days >= 999) return ">999 ngày";
    return `${days.toFixed(days < 10 ? 1 : 0)} ngày`;
}

function inventoryForecastAverageTextV52(data) {
    if (!data?.observedDays) return '<span class="inventory-forecast-v52-no-data">—</span>';
    return `
        <strong>${Number(data.average || 0).toFixed(1)}</strong>
        <small>${formatNumber(data.total)} SP / ${formatNumber(data.observedDays)} ngày</small>
    `;
}

function renderInventoryForecastV52() {
    const body = $("inventoryForecastBodyV52");
    if (!body) return;

    const data = buildInventoryForecastRowsV52();
    const allRows = data.rows;

    const totals = allRows.reduce((acc,row) => {
        const key = row.forecastStatus?.key || "nodata";
        if (key === "urgent") acc.urgent++;
        else if (key === "reorder") acc.reorder++;
        else if (key === "watch") acc.watch++;
        else if (key === "ok") acc.ok++;
        else acc.nodata++;
        acc.qty += Number(row.suggestedQty || 0);
        acc.value += Number(row.suggestedValue || 0);
        return acc;
    }, {urgent:0,reorder:0,watch:0,ok:0,nodata:0,qty:0,value:0});

    if ($("inventoryForecastUrgentV52")) $("inventoryForecastUrgentV52").textContent = formatNumber(totals.urgent);
    if ($("inventoryForecastReorderV52")) $("inventoryForecastReorderV52").textContent = formatNumber(totals.reorder);
    if ($("inventoryForecastWatchV52")) $("inventoryForecastWatchV52").textContent = formatNumber(totals.watch);
    if ($("inventoryForecastOkV52")) $("inventoryForecastOkV52").textContent = formatNumber(totals.ok);
    if ($("inventoryForecastSuggestedQtyV52")) $("inventoryForecastSuggestedQtyV52").textContent = formatNumber(totals.qty);
    if ($("inventoryForecastSuggestedValueV52")) $("inventoryForecastSuggestedValueV52").textContent = inventoryMoney(totals.value);

    if ($("inventoryForecastReferenceV52")) {
        $("inventoryForecastReferenceV52").innerHTML = `<b>Ngày dữ liệu:</b> ${data.referenceDate ? formatDateLabel(data.referenceDate) : "—"}`;
    }

    if ($("inventoryForecastSubtitleV52")) {
        $("inventoryForecastSubtitleV52").textContent = data.referenceDate
            ? `Tính tới ${formatDateLabel(data.referenceDate)} · dùng đơn Shopee duy nhất theo Mã đơn + SKU · loại Đã hủy/Hoàn đang về.`
            : "Chưa có đủ dữ liệu Shopee để tính tốc độ bán.";
    }

    const filter = $("inventoryForecastFilterV52")?.value || inventoryForecastStateV52.filter || "all";
    const rawSearch = $("inventoryForecastSearchV52")?.value || inventoryForecastStateV52.search || "";
    const search = normalizeText(rawSearch);
    inventoryForecastStateV52.filter = filter;
    inventoryForecastStateV52.search = rawSearch;

    const rows = allRows.filter(row => {
        const filterOk = filter === "all" || row.forecastStatus?.key === filter;
        const searchOk = !search || normalizeText(`${row.itemCode} ${row.name} ${row.shopeeSku || ""}`).includes(search);
        return filterOk && searchOk;
    });

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="16" class="empty-table">Không có mặt hàng phù hợp bộ lọc hiện tại.</td></tr>';
        return;
    }

    const canEdit = hasPermissionV40("INVENTORY_WRITE");

    body.innerHTML = rows.map((row,index) => {
        const status = row.forecastStatus || {key:"nodata",label:"Chưa có dữ liệu",detail:""};
        return `
            <tr class="inventory-forecast-v52-row ${escapeHTML(status.key)}" data-v52-item="${escapeHTML(row.itemCode)}">
                <td>${index+1}</td>
                <td><strong>${escapeHTML(row.itemCode)}</strong></td>
                <td>
                    <strong class="inventory-forecast-v52-name">${escapeHTML(row.name)}</strong>
                    ${row.shopeeSku ? `<small>Shopee: ${escapeHTML(row.shopeeSku)}</small>` : '<small>Chưa map SKU Shopee</small>'}
                </td>
                <td class="center inventory-forecast-v52-available">${formatNumber(row.available)}</td>
                <td class="center inventory-forecast-v52-average">${inventoryForecastAverageTextV52(row.avg7)}</td>
                <td class="center inventory-forecast-v52-average">${inventoryForecastAverageTextV52(row.avg30)}</td>
                <td class="center"><strong>${row.velocity > 0 ? row.velocity.toFixed(1) : "—"}</strong><small>SP/ngày</small></td>
                <td class="center"><strong>${inventoryForecastDaysTextV52(row.daysCover)}</strong></td>
                <td class="center">
                    <input class="inventory-forecast-v52-setting" data-v52-setting="safetyStock" type="number" min="0" step="1" value="${Number(row.safetyStock || 0)}" ${canEdit ? "" : "disabled"}>
                </td>
                <td class="center">
                    <input class="inventory-forecast-v52-setting" data-v52-setting="leadTimeDays" type="number" min="0" max="365" step="1" value="${Number(row.leadTimeDays || 0)}" ${canEdit ? "" : "disabled"}>
                    <small>ngày</small>
                </td>
                <td class="center">
                    <input class="inventory-forecast-v52-setting" data-v52-setting="targetCoverDays" type="number" min="1" max="365" step="1" value="${Number(row.targetCoverDays || 14)}" ${canEdit ? "" : "disabled"}>
                    <small>ngày</small>
                </td>
                <td class="center"><strong>${formatNumber(row.reorderPoint)}</strong></td>
                <td class="center inventory-forecast-v52-suggested"><strong>${formatNumber(row.suggestedQty)}</strong></td>
                <td class="right"><strong>${inventoryMoney(row.suggestedValue)}</strong></td>
                <td class="center">
                    <span class="inventory-forecast-v52-status ${escapeHTML(status.key)}">${escapeHTML(status.label)}</span>
                    <small>${escapeHTML(status.detail)}</small>
                </td>
                <td class="center">
                    ${canEdit
                        ? `<button type="button" class="inventory-forecast-v52-save" data-v52-save="${escapeHTML(row.itemCode)}">💾 Lưu</button>`
                        : '<span class="inventory-forecast-v52-readonly">Chỉ ADMIN/KHO</span>'}
                </td>
            </tr>
        `;
    }).join("");
}

async function saveInventoryForecastSettingsV52(itemCode) {
    if (!requirePermissionV40("INVENTORY_WRITE")) return;

    const item = inventoryState.items.find(row => row.itemCode === itemCode);
    const tr = document.querySelector(`[data-v52-item="${CSS.escape(itemCode)}"]`);
    if (!item || !tr) return;

    const readValue = key => Number(tr.querySelector(`[data-v52-setting="${key}"]`)?.value || 0);
    const safetyStock = Math.max(0, Math.round(readValue("safetyStock")));
    const leadTimeDays = Math.max(0, Math.round(readValue("leadTimeDays")));
    const targetCoverDays = Math.max(1, Math.round(readValue("targetCoverDays")));

    item.safetyStock = safetyStock;
    item.leadTimeDays = leadTimeDays;
    item.targetCoverDays = targetCoverDays;

    try {
        if (inventoryState.cloudReady && state.user) {
            const client = initSupabaseClient();
            const { error } = await client
                .from(DB_INVENTORY_ITEMS)
                .upsert([inventoryStateToDbRow(item)], { onConflict: "item_code" });
            if (error) throw error;
        }

        saveInventoryLocal();
        renderInventoryModule();
        showToast(`Đã lưu cài đặt nhập hàng cho ${itemCode}.`);
    } catch (error) {
        console.error("V52 save forecast settings:", error);
        alert(error?.message || "Không lưu được cài đặt dự báo tồn kho.");
    }
}

function renderInventoryMovementTable() {
    const body = $("inventoryMovementBody");
    const summary = $("inventoryMovementSummary");
    if (!body || !summary) return;

    const filter = $("inventoryMovementFilter")?.value || "all";
    const search = normalizeText($("inventoryMovementSearch")?.value || "");
    let rows = inventoryState.movementRows?.length ? [...inventoryState.movementRows] : buildInventoryMovementRows();

    rows = rows.filter(row => {
        const statusOk = filter === "all" || row.bucket === filter;
        const searchOk = !search || normalizeText([
            row.orderId,row.rawSku,row.baseSku,row.itemName,row.status
        ].join(" ")).includes(search);
        return statusOk && searchOk;
    }).sort((a,b) => String(b.reportDate).localeCompare(String(a.reportDate)));

    summary.textContent = `${formatNumber(rows.length)} dòng sau khi lấy trạng thái mới nhất theo Mã đơn + SKU`;

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="10" class="empty-table">Không có dữ liệu phù hợp.</td></tr>';
        return;
    }

    body.innerHTML = rows.slice(0, 600).map((row,index) => `
        <tr>
            <td>${index+1}</td>
            <td><strong>${escapeHTML(row.orderId)}</strong></td>
            <td>${row.reportDate ? formatDateLabel(row.reportDate) : "-"}</td>
            <td>${row.sourceOrderDate ? formatDateLabel(row.sourceOrderDate) : "-"}</td>
            <td>${escapeHTML(row.rawSku)}</td>
            <td>${escapeHTML(row.baseSku)}</td>
            <td>${escapeHTML(row.itemName || "-")}</td>
            <td>${formatNumber(row.quantity)}</td>
            <td title="${escapeHTML(row.status)}">${escapeHTML(row.status)}</td>
            <td><span class="inventory-bucket-pill ${row.bucket}">${inventoryBucketLabel(row.bucket)}</span></td>
        </tr>
    `).join("");
}

function openInventoryEditor() {
    if (!inventoryState.loaded) loadInventoryLocal();
    renderInventoryEditor();
    $("inventoryEditorModal")?.classList.remove("hidden");
}

function closeInventoryEditor() {
    $("inventoryEditorModal")?.classList.add("hidden");
}

function renderInventoryEditor() {
    const body = $("inventoryEditorBody");
    if (!body) return;

    const latestDate = inventoryState.items.map(x => x.stocktakeDate).filter(Boolean).sort().reverse()[0] || getLocalTodayKey();
    if ($("inventoryStocktakeDate")) $("inventoryStocktakeDate").value = latestDate;

    body.innerHTML = inventoryState.items.map((item,index) => `
        <tr data-inventory-editor-row="${index}">
            <td>${index+1}</td>
            <td><input class="inventory-editor-input" data-field="itemCode" value="${escapeHTML(item.itemCode || "")}"></td>
            <td><input class="inventory-editor-input" data-field="name" value="${escapeHTML(item.name || "")}"></td>
            <td><input class="inventory-editor-input" data-field="shopeeSku" value="${escapeHTML(item.shopeeSku || "")}" placeholder="Không bắt buộc"></td>
            <td><input class="inventory-editor-input" data-field="invoiceKeyword" value="${escapeHTML(item.invoiceKeyword || "")}" placeholder="VD: REWD|TEST.1|Extra White..."></td>
            <td><input class="inventory-editor-input number" type="number" min="0" step="1" data-field="openingQty" value="${Number(item.openingQty || 0)}"></td>
            <td><input class="inventory-editor-input number" type="number" min="0" step="1" data-field="physicalQty" value="${Number(item.physicalQty || 0)}"></td>
            <td><input class="inventory-editor-input number" type="number" min="0" step="1" data-field="safetyStock" value="${Number(item.safetyStock || 0)}"></td>
            <td><input class="inventory-editor-input number" type="number" min="0" step="1000" data-field="unitPrice" value="${Number(item.unitPrice || 0)}"></td>
        </tr>
    `).join("");
}

function collectInventoryEditorItems() {
    const stocktakeDate = $("inventoryStocktakeDate")?.value || getLocalTodayKey();
    return [...document.querySelectorAll("[data-inventory-editor-row]")].map((row,index) => {
        const get = field => row.querySelector(`[data-field="${field}"]`)?.value ?? "";
        return {
            itemCode: String(get("itemCode")).trim() || `WH-CUSTOM-${Date.now()}-${index}`,
            name: String(get("name")).trim(),
            shopeeSku: String(get("shopeeSku")).trim(),
            invoiceKeyword: String(get("invoiceKeyword")).trim(),
            openingQty: Math.max(0, Number(get("openingQty")) || 0),
            physicalQty: Math.max(0, Number(get("physicalQty")) || 0),
            safetyStock: Math.max(0, Number(get("safetyStock")) || 0),
            unitPrice: Math.max(0, Number(get("unitPrice")) || 0),
            stocktakeDate,
            sortOrder: index + 1,
            active: true
        };
    }).filter(item => item.name);
}

function addInventoryEditorItem() {
    inventoryState.items.push({
        itemCode: `WH-CUSTOM-${Date.now()}`,
        name: "",
        shopeeSku: "",
        invoiceKeyword: "",
        openingQty: 0,
        physicalQty: 0,
        safetyStock: 0,
        unitPrice: 0,
        stocktakeDate: $("inventoryStocktakeDate")?.value || getLocalTodayKey(),
        sortOrder: inventoryState.items.length + 1,
        active: true
    });
    renderInventoryEditor();
}

async function saveInventoryEditor() {
    if (!requirePermissionV40("INVENTORY_WRITE")) return;

    const button = $("btnInventoryEditorSave");
    const items = collectInventoryEditorItems();
    if (!items.length) {
        alert("Hãy giữ ít nhất 1 mặt hàng tồn kho.");
        return;
    }

    button.disabled = true;
    button.textContent = "ĐANG LƯU...";
    try {
        inventoryState.items = items;
        await saveInventoryItems({ createStocktake: true });
        closeInventoryEditor();
        renderInventoryModule();
        showToast("Đã lưu tồn kho thực tế và tạo mốc kiểm kê.");
    } catch (error) {
        console.error(error);
        alert("Không lưu được tồn kho.\n\n" + (error?.message || ""));
    } finally {
        button.disabled = false;
        button.textContent = "💾 Lưu kiểm kê";
    }
}

async function readInventoryWorkbook(file) {
    if (typeof XLSX === "undefined") throw new Error("Không tải được thư viện Excel.");
    return new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const wb = XLSX.read(new Uint8Array(e.target.result), { type:"array", cellDates:true });
                const ws = wb.Sheets[wb.SheetNames[0]];
                resolve(XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:true}));
            } catch(err){ reject(err); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function parseInventoryWorkbook(matrix) {
    const headerIndex = matrix.findIndex(row => {
        const cells = (row || []).map(v => normalizeText(v));
        return cells.includes("tensp") && (cells.includes("toncuoi") || cells.includes("tonthucte"));
    });
    if (headerIndex < 0) throw new Error("Không tìm thấy dòng tiêu đề TÊN SP / TỒN CUỐI.");

    const headers = matrix[headerIndex].map(v => normalizeText(v));
    const cName = headers.findIndex(v => v === "tensp" || v === "tensanpham");
    const cOpening = headers.findIndex(v => v === "tondau");
    const cPhysical = headers.findIndex(v => v === "toncuoi" || v === "tonthucte");
    const cPrice = headers.findIndex(v => v === "dongia");

    let stocktakeDate = "";
    matrix.slice(0, headerIndex + 2).forEach((row, rIndex) => {
        (row || []).forEach((cell, cIndex) => {
            if (normalizeText(cell) === "tinhtoingay") {
                for (let j=cIndex+1;j<row.length;j++) {
                    if (row[j] !== "" && row[j] != null) {
                        stocktakeDate = normalizeOrderDate(row[j]);
                        break;
                    }
                }
                if (!stocktakeDate && matrix[rIndex+1]) {
                    for (const value of matrix[rIndex+1]) {
                        const d = normalizeOrderDate(value);
                        if (d) { stocktakeDate = d; break; }
                    }
                }
            }
        });
    });
    stocktakeDate = stocktakeDate || getLocalTodayKey();

    const rows = [];
    for (let i=headerIndex+1;i<matrix.length;i++) {
        const row = matrix[i] || [];
        const name = String(row[cName] ?? "").trim();
        if (!name || normalizeText(name).includes("tongkho")) continue;
        const physical = Math.max(0, Number(String(row[cPhysical] ?? 0).replace(/\./g, "").replace(/,/g, ".")) || 0);
        const opening = cOpening >= 0 ? Math.max(0, Number(String(row[cOpening] ?? 0).replace(/\./g, "").replace(/,/g, ".")) || 0) : 0;
        const price = cPrice >= 0 ? Math.max(0, Number(String(row[cPrice] ?? 0).replace(/\./g, "").replace(/,/g, ".")) || 0) : 0;
        rows.push({ name, openingQty: opening, physicalQty: physical, unitPrice: price, stocktakeDate });
    }
    if (!rows.length) throw new Error("Không đọc được mặt hàng tồn kho nào.");
    return { rows, stocktakeDate };
}

async function importInventoryExcel(file) {
    if (!requirePermissionV40("INVENTORY_WRITE")) {
        if ($("inventoryStockFileInput")) $("inventoryStockFileInput").value = "";
        return;
    }

    try {
        const matrix = await readInventoryWorkbook(file);
        const parsed = parseInventoryWorkbook(matrix);
        const existingByName = new Map(inventoryState.items.map(item => [normalizeText(item.name), item]));

        parsed.rows.forEach((row,index) => {
            const key = normalizeText(row.name);
            const existing = existingByName.get(key);
            if (existing) {
                existing.openingQty = row.openingQty;
                existing.physicalQty = row.physicalQty;
                if (row.unitPrice) existing.unitPrice = row.unitPrice;
                existing.stocktakeDate = parsed.stocktakeDate;
            } else {
                inventoryState.items.push({
                    itemCode: `WH-IMP-${Date.now()}-${index+1}`,
                    name: row.name, shopeeSku:"", invoiceKeyword:"",
                    openingQty:row.openingQty, physicalQty:row.physicalQty,
                    safetyStock:0, unitPrice:row.unitPrice, stocktakeDate:parsed.stocktakeDate,
                    sortOrder:inventoryState.items.length+1, active:true
                });
            }
        });

        const ok = confirm(`Đã đọc ${parsed.rows.length} mặt hàng, ngày kiểm kê ${formatDateLabel(parsed.stocktakeDate)}.\n\nLưu các số tồn này vào hệ thống?`);
        if (!ok) return;

        await saveInventoryItems({ createStocktake:true });
        renderInventoryModule();
        showToast(`Đã cập nhật tồn kho từ ${file.name}.`);
    } catch(error) {
        console.error(error);
        alert("Không đọc được file tồn kho.\n\n" + (error?.message || ""));
    } finally {
        if ($("inventoryStockFileInput")) $("inventoryStockFileInput").value = "";
    }
}

document.querySelectorAll("[data-inventory-tab]").forEach(button => {
    button.addEventListener("click", () => setInventoryTab(button.dataset.inventoryTab));
});

$("inventoryCurrentDate")?.addEventListener("change", event => {
    inventoryState.currentDate = event.target.value;
    renderInventoryCurrentStock();
});

$("inventoryReconcileDate")?.addEventListener("change", event => {
    inventoryState.reconcileDate = event.target.value;
    inventoryState.reconcileCounts = {};
    renderInventoryReconciliation();
});

$("btnInventoryAddTransaction")?.addEventListener("click", addInventoryTransactionFromForm);
$("inventoryTxFilter")?.addEventListener("change", renderInventoryTransactions);
$("btnInventoryClearCounts")?.addEventListener("click", clearInventoryReconcileCounts);
$("btnInventoryCommitReconcile")?.addEventListener("click", commitInventoryReconciliation);
// V48 - mở nhật ký khi bấm SKU / tên sản phẩm.
document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-inventory-ledger]");
    if (!trigger) return;
    const itemCode = trigger.getAttribute("data-inventory-ledger") || "";
    if (itemCode) openInventoryLedgerV48(itemCode);
});

document.querySelectorAll("[data-ledger-close]").forEach(node => node.addEventListener("click", closeInventoryLedgerV48));
$("inventoryLedgerAsOfDate")?.addEventListener("change", event => { inventoryLedgerStateV48.asOfDate = event.target.value || getLocalTodayKey(); renderInventoryLedgerV48(); });
$("inventoryLedgerTypeFilter")?.addEventListener("change", event => { inventoryLedgerStateV48.typeFilter = event.target.value || "all"; renderInventoryLedgerV48(); });
$("inventoryLedgerSearch")?.addEventListener("input", event => { inventoryLedgerStateV48.search = event.target.value || ""; renderInventoryLedgerV48(); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("inventoryLedgerModal")?.classList.contains("hidden")) closeInventoryLedgerV48(); });

$("btnInventoryOpenInvoiceV31")?.addEventListener("click", () => openView("invoice-stats"));

$("btnInventoryEdit")?.addEventListener("click", () => { if (requirePermissionV40("INVENTORY_WRITE")) openInventoryEditor(); });
$("btnInventoryEditorClose")?.addEventListener("click", closeInventoryEditor);
$("btnInventoryEditorCancel")?.addEventListener("click", closeInventoryEditor);
$("btnInventoryAddItem")?.addEventListener("click", () => { if (requirePermissionV40("INVENTORY_WRITE")) addInventoryEditorItem(); });
$("btnInventoryEditorSave")?.addEventListener("click", saveInventoryEditor);
$("inventoryEditorModal")?.addEventListener("click", e => { if (e.target === $("inventoryEditorModal")) closeInventoryEditor(); });
$("inventorySearchInput")?.addEventListener("input", renderInventoryModule);
$("inventoryAgingStatusFilter")?.addEventListener("change", event => {
    inventoryAgingStateV49.statusFilter = event.target.value || "all";
    renderInventoryOrderAgingV49();
});
$("inventoryAgingBucketFilter")?.addEventListener("change", event => {
    inventoryAgingStateV49.bucketFilter = event.target.value || "all";
    renderInventoryOrderAgingV49();
});
$("inventoryAgingSearch")?.addEventListener("input", event => {
    inventoryAgingStateV49.search = event.target.value || "";
    renderInventoryOrderAgingV49();
});
$("inventoryForecastFilterV52")?.addEventListener("change", event => {
    inventoryForecastStateV52.filter = event.target.value || "all";
    renderInventoryForecastV52();
});
$("inventoryForecastSearchV52")?.addEventListener("input", event => {
    inventoryForecastStateV52.search = event.target.value || "";
    renderInventoryForecastV52();
});
$("inventoryForecastBodyV52")?.addEventListener("click", event => {
    const button = event.target.closest("[data-v52-save]");
    if (!button) return;
    saveInventoryForecastSettingsV52(button.dataset.v52Save || "");
});
$("inventoryMovementFilter")?.addEventListener("change", renderInventoryMovementTable);
$("inventoryMovementSearch")?.addEventListener("input", renderInventoryMovementTable);
$("btnInventoryOpenInvoice")?.addEventListener("click", () => openView("invoice-stats"));
$("btnInventoryRefresh")?.addEventListener("click", async () => {
    try {
        if (state.user) await loadInventoryData();
        renderInventoryModule();
        showToast("Đã làm mới tồn kho và trạng thái luân chuyển.");
    } catch(error){ alert(error?.message || "Không làm mới được dữ liệu."); }
});
$("btnInventoryReconcileNowV36")?.addEventListener("click", () => {
    setInventoryTab("reconcile");
    setTimeout(() => $("inventoryTabReconcile")?.scrollIntoView({behavior:"smooth",block:"start"}), 50);
});
$("inventoryStockFileInput")?.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (file) importInventoryExcel(file);
});

$("inventoryTransitFileInput")?.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (file) processInventoryTransitUpload(file);
});

$("btnInventoryTransitChooseFile")?.addEventListener("click", () => {
    if (!requirePermissionV40("TRANSIT_UPLOAD")) return;
    $("inventoryTransitFileInput")?.click();
});

$("inventoryMisaFileInput")?.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) return;

    const info = $("inventoryMisaUploadInfo");
    if (info) {
        info.classList.add("loaded");
        info.innerHTML = `
            <div class="inventory-misa-upload-icon">🧾</div>
            <div class="inventory-misa-upload-copy">
                <strong>Đang đọc ${escapeHTML(file.name)}</strong>
                <span class="inventory-misa-upload-progress">Đang kiểm tra Số hóa đơn và tổng hợp số lượng đã phát hành...</span>
            </div>
            <div class="inventory-misa-upload-effect">
                <span>ẢNH HƯỞNG TỒN VẬT LÝ</span>
                <strong>0</strong>
                <small>Không trừ lần 2</small>
            </div>
        `;
    }

    handleInvoiceUpload(file);
});

$("btnInventoryMisaChooseFile")?.addEventListener("click", () => {
    if (!requirePermissionV40("UPLOAD_INVOICE")) return;
    $("inventoryMisaFileInput")?.click();
});

$("btnInventoryInvoiceHistoryV32")?.addEventListener("click", () => {
    if (typeof openInvoiceHistoryModal === "function") {
        openInvoiceHistoryModal();
    } else {
        openView("invoice-stats");
    }
});

/* ======================== V23 - THỐNG KÊ HÓA ĐƠN ======================== */
const INVOICE_STATS_STORAGE_KEY = "rucos_invoice_stats_v23";
const INVOICE_HISTORY_STORAGE_KEY = "rucos_invoice_history_v27";
const INVOICE_HISTORY_MAX_ITEMS = 200;

const invoiceState = {
    loadedFromStorage: false,
    fileName: "",
    importedAt: "",
    dateFrom: "",
    dateTo: "",
    sourceRowCount: 0,
    issuedLineCount: 0,
    unissuedLineCount: 0,
    invoiceCount: 0,
    currentHistoryId: "",

    // V41 - cột tham chiếu Mã đơn Shopee nếu file MISA có.
    orderRefHeader: "",
    orderRefLineCount: 0,

    rows: [],
    lineRows: []
};

const invoiceHistoryState = {
    loaded: false,
    cloudLoaded: false,
    syncing: false,
    lastCloudError: "",
    items: []
};

function invoiceMoney(value) {
    return `${formatNumber(Math.round(Number(value) || 0))} đ`;
}

function toInvoiceNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    const text = String(value ?? "").trim();

    if (!text) return 0;

    // File hóa đơn này chủ yếu là số nguyên tiền.
    // Loại bỏ khoảng trắng, dấu phân tách nghìn và ký tự tiền tệ.
    const cleaned = text
        .replace(/\s/g, "")
        .replace(/[^\d\-.,]/g, "");

    if (!cleaned) return 0;

    // Nếu có cả . và , thì coi dấu đứng cuối là dấu thập phân.
    if (cleaned.includes(".") && cleaned.includes(",")) {
        const lastDot = cleaned.lastIndexOf(".");
        const lastComma = cleaned.lastIndexOf(",");

        if (lastComma > lastDot) {
            return Number(
                cleaned.replace(/\./g, "").replace(",", ".")
            ) || 0;
        }

        return Number(cleaned.replace(/,/g, "")) || 0;
    }

    // Dữ liệu tiền VN thường là số nguyên; nhiều dấu . hoặc , là phân tách nghìn.
    const dotCount = (cleaned.match(/\./g) || []).length;
    const commaCount = (cleaned.match(/,/g) || []).length;

    if (dotCount > 1) return Number(cleaned.replace(/\./g, "")) || 0;
    if (commaCount > 1) return Number(cleaned.replace(/,/g, "")) || 0;

    // Với chuỗi 1,234 hoặc 1.234 coi là 1.234 nghìn.
    if (/^-?\d{1,3}[.,]\d{3}$/.test(cleaned)) {
        return Number(cleaned.replace(/[.,]/g, "")) || 0;
    }

    return Number(cleaned.replace(",", ".")) || 0;
}

function isInvoicePromotion(productName) {
    const n = normalizeText(productName);

    return (
        n.includes("hangkhuyenmaikhongthutien") ||
        n.includes("hangkhuyenmai") && n.includes("khongthutien")
    );
}

function findInvoiceHeaderIndex(headers, candidates) {
    const normalized = headers.map(header => normalizeText(header));

    for (const candidate of candidates) {
        const needle = normalizeText(candidate);
        const exact = normalized.indexOf(needle);

        if (exact >= 0) return exact;
    }

    for (const candidate of candidates) {
        const needle = normalizeText(candidate);
        const partial = normalized.findIndex(value =>
            value.includes(needle) || needle.includes(value)
        );

        if (partial >= 0) return partial;
    }

    return -1;
}

async function readInvoiceExcelFile(file) {
    if (typeof XLSX === "undefined") {
        throw new Error(
            "Không tải được thư viện đọc Excel. Hãy tải lại trang và kiểm tra Internet."
        );
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = event => {
            try {
                const data = new Uint8Array(event.target.result);

                const workbook = XLSX.read(data, {
                    type: "array",
                    cellDates: true
                });

                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];

                const matrix = XLSX.utils.sheet_to_json(sheet, {
                    header: 1,
                    defval: "",
                    raw: true
                });

                resolve({
                    matrix,
                    sheetName
                });
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}


function isIssuedMisaInvoiceLine(invoiceNo, taxStatus, invoiceStatus) {
    const number = String(invoiceNo || "").trim();
    if (!number) return false;

    const tax = normalizeText(taxStatus || "");
    const status = normalizeText(invoiceStatus || "");

    // Có số HĐ nhưng nếu báo hủy/không hợp lệ thì không được tính.
    if (
        status.includes("huy") ||
        status.includes("xoabo") ||
        tax.includes("khonghople") ||
        tax.includes("khonghople")
    ) {
        return false;
    }

    return true;
}


function detectInvoiceOrderRefColumnV41(headers) {
    const normalized = (headers || []).map(value => normalizeText(value));

    const strongAliases = [
        "Mã đơn Shopee",
        "Mã đơn hàng Shopee",
        "Shopee Order ID",
        "Shopee OrderID",
        "Order ID Shopee",
        "Mã đơn TMĐT",
        "Mã đơn thương mại điện tử"
    ];

    const genericAliases = [
        "Mã đơn hàng",
        "Mã đơn",
        "Order ID",
        "Mã tham chiếu đơn",
        "Mã đơn tham chiếu"
    ];

    for (const alias of strongAliases) {
        const needle = normalizeText(alias);
        const index = normalized.findIndex(value => value === needle);

        if (index >= 0) {
            return {
                index,
                header: String(headers[index] ?? "").trim(),
                source: "strong"
            };
        }
    }

    for (const alias of genericAliases) {
        const needle = normalizeText(alias);
        const index = normalized.findIndex(value => value === needle);

        if (index >= 0) {
            return {
                index,
                header: String(headers[index] ?? "").trim(),
                source: "generic"
            };
        }
    }

    // Chỉ cho phép partial match với alias Shopee rõ ràng.
    const partialIndex = normalized.findIndex(value =>
        (
            value.includes("shopee") &&
            (value.includes("madon") || value.includes("orderid"))
        )
    );

    if (partialIndex >= 0) {
        return {
            index: partialIndex,
            header: String(headers[partialIndex] ?? "").trim(),
            source: "strong"
        };
    }

    return {
        index: -1,
        header: "",
        source: ""
    };
}

function normalizeOrderReferenceV41(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/^['"`]+/, "")
        .replace(/\s+/g, "");
}


function parseInvoiceMatrix(matrix, fileName) {
    if (!Array.isArray(matrix) || !matrix.length) {
        throw new Error("File hóa đơn không có dữ liệu.");
    }

    // Header thường nằm ở dòng 5, nhưng quét để không phụ thuộc vị trí cố định.
    const headerRowIndex = matrix.findIndex(row => {
        const normalized = (row || []).map(value => normalizeText(value));

        return (
            normalized.includes("tenhang") &&
            normalized.includes("soluong")
        );
    });

    if (headerRowIndex < 0) {
        throw new Error(
            "Không tìm thấy dòng tiêu đề có cột “Tên hàng” và “Số lượng”."
        );
    }

    const headers = matrix[headerRowIndex] || [];
    const orderRefColumnV41 = detectInvoiceOrderRefColumnV41(headers);

    const col = {
        stt: findInvoiceHeaderIndex(headers, ["STT"]),
        invoiceNo: findInvoiceHeaderIndex(headers, ["Số hóa đơn", "Số HĐ"]),
        invoiceDate: findInvoiceHeaderIndex(headers, ["Ngày hóa đơn", "Ngày HĐ"]),
        productCode: findInvoiceHeaderIndex(headers, ["Mã hàng"]),
        productName: findInvoiceHeaderIndex(headers, ["Tên hàng"]),
        quantity: findInvoiceHeaderIndex(headers, ["Số lượng"]),
        vat: findInvoiceHeaderIndex(headers, ["Tiền thuế GTGT", "Thuế GTGT"]),
        payment: findInvoiceHeaderIndex(headers, ["Tổng tiền TT", "Tổng tiền thanh toán"]),
        taxStatus: findInvoiceHeaderIndex(headers, ["Trạng thái gửi CQT"]),
        promoFlag: findInvoiceHeaderIndex(headers, ["Hàng KM"]),
        invoiceStatus: findInvoiceHeaderIndex(headers, ["Trạng thái HĐ", "Trạng thái hóa đơn"]),
        orderRef: orderRefColumnV41.index
    };

    const requiredMissing = [];

    if (col.invoiceNo < 0) requiredMissing.push("Số hóa đơn");
    if (col.productName < 0) requiredMissing.push("Tên hàng");
    if (col.quantity < 0) requiredMissing.push("Số lượng");
    if (col.vat < 0) requiredMissing.push("Tiền thuế GTGT");
    if (col.payment < 0) requiredMissing.push("Tổng tiền TT");

    if (requiredMissing.length) {
        throw new Error(
            `File thiếu cột: ${requiredMissing.join(", ")}.`
        );
    }

    const sourceRows = [];
    const invoiceNumbers = new Set();
    const dateKeys = [];

    for (let i = headerRowIndex + 1; i < matrix.length; i++) {
        const row = matrix[i] || [];

        const sttValue = col.stt >= 0 ? row[col.stt] : "";
        const productName = String(row[col.productName] ?? "").trim();

        // Chỉ lấy dòng chi tiết thực tế; bỏ Tổng cộng, chữ ký, dòng trống...
        const numericStt =
            typeof sttValue === "number"
                ? sttValue
                : Number(String(sttValue).trim());

        if (!Number.isFinite(numericStt) || !productName) {
            continue;
        }

        const quantity = toInvoiceNumber(row[col.quantity]);

        // V25:
        // Chỉ giữ đúng dòng hàng hóa thực tế.
        // Các dòng cuối file như "(Ký, họ tên, đóng dấu)", "ĐỖ HỒNG NGỌC",
        // "Giám đốc" có thể vô tình nằm ở cột STT/Tên hàng nhưng Số lượng = 0.
        // Vì vậy loại bỏ toàn bộ dòng không có số lượng dương.
        if (!(quantity > 0)) {
            continue;
        }

        const promo = isInvoicePromotion(productName);

        // Quan trọng:
        // File nguồn dùng giá trị 25 ở vài ô tài chính của dòng KM.
        // Hàng khuyến mại không thu tiền phải đưa về 0 tiền.
        const vat = promo
            ? 0
            : toInvoiceNumber(row[col.vat]);

        const payment = promo
            ? 0
            : toInvoiceNumber(row[col.payment]);

        const preTax = payment - vat;

        const invoiceNo =
            col.invoiceNo >= 0
                ? String(row[col.invoiceNo] ?? "").trim()
                : "";

        const productCode =
            col.productCode >= 0
                ? String(row[col.productCode] ?? "").trim()
                : "";

        const dateKey =
            col.invoiceDate >= 0
                ? normalizeOrderDate(row[col.invoiceDate])
                : "";

        const taxStatus =
            col.taxStatus >= 0
                ? String(row[col.taxStatus] ?? "").trim()
                : "";

        const invoiceStatus =
            col.invoiceStatus >= 0
                ? String(row[col.invoiceStatus] ?? "").trim()
                : "";

        const promoFlag =
            col.promoFlag >= 0
                ? String(row[col.promoFlag] ?? "").trim()
                : "";

        const issued = isIssuedMisaInvoiceLine(
            invoiceNo,
            taxStatus,
            invoiceStatus
        );

        if (issued) {
            invoiceNumbers.add(invoiceNo);
            if (dateKey) dateKeys.push(dateKey);
        }

        const orderRef =
            col.orderRef >= 0
                ? String(row[col.orderRef] ?? "").trim()
                : "";

        sourceRows.push({
            invoiceNo,
            invoiceDate: dateKey,
            productCode,
            productName,
            quantity,
            vat,
            payment,
            preTax,
            promo,
            promoFlag,
            taxStatus,
            invoiceStatus,
            issued,

            // V41
            orderRef,
            orderRefSource: orderRef
                ? (orderRefColumnV41.source || "generic")
                : ""
        });
    }

    if (!sourceRows.length) {
        throw new Error(
            "Không tìm thấy dòng hàng hóa hợp lệ sau dòng tiêu đề."
        );
    }

    const issuedRows = sourceRows.filter(row => row.issued === true);

    if (!issuedRows.length) {
        throw new Error(
            "File có dữ liệu hàng hóa nhưng không có dòng nào có Số hóa đơn hợp lệ."
        );
    }

    const grouped = new Map();

    issuedRows.forEach(row => {
        const key = row.productName;

        if (!grouped.has(key)) {
            grouped.set(key, {
                productName: key,
                quantity: 0,
                vat: 0,
                payment: 0,
                preTax: 0,
                promo: row.promo
            });
        }

        const item = grouped.get(key);

        item.quantity += Number(row.quantity || 0);
        item.vat += Number(row.vat || 0);
        item.payment += Number(row.payment || 0);
        item.preTax += Number(row.preTax || 0);
        item.promo = item.promo || row.promo;
    });

    const rows = [...grouped.values()]
        .sort((a, b) =>
            a.productName.localeCompare(
                b.productName,
                "vi",
                { sensitivity: "base" }
            )
        );

    const uniqueDates = [...new Set(dateKeys)].sort();

    return {
        fileName,
        importedAt: new Date().toISOString(),
        dateFrom: uniqueDates[0] || "",
        dateTo: uniqueDates[uniqueDates.length - 1] || "",
        sourceRowCount: sourceRows.length,
        issuedLineCount: issuedRows.length,
        unissuedLineCount: sourceRows.length - issuedRows.length,
        invoiceCount: invoiceNumbers.size,

        // V41
        orderRefHeader: orderRefColumnV41.header || "",
        orderRefLineCount: issuedRows.filter(row =>
            Boolean(normalizeOrderReferenceV41(row.orderRef))
        ).length,

        rows,
        lineRows: sourceRows
    };
}

function saveInvoiceStatsLocal() {
    try {
        localStorage.setItem(
            INVOICE_STATS_STORAGE_KEY,
            JSON.stringify({
                fileName: invoiceState.fileName,
                importedAt: invoiceState.importedAt,
                dateFrom: invoiceState.dateFrom,
                dateTo: invoiceState.dateTo,
                sourceRowCount: invoiceState.sourceRowCount,
                issuedLineCount: invoiceState.issuedLineCount,
                unissuedLineCount: invoiceState.unissuedLineCount,
                invoiceCount: invoiceState.invoiceCount,
                currentHistoryId: invoiceState.currentHistoryId,
                orderRefHeader: invoiceState.orderRefHeader || "",
                orderRefLineCount: Number(invoiceState.orderRefLineCount || 0),
                rows: invoiceState.rows,
                lineRows: invoiceState.lineRows
            })
        );
    } catch (error) {
        console.warn("Không lưu được thống kê hóa đơn trên trình duyệt.", error);
    }
}

function ensureInvoiceStatsLoaded() {
    if (invoiceState.loadedFromStorage) return;

    invoiceState.loadedFromStorage = true;

    try {
        const saved = JSON.parse(
            localStorage.getItem(INVOICE_STATS_STORAGE_KEY) || "null"
        );

        if (!saved || !Array.isArray(saved.rows)) return;

        invoiceState.fileName = saved.fileName || "";
        invoiceState.importedAt = saved.importedAt || "";
        invoiceState.dateFrom = saved.dateFrom || "";
        invoiceState.dateTo = saved.dateTo || "";
        invoiceState.sourceRowCount = Number(saved.sourceRowCount || 0);
        invoiceState.issuedLineCount = Number(saved.issuedLineCount || 0);
        invoiceState.unissuedLineCount = Number(saved.unissuedLineCount || 0);
        invoiceState.invoiceCount = Number(saved.invoiceCount || 0);
        invoiceState.currentHistoryId = saved.currentHistoryId || "";
        invoiceState.orderRefHeader = saved.orderRefHeader || "";
        invoiceState.orderRefLineCount = Number(saved.orderRefLineCount || 0);
        invoiceState.rows = saved.rows.filter(item =>
            Number(item?.quantity || 0) > 0
        );
        invoiceState.lineRows = Array.isArray(saved.lineRows)
            ? saved.lineRows
            : [];

        // Nếu LocalStorage là dữ liệu của bản cũ, lưu lại bản đã làm sạch.
        if (invoiceState.rows.length !== saved.rows.length) {
            saveInvoiceStatsLocal();
        }
    } catch (error) {
        console.warn("Không đọc được thống kê hóa đơn đã lưu.", error);
    }
}


function createInvoiceHistoryId(importedAt = "") {
    const safeTime = importedAt || new Date().toISOString();

    return (
        "inv_" +
        safeTime.replace(/[^\d]/g, "") +
        "_" +
        Math.random().toString(36).slice(2, 8)
    );
}

function cloneInvoiceRows(rows) {
    return JSON.parse(JSON.stringify(Array.isArray(rows) ? rows : []));
}

function getInvoiceSnapshotTotals(rows) {
    return (Array.isArray(rows) ? rows : []).reduce(
        (acc, item) => {
            acc.quantity += Number(item.quantity || 0);
            acc.vat += Number(item.vat || 0);
            acc.payment += Number(item.payment || 0);
            acc.preTax += Number(item.preTax || 0);
            return acc;
        },
        { quantity: 0, vat: 0, payment: 0, preTax: 0 }
    );
}

function buildInvoiceHistoryItem(source = invoiceState) {
    const importedAt = source.importedAt || new Date().toISOString();
    const rows = cloneInvoiceRows(source.rows);
    const lineRows = cloneInvoiceRows(source.lineRows);
    const totals = getInvoiceSnapshotTotals(rows);

    return {
        id: source.currentHistoryId || createInvoiceHistoryId(importedAt),
        fileName: source.fileName || "",
        importedAt,
        dateFrom: source.dateFrom || "",
        dateTo: source.dateTo || "",
        sourceRowCount: Number(source.sourceRowCount || 0),
        issuedLineCount: Number(source.issuedLineCount || 0),
        unissuedLineCount: Number(source.unissuedLineCount || 0),
        invoiceCount: Number(source.invoiceCount || 0),
        orderRefHeader: source.orderRefHeader || "",
        orderRefLineCount: Number(source.orderRefLineCount || 0),
        productCount: rows.length,
        totalQuantity: totals.quantity,
        vatTotal: totals.vat,
        paymentTotal: totals.payment,
        preTaxTotal: totals.preTax,
        rows,
        lineRows
    };
}

function saveInvoiceHistoryLocal() {
    // V39: LocalStorage chỉ còn là CACHE dự phòng, Cloud mới là nguồn chính.
    try {
        const cacheItems = invoiceHistoryState.items
            .slice(0, INVOICE_HISTORY_MAX_ITEMS)
            .map(item => ({
                ...item,
                rows: Array.isArray(item.rows) ? item.rows : [],
                lineRows: Array.isArray(item.lineRows) ? item.lineRows : []
            }));

        localStorage.setItem(
            INVOICE_HISTORY_STORAGE_KEY,
            JSON.stringify(cacheItems)
        );
    } catch (error) {
        console.warn("Không lưu được cache lịch sử hóa đơn.", error);
    }
}

function setInvoiceHistoryCloudStatusV39(status, text) {
    const el = $("invoiceHistoryCloudStatus");
    if (!el) return;

    el.classList.remove("ok", "warning", "error", "checking");
    el.classList.add(status || "checking");
    el.textContent = text || "☁️ Cloud";
}

function ensureInvoiceHistoryLoaded() {
    if (invoiceHistoryState.loaded) return;

    invoiceHistoryState.loaded = true;

    try {
        const saved = JSON.parse(
            localStorage.getItem(INVOICE_HISTORY_STORAGE_KEY) || "[]"
        );

        invoiceHistoryState.items = Array.isArray(saved)
            ? saved
                .filter(item => item && item.id)
                .map(item => ({
                    ...item,
                    cloud: Boolean(item.cloud),
                    detailsLoaded:
                        Array.isArray(item.rows) &&
                        Array.isArray(item.lineRows) &&
                        (item.rows.length > 0 || item.lineRows.length > 0),
                    rows: Array.isArray(item.rows) ? item.rows : [],
                    lineRows: Array.isArray(item.lineRows) ? item.lineRows : []
                }))
            : [];
    } catch (error) {
        console.warn("Không đọc được cache lịch sử hóa đơn.", error);
        invoiceHistoryState.items = [];
    }

    // Dữ liệu bảng hiện tại của bản cũ vẫn được giữ làm nguồn migration.
    ensureInvoiceStatsLoaded();

    if (invoiceState.rows.length && invoiceState.fileName) {
        const existing = invoiceHistoryState.items.find(item =>
            item.fileName === invoiceState.fileName &&
            item.importedAt === invoiceState.importedAt
        );

        if (existing) {
            invoiceState.currentHistoryId = existing.id;
        } else {
            const seeded = buildInvoiceHistoryItem(invoiceState);
            seeded.cloud = false;
            seeded.detailsLoaded = true;
            invoiceHistoryState.items.unshift(seeded);
            invoiceState.currentHistoryId = seeded.id;
            saveInvoiceHistoryLocal();
            saveInvoiceStatsLocal();
        }
    }

    updateInvoiceHistoryCount();
}

function stableInvoiceLineForFingerprintV39(row) {
    return {
        invoiceNo: String(row?.invoiceNo || "").trim(),
        invoiceDate: String(row?.invoiceDate || "").trim(),
        productCode: String(row?.productCode || "").trim(),
        productName: String(row?.productName || "").trim(),
        quantity: Number(row?.quantity || 0),
        vat: Number(row?.vat || 0),
        payment: Number(row?.payment || 0),
        preTax: Number(row?.preTax || 0),
        promo: Boolean(row?.promo),
        issued: row?.issued !== false
    };
}

function buildInvoiceFingerprintPayloadV39(source) {
    const sourceLines = cloneInvoiceRows(source?.lineRows || []);

    const lines = sourceLines
        .map(stableInvoiceLineForFingerprintV39)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

    const payload = {
        dateFrom: source?.dateFrom || "",
        dateTo: source?.dateTo || "",
        invoiceCount: Number(source?.invoiceCount || 0),
        lines
    };

    // V41: chỉ thêm orderRefs khi file thật sự có mã đơn.
    // Nhờ vậy file V39 cũ không có mã đơn vẫn giữ fingerprint cũ,
    // tránh tạo lịch sử trùng chỉ vì nâng phiên bản.
    const orderRefs = sourceLines
        .map(row => normalizeOrderReferenceV41(row?.orderRef))
        .filter(Boolean)
        .sort();

    if (orderRefs.length) {
        payload.orderRefs = orderRefs;
    }

    return JSON.stringify(payload);
}

async function sha256TextV39(text) {
    if (globalThis.crypto?.subtle) {
        const bytes = new TextEncoder().encode(String(text || ""));
        const digest = await crypto.subtle.digest("SHA-256", bytes);

        return [...new Uint8Array(digest)]
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    // Fallback cho trình duyệt cũ - không dùng cho bảo mật, chỉ chống trùng dữ liệu.
    let hash = 2166136261;
    const input = String(text || "");

    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return `fallback_${(hash >>> 0).toString(16)}`;
}

async function buildInvoiceFingerprintV39(source) {
    return `invoice_v39_${await sha256TextV39(buildInvoiceFingerprintPayloadV39(source))}`;
}

function mapInvoiceImportFromCloudV39(row, existingDetail = null) {
    return {
        id: row.id,
        cloud: true,
        detailsLoaded: Boolean(existingDetail?.detailsLoaded),
        fileFingerprint: row.file_fingerprint || "",
        fileName: row.file_name || "",
        importedAt: row.imported_at || row.created_at || "",
        dateFrom: row.date_from || "",
        dateTo: row.date_to || "",
        sourceRowCount: Number(row.source_row_count || 0),
        issuedLineCount: Number(row.issued_line_count || 0),
        unissuedLineCount: Number(row.unissued_line_count || 0),
        invoiceCount: Number(row.invoice_count || 0),
        orderRefHeader: row.order_ref_header || "",
        orderRefLineCount: Number(row.order_ref_line_count || 0),
        productCount: Number(row.product_count || 0),
        totalQuantity: Number(row.total_quantity || 0),
        vatTotal: Number(row.vat_total || 0),
        paymentTotal: Number(row.payment_total || 0),
        preTaxTotal: Number(row.pre_tax_total || 0),
        createdEmail: row.created_email || "",
        rows: existingDetail?.detailsLoaded
            ? cloneInvoiceRows(existingDetail.rows)
            : [],
        lineRows: existingDetail?.detailsLoaded
            ? cloneInvoiceRows(existingDetail.lineRows)
            : []
    };
}

function invoiceGroupToCloudV39(item, index) {
    return {
        sortOrder: index + 1,
        productName: item.productName || "",
        quantity: Number(item.quantity || 0),
        vat: Number(item.vat || 0),
        payment: Number(item.payment || 0),
        preTax: Number(item.preTax || 0),
        promo: Boolean(item.promo)
    };
}

function invoiceLineToCloudV39(item, index) {
    return {
        sortOrder: index + 1,
        invoiceNo: item.invoiceNo || "",
        invoiceDate: item.invoiceDate || "",
        productCode: item.productCode || "",
        productName: item.productName || "",
        quantity: Number(item.quantity || 0),
        vat: Number(item.vat || 0),
        payment: Number(item.payment || 0),
        preTax: Number(item.preTax || 0),
        promo: Boolean(item.promo),
        promoFlag: item.promoFlag || "",
        taxStatus: item.taxStatus || "",
        invoiceStatus: item.invoiceStatus || "",
        issued: item.issued !== false,

        // V41
        orderRef: item.orderRef || "",
        orderRefSource: item.orderRefSource || ""
    };
}

async function saveInvoiceHistoryToCloudV39(item) {
    assertPermissionV40("UPLOAD_INVOICE");

    if (!state.user) {
        throw new Error("Chưa đăng nhập nên không thể lưu lịch sử hóa đơn lên Cloud.");
    }

    const client = initSupabaseClient();
    const fingerprint = item.fileFingerprint || await buildInvoiceFingerprintV39(item);

    const importPayload = {
        fileFingerprint: fingerprint,
        fileName: item.fileName || "",
        importedAt: item.importedAt || new Date().toISOString(),
        dateFrom: item.dateFrom || "",
        dateTo: item.dateTo || "",
        sourceRowCount: Number(item.sourceRowCount || 0),
        issuedLineCount: Number(item.issuedLineCount || 0),
        unissuedLineCount: Number(item.unissuedLineCount || 0),
        invoiceCount: Number(item.invoiceCount || 0),
        orderRefHeader: item.orderRefHeader || "",
        orderRefLineCount: Number(item.orderRefLineCount || 0),
        productCount: Number(item.productCount || item.rows?.length || 0),
        totalQuantity: Number(item.totalQuantity || 0),
        vatTotal: Number(item.vatTotal || 0),
        paymentTotal: Number(item.paymentTotal || 0),
        preTaxTotal: Number(item.preTaxTotal || 0)
    };

    const groups = (Array.isArray(item.rows) ? item.rows : [])
        .map(invoiceGroupToCloudV39);

    const lines = (Array.isArray(item.lineRows) ? item.lineRows : [])
        .map(invoiceLineToCloudV39);

    const { data, error } = await client.rpc("save_invoice_history", {
        p_import: importPayload,
        p_groups: groups,
        p_lines: lines
    });

    if (error) throw error;

    const result = data && typeof data === "object"
        ? data
        : {};

    return {
        id: String(result.id || ""),
        duplicate: Boolean(result.duplicate),
        fingerprint
    };
}

async function fetchInvoiceHistoryDetailsV39(historyId) {
    const client = initSupabaseClient();

    const [groupsResult, linesResult] = await Promise.all([
        client
            .from(DB_INVOICE_GROUPS)
            .select("*")
            .eq("import_id", historyId)
            .order("sort_order", { ascending: true }),

        client
            .from(DB_INVOICE_LINES)
            .select("*")
            .eq("import_id", historyId)
            .order("sort_order", { ascending: true })
    ]);

    if (groupsResult.error) throw groupsResult.error;
    if (linesResult.error) throw linesResult.error;

    const rows = (groupsResult.data || []).map(row => ({
        productName: row.product_name || "",
        quantity: Number(row.quantity || 0),
        vat: Number(row.vat || 0),
        payment: Number(row.payment || 0),
        preTax: Number(row.pre_tax || 0),
        promo: Boolean(row.promo)
    }));

    const lineRows = (linesResult.data || []).map(row => ({
        invoiceNo: row.invoice_no || "",
        invoiceDate: row.invoice_date || "",
        productCode: row.product_code || "",
        productName: row.product_name || "",
        quantity: Number(row.quantity || 0),
        vat: Number(row.vat || 0),
        payment: Number(row.payment || 0),
        preTax: Number(row.pre_tax || 0),
        promo: Boolean(row.promo),
        promoFlag: row.promo_flag || "",
        taxStatus: row.tax_status || "",
        invoiceStatus: row.invoice_status || "",
        issued: row.issued !== false,

        // V41
        orderRef: row.order_ref || "",
        orderRefSource: row.order_ref_source || ""
    }));

    return { rows, lineRows };
}

async function migrateLocalInvoiceHistoryToCloudV39(localItems) {
    if (!state.user || !localItems.length) return { migrated: 0, duplicates: 0, failed: 0 };

    let migrated = 0;
    let duplicates = 0;
    let failed = 0;

    for (const localItem of localItems) {
        if (!Array.isArray(localItem.rows) || !localItem.rows.length) continue;

        try {
            const result = await saveInvoiceHistoryToCloudV39(localItem);
            if (result.duplicate) duplicates++;
            else migrated++;
        } catch (error) {
            failed++;
            console.warn("Không migrate được lịch sử hóa đơn cũ:", localItem.fileName, error);
        }
    }

    return { migrated, duplicates, failed };
}

async function syncInvoiceHistoryCloudV39({
    migrateLocal = false,
    loadLatestIfEmpty = false
} = {}) {
    ensureInvoiceHistoryLoaded();

    if (!state.user || invoiceHistoryState.syncing) return;

    invoiceHistoryState.syncing = true;
    invoiceHistoryState.lastCloudError = "";
    setInvoiceHistoryCloudStatusV39("checking", "☁️ Đang đồng bộ Cloud");

    const localBeforeCloud = invoiceHistoryState.items.filter(item =>
        !item.cloud && Array.isArray(item.rows) && item.rows.length
    );

    try {
        if (
            migrateLocal &&
            localBeforeCloud.length &&
            hasPermissionV40("UPLOAD_INVOICE")
        ) {
            await migrateLocalInvoiceHistoryToCloudV39(localBeforeCloud);
        }

        const client = initSupabaseClient();
        const { data, error } = await client
            .from(DB_INVOICE_IMPORTS)
            .select("*")
            .order("imported_at", { ascending: false })
            .limit(INVOICE_HISTORY_MAX_ITEMS);

        if (error) throw error;

        const oldById = new Map(
            invoiceHistoryState.items.map(item => [item.id, item])
        );

        invoiceHistoryState.items = (data || []).map(row =>
            mapInvoiceImportFromCloudV39(row, oldById.get(row.id))
        );

        invoiceHistoryState.cloudLoaded = true;
        invoiceHistoryState.lastCloudError = "";

        // Đồng bộ currentHistoryId nếu cache local đang trỏ vào cùng file/ngày.
        if (invoiceState.rows.length && !invoiceState.currentHistoryId) {
            const match = invoiceHistoryState.items.find(item =>
                item.fileName === invoiceState.fileName &&
                item.dateFrom === invoiceState.dateFrom &&
                item.dateTo === invoiceState.dateTo &&
                Number(item.invoiceCount || 0) === Number(invoiceState.invoiceCount || 0)
            );

            if (match) invoiceState.currentHistoryId = match.id;
        }

        saveInvoiceHistoryLocal();
        updateInvoiceHistoryCount();
        renderInvoiceHistory();

        setInvoiceHistoryCloudStatusV39(
            "ok",
            `☁️ Cloud · ${formatNumber(invoiceHistoryState.items.length)} bản`
        );

        if (
            loadLatestIfEmpty &&
            !invoiceState.rows.length &&
            invoiceHistoryState.items.length
        ) {
            await loadInvoiceHistoryItem(
                invoiceHistoryState.items[0].id,
                { closeModal: false, silent: true }
            );
        }
    } catch (error) {
        invoiceHistoryState.cloudLoaded = false;
        invoiceHistoryState.lastCloudError = error?.message || "Không đồng bộ được Cloud.";

        setInvoiceHistoryCloudStatusV39(
            "error",
            "☁️ Lỗi Cloud - đang dùng cache máy"
        );

        console.error("Invoice history Cloud V39:", error);
    } finally {
        invoiceHistoryState.syncing = false;
        updateInvoiceHistoryCount();
    }
}

async function addCurrentInvoiceToHistory() {
    ensureInvoiceHistoryLoaded();

    if (!invoiceState.rows.length) return null;

    invoiceState.currentHistoryId = createInvoiceHistoryId(invoiceState.importedAt);

    const item = buildInvoiceHistoryItem(invoiceState);
    item.cloud = false;
    item.detailsLoaded = true;
    item.fileFingerprint = await buildInvoiceFingerprintV39(item);

    if (state.user) {
        const result = await saveInvoiceHistoryToCloudV39(item);

        if (!result.id) {
            throw new Error("Cloud không trả về ID lịch sử hóa đơn.");
        }

        invoiceState.currentHistoryId = result.id;
        item.id = result.id;
        item.cloud = true;
        item.fileFingerprint = result.fingerprint;

        // Nếu fingerprint đã tồn tại thì tuyệt đối không tạo bản thứ hai.
        if (result.duplicate) {
            await syncInvoiceHistoryCloudV39({ migrateLocal: false });

            const existing = invoiceHistoryState.items.find(row => row.id === result.id);
            if (existing) {
                existing.rows = cloneInvoiceRows(item.rows);
                existing.lineRows = cloneInvoiceRows(item.lineRows);
                existing.detailsLoaded = true;
                invoiceState.importedAt = existing.importedAt || invoiceState.importedAt;
                invoiceState.fileName = existing.fileName || invoiceState.fileName;
            }

            saveInvoiceStatsLocal();
            saveInvoiceHistoryLocal();
            updateInvoiceHistoryCount();

            return {
                item: existing || item,
                duplicate: true
            };
        }
    }

    invoiceHistoryState.items = invoiceHistoryState.items.filter(row => row.id !== item.id);
    invoiceHistoryState.items.unshift(item);
    invoiceHistoryState.items = invoiceHistoryState.items.slice(0, INVOICE_HISTORY_MAX_ITEMS);

    saveInvoiceHistoryLocal();
    saveInvoiceStatsLocal();
    updateInvoiceHistoryCount();

    if (state.user) {
        setInvoiceHistoryCloudStatusV39(
            "ok",
            `☁️ Cloud · ${formatNumber(invoiceHistoryState.items.length)} bản`
        );
    }

    return {
        item,
        duplicate: false
    };
}

function updateInvoiceHistoryCount() {
    const count = invoiceHistoryState.items.length;

    if ($("invoiceHistoryCount")) {
        $("invoiceHistoryCount").textContent = formatNumber(count);
    }
}

function formatInvoiceHistoryDateTime(isoValue) {
    const date = new Date(isoValue || "");

    if (Number.isNaN(date.getTime())) {
        return { date: "-", time: "-" };
    }

    return {
        date: date.toLocaleDateString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }),
        time: date.toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        })
    };
}

function formatInvoiceSourceDateRange(item) {
    if (!item?.dateFrom && !item?.dateTo) return "-";

    if (item.dateFrom && item.dateTo && item.dateFrom !== item.dateTo) {
        return `${formatDateLabel(item.dateFrom)} → ${formatDateLabel(item.dateTo)}`;
    }

    return formatDateLabel(item.dateFrom || item.dateTo);
}

function renderInvoiceHistory() {
    ensureInvoiceHistoryLoaded();

    const body = $("invoiceHistoryBody");
    const search = normalizeText($("invoiceHistorySearch")?.value || "");

    if (!body) return;

    const filtered = invoiceHistoryState.items.filter(item => {
        if (!search) return true;

        const dateTime = formatInvoiceHistoryDateTime(item.importedAt);
        const haystack = normalizeText([
            item.fileName,
            item.createdEmail,
            dateTime.date,
            dateTime.time,
            formatInvoiceSourceDateRange(item)
        ].join(" "));

        return haystack.includes(search);
    });

    if ($("invoiceHistorySummary")) {
        $("invoiceHistorySummary").textContent =
            `${formatNumber(filtered.length)} / ${formatNumber(invoiceHistoryState.items.length)} bản lịch sử`;
    }

    updateInvoiceHistoryCount();

    if (!filtered.length) {
        body.innerHTML = `
            <tr>
                <td colspan="9" class="empty-table">
                    ${invoiceHistoryState.items.length
                        ? "Không tìm thấy lịch sử phù hợp."
                        : "Chưa có lịch sử thống kê hóa đơn trên Cloud."}
                </td>
            </tr>
        `;
        return;
    }

    body.innerHTML = filtered.map((item, index) => {
        const dt = formatInvoiceHistoryDateTime(item.importedAt);
        const isCurrent = item.id === invoiceState.currentHistoryId;

        return `
            <tr class="${isCurrent ? "invoice-history-current" : ""}">
                <td>${index + 1}</td>
                <td>${escapeHTML(dt.date)}</td>
                <td><strong>${escapeHTML(dt.time)}</strong></td>
                <td>${escapeHTML(formatInvoiceSourceDateRange(item))}</td>

                <td title="${escapeHTML(item.fileName)}">
                    ${escapeHTML(item.fileName)}
                    ${item.cloud
                        ? '<span class="invoice-history-cloud-badge">CLOUD</span>'
                        : '<span class="invoice-history-local-badge">CACHE</span>'}
                    ${isCurrent
                        ? '<span class="invoice-history-current-badge cloud">ĐANG XEM</span>'
                        : ""}
                </td>

                <td>${formatNumber(item.invoiceCount || 0)}</td>
                <td><strong>${formatNumber(item.totalQuantity || 0)}</strong></td>
                <td class="invoice-history-money">${invoiceMoney(item.paymentTotal || 0)}</td>

                <td>
                    <div class="invoice-history-actions">
                        <button
                            type="button"
                            class="invoice-history-view-btn"
                            data-invoice-history-view="${escapeHTML(item.id)}"
                        >
                            👁 Xem chi tiết
                        </button>

                        <button
                            type="button"
                            class="invoice-history-delete-btn"
                            data-invoice-history-delete="${escapeHTML(item.id)}"
                        >
                            🗑 Xóa
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    document.querySelectorAll("[data-invoice-history-view]").forEach(button => {
        button.addEventListener("click", async () => {
            await loadInvoiceHistoryItem(button.dataset.invoiceHistoryView);
        });
    });

    document.querySelectorAll("[data-invoice-history-delete]").forEach(button => {
        button.addEventListener("click", async () => {
            await deleteInvoiceHistoryItem(button.dataset.invoiceHistoryDelete);
        });
    });

    applyRoleUiV40();
}

async function openInvoiceHistoryModal() {
    ensureInvoiceHistoryLoaded();

    if ($("invoiceHistorySearch")) {
        $("invoiceHistorySearch").value = "";
    }

    renderInvoiceHistory();
    $("invoiceHistoryModal")?.classList.remove("hidden");

    if (state.user) {
        await syncInvoiceHistoryCloudV39({ migrateLocal: true });
    }
}

function closeInvoiceHistoryModal() {
    $("invoiceHistoryModal")?.classList.add("hidden");
}

async function loadInvoiceHistoryItem(historyId, options = {}) {
    ensureInvoiceHistoryLoaded();

    const item = invoiceHistoryState.items.find(row => row.id === historyId);

    if (!item) {
        alert("Không tìm thấy bản lịch sử này.");
        return;
    }

    if (item.cloud && !item.detailsLoaded) {
        setInvoiceHistoryCloudStatusV39("checking", "☁️ Đang tải chi tiết...");

        try {
            const detail = await fetchInvoiceHistoryDetailsV39(historyId);
            item.rows = detail.rows;
            item.lineRows = detail.lineRows;
            item.detailsLoaded = true;
            saveInvoiceHistoryLocal();
            setInvoiceHistoryCloudStatusV39(
                "ok",
                `☁️ Cloud · ${formatNumber(invoiceHistoryState.items.length)} bản`
            );
        } catch (error) {
            setInvoiceHistoryCloudStatusV39("error", "☁️ Không tải được chi tiết");
            alert("Không tải được chi tiết lịch sử từ Cloud.\n\n" + (error?.message || ""));
            return;
        }
    }

    invoiceState.loadedFromStorage = true;
    invoiceState.currentHistoryId = item.id;
    invoiceState.fileName = item.fileName || "";
    invoiceState.importedAt = item.importedAt || "";
    invoiceState.dateFrom = item.dateFrom || "";
    invoiceState.dateTo = item.dateTo || "";
    invoiceState.sourceRowCount = Number(item.sourceRowCount || 0);
    invoiceState.issuedLineCount = Number(item.issuedLineCount || 0);
    invoiceState.unissuedLineCount = Number(item.unissuedLineCount || 0);
    invoiceState.invoiceCount = Number(item.invoiceCount || 0);
    invoiceState.orderRefHeader = item.orderRefHeader || "";
    invoiceState.orderRefLineCount = Number(item.orderRefLineCount || 0);
    invoiceState.rows = cloneInvoiceRows(item.rows);
    invoiceState.lineRows = cloneInvoiceRows(item.lineRows || []);

    if ($("invoiceSearchInput")) {
        $("invoiceSearchInput").value = "";
    }

    saveInvoiceStatsLocal();
    renderInvoiceStats();
    renderInvoiceHistory();

    if (options.closeModal !== false) {
        closeInvoiceHistoryModal();
    }

    const info = $("invoiceFileInfo");
    const dt = formatInvoiceHistoryDateTime(item.importedAt);

    if (info) {
        info.classList.add("history-viewing");
        info.innerHTML +=
            ` · <strong>Đang xem Cloud ${escapeHTML(dt.date)} ${escapeHTML(dt.time)}</strong>`;
    }

    if (!options.silent) {
        showToast(`Đang xem lịch sử Cloud ${dt.date} ${dt.time}.`);
    }
}

async function verifyAdminAndDeleteInvoiceHistoryV39(historyId, password) {
    assertPermissionV40("DELETE_INVOICE");

    if (!password) throw new Error("Hãy nhập mật khẩu admin.");

    const adminEmail = String(state.user?.email || "").trim();
    if (!adminEmail) throw new Error("Không xác định được tài khoản admin đang đăng nhập.");

    const adminClient = createAdminVerificationClient();

    try {
        const { data, error: loginError } = await adminClient.auth.signInWithPassword({
            email: adminEmail,
            password
        });

        if (loginError || !data?.user) {
            throw new Error("Mật khẩu admin không đúng.");
        }

        const { data: context, error: contextError } =
            await adminClient.rpc("app_user_context");

        if (contextError) throw contextError;

        const role = normalizeRoleV40(
            (Array.isArray(context) ? context[0] : context)?.role
        );

        if (role !== "ADMIN") {
            throw new Error("Tài khoản xác thực không có vai trò ADMIN.");
        }

        const { data: result, error } = await adminClient.rpc(
            "admin_delete_invoice_history",
            { p_import_id: historyId }
        );

        if (error) throw error;
        return result;
    } finally {
        await adminClient.auth.signOut().catch(() => {});
    }
}

async function deleteInvoiceHistoryItem(historyId) {
    if (!requirePermissionV40("DELETE_INVOICE")) return;
    ensureInvoiceHistoryLoaded();

    const item = invoiceHistoryState.items.find(row => row.id === historyId);
    if (!item) return;

    const dt = formatInvoiceHistoryDateTime(item.importedAt);

    const ok = confirm(
        `Xóa bản lịch sử hóa đơn trên CLOUD?\n\n` +
        `Ngày upload: ${dt.date}\n` +
        `Giờ: ${dt.time}\n` +
        `File: ${item.fileName}\n\n` +
        `Sau khi xóa, các máy khác cũng không còn thấy bản này.`
    );

    if (!ok) return;

    const password = prompt(
        `Nhập mật khẩu ADMIN (${state.user?.email || "-"}) để xác nhận xóa:`
    );

    if (password === null) return;

    try {
        if (item.cloud) {
            await verifyAdminAndDeleteInvoiceHistoryV39(historyId, password);
        } else {
            // Cache cũ chưa migrate: vẫn xác thực admin trước khi xóa local.
            const adminClient = createAdminVerificationClient();
            const { data, error } = await adminClient.auth.signInWithPassword({
                email: state.user?.email || "",
                password
            });
            await adminClient.auth.signOut().catch(() => {});
            if (error || !data?.user) throw new Error("Mật khẩu admin không đúng.");
        }

        invoiceHistoryState.items = invoiceHistoryState.items.filter(
            row => row.id !== historyId
        );

        if (invoiceState.currentHistoryId === historyId) {
            invoiceState.currentHistoryId = "";
            invoiceState.fileName = "";
            invoiceState.importedAt = "";
            invoiceState.dateFrom = "";
            invoiceState.dateTo = "";
            invoiceState.sourceRowCount = 0;
            invoiceState.issuedLineCount = 0;
            invoiceState.unissuedLineCount = 0;
            invoiceState.invoiceCount = 0;
            invoiceState.orderRefHeader = "";
            invoiceState.orderRefLineCount = 0;
            invoiceState.rows = [];
            invoiceState.lineRows = [];
            saveInvoiceStatsLocal();
            renderInvoiceStats();
        }

        saveInvoiceHistoryLocal();

        if (state.user) {
            await syncInvoiceHistoryCloudV39({ migrateLocal: false });
        } else {
            renderInvoiceHistory();
        }

        updateInvoiceHistoryCount();
        showToast(`Đã xóa lịch sử ${dt.date} ${dt.time}.`);
    } catch (error) {
        console.error("Delete invoice history V39:", error);
        alert("Không xóa được lịch sử.\n\n" + (error?.message || ""));
    }
}

function getInvoiceTotals() {
    return invoiceState.rows.reduce(
        (acc, item) => {
            acc.quantity += Number(item.quantity || 0);
            acc.vat += Number(item.vat || 0);
            acc.payment += Number(item.payment || 0);
            acc.preTax += Number(item.preTax || 0);
            return acc;
        },
        {
            quantity: 0,
            vat: 0,
            payment: 0,
            preTax: 0
        }
    );
}



/* =========================================================
   V50 - CẦU NỐI MÃ ĐƠN SHOPEE ↔ SỐ HÓA ĐƠN MISA
========================================================= */

const invoiceOrderLinkStateV50 = {
    items: [],
    loaded: false,
    cloudReady: false,
    bridgeFileName: "",
    suggestions: []
};

function normalizeInvoiceNoV50(value) {
    const raw = String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/^['"`]+/, "")
        .replace(/\s+/g, "");

    if (/^\d+$/.test(raw)) {
        return raw.replace(/^0+(?=\d)/, "");
    }

    return raw;
}

function sourceLabelV50(source) {
    const map = {
        bridge_excel: "File cầu nối",
        manual: "Thủ công",
        suggestion_confirmed: "Gợi ý đã xác nhận",
        misa_direct: "MISA trực tiếp"
    };
    return map[source] || source || "—";
}

function sourceClassV50(source) {
    if (source === "manual") return "manual";
    if (source === "suggestion_confirmed") return "suggestion";
    return "bridge";
}

function mapInvoiceOrderLinkCloudV50(row) {
    return {
        id: String(row?.id || ""),
        orderId: String(row?.shopee_order_id || "").trim(),
        normalizedOrderId: normalizeOrderReferenceV41(row?.shopee_order_id),
        invoiceNo: String(row?.invoice_no || "").trim(),
        normalizedInvoiceNo: normalizeInvoiceNoV50(row?.invoice_no),
        invoiceDate: row?.invoice_date || "",
        source: row?.source || "manual",
        confidence: row?.confidence || "confirmed",
        note: row?.note || "",
        createdEmail: row?.created_email || "",
        createdAt: row?.created_at || "",
        updatedAt: row?.updated_at || ""
    };
}

async function loadInvoiceOrderLinksV50({ silent = false } = {}) {
    if (!state.user) return [];

    try {
        const client = initSupabaseClient();
        const { data, error } = await client
            .from(DB_INVOICE_ORDER_LINKS)
            .select("*")
            .order("updated_at", { ascending: false });

        if (error) throw error;

        invoiceOrderLinkStateV50.items = (data || []).map(mapInvoiceOrderLinkCloudV50);
        invoiceOrderLinkStateV50.loaded = true;
        invoiceOrderLinkStateV50.cloudReady = true;

        renderInvoiceOrderLinksV50();
    renderFinanceAllV53();
        renderInvoiceStats();

        if (!silent) {
            showToast(`Đã đồng bộ ${formatNumber(invoiceOrderLinkStateV50.items.length)} liên kết hóa đơn.`);
        }

        return invoiceOrderLinkStateV50.items;
    } catch (error) {
        invoiceOrderLinkStateV50.cloudReady = false;
        invoiceOrderLinkStateV50.loaded = true;
        console.warn("V50 không tải được invoice_order_links:", error);

        const box = $("v50LinkStatus");
        if (box) {
            box.className = "v50-link-status error";
            box.textContent = `Chưa đọc được bảng invoice_order_links. Hãy chạy SQL V50 trước. ${error?.message || ""}`;
        }

        if (!silent) {
            alert("Chưa đọc được bảng cầu nối V50. Hãy chạy SQL_V50_INVOICE_ORDER_LINKS.sql trong Supabase trước.");
        }
        return [];
    }
}

async function saveInvoiceOrderLinkV50(link) {
    if (!requirePermissionV40("MANAGE_INVOICE_LINKS")) return null;

    const orderId = String(link?.orderId || "").trim();
    const invoiceNo = String(link?.invoiceNo || "").trim();

    if (!orderId || !invoiceNo) {
        throw new Error("Mã đơn Shopee và Số hóa đơn là bắt buộc.");
    }

    const client = initSupabaseClient();
    const payload = {
        shopee_order_id: orderId,
        invoice_no: invoiceNo,
        invoice_date: link?.invoiceDate || null,
        source: link?.source || "manual",
        confidence: link?.confidence || "confirmed",
        note: link?.note || "",
        created_email: state.user?.email || "",
        updated_at: new Date().toISOString()
    };

    const { data, error } = await client
        .from(DB_INVOICE_ORDER_LINKS)
        .upsert(payload, { onConflict: "shopee_order_id" })
        .select("*")
        .single();

    if (error) throw error;

    const saved = mapInvoiceOrderLinkCloudV50(data);
    const existingIndex = invoiceOrderLinkStateV50.items.findIndex(item =>
        item.normalizedOrderId === saved.normalizedOrderId
    );

    if (existingIndex >= 0) {
        invoiceOrderLinkStateV50.items.splice(existingIndex, 1, saved);
    } else {
        invoiceOrderLinkStateV50.items.unshift(saved);
    }

    invoiceOrderLinkStateV50.cloudReady = true;
    renderInvoiceOrderLinksV50();
    renderInvoiceStats();
    return saved;
}

async function deleteInvoiceOrderLinkV50(id) {
    if (!requirePermissionV40("MANAGE_INVOICE_LINKS")) return;
    if (!id) return;

    if (!confirm("Xóa liên kết Mã đơn Shopee ↔ Số hóa đơn này?")) return;

    const client = initSupabaseClient();
    const { error } = await client
        .from(DB_INVOICE_ORDER_LINKS)
        .delete()
        .eq("id", id);

    if (error) throw error;

    invoiceOrderLinkStateV50.items = invoiceOrderLinkStateV50.items.filter(item => item.id !== id);
    renderInvoiceOrderLinksV50();
    renderInvoiceStats();
    showToast("Đã xóa liên kết hóa đơn.");
}

function findBridgeHeaderIndexV50(headers, aliases) {
    const normalized = (headers || []).map(value => normalizeText(value));

    for (const alias of aliases) {
        const needle = normalizeText(alias);
        const exact = normalized.indexOf(needle);
        if (exact >= 0) return exact;
    }

    for (const alias of aliases) {
        const needle = normalizeText(alias);
        const partial = normalized.findIndex(value =>
            value && needle && (value.includes(needle) || needle.includes(value))
        );
        if (partial >= 0) return partial;
    }

    return -1;
}

function parseBridgeMatrixV50(matrix) {
    const orderAliases = [
        "Mã đơn Shopee", "Mã đơn hàng Shopee", "Shopee Order ID",
        "Order ID Shopee", "Mã đơn hàng", "Mã đơn"
    ];
    const invoiceAliases = [
        "Số hóa đơn", "Số HĐ", "Invoice No", "Invoice Number", "Số HD"
    ];
    const dateAliases = ["Ngày hóa đơn", "Ngày HĐ", "Invoice Date"];
    const noteAliases = ["Ghi chú", "Note", "Diễn giải"];

    let headerRowIndex = -1;
    let columns = null;

    for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 40); rowIndex++) {
        const headers = matrix[rowIndex] || [];
        const orderCol = findBridgeHeaderIndexV50(headers, orderAliases);
        const invoiceCol = findBridgeHeaderIndexV50(headers, invoiceAliases);

        if (orderCol >= 0 && invoiceCol >= 0) {
            headerRowIndex = rowIndex;
            columns = {
                order: orderCol,
                invoice: invoiceCol,
                date: findBridgeHeaderIndexV50(headers, dateAliases),
                note: findBridgeHeaderIndexV50(headers, noteAliases)
            };
            break;
        }
    }

    if (headerRowIndex < 0 || !columns) {
        throw new Error("Không tìm thấy đồng thời cột Mã đơn Shopee và Số hóa đơn trong file cầu nối.");
    }

    const rawRows = [];
    for (let i = headerRowIndex + 1; i < matrix.length; i++) {
        const row = matrix[i] || [];
        const orderId = String(row[columns.order] ?? "").trim();
        const invoiceNo = String(row[columns.invoice] ?? "").trim();

        if (!orderId && !invoiceNo) continue;
        if (!orderId || !invoiceNo) continue;

        rawRows.push({
            orderId,
            invoiceNo,
            invoiceDate: columns.date >= 0 ? normalizeOrderDate(row[columns.date]) : "",
            note: columns.note >= 0 ? String(row[columns.note] ?? "").trim() : ""
        });
    }

    const orderCounter = new Map();
    const invoiceCounter = new Map();

    rawRows.forEach(row => {
        const orderKey = normalizeOrderReferenceV41(row.orderId);
        const invoiceKey = normalizeInvoiceNoV50(row.invoiceNo);
        if (!orderCounter.has(orderKey)) orderCounter.set(orderKey, new Set());
        if (!invoiceCounter.has(invoiceKey)) invoiceCounter.set(invoiceKey, new Set());
        orderCounter.get(orderKey).add(invoiceKey);
        invoiceCounter.get(invoiceKey).add(orderKey);
    });

    const seen = new Set();
    const valid = [];
    let conflicts = 0;

    rawRows.forEach(row => {
        const orderKey = normalizeOrderReferenceV41(row.orderId);
        const invoiceKey = normalizeInvoiceNoV50(row.invoiceNo);
        const pairKey = `${orderKey}|${invoiceKey}`;
        if (seen.has(pairKey)) return;
        seen.add(pairKey);

        if (
            !orderKey || !invoiceKey ||
            orderCounter.get(orderKey)?.size !== 1 ||
            invoiceCounter.get(invoiceKey)?.size !== 1
        ) {
            conflicts++;
            return;
        }

        valid.push(row);
    });

    return { valid, conflicts, sourceCount: rawRows.length };
}

async function handleBridgeFileV50(file) {
    if (!file) return;
    if (!requirePermissionV40("MANAGE_INVOICE_LINKS")) return;

    try {
        const { matrix } = await readInvoiceExcelFile(file);
        const parsed = parseBridgeMatrixV50(matrix);

        if (!parsed.valid.length) {
            throw new Error("File không có cặp Mã đơn Shopee ↔ Số hóa đơn hợp lệ để lưu.");
        }

        const knownOrderIds = new Set(
            (state.skuRows || [])
                .map(row => normalizeOrderReferenceV41(row.orderId))
                .filter(Boolean)
        );

        let saved = 0;
        let unknownOrders = 0;
        let failed = 0;

        for (const row of parsed.valid) {
            if (!knownOrderIds.has(normalizeOrderReferenceV41(row.orderId))) {
                unknownOrders++;
                continue;
            }

            try {
                await saveInvoiceOrderLinkV50({
                    ...row,
                    source: "bridge_excel",
                    confidence: "confirmed",
                    note: row.note || `Import từ ${file.name}`
                });
                saved++;
            } catch (error) {
                console.warn("Không lưu được bridge row:", row, error);
                failed++;
            }
        }

        invoiceOrderLinkStateV50.bridgeFileName = file.name;
        await loadInvoiceOrderLinksV50({ silent: true });

        alert(
            `Đã đọc file cầu nối: ${file.name}\n\n` +
            `• Cặp đọc được: ${parsed.sourceCount}\n` +
            `• Đã lưu: ${saved}\n` +
            `• Mã đơn chưa có trong Shopee Cloud: ${unknownOrders}\n` +
            `• Cặp xung đột 1↔1 đã bỏ qua: ${parsed.conflicts}\n` +
            `• Lỗi lưu: ${failed}`
        );
    } catch (error) {
        console.error("Lỗi file cầu nối V50:", error);
        alert(`Không đọc/lưu được file cầu nối.\n\n${error?.message || error}`);
    } finally {
        if ($("v50BridgeFileInput")) $("v50BridgeFileInput").value = "";
    }
}

function getInvoiceGroupsForSuggestionsV50() {
    const map = new Map();

    getIssuedMisaLines().forEach(line => {
        const invoiceNo = String(line.invoiceNo || "").trim();
        const key = normalizeInvoiceNoV50(invoiceNo);
        if (!key) return;

        if (!map.has(key)) {
            map.set(key, {
                invoiceNo,
                normalizedInvoiceNo: key,
                invoiceDate: line.invoiceDate || "",
                qtyBySku: new Map(),
                unresolved: 0
            });
        }

        const group = map.get(key);
        if (line.invoiceDate && (!group.invoiceDate || line.invoiceDate < group.invoiceDate)) {
            group.invoiceDate = line.invoiceDate;
        }

        const resolved = v41ResolveMisaBaseSku(line);
        if (!resolved.sku) {
            group.unresolved++;
            return;
        }

        group.qtyBySku.set(
            resolved.sku,
            Number(group.qtyBySku.get(resolved.sku) || 0) + Number(line.quantity || 0)
        );
    });

    return [...map.values()];
}

function compositionSignatureV50(qtyBySku) {
    return [...(qtyBySku || new Map()).entries()]
        .filter(([, qty]) => Number(qty || 0) !== 0)
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
        .map(([sku, qty]) => `${String(sku).trim().toUpperCase()}:${Number(qty || 0)}`)
        .join("|");
}

function dateDiffDaysV50(fromKey, toKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromKey || "") || !/^\d{4}-\d{2}-\d{2}$/.test(toKey || "")) {
        return null;
    }
    const from = new Date(`${fromKey}T00:00:00Z`);
    const to = new Date(`${toKey}T00:00:00Z`);
    return Math.round((to - from) / 86400000);
}

function buildInvoiceLinkSuggestionsV50() {
    if (!invoiceState.lineRows?.length) return [];

    const lookbackDays = Math.max(3, Number($("v41LookbackDays")?.value || 7));
    const allOrders = buildShopeeDeliveredOrdersV41();
    const scopeOrders = v41GetScopeDeliveredOrders(allOrders, lookbackDays);
    const invoiceGroups = getInvoiceGroupsForSuggestionsV50();

    const linkedOrders = new Set(invoiceOrderLinkStateV50.items.map(item => item.normalizedOrderId));
    const linkedInvoices = new Set(invoiceOrderLinkStateV50.items.map(item => item.normalizedInvoiceNo));

    const availableInvoices = invoiceGroups.filter(group =>
        !linkedInvoices.has(group.normalizedInvoiceNo) &&
        !group.unresolved &&
        compositionSignatureV50(group.qtyBySku)
    );

    const suggestions = [];

    scopeOrders.forEach(order => {
        if (linkedOrders.has(order.normalizedOrderId)) return;

        const signature = compositionSignatureV50(order.expectedBySku);
        if (!signature) return;

        const candidates = availableInvoices.filter(group => {
            if (compositionSignatureV50(group.qtyBySku) !== signature) return false;

            const diff = dateDiffDaysV50(order.orderDate, group.invoiceDate);
            if (diff === null) return true;
            return diff >= 0 && diff <= Math.max(lookbackDays, 10);
        });

        if (!candidates.length) return;

        suggestions.push({
            order,
            signature,
            candidates: candidates.sort((a, b) => {
                const da = dateDiffDaysV50(order.orderDate, a.invoiceDate);
                const db = dateDiffDaysV50(order.orderDate, b.invoiceDate);
                return (da ?? 999) - (db ?? 999);
            }),
            unique: candidates.length === 1
        });
    });

    return suggestions;
}

function compositionHtmlV50(qtyBySku) {
    const entries = [...(qtyBySku || new Map()).entries()];
    if (!entries.length) return '<span class="v50-empty-detail">—</span>';
    return `<div class="v50-composition">${entries.map(([sku, qty]) =>
        `<span>${escapeHTML(sku)} × ${formatNumber(qty)}</span>`
    ).join("")}</div>`;
}

function renderInvoiceOrderLinksV50() {
    const status = $("v50LinkStatus");
    const body = $("v50LinkTableBody");
    const suggestionBody = $("v50SuggestionBody");
    if (!body || !suggestionBody) return;

    const allOrders = buildShopeeDeliveredOrdersV41();
    const currentInvoiceNos = new Set(getIssuedMisaLines().map(line => normalizeInvoiceNoV50(line.invoiceNo)).filter(Boolean));

    const linkedOrderCount = invoiceOrderLinkStateV50.items.filter(item => allOrders.has(item.normalizedOrderId)).length;
    const linkedInvoiceCount = invoiceOrderLinkStateV50.items.filter(item => currentInvoiceNos.has(item.normalizedInvoiceNo)).length;

    invoiceOrderLinkStateV50.suggestions = buildInvoiceLinkSuggestionsV50();

    if ($("v50LinkCount")) $("v50LinkCount").textContent = formatNumber(invoiceOrderLinkStateV50.items.length);
    if ($("v50LinkedOrderCount")) $("v50LinkedOrderCount").textContent = formatNumber(linkedOrderCount);
    if ($("v50LinkedInvoiceCount")) $("v50LinkedInvoiceCount").textContent = formatNumber(linkedInvoiceCount);
    if ($("v50SuggestionCount")) $("v50SuggestionCount").textContent = formatNumber(invoiceOrderLinkStateV50.suggestions.length);

    if (status) {
        if (!invoiceOrderLinkStateV50.cloudReady) {
            status.className = "v50-link-status warning";
            status.textContent = "Chưa sẵn sàng Cloud V50. Nếu vừa nâng cấp, hãy chạy SQL V50 rồi bấm Đồng bộ liên kết.";
        } else {
            status.className = "v50-link-status good";
            status.textContent = `✓ Cloud V50 sẵn sàng · ${formatNumber(invoiceOrderLinkStateV50.items.length)} liên kết đã lưu` +
                (invoiceOrderLinkStateV50.bridgeFileName ? ` · File cầu nối gần nhất: ${invoiceOrderLinkStateV50.bridgeFileName}` : "") + ".";
        }
    }

    const search = normalizeText($("v50LinkSearch")?.value || "");
    const filtered = invoiceOrderLinkStateV50.items.filter(item =>
        !search || normalizeText(`${item.orderId} ${item.invoiceNo} ${item.createdEmail} ${item.note}`).includes(search)
    );

    if (!filtered.length) {
        body.innerHTML = '<tr><td colspan="7" class="empty-table">Chưa có liên kết phù hợp.</td></tr>';
    } else {
        body.innerHTML = filtered.map((item, index) => `
            <tr>
                <td>${index + 1}</td>
                <td><span class="v50-code">${escapeHTML(item.orderId)}</span></td>
                <td><span class="v50-code">${escapeHTML(item.invoiceNo)}</span></td>
                <td>${item.invoiceDate ? escapeHTML(formatDateLabel(item.invoiceDate)) : "—"}</td>
                <td><span class="v50-source-badge ${sourceClassV50(item.source)}">${escapeHTML(sourceLabelV50(item.source))}</span></td>
                <td>${escapeHTML(item.createdEmail || "—")}</td>
                <td>
                    <div class="v50-row-actions">
                        ${hasPermissionV40("MANAGE_INVOICE_LINKS") ? `<button type="button" class="v50-mini-btn danger" data-v50-delete-link="${escapeHTML(item.id)}">Xóa</button>` : ""}
                    </div>
                </td>
            </tr>
        `).join("");
    }

    const suggestions = invoiceOrderLinkStateV50.suggestions.slice(0, 100);
    if (!suggestions.length) {
        suggestionBody.innerHTML = '<tr><td colspan="6" class="empty-table">Không có gợi ý ghép đơn duy nhất trong phạm vi đang xem.</td></tr>';
    } else {
        suggestionBody.innerHTML = suggestions.map(item => {
            const first = item.candidates[0];
            return `
                <tr>
                    <td><span class="v50-code">${escapeHTML(item.order.orderId)}</span></td>
                    <td>${item.order.orderDate ? escapeHTML(formatDateLabel(item.order.orderDate)) : "—"}</td>
                    <td>${compositionHtmlV50(item.order.expectedBySku)}</td>
                    <td>
                        ${item.unique
                            ? `<span class="v50-code">${escapeHTML(first.invoiceNo)}</span>`
                            : `<span class="v50-candidate-badge ambiguous">${item.candidates.length} hóa đơn giống nhau</span>`}
                    </td>
                    <td>${item.unique && first.invoiceDate ? escapeHTML(formatDateLabel(first.invoiceDate)) : "—"}</td>
                    <td>
                        ${item.unique
                            ? `<button type="button" class="v50-mini-btn confirm" data-v50-confirm-suggestion="${escapeHTML(item.order.normalizedOrderId)}">✓ Xác nhận</button>`
                            : `<span class="v50-candidate-badge ambiguous">Cần chọn thủ công</span>`}
                    </td>
                </tr>
            `;
        }).join("");
    }
}

function openManualLinkModalV50(prefill = {}) {
    if (!requirePermissionV40("MANAGE_INVOICE_LINKS")) return;
    if ($("v50ManualOrderId")) $("v50ManualOrderId").value = prefill.orderId || "";
    if ($("v50ManualInvoiceNo")) $("v50ManualInvoiceNo").value = prefill.invoiceNo || "";
    if ($("v50ManualInvoiceDate")) $("v50ManualInvoiceDate").value = prefill.invoiceDate || "";
    if ($("v50ManualNote")) $("v50ManualNote").value = prefill.note || "";
    if ($("v50ManualError")) {
        $("v50ManualError").textContent = "";
        $("v50ManualError").classList.remove("show");
    }
    $("v50ManualLinkModal")?.classList.remove("hidden");
    setTimeout(() => $("v50ManualOrderId")?.focus(), 20);
}

function closeManualLinkModalV50() {
    $("v50ManualLinkModal")?.classList.add("hidden");
}

async function saveManualLinkModalV50() {
    const errorBox = $("v50ManualError");
    try {
        const orderId = $("v50ManualOrderId")?.value.trim() || "";
        const invoiceNo = $("v50ManualInvoiceNo")?.value.trim() || "";
        const invoiceDate = $("v50ManualInvoiceDate")?.value || "";
        const note = $("v50ManualNote")?.value.trim() || "";

        if (!orderId || !invoiceNo) {
            throw new Error("Phải nhập Mã đơn Shopee và Số hóa đơn.");
        }

        const knownOrder = (state.skuRows || []).some(row =>
            normalizeOrderReferenceV41(row.orderId) === normalizeOrderReferenceV41(orderId)
        );
        if (!knownOrder) {
            throw new Error("Mã đơn này chưa có trong dữ liệu Shopee Cloud đang lưu.");
        }

        await saveInvoiceOrderLinkV50({
            orderId,
            invoiceNo,
            invoiceDate,
            note,
            source: "manual",
            confidence: "confirmed"
        });

        closeManualLinkModalV50();
        showToast("Đã lưu liên kết Mã đơn ↔ Số hóa đơn.");
    } catch (error) {
        if (errorBox) {
            errorBox.textContent = error?.message || String(error);
            errorBox.classList.add("show");
        }
    }
}

$("v50BridgeFileInput")?.addEventListener("change", event => {
    handleBridgeFileV50(event.target.files?.[0]);
});
$("btnV50ManualLink")?.addEventListener("click", () => openManualLinkModalV50());
$("btnV50ReloadLinks")?.addEventListener("click", () => loadInvoiceOrderLinksV50({ silent: false }));
$("v50LinkSearch")?.addEventListener("input", renderInvoiceOrderLinksV50);
$("btnV50CloseManual")?.addEventListener("click", closeManualLinkModalV50);
$("btnV50CancelManual")?.addEventListener("click", closeManualLinkModalV50);
$("btnV50SaveManual")?.addEventListener("click", saveManualLinkModalV50);
$("v50ManualLinkModal")?.addEventListener("click", event => {
    if (event.target === $("v50ManualLinkModal")) closeManualLinkModalV50();
});

document.addEventListener("click", async event => {
    const deleteButton = event.target.closest("[data-v50-delete-link]");
    if (deleteButton) {
        try {
            await deleteInvoiceOrderLinkV50(deleteButton.dataset.v50DeleteLink);
        } catch (error) {
            alert(`Không xóa được liên kết.\n\n${error?.message || error}`);
        }
        return;
    }

    const suggestionButton = event.target.closest("[data-v50-confirm-suggestion]");
    if (suggestionButton) {
        if (!requirePermissionV40("MANAGE_INVOICE_LINKS")) return;

        const orderKey = suggestionButton.dataset.v50ConfirmSuggestion;
        const suggestion = invoiceOrderLinkStateV50.suggestions.find(item =>
            item.order.normalizedOrderId === orderKey && item.unique
        );
        if (!suggestion) return;

        const candidate = suggestion.candidates[0];
        if (!confirm(
            `Xác nhận ghép:\n\nMã đơn: ${suggestion.order.orderId}\nSố HĐ: ${candidate.invoiceNo}\n\n` +
            `V50 chỉ gợi ý vì thành phần SKU + số lượng trùng chính xác. Bạn đã kiểm tra và xác nhận đúng?`
        )) return;

        try {
            await saveInvoiceOrderLinkV50({
                orderId: suggestion.order.orderId,
                invoiceNo: candidate.invoiceNo,
                invoiceDate: candidate.invoiceDate,
                source: "suggestion_confirmed",
                confidence: "confirmed",
                note: "Người dùng xác nhận từ gợi ý V50: trùng SKU + số lượng."
            });
            showToast("Đã xác nhận và lưu liên kết gợi ý.");
        } catch (error) {
            alert(`Không lưu được liên kết.\n\n${error?.message || error}`);
        }
    }
});

/* =========================================================
   V41 - ĐỐI CHIẾU TỪNG ĐƠN SHOPEE ↔ HÓA ĐƠN MISA
========================================================= */

const v41ReconcileState = {
    lookbackDays: 7,
    search: "",
    resultFilter: "all"
};

function v41AddDays(dateKey, days) {
    const parts = String(dateKey || "").split("-").map(Number);

    if (parts.length !== 3 || parts.some(Number.isNaN)) {
        return "";
    }

    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    date.setUTCDate(date.getUTCDate() + Number(days || 0));

    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
}

function v41ResolveMisaBaseSku(line) {
    const activeItems = (inventoryState?.items || []).filter(
        item => item.active !== false
    );

    const matchedItem = activeItems.find(item =>
        isMisaLineMatchedToInventoryItem(line, item)
    );

    if (matchedItem) {
        const preferred = String(matchedItem.shopeeSku || "").trim();

        if (preferred) {
            return {
                sku: preferred,
                itemName: matchedItem.name || line.productName || "",
                method: "inventory-map"
            };
        }

        const code = String(matchedItem.itemCode || "")
            .replace(/^WH-/i, "")
            .trim();

        if (code) {
            return {
                sku: code,
                itemName: matchedItem.name || line.productName || "",
                method: "inventory-code"
            };
        }
    }

    const directCode = String(line?.productCode || "").trim();

    if (directCode) {
        return {
            sku: directCode,
            itemName: line?.productName || "",
            method: "misa-code"
        };
    }

    return {
        sku: "",
        itemName: line?.productName || "",
        method: "unmapped"
    };
}

function v41GetLatestShopeeLines() {
    const latest = new Map();

    (state.skuRows || []).forEach(row => {
        const orderId = String(row.orderId || "").trim();
        const sku = String(row.sku || "").trim();

        if (!orderId || !sku) return;

        const reportDate = row.reportDate || row.orderDate || "";
        const slotRank = normalizeRowSlot(row) === "afternoon" ? 2 : 1;
        const rank =
            `${reportDate}|${slotRank}|${row.updatedAt || ""}|${row.importedAt || ""}`;

        const key = `${normalizeOrderReferenceV41(orderId)}|${sku}`;
        const previous = latest.get(key);

        if (!previous || rank > previous.__rank) {
            latest.set(key, {
                ...row,
                __rank: rank
            });
        }
    });

    return [...latest.values()];
}

function buildShopeeDeliveredOrdersV41() {
    const allLatestLines = v41GetLatestShopeeLines();
    const orderMap = new Map();

    allLatestLines.forEach(row => {
        const orderId = String(row.orderId || "").trim();
        const normalizedOrderId = normalizeOrderReferenceV41(orderId);

        if (!normalizedOrderId) return;

        const bucket = classifyInventoryShopeeStatus(row.status);

        if (bucket !== "delivered") {
            return;
        }

        if (!orderMap.has(normalizedOrderId)) {
            orderMap.set(normalizedOrderId, {
                orderId,
                normalizedOrderId,
                orderDate: row.orderDate || "",
                status: row.status || "",
                latestReportDate: row.reportDate || "",
                expectedBySku: new Map(),
                productNames: new Set()
            });
        }

        const order = orderMap.get(normalizedOrderId);

        if (
            row.orderDate &&
            (!order.orderDate || row.orderDate < order.orderDate)
        ) {
            order.orderDate = row.orderDate;
        }

        if (
            (row.reportDate || "") >= (order.latestReportDate || "")
        ) {
            order.latestReportDate = row.reportDate || order.latestReportDate;
            order.status = row.status || order.status;
        }

        if (row.product) {
            order.productNames.add(row.product);
        }

        expandShopeeRowToInventorySkus(row).forEach(part => {
            const sku = String(part.baseSku || "").trim();

            if (!sku) return;

            order.expectedBySku.set(
                sku,
                Number(order.expectedBySku.get(sku) || 0) +
                    Number(part.quantity || 0)
            );
        });
    });

    return orderMap;
}

function v41GetScopeDeliveredOrders(allOrders, lookbackDays) {
    const orders = [...allOrders.values()];

    if (!invoiceState.dateFrom && !invoiceState.dateTo) {
        return orders;
    }

    const startDate = invoiceState.dateFrom
        ? v41AddDays(invoiceState.dateFrom, -Math.abs(Number(lookbackDays || 7)))
        : "";

    const endDate = invoiceState.dateTo || invoiceState.dateFrom || "";

    return orders.filter(order => {
        const date = order.orderDate || "";

        if (!date) return true;
        if (startDate && date < startDate) return false;
        if (endDate && date > endDate) return false;

        return true;
    });
}

function buildMisaOrderAssignmentsV41(allShopeeOrders) {
    const issuedLines = getIssuedMisaLines();

    const orderAssignments = new Map();
    const unknownOrderRefs = [];
    const noOrderRefLines = [];
    let usableRefLineCount = 0;
    let usableBridgeLineCount = 0;

    const linkByInvoice = new Map();
    (invoiceOrderLinkStateV50.items || []).forEach(link => {
        if (link.normalizedInvoiceNo && link.normalizedOrderId) {
            linkByInvoice.set(link.normalizedInvoiceNo, link);
        }
    });

    issuedLines.forEach(line => {
        const rawRef = String(line.orderRef || "").trim();
        const directRef = normalizeOrderReferenceV41(rawRef);
        const bridgeLink = directRef
            ? null
            : linkByInvoice.get(normalizeInvoiceNoV50(line.invoiceNo));

        const normalizedRef = directRef || bridgeLink?.normalizedOrderId || "";
        const matchSource = directRef ? "misa_direct" : (bridgeLink ? "bridge_v50" : "");

        if (!normalizedRef) {
            noOrderRefLines.push(line);
            return;
        }

        if (directRef) usableRefLineCount++;
        if (bridgeLink) usableBridgeLineCount++;

        const shopeeOrder = allShopeeOrders.get(normalizedRef);

        if (!shopeeOrder) {
            unknownOrderRefs.push({
                ...line,
                normalizedRef,
                matchSource
            });
            return;
        }

        const resolved = v41ResolveMisaBaseSku(line);

        if (!orderAssignments.has(normalizedRef)) {
            orderAssignments.set(normalizedRef, {
                orderId: shopeeOrder.orderId,
                invoiceNos: new Set(),
                qtyBySku: new Map(),
                unresolvedLines: [],
                matchSources: new Set()
            });
        }

        const assignment = orderAssignments.get(normalizedRef);
        assignment.matchSources.add(matchSource);

        if (line.invoiceNo) {
            assignment.invoiceNos.add(String(line.invoiceNo).trim());
        }

        if (!resolved.sku) {
            assignment.unresolvedLines.push(line);
            return;
        }

        assignment.qtyBySku.set(
            resolved.sku,
            Number(assignment.qtyBySku.get(resolved.sku) || 0) +
                Number(line.quantity || 0)
        );
    });

    return {
        issuedLines,
        usableRefLineCount,
        usableBridgeLineCount,
        usableLinkedLineCount: usableRefLineCount + usableBridgeLineCount,
        orderAssignments,
        unknownOrderRefs,
        noOrderRefLines
    };
}

function v41CompareOrder(order, assignment, exactMode) {
    const expected = order.expectedBySku;
    const expectedTotal = [...expected.values()].reduce(
        (sum, qty) => sum + Number(qty || 0),
        0
    );

    if (!exactMode) {
        return {
            order,
            result: "unverifiable",
            resultLabel: "Chưa thể ghép",
            detail: "File MISA chưa có Mã đơn Shopee.",
            invoiceNos: [],
            misaTotal: 0,
            expectedTotal
        };
    }

    if (!assignment) {
        return {
            order,
            result: "missing",
            resultLabel: "Chưa có HĐ",
            detail: "Không tìm thấy Mã đơn này trong các dòng MISA đã phát hành.",
            invoiceNos: [],
            misaTotal: 0,
            expectedTotal
        };
    }

    const actual = assignment.qtyBySku;
    const allSkus = new Set([
        ...expected.keys(),
        ...actual.keys()
    ]);

    const differences = [];
    let misaTotal = 0;

    allSkus.forEach(sku => {
        const expectedQty = Number(expected.get(sku) || 0);
        const misaQty = Number(actual.get(sku) || 0);
        misaTotal += misaQty;

        if (expectedQty !== misaQty) {
            differences.push(
                `${sku}: Shopee ${formatNumber(expectedQty)} / MISA ${formatNumber(misaQty)}`
            );
        }
    });

    if (assignment.unresolvedLines.length) {
        differences.push(
            `${assignment.unresolvedLines.length} dòng MISA chưa map được SKU`
        );
    }

    if (!differences.length) {
        return {
            order,
            result: "matched",
            resultLabel: "Khớp",
            detail: "Mã đơn + SKU + số lượng khớp.",
            invoiceNos: [...assignment.invoiceNos],
            misaTotal,
            expectedTotal
        };
    }

    return {
        order,
        result: "mismatch",
        resultLabel: "Lệch",
        detail: differences.slice(0, 3).join(" · "),
        invoiceNos: [...assignment.invoiceNos],
        misaTotal,
        expectedTotal
    };
}

function buildOrderReconciliationV41() {
    const lookbackDays = Number(
        $("v41LookbackDays")?.value ||
        v41ReconcileState.lookbackDays ||
        7
    );

    v41ReconcileState.lookbackDays = lookbackDays;

    const allOrders = buildShopeeDeliveredOrdersV41();
    const scopeOrders = v41GetScopeDeliveredOrders(
        allOrders,
        lookbackDays
    );

    const misaAssignment = buildMisaOrderAssignmentsV41(allOrders);

    const exactMode =
        misaAssignment.usableLinkedLineCount > 0;

    // Nếu MISA có mã đơn tham chiếu đến đơn ngoài cửa sổ ngày,
    // vẫn đưa đơn đó vào bảng để không bỏ mất một match chính xác.
    const scopeMap = new Map(
        scopeOrders.map(order => [order.normalizedOrderId, order])
    );

    misaAssignment.orderAssignments.forEach((assignment, normalizedOrderId) => {
        if (
            allOrders.has(normalizedOrderId) &&
            !scopeMap.has(normalizedOrderId)
        ) {
            scopeMap.set(
                normalizedOrderId,
                allOrders.get(normalizedOrderId)
            );
        }
    });

    const rows = [...scopeMap.values()]
        .map(order =>
            v41CompareOrder(
                order,
                misaAssignment.orderAssignments.get(order.normalizedOrderId),
                exactMode
            )
        )
        .sort((a, b) => {
            const resultRank = {
                mismatch: 0,
                missing: 1,
                unverifiable: 2,
                matched: 3
            };

            const rankA = resultRank[a.result] ?? 9;
            const rankB = resultRank[b.result] ?? 9;

            if (rankA !== rankB) return rankA - rankB;

            return String(a.order.orderDate || "").localeCompare(
                String(b.order.orderDate || "")
            );
        });

    return {
        lookbackDays,
        allOrders,
        scopeOrders: [...scopeMap.values()],
        rows,
        exactMode,
        ...misaAssignment
    };
}

function buildSkuReconciliationV41(orderReconciliation) {
    const expectedBySku = new Map();
    const nameBySku = new Map();

    orderReconciliation.scopeOrders.forEach(order => {
        order.expectedBySku.forEach((qty, sku) => {
            expectedBySku.set(
                sku,
                Number(expectedBySku.get(sku) || 0) + Number(qty || 0)
            );
        });
    });

    (inventoryState?.items || []).forEach(item => {
        const sku = String(item.shopeeSku || "").trim();

        if (sku) {
            nameBySku.set(sku, item.name || "");
        }
    });

    const misaBySku = new Map();

    getIssuedMisaLines().forEach(line => {
        const resolved = v41ResolveMisaBaseSku(line);
        const sku = String(resolved.sku || "").trim();

        if (!sku) return;

        misaBySku.set(
            sku,
            Number(misaBySku.get(sku) || 0) + Number(line.quantity || 0)
        );

        if (resolved.itemName && !nameBySku.has(sku)) {
            nameBySku.set(sku, resolved.itemName);
        }
    });

    const allSkus = new Set([
        ...expectedBySku.keys(),
        ...misaBySku.keys()
    ]);

    return [...allSkus]
        .map(sku => {
            const shopeeQty = Number(expectedBySku.get(sku) || 0);
            const misaQty = Number(misaBySku.get(sku) || 0);
            const diff = misaQty - shopeeQty;

            return {
                sku,
                name: nameBySku.get(sku) || "",
                shopeeQty,
                misaQty,
                diff,
                result:
                    diff === 0
                        ? "matched"
                        : "mismatch"
            };
        })
        .sort((a, b) => {
            if (a.result !== b.result) {
                return a.result === "mismatch" ? -1 : 1;
            }

            return a.sku.localeCompare(b.sku);
        });
}

function v41ExpectedSkuHtml(order) {
    const entries = [...order.expectedBySku.entries()];

    if (!entries.length) return "—";

    return `
        <div class="v41-order-sku-list">
            ${entries.map(([sku, qty]) => `
                <span class="v41-order-sku-chip">
                    ${escapeHTML(sku)}
                    × ${formatNumber(qty)}
                </span>
            `).join("")}
        </div>
    `;
}

function renderInvoiceOrderReconciliationV41() {
    const body = $("v41OrderReconcileBody");
    const skuBody = $("v41SkuReconcileBody");

    if (!body || !skuBody) return;

    if (!invoiceState.lineRows?.length) {
        if ($("v41OrderRefNotice")) {
            $("v41OrderRefNotice").className = "v41-order-ref-notice";
            $("v41OrderRefNotice").textContent =
                "Chưa có file MISA để đối chiếu.";
        }

        body.innerHTML =
            '<tr><td colspan="9" class="empty-table">Hãy upload file MISA trước.</td></tr>';

        skuBody.innerHTML =
            '<tr><td colspan="7" class="empty-table">Hãy upload file MISA trước.</td></tr>';

        [
            "v41OrderCount",
            "v41MatchedCount",
            "v41MismatchCount",
            "v41MissingCount"
        ].forEach(id => {
            if ($(id)) $(id).textContent = "0";
        });

        if ($("v41OrderRefCoverage")) $("v41OrderRefCoverage").textContent = "0/0";
        if ($("v41OrderRefHeaderText")) $("v41OrderRefHeaderText").textContent = "Chưa phát hiện cột mã đơn";
        if ($("v41MatchModeBadge")) {
            $("v41MatchModeBadge").className = "v41-mode-badge";
            $("v41MatchModeBadge").textContent = "CHỜ DỮ LIỆU";
        }

        return;
    }

    const reconciliation = buildOrderReconciliationV41();
    const skuRows = buildSkuReconciliationV41(reconciliation);

    const matched = reconciliation.rows.filter(row => row.result === "matched").length;
    const mismatch = reconciliation.rows.filter(row => row.result === "mismatch").length;
    const missing = reconciliation.rows.filter(row => row.result === "missing").length;

    if ($("v41OrderCount")) {
        $("v41OrderCount").textContent = formatNumber(reconciliation.rows.length);
    }

    if ($("v41MatchedCount")) {
        $("v41MatchedCount").textContent = formatNumber(matched);
    }

    if ($("v41MismatchCount")) {
        $("v41MismatchCount").textContent = formatNumber(mismatch);
    }

    if ($("v41MissingCount")) {
        $("v41MissingCount").textContent = formatNumber(missing);
    }

    if ($("v41OrderRefCoverage")) {
        $("v41OrderRefCoverage").textContent =
            `${formatNumber(reconciliation.usableLinkedLineCount)}` +
            `/` +
            `${formatNumber(reconciliation.issuedLines.length)}`;
    }

    if ($("v41OrderRefHeaderText")) {
        $("v41OrderRefHeaderText").textContent =
            invoiceState.orderRefHeader
                ? `MISA trực tiếp: ${invoiceState.orderRefHeader}`
                : (invoiceOrderLinkStateV50.items.length
                    ? `Qua cầu nối V50: ${formatNumber(invoiceOrderLinkStateV50.items.length)} liên kết`
                    : "Chưa có khóa ghép theo đơn");
    }

    const notice = $("v41OrderRefNotice");
    const modeBadge = $("v41MatchModeBadge");

    if (reconciliation.exactMode) {
        if (notice) {
            notice.className = "v41-order-ref-notice good";
            notice.innerHTML =
                `✓ Đã có khóa ghép theo đơn cho <strong>${formatNumber(reconciliation.usableLinkedLineCount)}</strong> dòng MISA: ` +
                `<strong>${formatNumber(reconciliation.usableRefLineCount)}</strong> dòng từ Mã đơn có sẵn trong MISA + ` +
                `<strong>${formatNumber(reconciliation.usableBridgeLineCount)}</strong> dòng qua cầu nối V50.` +
                (reconciliation.unknownOrderRefs.length
                    ? ` Có <strong>${formatNumber(reconciliation.unknownOrderRefs.length)}</strong> dòng tham chiếu chưa tìm thấy Mã đơn Shopee tương ứng.`
                    : "");
        }

        if (modeBadge) {
            modeBadge.className = "v41-mode-badge exact";
            modeBadge.textContent = "GHÉP CHÍNH XÁC";
        }
    } else {
        if (notice) {
            notice.className = "v41-order-ref-notice warning";
            notice.innerHTML =
                `⚠ File MISA hiện tại <strong>không có Mã đơn Shopee sử dụng được</strong> và chưa có cầu nối V50 phù hợp. ` +
                `Hãy upload file cầu nối hoặc ghép thủ công ở khung phía trên. ` +
                `V50 không tự đoán đơn nào đã xuất hóa đơn; gợi ý SKU + số lượng chỉ được dùng sau khi bạn xác nhận.`;
        }

        if (modeBadge) {
            modeBadge.className = "v41-mode-badge aggregate";
            modeBadge.textContent = "CHỈ ĐỐI CHIẾU TỔNG";
        }
    }

    if ($("v41OrderScopeText")) {
        const startDate = invoiceState.dateFrom
            ? v41AddDays(invoiceState.dateFrom, -reconciliation.lookbackDays)
            : "";

        const endDate = invoiceState.dateTo || invoiceState.dateFrom || "";

        $("v41OrderScopeText").textContent =
            `MISA ${invoiceState.dateFrom ? formatDateLabel(invoiceState.dateFrom) : "-"}${invoiceState.dateTo && invoiceState.dateTo !== invoiceState.dateFrom ? " → " + formatDateLabel(invoiceState.dateTo) : ""}` +
            (startDate || endDate
                ? ` · xét đơn Shopee ${startDate ? formatDateLabel(startDate) : "..."} → ${endDate ? formatDateLabel(endDate) : "..."}`
                : "") +
            ` · cửa sổ ${reconciliation.lookbackDays} ngày`;
    }

    const search = normalizeText(
        $("v41OrderSearch")?.value ||
        v41ReconcileState.search ||
        ""
    );

    const resultFilter =
        $("v41ResultFilter")?.value ||
        v41ReconcileState.resultFilter ||
        "all";

    v41ReconcileState.search = $("v41OrderSearch")?.value || "";
    v41ReconcileState.resultFilter = resultFilter;

    const filteredRows = reconciliation.rows.filter(row => {
        if (resultFilter !== "all" && row.result !== resultFilter) {
            return false;
        }

        if (!search) return true;

        const haystack = normalizeText([
            row.order.orderId,
            row.order.status,
            ...row.order.expectedBySku.keys(),
            ...row.invoiceNos
        ].join(" "));

        return haystack.includes(search);
    });

    if (!filteredRows.length) {
        body.innerHTML = `
            <tr>
                <td colspan="9" class="v41-empty-explain">
                    ${reconciliation.rows.length
                        ? "Không có đơn phù hợp bộ lọc hiện tại."
                        : "Không tìm thấy đơn Shopee trạng thái Đã giao trong phạm vi đang xét."}
                </td>
            </tr>
        `;
    } else {
        body.innerHTML = filteredRows.map((row, index) => `
            <tr>
                <td>${index + 1}</td>

                <td>
                    <span class="v41-order-code">
                        ${escapeHTML(row.order.orderId)}
                    </span>
                </td>

                <td>
                    ${row.order.orderDate
                        ? escapeHTML(formatDateLabel(row.order.orderDate))
                        : "—"}
                </td>

                <td>
                    ${escapeHTML(row.order.status || "Đã giao")}
                </td>

                <td>
                    ${v41ExpectedSkuHtml(row.order)}
                </td>

                <td>
                    <span class="${row.result === "mismatch" ? "v41-qty-bad" : ""}">
                        ${formatNumber(row.expectedTotal)}
                    </span>
                </td>

                <td>
                    <span class="v41-invoice-list">
                        ${row.invoiceNos.length
                            ? escapeHTML(row.invoiceNos.join(", "))
                            : "—"}
                    </span>
                </td>

                <td>
                    <span class="${row.result === "matched" ? "v41-qty-good" : (row.misaTotal ? "v41-qty-bad" : "")}">
                        ${formatNumber(row.misaTotal)}
                    </span>
                </td>

                <td>
                    <span class="v41-result-badge ${escapeHTML(row.result)}">
                        ${escapeHTML(row.resultLabel)}
                    </span>
                    <span class="v41-result-detail">
                        ${escapeHTML(row.detail)}
                    </span>
                </td>
            </tr>
        `).join("");
    }

    if (!skuRows.length) {
        skuBody.innerHTML =
            '<tr><td colspan="7" class="empty-table">Chưa map được SKU để đối chiếu tổng.</td></tr>';
    } else {
        skuBody.innerHTML = skuRows.map((row, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHTML(row.sku)}</td>
                <td>${escapeHTML(row.name || "—")}</td>
                <td>${formatNumber(row.shopeeQty)}</td>
                <td>${formatNumber(row.misaQty)}</td>
                <td class="${row.diff === 0 ? "v41-qty-good" : "v41-qty-bad"}">
                    ${row.diff > 0 ? "+" : ""}${formatNumber(row.diff)}
                </td>
                <td>
                    <span class="v41-result-badge ${row.result}">
                        ${row.result === "matched" ? "Khớp tổng" : "Lệch tổng"}
                    </span>
                </td>
            </tr>
        `).join("");
    }
}

$("v41LookbackDays")?.addEventListener("change", () => {
    v41ReconcileState.lookbackDays = Number(
        $("v41LookbackDays")?.value || 7
    );
    renderInvoiceOrderReconciliationV41();
});

$("v41OrderSearch")?.addEventListener("input", () => {
    v41ReconcileState.search = $("v41OrderSearch")?.value || "";
    renderInvoiceOrderReconciliationV41();
});

$("v41ResultFilter")?.addEventListener("change", () => {
    v41ReconcileState.resultFilter =
        $("v41ResultFilter")?.value || "all";
    renderInvoiceOrderReconciliationV41();
});


function renderInvoiceStats() {
    ensureInvoiceStatsLoaded();

    // Chỉ nạp history sau khi current stats đã nạp để migration V26 -> V27 đúng.
    if (!invoiceHistoryState.loaded) {
        ensureInvoiceHistoryLoaded();
    }

    updateInvoiceHistoryCount();

    const body = $("invoiceStatsBody");
    const foot = $("invoiceStatsFoot");

    if (!body || !foot) return;

    const search = normalizeText(
        $("invoiceSearchInput")?.value || ""
    );

    // V25: bảo đảm các dòng chữ ký/footer cũ không bao giờ hiện lại.
    const cleanRows = invoiceState.rows.filter(item =>
        Number(item?.quantity || 0) > 0
    );

    if (cleanRows.length !== invoiceState.rows.length) {
        invoiceState.rows = cleanRows;
        saveInvoiceStatsLocal();
    }

    const filtered = invoiceState.rows.filter(item =>
        !search ||
        normalizeText(item.productName).includes(search)
    );

    const totals = getInvoiceTotals();

    if ($("invoiceTotalQty")) {
        $("invoiceTotalQty").textContent =
            formatNumber(totals.quantity);
    }

    if ($("invoiceProductCount")) {
        $("invoiceProductCount").textContent =
            formatNumber(invoiceState.rows.length);
    }

    if ($("invoiceNumberCount")) {
        $("invoiceNumberCount").textContent =
            formatNumber(invoiceState.invoiceCount);
    }

    if ($("invoiceVatTotal")) {
        $("invoiceVatTotal").textContent =
            invoiceMoney(totals.vat);
    }

    if ($("invoicePaymentTotal")) {
        $("invoicePaymentTotal").textContent =
            invoiceMoney(totals.payment);
    }

    if ($("navInvoiceCount")) {
        $("navInvoiceCount").textContent =
            invoiceState.rows.length
                ? formatNumber(invoiceState.rows.length)
                : "0";
    }

    const fileInfo = $("invoiceFileInfo");

    if (fileInfo) {
        if (!invoiceState.rows.length) {
            fileInfo.className = "invoice-file-info";
            fileInfo.innerHTML =
                "Chưa có file hóa đơn. Hãy chọn file Excel để bắt đầu.";
        } else {
            const dateText =
                invoiceState.dateFrom && invoiceState.dateTo
                    ? (
                        invoiceState.dateFrom === invoiceState.dateTo
                            ? formatDateLabel(invoiceState.dateFrom)
                            : `${formatDateLabel(invoiceState.dateFrom)} → ${formatDateLabel(invoiceState.dateTo)}`
                    )
                    : "Không xác định ngày";

            fileInfo.className = "invoice-file-info loaded";
            fileInfo.innerHTML = `
                <strong>✓ ${escapeHTML(invoiceState.fileName)}</strong>
                · ${formatNumber(invoiceState.sourceRowCount)} dòng hàng hóa
                · <span class="invoice-issued-note">${formatNumber(invoiceState.issuedLineCount || invoiceState.sourceRowCount)} dòng đã phát hành</span>
                · ${formatNumber(invoiceState.invoiceCount)} số hóa đơn
                · Ngày: <strong>${escapeHTML(dateText)}</strong>
            `;
        }
    }

    // V50/V41: render cầu nối và đối chiếu theo đơn trước các nhánh return.
    renderInvoiceOrderLinksV50();
    renderInvoiceOrderReconciliationV41();

    if ($("invoiceSummarySubtitle")) {
        if (!invoiceState.rows.length) {
            $("invoiceSummarySubtitle").textContent =
                "Chưa có dữ liệu.";
        } else {
            $("invoiceSummarySubtitle").textContent =
                `${formatNumber(invoiceState.rows.length)} nhóm mặt hàng · ` +
                `Tổng số lượng ${formatNumber(totals.quantity)} · ` +
                `Tiền trước thuế ${invoiceMoney(totals.preTax)}`;
        }
    }

    if (!filtered.length) {
        body.innerHTML = `
            <tr>
                <td colspan="6" class="empty-table">
                    ${invoiceState.rows.length
                        ? "Không tìm thấy sản phẩm phù hợp."
                        : "Chưa có dữ liệu hóa đơn."}
                </td>
            </tr>
        `;

        foot.innerHTML = invoiceState.rows.length
            ? `
                <tr>
                    <td></td>
                    <td>TỔNG CỘNG</td>
                    <td>${formatNumber(totals.quantity)}</td>
                    <td>${invoiceMoney(totals.vat)}</td>
                    <td>${invoiceMoney(totals.payment)}</td>
                    <td>${invoiceMoney(totals.preTax)}</td>
                </tr>
            `
            : "";

        return;
    }

    body.innerHTML = filtered.map((item, index) => {
        const zeroMoney = Number(item.payment || 0) === 0;

        return `
            <tr class="${item.promo ? "invoice-promo-row" : ""}">
                <td>${index + 1}</td>

                <td>
                    <div class="invoice-product-name">
                        <span>${escapeHTML(item.productName)}</span>
                        ${item.promo
                            ? '<span class="invoice-promo-badge">KHUYẾN MẠI</span>'
                            : ""}
                    </div>
                </td>

                <td class="invoice-qty-value">
                    ${formatNumber(item.quantity)}
                </td>

                <td class="invoice-money-value ${zeroMoney ? "invoice-zero-money" : ""}">
                    ${zeroMoney ? "—" : invoiceMoney(item.vat)}
                </td>

                <td class="invoice-money-value ${zeroMoney ? "invoice-zero-money" : ""}">
                    ${zeroMoney ? "—" : invoiceMoney(item.payment)}
                </td>

                <td class="invoice-money-value ${zeroMoney ? "invoice-zero-money" : ""}">
                    ${zeroMoney ? "—" : invoiceMoney(item.preTax)}
                </td>
            </tr>
        `;
    }).join("");

    foot.innerHTML = `
        <tr>
            <td></td>
            <td>TỔNG CỘNG</td>
            <td>${formatNumber(totals.quantity)}</td>
            <td>${invoiceMoney(totals.vat)}</td>
            <td>${invoiceMoney(totals.payment)}</td>
            <td>${invoiceMoney(totals.preTax)}</td>
        </tr>
    `;
}

async function handleInvoiceUpload(file) {
    if (!requirePermissionV40("UPLOAD_INVOICE")) {
        if ($("invoiceFileInput")) $("invoiceFileInput").value = "";
        if ($("inventoryMisaFileInput")) $("inventoryMisaFileInput").value = "";
        return;
    }

    if (!file) return;

    const info = $("invoiceFileInfo");

    if (info) {
        info.className = "invoice-file-info loaded";
        info.innerHTML = `
            <span class="invoice-loading">
                <i class="invoice-loading-dot"></i>
                Đang đọc và tổng hợp file ${escapeHTML(file.name)}...
            </span>
        `;
    }

    try {
        const { matrix } = await readInvoiceExcelFile(file);
        const result = parseInvoiceMatrix(matrix, file.name);

        invoiceState.loadedFromStorage = true;
        invoiceState.fileName = result.fileName;
        invoiceState.importedAt = result.importedAt;
        invoiceState.dateFrom = result.dateFrom;
        invoiceState.dateTo = result.dateTo;
        invoiceState.sourceRowCount = result.sourceRowCount;
        invoiceState.issuedLineCount = result.issuedLineCount;
        invoiceState.unissuedLineCount = result.unissuedLineCount;
        invoiceState.invoiceCount = result.invoiceCount;
        invoiceState.currentHistoryId = "";
        invoiceState.orderRefHeader = result.orderRefHeader || "";
        invoiceState.orderRefLineCount = Number(result.orderRefLineCount || 0);
        invoiceState.rows = result.rows;
        invoiceState.lineRows = result.lineRows;

        // V39: lưu Cloud theo fingerprint; file trùng không tạo bản thứ hai.
        const historyResult = await addCurrentInvoiceToHistory();

        if ($("invoiceSearchInput")) {
            $("invoiceSearchInput").value = "";
        }

        renderInvoiceStats();

        // V32: upload MISA ở bất kỳ đâu cũng cập nhật module tồn kho ngay.
        if (inventoryState?.loaded) {
            inventoryState.misaAssignment = null;
            renderInventoryModule();
            renderInventoryMisaUploadInfo();
        }

        if (historyResult?.duplicate) {
            showToast(
                `File này đã có trên Cloud. Không tạo bản trùng · ` +
                `${formatNumber(result.invoiceCount)} số hóa đơn.`
            );
        } else {
            showToast(
                `Đã lưu Cloud ${formatNumber(result.invoiceCount)} số hóa đơn · ` +
                `${formatNumber(getInvoiceTotals().quantity)} sản phẩm đã phát hành.`
            );
        }
    } catch (error) {
        console.error("Invoice upload error:", error);

        if (info) {
            info.className = "invoice-file-info";
            info.textContent = "Không đọc được file hóa đơn.";
        }

        alert(
            "Không đọc hoặc thống kê được file hóa đơn.\n\n" +
            (error?.message || "")
        );
    } finally {
        if ($("invoiceFileInput")) {
            $("invoiceFileInput").value = "";
        }
        if ($("inventoryMisaFileInput")) {
            $("inventoryMisaFileInput").value = "";
        }
    }
}

function clearInvoiceStats() {
    invoiceState.loadedFromStorage = true;
    invoiceState.fileName = "";
    invoiceState.importedAt = "";
    invoiceState.dateFrom = "";
    invoiceState.dateTo = "";
    invoiceState.sourceRowCount = 0;
    invoiceState.issuedLineCount = 0;
    invoiceState.unissuedLineCount = 0;
    invoiceState.invoiceCount = 0;
    invoiceState.currentHistoryId = "";
    invoiceState.orderRefHeader = "";
    invoiceState.orderRefLineCount = 0;
    invoiceState.rows = [];
    invoiceState.lineRows = [];

    try {
        localStorage.removeItem(INVOICE_STATS_STORAGE_KEY);
    } catch (error) {}

    if ($("invoiceSearchInput")) {
        $("invoiceSearchInput").value = "";
    }

    renderInvoiceStats();
    renderInventoryModule();
    if (inventoryState?.loaded) {
        inventoryState.misaAssignment = null;
        renderInventoryModule();
        renderInventoryMisaUploadInfo();
    }
}

function exportInvoiceStatsExcel() {
    ensureInvoiceStatsLoaded();

    if (!invoiceState.rows.length) {
        alert("Chưa có dữ liệu hóa đơn để xuất.");
        return;
    }

    if (typeof XLSX === "undefined") {
        alert("Không tải được thư viện Excel.");
        return;
    }

    const totals = getInvoiceTotals();

    const exportRows = invoiceState.rows.map((item, index) => ({
        "STT": index + 1,
        "Tên hàng": item.productName,
        "Số lượng": item.quantity,
        "Tiền thuế GTGT": item.vat,
        "Tổng tiền TT": item.payment,
        "Tiền trước thuế": item.preTax
    }));

    exportRows.push({
        "STT": "",
        "Tên hàng": "TỔNG CỘNG",
        "Số lượng": totals.quantity,
        "Tiền thuế GTGT": totals.vat,
        "Tổng tiền TT": totals.payment,
        "Tiền trước thuế": totals.preTax
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportRows);

    worksheet["!cols"] = [
        { wch: 6 },
        { wch: 68 },
        { wch: 12 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 }
    ];

    XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "THONG KE HOA DON"
    );

    const suffix =
        invoiceState.dateFrom
            ? invoiceState.dateFrom.replaceAll("-", "")
            : "HOA_DON";

    XLSX.writeFile(
        workbook,
        `THONG_KE_HOA_DON_${suffix}.xlsx`
    );
}

$("invoiceFileInput")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file) handleInvoiceUpload(file);
});

$("invoiceSearchInput")?.addEventListener("input", renderInvoiceStats);

$("btnInvoiceHistory")?.addEventListener("click", () => {
    openInvoiceHistoryModal().catch(error => {
        console.error("Open invoice history V39:", error);
    });
});

$("btnCloseInvoiceHistory")?.addEventListener("click", closeInvoiceHistoryModal);
$("btnCloseInvoiceHistoryFooter")?.addEventListener("click", closeInvoiceHistoryModal);

$("invoiceHistorySearch")?.addEventListener("input", renderInvoiceHistory);

$("invoiceHistoryModal")?.addEventListener("click", event => {
    if (event.target === $("invoiceHistoryModal")) {
        closeInvoiceHistoryModal();
    }
});

document.addEventListener("keydown", event => {
    if (
        event.key === "Escape" &&
        !$("invoiceHistoryModal")?.classList.contains("hidden")
    ) {
        closeInvoiceHistoryModal();
    }
});

$("btnExportInvoiceStats")?.addEventListener(
    "click",
    exportInvoiceStatsExcel
);

$("btnClearInvoiceStats")?.addEventListener("click", () => {
    if (!invoiceState.rows.length) return;

    if (confirm("Xóa bảng thống kê hóa đơn đang lưu trên trình duyệt này?")) {
        clearInvoiceStats();
    }
});


/* ======================== ACTIONS ======================== */
if ($("btnOpenSkuStats")) {
    $("btnOpenSkuStats").addEventListener("click", () => {
        openView("sku-stats");
        showStatsCalendar();
    });
}

$("btnReset").addEventListener("click", openAdminDeleteModal);

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

function getReportDateGroups() {
    const reportDates = [...new Set(
        state.skuRows.map(row => row.orderDate).filter(Boolean)
    )];

    return reportDates
        .map(dateKey => {
            const morningInfo = getLatestImportForSlot(dateKey, "morning");
            const afternoonInfo = getLatestImportForSlot(dateKey, "afternoon");

            function rowsBySavedFilter(slot, info) {
                const rawRows = getRawRowsForReportSlot(dateKey, slot);
                if (!info) return [];

                const statuses = new Set(info.selectedStatuses || []);
                const selectedDates = new Set(
                    normalizeShiftDateList(info.sourceDates || [], info.sourceDate || "")
                );

                return rawRows.filter(row =>
                    (!selectedDates.size || selectedDates.has(row.sourceOrderDate)) &&
                    statuses.has(row.status)
                );
            }

            const morningRows = rowsBySavedFilter("morning", morningInfo);
            const afternoonRows = rowsBySavedFilter("afternoon", afternoonInfo);

            const countRows = rows => {
                if (state.countMode === "quantity") {
                    return sum(rows.map(row => row.quantity || 0));
                }
                return rows.length;
            };

            const allFiltered = [...morningRows, ...afternoonRows];

            const updatedAt = [...getRawRowsForReportSlot(dateKey, "morning"),
                               ...getRawRowsForReportSlot(dateKey, "afternoon")]
                .map(row => row.updatedAt || "")
                .sort()
                .pop() || "";

            return {
                dateKey,
                morning: countRows(morningRows),
                afternoon: countRows(afternoonRows),
                orders: new Set(allFiltered.map(row => row.orderId).filter(Boolean)),
                updatedAt
            };
        })
        .sort((a, b) =>
            String(b.dateKey).localeCompare(String(a.dateKey))
        );
}

function renderHistoryConfig(reportDate, slot) {
    const info = getLatestImportForSlot(reportDate, slot);

    if (!info) {
        return `
            <div class="history-config">
                <strong>${slotLabel(slot)}</strong>
                <span>Chưa có dữ liệu</span>
            </div>
        `;
    }

    return `
        <div class="history-config">
            <strong>Ngày đơn: ${normalizeShiftDateList(info.sourceDates || [], info.sourceDate || reportDate).map(formatDateLabel).join(" + ")}</strong>
            <span>${escapeHTML(formatStatusList(info.selectedStatuses))}</span>
        </div>
    `;
}

function renderHistory() {
    const body = $("historyTableBody");
    if (!body) return;

    const groups = getReportDateGroups();

    const allOrders = new Set(
        state.skuRows.map(row => row.orderId).filter(Boolean)
    );

    if ($("historyDayCount")) $("historyDayCount").textContent = formatNumber(groups.length);
    if ($("historyImportCount")) $("historyImportCount").textContent = formatNumber(state.imports.length);
    if ($("historyOrderCount")) $("historyOrderCount").textContent = formatNumber(allOrders.size);
    if ($("historyRowCount")) $("historyRowCount").textContent = formatNumber(state.skuRows.length);
    if ($("navHistoryCount")) $("navHistoryCount").textContent = formatNumber(groups.length);

    if (!groups.length) {
        body.innerHTML = `
            <tr>
                <td colspan="8" class="history-empty">
                    Chưa có lịch sử thống kê.
                </td>
            </tr>
        `;
        return;
    }

    body.innerHTML = groups.map(group => {
        const total = group.morning + group.afternoon;

        return `
            <tr>
                <td>
                    <strong>${formatDateLabel(group.dateKey)}</strong>
                </td>

                <td>
                    ${renderHistoryConfig(group.dateKey, "morning")}
                </td>

                <td class="center">
                    ${formatNumber(group.morning)}
                </td>

                <td>
                    ${renderHistoryConfig(group.dateKey, "afternoon")}
                </td>

                <td class="center">
                    ${formatNumber(group.afternoon)}
                </td>

                <td class="center">
                    <strong>${formatNumber(total)}</strong>
                </td>

                <td>
                    ${formatDateTimeVi(group.updatedAt)}
                </td>

                <td class="center">
                    <button
                        type="button"
                        class="btn-view-history"
                        data-history-date="${escapeHTML(group.dateKey)}"
                    >
                        Xem thống kê
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    document.querySelectorAll("[data-history-date]").forEach(button => {
        button.addEventListener("click", () => {
            const dateKey = button.dataset.historyDate;

            openStatsDay(dateKey);
        });
    });
}


/* =========================================================
   V38 - TRUNG TÂM CẢNH BÁO VẬN HÀNH + SYSTEM HEALTH
========================================================= */

function v38DateDiffDays(fromKey, toKey) {
    if (!fromKey || !toKey) return null;

    const fromParts = String(fromKey).split("-").map(Number);
    const toParts = String(toKey).split("-").map(Number);

    if (
        fromParts.length !== 3 ||
        toParts.length !== 3 ||
        fromParts.some(Number.isNaN) ||
        toParts.some(Number.isNaN)
    ) {
        return null;
    }

    const fromUtc = Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]);
    const toUtc = Date.UTC(toParts[0], toParts[1] - 1, toParts[2]);

    return Math.floor((toUtc - fromUtc) / 86400000);
}

function v38HoursSince(value) {
    if (!value) return null;

    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return null;

    return (Date.now() - time) / 3600000;
}

function v38ShortList(values, maxItems = 3) {
    const list = [...new Set(
        (Array.isArray(values) ? values : [])
            .map(value => String(value || "").trim())
            .filter(Boolean)
    )];

    if (!list.length) return "";

    const shown = list.slice(0, maxItems).join(", ");
    const extra = list.length - maxItems;

    return extra > 0
        ? `${shown} +${extra}`
        : shown;
}

function buildOperationalAlertsV38() {
    try {
        ensureInvoiceStatsLoaded();
    } catch (error) {
        console.warn("V38 không đọc được invoice local khi tạo cảnh báo.", error);
    }

    const alerts = [];

    let inventorySummary = [];

    try {
        inventorySummary = buildInventorySummary();
    } catch (error) {
        console.warn("V38 không tạo được inventory summary.", error);
    }

    const add = ({
        severity = "info",
        icon = "ℹ️",
        title = "",
        detail = "",
        view = "",
        tab = "",
        action = "Xem chi tiết"
    }) => {
        alerts.push({
            id: `v38_${alerts.length + 1}_${severity}`,
            severity,
            icon,
            title,
            detail,
            view,
            tab,
            action
        });
    };

    // ---------------------------------------------------------
    // 1. Hết hàng / sắp chạm tồn an toàn
    // ---------------------------------------------------------
    const outOfStock = inventorySummary.filter(item =>
        Number(item.available || 0) <= 0
    );

    if (outOfStock.length) {
        add({
            severity: "critical",
            icon: "⛔",
            title: `${outOfStock.length} mặt hàng hết khả dụng`,
            detail:
                `Không còn hàng có thể tiếp tục giữ cho đơn: ` +
                `${v38ShortList(outOfStock.map(item => item.name))}.`,
            view: "inventory-flow",
            tab: "overview",
            action: "Xem tồn kho"
        });
    }

    const lowStock = inventorySummary.filter(item => {
        const available = Number(item.available || 0);
        const safety = Number(item.safetyStock || 0);

        return available > 0 && safety > 0 && available <= safety;
    });

    if (lowStock.length) {
        add({
            severity: "warning",
            icon: "📉",
            title: `${lowStock.length} mặt hàng chạm tồn an toàn`,
            detail:
                `${v38ShortList(lowStock.map(item =>
                    `${item.name} (${formatNumber(item.available)})`
                ))}.`,
            view: "inventory-flow",
            tab: "overview",
            action: "Xem tồn"
        });
    }

    // ---------------------------------------------------------
    // 2. Kiểm kê kho
    // ---------------------------------------------------------
    const stockShortage = inventorySummary.filter(item =>
        item.lastReconcile &&
        Number(item.lastReconcile.variance || 0) < 0
    );

    const stockSurplus = inventorySummary.filter(item =>
        item.lastReconcile &&
        Number(item.lastReconcile.variance || 0) > 0
    );

    if (stockShortage.length || stockSurplus.length) {
        const shortageQty = stockShortage.reduce(
            (sum, item) => sum + Math.abs(Number(item.lastReconcile?.variance || 0)),
            0
        );

        const surplusQty = stockSurplus.reduce(
            (sum, item) => sum + Number(item.lastReconcile?.variance || 0),
            0
        );

        add({
            severity: "warning",
            icon: "🔎",
            title:
                `Kiểm kê đang lệch: ` +
                `${stockShortage.length} thiếu / ${stockSurplus.length} thừa`,
            detail:
                `Thiếu ${formatNumber(shortageQty)} SP · ` +
                `Thừa ${formatNumber(surplusQty)} SP. ` +
                `Cần kiểm tra từng SKU trước khi chốt lại kho.`,
            view: "inventory-flow",
            tab: "reconcile",
            action: "Đối chiếu kho"
        });
    }

    const notReconciled = inventorySummary.filter(item => !item.lastReconcile);

    if (inventorySummary.length && notReconciled.length) {
        add({
            severity: "info",
            icon: "🧮",
            title: `${notReconciled.length}/${inventorySummary.length} mặt hàng chưa có kết quả kiểm kê`,
            detail:
                `Web chưa tự kết luận Khớp/Thiếu/Thừa cho các mặt hàng chưa từng Chốt kiểm kê.`,
            view: "inventory-flow",
            tab: "reconcile",
            action: "Kiểm kê"
        });
    }

    // ---------------------------------------------------------
    // 3. File luân chuyển
    // ---------------------------------------------------------
    const transitRows = Array.isArray(inventoryState.movementRows) &&
        inventoryState.movementRows.length
        ? inventoryState.movementRows
        : (() => {
            try {
                return buildInventoryMovementRows();
            } catch (error) {
                return [];
            }
        })();

    const transitAgeReferenceDate =
        normalizeOrderDate(inventoryState.transitSnapshot?.snapshotDate || "") ||
        getLocalTodayKey();

    const agedTransit = transitRows.filter(row => {
        if (row.bucket !== "in_transit") return false;
        const age = v38DateDiffDays(row.sourceOrderDate, transitAgeReferenceDate);
        return age !== null && age >= 5;
    });

    if (agedTransit.length) {
        const orderCount = new Set(
            agedTransit.map(row => row.orderId).filter(Boolean)
        ).size;

        const qty = agedTransit.reduce(
            (sum, row) => sum + Number(row.quantity || 0),
            0
        );

        const oldestDate = agedTransit
            .map(row => row.sourceOrderDate)
            .filter(Boolean)
            .sort()[0] || "";

        add({
            severity: "warning",
            icon: "🚚",
            title: `${formatNumber(orderCount)} đơn đang giao có ngày đặt hàng từ 5 ngày trở lên`,
            detail:
                `${formatNumber(qty)} SP đang theo dõi` +
                `${oldestDate ? ` · ngày đơn cũ nhất ${formatDateLabel(oldestDate)}` : ""}. ` +
                `Nên kiểm tra các đơn giao lâu chưa hoàn tất.`,
            view: "inventory-flow",
            tab: "overview",
            action: "Xem tuổi đơn"
        });
    }

    const transitSnapshot = inventoryState.transitSnapshot;

    if (!transitSnapshot?.rows?.length) {
        add({
            severity: "warning",
            icon: "📤",
            title: "Chưa có snapshot đơn luân chuyển Shopee",
            detail:
                "Giữ đơn / Đang giao / Đã giao / Hoàn đang về chưa có nguồn snapshot hiện tại.",
            view: "inventory-flow",
            tab: "overview",
            action: "Upload snapshot"
        });
    } else {
        const ageHours = v38HoursSince(transitSnapshot.importedAt);

        if (ageHours !== null && ageHours >= 24) {
            add({
                severity: "warning",
                icon: "🕒",
                title: `Snapshot luân chuyển đã cũ ${Math.floor(ageHours)} giờ`,
                detail:
                    `${transitSnapshot.fileName || "File snapshot"} chưa được cập nhật trong hơn 24 giờ.`,
                view: "inventory-flow",
                tab: "overview",
                action: "Cập nhật file"
            });
        }
    }

    // ---------------------------------------------------------
    // 4. Mapping SKU của snapshot
    // ---------------------------------------------------------
    let unmapped = [];

    try {
        unmapped = getInventoryUnmappedSkus();
    } catch (error) {
        unmapped = [];
    }

    if (unmapped.length) {
        const unmappedQty = unmapped.reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0
        );

        add({
            severity: "warning",
            icon: "🏷️",
            title: `${unmapped.length} mã trong file luân chuyển chưa ghép được vào kho`,
            detail:
                `${formatNumber(unmappedQty)} SP chưa map · ` +
                `${v38ShortList(unmapped.map(item => item.sku))}.`,
            view: "inventory-flow",
            tab: "overview",
            action: "Xem mapping"
        });
    }

    // ---------------------------------------------------------
    // 5. MISA / Chờ hóa đơn
    // ---------------------------------------------------------
    const scopeMismatch = inventorySummary.filter(item =>
        item.invoiceScopeMismatch
    );

    if (scopeMismatch.length) {
        add({
            severity: "warning",
            icon: "🧾",
            title: `${scopeMismatch.length} mặt hàng MISA và snapshot đang khác kỳ`,
            detail:
                `Không dùng Chờ HĐ = 0 để kết luận. ` +
                `Cần đối chiếu đúng phạm vi ngày hoặc tiến tới ghép theo Mã đơn Shopee.`,
            view: "inventory-flow",
            tab: "misa",
            action: "Đối chiếu MISA"
        });
    }

    const waitingInvoice = inventorySummary.filter(item =>
        item.waitingInvoiceComparable &&
        Number(item.waitingInvoice || 0) > 0
    );

    if (waitingInvoice.length) {
        const waitingQty = waitingInvoice.reduce(
            (sum, item) => sum + Number(item.waitingInvoice || 0),
            0
        );

        add({
            severity: "warning",
            icon: "⏳",
            title: `${formatNumber(waitingQty)} SP đã giao đang chờ hóa đơn`,
            detail:
                `${v38ShortList(waitingInvoice.map(item =>
                    `${item.name} (${formatNumber(item.waitingInvoice)})`
                ))}.`,
            view: "inventory-flow",
            tab: "misa",
            action: "Xem chờ HĐ"
        });
    }

    const deliveredTotal = inventorySummary.reduce(
        (sum, item) => sum + Number(item.delivered || 0),
        0
    );

    if (deliveredTotal > 0 && !invoiceState.rows?.length) {
        add({
            severity: "warning",
            icon: "📄",
            title: "Có hàng đã giao nhưng chưa có file MISA để đối chiếu",
            detail:
                `${formatNumber(deliveredTotal)} SP đã giao trong snapshot hiện tại. ` +
                `Upload bảng kê MISA để kiểm tra tình trạng xuất hóa đơn.`,
            view: "invoice-stats",
            action: "Upload MISA"
        });
    }

    // ---------------------------------------------------------
    // 6. Chưa có dữ liệu Shopee theo ngày
    // ---------------------------------------------------------
    if (!state.skuRows?.length) {
        add({
            severity: "info",
            icon: "📊",
            title: "Chưa có dữ liệu thống kê SKU trên Cloud",
            detail:
                "Chọn ngày trong Thống kê SKU và upload file Sáng/Chiều để bắt đầu.",
            view: "sku-stats",
            action: "Mở thống kê"
        });
    }

    const rank = {
        critical: 0,
        warning: 1,
        info: 2,
        success: 3
    };

    return alerts.sort((a, b) =>
        (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9)
    );
}

function renderOperationalAlertsV38() {
    const list = $("v38AlertList");

    if (!list) return;

    const alerts = buildOperationalAlertsV38();

    const critical = alerts.filter(item => item.severity === "critical").length;
    const warning = alerts.filter(item => item.severity === "warning").length;
    const info = alerts.filter(item => item.severity === "info").length;

    if ($("v38CriticalCount")) $("v38CriticalCount").textContent = formatNumber(critical);
    if ($("v38WarningCount")) $("v38WarningCount").textContent = formatNumber(warning);
    if ($("v38InfoCount")) $("v38InfoCount").textContent = formatNumber(info);

    if (!alerts.length) {
        list.innerHTML = `
            <div class="v38-alert-empty ok">
                ✓ Không phát hiện cảnh báo vận hành cần xử lý ở dữ liệu hiện tại.
            </div>
        `;
        return;
    }

    list.innerHTML = alerts.map(item => `
        <div class="v38-alert-item ${escapeHTML(item.severity)}">
            <div class="v38-alert-icon">${escapeHTML(item.icon)}</div>

            <div class="v38-alert-copy">
                <strong>${escapeHTML(item.title)}</strong>
                <span>${escapeHTML(item.detail)}</span>
            </div>

            ${item.view
                ? `<button
                    type="button"
                    class="v38-alert-action"
                    data-v38-alert-view="${escapeHTML(item.view)}"
                    data-v38-alert-tab="${escapeHTML(item.tab || "")}"
                >
                    ${escapeHTML(item.action || "Xem")}
                </button>`
                : ""}
        </div>
    `).join("");
}

function navigateOperationalAlertV38(button) {
    const view = button?.dataset?.v38AlertView || "";
    const tab = button?.dataset?.v38AlertTab || "";

    if (!view) return;

    openView(view);

    if (view === "inventory-flow" && tab) {
        setInventoryTab(tab);

        const targetMap = {
            overview: "inventoryTabOverview",
            current: "inventoryTabCurrent",
            transactions: "inventoryTabTransactions",
            reconcile: "inventoryTabReconcile",
            misa: "inventoryTabMisa"
        };

        setTimeout(() => {
            const target = $(targetMap[tab] || "");
            target?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }, 80);
    }
}

$("v38AlertList")?.addEventListener("click", event => {
    const button = event.target.closest("[data-v38-alert-view]");
    if (!button) return;
    navigateOperationalAlertV38(button);
});

/* ======================== V38 SYSTEM HEALTH ======================== */

function v38HealthCheckItem(key, label, status, detail) {
    return {
        key,
        label,
        status,
        detail
    };
}

function v38HealthIcon(status) {
    if (status === "ok") return "✓";
    if (status === "warning") return "!";
    if (status === "error") return "×";
    return "…";
}

function v38HealthClock(value) {
    const date = value ? new Date(value) : new Date();

    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).format(date);
}

function renderSystemHealthPanelV38() {
    const checks = systemHealthStateV38.checks || [];
    const list = $("v38HealthList");

    if ($("v38VersionText")) {
        $("v38VersionText").textContent = APP_VERSION;
    }

    if ($("v38HealthCheckedAt")) {
        $("v38HealthCheckedAt").textContent = systemHealthStateV38.checkedAt
            ? `Kiểm tra ${v38HealthClock(systemHealthStateV38.checkedAt)}`
            : "Chưa kiểm tra";
    }

    if (list) {
        if (!checks.length) {
            list.innerHTML = `
                <div class="v38-health-row">
                    <span class="v38-health-status checking">…</span>
                    <div>
                        <strong>Đang chờ kiểm tra</strong>
                        <small>Bấm “Kiểm tra lại” hoặc đăng nhập hệ thống.</small>
                    </div>
                </div>
            `;
        } else {
            list.innerHTML = checks.map(item => `
                <div class="v38-health-row">
                    <span class="v38-health-status ${escapeHTML(item.status)}">
                        ${v38HealthIcon(item.status)}
                    </span>

                    <div>
                        <strong>${escapeHTML(item.label)}</strong>
                        <small>${escapeHTML(item.detail || "")}</small>
                    </div>
                </div>
            `).join("");
        }
    }

    const errors = checks.filter(item => item.status === "error").length;
    const warnings = checks.filter(item => item.status === "warning").length;
    const overall = errors
        ? "error"
        : warnings
            ? "warning"
            : checks.length
                ? "ok"
                : "checking";

    const dot = $("v38HealthOverallDot");
    const overallText = $("v38HealthOverallText");
    const detail = $("v38HealthOverallDetail");
    const sidebar = $("v38SidebarHealth");

    if (dot) {
        dot.classList.remove("ok", "warning", "error", "checking");
        dot.classList.add(overall);
    }

    if (overallText) {
        overallText.textContent =
            overall === "ok"
                ? "Hệ thống hoạt động bình thường"
                : overall === "warning"
                    ? "Hệ thống có mục cần kiểm tra"
                    : overall === "error"
                        ? "Có lỗi cấu hình cần xử lý"
                        : "Đang chờ kiểm tra";
    }

    if (detail) {
        detail.textContent = checks.length
            ? `${checks.length} mục · ${errors} lỗi · ${warnings} cảnh báo`
            : "Kiểm tra phiên bản, thư viện, Cloud và RPC.";
    }

    if (sidebar) {
        sidebar.classList.remove("ok", "warning", "error", "checking");
        sidebar.classList.add(overall);
        sidebar.textContent =
            overall === "ok"
                ? "Hệ thống OK"
                : overall === "warning"
                    ? "Cần kiểm tra"
                    : overall === "error"
                        ? "Có lỗi"
                        : "Đang kiểm tra";
    }
}

async function v38ProbeTableGroup(client, key, label, tables) {
    try {
        const results = await Promise.all(
            tables.map(async table => {
                const { error } = await client
                    .from(table)
                    .select("*")
                    .limit(1);

                return {
                    table,
                    error
                };
            })
        );

        const failed = results.filter(item => item.error);

        if (failed.length) {
            return v38HealthCheckItem(
                key,
                label,
                "error",
                `Không đọc được: ${failed.map(item => item.table).join(", ")}.`
            );
        }

        return v38HealthCheckItem(
            key,
            label,
            "ok",
            `Đọc được ${tables.length}/${tables.length} bảng Cloud.`
        );
    } catch (error) {
        return v38HealthCheckItem(
            key,
            label,
            "error",
            error?.message || "Không kiểm tra được bảng Cloud."
        );
    }
}

async function v39ProbeSystemHealthRpc(client) {
    try {
        const { data, error } = await client.rpc("app_health_check");

        if (error) throw error;

        const rpcs = data?.rpcs || {};
        const tables = data?.tables || {};
        const v41 = data?.v41 || {};
        const v47 = data?.v47 || {};
        const v50 = data?.v50 || {};
        const v51 = data?.v51 || {};
        const v52 = data?.v52 || {};
        const v53 = data?.v53 || {};
        const v54 = data?.v54 || {};

        const requiredRpcs = [
            "app_user_context",
            "admin_list_user_roles",
            "admin_set_user_role",
            "replace_shift_data",
            "admin_delete_shopee_data",
            "save_invoice_history",
            "admin_delete_invoice_history",
            "confirm_inventory_return_v51",
            "reverse_inventory_return_v51"
        ];

        const missingRpcs = requiredRpcs.filter(name => rpcs[name] !== true);

        const requiredTables = [
            "app_user_roles",
            "invoice_imports",
            "invoice_groups",
            "invoice_lines",
            "invoice_order_links",
            "inventory_return_receipts"
        ];

        const missingTables = requiredTables.filter(name => tables[name] !== true);

        const requiredV41 = [
            "invoice_import_order_ref_header",
            "invoice_import_order_ref_line_count",
            "invoice_line_order_ref",
            "invoice_line_order_ref_source"
        ];

        const missingV41 = requiredV41.filter(name => v41[name] !== true);

        const requiredV47 = [
            "stocktake_baseline_date",
            "stocktake_theoretical_qty",
            "stocktake_variance_qty",
            "stocktake_variance_value",
            "stocktake_reconcile_status"
        ];
        const missingV47 = requiredV47.filter(name => v47[name] !== true);

        const requiredV50 = ["invoice_order_links_ready"];
        const missingV50 = requiredV50.filter(name => v50[name] !== true);

        const requiredV51 = ["return_receipts_ready", "confirm_return_rpc", "reverse_return_rpc"];
        const missingV51 = requiredV51.filter(name => v51[name] !== true);

        const requiredV52 = ["inventory_lead_time_days", "inventory_target_cover_days"];
        const missingV52 = requiredV52.filter(name => v52[name] !== true);
        const requiredV53 = ["finance_imports_ready", "finance_rows_ready", "finance_begin_rpc", "finance_append_rpc", "finance_delete_rpc"];
        const missingV53 = requiredV53.filter(name => v53[name] !== true);
        const requiredV54 = ["misa_imports_ready", "misa_rows_ready", "misa_begin_rpc", "misa_append_rpc", "misa_finalize_rpc"];
        const missingV54 = requiredV54.filter(name => v54[name] !== true);

        if (missingRpcs.length || missingTables.length || missingV41.length || missingV47.length || missingV50.length || missingV51.length || missingV52.length || missingV53.length || missingV54.length) {
            return v38HealthCheckItem(
                "rpc",
                "RPC & SQL nền V54",
                "error",
                [
                    missingRpcs.length ? `Thiếu RPC: ${missingRpcs.join(", ")}` : "",
                    missingTables.length ? `Thiếu bảng: ${missingTables.join(", ")}` : "",
                    missingV41.length ? `Thiếu cột V41: ${missingV41.join(", ")}` : "",
                    missingV47.length ? `Thiếu cột kiểm kê V47: ${missingV47.join(", ")}` : "",
                    missingV50.length ? `Thiếu V50: ${missingV50.join(", ")}` : "",
                    missingV51.length ? `Thiếu V51: ${missingV51.join(", ")}` : "",
                    missingV52.length ? `Thiếu V52: ${missingV52.join(", ")}` : "",
                    missingV53.length ? `Thiếu V53: ${missingV53.join(", ")}` : "",
                    missingV54.length ? `Thiếu V54: ${missingV54.join(", ")}` : ""
                ].filter(Boolean).join(" · ")
            );
        }

        return v38HealthCheckItem(
            "rpc",
            "RPC & SQL nền V54",
            "ok",
            `Role ${roleLabelV40()} + kiểm kê + MISA 3 nguồn + ghép Mã ĐH của sàn + đối soát tài chính + hàng chờ hóa đơn V55 + đồng bộ trạng thái HĐ V56 đã sẵn sàng.`
        );
    } catch (error) {
        return v38HealthCheckItem(
            "rpc",
            "RPC & SQL nền V54",
            "error",
            `Chưa chạy SQL nền V54 hoặc app_health_check chưa sẵn sàng: ${error?.message || "không rõ lỗi"}.`
        );
    }
}

async function runSystemHealthCheckV38({ silent = false } = {}) {
    if (systemHealthStateV38.running) return;

    systemHealthStateV38.running = true;

    const button = $("btnV38RunHealthCheck");

    if (button) {
        button.disabled = true;
        button.textContent = "Đang kiểm tra...";
    }

    systemHealthStateV38.checks = [
        v38HealthCheckItem(
            "version",
            `Phiên bản ${APP_VERSION}`,
            (
                document.querySelector('link[href*="style-v57-2.css"]')?.getAttribute("href")?.includes(`v=${APP_CACHE_VERSION}`) &&
                document.querySelector('script[src*="script-v57-2.js"]')?.getAttribute("src")?.includes(`v=${APP_CACHE_VERSION}`)
            )
                ? "ok"
                : "warning",
            (
                document.querySelector('link[href*="style-v57-2.css"]')?.getAttribute("href")?.includes(`v=${APP_CACHE_VERSION}`) &&
                document.querySelector('script[src*="script-v57-2.js"]')?.getAttribute("src")?.includes(`v=${APP_CACHE_VERSION}`)
            )
                ? `index.html đang gọi đúng style-v57-2.css?v=${APP_CACHE_VERSION} và script-v57-2.js?v=${APP_CACHE_VERSION}.`
                : `Chưa tải đúng bộ file V57.2. Hãy kiểm tra index.html, style-v57-2.css và script-v57-2.js.`
        ),

        v38HealthCheckItem(
            "xlsx",
            "Thư viện đọc Excel",
            typeof XLSX !== "undefined" ? "ok" : "error",
            typeof XLSX !== "undefined"
                ? "SheetJS XLSX đã sẵn sàng."
                : "Không tải được XLSX; upload Excel sẽ không hoạt động."
        ),

        v38HealthCheckItem(
            "supabase-js",
            "Thư viện Supabase",
            window.supabase?.createClient ? "ok" : "error",
            window.supabase?.createClient
                ? "Supabase JS v2 đã sẵn sàng."
                : "Không tải được thư viện Supabase."
        ),

        v38HealthCheckItem(
            "auth",
            "Phiên đăng nhập",
            state.user ? "ok" : "warning",
            state.user
                ? `Đã đăng nhập: ${state.user.email || "user"}.`
                : "Chưa có session đăng nhập."
        ),

        v38HealthCheckItem(
            "role-v40",
            "Phân quyền V40",
            state.roleLoaded ? "ok" : "warning",
            state.roleLoaded
                ? `Vai trò Cloud: ${roleLabelV40()}.`
                : `Đang dùng fallback ${roleLabelV40()}; hãy kiểm tra SQL V40.`
        )
    ];

    renderSystemHealthPanelV38();

    if (!state.user || !window.supabase?.createClient) {
        systemHealthStateV38.checkedAt = new Date().toISOString();
        systemHealthStateV38.running = false;

        if (button) {
            button.disabled = false;
            button.textContent = "Kiểm tra lại";
        }

        renderSystemHealthPanelV38();
        return;
    }

    try {
        const client = initSupabaseClient();

        const cloudChecks = await Promise.all([
            v38ProbeTableGroup(
                client,
                "shopee-cloud",
                "Dữ liệu Shopee Cloud",
                [DB_ROWS, DB_IMPORTS]
            ),

            v38ProbeTableGroup(
                client,
                "conversion-cloud",
                "Quy đổi SKU Cloud",
                [DB_TARGETS, DB_RULES]
            ),

            v38ProbeTableGroup(
                client,
                "inventory-cloud",
                "Tồn kho Cloud",
                [
                    DB_INVENTORY_ITEMS,
                    DB_INVENTORY_STOCKTAKES,
                    DB_INVENTORY_TRANSACTIONS
                ]
            ),

            v38ProbeTableGroup(
                client,
                "transit-cloud",
                "Luân chuyển Cloud",
                [
                    DB_INVENTORY_TRANSIT_SNAPSHOTS,
                    DB_INVENTORY_TRANSIT_ROWS
                ]
            ),

            v38ProbeTableGroup(
                client,
                "invoice-history-cloud",
                "Lịch sử hóa đơn Cloud",
                [
                    DB_INVOICE_IMPORTS,
                    DB_INVOICE_GROUPS,
                    DB_INVOICE_LINES
                ]
            ),

            v38ProbeTableGroup(
                client,
                "invoice-links-cloud",
                "Cầu nối đơn ↔ hóa đơn V50",
                [DB_INVOICE_ORDER_LINKS]
            ),

            v38ProbeTableGroup(
                client,
                "finance-cloud-v53",
                "Đối soát tài chính Cloud V53",
                [DB_FINANCE_IMPORTS_V53, DB_FINANCE_ROWS_V53]
            ),

            v38ProbeTableGroup(
                client,
                "misa-status-cloud-v54",
                "Trạng thái hóa đơn MISA Cloud V54",
                [DB_MISA_ORDER_IMPORTS_V54, DB_MISA_ORDER_ROWS_V54]
            ),

            v39ProbeSystemHealthRpc(client)
        ]);

        systemHealthStateV38.checks.push(...cloudChecks);
    } catch (error) {
        systemHealthStateV38.checks.push(
            v38HealthCheckItem(
                "cloud-generic",
                "Kết nối Cloud",
                "error",
                error?.message || "Không kiểm tra được Supabase."
            )
        );
    } finally {
        systemHealthStateV38.checkedAt = new Date().toISOString();
        systemHealthStateV38.running = false;

        if (button) {
            button.disabled = false;
            button.textContent = "Kiểm tra lại";
        }

        renderSystemHealthPanelV38();

        if (!silent) {
            const errors = systemHealthStateV38.checks.filter(
                item => item.status === "error"
            ).length;

            const warnings = systemHealthStateV38.checks.filter(
                item => item.status === "warning"
            ).length;

            if (errors) {
                showToast(`Kiểm tra hệ thống: ${errors} lỗi cần xử lý.`);
            } else if (warnings) {
                showToast(`Kiểm tra hệ thống: ${warnings} mục cần xem.`);
            } else {
                showToast("Kiểm tra hệ thống: tất cả mục đều OK.");
            }
        }
    }
}

$("btnV38RunHealthCheck")?.addEventListener("click", () => {
    runSystemHealthCheckV38({ silent: false });
});


/* =========================================================
   V42 - SIDEBAR THU GỌN
========================================================= */
const V42_SIDEBAR_KEY = "rucos_sidebar_collapsed_v45";

function applySidebarCollapsedV42(collapsed, persist = true) {
    const isCollapsed = Boolean(collapsed);
    document.body.classList.toggle("sidebar-collapsed", isCollapsed);

    const button = $("sidebarToggleBtn");
    if (button) {
        button.classList.toggle("collapsed", isCollapsed);
        button.innerHTML = `<span class="sidebar-toggle-chevron">${isCollapsed ? "›" : "‹"}</span>`;
        button.title = isCollapsed ? "Mở rộng menu" : "Thu gọn menu";
        button.setAttribute("aria-label", button.title);
    }

    document.querySelectorAll(".nav-item[data-view]").forEach(item => {
        const labelNode = item.querySelector("span:not(.nav-icon):not(.nav-badge)");
        const labelText = (labelNode?.textContent || "").trim();
        if (labelText) item.title = labelText;
    });

    if (persist) {
        try {
            localStorage.setItem(V42_SIDEBAR_KEY, isCollapsed ? "1" : "0");
        } catch (error) {
            console.warn("Không lưu được trạng thái sidebar:", error);
        }
    }
}

function initSidebarToggleV42() {
    const button = $("sidebarToggleBtn");
    if (!button) return;

    let collapsed = false;
    try {
        collapsed = localStorage.getItem(V42_SIDEBAR_KEY) === "1";
    } catch (error) {
        collapsed = false;
    }

    applySidebarCollapsedV42(collapsed, false);

    button.addEventListener("click", () => {
        const nextState = !document.body.classList.contains("sidebar-collapsed");
        applySidebarCollapsedV42(nextState, true);
    });
}


function renderAll() {
    renderTopFileState();
    renderImportSummary();
    renderSavedDays();
    renderReportDateUi();
    renderDateFilters();
    renderStatusFilters();
    rebuildSkuStatistics();
    renderOverviewFileSummary();
    renderOrdersTab();
    renderReturnsTab();
    renderHistory();
    renderStatsCalendar();
    refreshNavCounts();
    renderInvoiceStats();
    renderMisaInvoiceHubV54();
    renderInvoiceOrderLinksV50();

    // V38/V39
    renderOperationalAlertsV38();
    renderSystemHealthPanelV38();

    // V40
    applyRoleUiV40();
}

async function initApp() {
    try {
        const client = initSupabaseClient();

        const { data, error } = await client.auth.getSession();
        if (error) throw error;

        const session = data?.session || null;

        if (!session) {
            state.user = null;
            updateUserUi();
            loadInventoryLocal();
            renderAll();
            setAuthGateVisible(true);
        } else {
            await enterAuthenticatedApp(session);
        }

        client.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_OUT") {
                state.user = null;
                updateUserUi();
                setAuthGateVisible(true);
                return;
            }

            if (event === "SIGNED_IN" && session?.user) {
                // Tránh chạy trực tiếp truy vấn DB ngay trong callback auth.
                setTimeout(() => {
                    enterAuthenticatedApp(session).catch(error => {
                        console.error("Lỗi tải dữ liệu sau đăng nhập:", error);
                        showAuthError("Đăng nhập được nhưng không tải được database. Kiểm tra SQL/RLS.");
                    });
                }, 0);
            }
        });
    } catch (error) {
        console.error("Lỗi khởi động ứng dụng:", error);
        renderAll();
        setAuthGateVisible(true);
        showAuthError(
            "Không kết nối được Supabase. Kiểm tra Project URL, Publishable key và kết nối Internet."
        );
    }
}

initSidebarToggleV42();
initApp();

// V56.9: nếu trình duyệt tự reload/tab bị discard rồi mở lại, trả đúng vị trí đang xem.
setTimeout(() => restoreScrollPositionV565(), 700);


// V54: khi file chi tiết HĐ được xử lý bởi module cũ, cập nhật lại cột "Chi tiết HĐ".
$("invoiceFileInput")?.addEventListener("change",()=>setTimeout(()=>renderMisaInvoiceHubV54(),1200));
