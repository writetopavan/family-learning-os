-- Optional profile details and editable language levels. Existing students are unchanged.
alter table public.students
  add column board text check (char_length(board) <= 120),
  add column school_name text check (char_length(school_name) <= 240),
  add column school_location text check (char_length(school_location) <= 240);
alter table public.subjects add column language_level smallint check (language_level between 1 and 3);
create unique index subjects_language_level on public.subjects(academic_year_id, language_level) where language_level is not null;

create function public.onboard_student(profile jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  child public.students;
  year_id uuid;
  setup jsonb := profile->'academic_year';
  subject jsonb;
  family uuid := (profile->>'family_id')::uuid;
begin
  if auth.uid() is null or not public.is_family_parent(family) then
    raise exception 'Only a family parent can onboard a student' using errcode='42501';
  end if;
  if jsonb_array_length(coalesce(profile->'subjects','[]'::jsonb)) > 40 then
    raise exception 'Too many subjects';
  end if;
  if (setup is null or setup = 'null'::jsonb) and jsonb_array_length(coalesce(profile->'subjects','[]'::jsonb)) > 0 then
    raise exception 'Select a class to save subjects';
  end if;
  insert into public.students(family_id,display_name,date_of_birth,board,school_name,school_location)
  values(family,trim(profile->>'display_name'),(profile->>'date_of_birth')::date,
    nullif(trim(profile->>'board'),''),nullif(trim(profile->>'school_name'),''),nullif(trim(profile->>'school_location'),'')) returning * into child;
  if setup is not null and setup <> 'null'::jsonb then
    if (setup->>'family_id')::uuid is distinct from family then raise exception 'Invalid family'; end if;
    insert into public.academic_years(family_id,student_id,label,start_date,end_date,grade_level)
    values(family,child.id,setup->>'label',(setup->>'start_date')::date,(setup->>'end_date')::date,(setup->>'grade_level')::smallint) returning id into year_id;
    for subject in select value from jsonb_array_elements(coalesce(profile->'subjects','[]'::jsonb)) loop
      if char_length(trim(subject->>'name')) not between 1 and 120 or subject->>'name' is null then raise exception 'Invalid subject name'; end if;
      insert into public.subjects(family_id,academic_year_id,name,language_level)
      values(family,year_id,trim(subject->>'name'),(subject->>'language_level')::smallint);
    end loop;
  end if;
  return to_jsonb(child);
end $$;
revoke all on function public.onboard_student(jsonb) from public,anon;
grant execute on function public.onboard_student(jsonb) to authenticated;

-- Usage entries belong to the student's data when deletion is explicitly requested.
create policy usage_parent_delete on public.ai_usage_events for delete to authenticated
using (public.is_family_parent(family_id));

create function public.delete_student_data(target_student uuid, confirm_name text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare child public.students;
begin
  select * into child from public.students where id=target_student for update;
  if child.id is null then raise exception 'Student not found'; end if;
  if auth.uid() is null or not public.is_family_parent(child.family_id) then
    raise exception 'Only a family parent can delete a student' using errcode='42501';
  end if;
  if confirm_name is distinct from child.display_name then raise exception 'Confirmation name does not match'; end if;
  -- Remove RESTRICT references before deleting the curriculum, in one transaction.
  delete from public.assessment_chapters where assessment_id in
    (select id from public.assessments where student_id=target_student);
  delete from public.learning_contents where student_id=target_student;
  delete from public.assessments where student_id=target_student;
  delete from public.ai_usage_events where student_id=target_student;
  delete from public.students where id=target_student;
  return jsonb_build_object('deleted',target_student);
end $$;
revoke all on function public.delete_student_data(uuid,text) from public,anon;
grant execute on function public.delete_student_data(uuid,text) to authenticated;

create function public.add_onboarding_subjects(target_year uuid, suggestions jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare yr public.academic_years; item jsonb;
begin
  select * into yr from public.academic_years where id=target_year;
  if yr.id is null or auth.uid() is null or not public.is_family_parent(yr.family_id) then
    raise exception 'Only a family parent can add subjects' using errcode='42501';
  end if;
  if jsonb_array_length(suggestions) > 40 then raise exception 'Too many subjects'; end if;
  for item in select value from jsonb_array_elements(suggestions) loop
    if item->>'name' is null or char_length(trim(item->>'name')) not between 1 and 120 then raise exception 'Invalid subject name'; end if;
    if not exists(select 1 from subjects where academic_year_id=target_year and lower(name)=lower(trim(item->>'name'))) then
      insert into public.subjects(family_id,academic_year_id,name,language_level)
      values(yr.family_id,target_year,trim(item->>'name'),(item->>'language_level')::smallint)
      on conflict do nothing;
    end if;
  end loop;
end $$;
revoke all on function public.add_onboarding_subjects(uuid,jsonb) from public,anon;
grant execute on function public.add_onboarding_subjects(uuid,jsonb) to authenticated;
