# Cloud Run deployment

Target project: `family-learning-os-dev`

Deploy the FastAPI application from `apps/api` as a Cloud Run service.

Recommended initial settings:
- CPU: 1 vCPU.
- Memory: 512 MiB.
- Minimum instances: 0.
- Maximum instances: 2.
- Request-based billing.
- Allow unauthenticated HTTP access to the service endpoint. Application endpoints still require Supabase bearer tokens except `/health`.

Required runtime environment variables:
- `APP_ENV=production`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Not required yet:
- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Production frontend origin: `https://family-learning-os-mocha.vercel.app`
Local frontend origin: `http://localhost:3000`

After deployment:
1. Open `/health` on the Cloud Run URL and confirm `{"status":"ok"}`.
2. Add the Cloud Run base URL in Vercel as `NEXT_PUBLIC_API_BASE_URL`.
3. Redeploy Vercel.
4. Test sign in -> dashboard -> create family.

The Cloud Run service is stateless. Supabase remains the system of record for Auth, Postgres and Storage.
