-- Phase 1 core schema: family tenant, membership, students and curriculum.
-- Designed for Supabase Postgres + Auth.

create extension if not exists pgcrypto;

create type public.family_role as enum ('parent', 'child');
create type public.membership_status as enum ('active', 'invited', 'disabled');

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.family_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  linked_user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(trim(display_name)) between 1 and 120),
  date_of_birth date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, linked_user_id)
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  label text not null,
  start_date date not null,
  end_date date not null,
  grade_level smallint not null check (grade_level between 4 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (student_id, label)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (academic_year_id, name)
);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  publisher text,
  edition text,
  created_at timestamptz not null default now()
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  title text not null,
  sequence integer not null check (sequence > 0),
  created_at timestamptz not null default now(),
  unique (book_id, sequence)
);

create index idx_family_memberships_user on public.family_memberships(user_id);
create index idx_students_family on public.students(family_id);
create index idx_academic_years_student on public.academic_years(student_id);
create index idx_subjects_academic_year on public.subjects(academic_year_id);
create index idx_books_subject on public.books(subject_id);
create index idx_chapters_book on public.chapters(book_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger families_set_updated_at
before update on public.families
for each row execute function public.set_updated_at();

create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

create trigger academic_years_set_updated_at
before update on public.academic_years
for each row execute function public.set_updated_at();

create or replace function public.is_family_member(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_memberships fm
    where fm.family_id = target_family_id
      and fm.user_id = auth.uid()
      and fm.status = 'active'
  );
$$;

create or replace function public.is_family_parent(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_memberships fm
    where fm.family_id = target_family_id
      and fm.user_id = auth.uid()
      and fm.role = 'parent'
      and fm.status = 'active'
  );
$$;

alter table public.families enable row level security;
alter table public.family_memberships enable row level security;
alter table public.students enable row level security;
alter table public.academic_years enable row level security;
alter table public.subjects enable row level security;
alter table public.books enable row level security;
alter table public.chapters enable row level security;

create policy "family members can read families"
on public.families for select
using (public.is_family_member(id));

create policy "authenticated users can create families"
on public.families for insert
to authenticated
with check (created_by = auth.uid());

create policy "parents can update families"
on public.families for update
using (public.is_family_parent(id))
with check (public.is_family_parent(id));

create policy "members can read memberships"
on public.family_memberships for select
using (public.is_family_member(family_id));

create policy "parents can add memberships"
on public.family_memberships for insert
with check (
  public.is_family_parent(family_id)
  or (
    user_id = auth.uid()
    and role = 'parent'
    and exists (
      select 1 from public.families f
      where f.id = family_id and f.created_by = auth.uid()
    )
  )
);

create policy "parents can update memberships"
on public.family_memberships for update
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create policy "parents can delete memberships"
on public.family_memberships for delete
using (public.is_family_parent(family_id));

create policy "members can read students"
on public.students for select
using (public.is_family_member(family_id));

create policy "parents can create students"
on public.students for insert
with check (public.is_family_parent(family_id));

create policy "parents can update students"
on public.students for update
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create policy "parents can delete students"
on public.students for delete
using (public.is_family_parent(family_id));

create policy "members can read academic years"
on public.academic_years for select
using (public.is_family_member(family_id));

create policy "parents can manage academic years"
on public.academic_years for all
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create policy "members can read subjects"
on public.subjects for select
using (public.is_family_member(family_id));

create policy "parents can manage subjects"
on public.subjects for all
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create policy "members can read books"
on public.books for select
using (public.is_family_member(family_id));

create policy "parents can manage books"
on public.books for all
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create policy "members can read chapters"
on public.chapters for select
using (public.is_family_member(family_id));

create policy "parents can manage chapters"
on public.chapters for all
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

-- Atomic family bootstrap. Creating the first parent membership in the same
-- transaction avoids a window where the creator cannot access the family.
create or replace function public.create_family_with_parent(family_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.families(name, created_by)
  values (trim(family_name), auth.uid())
  returning id into new_family_id;

  insert into public.family_memberships(family_id, user_id, role, status)
  values (new_family_id, auth.uid(), 'parent', 'active');

  return new_family_id;
end;
$$;

grant execute on function public.create_family_with_parent(text) to authenticated;
