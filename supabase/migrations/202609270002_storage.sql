-- Private storage bucket prepared for Phase 2 document ingestion.

insert into storage.buckets (id, name, public)
values ('learning-materials', 'learning-materials', false)
on conflict (id) do nothing;

-- Expected path: <family_id>/<student_id>/<uuid>/<filename>
create policy "family members can read learning materials"
on storage.objects for select
to authenticated
using (
  bucket_id = 'learning-materials'
  and public.is_family_member(((storage.foldername(name))[1])::uuid)
);

create policy "parents can upload learning materials"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'learning-materials'
  and public.is_family_parent(((storage.foldername(name))[1])::uuid)
);

create policy "parents can update learning materials"
on storage.objects for update
to authenticated
using (
  bucket_id = 'learning-materials'
  and public.is_family_parent(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'learning-materials'
  and public.is_family_parent(((storage.foldername(name))[1])::uuid)
);

create policy "parents can delete learning materials"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'learning-materials'
  and public.is_family_parent(((storage.foldername(name))[1])::uuid)
);
