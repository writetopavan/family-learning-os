# Canonical Data Model

## Design goal
Represent learning as structured, evidence-backed state rather than chat history or simple chapter completion percentages.

## Tenant and identity

### family
- id
- name
- created_at

### user
Authentication identity from Supabase.

### family_membership
- family_id
- user_id
- role: parent | child
- status

### student
Represents a learner profile.
- id
- family_id
- linked_user_id nullable
- display_name
- date_of_birth nullable
- active

A student can exist before the child receives a login.

## Academic structure

### academic_year
- id
- family_id
- student_id
- label
- start_date
- end_date
- grade_level

### subject
- id
- academic_year_id
- name

### book
- id
- subject_id
- title
- publisher nullable
- edition nullable

### chapter
- id
- book_id
- title
- sequence

### topic
- id
- chapter_id
- title
- sequence

### concept
- id
- topic_id
- name
- description nullable

### learning_objective
- id
- concept_id
- statement
- expected_level nullable

Initial ingestion may create incomplete hierarchy nodes. Parents/AI can refine them later.

## Materials

### material
Represents the logical uploaded artifact.
- id
- family_id
- uploaded_by_user_id
- student_id nullable
- subject_id nullable
- book_id nullable
- chapter_id nullable
- material_type
- original_filename
- storage_path
- mime_type
- status
- checksum
- created_at

### material_section
Structured extracted section/page/block.
- id
- material_id
- page_number nullable
- heading nullable
- text
- sequence

### material_chunk
Retrieval unit.
- id
- material_section_id
- family_id
- text
- embedding
- token_count
- metadata

The raw file is the source artifact. Derived text/chunks can be regenerated.

## Tutor

### chat_session
- id
- family_id
- actor_user_id
- student_id
- context_subject_id nullable
- context_chapter_id nullable

### chat_message
- id
- session_id
- role
- content
- created_at

### learning_action
Structured action produced through chat.
- id
- family_id
- student_id
- source_message_id nullable
- action_type
- payload_json
- status

## Assessments

### assessment
- id
- family_id
- student_id
- subject_id
- chapter_id nullable
- purpose: practice | diagnostic | revision | exam
- title
- generated_by
- status
- created_at

### assessment_question
- id
- assessment_id
- question_type
- prompt
- marks
- difficulty
- rubric_json
- expected_answer_json
- sequence

### question_concept
Many-to-many mapping from question to concepts.

### assessment_attempt
- id
- assessment_id
- student_id
- started_at
- submitted_at
- total_score
- max_score
- evaluation_status

### attempt_answer
- id
- attempt_id
- question_id
- answer_text nullable
- answer_json nullable
- score nullable
- feedback nullable
- evaluator
- confidence nullable

### evidence
General proof of learning.
- id
- family_id
- student_id
- evidence_type
- source_entity_type
- source_entity_id
- storage_path nullable
- created_at

Examples: test attempt, uploaded worksheet, parent confirmation, self-completion.

## Mastery and progress

### concept_mastery
- id
- family_id
- student_id
- concept_id
- mastery_score
- confidence
- last_evaluated_at
- evidence_count

### mastery_signal
Append-only signal feeding mastery calculation.
- id
- student_id
- concept_id
- source_type
- source_id
- signal_value
- weight
- observed_at

### chapter_progress
Derived/cached view where useful.
- student_id
- chapter_id
- completion_percent
- mastery_percent
- status
- updated_at

Important: chapter completion and mastery are not the same thing.

## Planning and schedules

### event
- id
- family_id
- student_id nullable
- event_type: exam | school_event | activity | reminder
- title
- starts_at
- ends_at nullable
- source_material_id nullable

### exam_scope
- id
- event_id
- subject_id
- chapter_id nullable
- topic_id nullable

### study_plan
- id
- family_id
- student_id
- target_event_id nullable
- start_date
- end_date
- status

### study_task
- id
- study_plan_id
- subject_id
- chapter_id nullable
- concept_id nullable
- task_type
- due_at
- estimated_minutes
- status
- completion_evidence_id nullable

## Usage and SaaS

### ai_usage_event
Append-only.
- id
- family_id
- user_id
- student_id nullable
- feature
- provider
- model
- input_tokens
- output_tokens
- cached_tokens nullable
- estimated_cost
- request_id
- created_at

### subscription
Later phase.
- family_id
- plan
- provider_customer_id
- provider_subscription_id
- status

### quota
Later phase.
- family_id
- metric
- period
- limit
- consumed

## Key invariants
1. Tenant-owned data is never globally queryable without explicit privileged context.
2. A child cannot cross family boundaries.
3. Retrieval always filters by family before similarity ranking.
4. Mastery is derived from evidence/signals, not directly edited as the primary workflow.
5. Chat does not own canonical academic state.
6. AI usage is append-only for auditability and billing reconciliation.
7. Uploaded files retain provenance to the original material.

## Early simplifications
For the first vertical slice:
- Topic/concept extraction may be AI-assisted and parent-correctable.
- One student can be selected as the active child context.
- Mastery can begin with a simple weighted score before using advanced models.
- Postgres + pgvector is sufficient; no separate vector database is required initially.
