# Valor Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing Vercel webhook project into a Next.js dashboard app that logs every webhook execution to Supabase and exposes overview, officers, activity, and lookup views.

**Architecture:** Migrate `vercel-webhook/` to Next.js App Router in place, keep `/api/ghl-webhook` stable, centralize IRS Logics and Supabase logic in `lib/`, and drive the dashboard from a new `task_logs` table plus the existing `round_robin` state.

**Tech Stack:** Next.js 14, React 18, Tailwind CSS, Supabase REST/service role access, IRS Logics V4 API

---

### Task 1: Capture the new data model

**Files:**
- Create: `vercel-webhook/supabase/task_logs.sql`
- Create: `vercel-webhook/lib/officers.js`
- Test: `vercel-webhook/lib/officers.js`

- [ ] **Step 1: Add the `task_logs` SQL artifact**
- [ ] **Step 2: Extract officer metadata from `contacts.json` into a shared module**
- [ ] **Step 3: Verify all 13 officers and user IDs match the current source data**

### Task 2: Build shared server utilities

**Files:**
- Create: `vercel-webhook/lib/env.js`
- Create: `vercel-webhook/lib/supabase.js`
- Create: `vercel-webhook/lib/irs-logics.js`
- Create: `vercel-webhook/lib/webhook.js`
- Test: `vercel-webhook/tests/lib/*.test.js`

- [ ] **Step 1: Write failing tests for payload normalization and date parsing**
- [ ] **Step 2: Run the failing tests and confirm the missing helper behavior**
- [ ] **Step 3: Implement minimal helpers for env validation, officer lookup, webhook normalization, and IRS Logics calls**
- [ ] **Step 4: Re-run the tests and confirm they pass**

### Task 3: Convert the project shell to Next.js

**Files:**
- Modify: `vercel-webhook/package.json`
- Modify: `vercel-webhook/package-lock.json`
- Create: `vercel-webhook/next.config.js`
- Create: `vercel-webhook/postcss.config.js`
- Create: `vercel-webhook/tailwind.config.js`
- Create: `vercel-webhook/app/layout.js`
- Create: `vercel-webhook/app/globals.css`

- [ ] **Step 1: Finalize Next.js/Tailwind dependencies and scripts**
- [ ] **Step 2: Add the base app shell, theme tokens, and global layout**
- [ ] **Step 3: Run the build once the dependencies are installed**

### Task 4: Migrate the webhook route

**Files:**
- Create: `vercel-webhook/app/api/ghl-webhook/route.js`
- Delete: `vercel-webhook/api/ghl-webhook.js`
- Test: `vercel-webhook/tests/api/ghl-webhook.test.js`

- [ ] **Step 1: Write a failing route test for success and case-not-found logging**
- [ ] **Step 2: Implement the App Router webhook using shared libs**
- [ ] **Step 3: Confirm `/api/ghl-webhook` still returns the expected payload shape**

### Task 5: Add dashboard APIs

**Files:**
- Create: `vercel-webhook/app/api/dashboard/stats/route.js`
- Create: `vercel-webhook/app/api/activity/route.js`
- Create: `vercel-webhook/app/api/case/[id]/route.js`
- Test: `vercel-webhook/tests/api/dashboard-routes.test.js`

- [ ] **Step 1: Write failing tests for stats shaping and activity filter parsing**
- [ ] **Step 2: Implement server-only routes using Supabase and IRS Logics helpers**
- [ ] **Step 3: Re-run the route tests and build**

### Task 6: Build the dashboard UI

**Files:**
- Create: `vercel-webhook/components/Sidebar.js`
- Create: `vercel-webhook/components/StatCard.js`
- Create: `vercel-webhook/components/ActivityTable.js`
- Create: `vercel-webhook/components/OfficerCard.js`
- Create: `vercel-webhook/components/RoundRobinIndicator.js`
- Create: `vercel-webhook/components/CaseLookup.js`
- Create: `vercel-webhook/app/page.js`
- Create: `vercel-webhook/app/officers/page.js`
- Create: `vercel-webhook/app/activity/page.js`
- Create: `vercel-webhook/app/lookup/page.js`

- [ ] **Step 1: Create the shared visual system and navigation**
- [ ] **Step 2: Implement the overview page from the stats API**
- [ ] **Step 3: Implement the officers, activity, and lookup pages**
- [ ] **Step 4: Verify desktop and mobile rendering through local run/build output**

### Task 7: Verify and hand off

**Files:**
- Modify: `directives/ghl_appointment_to_irs_case.md`
- Modify: `README.md`

- [ ] **Step 1: Update docs with the new webhook-plus-dashboard flow**
- [ ] **Step 2: Run local verification commands**
- [ ] **Step 3: Identify whether remote Supabase table creation and Vercel deploy can be executed from the current environment or need approval/manual follow-up**
