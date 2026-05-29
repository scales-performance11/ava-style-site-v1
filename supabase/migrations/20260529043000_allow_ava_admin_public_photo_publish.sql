drop policy if exists "Ava admins can publish public storage" on storage.objects;
create policy "Ava admins can publish public storage"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'ava-content-public' and public.is_ava_admin());
