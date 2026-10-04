-- Shared student curriculum, exam syllabus and schedules. All writes are tenant-scoped.
alter table chapters add column completed_at timestamptz;
alter table learning_materials add column book_id uuid references books(id) on delete set null;
create index learning_materials_book on learning_materials(book_id);
create table topics (
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references families(id) on delete cascade,
 chapter_id uuid not null references chapters(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 240),
 sequence int not null default 1 check(sequence>0),
 completed_at timestamptz,
 unique(chapter_id,title)
);
create index topics_chapter on topics(chapter_id);
create table student_exams (
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references families(id) on delete cascade,
 student_id uuid not null references students(id) on delete cascade,
 academic_year_id uuid not null references academic_years(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 200),
 created_at timestamptz not null default now(),
 unique(student_id,academic_year_id,title)
);
create index student_exams_student on student_exams(student_id);
create table exam_papers (
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references families(id) on delete cascade,
 student_id uuid not null references students(id) on delete cascade,
 exam_id uuid not null references student_exams(id) on delete cascade,
 subject_id uuid not null references subjects(id) on delete cascade,
 exam_date date,
 start_time time,
 unique(exam_id,subject_id)
);
create index exam_papers_student on exam_papers(student_id,exam_date);
create table exam_syllabus (
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references families(id) on delete cascade,
 student_id uuid not null references students(id) on delete cascade,
 paper_id uuid not null references exam_papers(id) on delete cascade,
 chapter_id uuid not null references chapters(id) on delete cascade,
 topic_id uuid references topics(id) on delete cascade,
 unique nulls not distinct(paper_id,chapter_id,topic_id)
);
create index exam_syllabus_student on exam_syllabus(student_id);
create index exam_syllabus_chapter on exam_syllabus(chapter_id);
create index exam_syllabus_topic on exam_syllabus(topic_id);
create table student_schedules (
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references families(id) on delete cascade,
 student_id uuid not null references students(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 200),
 kind text not null check(kind in ('study','play','exam','holiday','school','other')),
 start_date date not null,
 end_date date,
 start_time time,
 end_time time,
 recurrence text not null default 'none' check(recurrence in ('none','daily','weekly')),
 weekdays int[] not null default '{}' check(weekdays <@ array[0,1,2,3,4,5,6]),
 timezone text not null default 'Asia/Kolkata' check(length(timezone) between 1 and 80),
 paper_id uuid references exam_papers(id) on delete cascade,
 created_at timestamptz not null default now(),
 check(end_date is null or end_date>=start_date),
 check(end_time is null or start_time is null or end_time>start_time),
 check(recurrence<>'weekly' or cardinality(weekdays)>0),
 unique nulls not distinct(student_id,title,kind,start_date,start_time,recurrence),
 unique(paper_id)
);
create index student_schedules_student on student_schedules(student_id,start_date);

-- Validate ownership at the DB boundary, including direct Data API requests.
create function check_planning_links() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_table_name='topics' then
  if not exists(select 1 from chapters c where c.id=new.chapter_id and c.family_id=new.family_id) then raise exception 'Invalid topic chapter'; end if;
  return new;
 end if;
 if not exists(select 1 from students s where s.id=new.student_id and s.family_id=new.family_id) then raise exception 'Invalid student'; end if;
 if tg_table_name='student_exams' then
  if not exists(select 1 from academic_years y where y.id=new.academic_year_id and y.student_id=new.student_id and y.family_id=new.family_id) then raise exception 'Invalid exam year'; end if;
 elsif tg_table_name='exam_papers' then
  if not exists(select 1 from student_exams e join subjects s on s.academic_year_id=e.academic_year_id where e.id=new.exam_id and e.student_id=new.student_id and e.family_id=new.family_id and s.id=new.subject_id and s.family_id=new.family_id) then raise exception 'Invalid exam subject'; end if;
 elsif tg_table_name='exam_syllabus' then
  if not exists(select 1 from exam_papers p join chapters c on c.id=new.chapter_id join books b on b.id=c.book_id where p.id=new.paper_id and p.student_id=new.student_id and p.family_id=new.family_id and b.subject_id=p.subject_id and c.family_id=new.family_id) then raise exception 'Invalid syllabus chapter'; end if;
  if new.topic_id is not null and not exists(select 1 from topics t where t.id=new.topic_id and t.chapter_id=new.chapter_id) then raise exception 'Invalid syllabus topic'; end if;
 elsif tg_table_name='student_schedules' and new.paper_id is not null then
  if not exists(select 1 from exam_papers p where p.id=new.paper_id and p.student_id=new.student_id and p.family_id=new.family_id) then raise exception 'Invalid exam schedule'; end if;
 end if;
 return new;
end $$;

do $$ declare tbl text; begin
 foreach tbl in array array['topics','student_exams','exam_papers','exam_syllabus','student_schedules'] loop
  execute format('alter table %I enable row level security',tbl);
  execute format('revoke all on %I from anon,authenticated',tbl);
  execute format('grant select,insert,update,delete on %I to authenticated',tbl);
  execute format('create policy planning_read on %I for select to authenticated using(is_family_member(family_id))',tbl);
  execute format('create policy planning_write on %I for all to authenticated using(is_family_parent(family_id)) with check(is_family_parent(family_id))',tbl);
  execute format('create trigger planning_links before insert or update on %I for each row execute function check_planning_links()',tbl);
 end loop;
end $$;

-- Resolve chapter names once within a subject; do not silently choose between books.
create function planning_chapter(target_subject uuid, chapter_title text, book_title text default null) returns uuid
language plpgsql security invoker set search_path=public as $$
declare cid uuid; bid uuid; fam uuid; n int;
begin
 select family_id into strict fam from subjects where id=target_subject;
 if chapter_title is null or length(trim(chapter_title)) not between 1 and 240 then raise exception 'Invalid chapter title'; end if;
 select count(*), (array_agg(c.id))[1] into n,cid from chapters c join books b on b.id=c.book_id where b.subject_id=target_subject and lower(c.title)=lower(trim(chapter_title)) and (book_title is null or lower(b.title)=lower(book_title));
 if n>1 then raise exception 'Chapter title matches multiple books; select a book'; end if;
 if n=1 then return cid; end if;
 book_title:=coalesce(nullif(trim(book_title),''),'Exam syllabus');
 select id into bid from books where subject_id=target_subject and lower(title)=lower(book_title) order by created_at limit 1;
 if bid is null then insert into books(family_id,subject_id,title) values(fam,target_subject,book_title) returning id into bid; end if;
 insert into chapters(family_id,book_id,title,sequence) values(fam,bid,trim(chapter_title),coalesce((select max(sequence)+1 from chapters where book_id=bid),1)) returning id into cid;
 return cid;
end $$;
revoke all on function planning_chapter(uuid,text,text) from public,anon;
grant execute on function planning_chapter(uuid,text,text) to authenticated;

-- One transaction: import a book, upsert exams/syllabuses/events, and record completion.
create function save_student_plan(target_student uuid, target_year uuid, plan jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare child students; yr academic_years; exam jsonb; paper jsonb; ch jsonb; bk jsonb; item jsonb; topic text;
 eid uuid; pid uuid; sid uuid; cid uuid; tid uuid; bid uuid; seq int; n int; records int:=0;
begin
 select * into strict child from students where id=target_student for update;
 if not is_family_parent(child.family_id) then raise exception 'Parent required' using errcode='42501'; end if;
 if target_year is not null then
  select * into strict yr from academic_years where id=target_year and student_id=target_student and family_id=child.family_id;
 end if;
 if (jsonb_array_length(plan->'books')+jsonb_array_length(plan->'exams'))>0 and yr.id is null then raise exception 'Select an academic year'; end if;
 -- Import chapters and topics from explicitly selected books.
 for bk in select * from jsonb_array_elements(plan->'books') loop
  select id into strict sid from subjects where academic_year_id=yr.id and lower(name)=lower(bk->>'subject');
  select id into bid from books where subject_id=sid and lower(title)=lower(bk->>'title') order by created_at limit 1;
  if bid is null then insert into books(family_id,subject_id,title) values(child.family_id,sid,bk->>'title') returning id into bid; end if;
  for ch in select * from jsonb_array_elements(bk->'chapters') loop
   cid:=planning_chapter(sid,ch->>'title',bk->>'title');
   seq:=0;
   for topic in select jsonb_array_elements_text(ch->'topics') loop
    seq:=seq+1;
    insert into topics(family_id,chapter_id,title,sequence) values(child.family_id,cid,topic,seq) on conflict(chapter_id,title) do nothing;
   end loop;
   records:=records+1;
  end loop;
  if bk->>'material_id' is not null then
   update learning_materials set book_id=bid,subject_id=sid,academic_year_id=yr.id,chapter_id=null where id=(bk->>'material_id')::uuid and student_id=target_student and family_id=child.family_id;
   if not found then raise exception 'Invalid book source'; end if;
  end if;
 end loop;
 for exam in select * from jsonb_array_elements(plan->'exams') loop
  insert into student_exams(family_id,student_id,academic_year_id,title) values(child.family_id,target_student,yr.id,exam->>'title') on conflict(student_id,academic_year_id,title) do update set title=excluded.title returning id into eid;
  for paper in select * from jsonb_array_elements(exam->'papers') loop
   select id into strict sid from subjects where academic_year_id=yr.id and lower(name)=lower(paper->>'subject');
   insert into exam_papers(family_id,student_id,exam_id,subject_id,exam_date,start_time) values(child.family_id,target_student,eid,sid,(paper->>'exam_date')::date,(paper->>'start_time')::time)
   on conflict(exam_id,subject_id) do update set exam_date=coalesce(excluded.exam_date,exam_papers.exam_date),start_time=coalesce(excluded.start_time,exam_papers.start_time) returning id into pid;
   for ch in select * from jsonb_array_elements(paper->'chapters') loop
    cid:=planning_chapter(sid,ch->>'title',null);
    if jsonb_array_length(ch->'topics')=0 then
     insert into exam_syllabus(family_id,student_id,paper_id,chapter_id) values(child.family_id,target_student,pid,cid) on conflict do nothing;
    else
     seq:=0;
     for topic in select jsonb_array_elements_text(ch->'topics') loop
      seq:=seq+1;
      insert into topics(family_id,chapter_id,title,sequence) values(child.family_id,cid,topic,seq) on conflict(chapter_id,title) do update set title=excluded.title returning id into tid;
      insert into exam_syllabus(family_id,student_id,paper_id,chapter_id,topic_id) values(child.family_id,target_student,pid,cid,tid) on conflict do nothing;
     end loop;
    end if;
   end loop;
   if (select exam_date from exam_papers where id=pid) is not null then
    insert into student_schedules(family_id,student_id,title,kind,start_date,start_time,paper_id) select child.family_id,target_student,(exam->>'title')||' · '||(paper->>'subject'),'exam',exam_date,start_time,pid from exam_papers where id=pid
    on conflict(paper_id) do update set start_date=excluded.start_date,start_time=excluded.start_time,title=excluded.title;
   end if;
   records:=records+1;
  end loop;
 end loop;
 for item in select * from jsonb_array_elements(plan->'events') loop
  insert into student_schedules(family_id,student_id,title,kind,start_date,end_date,start_time,end_time,recurrence,weekdays,timezone)
  values(child.family_id,target_student,item->>'title',item->>'kind',(item->>'start_date')::date,(item->>'end_date')::date,(item->>'start_time')::time,(item->>'end_time')::time,item->>'recurrence',array(select jsonb_array_elements_text(item->'weekdays')::int),item->>'timezone')
  on conflict(student_id,title,kind,start_date,start_time,recurrence) do update set end_date=excluded.end_date,end_time=excluded.end_time,weekdays=excluded.weekdays,timezone=excluded.timezone;
  records:=records+1;
 end loop;
 for item in select * from jsonb_array_elements(plan->'progress') loop
  cid:=(item->>'chapter_id')::uuid; tid:=(item->>'topic_id')::uuid;
  if tid is not null then select chapter_id into strict cid from topics where id=tid; end if;
  if not exists(select 1 from chapters c join books b on b.id=c.book_id join subjects s on s.id=b.subject_id join academic_years y on y.id=s.academic_year_id where c.id=cid and y.student_id=target_student and y.family_id=child.family_id) then raise exception 'Invalid progress context'; end if;
  if tid is not null then
   update topics set completed_at=case when (item->>'completed')::boolean then now() else null end where id=tid;
   -- A reopened topic also reopens its chapter.
   if not (item->>'completed')::boolean then update chapters set completed_at=null where id=cid; end if;
  else
   update chapters set completed_at=case when (item->>'completed')::boolean then now() else null end where id=cid;
   update topics set completed_at=case when (item->>'completed')::boolean then now() else null end where chapter_id=cid;
  end if;
  records:=records+1;
 end loop;
 return jsonb_build_object('saved',records);
end $$;
revoke all on function save_student_plan(uuid,uuid,jsonb) from public,anon;
grant execute on function save_student_plan(uuid,uuid,jsonb) to authenticated;

alter table assessments add column exam_paper_id uuid references exam_papers(id) on delete set null;
create index assessments_exam_paper on assessments(exam_paper_id);
create table assessment_topics (
 assessment_id uuid not null references assessments(id) on delete cascade,
 topic_id uuid not null references topics(id) on delete cascade,
 primary key(assessment_id,topic_id)
);
alter table assessment_topics enable row level security;
revoke all on assessment_topics from anon,authenticated;
grant select,insert,update,delete on assessment_topics to authenticated;
create policy assessment_topics_read on assessment_topics for select to authenticated using(exists(select 1 from assessments a where a.id=assessment_id and is_family_member(a.family_id)));
create policy assessment_topics_write on assessment_topics for all to authenticated using(exists(select 1 from assessments a where a.id=assessment_id and is_family_parent(a.family_id))) with check(exists(select 1 from assessments a join topics t on t.id=topic_id join chapters c on c.id=t.chapter_id join books b on b.id=c.book_id where a.id=assessment_id and b.subject_id=a.subject_id and t.family_id=a.family_id and is_family_parent(a.family_id)));
create or replace function public.save_generated_assessment(meta jsonb, questions jsonb, chapter_ids uuid[]) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare a assessments; q jsonb; qid uuid; seq integer:=0;
begin
 insert into assessments(family_id,student_id,academic_year_id,subject_id,chapter_id,thread_id,exam_paper_id,title,difficulty,question_count,total_marks,created_by)
 values((meta->>'family_id')::uuid,(meta->>'student_id')::uuid,(meta->>'academic_year_id')::uuid,(meta->>'subject_id')::uuid,(meta->>'chapter_id')::uuid,(meta->>'thread_id')::uuid,(meta->>'exam_paper_id')::uuid,meta->>'title',meta->>'difficulty',jsonb_array_length(questions),(select sum((x->>'marks')::int) from jsonb_array_elements(questions) x),auth.uid()) returning * into a;
 foreach qid in array chapter_ids loop
  insert into assessment_chapters values(a.id,qid);
 end loop;
 for qid in select jsonb_array_elements_text(coalesce(meta->'topic_ids','[]'::jsonb))::uuid loop
  if not exists(select 1 from topics t where t.id=qid and t.chapter_id=any(chapter_ids)) then raise exception 'Invalid assessment topic'; end if;
  insert into assessment_topics(assessment_id,topic_id) values(a.id,qid);
 end loop;
 if a.exam_paper_id is not null and not exists(select 1 from exam_papers p where p.id=a.exam_paper_id and p.student_id=a.student_id and p.subject_id=a.subject_id) then raise exception 'Invalid assessment exam'; end if;
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


alter table chat_messages add column material_ids uuid[] not null default '{}';
create function check_chat_attachments() returns trigger language plpgsql security invoker set search_path=public as $$
declare mid uuid;
begin
 if cardinality(new.material_ids)>5 then raise exception 'Too many attachments'; end if;
 foreach mid in array new.material_ids loop
  if not exists(select 1 from learning_materials m where m.id=mid and m.student_id=new.student_id and m.family_id=new.family_id) then raise exception 'Invalid chat attachment'; end if;
 end loop;
 return new;
end $$;
create trigger chat_attachments_context before insert or update on chat_messages for each row execute function check_chat_attachments();

create index topics_family on topics(family_id);
create index student_exams_year on student_exams(academic_year_id);
create index exam_papers_subject on exam_papers(subject_id);
create index assessment_topics_topic on assessment_topics(topic_id);

create function check_assessment_exam_link() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.exam_paper_id is not null and not exists(select 1 from exam_papers p where p.id=new.exam_paper_id and p.family_id=new.family_id and p.student_id=new.student_id and p.subject_id=new.subject_id) then raise exception 'Invalid assessment exam'; end if;
 return new;
end $$;
create trigger assessment_exam_context before insert or update on assessments for each row execute function check_assessment_exam_link();

create function check_material_curriculum() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from students s where s.id=new.student_id and s.family_id=new.family_id) then raise exception 'Invalid material student'; end if;
 if new.academic_year_id is not null and not exists(select 1 from academic_years y where y.id=new.academic_year_id and y.student_id=new.student_id and y.family_id=new.family_id) then raise exception 'Invalid material year'; end if;
 if new.subject_id is not null and not exists(select 1 from subjects s join academic_years y on y.id=s.academic_year_id where s.id=new.subject_id and s.family_id=new.family_id and y.student_id=new.student_id and (new.academic_year_id is null or y.id=new.academic_year_id)) then raise exception 'Invalid material subject'; end if;
 if new.book_id is not null and not exists(select 1 from books b where b.id=new.book_id and b.family_id=new.family_id and b.subject_id=new.subject_id) then raise exception 'Invalid material book'; end if;
 if new.chapter_id is not null and not exists(select 1 from chapters c join books b on b.id=c.book_id where c.id=new.chapter_id and c.family_id=new.family_id and b.subject_id=new.subject_id) then raise exception 'Invalid material chapter'; end if;
 return new;
end $$;
create trigger material_curriculum_context before insert or update on learning_materials for each row execute function check_material_curriculum();
