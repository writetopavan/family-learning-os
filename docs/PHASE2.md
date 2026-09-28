# Phase 2 — Learning loop

Phase 2 turns the foundation into an end-to-end learning product.

## User flow

1. Parent signs in and selects a child.
2. Configure academic year, grade, subject, book and chapter.
3. Upload school material to the private Supabase Storage bucket.
4. The API indexes that material into a per-student OpenAI vector store.
5. AI Tutor answers questions using file search over the student's material.
6. Parent/student generates an assessment from the same material.
7. Student submits answers.
8. MCQs are graded deterministically; free-text answers are graded against stored answer keys.
9. Score, feedback, attempts and AI token usage are persisted in Supabase.

## OpenAI integration

The API uses the OpenAI Responses API and hosted file search. The default MVP model is
`gpt-5.6-luna` to keep usage cost low; it can be changed with `OPENAI_MODEL`.

Required Cloud Run secret:
- `OPENAI_API_KEY`

Optional Cloud Run variables:
- `OPENAI_MODEL=gpt-5.6-luna`
- `OPENAI_REASONING_EFFORT=low`

The OpenAI key must never be exposed through a `NEXT_PUBLIC_*` browser variable.

## Data boundaries

- Supabase RLS remains the tenant authorization boundary.
- Learning files are stored privately under:
  `<family_id>/<student_id>/<material_id>/<filename>`
- Each student receives a separate OpenAI vector store.
- Assessment answer keys are stored separately from question rows and are parent-readable only.
- AI usage events record feature, model and token counts.

## MVP limits

- Maximum registered document size: 100 MB.
- Material indexing may briefly show `processing` before file search is ready.
- Long AI requests can take longer than ordinary CRUD endpoints. Cloud Run request timeout should be at least 180 seconds for this phase.

## Next phase

- mastery model by concept and learning objective
- exam syllabus tracking
- study planner
- parent progress dashboard
- child-specific sign-in and permissions
- streaming chat responses
- deletion/synchronization of OpenAI files when source material is removed
