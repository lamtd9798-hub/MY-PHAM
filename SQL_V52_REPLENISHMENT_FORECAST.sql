-- =============================================================
-- RUCOS V52 - DỰ BÁO TỒN & ĐỀ XUẤT NHẬP HÀNG
-- Chạy sau V51. An toàn khi chạy lại.
-- =============================================================

alter table public.inventory_items
    add column if not exists lead_time_days integer not null default 5;

alter table public.inventory_items
    add column if not exists target_cover_days integer not null default 14;

update public.inventory_items
set lead_time_days = 5
where lead_time_days is null or lead_time_days < 0;

update public.inventory_items
set target_cover_days = 14
where target_cover_days is null or target_cover_days < 1;

alter table public.inventory_items
    drop constraint if exists inventory_items_lead_time_days_check;
alter table public.inventory_items
    add constraint inventory_items_lead_time_days_check
    check (lead_time_days between 0 and 365);

alter table public.inventory_items
    drop constraint if exists inventory_items_target_cover_days_check;
alter table public.inventory_items
    add constraint inventory_items_target_cover_days_check
    check (target_cover_days between 1 and 365);

-- Health check V52
create or replace function public.app_health_check()
returns jsonb
language sql
security definer
set search_path = public
as $$
select jsonb_build_object(
    'ok', true,
    'version', 'V52',
    'role', public.app_current_role(),
    'tables', jsonb_build_object(
        'app_user_roles', to_regclass('public.app_user_roles') is not null,
        'invoice_imports', to_regclass('public.invoice_imports') is not null,
        'invoice_groups', to_regclass('public.invoice_groups') is not null,
        'invoice_lines', to_regclass('public.invoice_lines') is not null,
        'invoice_order_links', to_regclass('public.invoice_order_links') is not null,
        'inventory_return_receipts', to_regclass('public.inventory_return_receipts') is not null
    ),
    'v41', jsonb_build_object(
        'invoice_import_order_ref_header', exists(select 1 from information_schema.columns where table_schema='public' and table_name='invoice_imports' and column_name='order_ref_header'),
        'invoice_import_order_ref_line_count', exists(select 1 from information_schema.columns where table_schema='public' and table_name='invoice_imports' and column_name='order_ref_line_count'),
        'invoice_line_order_ref', exists(select 1 from information_schema.columns where table_schema='public' and table_name='invoice_lines' and column_name='order_ref'),
        'invoice_line_order_ref_source', exists(select 1 from information_schema.columns where table_schema='public' and table_name='invoice_lines' and column_name='order_ref_source')
    ),
    'v47', jsonb_build_object(
        'stocktake_baseline_date', exists(select 1 from information_schema.columns where table_schema='public' and table_name='inventory_stocktakes' and column_name='baseline_date'),
        'stocktake_theoretical_qty', exists(select 1 from information_schema.columns where table_schema='public' and table_name='inventory_stocktakes' and column_name='theoretical_qty'),
        'stocktake_variance_qty', exists(select 1 from information_schema.columns where table_schema='public' and table_name='inventory_stocktakes' and column_name='variance_qty'),
        'stocktake_variance_value', exists(select 1 from information_schema.columns where table_schema='public' and table_name='inventory_stocktakes' and column_name='variance_value'),
        'stocktake_reconcile_status', exists(select 1 from information_schema.columns where table_schema='public' and table_name='inventory_stocktakes' and column_name='reconcile_status')
    ),
    'v50', jsonb_build_object(
        'invoice_order_links_ready', to_regclass('public.invoice_order_links') is not null
    ),
    'v51', jsonb_build_object(
        'return_receipts_ready', to_regclass('public.inventory_return_receipts') is not null,
        'confirm_return_rpc', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='confirm_inventory_return_v51'),
        'reverse_return_rpc', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='reverse_inventory_return_v51')
    ),
    'v52', jsonb_build_object(
        'inventory_lead_time_days', exists(select 1 from information_schema.columns where table_schema='public' and table_name='inventory_items' and column_name='lead_time_days'),
        'inventory_target_cover_days', exists(select 1 from information_schema.columns where table_schema='public' and table_name='inventory_items' and column_name='target_cover_days')
    ),
    'rpcs', jsonb_build_object(
        'app_user_context', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='app_user_context'),
        'admin_list_user_roles', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_list_user_roles'),
        'admin_set_user_role', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_set_user_role'),
        'replace_shift_data', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='replace_shift_data'),
        'admin_delete_shopee_data', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_delete_shopee_data'),
        'save_invoice_history', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_invoice_history'),
        'admin_delete_invoice_history', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_delete_invoice_history'),
        'confirm_inventory_return_v51', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='confirm_inventory_return_v51'),
        'reverse_inventory_return_v51', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='reverse_inventory_return_v51')
    )
);
$$;

revoke all on function public.app_health_check() from public;
grant execute on function public.app_health_check() to authenticated;

notify pgrst, 'reload schema';

select public.app_health_check() as v52_health_check;
select item_code, name, safety_stock, lead_time_days, target_cover_days
from public.inventory_items
order by sort_order;
