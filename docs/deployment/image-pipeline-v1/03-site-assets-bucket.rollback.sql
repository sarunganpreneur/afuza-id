-- Remove site-assets only when it is empty.
-- This rollback never deletes storage.objects automatically.

begin;

do $$
declare
  v_object_count bigint;
begin
  select count(*)
    into v_object_count
    from storage.objects
   where bucket_id = 'site-assets';

  if v_object_count > 0 then
    raise exception 'Cannot rollback site-assets bucket: bucket is not empty (% objects)', v_object_count;
  end if;
end;
$$;

delete from storage.buckets
 where id = 'site-assets'
   and not exists (
     select 1
       from storage.objects
      where bucket_id = 'site-assets'
   );

commit;