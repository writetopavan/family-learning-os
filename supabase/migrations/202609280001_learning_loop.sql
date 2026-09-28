-- Phase 2: document-grounded tutor, assessments, attempts and AI usage tracking.

create table public.student_ai_spaces (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  openai_vector_store_id text not null,
  created_at timestamptz not null default now(),
  unique (student_id)
);

create table public.learning_materials (
  id uuid primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  title text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null check (size_bytes >= 0),
  openai_file_id text,
  openai_vector_store_id text,
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  error_message text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_by uuid references auth.users(id) on delete set null,
  model text,
  openai_response_id text,
  created_at timestamptz not null default now()
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  title text not null,
  difficulty text not null default 'mixed'
    check (difficulty in ('easy', 'medium', 'hard', 'mixed')),
  question_count integer not null check (question_count between 1 and 50),
  total_marks integer not null check (total_marks > 0),
  source text not null default 'ai' check (source in ('ai', 'manual')),
  status text not null default 'ready' check (status in ('draft', 'ready', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  question_type text not null check (question_type in ('mcq', 'short', 'long')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  marks integer not null check (marks > 0),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  concept text,
  created_at timestamptz not null default now(),
  unique (assessment_id, sequence)
);

create table public.assessment_answer_keys (
  question_id uuid primary key references public.assessment_questions(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  answer_key text not null,
  explanation text,
  created_at timestamptz not null default now()
);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'graded' check (status in ('in_progress', 'submitted', 'graded')),
  score numeric(8,2) not null default 0,
  max_score numeric(8,2) not null,
  overall_feedback text,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  graded_at timestamptz
);

create table public.assessment_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  question_id uuid not null references public.assessment_questions(id) on delete cascade,
  answer text not null default '',
  awarded_marks numeric(8,2) not null default 0,
  feedback text,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  feature text not null,
  model text not null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  openai_response_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_student_ai_spaces_family on public.student_ai_spaces(family_id);
create index idx_learning_materials_student on public.learning_materials(student_id, created_at desc);
create index idx_learning_materials_subject on public.learning_materials(subject_id);
create index idx_chat_messages_student on public.chat_messages(student_id, created_at desc);
create index idx_assessments_student on public.assessments(student_id, created_at desc);
create index idx_assessment_questions_assessment on public.assessment_questions(assessment_id, sequence);
create index idx_assessment_attempts_assessment on public.assessment_attempts(assessment_id, created_at desc);
create index idx_assessment_answers_attempt on public.assessment_answers(attempt_id);
create index idx_ai_usage_family on public.ai_usage_events(family_id, created_at desc);

alter table public.student_ai_spaces enable row level security;
alter table public.learning_materials enable row level security;
alter table public.chat_messages enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_answer_keys enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_answers enable row level security;
alter table public.ai_usage_events enable row level security;

create policy "members can read student ai spaces"
on public.student_ai_spaces for select
using (public.is_family_member(family_id));

create policy "parents can create student ai spaces"
on public.student_ai_spaces for insert
with check (public.is_family_parent(family_id));

create policy "parents can update student ai spaces"
on public.student_ai_spaces for update
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create policy "members can read learning materials"
on public.learning_materials for select
using (public.is_family_member(family_id));

create policy "parents can create learning materials"
on public.learning_materials for insert
with check (public.is_family_parent(family_id) and created_by = (select auth.uid()));

create policy "parents can update learning materials"
on public.learning_materials for update
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create policy "parents can delete learning materials"
on public.learning_materials for delete
using (public.is_family_parent(family_id));

create policy "members can read chat messages"
on public.chat_messages for select
using (public.is_family_member(family_id));

create policy "members can create chat messages"
on public.chat_messages for insert
with check (
  public.is_family_member(family_id)
  and (created_by is null or created_by = (select auth.uid()))
);

create policy "members can read assessments"
on public.assessments for select
using (public.is_family_member(family_id));

create policy "parents can create assessments"
on public.assessments for insert
with check (public.is_family_parent(family_id) and created_by = (select auth.uid()));

create policy "parents can update assessments"
on public.assessments for update
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create policy "members can read assessment questions"
on public.assessment_questions for select
using (public.is_family_member(family_id));

create policy "parents can create assessment questions"
on public.assessment_questions for insert
with check (public.is_family_parent(family_id));

create policy "parents can update assessment questions"
on public.assessment_questions for update
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create policy "parents can read assessment answer keys"
on public.assessment_answer_keys for select
using (public.is_family_parent(family_id));

create policy "parents can create assessment answer keys"
on public.assessment_answer_keys for insert
with check (public.is_family_parent(family_id));

create policy "parents can update assessment answer keys"
on public.assessment_answer_keys for update
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create policy "members can read assessment attempts"
on public.assessment_attempts for select
using (public.is_family_member(family_id));

create policy "members can create assessment attempts"
on public.assessment_attempts for insert
with check (
  public.is_family_member(family_id)
  and submitted_by = (select auth.uid())
);

create policy "members can update assessment attempts"
on public.assessment_attempts for update
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));

create policy "members can read assessment answers"
on public.assessment_answers for select
using (public.is_family_member(family_id));

create policy "members can create assessment answers"
on public.assessment_answers for insert
with check (public.is_family_member(family_id));

create policy "members can update assessment answers"
on public.assessment_answers for update
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));

create policy "parents can read ai usage"
on public.ai_usage_events for select
using (public.is_family_parent(family_id));

create policy "members can create ai usage"
on public.ai_usage_events for insert
with check (
  public.is_family_member(family_id)
  and (created_by is null or created_by = (select auth.uid()))
);
