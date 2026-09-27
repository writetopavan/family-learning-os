# Architecture

## Architectural style
Start as a modular monolith. Optimize for clear boundaries and rapid iteration rather than distributed infrastructure.

```text
Next.js / React
      |
      v
FastAPI application
      |
      +-- Identity & Family
      +-- Curriculum
      +-- Materials & Retrieval
      +-- Tutor
      +-- Assessment
      +-- Mastery
      +-- Planning & Calendar
      +-- Usage & Billing
      |
      +--> Supabase Postgres
      +--> Supabase Storage
      +--> LLM / embedding providers
```

## Proposed stack

### Web
- Next.js + React + TypeScript.
- Vercel deployment.
- Parent and child experiences in the same application with role-aware navigation.

### API
- Python + FastAPI.
- Pydantic for request/response contracts.
- SQLAlchemy or a thin Postgres data layer.
- Background jobs introduced only when ingestion/evaluation requires them.

### Data platform
Supabase initially provides:
- Postgres.
- Authentication.
- Object storage.
- Row Level Security as a defense-in-depth layer.

Application authorization must still explicitly validate family/tenant ownership.

### AI
Use an internal AI abstraction instead of calling one model throughout domain code.

Suggested boundary:
```python
class AIProvider:
    generate(...)
    embed(...)
    classify(...)
```

OpenAI is the initial provider, but prompts, model identifiers, usage and cost are stored outside business logic.

### Retrieval
Uploaded source material is stored as immutable/raw files plus derived artifacts.

Pipeline:
1. Upload file.
2. Store raw object.
3. Extract document text/structure.
4. Associate with child/subject/book/chapter where known.
5. Chunk semantically.
6. Generate embeddings.
7. Store searchable chunk metadata.
8. Retrieve with strong tenant and curriculum filters.
9. Generate answers with citations to source chunks.

Do not make vector search the canonical curriculum representation. Curriculum and learning state remain structured relational data.

## Module boundaries

### Identity & Family
Families, users, memberships, roles, students and preferences.

### Curriculum
Academic years, grades, subjects, books, chapters, topics, concepts and learning objectives.

### Materials
Files, parsed documents, pages/sections, chunks, metadata and ingestion jobs.

### Tutor
Chat sessions, messages, grounded responses and learning actions.

### Assessment
Assessments, questions, rubrics, attempts, answers, scoring and submitted evidence.

### Mastery
Concept-level proficiency signals, chapter completion and mistake history.

### Planning
Events, exams, syllabus scopes, study plans and daily tasks.

### Usage
AI requests, model usage, tokens, estimated cost, storage usage and plan quotas.

## Multi-tenancy
The family is the SaaS tenant boundary.

Every tenant-owned record must be attributable to a `family_id` directly or through a guaranteed parent relationship.

Rules:
- Never trust a family ID supplied by the client without authorization checks.
- All object-storage paths are namespaced by family.
- Retrieval queries always filter by family before semantic ranking.
- Background jobs carry tenant context.
- Logs should avoid raw child content wherever possible.

## Authentication and authorization
Use Supabase Auth initially.

Roles:
- parent
- child

A parent may manage the family and act in a child context.
A child may access only allowed family/student data.

Authorization should live in application policies, not be inferred from UI visibility.

## Chat architecture
Chat is a command surface over structured application services.

Examples:
- "I finished Chapter 3" -> progress service command.
- "My math exam is on 18 Oct" -> event creation.
- "Test me on fractions" -> assessment creation.
- "Why did I get this wrong?" -> assessment evidence + tutor context.

Chat messages remain useful context, but they are not the authoritative source for progress, schedules or mastery.

## MCP strategy
Do not expose every internal API through MCP.

Build stable internal application services first. Later expose selected actions such as:
- create_assessment
- record_learning_completion
- get_exam_readiness
- create_study_plan
- search_student_material

## Deployment
Initial target:
- Web: Vercel.
- API: a managed Python/container platform.
- DB/Auth/Storage: Supabase.
- CI: GitHub Actions.

Avoid Kubernetes for the MVP.

## Observability
From early versions track:
- request ID
- family ID (pseudonymous/internal)
- user ID
- feature
- model
- latency
- token usage
- estimated AI cost
- ingestion failures
- assessment-generation/evaluation failures

Do not place child answers or full document content in normal application logs.

## Security and privacy principles
- Strong tenant isolation.
- Minimal child data collection.
- Parent-controlled deletion/export.
- Encryption in transit and at rest through managed services.
- Signed/private object access.
- No public textbook files by default.
- Explicit retention rules.
- Audit privileged parent/admin actions later.

## Scaling philosophy
Scale modules independently only when evidence demands it.
Likely future candidates for extraction:
- document ingestion
- retrieval/indexing
- AI execution
- notifications

The core curriculum, mastery and planning model should remain transactionally consistent as long as practical.
