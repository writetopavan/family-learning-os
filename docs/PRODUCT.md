# Product Definition

## Working product
Family Learning OS is an AI-first learning and planning platform for families with children in Grades 4–10.

The first users are a single family with two children. The product should solve their real day-to-day learning workflow before being generalized as SaaS.

## Primary outcomes
1. Know what each child needs to learn next.
2. Track syllabus and chapter completion with evidence, not only checkboxes.
3. Turn books, worksheets, school notices and schedules into structured learning data.
4. Generate explanations, practice and tests on demand.
5. Track mastery, recurring mistakes and exam readiness.
6. Give parents a concise view of progress, upcoming work and weak areas.

## Core users

### Parent
- Creates/manages the family.
- Adds children and academic context.
- Uploads books, worksheets, exam schedules and school notices.
- Reviews completion, mastery, exam readiness and AI usage.
- Can act on behalf of a child when entering data.

### Child
- Sees today's plan.
- Learns through chat and generated content.
- Asks doubts against approved learning material.
- Takes tests and submits answers/evidence.
- Marks tasks complete where appropriate.

## MVP scope
- Grades 4–10.
- Academic subjects first.
- Family account with multiple children.
- PDF/document upload.
- Curriculum hierarchy: subject -> book -> chapter -> topic -> concept.
- AI tutor with retrieval over the child's materials.
- Assessment generation and evaluation.
- Mastery and progress tracking.
- Exam/syllabus schedule and study planning.
- Parent dashboard.
- Usage/token metering.

## Out of scope for first MVP
- Full school/teacher administration product.
- Marketplace.
- Live tutoring.
- Native mobile apps.
- Complex gamification.
- Microservices.
- Broad extracurricular ontology.
- Full MCP exposure of internal APIs.

## Core product loop
School material -> structured syllabus -> learn -> practice -> assess -> update mastery -> plan revision -> reassess.

## Product principles
- Chat is an interface, not the system of record.
- Important chat actions must update structured state.
- Progress should be backed by evidence.
- Parent and child experiences should be distinct.
- Child safety, privacy, deletion and tenant isolation are first-class requirements.
- The system should be useful even when AI features are temporarily unavailable.

## First vertical slice
1. Create family and child.
2. Add subject and book.
3. Upload one chapter PDF.
4. Extract/index chapter content.
5. Ask a contextual question.
6. Generate a 10-question test from the chapter.
7. Submit answers.
8. Evaluate and store attempt evidence.
9. Update concept/chapter mastery.
10. Show updated progress to parent and child.

## SaaS direction
Potential packaging:
- Free: limited child count, storage and AI usage.
- Family: broader usage and planning.
- Family Pro: higher limits, deeper analytics, premium models and advanced assessments.

Pricing should be based on value and usage limits, not exposed model-token complexity.
