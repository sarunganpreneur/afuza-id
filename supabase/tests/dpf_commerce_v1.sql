create or replace function pg_temp.assert_throws(p_statement text, p_message text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_statement;
  exception when others then
    if sqlerrm like '%' || p_message || '%' then return; end if;
    raise;
  end;
  raise exception 'Expected statement to fail with: %', p_message;
end;
$$;

insert into public.products (
  id, sku, slug, title, headline, category, subcategory, niche, buyer, problem,
  use_case, product_type, format, price, traffic_role, status, keywords
) values
  ('d0f00000-0000-4000-8000-000000000001', 'AFZ-SPR-HPP-001', 'kalkulator-hpp-harga-jual-umkm',
   'Kalkulator HPP & Harga Jual UMKM', 'Hitung HPP dan harga jual untuk usaha mikro dan kecil.',
   'Bisnis & UMKM', 'Keuangan', 'UMKM', 'Pemilik usaha', 'Sulit menghitung HPP dan harga jual yang tepat.',
   'Membantu pemilik usaha menentukan harga jual yang sehat.', 'Spreadsheet', array['XLSX'],
  19000, 'ACQUISITION', 'PUBLISHED', array['hpp','harga jual','umkm']),
  ('d0f00000-0000-4000-8000-000000000002', 'AFZ-SPR-OTHER-001', 'produk-kedua',
   'Produk Kedua', 'Produk untuk konflik idempotency.', 'Bisnis & UMKM', 'Keuangan', 'UMKM',
   'Pemilik usaha', 'Problem', 'Use case', 'Spreadsheet', array['XLSX'],
   19000, 'ACQUISITION', 'PUBLISHED', array['test']),
  ('d0f00000-0000-4000-8000-000000000003', 'AFZ-SPR-DRAFT-001', 'produk-draft',
   'Produk Draft', 'Produk yang belum diterbitkan.', 'Bisnis & UMKM', 'Keuangan', 'UMKM',
   'Pemilik usaha', 'Problem', 'Use case', 'Spreadsheet', array['XLSX'],
    19000, 'ACQUISITION', 'DRAFT', array['test']),
    ('d0f00000-0000-4000-8000-000000000021', 'AFZ-HPP-CAF-001', 'cafe-hpp',
    'Cafe HPP', 'Cafe core product.', 'Bisnis & UMKM', 'Keuangan', 'Cafe',
    'Pemilik cafe', 'Problem', 'Use case', 'Spreadsheet', array['XLSX'],
    19000, 'ACQUISITION', 'PUBLISHED', array['cafe']),
    ('d0f00000-0000-4000-8000-000000000022', 'AFZ-BOOK-CAF-001', 'cafe-bookkeeping',
    'Cafe Bookkeeping', 'Cafe addon product.', 'Bisnis & UMKM', 'Keuangan', 'Cafe',
    'Pemilik cafe', 'Problem', 'Use case', 'Spreadsheet', array['XLSX'],
    19000, 'ADD_ON', 'PUBLISHED', array['cafe']),
    ('d0f00000-0000-4000-8000-000000000023', 'AFZ-BOOK-LDY-001', 'laundry-bookkeeping',
    'Laundry Bookkeeping', 'Laundry addon product.', 'Bisnis & UMKM', 'Keuangan', 'Laundry',
    'Pemilik laundry', 'Problem', 'Use case', 'Spreadsheet', array['XLSX'],
    19000, 'ADD_ON', 'PUBLISHED', array['laundry']);

insert into public.product_addons (id, product_id, addon_product_id, title, description, price, active, sort_order)
values
  ('d0f00000-0000-4000-8000-000000000011', 'd0f00000-0000-4000-8000-000000000001', null, 'Pembukuan Usaha', 'Template pembukuan usaha harian.', 19000, true, 1),
  ('d0f00000-0000-4000-8000-000000000012', 'd0f00000-0000-4000-8000-000000000001', null, 'Inventory Tracker', 'Tracker stok barang dan omzet.', 15000, true, 2),
  ('d0f00000-0000-4000-8000-000000000013', 'd0f00000-0000-4000-8000-000000000001', null, 'Disabled Add-on', 'Inactive test item.', 5000, false, 3),
  ('d0f00000-0000-4000-8000-000000000031', 'd0f00000-0000-4000-8000-000000000021', 'd0f00000-0000-4000-8000-000000000022', 'Cafe same-niche addon', 'Valid Cafe addon relation.', 19000, true, 1),
  ('d0f00000-0000-4000-8000-000000000032', 'd0f00000-0000-4000-8000-000000000021', 'd0f00000-0000-4000-8000-000000000023', 'Laundry wrong-niche addon', 'Misconfigured cross-niche relation.', 19000, true, 2);

insert into public.delivery_assets(product_id, addon_id, storage_key, file_name)
values
  ('d0f00000-0000-4000-8000-000000000001', null, 'core/private.xlsx', 'core.xlsx'),
  ('d0f00000-0000-4000-8000-000000000001', 'd0f00000-0000-4000-8000-000000000011', 'addon-a/private.xlsx', 'addon-a.xlsx'),
  ('d0f00000-0000-4000-8000-000000000001', 'd0f00000-0000-4000-8000-000000000012', 'addon-b/private.xlsx', 'addon-b.xlsx');

do $test$
declare
  v_full jsonb;
  v_replay jsonb;
  v_core_only jsonb;
  v_addon_a_only jsonb;
  v_second_full jsonb;
  v_paid jsonb;
  v_paid_replay jsonb;
  v_payment_id uuid;
  v_entitlement_count integer;
  v_asset_count integer;
  v_core_order_item_id uuid;
  v_cafe_checkout jsonb;
  v_order_count integer;
  v_cross_niche_addon_id uuid := 'd0f00000-0000-4000-8000-000000000032';
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

  perform pg_temp.assert_throws(
    $$insert into public.products(id, sku, slug, title, headline, category, subcategory, niche, buyer, problem, use_case, product_type, price, traffic_role)
      values ('d0f00000-0000-4000-8000-000000000004', 'AFZ-SPR-LOW-001', 'produk-di-bawah-minimum', 'Harga Rendah', 'H', 'C', 'S', 'N', 'B', 'P', 'U', 'T', 9999, 'ACQUISITION')$$,
    'products_price_check'
  );
  perform pg_temp.assert_throws(
    $$select public.dpf_create_checkout('d0f00000-0000-4000-8000-000000000003', '{}'::uuid[], 1, 'unpublished-001')$$,
    'Product is not available'
  );
  perform pg_temp.assert_throws(
    $$select public.dpf_create_checkout('d0f00000-0000-4000-8000-000000000001', array['d0f00000-0000-4000-8000-000000000013']::uuid[], 1, 'disabled-addon-01')$$,
    'One or more add-ons are not available'
  );

  v_full := public.dpf_create_checkout(
    'd0f00000-0000-4000-8000-000000000001',
    array['d0f00000-0000-4000-8000-000000000011','d0f00000-0000-4000-8000-000000000012']::uuid[],
    1, 'same-key-full-001'
  );
  if (v_full->>'total')::integer <> 53000 then raise exception 'Expected full total 53000, got %', v_full; end if;

  update public.products set price = 25000, status = 'ARCHIVED' where id = 'd0f00000-0000-4000-8000-000000000001';
  update public.product_addons set active = false where product_id = 'd0f00000-0000-4000-8000-000000000001';
  v_replay := public.dpf_create_checkout(
    'd0f00000-0000-4000-8000-000000000001',
    array['d0f00000-0000-4000-8000-000000000012','d0f00000-0000-4000-8000-000000000011']::uuid[],
    1, 'same-key-full-001'
  );
  if v_replay->>'orderId' <> v_full->>'orderId' or (v_replay->>'total')::integer <> 53000 then
    raise exception 'Identical checkout replay did not preserve the original order';
  end if;
  update public.products set price = 19000, status = 'PUBLISHED' where id = 'd0f00000-0000-4000-8000-000000000001';
  update public.product_addons set active = true where product_id = 'd0f00000-0000-4000-8000-000000000001' and id <> 'd0f00000-0000-4000-8000-000000000013';

  perform pg_temp.assert_throws(
    $$select public.dpf_create_checkout('d0f00000-0000-4000-8000-000000000002', '{}'::uuid[], 1, 'same-key-full-001')$$,
    'Checkout idempotency conflict'
  );
  perform pg_temp.assert_throws(
    $$select public.dpf_create_checkout('d0f00000-0000-4000-8000-000000000001', array['d0f00000-0000-4000-8000-000000000011']::uuid[], 1, 'same-key-full-001')$$,
    'Checkout idempotency conflict'
  );
  perform pg_temp.assert_throws(
    $$select public.dpf_create_checkout('d0f00000-0000-4000-8000-000000000001', array['d0f00000-0000-4000-8000-000000000011','d0f00000-0000-4000-8000-000000000012']::uuid[], 2, 'same-key-full-001')$$,
    'Checkout idempotency conflict'
  );

  v_core_only := public.dpf_create_checkout('d0f00000-0000-4000-8000-000000000001', '{}'::uuid[], 1, 'core-only-0001');
  if (v_core_only->>'total')::integer <> 19000 then raise exception 'Expected core total 19000, got %', v_core_only; end if;
  v_second_full := public.dpf_create_checkout(
    'd0f00000-0000-4000-8000-000000000001',
    array['d0f00000-0000-4000-8000-000000000011','d0f00000-0000-4000-8000-000000000012']::uuid[],
    1, 'second-full-0001'
  );
  v_addon_a_only := public.dpf_create_checkout('d0f00000-0000-4000-8000-000000000001', array['d0f00000-0000-4000-8000-000000000011']::uuid[], 1, 'addon-a-only-01');
  if (v_addon_a_only->>'total')::integer <> 38000 then
    raise exception 'Expected core + add-on A total 38000';
  end if;

  perform pg_temp.assert_throws(
    format('select public.dpf_record_payment(%L, %L, %L, %s, %L, %L::jsonb)', v_full->>'orderId', 'test', 'test-reference-main-001', 53001, 'PAID', '{}'),
    'Order is not available'
  );
  perform pg_temp.assert_throws(
    format('select public.dpf_record_payment(%L, %L, %L, %s, %L, %L::jsonb)', v_full->>'orderId', 'test', 'test-reference-main-001', 53000, 'NOT_SUPPORTED', '{}'),
    'Payment request is invalid'
  );
  perform public.dpf_record_payment((v_full->>'orderId')::uuid, 'test', 'test-reference-main-001', 53000, 'PENDING', '{"status":"PENDING"}');
  select count(*) into v_entitlement_count from public.customer_entitlements where order_id = (v_full->>'orderId')::uuid;
  if v_entitlement_count <> 0 then raise exception 'Pending payment created entitlement'; end if;

  perform pg_temp.assert_throws(
    format('select public.dpf_record_payment(%L, %L, %L, %s, %L, %L::jsonb)', v_second_full->>'orderId', 'test', 'test-reference-main-001', 53000, 'PAID', '{}'),
    'Payment reference conflicts with existing payment'
  );
  perform pg_temp.assert_throws(
    format('select public.dpf_record_payment(%L, %L, %L, %s, %L, %L::jsonb)', v_full->>'orderId', 'test', 'test-reference-main-001', 53001, 'PENDING', '{}'),
    'Order is not available'
  );

  v_paid := public.dpf_record_payment((v_full->>'orderId')::uuid, 'test', 'test-reference-main-001', 53000, 'PAID', '{"status":"PAID"}');
  v_paid_replay := public.dpf_record_payment((v_full->>'orderId')::uuid, 'test', 'test-reference-main-001', 53000, 'PAID', '{"status":"PAID"}');
  perform public.dpf_record_payment((v_full->>'orderId')::uuid, 'test', 'test-reference-main-001', 53000, 'PENDING', '{"status":"PENDING"}');
  perform public.dpf_record_payment((v_full->>'orderId')::uuid, 'test', 'test-reference-main-001', 53000, 'FAILED', '{"status":"FAILED"}');
  if v_paid->>'status' <> 'PAID' or v_paid_replay->>'status' <> 'PAID' then raise exception 'Paid replay was not stable'; end if;
  select count(*) into v_entitlement_count from public.customer_entitlements where order_id = (v_full->>'orderId')::uuid;
  if v_entitlement_count <> 3 then raise exception 'Expected exactly 3 entitlements after PAID replay, got %', v_entitlement_count; end if;
  select p.id into v_payment_id from public.payments p where p.order_id = (v_full->>'orderId')::uuid and p.provider = 'test';
  if (select status from public.payments where id = v_payment_id) <> 'PAID' then raise exception 'Payment status regressed from PAID'; end if;
  perform pg_temp.assert_throws(format('update public.orders set total = 53001 where id = %L', v_full->>'orderId'), 'Order purchase snapshot is immutable');
  perform pg_temp.assert_throws(format('update public.orders set status = %L where id = %L', 'FAILED', v_full->>'orderId'), 'Paid order status is terminal');

  v_paid := public.dpf_record_payment((v_core_only->>'orderId')::uuid, 'test', 'test-reference-core-001', 19000, 'PAID', '{"status":"PAID"}');
  perform public.dpf_record_payment((v_addon_a_only->>'orderId')::uuid, 'test', 'test-reference-addona-001', 38000, 'PAID', '{"status":"PAID"}');
  select i.id into v_core_order_item_id from public.order_items i where i.order_id = (v_core_only->>'orderId')::uuid and i.item_type = 'CORE';
  select count(*) into v_asset_count
  from public.delivery_assets a
  where a.product_id = 'd0f00000-0000-4000-8000-000000000001'
    and exists (
      select 1 from public.customer_entitlements e
      join public.order_items i on i.id = e.order_item_id
      where e.user_id = '11111111-1111-4111-8111-111111111111'
        and e.status = 'ACTIVE'
        and e.product_id = a.product_id
        and i.order_id = e.order_id
        and i.addon_id is not distinct from a.addon_id
        and e.order_item_id = v_core_order_item_id
    );
  if v_asset_count <> 1 then raise exception 'Core-only purchase must see only core asset, got %', v_asset_count; end if;
  select count(*) into v_asset_count
  from public.delivery_assets a
  where a.product_id = 'd0f00000-0000-4000-8000-000000000001'
    and exists (
      select 1 from public.customer_entitlements e
      join public.order_items i on i.id = e.order_item_id
      where e.user_id = '11111111-1111-4111-8111-111111111111'
        and e.status = 'ACTIVE'
        and e.product_id = a.product_id
        and i.order_id = e.order_id
        and i.addon_id is not distinct from a.addon_id
        and e.order_id = (v_addon_a_only->>'orderId')::uuid
    );
  if v_asset_count <> 2 then raise exception 'Core + add-on A must see only two matching assets, got %', v_asset_count; end if;

  v_cafe_checkout := public.dpf_create_checkout(
    'd0f00000-0000-4000-8000-000000000021',
    array['d0f00000-0000-4000-8000-000000000031']::uuid[],
    1, 'cafe-same-niche-01'
  );
  if (v_cafe_checkout->>'total')::integer <> 38000 then
    raise exception 'Same-niche Cafe add-on checkout should succeed at 38000, got %', v_cafe_checkout;
  end if;

  if not exists (
    select 1 from public.product_addons a
    join public.products core_product on core_product.id = a.product_id
    join public.products addon_product on addon_product.id = a.addon_product_id
    where a.id = v_cross_niche_addon_id and a.active
      and core_product.sku = 'AFZ-HPP-CAF-001' and core_product.niche = 'Cafe'
      and addon_product.sku = 'AFZ-BOOK-LDY-001' and addon_product.niche = 'Laundry'
  ) then
    raise exception 'Cross-niche regression setup is not the expected active Cafe-to-Laundry relation';
  end if;
  perform pg_temp.assert_throws(
    $$select public.dpf_create_checkout('d0f00000-0000-4000-8000-000000000021', array['d0f00000-0000-4000-8000-000000000032']::uuid[], 1, 'cafe-laundry-bad-01')$$,
    'Add-on product must match the core product niche'
  );
  select count(*) into v_order_count from public.orders where checkout_idempotency_key = 'cafe-laundry-bad-01';
  if v_order_count <> 0 then raise exception 'Cross-niche checkout created an order'; end if;
  if exists (
    select 1 from public.customer_entitlements e
    join public.order_items i on i.id = e.order_item_id
    where i.addon_id = v_cross_niche_addon_id
  ) then
    raise exception 'Cross-niche checkout created an entitlement for the invalid add-on';
  end if;

  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('products','product_addons','orders','order_items','payments','customer_entitlements','delivery_assets') and c.relrowsecurity) <> 7 then
    raise exception 'RLS is not enabled on every commerce table';
  end if;
  if has_table_privilege('anon', 'public.payments', 'SELECT')
     or has_table_privilege('authenticated', 'public.payments', 'SELECT')
     or has_table_privilege('anon', 'public.delivery_assets', 'SELECT')
     or has_table_privilege('authenticated', 'public.delivery_assets', 'SELECT') then
    raise exception 'Client role can read private payment or delivery data';
  end if;
  if has_function_privilege('anon', 'public.dpf_create_checkout(uuid,uuid[],integer,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.dpf_create_checkout(uuid,uuid[],integer,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.dpf_record_payment(uuid,text,text,integer,text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.dpf_record_payment(uuid,text,text,integer,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.dpf_record_payment(uuid,text,text,integer,text,jsonb)', 'EXECUTE') then
    raise exception 'Commerce RPC privileges are incorrect';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('dpf_create_checkout','dpf_record_payment')
        and p.prosecdef
        and p.proconfig @> array['search_path=pg_catalog']::text[]) <> 2 then
    raise exception 'SECURITY DEFINER RPC search_path is not hardened';
  end if;
end;
$test$;

set role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', false);
do $$
begin
  if exists (select 1 from public.orders where customer_user_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'Cross-user order visibility';
  end if;
  if exists (select 1 from public.order_items i join public.orders o on o.id = i.order_id where o.customer_user_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'Cross-user order item visibility';
  end if;
  if exists (select 1 from public.customer_entitlements where user_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'Cross-user entitlement visibility';
  end if;
end;
$$;
reset role;

select 'dpf commerce disposable PostgreSQL checks passed' as result;