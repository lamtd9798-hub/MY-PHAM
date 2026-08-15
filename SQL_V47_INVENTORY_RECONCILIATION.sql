-- =============================================================
-- RUCOS V47 - ĐỐI CHIẾU TỒN KHO CHUẨN
-- Chạy TOÀN BỘ file này trong Supabase SQL Editor trước khi up web V47.
-- An toàn khi chạy lại.
-- =============================================================

-- 1. Lưu đối chiếu kiểm kê dưới dạng cột thật, không chỉ nằm trong NOTE.
alter table public.inventory_stocktakes
    add column if not exists baseline_date date;

alter table public.inventory_stocktakes
    add column if not exists theoretical_qty numeric;

alter table public.inventory_stocktakes
    add column if not exists variance_qty numeric;

alter table public.inventory_stocktakes
    add column if not exists variance_value numeric;

alter table public.inventory_stocktakes
    add column if not exists reconcile_status text;

create index if not exists idx_inventory_stocktakes_reconcile
on public.inventory_stocktakes(stocktake_date desc, reconcile_status);

-- 2. Backfill các lần kiểm kê cũ V36/V46 nếu NOTE có cấu trúc cũ.
--    Nếu parse không được thì để NULL; JavaScript V47 vẫn fallback đọc NOTE cũ.
update public.inventory_stocktakes
set theoretical_qty = nullif(
        replace(
            substring(note from 'Lý thuyết ([+-]?[0-9][0-9.,]*)'),
            ',',
            ''
        ),
        ''
    )::numeric
where theoretical_qty is null
  and note ~* 'Lý thuyết [+-]?[0-9]';

update public.inventory_stocktakes
set variance_qty = nullif(
        replace(
            substring(note from 'Chênh ([+-]?[0-9][0-9.,]*)'),
            ',',
            ''
        ),
        ''
    )::numeric
where variance_qty is null
  and note ~* 'Chênh [+-]?[0-9]';

update public.inventory_stocktakes
set variance_value = variance_qty * coalesce(unit_price,0)
where variance_value is null
  and variance_qty is not null;

update public.inventory_stocktakes
set reconcile_status = case
        when variance_qty = 0 then 'MATCH'
        when variance_qty < 0 then 'SHORTAGE'
        when variance_qty > 0 then 'SURPLUS'
        else reconcile_status
    end
where (reconcile_status is null or reconcile_status = '')
  and variance_qty is not null;

update public.inventory_stocktakes
set baseline_date = stocktake_date
where baseline_date is null
  and theoretical_qty is not null;

-- 3. Health check giữ V40/V41 và bổ sung cấu trúc kiểm kê V47.
create or replace function public.app_health_check()
returns jsonb
language sql
security definer
set search_path = public
as $$
select jsonb_build_object(
    'ok', true,
    'version', 'V47',
    'role', public.app_current_role(),
    'tables', jsonb_build_object(
        'app_user_roles', to_regclass('public.app_user_roles') is not null,
        'invoice_imports', to_regclass('public.invoice_imports') is not null,
        'invoice_groups', to_regclass('public.invoice_groups') is not null,
        'invoice_lines', to_regclass('public.invoice_lines') is not null
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
select public.app_health_check() as v47_health_check;

select
    column_name,
    data_type
from information_schema.columns
where table_schema='public'
  and table_name='inventory_stocktakes'
  and column_name in (
      'baseline_date',
      'theoretical_qty',
      'variance_qty',
      'variance_value',
      'reconcile_status'
  )
order by column_name;
