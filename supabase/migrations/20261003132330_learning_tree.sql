-- Learning navigation, persistent chat threads and atomic assessment writes.
create table public.chat_threads (
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references public.families(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 200),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.chat_messages add column thread_id uuid references public.chat_threads(id) on delete cascade;
create index chat_messages_thread on public.chat_messages(thread_id, created_at);
create index chat_threads_student on public.chat_threads(student_id, created_at desc);

-- Preserve previous chat as one thread per learner.
insert into public.chat_threads(family_id, student_id, title, created_by)
select distinct on (m.student_id) m.family_id, m.student_id, 'Earlier conversations', coalesce(m.created_by, f.created_by)
from public.chat_messages m join public.families f on f.id=m.family_id order by m.student_id, m.created_at;
update public.chat_messages m set thread_id=t.id from public.chat_threads t where m.student_id=t.student_id and m.thread_id is null;

create table public.learning_contents (
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references public.families(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,
 academic_year_id uuid not null references public.academic_years(id) on delete restrict,
 subject_id uuid not null references public.subjects(id) on delete restrict,
 chapter_id uuid references public.chapters(id) on delete restrict,
 thread_id uuid references public.chat_threads(id) on delete set null,
 title text not null check(length(trim(title)) between 1 and 240),
 content text not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index learning_contents_student on public.learning_contents(student_id, created_at desc);
create index learning_contents_chapter on public.learning_contents(chapter_id);
create table public.assessment_chapters (
 assessment_id uuid not null references public.assessments(id) on delete cascade,
 chapter_id uuid not null references public.chapters(id) on delete restrict,
 primary key(assessment_id, chapter_id)
);
insert into public.assessment_chapters select id, chapter_id from public.assessments where chapter_id is not null;
alter table public.assessments add column thread_id uuid references public.chat_threads(id) on delete set null;
alter table public.assessment_questions add column section_name text not null default 'Questions';

alter table public.chat_threads enable row level security;
alter table public.learning_contents enable row level security;
alter table public.assessment_chapters enable row level security;
revoke all on public.chat_threads, public.learning_contents, public.assessment_chapters from anon;
grant select, insert, update, delete on public.chat_threads, public.learning_contents, public.assessment_chapters to authenticated;
create policy threads_read on public.chat_threads for select to authenticated using(public.is_family_member(family_id));
create policy threads_insert on public.chat_threads for insert to authenticated with check(public.is_family_parent(family_id) and created_by=auth.uid() and exists(select 1 from public.students s where s.id=student_id and s.family_id=chat_threads.family_id));
create policy threads_update on public.chat_threads for update to authenticated using(public.is_family_parent(family_id)) with check(public.is_family_parent(family_id));
create policy threads_delete on public.chat_threads for delete to authenticated using(public.is_family_parent(family_id));
create policy contents_read on public.learning_contents for select to authenticated using(public.is_family_member(family_id));
create policy contents_insert on public.learning_contents for insert to authenticated with check(public.is_family_parent(family_id) and created_by=auth.uid());
create policy contents_update on public.learning_contents for update to authenticated using(public.is_family_parent(family_id)) with check(public.is_family_parent(family_id));
create policy contents_delete on public.learning_contents for delete to authenticated using(public.is_family_parent(family_id));
create policy assessment_chapters_read on public.assessment_chapters for select to authenticated using(exists(select 1 from public.assessments a where a.id=assessment_id and public.is_family_member(a.family_id)));
create policy assessment_chapters_write on public.assessment_chapters for all to authenticated using(exists(select 1 from public.assessments a where a.id=assessment_id and public.is_family_parent(a.family_id))) with check(exists(select 1 from public.assessments a join public.chapters c on c.id=chapter_id join public.books b on b.id=c.book_id where a.id=assessment_id and a.subject_id=b.subject_id and a.family_id=c.family_id and public.is_family_parent(a.family_id)));

-- Reject mismatched student / subject / chapter / thread links even through direct REST writes.
create function public.check_learning_context() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from students s where s.id=new.student_id and s.family_id=new.family_id) then raise exception 'Invalid student context'; end if;
 if new.academic_year_id is not null and not exists(select 1 from academic_years y where y.id=new.academic_year_id and y.student_id=new.student_id and y.family_id=new.family_id) then raise exception 'Invalid academic year context'; end if;
 if new.subject_id is not null and not exists(select 1 from subjects s join academic_years y on y.id=s.academic_year_id where s.id=new.subject_id and s.family_id=new.family_id and y.student_id=new.student_id and (new.academic_year_id is null or y.id=new.academic_year_id)) then raise exception 'Invalid subject context'; end if;
 if new.chapter_id is not null and not exists(select 1 from chapters c join books b on b.id=c.book_id where c.id=new.chapter_id and c.family_id=new.family_id and b.subject_id=new.subject_id) then raise exception 'Invalid chapter context'; end if;
 if new.thread_id is not null and not exists(select 1 from chat_threads t where t.id=new.thread_id and t.family_id=new.family_id and t.student_id=new.student_id) then raise exception 'Invalid thread context'; end if;
 return new;
end $$;
create trigger contents_context before insert or update on public.learning_contents for each row execute function public.check_learning_context();
create trigger assessments_context before insert or update on public.assessments for each row execute function public.check_learning_context();

create function public.save_generated_assessment(meta jsonb, questions jsonb, chapter_ids uuid[]) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare a assessments; q jsonb; qid uuid; seq integer:=0;
begin
 insert into assessments(family_id,student_id,academic_year_id,subject_id,chapter_id,thread_id,title,difficulty,question_count,total_marks,created_by)
 values((meta->>'family_id')::uuid,(meta->>'student_id')::uuid,(meta->>'academic_year_id')::uuid,(meta->>'subject_id')::uuid,(meta->>'chapter_id')::uuid,(meta->>'thread_id')::uuid,meta->>'title',meta->>'difficulty',jsonb_array_length(questions),(select sum((x->>'marks')::int) from jsonb_array_elements(questions) x),auth.uid()) returning * into a;
 foreach qid in array chapter_ids loop
  insert into assessment_chapters values(a.id,qid);
 end loop;
 for q in select * from jsonb_array_elements(questions) loop
  seq:=seq+1;
  insert into assessment_questions(assessment_id,family_id,sequence,question_type,prompt,options,marks,difficulty,concept,section_name)
  values(a.id,a.family_id,seq,q->>'question_type',q->>'prompt',q->'options',(q->>'marks')::int,q->>'difficulty',q->>'concept',q->>'section_name') returning id into qid;
  insert into assessment_answer_keys(question_id,family_id,answer_key,explanation) values(qid,a.family_id,q->>'answer_key',q->>'explanation');
 end loop;
 return to_jsonb(a);
end $$;
revoke all on function public.save_generated_assessment(jsonb,jsonb,uuid[]) from public,anon;
grant execute on function public.save_generated_assessment(jsonb,jsonb,uuid[]) to authenticated;

create function public.save_graded_attempt(meta jsonb, answers jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare a assessment_attempts; item jsonb; exam assessments;
begin
 select * into strict exam from assessments where id=(meta->>'assessment_id')::uuid;
 if jsonb_array_length(answers) <> (select count(*) from assessment_questions where assessment_id=exam.id) then raise exception 'Incomplete grading'; end if;
 insert into assessment_attempts(family_id,assessment_id,student_id,submitted_by,status,score,max_score,overall_feedback,submitted_at,graded_at)
 values(exam.family_id,exam.id,exam.student_id,auth.uid(),'graded',(meta->>'score')::numeric,(meta->>'max_score')::numeric,meta->>'overall_feedback',now(),now()) returning * into a;
 for item in select * from jsonb_array_elements(answers) loop
  if not exists(select 1 from assessment_questions q where q.id=(item->>'question_id')::uuid and q.assessment_id=exam.id and (item->>'awarded_marks')::numeric between 0 and q.marks) then raise exception 'Invalid grade'; end if;
  insert into assessment_answers(attempt_id,family_id,question_id,answer,awarded_marks,feedback) values(a.id,a.family_id,(item->>'question_id')::uuid,item->>'answer',(item->>'awarded_marks')::numeric,item->>'feedback');
 end loop;
 return to_jsonb(a);
end $$;
revoke all on function public.save_graded_attempt(jsonb,jsonb) from public,anon;
grant execute on function public.save_graded_attempt(jsonb,jsonb) to authenticated;
