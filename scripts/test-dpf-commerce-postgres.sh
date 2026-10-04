#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pg_bin="$(pg_config --bindir)"
temp_dir="$(mktemp -d /tmp/dpf-commerce-pg.XXXXXX)"
port="$((54000 + ($$ % 10000)))"

if [[ "$(id -u)" -eq 0 ]]; then
  if ! id postgres >/dev/null 2>&1; then
    printf '%s\n' "PostgreSQL scratch tests require an unprivileged postgres account when run as root." >&2
    exit 1
  fi
  pg_run=(runuser -u postgres --)
  chown postgres:postgres "$temp_dir"
else
  pg_run=()
fi
chmod 755 "$temp_dir"

cleanup() {
  "${pg_run[@]}" "$pg_bin/pg_ctl" -D "$temp_dir/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$temp_dir"
}
trap cleanup EXIT

"${pg_run[@]}" "$pg_bin/initdb" -D "$temp_dir/data" --no-locale -A trust >/dev/null
"${pg_run[@]}" "$pg_bin/pg_ctl" -D "$temp_dir/data" -o "-h '' -k $temp_dir -p $port" -l "$temp_dir/server.log" start >/dev/null

psql -h "$temp_dir" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
  create schema storage;
  create table storage.buckets(id text primary key, name text not null, public boolean not null);
  create table public.orders(id bigint primary key, legacy_order_key text not null unique, legacy_total integer not null);
  create index orders_legacy_total_idx on public.orders(legacy_total);
  create table public.order_items(id bigint primary key, order_id bigint not null references public.orders(id), legacy_payload jsonb not null);
  create index order_items_legacy_order_idx on public.order_items(order_id);
  create table public.payments(id bigint primary key, order_id bigint not null references public.orders(id), processor_code text not null);
  create index payments_legacy_order_idx on public.payments(order_id);
  create function public.legacy_orders_touch() returns trigger language plpgsql as \$\$ begin new.legacy_total := new.legacy_total; return new; end; \$\$;
  create trigger orders_legacy_touch before update on public.orders for each row execute function public.legacy_orders_touch();
  create trigger order_items_legacy_touch before update on public.order_items for each row execute function public.legacy_orders_touch();
  create trigger payments_legacy_touch before update on public.payments for each row execute function public.legacy_orders_touch();
  alter table public.orders enable row level security;
  alter table public.order_items enable row level security;
  alter table public.payments enable row level security;
  create policy orders_legacy_read on public.orders for select to authenticated using (true);
  create policy order_items_legacy_read on public.order_items for select to authenticated using (true);
  create policy payments_legacy_read on public.payments for select to authenticated using (true);
  insert into public.orders values (1, 'legacy-order-sentinel', 7300);
  insert into public.order_items values (1, 1, '{\"owner\":\"legacy\"}');
  insert into public.payments values (1, 1, 'legacy-processor');
  insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('99999999-9999-4999-8999-999999999999');
" >/dev/null

psql -h "$temp_dir" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$repo_root/supabase/migrations/20261004_dpf_commerce_v1.sql"
psql -h "$temp_dir" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$repo_root/supabase/tests/dpf_commerce_v1.sql"

psql -h "$temp_dir" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database dpf_private_bucket_check" >/dev/null
psql -h "$temp_dir" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database dpf_public_bucket_check" >/dev/null

psql -h "$temp_dir" -p "$port" -U postgres -d dpf_private_bucket_check -v ON_ERROR_STOP=1 -c "
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
  create schema storage;
  create table storage.buckets(id text primary key, name text not null, public boolean not null);
  insert into storage.buckets values ('dpf-delivery-v1', 'dpf-delivery-v1', false);
" >/dev/null
psql -h "$temp_dir" -p "$port" -U postgres -d dpf_private_bucket_check -v ON_ERROR_STOP=1 -f "$repo_root/supabase/migrations/20261004_dpf_commerce_v1.sql" >/dev/null

psql -h "$temp_dir" -p "$port" -U postgres -d dpf_public_bucket_check -v ON_ERROR_STOP=1 -c "
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
  create schema storage;
  create table storage.buckets(id text primary key, name text not null, public boolean not null);
  insert into storage.buckets values ('dpf-delivery-v1', 'dpf-delivery-v1', true);
" >/dev/null
if psql -h "$temp_dir" -p "$port" -U postgres -d dpf_public_bucket_check -v ON_ERROR_STOP=1 -f "$repo_root/supabase/migrations/20261004_dpf_commerce_v1.sql" >"$temp_dir/public-bucket-migration.log" 2>&1; then
  printf '%s\n' "Migration unexpectedly accepted a public DPF delivery bucket." >&2
  exit 1
fi
if ! grep -q "DPF delivery bucket must be private" "$temp_dir/public-bucket-migration.log"; then
  printf '%s\n' "Public-bucket migration failed for an unexpected reason." >&2
  exit 1
fi
psql -h "$temp_dir" -p "$port" -U postgres -d dpf_public_bucket_check -v ON_ERROR_STOP=1 -c "
  do \$\$ begin
    if to_regclass('public.dpf_products') is not null then raise exception 'Public bucket failure did not roll back DPF schema'; end if;
    if not exists (select 1 from storage.buckets where id = 'dpf-delivery-v1' and public) then raise exception 'Public bucket was modified'; end if;
  end \$\$;
" >/dev/null

printf '%s\n' "DPF bucket checks passed: absent bucket created private, private bucket accepted, public bucket rejected with migration rollback."