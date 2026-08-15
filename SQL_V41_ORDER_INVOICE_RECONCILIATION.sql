-- =============================================================
-- RUCOS V41 - ĐỐI CHIẾU MÃ ĐƠN SHOPEE ↔ HÓA ĐƠN MISA
--
-- Chạy TOÀN BỘ file này sau khi V40 đã chạy thành công.
-- An toàn khi chạy lại.
--
-- Mục tiêu:
-- 1. Lưu Mã đơn Shopee nếu file MISA có cột tham chiếu.
-- 2. Giữ dữ liệu này trong lịch sử Cloud.
-- 3. Không tự suy đoán mã đơn khi file MISA không có.
-- =============================================================

-- 1. Bổ sung metadata cho mỗi lần import MISA.
alter table public.invoice_imports
    add column if not exists order_ref_header text not null default '';

alter table public.invoice_imports
    add column if not exists order_ref_line_count integer not null default 0;

-- 2. Bổ sung Mã đơn tham chiếu cho từng dòng hóa đơn.
alter table public.invoice_lines
    add column if not exists order_ref text not null default '';

alter table public.invoice_lines
    add column if not exists order_ref_source text not null default '';

create index if not exists idx_invoice_lines_order_ref
    on public.invoice_lines(order_ref)
    where order_ref <> '';

-- 3. RPC lưu lịch sử V41.

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
        order_ref_header,
        order_ref_line_count,
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
        coalesce(p_import ->> 'orderRefHeader', ''),
        coalesce((p_import ->> 'orderRefLineCount')::integer, 0),
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
        issued,
        order_ref,
        order_ref_source
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
        coalesce((x.elem ->> 'issued')::boolean, true),
        coalesce(x.elem ->> 'orderRef', ''),
        coalesce(x.elem ->> 'orderRefSource', '')
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
         with ordinality as x(elem, ordinality);

    return jsonb_build_object(
        'id', v_id,
        'duplicate', false
    );
end;
$$;


-- 4. Health check V41.
create or replace function public.app_health_check()
returns jsonb
language sql
security definer
set search_path = public
as $$
select jsonb_build_object(
    'ok', true,
    'version', 'V41',
    'role', public.app_current_role(),
    'tables', jsonb_build_object(
        'app_user_roles', to_regclass('public.app_user_roles') is not null,
        'invoice_imports', to_regclass('public.invoice_imports') is not null,
        'invoice_groups', to_regclass('public.invoice_groups') is not null,
        'invoice_lines', to_regclass('public.invoice_lines') is not null
    ),
    'v41', jsonb_build_object(
        'invoice_import_order_ref_header', exists(
            select 1
            from information_schema.columns
            where table_schema='public'
              and table_name='invoice_imports'
              and column_name='order_ref_header'
        ),
        'invoice_import_order_ref_line_count', exists(
            select 1
            from information_schema.columns
            where table_schema='public'
              and table_name='invoice_imports'
              and column_name='order_ref_line_count'
        ),
        'invoice_line_order_ref', exists(
            select 1
            from information_schema.columns
            where table_schema='public'
              and table_name='invoice_lines'
              and column_name='order_ref'
        ),
        'invoice_line_order_ref_source', exists(
            select 1
            from information_schema.columns
            where table_schema='public'
              and table_name='invoice_lines'
              and column_name='order_ref_source'
        )
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

revoke all on function public.app_health_check() from public;
grant execute on function public.app_health_check() to authenticated;

notify pgrst, 'reload schema';

-- 5. Kiểm tra cuối.
select public.app_health_check() as v41_health_check;

select
    column_name,
    data_type
from information_schema.columns
where table_schema='public'
  and table_name='invoice_lines'
  and column_name in ('order_ref','order_ref_source')
order by column_name;
