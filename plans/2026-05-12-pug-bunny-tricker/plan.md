---
title: "Pug Bunny Tricker MVP Plan"
description: "Greenfield MVP plan for a GitHub-only web3 bug bounty repository tracker and admin dashboard."
status: pending
priority: P2
effort: 4.5d
branch: n/a
tags: [planning, github, web3, bug-bounty, dashboard, docker]
created: 2026-05-12
---

# Pug Bunny Tricker

## Goal

Build a small internal website that discovers GitHub repositories relevant to web3 bug bounty work, qualifies them using explicit heuristics, and lets management track report submission status from one dashboard.

## MVP Boundaries

### In scope

- Discover repositories from GitHub only
- Keep only repositories that match both:
  - at least one approved web3 topic
  - at least one security signal such as `SECURITY.md`, `bug bounty`, `responsible disclosure`, `security@`, `immunefi`, or `hackerone`
- Show a protected dashboard with:
  - repo name
  - repo URL
  - derived type
  - report submission status
- Allow management to update submission status and add notes
- Run locally or on a server with Docker Compose

### Out of scope

- Multi-user auth, RBAC, OAuth
- Crawling outside GitHub
- Automatic report submission
- Full-text search over all repo contents
- Complex queues, Redis, or event streaming

## Recommended Stack

- Frontend + backend: `Next.js` with TypeScript
- Database: `PostgreSQL`
- ORM: `Prisma` or `Drizzle` with migrations
- Ingestion worker: same TypeScript codebase, separate process mode
- Deployment: `docker compose`

Why this shape:

- One codebase keeps the MVP maintainable
- Postgres is more durable than SQLite once ingestion and status management run concurrently
- Separate `web` and `worker` services keep request latency and background sync isolated without adding queue infrastructure yet

## Architecture

1. `web` service
   - Serves login page and dashboard
   - Exposes admin actions:
     - sign in with management key
     - trigger manual sync
     - update repo status
     - edit notes

2. `worker` service
   - Runs on a fixed interval
   - Queries GitHub search endpoints using curated topic filters
   - Fetches repo metadata and candidate evidence files
   - Applies qualification rules
   - Upserts valid repositories into Postgres
   - Records sync run results and errors

3. `db` service
   - Stores repos, evidence, sync runs, and admin-side workflow fields

## Discovery And Qualification Flow

1. Search GitHub repositories using topic-driven queries such as:
   - `topic:solidity`
   - `topic:web3`
   - `topic:defi`
   - `topic:smart-contracts`
   - `topic:blockchain`

2. For each candidate repo, fetch:
   - name, owner, URL, description, default branch, primary language, archived/fork flags, topics

3. Check qualification:
   - web3 topic present from allowlist
   - security signal present in one of:
     - `.github/SECURITY.md`
     - `SECURITY.md`
     - `README*`
     - repo homepage/description when it contains disclosure contact text

4. Extract evidence snippet and source URL for why the repo was kept

5. Derive repo type using simple heuristics:
   - `smart_contract`
   - `protocol_backend`
   - `frontend_app`
   - `sdk_tooling`
   - `infrastructure`
   - `mixed`
   - `unknown`

6. Upsert valid repos and mark `last_seen_at`

7. Soft-hide repos no longer found after N consecutive runs instead of hard-deleting them

## Data Model

### `repositories`

- `id`
- `github_repo_id`
- `owner`
- `name`
- `full_name`
- `html_url`
- `description`
- `homepage_url`
- `default_branch`
- `primary_language`
- `topics` JSON/text array
- `repo_type`
- `security_signal_type`
- `security_signal_url`
- `security_signal_excerpt`
- `report_status`
- `report_notes`
- `last_scanned_at`
- `last_seen_at`
- `is_active`
- `created_at`
- `updated_at`

### `sync_runs`

- `id`
- `started_at`
- `finished_at`
- `status`
- `query_count`
- `candidate_count`
- `qualified_count`
- `error_count`
- `notes`

### `sync_errors`

- `id`
- `sync_run_id`
- `repo_full_name`
- `stage`
- `message`
- `created_at`

## Report Status Model

Use a small enum:

- `new`
- `reviewing`
- `drafted`
- `submitted`
- `not_applicable`

Do not add assignees, comments, or workflow history until there is a real need.

## Auth Model

- Single shared management key from env
- Login form posts the key to the server
- Server compares with constant-time check
- On success, issue signed HTTP-only session cookie
- Middleware protects `/dashboard` and admin APIs

Reasoning:

- This matches the requirement exactly
- It is materially safer than putting the raw key in client-side code or query params
- It avoids a user table and password reset flow the MVP does not need

## Dashboard Scope

### Required table columns

- Repo name
- Repo URL
- Repo type
- Report submission status

### Recommended MVP additions

- Security signal link
- Last scanned time
- Notes
- Filters by type and status
- Summary cards:
  - total repos
  - new
  - drafted
  - submitted

Visualization should stay simple: counts and filters, not charts unless they are nearly free.

## Docker Compose Topology

### Services

- `web`
  - Next.js production server
  - depends on `db`
- `worker`
  - same image as `web`
  - command runs ingestion loop
  - depends on `db`
- `db`
  - Postgres with named volume

### Volumes

- `postgres_data`

### Health

- Postgres healthcheck
- `web` waits for DB readiness
- `worker` retries DB and GitHub connection failures

## Environment Variables

- `DATABASE_URL`
- `MANAGEMENT_KEY`
- `SESSION_SECRET`
- `GITHUB_TOKEN`
- `GITHUB_TOPICS`
- `GITHUB_SEARCH_QUERIES`
- `INGEST_INTERVAL_MINUTES`
- `MAX_REPOS_PER_RUN`
- `SYNC_HIDE_AFTER_MISSES`
- `APP_BASE_URL`
- `LOG_LEVEL`

Notes:

- `GITHUB_TOKEN` is required to avoid unusable rate limits
- `GITHUB_TOPICS` should be an allowlist, not free text entered in the UI

## Implementation Phases

### Phase 1: Project Bootstrap And Compose

- Scaffold Next.js TypeScript app
- Add Postgres container and local compose file
- Add ORM schema and first migration
- Add shared config and env validation

Exit criteria:

- `docker compose up` starts `web`, `worker`, and `db`
- healthcheck passes

### Phase 2: Admin Auth And Core Schema

- Implement management-key login flow
- Protect dashboard routes and admin APIs
- Create `repositories`, `sync_runs`, and `sync_errors` tables
- Add repo status update action and notes field

Exit criteria:

- unauthenticated dashboard access is blocked
- authenticated user can update repo status

### Phase 3: GitHub Ingestion Pipeline

- Implement topic query builder
- Implement repo fetcher and evidence fetcher
- Implement qualification heuristics
- Implement type classifier
- Upsert valid repos into DB
- Record sync results and failures

Exit criteria:

- manual sync imports a stable set of valid repos
- false positives are understandable from stored evidence

### Phase 4: Dashboard And Visualization

- Build repo table with filters and sorting
- Show required columns plus evidence link and notes
- Add summary cards by status/type
- Add manual sync button and latest run status

Exit criteria:

- management can review repos and update statuses from one screen

### Phase 5: Hardening, Tests, And Ops Notes

- Add unit and integration tests
- Add seed/dev fixtures
- Add basic rate-limit and retry handling
- Document local runbook and env vars

Exit criteria:

- happy-path tests pass
- compose-based startup steps are documented

## Testing Scope

### Unit tests

- topic qualification
- security signal extraction
- repo type classification
- report status transition guards

### Integration tests

- login flow
- protected route access
- repo upsert against test DB
- manual sync endpoint

### Smoke tests

- `docker compose up`
- successful worker sync with GitHub token
- dashboard renders stored repos

## Key Risks

- GitHub search quality may be noisy if topic allowlists are too broad
- GitHub API limits will be painful without a token and cached scan intervals
- Security contact extraction from README text will need conservative matching to avoid junk
- Repo type classification will be heuristic, not authoritative

## Recommended Defaults

- Start with manual sync plus scheduled sync every 6-12 hours
- Keep qualification rules explicit and config-backed
- Store evidence for every accepted repo so humans can verify why it was included
- Prefer soft-hide over delete when repos disappear or stop qualifying

## Open Questions

- Should the tracker search the whole of GitHub, or only an allowlist of organizations once the first data set is gathered?
- Is `report_status` enough, or do you also need a submission date and report URL in MVP?
- Do you want archived repos excluded by default, or still tracked if they have an active bounty program reference?
