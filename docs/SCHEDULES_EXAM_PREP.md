# Student schedules and exam preparation

Schedules and exam preparation share the existing student → academic year → subject → book → chapter hierarchy. Topics are chapter master records. Exam series belong to a student and academic year; each subject paper references its subject and syllabus references existing chapter/topic IDs. Completion is shared across exams and explicitly reported by the learner through the parent session; marks remain separate evidence.

## Flows

- **Schedule**: create from a message, attach a school document, review the extraction, save; or add a routine manually. The day planner expands daily/weekly recurrences and inclusive holiday ranges. Local dates and times default to Asia/Kolkata. Weekly days use Sunday=0.
- **Exam prep**: import subject dates and chapter/topic lists. Subject names must exist in the selected academic year. Exam papers create linked calendar entries; changing a paper date through an amended plan updates its entry. Unknown dates remain unset.
- **Progress**: mark/reopen syllabus chapters or topics. Completing a chapter completes its topics; reopening a topic reopens the chapter. Completing individual topics does not automatically assert that the whole chapter is mastered.
- **Practice**: select syllabus items and generate a grounded test. Topic choices infer their parent chapters. Full-chapter selections and topic selections remain distinct. Tests save the exam paper, chapter links and topic links, and retain the existing answer keys, deterministic MCQ scoring and LLM grading for written answers.
- **AI Tutor**: attach files and ask to save a timetable, create an exam syllabus, import a textbook, or report completion. Explicit requests save in one transaction and acknowledge success. Ordinary questions only return an answer. The most recent attached message in the last ten turns supplies sources to follow-up requests.
- **Library**: choose a subject, upload with “This is a textbook”, then review extracted chapters/topics and save. “Extract chapters” also works on an existing indexed document. Indexed whole books remain available to chapter-specific lessons/tests via their book link.

## Extraction and limits

Selected document files are passed as full Responses API file inputs and scoped file search sources. The existing OpenAI vector store indexes book content for retrieval; chapter and topic records provide the navigation index. File search filters never include a sibling's material.

Extraction is model-generated and must be checked for source quality, dates, subject naming, and the complete contents list. Ambiguous names require clarification. Incomplete responses are rejected before saving. Each plan supports up to 100 chapters per book, 100 topics per chapter, and 100 events. Full-source extraction supports up to five attachments and 45 MB combined; split larger books or upload the contents section. Routine uploads retain the existing 100 MB limit. A document still indexing can be retried; extraction checks and promotes its status when indexing completes.

The dedicated Schedule, Exam prep and Library screens offer a preview before save. Chat explicitly requesting a save applies directly. Schedule edits can be made by describing revised times in chat; obsolete unlinked events can be removed in Schedule. Exam syllabus entries and whole exams can be removed in Exam prep. Changing a routine's identity (name/start date/start time/repeat) creates a new event; remove the old one when replacing it.

## API and database

- `GET /v1/students/{student_id}/planning`: scoped curriculum, topics, exams, papers, syllabus and schedules.
- `POST /v1/planning/interpret`: structured extraction, with usage tracking, without master-data writes.
- `POST /v1/planning/apply`: validated parent request → atomic `save_student_plan` RPC.
- `DELETE /v1/planning/{schedules|exams|syllabus}/{id}`: remove a saved item; linked exam dates must be amended through their exam.
- `/v1/chat` accepts `material_ids`; chat message records retain attachment IDs.
- `/v1/assessments/generate` accepts `topic_ids` and `exam_paper_id`.

Migration: `supabase/migrations/20261004035656_schedules_exam_prep.sql`. Apply after the existing student-onboarding migration and before deploying these API/frontend changes. It adds RLS-protected tables, ownership-validation triggers, atomic plan saving, book/material links, topic/exam assessment links and chat attachment metadata. Existing family data and grading APIs are preserved. Student deletion cascades to planning records and topics.

## Verification

Run the API pytest suite, `npm run test:db`, `npm run build`, and `npm run test:e2e` from the appropriate apps. Browser tests use mocked auth/API responses; they do not call the live LLM or write family data. The database tests execute real PostgreSQL-compatible migrations and verify reuse, repeat-safe writes, progress/reopening, exam date synchronization, rollback, sibling isolation, cross-family RLS, and student deletion. `TEST_PORT` can isolate the browser test server from an existing local server.
