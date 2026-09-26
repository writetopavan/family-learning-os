# Family Learning OS

AI-first family learning platform for Grades 4–10.

The first objective is to solve real day-to-day learning management for a family with two children, then evolve the validated product into a multi-tenant SaaS.

## Product loop

```text
School material
   -> structured syllabus
   -> learn
   -> practice
   -> assess
   -> update mastery
   -> plan revision
   -> reassess
```

## Phase 0 decisions

- Family is the SaaS tenant boundary.
- Parent and child are distinct roles/experiences.
- Curriculum is structured as Academic Year -> Grade -> Subject -> Book -> Chapter -> Topic -> Concept.
- Progress is evidence-backed through assessments, submitted work and explicit completion signals.
- Chat is an interface over structured application state, not the database.
- Start as a modular monolith.
- Frontend: Next.js / React / TypeScript.
- Backend: Python / FastAPI.
- Data/Auth/Storage: Supabase.
- Web deployment: Vercel.
- AI: provider abstraction with OpenAI initially.
- Internal APIs/services first; expose selected capabilities through MCP later.
- Track AI usage per family/user/student/feature/model for quotas and future billing.

## Repository layout

```text
family-learning-os/
├── apps/
│   ├── web/           # Next.js application
│   └── api/           # FastAPI application
├── docs/
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   └── ROADMAP.md
├── supabase/          # migrations/config/seed in Phase 1
└── README.md
```

## First vertical slice

Create child -> add subject/book -> upload chapter PDF -> ask contextual question -> generate test -> submit/evaluate -> update mastery -> show progress.

## Documentation

- [Product definition](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Canonical data model](docs/DATA_MODEL.md)
- [Development roadmap](docs/ROADMAP.md)

## Status

Phase 0: foundation.

Application code starts in Phase 1 after these foundational decisions are reviewed.
