-- Provision the persistent generated website assets bucket.
-- Apply only after the read-only bucket audit confirms the desired state.
-- No client upload policies are created; service_role uploads server-side.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'site-assets',
  'site-assets',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do nothing;

commit;