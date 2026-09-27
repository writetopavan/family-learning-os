-- Phase 1 hardening after Supabase advisor review.

-- Function search path hardening.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Helper functions are used only by RLS policies and should not be directly
-- exposed as callable RPCs.
revoke all on function public.is_family_member(uuid) from public, anon, authenticated;
revoke all on function public.is_family_parent(uuid) from public, anon, authenticated;

-- Family bootstrap must only be callable by authenticated users.
revoke all on function public.create_family_with_parent(text) from public, anon;
grant execute on function public.create_family_with_parent(text) to authenticated;

-- Avoid repeated auth.uid() evaluation in RLS policy expressions.
drop policy if exists "authenticated users can create families" on public.families;
create policy "authenticated users can create families"
on public.families for insert
to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "parents can add memberships" on public.family_memberships;
create policy "parents can add memberships"
on public.family_memberships for insert
to authenticated
with check (
  public.is_family_parent(family_id)
  or (
    user_id = (select auth.uid())
    and role = 'parent'
    and exists (
      select 1 from public.families f
      where f.id = family_id
        and f.created_by = (select auth.uid())
    )
  )
);

-- Make manage policies write-only to avoid duplicate permissive SELECT policies.
drop policy if exists "parents can manage academic years" on public.academic_years;
create policy "parents can insert academic years"
on public.academic_years for insert to authenticated
with check (public.is_family_parent(family_id));
create policy "parents can update academic years"
on public.academic_years for update to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));
create policy "parents can delete academic years"
on public.academic_years for delete to authenticated
using (public.is_family_parent(family_id));

drop policy if exists "parents can manage subjects" on public.subjects;
create policy "parents can insert subjects"
on public.subjects for insert to authenticated
with check (public.is_family_parent(family_id));
create policy "parents can update subjects"
on public.subjects for update to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));
create policy "parents can delete subjects"
on public.subjects for delete to authenticated
using (public.is_family_parent(family_id));

drop policy if exists "parents can manage books" on public.books;
create policy "parents can insert books"
on public.books for insert to authenticated
with check (public.is_family_parent(family_id));
create policy "parents can update books"
on public.books for update to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));
create policy "parents can delete books"
on public.books for delete to authenticated
using (public.is_family_parent(family_id));

drop policy if exists "parents can manage chapters" on public.chapters;
create policy "parents can insert chapters"
on public.chapters for insert to authenticated
with check (public.is_family_parent(family_id));
create policy "parents can update chapters"
on public.chapters for update to authenticated
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));
create policy "parents can delete chapters"
on public.chapters for delete to authenticated
using (public.is_family_parent(family_id));

-- Cover foreign keys that will be common tenant filters and joins.
create index if not exists idx_families_created_by on public.families(created_by);
create index if not exists idx_students_linked_user on public.students(linked_user_id);
create index if not exists idx_academic_years_family on public.academic_years(family_id);
create index if not exists idx_subjects_family on public.subjects(family_id);
create index if not exists idx_books_family on public.books(family_id);
create index if not exists idx_chapters_family on public.chapters(family_id);
