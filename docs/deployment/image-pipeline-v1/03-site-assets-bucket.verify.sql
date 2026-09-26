-- Read-only verification for the site-assets Storage bucket.
-- This packet never uploads files and never creates Storage policies.

begin;
set transaction read only;

select
  count(*) as matching_bucket_count,
  bool_and(id = 'site-assets' and name = 'site-assets') as identity_matches,
  bool_and(public is true) as public_matches,
  bool_and(file_size_limit = 10485760) as file_size_limit_matches,
  bool_and(allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']::text[]) as allowed_mime_types_match
from storage.buckets
where id = 'site-assets' or name = 'site-assets';

-- Confirm no client upload policy exists for this bucket. Service role bypasses
-- Storage RLS and is the only upload path in Image Pipeline V1.
select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    qual ilike '%site-assets%'
    or with_check ilike '%site-assets%'
  );

rollback;