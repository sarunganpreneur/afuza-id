-- Digital Product Factory Commerce + Digital Fulfillment V1.
-- Additive migration only. Review and apply only in an approved non-production environment.

begin;

create table public.dpf_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  slug text not null unique,
  title text not null,
  short_title text,
  headline text not null,
  description text not null default '',
  category text not null,
  subcategory text not null,
  niche text not null,
  buyer text not null,
  problem text not null,
  use_case text not null,
  product_type text not null,
  format text[] not null default '{}',
  price integer not null check (price >= 10000),
  compare_at_price integer check (compare_at_price is null or compare_at_price >= 10000),
  traffic_role text not null check (traffic_role in ('ACQUISITION','MONETIZATION','ADD_ON','BUNDLE_COMPONENT','SEO_LONGTAIL')),
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','PUBLISHED','TESTING','WINNER','SCALING','ARCHIVED')),
  preview_assets text[] not null default '{}',
  keywords text[] not null default '{}',
  seo_title text,
  seo_description text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dpf_products_sku_format check (sku ~ '^[A-Za-z0-9._-]{3,80}$'),
  constraint dpf_products_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create index dpf_products_catalog_idx on public.dpf_products(status, category, subcategory);

create table public.dpf_product_addons (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.dpf_products(id) on delete restrict,
  addon_product_id uuid references public.dpf_products(id) on delete restrict,
  title text not null,
  description text,
  price integer not null check (price >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dpf_addons_not_self check (addon_product_id is null or addon_product_id <> product_id)
);

create unique index dpf_product_addons_product_ref_unique
  on public.dpf_product_addons(product_id, addon_product_id)
  where addon_product_id is not null;
create unique index dpf_product_addons_title_unique
  on public.dpf_product_addons(product_id, lower(title));
create index dpf_product_addons_active_idx on public.dpf_product_addons(product_id, active, sort_order);

create table public.dpf_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('DFP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  customer_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'PENDING' check (status in ('PENDING','AWAITING_PAYMENT','PAID','FAILED','CANCELLED')),
  subtotal integer not null check (subtotal >= 0),
  addon_total integer not null check (addon_total >= 0),
  total integer not null check (total >= 0),
  checkout_idempotency_key text not null,
  checkout_snapshot jsonb not null check (jsonb_typeof(checkout_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (customer_user_id, checkout_idempotency_key)
);
create index dpf_orders_customer_created_idx on public.dpf_orders(customer_user_id, created_at desc);

create table public.dpf_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.dpf_orders(id) on delete restrict,
  product_id uuid not null references public.dpf_products(id) on delete restrict,
  addon_id uuid references public.dpf_product_addons(id) on delete restrict,
  sku_snapshot text not null,
  title_snapshot text not null,
  price_snapshot integer not null check (price_snapshot >= 0),
  item_type text not null check (item_type in ('CORE','ADD_ON','BUNDLE')),
  quantity integer not null check (quantity between 1 and 10),
  created_at timestamptz not null default now(),
  constraint dpf_order_items_addon_shape check ((item_type = 'CORE' and addon_id is null) or (item_type = 'ADD_ON' and addon_id is not null) or item_type = 'BUNDLE')
);
create index dpf_order_items_order_idx on public.dpf_order_items(order_id);

create table public.dpf_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.dpf_orders(id) on delete restrict,
  provider text not null,
  provider_reference text not null,
  status text not null check (status in ('INITIATED','PENDING','PAID','FAILED','CANCELLED')),
  amount integer not null check (amount >= 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  raw_provider_data jsonb check (raw_provider_data is null or jsonb_typeof(raw_provider_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (order_id, provider),
  unique (provider, provider_reference)
);

create table public.dpf_customer_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  product_id uuid not null references public.dpf_products(id) on delete restrict,
  order_id uuid not null references public.dpf_orders(id) on delete restrict,
  order_item_id uuid not null references public.dpf_order_items(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED','EXPIRED')),
  unique (order_item_id)
);
create index dpf_entitlements_user_status_idx on public.dpf_customer_entitlements(user_id, status);

create table public.dpf_delivery_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.dpf_products(id) on delete restrict,
  entitlement_id uuid references public.dpf_customer_entitlements(id) on delete restrict,
  storage_bucket text not null default 'dpf-delivery-v1',
  storage_key text not null,
  mime_type text,
  file_name text not null,
  signed_url_expiry_seconds integer not null default 180 check (signed_url_expiry_seconds between 60 and 300),
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_key)
);
create index dpf_delivery_assets_product_idx on public.dpf_delivery_assets(product_id);

alter table public.dpf_products enable row level security;
alter table public.dpf_product_addons enable row level security;
alter table public.dpf_orders enable row level security;
alter table public.dpf_order_items enable row level security;
alter table public.dpf_payments enable row level security;
alter table public.dpf_customer_entitlements enable row level security;
alter table public.dpf_delivery_assets enable row level security;

revoke all on public.dpf_products, public.dpf_product_addons, public.dpf_orders,
  public.dpf_order_items, public.dpf_payments, public.dpf_customer_entitlements,
  public.dpf_delivery_assets from public, anon, authenticated;
grant select on public.dpf_products, public.dpf_product_addons to anon, authenticated;
grant select on public.dpf_orders, public.dpf_order_items, public.dpf_customer_entitlements to authenticated;

create policy dpf_products_published_read on public.dpf_products
  for select to anon, authenticated using (status = 'PUBLISHED');
create policy dpf_products_entitled_read on public.dpf_products
  for select to authenticated using (
    exists (
      select 1 from public.dpf_customer_entitlements e
      where e.product_id = id and e.user_id = (select auth.uid())
    )
  );
create policy dpf_addons_published_read on public.dpf_product_addons
  for select to anon, authenticated using (
    active and exists (select 1 from public.dpf_products p where p.id = product_id and p.status = 'PUBLISHED')
  );
create policy dpf_orders_owner_read on public.dpf_orders
  for select to authenticated using (customer_user_id = (select auth.uid()));
create policy dpf_order_items_owner_read on public.dpf_order_items
  for select to authenticated using (
    exists (select 1 from public.dpf_orders o where o.id = order_id and o.customer_user_id = (select auth.uid()))
  );
create policy dpf_entitlements_owner_read on public.dpf_customer_entitlements
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.dpf_create_checkout(
  p_product_id uuid,
  p_addon_ids uuid[],
  p_quantity integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product public.dpf_products%rowtype;
  v_addons public.dpf_product_addons%rowtype;
  v_existing public.dpf_orders%rowtype;
  v_order public.dpf_orders%rowtype;
  v_addon_ids uuid[] := coalesce(p_addon_ids, '{}');
  v_request jsonb;
  v_addon_total integer := 0;
  v_total integer;
  v_addon_count integer;
begin
  if v_user_id is null or p_product_id is null or p_quantity is null
     or p_quantity < 1 or p_quantity > 10
     or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$'
     or cardinality(v_addon_ids) > 10 then
    raise exception 'Checkout request is invalid';
  end if;
  if (select count(distinct requested.addon_id) from unnest(v_addon_ids) as requested(addon_id)) <> cardinality(v_addon_ids) then
    raise exception 'Checkout request is invalid';
  end if;

  select p.* into v_product from public.dpf_products p where p.id = p_product_id for share;
  if not found or v_product.status <> 'PUBLISHED' or v_product.price < 10000 then
    raise exception 'Product is not available';
  end if;

  perform a.id from public.dpf_product_addons a
    where a.product_id = p_product_id and a.active and a.id = any(v_addon_ids)
    order by a.id for share;
  select coalesce(sum(a.price), 0), count(*) into v_addon_total, v_addon_count
  from public.dpf_product_addons a
  where a.product_id = p_product_id and a.active and a.id = any(v_addon_ids);
  if v_addon_count <> cardinality(v_addon_ids) then
    raise exception 'One or more add-ons are not available';
  end if;

  select coalesce(array_agg(requested.addon_id order by requested.addon_id), '{}') into v_addon_ids
    from unnest(v_addon_ids) as requested(addon_id);
  v_request := jsonb_build_object('product_id', p_product_id, 'addon_ids', to_jsonb(v_addon_ids), 'quantity', p_quantity);
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_idempotency_key, 0));
  select o.* into v_existing from public.dpf_orders o
    where o.customer_user_id = v_user_id and o.checkout_idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.checkout_snapshot <> v_request then raise exception 'Idempotency key was already used'; end if;
    return jsonb_build_object('orderId', v_existing.id, 'orderNumber', v_existing.order_number, 'status', v_existing.status, 'subtotal', v_existing.subtotal, 'addonTotal', v_existing.addon_total, 'total', v_existing.total);
  end if;

  v_total := (v_product.price * p_quantity) + v_addon_total;
  insert into public.dpf_orders(customer_user_id, subtotal, addon_total, total, checkout_idempotency_key, checkout_snapshot)
    values (v_user_id, v_product.price * p_quantity, v_addon_total, v_total, p_idempotency_key, v_request)
    returning * into v_order;
  insert into public.dpf_order_items(order_id, product_id, sku_snapshot, title_snapshot, price_snapshot, item_type, quantity)
    values (v_order.id, v_product.id, v_product.sku, v_product.title, v_product.price, 'CORE', p_quantity);
  for v_addons in select a.* from public.dpf_product_addons a where a.id = any(v_addon_ids) order by a.sort_order, a.id loop
    insert into public.dpf_order_items(order_id, product_id, addon_id, sku_snapshot, title_snapshot, price_snapshot, item_type, quantity)
        values (
          v_order.id,
          coalesce(v_addons.addon_product_id, v_product.id),
          v_addons.id,
          coalesce((select p.sku from public.dpf_products p where p.id = v_addons.addon_product_id), v_product.sku),
          v_addons.title,
          v_addons.price,
          'ADD_ON',
          1
        );
  end loop;
  update public.dpf_orders set status = 'AWAITING_PAYMENT' where id = v_order.id returning * into v_order;
  return jsonb_build_object('orderId', v_order.id, 'orderNumber', v_order.order_number, 'status', v_order.status, 'subtotal', v_order.subtotal, 'addonTotal', v_order.addon_total, 'total', v_order.total);
end;
$$;

create or replace function public.dpf_record_payment(
  p_order_id uuid,
  p_provider text,
  p_provider_reference text,
  p_amount integer,
  p_status text,
  p_raw_provider_data jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.dpf_orders%rowtype;
  v_payment public.dpf_payments%rowtype;
begin
  if p_order_id is null or p_provider is null or p_provider !~ '^[a-z][a-z0-9_-]{1,40}$'
     or p_provider_reference is null or length(p_provider_reference) not between 8 and 200
     or p_amount < 0 or p_status not in ('INITIATED','PENDING','PAID','FAILED','CANCELLED')
     or (p_raw_provider_data is not null and jsonb_typeof(p_raw_provider_data) <> 'object') then
    raise exception 'Payment request is invalid';
  end if;
  select o.* into v_order from public.dpf_orders o where o.id = p_order_id for update;
  if not found or v_order.total <> p_amount then raise exception 'Order is not available'; end if;
  insert into public.dpf_payments(order_id, provider, provider_reference, status, amount, raw_provider_data)
    values (p_order_id, p_provider, p_provider_reference, p_status, p_amount, p_raw_provider_data)
    on conflict (order_id, provider) do nothing;
  select p.* into v_payment from public.dpf_payments p where p.order_id = p_order_id and p.provider = p_provider for update;
  if v_payment.provider_reference <> p_provider_reference or v_payment.amount <> p_amount then
    raise exception 'Payment reference conflicts with existing payment';
  end if;
  if v_payment.status = 'PAID' and p_status <> 'PAID' then
    return jsonb_build_object('ok', true, 'orderId', v_order.id, 'status', 'PAID');
  end if;
  update public.dpf_payments set status = p_status, raw_provider_data = p_raw_provider_data,
    updated_at = now(), confirmed_at = case when p_status = 'PAID' then coalesce(confirmed_at, now()) else confirmed_at end
    where id = v_payment.id returning * into v_payment;
  if p_status = 'PAID' then
    update public.dpf_orders set status = 'PAID', paid_at = coalesce(paid_at, now()) where id = v_order.id returning * into v_order;
    insert into public.dpf_customer_entitlements(user_id, product_id, order_id, order_item_id)
      select v_order.customer_user_id, i.product_id, v_order.id, i.id
      from public.dpf_order_items i where i.order_id = v_order.id
      on conflict (order_item_id) do nothing;
  elsif v_order.status <> 'PAID' then
    update public.dpf_orders set status = case when p_status = 'CANCELLED' then 'CANCELLED' when p_status = 'FAILED' then 'FAILED' else 'AWAITING_PAYMENT' end where id = v_order.id returning * into v_order;
  end if;
  return jsonb_build_object('ok', true, 'orderId', v_order.id, 'status', v_order.status);
end;
$$;

revoke all on function public.dpf_create_checkout(uuid, uuid[], integer, text) from public, anon;
grant execute on function public.dpf_create_checkout(uuid, uuid[], integer, text) to authenticated;
revoke all on function public.dpf_record_payment(uuid, text, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.dpf_record_payment(uuid, text, text, integer, text, jsonb) to service_role;

insert into public.dpf_products (
  id, sku, slug, title, headline, description, category, subcategory, niche, buyer,
  problem, use_case, product_type, format, price, traffic_role, status, keywords,
  published_at
) values (
  'd0f00000-0000-4000-8000-000000000001', 'AFZ-SPR-HPP-001', 'kalkulator-hpp-harga-jual-umkm',
  'Kalkulator HPP & Harga Jual UMKM', 'Hitung HPP dan harga jual untuk usaha mikro dan kecil.',
  'Kalkulator untuk membantu menghitung HPP dan harga jual.', 'Bisnis & UMKM', 'Keuangan', 'UMKM',
  'Pemilik usaha', 'Sulit menghitung HPP dan harga jual yang tepat.',
  'Membantu pemilik usaha menentukan harga jual yang sehat.', 'Spreadsheet', array['XLSX'],
  19000, 'ACQUISITION', 'PUBLISHED', array['hpp','harga jual','umkm'], now()
) on conflict (sku) do nothing;

insert into public.dpf_product_addons (id, product_id, title, description, price, active, sort_order)
values
  ('d0f00000-0000-4000-8000-000000000011', 'd0f00000-0000-4000-8000-000000000001', 'Pembukuan Usaha', 'Template pembukuan usaha harian.', 19000, true, 1),
  ('d0f00000-0000-4000-8000-000000000012', 'd0f00000-0000-4000-8000-000000000001', 'Inventory Tracker', 'Tracker stok barang dan omzet.', 15000, true, 2)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('dpf-delivery-v1', 'dpf-delivery-v1', false)
on conflict (id) do nothing;

commit;