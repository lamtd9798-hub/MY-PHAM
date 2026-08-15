-- =============================================================
-- RUCOS V40 - PHÂN QUYỀN NGƯỜI DÙNG
-- Chạy TOÀN BỘ script này 1 lần trong Supabase SQL Editor.
--
-- Vai trò:
--   ADMIN      : toàn quyền
--   KHO        : tồn kho / nhập-xuất / kiểm kê / snapshot luân chuyển
--   KETOAN     : upload MISA / hóa đơn
--   NHAN_VIEN  : xem dữ liệu + upload Shopee Sáng/Chiều
--
-- An toàn khi chạy lại.
-- =============================================================

-- =============================================================
-- 1. BẢNG ROLE
-- =============================================================
create table if not exists public.app_user_roles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    email text not null default '',
    role text not null default 'NHAN_VIEN'
        check (role in ('ADMIN','KHO','KETOAN','NHAN_VIEN')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id) on delete set null
);

create unique index if not exists idx_app_user_roles_email_lower
on public.app_user_roles(lower(email));

alter table public.app_user_roles enable row level security;

drop policy if exists app_user_roles_select_self on public.app_user_roles;
create policy app_user_roles_select_self
on public.app_user_roles
for select
to authenticated
using (user_id = auth.uid());

revoke all on public.app_user_roles from anon;
grant select on public.app_user_roles to authenticated;

-- =============================================================
-- 2. TỰ TẠO ROLE CHO USER MỚI
-- =============================================================
create or replace function public.handle_new_app_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.app_user_roles (
        user_id,
        email,
        role,
        updated_by
    )
    values (
        new.id,
        lower(coalesce(new.email, '')),
        case
            when lower(coalesce(new.email, '')) = 'lamtd9798@gmail.com'
                then 'ADMIN'
            else 'NHAN_VIEN'
        end,
        null
    )
    on conflict (user_id) do update
    set email = excluded.email,
        role = case
            when lower(excluded.email) = 'lamtd9798@gmail.com'
                then 'ADMIN'
            else public.app_user_roles.role
        end,
        updated_at = now();

    return new;
end;
$$;

drop trigger if exists on_auth_user_created_app_role on auth.users;

create trigger on_auth_user_created_app_role
after insert or update of email
on auth.users
for each row
execute function public.handle_new_app_user_role();

-- Seed toàn bộ tài khoản hiện có.
insert into public.app_user_roles (
    user_id,
    email,
    role
)
select
    u.id,
    lower(coalesce(u.email, '')),
    case
        when lower(coalesce(u.email, '')) = 'lamtd9798@gmail.com'
            then 'ADMIN'
        else 'NHAN_VIEN'
    end
from auth.users u
on conflict (user_id) do update
set email = excluded.email,
    role = case
        when lower(excluded.email) = 'lamtd9798@gmail.com'
            then 'ADMIN'
        else public.app_user_roles.role
    end,
    updated_at = now();

-- =============================================================
-- 3. HÀM ROLE DÙNG CHUNG CHO RLS/RPC
-- =============================================================
create or replace function public.app_current_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_role text;
    v_email text;
begin
    if auth.uid() is null then
        return 'ANON';
    end if;

    v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

    -- ADMIN gốc luôn được giữ quyền.
    if v_email = 'lamtd9798@gmail.com' then
        return 'ADMIN';
    end if;

    select r.role
    into v_role
    from public.app_user_roles r
    where r.user_id = auth.uid()
    limit 1;

    return coalesce(v_role, 'NHAN_VIEN');
end;
$$;

create or replace function public.app_has_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
select
    auth.uid() is not null
    and public.app_current_role() = any(p_roles);
$$;

create or replace function public.app_user_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
select jsonb_build_object(
    'user_id', auth.uid(),
    'email', lower(coalesce(auth.jwt() ->> 'email', '')),
    'role', public.app_current_role()
);
$$;

-- =============================================================
-- 4. ADMIN: XEM / ĐỔI ROLE
-- =============================================================
create or replace function public.admin_list_user_roles()
returns table (
    user_id uuid,
    email text,
    role text,
    created_at timestamptz,
    updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.app_has_role(array['ADMIN']) then
        raise exception 'ADMIN_ONLY';
    end if;

    return query
    select
        u.id,
        lower(coalesce(u.email, '')),
        case
            when lower(coalesce(u.email, '')) = 'lamtd9798@gmail.com'
                then 'ADMIN'
            else coalesce(r.role, 'NHAN_VIEN')
        end,
        coalesce(r.created_at, u.created_at),
        coalesce(r.updated_at, u.updated_at)
    from auth.users u
    left join public.app_user_roles r
        on r.user_id = u.id
    order by
        case
            when lower(coalesce(u.email, '')) = 'lamtd9798@gmail.com'
                then 0
            else 1
        end,
        lower(coalesce(u.email, ''));
end;
$$;

create or replace function public.admin_set_user_role(
    p_user_id uuid,
    p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text;
    v_role text;
begin
    if not public.app_has_role(array['ADMIN']) then
        raise exception 'ADMIN_ONLY';
    end if;

    v_role := upper(trim(coalesce(p_role, '')));

    if v_role not in ('ADMIN','KHO','KETOAN','NHAN_VIEN') then
        raise exception 'INVALID_ROLE';
    end if;

    select lower(coalesce(email, ''))
    into v_email
    from auth.users
    where id = p_user_id;

    if v_email is null then
        raise exception 'USER_NOT_FOUND';
    end if;

    if v_email = 'lamtd9798@gmail.com' and v_role <> 'ADMIN' then
        raise exception 'BOOTSTRAP_ADMIN_CANNOT_BE_DEMOTED';
    end if;

    insert into public.app_user_roles (
        user_id,
        email,
        role,
        updated_by
    )
    values (
        p_user_id,
        v_email,
        v_role,
        auth.uid()
    )
    on conflict (user_id) do update
    set email = excluded.email,
        role = excluded.role,
        updated_by = auth.uid(),
        updated_at = now();

    return jsonb_build_object(
        'user_id', p_user_id,
        'email', v_email,
        'role', v_role
    );
end;
$$;


-- =============================================================
-- 5. SHOPEE UPLOAD: ADMIN / NHAN_VIEN
-- =============================================================
create or replace function public.replace_shift_data(
    p_report_date date,
    p_slot text,
    p_rows jsonb,
    p_import jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    if not public.app_has_role(array['ADMIN','NHAN_VIEN']) then
        raise exception 'ROLE_FORBIDDEN_SHOPEE_UPLOAD';
    end if;

    if p_slot not in ('morning', 'afternoon') then
        raise exception 'INVALID_SLOT';
    end if;

    if p_report_date is null then
        raise exception 'REPORT_DATE_REQUIRED';
    end if;

    if p_rows is null
       or jsonb_typeof(p_rows) <> 'array'
       or jsonb_array_length(p_rows) = 0 then
        raise exception 'EMPTY_UPLOAD_NOT_ALLOWED';
    end if;

    -- Xóa dữ liệu cũ của đúng ngày + đúng ca
    delete from public.shopee_rows
    where report_date = p_report_date
      and import_slot = p_slot;

    delete from public.imports
    where report_date = p_report_date
      and import_slot = p_slot;

    -- Ghi toàn bộ dòng file mới
    insert into public.shopee_rows (
        row_key,
        order_date,
        report_date,
        import_slot,
        order_id,
        status,
        sku,
        product,
        quantity,
        source_file,
        updated_at
    )
    select
        x.row_key,
        x.order_date,
        x.report_date,
        x.import_slot,
        x.order_id,
        x.status,
        x.sku,
        x.product,
        coalesce(x.quantity, 0),
        x.source_file,
        coalesce(x.updated_at, now())
    from jsonb_to_recordset(p_rows) as x(
        row_key text,
        order_date date,
        report_date date,
        import_slot text,
        order_id text,
        status text,
        sku text,
        product text,
        quantity numeric,
        source_file text,
        updated_at timestamptz
    )
    on conflict (row_key)
    do update set
        order_date = excluded.order_date,
        report_date = excluded.report_date,
        import_slot = excluded.import_slot,
        order_id = excluded.order_id,
        status = excluded.status,
        sku = excluded.sku,
        product = excluded.product,
        quantity = excluded.quantity,
        source_file = excluded.source_file,
        updated_at = excluded.updated_at;

    -- Ghi lịch sử file upload
    insert into public.imports (
        file_hash,
        file_name,
        file_size,
        imported_at,
        row_count,
        added,
        updated,
        unchanged,
        dates,
        report_date,
        import_slot,
        source_date,
        selected_statuses,
        saved_all_rows
    )
    values (
        p_import->>'file_hash',
        p_import->>'file_name',
        nullif(p_import->>'file_size', '')::bigint,
        coalesce(nullif(p_import->>'imported_at', '')::timestamptz, now()),
        coalesce(nullif(p_import->>'row_count', '')::integer, 0),
        coalesce(nullif(p_import->>'added', '')::integer, 0),
        coalesce(nullif(p_import->>'updated', '')::integer, 0),
        coalesce(nullif(p_import->>'unchanged', '')::integer, 0),

        array(
            select value::date
            from jsonb_array_elements_text(
                coalesce(p_import->'dates', '[]'::jsonb)
            ) as t(value)
        ),

        p_report_date,
        p_slot,
        nullif(p_import->>'source_date', '')::date,

        array(
            select value
            from jsonb_array_elements_text(
                coalesce(p_import->'selected_statuses', '[]'::jsonb)
            ) as t(value)
        ),

        coalesce((p_import->>'saved_all_rows')::boolean, false)
    )
    on conflict (file_hash)
    do update set
        file_name = excluded.file_name,
        file_size = excluded.file_size,
        imported_at = excluded.imported_at,
        row_count = excluded.row_count,
        added = excluded.added,
        updated = excluded.updated,
        unchanged = excluded.unchanged,
        dates = excluded.dates,
        report_date = excluded.report_date,
        import_slot = excluded.import_slot,
        source_date = excluded.source_date,
        selected_statuses = excluded.selected_statuses,
        saved_all_rows = excluded.saved_all_rows;
end;
$$;


-- =============================================================
-- 6. XÓA SHOPEE: ADMIN
-- =============================================================
create or replace function public.admin_delete_shopee_data(
    p_scope text,
    p_target text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_rows_deleted integer := 0;
    v_imports_deleted integer := 0;
    v_start date;
    v_end date;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    if not public.app_has_role(array['ADMIN']) then
        raise exception 'ADMIN_ONLY';
    end if;

    if p_scope = 'day' then
        if p_target !~ '^\d{4}-\d{2}-\d{2}$' then
            raise exception 'INVALID_DAY';
        end if;

        v_start := p_target::date;

        delete from public.shopee_rows
        where report_date = v_start;
        get diagnostics v_rows_deleted = row_count;

        delete from public.imports
        where report_date = v_start;
        get diagnostics v_imports_deleted = row_count;

    elsif p_scope = 'month' then
        if p_target !~ '^\d{4}-\d{2}$' then
            raise exception 'INVALID_MONTH';
        end if;

        v_start := (p_target || '-01')::date;
        v_end := (v_start + interval '1 month')::date;

        delete from public.shopee_rows
        where report_date >= v_start
          and report_date < v_end;
        get diagnostics v_rows_deleted = row_count;

        delete from public.imports
        where report_date >= v_start
          and report_date < v_end;
        get diagnostics v_imports_deleted = row_count;

    else
        raise exception 'INVALID_SCOPE';
    end if;

    return jsonb_build_object(
        'scope', p_scope,
        'target', p_target,
        'rows_deleted', v_rows_deleted,
        'imports_deleted', v_imports_deleted
    );
end;
$$;


-- =============================================================
-- 7. LƯU HÓA ĐƠN: ADMIN / KETOAN
-- =============================================================
create or replace function public.save_invoice_history(
    p_import jsonb,
    p_groups jsonb default '[]'::jsonb,
    p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user uuid;
    v_email text;
    v_id uuid;
    v_fingerprint text;
begin
    v_user := auth.uid();

    if v_user is null then
        raise exception 'Not authenticated';
    end if;

    if not public.app_has_role(array['ADMIN','KETOAN']) then
        raise exception 'ROLE_FORBIDDEN_INVOICE_UPLOAD';
    end if;

    v_email := coalesce(auth.jwt() ->> 'email', '');
    v_fingerprint := nullif(trim(p_import ->> 'fileFingerprint'), '');

    if v_fingerprint is null then
        raise exception 'Missing file fingerprint';
    end if;

    select id
    into v_id
    from public.invoice_imports
    where file_fingerprint = v_fingerprint
    limit 1;

    if v_id is not null then
        return jsonb_build_object(
            'id', v_id,
            'duplicate', true
        );
    end if;

    insert into public.invoice_imports (
        file_fingerprint,
        file_name,
        imported_at,
        date_from,
        date_to,
        source_row_count,
        issued_line_count,
        unissued_line_count,
        invoice_count,
        product_count,
        total_quantity,
        vat_total,
        payment_total,
        pre_tax_total,
        created_by,
        created_email
    )
    values (
        v_fingerprint,
        coalesce(p_import ->> 'fileName', ''),
        coalesce(nullif(p_import ->> 'importedAt', '')::timestamptz, now()),
        nullif(p_import ->> 'dateFrom', '')::date,
        nullif(p_import ->> 'dateTo', '')::date,
        coalesce((p_import ->> 'sourceRowCount')::integer, 0),
        coalesce((p_import ->> 'issuedLineCount')::integer, 0),
        coalesce((p_import ->> 'unissuedLineCount')::integer, 0),
        coalesce((p_import ->> 'invoiceCount')::integer, 0),
        coalesce((p_import ->> 'productCount')::integer, 0),
        coalesce((p_import ->> 'totalQuantity')::numeric, 0),
        coalesce((p_import ->> 'vatTotal')::numeric, 0),
        coalesce((p_import ->> 'paymentTotal')::numeric, 0),
        coalesce((p_import ->> 'preTaxTotal')::numeric, 0),
        v_user,
        v_email
    )
    returning id into v_id;

    insert into public.invoice_groups (
        import_id,
        sort_order,
        product_name,
        quantity,
        vat,
        payment,
        pre_tax,
        promo
    )
    select
        v_id,
        coalesce((x.elem ->> 'sortOrder')::integer, x.ordinality::integer),
        coalesce(x.elem ->> 'productName', ''),
        coalesce((x.elem ->> 'quantity')::numeric, 0),
        coalesce((x.elem ->> 'vat')::numeric, 0),
        coalesce((x.elem ->> 'payment')::numeric, 0),
        coalesce((x.elem ->> 'preTax')::numeric, 0),
        coalesce((x.elem ->> 'promo')::boolean, false)
    from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb))
         with ordinality as x(elem, ordinality);

    insert into public.invoice_lines (
        import_id,
        sort_order,
        invoice_no,
        invoice_date,
        product_code,
        product_name,
        quantity,
        vat,
        payment,
        pre_tax,
        promo,
        promo_flag,
        tax_status,
        invoice_status,
        issued
    )
    select
        v_id,
        coalesce((x.elem ->> 'sortOrder')::integer, x.ordinality::integer),
        coalesce(x.elem ->> 'invoiceNo', ''),
        nullif(x.elem ->> 'invoiceDate', '')::date,
        coalesce(x.elem ->> 'productCode', ''),
        coalesce(x.elem ->> 'productName', ''),
        coalesce((x.elem ->> 'quantity')::numeric, 0),
        coalesce((x.elem ->> 'vat')::numeric, 0),
        coalesce((x.elem ->> 'payment')::numeric, 0),
        coalesce((x.elem ->> 'preTax')::numeric, 0),
        coalesce((x.elem ->> 'promo')::boolean, false),
        coalesce(x.elem ->> 'promoFlag', ''),
        coalesce(x.elem ->> 'taxStatus', ''),
        coalesce(x.elem ->> 'invoiceStatus', ''),
        coalesce((x.elem ->> 'issued')::boolean, true)
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
         with ordinality as x(elem, ordinality);

    return jsonb_build_object(
        'id', v_id,
        'duplicate', false
    );
end;
$$;


-- =============================================================
-- 8. XÓA LỊCH SỬ HÓA ĐƠN: ADMIN
-- =============================================================
create or replace function public.admin_delete_invoice_history(
    p_import_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_deleted integer;
begin
    if not public.app_has_role(array['ADMIN']) then
        raise exception 'ADMIN_ONLY';
    end if;

    delete from public.invoice_imports
    where id = p_import_id;

    get diagnostics v_deleted = row_count;

    return jsonb_build_object(
        'deleted', v_deleted,
        'id', p_import_id
    );
end;
$$;

-- =============================================================
-- 9. RLS CHẶN GHI SAI ROLE
--    Xóa policy write cũ và tạo lại chính xác theo vai trò.
-- =============================================================

-- SHOPEE: tất cả authenticated được xem.
drop policy if exists "authenticated shopee rows" on public.shopee_rows;
drop policy if exists shopee_rows_v40_select on public.shopee_rows;
create policy shopee_rows_v40_select
on public.shopee_rows
for select to authenticated
using (true);

drop policy if exists "authenticated imports" on public.imports;
drop policy if exists imports_v40_select on public.imports;
create policy imports_v40_select
on public.imports
for select to authenticated
using (true);

-- Direct write Shopee chỉ ADMIN/NHAN_VIEN.
drop policy if exists shopee_rows_v40_insert on public.shopee_rows;
create policy shopee_rows_v40_insert
on public.shopee_rows
for insert to authenticated
with check (public.app_has_role(array['ADMIN','NHAN_VIEN']));

drop policy if exists shopee_rows_v40_update on public.shopee_rows;
create policy shopee_rows_v40_update
on public.shopee_rows
for update to authenticated
using (public.app_has_role(array['ADMIN','NHAN_VIEN']))
with check (public.app_has_role(array['ADMIN','NHAN_VIEN']));

drop policy if exists imports_v40_insert on public.imports;
create policy imports_v40_insert
on public.imports
for insert to authenticated
with check (public.app_has_role(array['ADMIN','NHAN_VIEN']));

drop policy if exists imports_v40_update on public.imports;
create policy imports_v40_update
on public.imports
for update to authenticated
using (public.app_has_role(array['ADMIN','NHAN_VIEN']))
with check (public.app_has_role(array['ADMIN','NHAN_VIEN']));

-- DELETE trực tiếp vẫn khóa; chỉ xóa qua RPC ADMIN + re-auth trên web.
revoke delete on public.shopee_rows from authenticated;
revoke delete on public.imports from authenticated;

-- QUY ĐỔI: chỉ ADMIN ghi.
drop policy if exists "authenticated conversion targets" on public.conversion_targets;
drop policy if exists conversion_targets_v40_select on public.conversion_targets;
create policy conversion_targets_v40_select
on public.conversion_targets
for select to authenticated
using (true);

drop policy if exists conversion_targets_v40_insert on public.conversion_targets;
create policy conversion_targets_v40_insert
on public.conversion_targets
for insert to authenticated
with check (public.app_has_role(array['ADMIN']));

drop policy if exists conversion_targets_v40_update on public.conversion_targets;
create policy conversion_targets_v40_update
on public.conversion_targets
for update to authenticated
using (public.app_has_role(array['ADMIN']))
with check (public.app_has_role(array['ADMIN']));

drop policy if exists conversion_targets_v40_delete on public.conversion_targets;
create policy conversion_targets_v40_delete
on public.conversion_targets
for delete to authenticated
using (public.app_has_role(array['ADMIN']));

drop policy if exists "authenticated conversion rules" on public.conversion_rules;
drop policy if exists conversion_rules_v40_select on public.conversion_rules;
create policy conversion_rules_v40_select
on public.conversion_rules
for select to authenticated
using (true);

drop policy if exists conversion_rules_v40_insert on public.conversion_rules;
create policy conversion_rules_v40_insert
on public.conversion_rules
for insert to authenticated
with check (public.app_has_role(array['ADMIN']));

drop policy if exists conversion_rules_v40_update on public.conversion_rules;
create policy conversion_rules_v40_update
on public.conversion_rules
for update to authenticated
using (public.app_has_role(array['ADMIN']))
with check (public.app_has_role(array['ADMIN']));

drop policy if exists conversion_rules_v40_delete on public.conversion_rules;
create policy conversion_rules_v40_delete
on public.conversion_rules
for delete to authenticated
using (public.app_has_role(array['ADMIN']));

-- INVENTORY ITEMS: ADMIN/KHO.
drop policy if exists inventory_items_insert on public.inventory_items;
create policy inventory_items_insert
on public.inventory_items
for insert to authenticated
with check (public.app_has_role(array['ADMIN','KHO']));

drop policy if exists inventory_items_update on public.inventory_items;
create policy inventory_items_update
on public.inventory_items
for update to authenticated
using (public.app_has_role(array['ADMIN','KHO']))
with check (public.app_has_role(array['ADMIN','KHO']));

-- STOCKTAKE: ADMIN/KHO.
drop policy if exists inventory_stocktakes_insert on public.inventory_stocktakes;
create policy inventory_stocktakes_insert
on public.inventory_stocktakes
for insert to authenticated
with check (public.app_has_role(array['ADMIN','KHO']));

-- INVENTORY TRANSACTIONS: ADMIN/KHO.
drop policy if exists inventory_transactions_insert on public.inventory_transactions;
create policy inventory_transactions_insert
on public.inventory_transactions
for insert to authenticated
with check (public.app_has_role(array['ADMIN','KHO']));

drop policy if exists inventory_transactions_update on public.inventory_transactions;
create policy inventory_transactions_update
on public.inventory_transactions
for update to authenticated
using (public.app_has_role(array['ADMIN','KHO']))
with check (public.app_has_role(array['ADMIN','KHO']));

drop policy if exists inventory_transactions_delete on public.inventory_transactions;
create policy inventory_transactions_delete
on public.inventory_transactions
for delete to authenticated
using (public.app_has_role(array['ADMIN','KHO']));

-- TRANSIT SNAPSHOT: ADMIN/KHO.
drop policy if exists inventory_transit_snapshots_insert on public.inventory_transit_snapshots;
create policy inventory_transit_snapshots_insert
on public.inventory_transit_snapshots
for insert to authenticated
with check (public.app_has_role(array['ADMIN','KHO']));

drop policy if exists inventory_transit_snapshots_delete on public.inventory_transit_snapshots;
create policy inventory_transit_snapshots_delete
on public.inventory_transit_snapshots
for delete to authenticated
using (public.app_has_role(array['ADMIN','KHO']));

drop policy if exists inventory_transit_rows_insert on public.inventory_transit_rows;
create policy inventory_transit_rows_insert
on public.inventory_transit_rows
for insert to authenticated
with check (public.app_has_role(array['ADMIN','KHO']));

drop policy if exists inventory_transit_rows_delete on public.inventory_transit_rows;
create policy inventory_transit_rows_delete
on public.inventory_transit_rows
for delete to authenticated
using (public.app_has_role(array['ADMIN','KHO']));

-- =============================================================
-- 10. HEALTH CHECK V40
-- =============================================================
create or replace function public.app_health_check()
returns jsonb
language sql
security definer
set search_path = public
as $$
select jsonb_build_object(
    'ok', true,
    'version', 'V40',
    'role', public.app_current_role(),
    'tables', jsonb_build_object(
        'app_user_roles', to_regclass('public.app_user_roles') is not null,
        'invoice_imports', to_regclass('public.invoice_imports') is not null,
        'invoice_groups', to_regclass('public.invoice_groups') is not null,
        'invoice_lines', to_regclass('public.invoice_lines') is not null
    ),
    'rpcs', jsonb_build_object(
        'app_user_context', exists(
            select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname='app_user_context'
        ),
        'admin_list_user_roles', exists(
            select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname='admin_list_user_roles'
        ),
        'admin_set_user_role', exists(
            select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname='admin_set_user_role'
        ),
        'replace_shift_data', exists(
            select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname='replace_shift_data'
        ),
        'admin_delete_shopee_data', exists(
            select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname='admin_delete_shopee_data'
        ),
        'save_invoice_history', exists(
            select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname='save_invoice_history'
        ),
        'admin_delete_invoice_history', exists(
            select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname='admin_delete_invoice_history'
        )
    )
);
$$;

-- =============================================================
-- 11. FUNCTION PERMISSIONS
-- =============================================================
revoke all on function public.app_current_role() from public;
revoke all on function public.app_has_role(text[]) from public;
revoke all on function public.app_user_context() from public;
revoke all on function public.admin_list_user_roles() from public;
revoke all on function public.admin_set_user_role(uuid,text) from public;
revoke all on function public.replace_shift_data(date,text,jsonb,jsonb) from public;
revoke all on function public.admin_delete_shopee_data(text,text) from public;
revoke all on function public.save_invoice_history(jsonb,jsonb,jsonb) from public;
revoke all on function public.admin_delete_invoice_history(uuid) from public;
revoke all on function public.app_health_check() from public;

grant execute on function public.app_current_role() to authenticated;
grant execute on function public.app_has_role(text[]) to authenticated;
grant execute on function public.app_user_context() to authenticated;
grant execute on function public.admin_list_user_roles() to authenticated;
grant execute on function public.admin_set_user_role(uuid,text) to authenticated;
grant execute on function public.replace_shift_data(date,text,jsonb,jsonb) to authenticated;
grant execute on function public.admin_delete_shopee_data(text,text) to authenticated;
grant execute on function public.save_invoice_history(jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.admin_delete_invoice_history(uuid) to authenticated;
grant execute on function public.app_health_check() to authenticated;

notify pgrst, 'reload schema';

-- =============================================================
-- 12. KIỂM TRA CUỐI
-- =============================================================
select
    email,
    role,
    updated_at
from public.app_user_roles
order by
    case when email = 'lamtd9798@gmail.com' then 0 else 1 end,
    email;

select public.app_health_check() as v40_health_check;
