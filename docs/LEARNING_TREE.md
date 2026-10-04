# Learning tree and academic editing

The workspace now keeps generated lessons and tests under academic year → subject → book → chapter. Lessons may also be saved directly under a subject. Their titles act as topic entries; a separate topic taxonomy is not introduced in this release. Miscellaneous answers remain in chat threads.

## User flow

1. Use Setup to add or edit academic years (including grade and dates), subjects, books and chapters.
2. Select a subject or chapter in Learning tree. The selected curriculum supplies the saved content's tags automatically.
3. In Chat & generate, choose general chat, a saved lesson/topic, or a generated test. Conversation threads can be reopened independently.
4. In Build a test, select multiple chapters within the subject and optionally specify section names, question types, counts and marks. The server rejects a generated paper that does not match its blueprint.
5. Take the test, submit and reopen its results from the tree or saved results list. Parents can show answer keys. MCQs are checked directly against canonical option text; nonblank written answers go to the LLM. Blank answers get zero without an LLM call.

Markdown, tables, code and KaTeX math render in chats, lessons, questions and feedback. Raw HTML is not enabled.

## Persistence and boundaries

- `chat_threads` keeps conversations; existing messages are migrated into one Earlier conversations thread per learner.
- `learning_contents` stores lessons and their selected context.
- `assessment_chapters` supports a test appearing beneath several chapters. Results remain attached to their assessment.
- Stored procedures save generated tests (including every answer key) and graded attempts atomically using the caller's permissions.
- Document retrieval is filtered to ready files in the selected student/year/subject/chapters. Existing indexed files receive stable material-ID attributes when used.
- Curriculum edits cannot reassign ownership. Deletion requires a parent and an empty node; existing learning history is protected. This release intentionally does not cascade-delete a populated curriculum branch.
- The current account flow remains parent sign-in followed by child selection. Independent child-account grading is not introduced here.
- Test drafts use session storage in the current browser tab. Saved submissions persist in the database.

## Deployment

Apply `supabase/migrations/20261003132330_learning_tree.sql` before deploying this API and frontend. The new routes require that schema. The migration is additive and backfills chat threads and existing single-chapter test links. The remote application of this migration has not been performed: automatic approval review required explicit approval for the persistent database change.

The configured OpenAI model and credentials are unchanged. Live paid generation has not been exercised as part of these local checks; tests mock OpenAI and the browser tests mock the API. Run a production smoke test with an uploaded chapter after rollout.

## Verification

- API: `python -m pytest apps/api/tests -q` (15 tests).
- Web: `npm run build`, `npm run test:e2e` from `apps/web` (existing authentication tests plus learning-tree tests).
- Database: `npm run test:db` from `apps/web`, using PGlite/Postgres with minimal local Auth stubs. Covers migration execution, saved lessons, atomic assessment and result writes, rollback on invalid questions, and cross-family reads.
- CI runs these checks on web, API and migration changes.
