-- =============================================================
-- RUCOS V51 - HOÀN / HỦY & NHẬP LẠI KHO
-- Chạy sau V50. An toàn khi chạy lại.
-- =============================================================

create table if not exists public.inventory_return_receipts (
    id uuid primary key default gen_random_uuid(),
    order_id text not null,
    item_code text not null references public.inventory_items(item_code) on delete restrict,
    quantity numeric not null check (quantity > 0),
    received_date date not null,
    source_status text not null default '',
    note text not null default '',
    transaction_id uuid not null unique references public.inventory_transactions(id) on delete cascade,
    confirmed_by uuid references auth.users(id) on delete set null,
    confirmed_email text not null default '',
    created_at timestamptz not null default now(),
    constraint inventory_return_receipts_order_item_unique unique(order_id, item_code)
);

create index if not exists idx_inventory_return_receipts_order
on public.inventory_return_receipts(order_id);

create index if not exists idx_inventory_return_receipts_item
on public.inventory_return_receipts(item_code);

create index if not exists idx_inventory_return_receipts_received_date
on public.inventory_return_receipts(received_date desc);

alter table public.inventory_return_receipts enable row level security;
grant select on public.inventory_return_receipts to authenticated;

drop policy if exists inventory_return_receipts_select on public.inventory_return_receipts;
create policy inventory_return_receipts_select
on public.inventory_return_receipts
for select to authenticated
using (true);

-- Không cho ghi trực tiếp. Phải qua RPC để bảo đảm tạo/xóa cùng transaction kho.
revoke insert, update, delete on public.inventory_return_receipts from authenticated;

create or replace function public.confirm_inventory_return_v51(
    p_order_id text,
    p_item_code text,
    p_quantity numeric,
    p_received_date date,
    p_source_status text default '',
    p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tx_id uuid;
    v_receipt_id uuid;
    v_email text := '';
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    if public.app_current_role() not in ('ADMIN','KHO') then
        raise exception 'INVENTORY_PERMISSION_REQUIRED';
    end if;

    if nullif(trim(p_order_id),'') is null then
        raise exception 'ORDER_ID_REQUIRED';
    end if;

    if nullif(trim(p_item_code),'') is null then
        raise exception 'ITEM_CODE_REQUIRED';
    end if;

    if coalesce(p_quantity,0) <= 0 then
        raise exception 'INVALID_QUANTITY';
    end if;

    if p_received_date is null then
        raise exception 'RECEIVED_DATE_REQUIRED';
    end if;

    if not exists(select 1 from public.inventory_items where item_code=p_item_code) then
        raise exception 'ITEM_NOT_FOUND';
    end if;

    if exists(
        select 1 from public.inventory_return_receipts
        where upper(trim(order_id))=upper(trim(p_order_id))
          and item_code=p_item_code
    ) then
        raise exception 'RETURN_ALREADY_CONFIRMED';
    end if;

    select coalesce(email,'') into v_email
    from auth.users where id=auth.uid();

    insert into public.inventory_transactions(
        transaction_date,
        item_code,
        transaction_type,
        quantity,
        reference,
        note,
        source,
        created_by
    ) values (
        p_received_date,
        p_item_code,
        'RETURN_IN',
        abs(p_quantity),
        'SHOPEE_RETURN:' || trim(p_order_id),
        trim(coalesce(p_note,'')),
        'shopee_return_v51',
        auth.uid()
    ) returning id into v_tx_id;

    insert into public.inventory_return_receipts(
        order_id,
        item_code,
        quantity,
        received_date,
        source_status,
        note,
        transaction_id,
        confirmed_by,
        confirmed_email
    ) values (
        trim(p_order_id),
        p_item_code,
        abs(p_quantity),
        p_received_date,
        trim(coalesce(p_source_status,'')),
        trim(coalesce(p_note,'')),
        v_tx_id,
        auth.uid(),
        v_email
    ) returning id into v_receipt_id;

    return jsonb_build_object(
        'ok', true,
        'receipt_id', v_receipt_id,
        'transaction_id', v_tx_id,
        'order_id', trim(p_order_id),
        'item_code', p_item_code,
        'quantity', abs(p_quantity),
        'received_date', p_received_date
    );
end;
$$;

create or replace function public.reverse_inventory_return_v51(
    p_receipt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tx_id uuid;
    v_order_id text;
    v_item_code text;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    if public.app_current_role() not in ('ADMIN','KHO') then
        raise exception 'INVENTORY_PERMISSION_REQUIRED';
    end if;

    select transaction_id, order_id, item_code
    into v_tx_id, v_order_id, v_item_code
    from public.inventory_return_receipts
    where id=p_receipt_id;

    if v_tx_id is null then
        raise exception 'RETURN_RECEIPT_NOT_FOUND';
    end if;

    -- Receipt có FK ON DELETE CASCADE từ transaction.
    delete from public.inventory_transactions where id=v_tx_id;

    return jsonb_build_object(
        'ok', true,
        'receipt_id', p_receipt_id,
        'order_id', v_order_id,
        'item_code', v_item_code
    );
end;
$$;

revoke all on function public.confirm_inventory_return_v51(text,text,numeric,date,text,text) from public;
grant execute on function public.confirm_inventory_return_v51(text,text,numeric,date,text,text) to authenticated;

revoke all on function public.reverse_inventory_return_v51(uuid) from public;
grant execute on function public.reverse_inventory_return_v51(uuid) to authenticated;

-- V51 health check: giữ các kiểm tra trước + bổ sung return receipts/RPC.
create or replace function public.app_health_check()
returns jsonb
language sql
security definer
set search_path = public
as $$
select jsonb_build_object(
    'ok', true,
    'version', 'V51',
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

select public.app_health_check() as v51_health_check;
select count(*) as return_receipt_count from public.inventory_return_receipts;
