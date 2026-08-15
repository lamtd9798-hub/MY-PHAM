-- =============================================================
-- RUCOS V50 - CẦU NỐI MÃ ĐƠN SHOPEE ↔ SỐ HÓA ĐƠN MISA
-- Chạy TOÀN BỘ file này sau V47/V49.
-- An toàn khi chạy lại.
-- =============================================================

-- 1. Bảng cầu nối 1 đơn Shopee ↔ 1 hóa đơn MISA.
create table if not exists public.invoice_order_links (
    id uuid primary key default gen_random_uuid(),
    shopee_order_id text not null,
    invoice_no text not null,
    invoice_date date,
    source text not null default 'manual',
    confidence text not null default 'confirmed',
    note text not null default '',
    created_by uuid default auth.uid(),
    created_email text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint invoice_order_links_order_unique unique (shopee_order_id),
    constraint invoice_order_links_invoice_unique unique (invoice_no),
    constraint invoice_order_links_source_chk check (
        source in ('bridge_excel','manual','suggestion_confirmed','misa_direct')
    ),
    constraint invoice_order_links_confidence_chk check (
        confidence in ('confirmed','exact')
    )
);

create index if not exists idx_invoice_order_links_order
    on public.invoice_order_links(shopee_order_id);

create index if not exists idx_invoice_order_links_invoice
    on public.invoice_order_links(invoice_no);

create index if not exists idx_invoice_order_links_updated
    on public.invoice_order_links(updated_at desc);

-- 2. RLS: mọi tài khoản đăng nhập được xem; ADMIN/KẾ TOÁN được quản lý.
alter table public.invoice_order_links enable row level security;

grant select, insert, update, delete on public.invoice_order_links to authenticated;

drop policy if exists invoice_order_links_select_authenticated on public.invoice_order_links;
create policy invoice_order_links_select_authenticated
on public.invoice_order_links
for select
to authenticated
using (true);

drop policy if exists invoice_order_links_insert_accounting on public.invoice_order_links;
create policy invoice_order_links_insert_accounting
on public.invoice_order_links
for insert
to authenticated
with check (public.app_current_role() in ('ADMIN','KETOAN'));

drop policy if exists invoice_order_links_update_accounting on public.invoice_order_links;
create policy invoice_order_links_update_accounting
on public.invoice_order_links
for update
to authenticated
using (public.app_current_role() in ('ADMIN','KETOAN'))
with check (public.app_current_role() in ('ADMIN','KETOAN'));

drop policy if exists invoice_order_links_delete_accounting on public.invoice_order_links;
create policy invoice_order_links_delete_accounting
on public.invoice_order_links
for delete
to authenticated
using (public.app_current_role() in ('ADMIN','KETOAN'));

-- 3. Health check V50: giữ V41 + V47 và bổ sung bảng cầu nối.
create or replace function public.app_health_check()
returns jsonb
language sql
security definer
set search_path = public
as $$
select jsonb_build_object(
    'ok', true,
    'version', 'V50',
    'role', public.app_current_role(),
    'tables', jsonb_build_object(
        'app_user_roles', to_regclass('public.app_user_roles') is not null,
        'invoice_imports', to_regclass('public.invoice_imports') is not null,
        'invoice_groups', to_regclass('public.invoice_groups') is not null,
        'invoice_lines', to_regclass('public.invoice_lines') is not null,
        'invoice_order_links', to_regclass('public.invoice_order_links') is not null
    ),
    'v41', jsonb_build_object(
        'invoice_import_order_ref_header', exists(
            select 1 from information_schema.columns
            where table_schema='public' and table_name='invoice_imports' and column_name='order_ref_header'
        ),
        'invoice_import_order_ref_line_count', exists(
            select 1 from information_schema.columns
            where table_schema='public' and table_name='invoice_imports' and column_name='order_ref_line_count'
        ),
        'invoice_line_order_ref', exists(
            select 1 from information_schema.columns
            where table_schema='public' and table_name='invoice_lines' and column_name='order_ref'
        ),
        'invoice_line_order_ref_source', exists(
            select 1 from information_schema.columns
            where table_schema='public' and table_name='invoice_lines' and column_name='order_ref_source'
        )
    ),
    'v47', jsonb_build_object(
        'stocktake_baseline_date', exists(
            select 1 from information_schema.columns
            where table_schema='public' and table_name='inventory_stocktakes' and column_name='baseline_date'
        ),
        'stocktake_theoretical_qty', exists(
            select 1 from information_schema.columns
            where table_schema='public' and table_name='inventory_stocktakes' and column_name='theoretical_qty'
        ),
        'stocktake_variance_qty', exists(
            select 1 from information_schema.columns
            where table_schema='public' and table_name='inventory_stocktakes' and column_name='variance_qty'
        ),
        'stocktake_variance_value', exists(
            select 1 from information_schema.columns
            where table_schema='public' and table_name='inventory_stocktakes' and column_name='variance_value'
        ),
        'stocktake_reconcile_status', exists(
            select 1 from information_schema.columns
            where table_schema='public' and table_name='inventory_stocktakes' and column_name='reconcile_status'
        )
    ),
    'v50', jsonb_build_object(
        'invoice_order_links_ready', to_regclass('public.invoice_order_links') is not null
    ),
    'rpcs', jsonb_build_object(
        'app_user_context', exists(
            select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='app_user_context'
        ),
        'admin_list_user_roles', exists(
            select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='admin_list_user_roles'
        ),
        'admin_set_user_role', exists(
            select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='admin_set_user_role'
        ),
        'replace_shift_data', exists(
            select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='replace_shift_data'
        ),
        'admin_delete_shopee_data', exists(
            select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='admin_delete_shopee_data'
        ),
        'save_invoice_history', exists(
            select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='save_invoice_history'
        ),
        'admin_delete_invoice_history', exists(
            select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='admin_delete_invoice_history'
        )
    )
);
$$;

revoke all on function public.app_health_check() from public;
grant execute on function public.app_health_check() to authenticated;

notify pgrst, 'reload schema';

-- 4. Kiểm tra cuối.
select public.app_health_check() as v50_health_check;
select count(*) as invoice_order_link_count from public.invoice_order_links;
