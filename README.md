# AON FIBER Telecommunications

A complete, working website and management system for AON FIBER, a fictional Philippine
fiber internet provider. **Speed Without Limits.**

The system has four surfaces sharing one Supabase backend:

| Surface | URL | Who uses it |
| --- | --- | --- |
| Public website | `/` | Visitors, prospective customers |
| Customer Portal | `/portal` | Existing customers (account number + one-time code) |
| Employee Portal | `/staff` | Customer service reps, branch managers |
| Admin Portal | `/admin` | Company administrator |

---

## 1. What is implemented

### Public website
- Home page with logo, tagline, featured plans and a prominent **Inquire at Your Nearest Branch** button.
- Internet Plans page (live data from Supabase, managed in the Admin Portal).
- Coverage Checker with the three required outcomes — *service available*, *service not yet available*, *contact your nearest branch* — driven **only** by admin-configured coverage records. Unserved areas can submit a future-installation request.
- About Us, Branches (contact details + map link), and Contact Us with a public inquiry form.
- Public inquiries are saved to Supabase and routed to the selected branch's employees.

### Customer Portal
- Login with **account number + one-time 6-digit code**; no permanent password.
- Generic responses so account numbers cannot be enumerated; rate limiting per IP and per account; 5-attempt cap per code; 10-minute expiry; codes stored as HMAC hashes.
- Dashboard: name, account number, plan, subscription status, monthly billing, due date, payment history, outstanding balance, installation status, support tickets, registered contact details, notifications.
- Submit technical, billing and installation concerns; mark notifications read.
- Customers cannot edit plans, billing, subscription status or protected account data (enforced by RLS).

### Employee Portal
- Branch-scoped dashboard with live workload counts and online/offline presence.
- Customer search by account number / name / mobile, customer account creation with an auto-generated `AON-######` account number and printable receipt (print or Save as PDF).
- Public inquiry queue: assign to self, assign to a colleague (managers/admins), update status.
- Installation requests: schedule and progress with automatic customer notifications.
- Support tickets: assign, prioritise, resolve with customer-visible notes.
- Account correction requests for protected data (employees cannot edit customer records directly).
- Presence heartbeat every 45 seconds; employees go offline on logout, session expiry or ~2 minutes of inactivity.

### Branch Manager
- Everything employees can do, plus branch monitoring (`/staff/monitoring`), branch performance (`/staff/branch`), inquiry assignment to employees, and approve/reject correction requests for their own branch only.
- Can create employee accounts only when an administrator grants the permission (`can_create_employees`), and only for their own branch.

### Admin Portal
- Summary cards: customers, active subscriptions, employees, branches, pending installations, unresolved tickets, outstanding balances, new inquiries.
- Employee management: create, assign role/branch, activate/suspend, reset authentication, view activity history. Suspension bans the Supabase Auth user immediately.
- Real-time monitoring of all branches (search + branch filters, auto-refresh + Realtime).
- Branch performance reports with date and branch filters, charts and tables (inquiry resolution rate, customers, subscriptions, installations, tickets, online staff).
- Customers: search, view, edit, correct, assign plans, change subscription status, send portal notifications.
- Internet plans: create, edit, archive/delete.
- Branches: create, edit, deactivate.
- Coverage records: create, edit, delete.
- Billing: issue statements, record payments, run due-date reminders.
- Audit log of administrative and operational changes.
- Account change request approval workflow.

### Notifications
In-app notifications are created automatically by database triggers when:
- an installation request is received, its status changes, or its schedule changes,
- a support ticket status changes,
- a new billing statement is issued,
- a payment is recorded,
- a due-date reminder is run (admin button; can be scheduled with pg_cron),
- an account correction is approved.

External email/SMS delivery is **optional**. When `NOTIFY_WEBHOOK_URL` is not set, the UI states
clearly that external notifications are not enabled and everything stays in-app.

---

## 2. Technology

- **React 18 + TypeScript + Vite** (SPA, responsive blue/white/cyan design system)
- **Express API** (`server/`) for privileged operations: customer OTP, account creation, employee
  provisioning, billing, plans/branches/coverage, reviews. The service-role key never reaches the browser.
- **Supabase**: PostgreSQL, Auth, Row Level Security and Realtime.
- **Vitest + Testing Library** for automated tests.

```
src/
  components/     shared UI, layouts, guards
  context/        staff + customer session providers
  lib/            types, Supabase client, API client, coverage logic, formatters, hooks
  pages/
    public/       Home, Plans, Coverage, About, Branches, Contact
    auth/         StaffLogin, CustomerLogin
    portal/       customer Dashboard, Billing, Support, Notifications
    ops/          employee, manager and admin screens
server/
  routes/         public, customerAuth, staff, admin
  lib/            auth middleware, OTP, rate limit, Supabase admin, notifications
supabase/
  migrations/     0001 schema, 0002 RLS, 0003 triggers, 0004 realtime
  seed.sql        fictional branches, plans, coverage
scripts/
  create-admin.mjs  secure initial administrator
  seed-demo.mjs     optional demo staff/customers/tickets
tests/            unit + end-to-end component tests
```

---

## 3. Local setup

### Requirements
- Node.js 18+ (development was verified on Node 24)
- A Supabase project (free tier is fine)

### Step 1 — Install dependencies
```bash
npm install
```

### Step 2 — Create the database
Optional but recommended: run **`supabase/inspect.sql`** first. It is read-only and lists what the
project already contains — tables, columns, keys, indexes, constraints, RLS status, policies,
functions, triggers and which tables are published to Realtime — so you are not guessing whether
the database is empty.

In the Supabase dashboard open **SQL Editor** and run these files **in order**:

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_triggers.sql`
4. `supabase/migrations/0004_realtime.sql`
5. `supabase/migrations/0005_audit_actor_scope.sql`
6. `supabase/migrations/0006_customer_installation_default.sql`
7. `supabase/seed.sql` — fictional branches, plans and coverage records (optional but recommended)

> The migrations create the tables, sequences, indexes, Row Level Security policies,
> audit/notification triggers and the Realtime publication. Do not skip 0002 — without RLS the
> portals would leak data. Do not skip 0005 — without it, audit entries written by a signed-in
> customer fail with `audit_logs_actor_id_fkey`.
>
> **Every file is safe to re-run**, including on a project that already has objects. Tables,
> indexes and sequences use `if not exists`, triggers and policies are dropped before they are
> created, and `0001` adds any column missing from an existing table (`add column if not exists`).
> No migration drops a table, a column or a row. Re-running `0002` does reset the RLS policies it
> defines to the definitions in the file, so dashboard-only edits to those policies are overwritten.
> To check this on your machine: `npm i --no-save @electric-sql/pglite` once, then
> `node scripts/verify-migrations-rerun.mjs` — it executes every migration twice against an
> in-process PostgreSQL, both on an empty database and on a partially created one, and prints the
> resulting table/policy/trigger counts.
>
> Verify audit logging with `node scripts/verify-audit-logging.mjs` (creates a throwaway auth
> user, calls the audit helper and removes everything it created). With `npm run dev` running,
> `node scripts/verify-employee-flow.mjs` checks employee creation, password handling, branch
> scope and audit rows against the live database using throwaway accounts, and
> `node scripts/verify-branch-scope.mjs` proves staff cannot reach another branch through the API
> or through Row Level Security.

### Step 3 — Environment variables
```bash
cp .env.example .env
```
Fill in **Project Settings → API**:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable / anon key>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<publishable / anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key — server only>
OTP_PEPPER=<long random string>
```

- The `VITE_` values are bundled into the browser and are safe with RLS. The **service role key is
  only read by the Express API** and must never be prefixed with `VITE_` or committed.
- Keep `OTP_DEV_MODE=true` locally. Set it to `false` (and `NODE_ENV=production`) in production.

### Step 4 — Create the first administrator
Administrator credentials are never stored in the repository or seed files.

```bash
npm run create-admin -- --email admin@yourcompany.example --name "AON Administrator"
```
The script prints a generated password **once**. Sign in at `/staff/login`.

### Step 5 — Optional demo data
```bash
npm run seed-demo
```
Creates fictional staff and customers and prints their credentials:

| Role | Email | Password |
| --- | --- | --- |
| Branch manager – QC | `manager.qc@aonfiber.example` | `AonFiber!Demo2026` (or `DEMO_PASSWORD`) |
| Employee – QC | `csr.qc@aonfiber.example` | same |
| Employee – Cebu | `csr.cebu@aonfiber.example` | same |

Demo customer accounts are printed too (`AON-…`); use them with the customer login.

### Step 6 — Run it
```bash
npm run dev
```
- Website + portals: http://localhost:5173
- API: http://localhost:8787 (health check: http://localhost:8787/api/health)

Other commands:

| Command | Purpose |
| --- | --- |
| `npm run build` | Type-check and build to `dist/` |
| `npm start` | Serve the API (and `dist/` when built) |
| `npm run typecheck` | Type-check frontend and server |
| `npm test` | Run the automated test suite |
| `npm run create-admin` | Create/promote an administrator |
| `npm run seed-demo` | Load optional demo data |

---

## 4. How authentication works

### Staff (employees, managers, administrators)
Supabase Auth email + password. Accounts are created only by an administrator (or a branch manager
granted that permission), never by self-registration. The API loads the `profiles` row and enforces
role, branch and status on every privileged request. Suspended users are banned in Supabase Auth and
rejected by the API.

### Portal sessions
Each portal has its **own Supabase client and its own storage key**, so signing in or out in one
portal never touches another:

| Portal | Client | Storage key |
| --- | --- | --- |
| Customer | `src/lib/supabase.ts` → `customerSupabase` | `aon-fiber-customer-auth` |
| Employee / manager | `src/lib/supabase.ts` → `staffSupabase` | `aon-fiber-staff-auth` |
| Administrator | `src/lib/supabase.ts` → `adminSupabase` | `aon-fiber-admin-auth` |

Because a page picks its client when it loads, links *between* portals (public site → portals,
customer → employee sign-in) are plain `<a href>` page loads rather than client-side routing. Keep
that rule when adding cross-portal links, otherwise a sign-in would be written to the previous
portal's session.

The protected API (`/api/*`) accepts any of the three and still enforces role, branch and status per
request, so an employee token cannot be used against administrator endpoints. Administrator pages
live under `/admin/*` and additionally reject non-admin tokens with a 403 in `requireRole`, so
editing a URL is not enough.

### Customers
1. Branch staff create the customer record and the linked Supabase Auth identity.
2. The customer enters their **account number** on `/portal/login`.
3. If the account exists, a 6-digit code is generated, hashed (HMAC + `OTP_PEPPER`) and stored for 10 minutes. Responses are identical for unknown accounts.
4. The code is delivered through the configured external provider; without one, development mode shows it on screen and logs it to the API console.
5. On success the customer receives a short-lived Supabase session via a server-generated magic-link token. RLS then limits them to their own rows.

The account number alone never grants access to private data.

### Initial administrator
Created with `scripts/create-admin.mjs` using the service-role key from `.env` (server-side only).

---

## 5. Security notes

- **RLS is enabled on every table.** Customers read only their own customers/billing/installation/ticket/notification rows; staff are limited to their branch with `can_access_branch()`; only admins manage company-wide data.
- Protected customer fields (account number, plan, billing, subscription status) cannot be changed by employees — they submit an `account_change_requests` record that a manager/admin approves, and a trigger applies it.
- Customer notifications can only have `is_read` toggled by the customer (trigger guard).
- OTP codes are hashed, expire in 10 minutes, allow 5 attempts, and requests are rate-limited per IP and account (`server/lib/rateLimit.ts`; in-memory, suitable for a single API instance — use Redis/Upstash if you run multiple instances).
- Public inquiry submission is rate-limited per IP.
- The service-role key is only used inside `server/`. Never expose it to the browser.
- Audit entries never include passwords, verification codes or tokens.
- For production: `NODE_ENV=production`, `OTP_DEV_MODE=false`, HTTPS, a rotated `OTP_PEPPER`, and Supabase Auth rate limits reviewed.

---

## 6. Optional external notifications

Point `NOTIFY_WEBHOOK_URL` at any service that accepts JSON:

```json
{ "channel": "email", "to": "customer@example.com", "subject": "AON FIBER verification code", "body": "..." }
```

Add `NOTIFY_WEBHOOK_TOKEN` to send an `Authorization: Bearer` header. When unset, the portal shows
"In-app notifications only" and no external message is attempted. Internal notifications are always
recorded in the database.

---

## 7. Printing the account receipt

After creating a customer account, open **Print account receipt** (`/staff/customers/:id/receipt`).
It includes the logo, name, account number, registered contact details, plan, branch, creation date
and installation reference — and no authentication secrets. Use the browser's print dialog to print
or **Save as PDF**.

---

## 8. Branch coverage checker

`src/lib/coverage.ts` is a pure function with unit tests. Matching is intentionally strict:
equal or contained city/barangay/area strings, normalized for case, punctuation and "City of"
prefixes. If nothing matches, the result is always *"Please contact your nearest branch"* — the
system never invents availability.

---

## 9. Realtime presence

- The employee portal sends a heartbeat every 45 seconds (and on tab focus) to
  `POST /api/staff/presence/heartbeat`, which upserts `employee_presence` on `profile_id` — one row
  per employee, no read-then-write race, and a row is created if the trigger never made one.
- The monitoring dashboard subscribes to `employee_presence` changes and also refreshes every 30
  seconds. Someone is online only when the row says online **and** the last heartbeat is within
  `PRESENCE_TIMEOUT_MS` (default 120000 ms), so a closed browser or expired session drops to offline
  without relying on `beforeunload`.
- Logout calls `POST /api/staff/presence/offline`, scoped to `profile_id = auth.uid()`, and an expired
  or revoked session does the same automatically.
- A rejected heartbeat is **not** swallowed: the API returns the mapped database error and the
  employee portal shows "Presence not syncing" with the reason in the top bar. The monitoring page
  shows how many presence rows exist and the server time, so "nobody ever sent a heartbeat" is
  distinguishable from "heartbeats are stale".

To use Supabase Realtime, the tables are already added to the `supabase_realtime` publication by
migration `0004_realtime.sql`. If realtime does not connect, confirm Realtime is enabled for the
project in the Supabase dashboard.

---

## 10. Deployment

1. Build: `npm run build` (outputs `dist/`).
2. Host the Express API with the server environment variables; it serves `dist/` automatically when present, or serve `dist/` from any static host and proxy `/api` to the API.
3. Set `APP_ORIGIN` to your public URL (CORS).
4. Set `NODE_ENV=production` and `OTP_DEV_MODE=false`.
5. Keep the service-role key on the server only.
6. Configure the external notification webhook if email/SMS is required.
7. Expect one re-login per browser after deploying the per-portal session change: existing sessions
   were stored under the old shared key and are intentionally not migrated.

---

## 11. Known limitations

- **No external email/SMS provider is bundled.** Without `NOTIFY_WEBHOOK_URL`, external delivery is
  disabled and the UI says so. Local `OTP_DEV_MODE` shows the verification code on screen.
- **Rate limiting is in-memory** (single API instance). For horizontal scaling, move the buckets to
  Redis or a database table.
- The logo file at `public/aonfiber-logo.svg` is a clean placeholder matching the branding — replace
  it with the official AON FIBER logo file (same path) to rebrand the whole system.
- Sample data is fictional and for development only; do not import real customer or billing data
  into a public demo.

---

## 12. Verification performed

- `npm run typecheck` — frontend and server compile with strict TypeScript.
- `npm run build` — production bundle builds.
- `npm test` — the full suite covers coverage rules, formatting, permissions, OTP hashing, public
  routing, coverage results, inquiry validation/submission, staff sign-in errors, the customer
  account-number + OTP sign-in flow, the isolated portal sessions (separate storage keys, independent
  sign-out, admin-only boundaries for both URL and API), portal entry links staying full page
  loads, and the API/database error messages the portals display.

### Diagnosing a failed write

Every API failure now names its cause instead of "Something went wrong":

| Symptom in the portal | Meaning |
| --- | --- |
| "The AON FIBER API did not respond correctly (status 500)" | The API process is not running (Vite proxy error). Run `npm run dev`. |
| "The database is missing part of the AON FIBER schema…" | A table/column/function from `supabase/migrations` is missing. Re-run the files in order. |
| "The API is not allowed to write this table … SERVICE_ROLE_KEY" | `SUPABASE_SERVICE_ROLE_KEY` belongs to another project or is the anon key. |
| "That mobile number already belongs to … (AON-…)" | Duplicate guard: open the existing account instead of creating a second one. |

Unhandled server errors return a short `reference` that matches the `[api] unhandled error (ref …)`
line in the API console.
- `node scripts/verify-portal-sessions.mjs` — asserts the three clients, keys and guards are wired as
  described above.
- `node scripts/verify-migrations-rerun.mjs` — runs all six migrations and the seed twice on a real
  in-process PostgreSQL (PGlite), on an empty database and on a partially applied one that already
  contains `branches` and its policy. `tests/migrations-idempotent.test.ts` enforces the same rules
  in the normal test suite.
- End-to-end database flows require your own Supabase project keys and the migrations above; they
  cannot be executed on a machine without those credentials.
