# Student onboarding

Parents can create a child with only a name. Date of birth, board, class, school name and school location are optional. Board choices include CBSE, ICSE, Cambridge, IB, NIOS, named state boards and free-text alternatives.

Board and class provide an editable starter subject list, not an official or mandatory school syllabus. Schools choose different subjects and languages; parents review the suggestions before saving. English is suggested as a first language, and additional languages can be added with first/second/third language labels. Each academic year allows one subject per language level. Dates default to the current April–March school year and can be changed for any school calendar. Choosing a class creates that academic year together with the child and selected subjects in one database transaction. Skipping subjects does not create any. Books remain manually configured for this release; automatic book onboarding is a later phase.

After onboarding, Setup → Manage children edits optional profile details. Setup → Subjects adds missing board suggestions without duplicating existing subject names, adds custom subjects, edits names and language levels, and removes empty subjects. Existing subjects containing saved learning retain the existing deletion protection.

## Permanent deletion

Setup → Manage children → Delete student and data requires typing the exact child name. The API verifies an active parent membership before cleanup. It removes the student's OpenAI vector store and uploaded OpenAI files and recorded stored responses, then all Supabase uploads under the exact `family_id/student_id/` path, including uploads not yet registered as materials. Storage listing and material queries are paginated. OpenAI 404 deletions count as already completed.

Database deletion runs last, in one transaction. It removes lessons and test/chapter references before deleting the student, which cascades through academic years, subjects, books, chapters, documents, chats, tests, answers, results and AI spaces. Student-linked usage events are also removed. New AI calls disable provider response storage; the app still saves chats and learning history in its own database. The family, siblings and login accounts remain.

If a provider cleanup fails, the API returns 503 and retains the profile and resource IDs so the parent can retry. Files already removed stay removed. Cleanup is synchronous across separate providers rather than a distributed transaction; users should avoid uploading or generating new content for the child while deletion runs.

## Rollout and validation

Apply `supabase/migrations/20261004032602_student_onboarding.sql` before deploying the API/web changes. This migration was applied to `dtjioyzffclsayqdxjei` on 4 October 2026. All three new RPCs use SECURITY INVOKER, enforce parent authorization, revoke anonymous/public execution and grant authenticated execution. Existing rows are preserved.

Validation includes name-only onboarding, saving class/subjects/language labels, rollback of invalid setup, wrong-name and cross-family deletion rejection, full database cleanup with saved tests/results/lessons, sibling preservation, provider failure retention, and browser form/confirmation flows.

Verified: 19 API tests, 6 browser tests, the complete local database migration/rollback/RLS/deletion suite, TypeScript checking and the production build. Provider cleanup is tested with mocks; no existing student was deleted during verification. Supabase advisors reported no new findings.
