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
  insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('99999999-9999-4999-8999-999999999999');
" >/dev/null

psql -h "$temp_dir" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$repo_root/supabase/migrations/20261004_dpf_commerce_v1.sql"
psql -h "$temp_dir" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$repo_root/supabase/tests/dpf_commerce_v1.sql"