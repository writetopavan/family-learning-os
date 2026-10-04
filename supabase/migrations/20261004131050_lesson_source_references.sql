alter table public.learning_contents
  add column source_references jsonb not null default '[]'::jsonb
  check (jsonb_typeof(source_references) = 'array');
