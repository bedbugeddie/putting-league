# Tech Stack — Deep Dive

A detailed look at every technology in the putting league stack, what role it plays, and why it was chosen over alternatives.

---

## Table of Contents

1. [Backend Runtime — Node.js](#backend-runtime--nodejs)
2. [HTTP Framework — Fastify](#http-framework--fastify)
3. [Language — TypeScript](#language--typescript)
4. [ORM — Prisma](#orm--prisma)
5. [Validation — Zod](#validation--zod)
6. [Frontend Framework — React](#frontend-framework--react)
7. [Build Tool — Vite](#build-tool--vite)
8. [Styling — TailwindCSS](#styling--tailwindcss)
9. [Server State — React Query](#server-state--react-query)
10. [Real-time — WebSockets](#real-time--websockets)
11. [Authentication — Magic Links + JWT](#authentication--magic-links--jwt)
12. [Email — SMTP / Resend](#email--smtp--resend)
13. [Database — PostgreSQL](#database--postgresql)
14. [Containerization — Docker](#containerization--docker)
15. [Reverse Proxy — nginx](#reverse-proxy--nginx)
16. [Infrastructure — TrueNAS SCALE](#infrastructure--truenas-scale)
17. [External Access — Cloudflare Tunnel](#external-access--cloudflare-tunnel)
18. [CI/CD — GitHub Actions + GHCR](#cicd--github-actions--ghcr)

---

## Backend Runtime — Node.js

**Version:** 20 LTS

Node.js runs the Fastify API server. It's the natural choice for a TypeScript-first project because:

- The entire stack is JavaScript/TypeScript, so there's only one language to context-switch between
- The npm ecosystem has first-class Fastify, Prisma, and Zod support
- Node 20 LTS has native `fetch`, `crypto`, and good ES module support, reducing the number of polyfill dependencies
- Lightweight enough to run comfortably inside a Docker container on home-server hardware (TrueNAS SCALE)

**Alternatives considered:** Bun (faster cold start, but less mature ecosystem and Prisma support at the time), Deno (good TypeScript support, but Fastify plugin compatibility was uncertain).

---

## HTTP Framework — Fastify

**Package:** `fastify` + plugins (`@fastify/jwt`, `@fastify/cors`, `@fastify/cookie`, `@fastify/websocket`, `@fastify/rate-limit`, `@fastify/multipart`)

Fastify handles all HTTP routing, request parsing, authentication middleware, and WebSocket upgrades.

### Why Fastify over Express

| Concern | Express | Fastify |
|---------|---------|---------|
| Performance | Good | ~2× faster in benchmarks (pino logging, schema-based serialization) |
| TypeScript | Community types (`@types/express`) | First-class, ships its own types |
| Schema validation | Manual / middleware | Built-in JSON Schema support |
| Plugin system | Middleware chain | Encapsulated plugin lifecycle with `fastify.register()` |
| WebSockets | Separate package, awkward | `@fastify/websocket` integrates cleanly |

The plugin encapsulation model is particularly useful here — each route file (auth, scoring, admin/*) is registered as its own plugin, keeping concerns isolated and making it easy to apply `preHandler` middleware (like `requireAdmin`) to an entire route group.

### Key plugins used

| Plugin | Purpose |
|--------|---------|
| `@fastify/jwt` | Signs and verifies JWTs; reads from Authorization header or cookie |
| `@fastify/cors` | Restricts API access to the frontend origin |
| `@fastify/cookie` | Parses cookies for JWT-in-cookie auth |
| `@fastify/websocket` | Upgrades HTTP connections to WebSocket for live scores |
| `@fastify/rate-limit` | 200 req/min global rate limit to prevent abuse |
| `@fastify/multipart` | Handles avatar file uploads (multipart/form-data) |

---

## Language — TypeScript

Both the backend and frontend are written in TypeScript with strict mode enabled. The shared type surface (in `frontend/src/api/types.ts`) mirrors the Prisma models exactly, which catches shape mismatches at compile time rather than at runtime.

Key benefits in this project:

- **Zod ↔ TypeScript inference**: Zod schemas are the single source of truth for request body shapes; TypeScript infers the types automatically, no duplication
- **Prisma ↔ TypeScript**: Prisma generates fully typed query results; querying a non-existent field is a compile error
- **`tsc --noEmit` in CI**: The typecheck step in CI catches errors before any code is deployed

---

## ORM — Prisma

**Package:** `prisma` (CLI) + `@prisma/client` (runtime)

Prisma handles all database access. The schema is defined in `prisma/schema.prisma` and Prisma generates a fully-typed client from it.

### Why Prisma

- **Schema-as-source-of-truth**: The `schema.prisma` file describes every model, relation, and index. Migrations are generated automatically by `prisma migrate dev` by diffing the schema against the current DB state.
- **Type safety**: Every query result is typed to exactly the fields selected. Selecting a non-existent field or using a wrong filter type is a compile error.
- **Migration history**: The `migrations/` folder contains the full ordered SQL history of every schema change, making it safe to apply incrementally in production via `prisma migrate deploy`.
- **Upsert for singletons**: The `Settings` model (house/EOY per-entry config) uses a singleton pattern with `prisma.settings.upsert({ where: { id: 1 }, create: ..., update: {} })` — Prisma makes this pattern clean and safe.

### Schema design highlights

- **`Settings` singleton**: A table with a single row (enforced by `@id @default(1)`) stores configurable league parameters. This avoids hardcoded constants while staying simple — no key/value table needed.
- **Soft deletes via `isActive`**: Players are never hard-deleted; `isActive: false` hides them from active league views while preserving historical score data.
- **`ScoreAuditLog`**: Every score change is recorded with before/after values and a timestamp, giving admins a full audit trail.
- **`CheckIn` with `hasPaid`**: Separates physical arrival from payment, allowing the check-in page to show a "paid" badge independently.

---

## Validation — Zod

**Package:** `zod`

Every API endpoint that accepts a request body parses it with a Zod schema before touching the database:

```typescript
const body = z.object({
  housePerEntry: z.coerce.number().min(0).optional(),
  eoyPerEntry:   z.coerce.number().min(0).optional(),
}).parse(req.body)
```

### Why Zod

- **Runtime + compile-time**: A single Zod schema gives you both runtime validation (rejects bad input with a 400) and a TypeScript type via `z.infer<typeof schema>` — no duplication
- **`z.coerce`**: Coerces strings to numbers/booleans, handling cases where JSON serialization introduces type drift
- **Composable**: Schemas can be `.pick()`, `.omit()`, `.extend()`, or `.partial()` from a base shape
- **Error messages**: Zod produces structured, human-readable validation errors that Fastify automatically serializes into the 400 response

**Alternative**: Joi is more established but TypeScript support is an afterthought. Yup is similar to Zod but slower and less ergonomic.

---

## Frontend Framework — React

**Version:** React 19

React renders the entire frontend — both the public-facing league pages and the admin panel. Chosen because:

- The component model maps naturally to the UI: a `NightRow` component, a `DivisionCard`, a `PayoutTable` — each isolated and testable
- React Query (see below) pairs exceptionally well with React's render model
- The ecosystem (React Router, react-hot-toast, date-fns, clsx) covers every need without custom tooling

### React Router v6

Used for client-side routing. The nested `<Route>` structure mirrors the UI hierarchy:

```
<Layout>           ← public shell (navbar, hero)
  /league-nights
  /seasons
  /dashboard
<AdminLayout>      ← admin shell (sidebar nav)
  /admin/settings
  /admin/financials
```

`RequireAuth` and `RequireAdmin` wrapper components redirect unauthenticated or unauthorized users before rendering protected pages.

---

## Build Tool — Vite

**Version:** Vite 6

Vite builds and serves the React frontend.

### Why Vite over Create React App

- **Dev server speed**: Vite uses native ES modules in development — no bundle step, so hot module replacement is near-instant even as the project grows
- **Build output**: Production builds use Rollup under the hood, producing well-optimized chunks
- **`VITE_API_URL` build arg**: The Docker build passes `--build-arg VITE_API_URL=/api` so the production frontend always calls the correct backend path without any runtime config

---

## Styling — TailwindCSS

**Version:** Tailwind v3

All styling is utility-first Tailwind. No CSS files, no CSS-in-JS, no component library.

### Why Tailwind

- **No context switching**: Styles live next to the markup — you can see exactly what a component looks like without opening a separate stylesheet
- **Dark mode**: The `dark:` variant prefix makes dark mode trivial. Every color in the app has a `dark:` counterpart, and the `useTheme` store toggles the `dark` class on `<html>`
- **`clsx`**: The `clsx` utility (used alongside Tailwind) conditionally applies classes based on state — e.g., status badge colors depending on `SCHEDULED` / `IN_PROGRESS` / `COMPLETED`
- **Design consistency**: A shared `tailwind.config.ts` defines the `brand` color palette (emerald-based), ensuring consistent greens across all admin and player pages

### Custom utilities (via `@layer`)

- `.card` — rounded panel with shadow, works in light and dark
- `.btn-primary` — green call-to-action button
- `.input` — form input with consistent focus ring
- `.label` — form label

---

## Server State — React Query

**Package:** `@tanstack/react-query` v5

React Query manages all API data fetching, caching, and mutation.

### Why React Query

- **Automatic caching**: Fetched data is cached by `queryKey`. Multiple components can subscribe to `['admin-settings']` and share one HTTP request — the `AdminCheckInPage` and `AdminSettingsPage` do exactly this
- **Background refetching**: The season financials page refetches every 30 seconds (`refetchInterval: 30_000`) with zero extra code
- **Mutations**: `useMutation` with `onSuccess` / `onError` callbacks handles optimistic invalidation — after saving settings, `qc.invalidateQueries` triggers a refetch so the UI immediately reflects the new values
- **Loading states**: `isLoading` / `isPending` flags are used throughout to show spinners or disable buttons while requests are in flight

---

## Real-time — WebSockets

**Package:** `@fastify/websocket`

The WebSocket connection is the backbone of live scoring. When a scorekeeper submits a score, the server broadcasts a `SCORE_UPDATE` message to all connected clients watching that league night. The leaderboard re-renders within milliseconds.

### Architecture

```
Scorekeeper submits score
  → POST /scoring/:nightId
  → Score saved to DB
  → wsManager.broadcast(nightId, { type: 'SCORE_UPDATE', scores })
  → All clients on that room receive the message
  → React re-renders leaderboard
```

The `wsManager` maintains a `Map<roomId, Set<WebSocket>>` for efficient per-night broadcasting without iterating all connections.

### Client reconnect

The `useWebSocket` hook implements exponential backoff reconnection — if the connection drops (e.g., server restart), the client automatically reconnects after 1s, 2s, 4s, up to a cap.

---

## Authentication — Magic Links + JWT

### Magic links

No passwords for players. Sign-in flow:

1. User enters their email on `/login`
2. Server generates a one-time token, stores it in `MagicLinkToken` with a 15-minute expiry, and emails a link: `https://mvpl.golf/auth/verify?token=<token>`
3. User clicks the link → `/auth/verify` exchanges the token for a JWT
4. Token is marked used; future clicks return 401

### JWT

The JWT is stored in both an HTTP-only cookie (for browser navigation) and `localStorage` (for the API client's `Authorization: Bearer` header). The dual storage handles both standard page loads and JavaScript-initiated API calls.

Tokens have a 7-day expiry. The `GET /auth/me` endpoint refreshes the token on each page load if the user is already signed in.

### Admin flag

Admins are identified by `user.isAdmin = true` on the database row — there's no separate role enum. The `requireAdmin` middleware checks this flag. Admin status is included in the JWT payload so the frontend can conditionally show the admin nav link without an extra API call.

---

## Email — SMTP / Resend

The backend sends magic link emails via Nodemailer's SMTP transport. Any SMTP provider works.

**In production this app uses [Resend](https://resend.com):**
- SMTP host: `smtp.resend.com`
- Username: `resend`
- Password: Resend API key
- From address: must use a domain verified in Resend (e.g. `onboarding@mvpl.golf`)

**In development** with no SMTP configured, the magic link is printed directly to the backend console — no email service needed for local development.

---

## Database — PostgreSQL

**Version:** PostgreSQL 16

A single Postgres instance stores all league data.

### Why PostgreSQL over alternatives

| Concern | SQLite | MySQL | PostgreSQL |
|---------|--------|-------|-----------|
| Concurrent writes | Limited | Good | Excellent |
| JSON support | Basic | Basic | First-class (`jsonb`) |
| Prisma support | Good | Good | Best-in-class |
| Self-hosted simplicity | Trivial | Good | Good (Docker) |
| Data integrity | Good | Varies | Strict by default |

PostgreSQL's strict type checking and constraint enforcement (foreign keys, unique constraints, default values) aligns with Prisma's type-safe query model. It also handles concurrent check-ins from multiple admin tabs gracefully.

The database runs in its own `league-postgres` Docker container with a named volume for persistence. The Postgres user is `league` (not `postgres`) — a detail that matters when running `psql` commands or resetting passwords.

---

## Containerization — Docker

The app runs as four Docker containers on a shared `league-net` bridge network:

```
league-postgres   ← data persistence (named volume)
league-backend    ← Fastify API, talks to postgres
league-frontend   ← static Vite build (nginx serves files)
league-nginx      ← reverse proxy, exposes port 5173
```

### Why this topology

- **Separation of concerns**: Each container has one job. The nginx container can be restarted independently of the backend during deploys.
- **Internal networking**: Containers communicate by service name (`postgres`, `backend`) on the bridge network. Nothing is exposed to the host except the nginx port (5173).
- **Prisma in Docker**: The backend runs `prisma migrate deploy` on startup via the CI deploy step, keeping migrations in sync with code automatically.

### Multi-stage builds

The backend `Dockerfile` compiles TypeScript in a `builder` stage and copies only the compiled JS to the final image, keeping the production image small (no devDependencies, no TypeScript compiler).

The frontend `Dockerfile` runs `vite build` in a `builder` stage and copies the `dist/` folder into a bare nginx image that serves static files.

---

## Reverse Proxy — nginx

Two nginx instances are in play:

### 1. `league-nginx` (inside Docker)

Defined in `nginx/nginx.conf`. Routes traffic within the Docker network:

- `GET /api/*` → `league-backend:3001` (strips `/api` prefix)
- Everything else → `league-frontend:80` (serves `index.html` for client-side routing)

This is the only container that exposes a port to the host (5173 → 80).

### 2. nginx-proxy-manager (NPM, on TrueNAS host)

A separate NPM instance (Docker container `ix-nginx-proxy-manager-npm-1`) acts as the host-level reverse proxy. It terminates TLS and forwards HTTP traffic to the league nginx at `172.16.0.1:5173` (the Docker bridge gateway address).

**Key gotcha:** NPM proxy host conf files are generated from the database but must be manually edited if the Docker bridge gateway is used (not `host.docker.internal`, which NPM incorrectly resolves to `localhost`). Direct edits to `/data/nginx/proxy_host/57.conf` survive until the proxy host is updated via the NPM UI.

---

## Infrastructure — TrueNAS SCALE

The entire app runs on a home TrueNAS SCALE NAS at `192.168.30.5`. TrueNAS SCALE is a Linux-based NAS OS (Debian under the hood) with Docker support.

### Why self-hosted

- Zero cloud hosting costs
- Full control over data, backups, and uptime
- Hardware is already running 24/7 for NAS workloads

### App directory

```
/mnt/bag-of-holding/configs/putting-league/
```

The `bag-of-holding` pool is a ZFS pool on the NAS. ZFS gives automatic checksumming and snapshot support for free.

---

## External Access — Cloudflare Tunnel

The home ISP blocks inbound connections on ports 80 and 443, making a standard port-forward setup impossible. Cloudflare Tunnel solves this without opening any inbound ports:

```
mvpl.golf (DNS: CNAME → tunnel)
  → Cloudflare edge
  → Tunnel daemon on TrueNAS (outbound only)
  → NPM on port 80
  → league-nginx on port 5173
```

### Setup

- Tunnel named `nasquatch` (ID: `31b615ca-50f6-49f2-aaef-1c7cf57b16f1`)
- Published routes in Cloudflare Zero Trust → Networks → Tunnels → Public hostnames
- Cloudflare manages DNS automatically (wildcard CNAME + apex CNAME)
- **TLS is terminated at Cloudflare**, so NPM receives plain HTTP — `ssl_forced` must be off in NPM to avoid redirect loops

---

## CI/CD — GitHub Actions + GHCR

### Pipeline

```
push to main
  ↓
[typecheck] tsc --noEmit (backend + frontend)
  ↓
[build] docker build backend + frontend
  ↓
[push] ghcr.io/bedbugeddie/putting-league-backend:latest + :<sha>
       ghcr.io/bedbugeddie/putting-league-frontend:latest + :<sha>
  ↓
[deploy] SSH → TrueNAS
  → write .env from secrets
  → docker compose pull
  → pg_hba.conf trust bypass (handles password rotation)
  → docker compose up -d backend
  → prisma migrate deploy
  → restore pg_hba.conf
  → health check backend
  → docker compose up -d frontend nginx
```

### Why GHCR

GitHub Container Registry is free for public repositories and requires no separate registry account. Images are tagged with both `latest` and the commit SHA, so rollbacks are as simple as `docker compose pull` with a specific tag.

### pg_hba.conf trust bypass

The CI deploy writes a fresh `.env` on every run. If the `POSTGRES_PASSWORD` secret ever changes, the running Postgres container still has the old password baked into its data directory. The deploy temporarily prepends `local all all trust` to `pg_hba.conf` and reloads Postgres — this allows `prisma migrate deploy` to run without needing the old password. The trust line is removed immediately after.
