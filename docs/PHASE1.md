# Phase 1 Implementation

## Included in this branch

### Supabase
- Core family/curriculum schema.
- Grades constrained to 4–10.
- Parent/child membership roles.
- Row Level Security helper functions and policies.
- Atomic family bootstrap RPC.
- Private learning-materials storage bucket and tenant-aware policies.

### FastAPI
- Environment configuration.
- Supabase JWT validation.
- REST calls executed with the caller's access token so RLS stays effective.
- Endpoints for families, students, academic years, subjects, books and chapters.
- Health endpoint and local CORS setup.

### Next.js
- Supabase browser client.
- Passwordless email sign-in.
- Minimal dashboard.
- Family creation/listing flow.

## Setup still required outside GitHub
1. Create a Supabase project.
2. Apply the migrations in `supabase/migrations`.
3. Configure local/server environment variables from `.env.example`.
4. Configure the Supabase Auth redirect URL for the local web app.
5. Run the API and web app locally.

## Security notes
- Never commit `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY`.
- The browser uses only the anon/publishable key.
- API data calls use the user's JWT to preserve RLS.
- The service-role key is reserved for future privileged backend jobs.
- Family is the tenant boundary.

## Phase 1 remaining after live Supabase connection
Once the actual Supabase project is connected and migrations are verified:
- add student creation UI
- add academic year/grade UI
- add subject/book/chapter CRUD screens
- add integration tests against the live/dev Supabase project
- configure deployment environments
