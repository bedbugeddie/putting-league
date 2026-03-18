# Mini Putt Putting League

A full-stack web application for managing a disc golf putting league. Supports arbitrary divisions, holes, rounds, and seasons with real-time scoring, a payout calculator, a player forum, and a full admin panel.

Live at **[mvpl.golf](https://mvpl.golf)**

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Local Development Setup](#local-development-setup)
5. [Environment Variables](#environment-variables)
6. [Database](#database)
7. [Docker / Production Setup](#docker--production-setup)
8. [TrueNAS SCALE Deployment](#truenas-scale-deployment)
9. [CI/CD Pipeline](#cicd-pipeline)
10. [Scoring Rules](#scoring-rules)
11. [Financial System](#financial-system)
12. [User Roles](#user-roles)

---

## Features

### Player-facing
- **Magic link auth** — passwordless, email-based sign-in
- **Live leaderboards** — WebSocket-powered real-time score updates
- **Player dashboard** — personal score history and stats across seasons
- **Profile page** — update display name, avatar, PDGA number, and division
- **Season standings** — historical leaderboards per season
- **Stats page** — league-wide analytics and personal records, filterable by division
- **Division selection** — self-service enrollment on first sign-in
- **Forum** — per-league-night discussion threads with notification preferences and email digest
- **Moment of the Week (MOTW)** — image + caption posts with paste-to-upload support
- **League Info page** — static info page for new and prospective players
- **Pull-to-refresh** — mobile-friendly data refresh on key pages
- **PWA / installable** — service worker via vite-plugin-pwa; installable on mobile and desktop
- **Dark mode** — system-aware with manual toggle

### Scoring
- **Real-time scoring interface** — scorekeepers enter scores hole-by-hole
- **Toggle score off by re-tapping** — tap an active score button to deselect it
- **Card-based groups** — players organized into scorekeeping cards with rotation
- **Scorecard back link** — return to the parent league night page from any scorecard
- **Score audit log** — every change tracked with before/after values
- **Tie-breaking** — split winnings evenly or run a putt-off round

### Admin panel
- **League nights** — create, configure, and manage nights (holes, rounds, tie-breaker mode)
- **Check-in system** — mark players as arrived and paid per night; sorted by first name
- **Payout calculator** — live breakdown of gross → house cut → EOY pool → payout pool, with per-place payouts and tie resolution
- **Season financials** — per-night and season-total financial summary
- **Configurable fee split** — adjustable house and end-of-year amounts via Settings page
- **Divisions** — full CRUD with per-division entry fees and sort order
- **Seasons** — manage active season; one active season at a time
- **Player management** — view, edit, activate/deactivate; assign divisions and admin rights
- **MOTW management** — create, edit, and publish Moment of the Week posts with image paste
- **Publish Cards toggle** — visually toggleable button for publishing scorekeeping cards
- **Docker-ready** — fully containerized, TrueNAS SCALE optimized
- **GitHub Actions CI/CD** — typecheck → build → push → deploy on every push to `main`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js · Fastify · TypeScript · Prisma ORM · Zod |
| Frontend | React · Vite · TypeScript · TailwindCSS · React Query |
| Database | PostgreSQL 16 |
| Real-time | WebSockets (`@fastify/websocket`) |
| Auth | Magic link via email (JWT in HTTP cookie + localStorage) |
| Email | SMTP-compatible — tested with [Resend](https://resend.com) |
| PWA | `vite-plugin-pwa` (service worker, installable) |
| Infra | Docker · nginx · docker-compose |
| CI/CD | GitHub Actions · GitHub Container Registry (GHCR) |

See [TECH_STACK.md](./TECH_STACK.md) for a deeper look at each technology and why it was chosen.

---

## Project Structure

```
putting-league/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Database schema (all models)
│   │   ├── seed.ts                # Default data seed (admin user, divisions)
│   │   └── migrations/            # Prisma migration history
│   └── src/
│       ├── config/env.ts          # Zod-validated environment variables
│       ├── lib/
│       │   ├── prisma.ts          # Prisma client singleton
│       │   └── email.ts           # Magic link email sender (SMTP)
│       ├── middleware/auth.ts     # requireAuth / requireAdmin guards
│       ├── services/
│       │   ├── scoring.ts         # Score aggregation & totals
│       │   └── stats.ts           # Historical analytics
│       └── routes/
│           ├── auth.ts            # Magic link, JWT refresh, /players/me
│           ├── leaderboard.ts     # Public leaderboard data
│           ├── scoring.ts         # Score entry / editing
│           ├── checkins.ts        # Check-in + payment tracking
│           ├── cards.ts           # Card creation, player assignment, rotation
│           ├── stats.ts           # Aggregated stats endpoints
│           ├── forum.ts           # Forum threads and posts
│           ├── motw.ts            # Moment of the Week (public)
│           ├── notifications.ts   # Forum notification preferences
│           ├── ws.ts              # WebSocket endpoint (live score push)
│           └── admin/
│               ├── divisions.ts   # Division CRUD
│               ├── leagueNights.ts# League night CRUD + status transitions
│               ├── motw.ts        # MOTW admin management
│               ├── payouts.ts     # Payout calculator + season financials
│               ├── players.ts     # Player management
│               ├── seasons.ts     # Season CRUD
│               └── settings.ts   # Configurable house/EOY fee split
├── frontend/
│   └── src/
│       ├── api/
│       │   ├── client.ts          # Fetch wrapper with Bearer auth
│       │   └── types.ts           # TypeScript types mirroring Prisma models
│       ├── components/
│       │   ├── Layout.tsx         # Public page shell
│       │   ├── AdminLayout.tsx    # Admin panel shell with nav
│       │   └── ui/                # Reusable atoms (Spinner, etc.)
│       ├── store/
│       │   ├── auth.ts            # Auth state (localStorage-backed)
│       │   └── theme.ts           # Dark mode state
│       ├── pages/
│       │   ├── LandingPage.tsx
│       │   ├── LeagueInfoPage.tsx
│       │   ├── LoginPage.tsx
│       │   ├── VerifyPage.tsx
│       │   ├── ChooseDivisionPage.tsx
│       │   ├── LeagueNightsPage.tsx
│       │   ├── LeagueNightPage.tsx
│       │   ├── LeaderboardPage.tsx
│       │   ├── ScoringPage.tsx
│       │   ├── PlayerDashboardPage.tsx
│       │   ├── ProfilePage.tsx
│       │   ├── SeasonsPage.tsx
│       │   ├── SeasonPage.tsx
│       │   ├── StatsPage.tsx
│       │   ├── ForumPage.tsx
│       │   ├── ForumPostPage.tsx
│       │   └── admin/
│       │       ├── AdminDashboard.tsx
│       │       ├── AdminDivisionsPage.tsx
│       │       ├── AdminSeasonsPage.tsx
│       │       ├── AdminLeagueNightsPage.tsx
│       │       ├── AdminLeagueNightDetailPage.tsx
│       │       ├── AdminCheckInPage.tsx
│       │       ├── AdminPayoutPage.tsx
│       │       ├── AdminSeasonFinancialsPage.tsx
│       │       ├── AdminPlayersPage.tsx
│       │       ├── AdminPlayerDetailPage.tsx
│       │       ├── AdminMotwPage.tsx
│       │       └── AdminSettingsPage.tsx
│       └── App.tsx
├── nginx/nginx.conf               # Reverse proxy — routes /api → backend
├── docker-compose.yml
├── .env.example
├── TECH_STACK.md                  # Deep dive on technology choices
└── .github/workflows/ci-cd.yml
```

---

## Local Development Setup

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Git

### 1. Clone and install

```bash
git clone https://github.com/bedbugeddie/putting-league.git
cd putting-league

cd backend && npm install
cd ../frontend && npm install
```

### 2. Start PostgreSQL

```bash
# From project root
docker compose up postgres -d
```

### 3. Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — at minimum set DATABASE_URL and JWT_SECRET
```

### 4. Run migrations, generate client, and seed

```bash
cd backend
npx prisma migrate dev
npx prisma generate
npm run db:seed
```

### 5. Start the servers

```bash
# Terminal 1 – Backend (http://localhost:3001)
cd backend && npm run dev

# Terminal 2 – Frontend (http://localhost:5173)
cd frontend && npm run dev
```

Open **http://localhost:5173**.

The seed creates an admin user — request a magic link on the login page. In development (no SMTP configured), the link is printed directly to the backend console.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | — | JWT signing secret (≥ 32 chars) |
| `NODE_ENV` | | `development` | `development` / `production` |
| `PORT` | | `3001` | HTTP listen port |
| `HOST` | | `0.0.0.0` | Bind address |
| `JWT_EXPIRY` | | `7d` | Token lifetime |
| `MAGIC_LINK_EXPIRY_MINUTES` | | `15` | Magic link lifetime |
| `SMTP_HOST` | | — | SMTP host (e.g. `smtp.resend.com`) |
| `SMTP_PORT` | | `587` | SMTP port |
| `SMTP_USER` | | — | SMTP username (Resend: `resend`) |
| `SMTP_PASS` | | — | SMTP password / API key |
| `SMTP_FROM` | | `noreply@league.local` | Sender address — must be a verified domain |
| `APP_URL` | | `http://localhost:5173` | Public URL (used in magic link and forum digest emails) |
| `CORS_ORIGIN` | | `http://localhost:5173` | Allowed CORS origin(s), comma-separated |

> **Resend:** Set `SMTP_HOST=smtp.resend.com`, `SMTP_USER=resend`, `SMTP_PASS=<api-key>`, and `SMTP_FROM=<you>@<your-verified-domain>`.

### Root docker-compose (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_PASSWORD` | ✅ | Database password |
| `JWT_SECRET` | ✅ | JWT signing secret |
| `APP_URL` | ✅ | Public URL (e.g. `https://mvpl.golf`) |
| `GITHUB_REPOSITORY` | ✅ | Your GitHub repo (`user/repo`) for GHCR image pulls |
| `SMTP_HOST` | | SMTP host |
| `SMTP_USER` | | SMTP username |
| `SMTP_PASS` | | SMTP password / API key |
| `SMTP_FROM` | | Sender email address |
| `POSTGRES_USER` | | Default: `league` |
| `POSTGRES_DB` | | Default: `league_db` |
| `HTTP_PORT` | | Default: `80` |
| `IMAGE_TAG` | | Default: `latest` |

---

## Database

### Schema overview

```
Settings (singleton, id = 1)   ← house/EOY per-entry amounts

User ──< MagicLinkToken
User ──1 Player >── Division
User ── avatarDataUrl, isAdmin

Season ──< LeagueNight ──< Hole
                        ──< Round
                        ──< CheckIn >── Player   (hasPaid flag)
                        ──< Card ──< CardPlayer >── Player
                        ──< PuttOff ──< PuttOffParticipant >── Player
                        ──< ForumPost ──< ForumComment

Score >── Player, Hole, Round, LeagueNight
ScoreAuditLog >── Score, LeagueNight

Player ── pdgaNumber, divisionId, isActive

Motw ── image, caption, publishedAt

NotificationPreference >── Player   (forum email digest opt-in)
```

### Migrations

```bash
# Create a new migration during development
cd backend && npx prisma migrate dev --name describe_your_change

# Apply pending migrations (production / CI)
cd backend && npx prisma migrate deploy

# Regenerate Prisma client after schema changes
cd backend && npx prisma generate

# Re-seed
cd backend && npm run db:seed
```

> **Windows note:** After any schema change, run `prisma generate` before restarting the backend. The backend process must be stopped first to release the Prisma query engine DLL.

---

## Docker / Production Setup

### Build images locally

```bash
docker build -t league-backend ./backend
docker build --build-arg VITE_API_URL=/api -t league-frontend ./frontend
```

### Run the full stack

```bash
cp .env.example .env
# Edit .env with real values

docker compose up -d
```

| Container | Role | Exposed port |
|-----------|------|-------------|
| `league-postgres` | PostgreSQL 16 | 5432 (internal) |
| `league-backend` | Fastify API | 3001 (internal) |
| `league-frontend` | Vite static build | 80 (internal) |
| `league-nginx` | Reverse proxy | 5173 → 80 |

nginx routes `/api/*` to the backend and serves the frontend for all other paths.

---

## TrueNAS SCALE Deployment

The app runs on TrueNAS SCALE with external access via a Cloudflare Tunnel — no open inbound ports required.

### Architecture

```
Internet
  → Cloudflare Tunnel (nasquatch)
  → nginx-proxy-manager (NPM, port 80 on TrueNAS host)
  → league-nginx (172.16.0.1:5173 via Docker bridge gateway)
  → league-frontend / league-backend
```

### Deployment directory

```
/mnt/bag-of-holding/configs/putting-league/
├── docker-compose.yml
├── .env
└── nginx/nginx.conf
```

### One-time setup

1. **SSH into TrueNAS** and create the app directory:

   ```bash
   mkdir -p /mnt/bag-of-holding/configs/putting-league/nginx
   cd /mnt/bag-of-holding/configs/putting-league
   ```

2. **Copy files** to the server:

   ```bash
   scp docker-compose.yml .env.example nginx/nginx.conf \
       user@truenas:/mnt/bag-of-holding/configs/putting-league/
   ```

3. **Create `.env`** and fill in secrets:

   ```bash
   cp .env.example .env
   nano .env
   ```

4. **Log in to GHCR** on TrueNAS:

   ```bash
   echo $GITHUB_PAT | docker login ghcr.io -u <youruser> --password-stdin
   ```

5. **Pull and start**:

   ```bash
   docker compose pull && docker compose up -d
   ```

6. **Seed the database** (first run only):

   ```bash
   docker compose exec backend npm run db:seed
   ```

### Subsequent deployments

CI/CD handles everything automatically on push to `main`.

---

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/ci-cd.yml`) triggers on every push to `main`:

| Step | Description |
|------|-------------|
| **Typecheck** | `tsc --noEmit` on both backend and frontend |
| **Build & Push** | Builds Docker images, pushes to GHCR with `latest` + commit SHA tags |
| **Deploy** | SSHes into TrueNAS, applies DB migrations, restarts containers |

### Deploy sequence

1. Write fresh `.env` from GitHub Secrets
2. Pull new images from GHCR
3. Temporarily trust `localhost` in `pg_hba.conf` (handles credential rotation without downtime)
4. `docker compose up -d backend` + `prisma migrate deploy`
5. Restore `pg_hba.conf`, wait for backend health check
6. `docker compose up -d frontend nginx`

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `TRUENAS_HOST` | TrueNAS IP or hostname |
| `TRUENAS_USER` | SSH username |
| `TRUENAS_SSH_KEY` | Private SSH key |
| `POSTGRES_PASSWORD` | Database password |
| `JWT_SECRET` | JWT signing secret |
| `APP_URL` | Public app URL |
| `SMTP_HOST` | SMTP host |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password / API key |
| `SMTP_FROM` | Sender email address |

---

## Scoring Rules

- Each player throws **3 discs** per attempt
- **1 point** per made putt
- **+1 bonus point** for going 3-for-3 on an attempt (4 points total)
- Players throw from both **short** and **long** positions at each hole
- **Total score** = all made putts + all bonus points across all rounds and holes

### Station rotation

Players are grouped into scorekeeping cards. Each round, every card moves to the next hole:

```
hole = ((card_index + round - 1) % total_holes) + 1
```

### Tie-breaking

Configured per league night:

| Mode | Behaviour |
|------|-----------|
| **Split** | Prize money divided equally among tied players; no extra throws |
| **Putt-Off** | Tied players throw until one outperforms the others; admin records the winner |

---

## Financial System

Each paid entry is split into three buckets:

| Bucket | Configured via | Purpose |
|--------|---------------|---------|
| **House** | Admin → Settings | Operational / running costs |
| **End of Year** | Admin → Settings | Accumulated season prize pool |
| **Payout Pool** | Remainder | Distributed to top finishers night-of |

```
Payout Pool = Gross Collected − (players × house) − (players × EOY)
```

House and EOY amounts are set in the admin Settings page and apply immediately. Payout percentages scale with the number of paid players:

| Paid players | Places paid |
|-------------|-------------|
| 1–3 | 1 |
| 4–6 | 2 |
| 7–9 | 3 |
| 10–12 | 4 |
| 13–15 | 5 |
| 16+ | 6 |

---

## User Roles

| Role | Capabilities |
|------|-------------|
| **Admin** | Full access — all league data, players, divisions, seasons, settings, payouts, MOTW |
| **Scorekeeper** | Enter and edit scores for their assigned card |
| **Player** | View own dashboard, scores, stats, profile, and participate in the forum |
| **Spectator** | Read-only access to public leaderboards and league nights |

Players sign up via magic link. On first sign-in they choose their division. An admin can subsequently change their division, activate/deactivate their profile, or grant admin rights.

---

## License

MIT
