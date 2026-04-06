# Valor Dashboard Design

## Goal
Turn the existing `vercel-webhook/` Vercel function into a Next.js 14 App Router application that preserves the live webhook endpoint at `/api/ghl-webhook` and adds a private operational dashboard backed by Supabase logging.

## Current State
- `vercel-webhook/` is a minimal Vercel project with a single API function at `api/ghl-webhook.js`.
- The webhook already uses IRS Logics and Supabase for round-robin assignment.
- `.env` contains IRS Logics, GHL, and Supabase credentials.
- There is no Next.js scaffold, no shared API utilities, no dashboard UI, and no migration artifact for a `task_logs` table.

## Recommended Approach
Convert `vercel-webhook/` in place to a Next.js app, but preserve the current webhook contract:
- Keep the production endpoint path as `/api/ghl-webhook`.
- Extract IRS Logics and Supabase access into shared `lib/` modules.
- Add `task_logs` logging for every webhook attempt.
- Build dashboard pages on top of the same deployment so the webhook and dashboard share one codebase and one data model.

This matches the user goal while minimizing risk: the webhook path stays stable, the business logic is centralized, and the dashboard can read the same shared utilities as the API routes.

## Architecture
### Application structure
- `app/` becomes the Next.js App Router surface for dashboard pages and route handlers.
- `components/` contains reusable dashboard UI building blocks.
- `lib/` contains deterministic utilities for IRS Logics requests, Supabase access, webhook payload normalization, and officer metadata.

### Data model
- Continue using the existing Supabase `round_robin` table for assignment state.
- Add a new `task_logs` table as the dashboard source of truth for webhook attempts.
- Log one row for every webhook execution, including success, case misses, task failures, and unhandled errors.

### Webhook flow
1. Normalize the inbound GHL payload.
2. Validate required lookup inputs.
3. Find the IRS Logics case by email, then phone.
4. Read and update round-robin state in Supabase.
5. Create the IRS Logics task.
6. Insert a `task_logs` row with the final outcome.
7. Return the same JSON shape expected by the existing automation.

### Dashboard flow
- Overview page reads aggregate stats plus recent activity.
- Officers page reads grouped assignment totals from `task_logs` and uses the round-robin index to highlight the next officer.
- Activity page reads paginated logs with filters.
- Lookup page proxies IRS Logics case lookup server-side and joins matching `task_logs` history.

## Error Handling
- Missing email and phone: return `400`, log `status='error'`.
- No matching case: return `404`, log `status='case_not_found'`.
- Task creation failure: preserve IRS Logics status/details, log `status='task_failed'`.
- Unexpected exceptions: return `500`, log `status='error'` with a truncated error message.
- Dashboard APIs should validate query params and return structured error JSON instead of raw failures.

## Testing Strategy
- Add focused tests around the shared webhook helpers and API route behavior where practical.
- Verify the migrated webhook still resolves `/api/ghl-webhook`.
- Run Next.js production build locally before any deployment step.
- If remote Supabase schema creation cannot be automated with the credentials available in `.env`, include a checked-in SQL artifact and surface that as the only manual step.

## Constraints
- Do not expose secrets client-side.
- Do not break the live webhook contract or endpoint path.
- Build on top of the existing in-progress package/webhook changes rather than discarding them.
- Keep the dashboard private by omission of auth, as requested.
