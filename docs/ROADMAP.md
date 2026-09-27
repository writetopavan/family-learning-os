# Development Roadmap

## Phase 0 - Foundation
Goal: establish product and architecture decisions before feature coding.

Deliverables:
- Product definition.
- Architecture.
- Canonical data model.
- Development roadmap.
- Repository skeleton.
- Initial technology choices.

Exit criteria:
- First vertical slice is unambiguous.
- Tenant boundary is defined.
- Core entities and module boundaries are agreed.
- No major infrastructure is introduced without an MVP need.

## Phase 1 - Family and Curriculum
Build:
- Supabase project and migrations.
- Auth.
- Family creation.
- Parent/child roles.
- Student profiles.
- Academic year and grade.
- Subjects, books and chapters.
- Basic role-aware web shell.

Exit criteria:
A parent can sign in, select a child and create the child's academic structure.

## Phase 2 - Material Ingestion
Build:
- PDF upload.
- Private Supabase Storage.
- Parsing and extraction.
- Material/chapter association.
- Chunking and embeddings.
- Retrieval API.

Exit criteria:
A chapter PDF can be uploaded and reliably retrieved only inside the correct family/child context.

## Phase 3 - AI Tutor
Build:
- Chat interface.
- Context selection.
- Retrieval-grounded answers.
- Source citations.
- AI provider abstraction.
- Usage/token logging.

Exit criteria:
A child can ask questions about an uploaded chapter and receive grounded answers with traceable source material.

## Phase 4 - Assessment
Build:
- Question generation.
- MCQ and short/long-answer formats.
- Test persistence.
- Submission.
- Automated evaluation.
- Per-question feedback.
- Evidence capture.

Exit criteria:
A child can generate, take and submit a test and the full attempt is stored.

## Phase 5 - Mastery
Build:
- Concept tagging.
- Mastery signals.
- Mistake history.
- Concept/chapter progress.
- Reassessment workflow.

Exit criteria:
Assessment evidence changes mastery/progress in an explainable way.

## Phase 6 - Planning
Build:
- Exam events.
- Syllabus scopes.
- School schedule ingestion.
- Study plans.
- Daily tasks.
- Automatic replanning.

Exit criteria:
Given an exam date, syllabus and current mastery, the system can produce and maintain a realistic study plan.

## Phase 7 - Parent Dashboard
Build:
- Both children overview.
- Upcoming exams/events.
- Syllabus completion.
- Weak concepts.
- Recent assessments.
- Today's tasks.
- AI/storage usage.

Exit criteria:
A parent can understand each child's current learning status in under a minute.

## Phase 8 - SaaS Hardening
Build only after repeated family usage validates the product:
- Subscription plans.
- Payment provider.
- Quotas.
- Tenant isolation tests.
- Data export/deletion.
- Audit trails.
- Onboarding.
- Error monitoring and production analytics.
- Terms/privacy/compliance review.

## MVP success test
Before monetization, the family should be able to use the system repeatedly for real school work without maintaining parallel spreadsheets or manually reconstructing context.

## Immediate implementation order
The first development sprint should target a single end-to-end slice:

Create child -> add subject/book -> upload chapter PDF -> ask contextual question -> generate test -> submit/evaluate -> update mastery -> show progress.

Prefer one working path over many partially implemented screens.
