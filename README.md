# 🥏 Disc Golf Putting League

A full-stack, production-ready web application for managing a disc golf putting league. Supports arbitrary divisions, holes, rounds, seasons, and league nights with real-time scoring via WebSockets.

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
11. [User Roles](#user-roles)

---

## Features

- **Arbitrary configuration** – any number of divisions, holes, rounds, seasons
- **Real-time scoring** – WebSocket-powered live leaderboards
- **Role-based access** – Admin / Scorekeeper / Player / Spectator
- **Magic link auth** – no passwords, email-based sign-in
- **Tie-breaking** – split winnings or interactive putt-off rounds
- **Historical stats** – per-player and season-wide analytics
- **Admin panel** – full CRUD for all league entities
- **CSV export** – download league night score sheets
- **Docker-ready** – fully containerized, TrueNAS SCALE optimized
- **GitHub Actions CI/CD** – test → build → push → deploy

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js · Fastify · TypeScript · Prisma ORM · Zod |
| Frontend | React · Vite · TypeScript · TailwindCSS · React Query |
| Database | PostgreSQL 16 |
| Real-time | WebSockets (fastify-websocket) |
| Auth | Magic link (JWT) |
| Infra | Docker · nginx · docker-compose |
| CI/CD | GitHub Actions · GHCR |

---

## Project Structure

```
putting-league/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # Database schema
│   │   └── seed.ts              # Default data seed
│   └── src/
│       ├── config/env.ts        # Validated env vars
│       ├── lib/
│       │   ├── prisma.ts        # Prisma singleton
│       │   └── email.ts         # Nodemailer / magic link
│       ├── middleware/auth.ts   # JWT guards
│       ├── plugins/websocket.ts # WS room management
│       ├── routes/
│       │   ├── auth.ts
│       │   ├── leaderboard.ts
│       │   ├── scoring.ts
│       │   ├── stats.ts
│       │   ├── ws.ts            # WebSocket endpoint
│       │   └── admin/
│       │       ├── divisions.ts
│       │       ├── leagueNights.ts
│       │       ├── players.ts
│       │       └── seasons.ts
│       ├── services/
│       │   ├── scoring.ts       # Score calculation
│       │   ├── stats.ts         # Historical analytics
│       │   └── tiebreaker.ts    # Putt-off logic
│       ├── types/index.ts
│       └── index.ts             # Fastify server
├── frontend/
│   └── src/
│       ├── api/
│       │   ├── client.ts        # Fetch wrapper
│       │   └── types.ts         # Shared TypeScript types
│       ├── components/
│       │   ├── Layout.tsx
│       │   ├── AdminLayout.tsx
│       │   └── ui/              # Reusable UI atoms
│       ├── hooks/
│       │   ├── useWebSocket.ts  # WS hook with reconnect
│       │   └── useLeaderboard.ts
│       ├── lib/rotation.ts      # Station rotation logic
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── VerifyPage.tsx
│       │   ├── LeaderboardPage.tsx
│       │   ├── ScoringPage.tsx
│       │   ├── PlayerDashboardPage.tsx
│       │   └── admin/           # Admin panel pages
│       ├── store/auth.ts        # Auth state (no Zustand dep)
│       └── App.tsx
├── nginx/nginx.conf             # Reverse proxy config
├── docker-compose.yml
├── .env.example
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
git clone https://github.com/youruser/putting-league.git
cd putting-league

# Install backend deps
cd backend && npm install

# Install frontend deps
cd ../frontend && npm install
```

### 2. Start PostgreSQL

```bash
# From project root
docker compose up postgres -d
```

### 3. Configure environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env — at minimum set DATABASE_URL and JWT_SECRET
```

### 4. Run database migrations and seed

```bash
cd backend
npx prisma migrate dev --name init
npm run db:seed
```

### 5. Start the servers

```bash
# Terminal 1 – Backend
cd backend && npm run dev

# Terminal 2 – Frontend
cd frontend && npm run dev
```

Open **http://localhost:5173** in your browser.

The default admin user is `admin@league.local` — request a magic link to sign in (it prints to the console in dev mode since SMTP is not configured).

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | — | Secret for JWT signing (≥32 chars) |
| `NODE_ENV` | | `development` | `development` / `production` / `test` |
| `PORT` | | `3001` | HTTP listen port |
| `JWT_EXPIRY` | | `7d` | JWT token lifetime |
| `MAGIC_LINK_EXPIRY_MINUTES` | | `15` | Magic link lifetime |
| `SMTP_HOST` | | — | SMTP server host |
| `SMTP_PORT` | | `587` | SMTP port |
| `SMTP_USER` | | — | SMTP username |
| `SMTP_PASS` | | — | SMTP password |
| `SMTP_FROM` | | `noreply@league.local` | Sender address |
| `APP_URL` | | `http://localhost:5173` | Public URL (in magic link emails) |
| `CORS_ORIGIN` | | `http://localhost:5173` | Allowed CORS origin(s), comma-separated |

### Root docker-compose (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_PASSWORD` | ✅ | Database password |
| `JWT_SECRET` | ✅ | JWT signing secret |
| `APP_URL` | ✅ | Public URL of the app |
| `GITHUB_REPOSITORY` | ✅ | Your GitHub repo (`user/repo`) |
| `POSTGRES_USER` | | Default: `league` |
| `POSTGRES_DB` | | Default: `league_db` |
| `HTTP_PORT` | | Default: `80` |
| `IMAGE_TAG` | | Default: `latest` |

---

## Database

### Schema overview

```
User ──< MagicLinkToken
User ──< Player >── Division
User ──< ScorekeeperAssignment >── LeagueNight
Season ──< LeagueNight ──< Hole ──< Score
                         ──< Round ──< Score
                         ──< PuttOff ──< PuttOffParticipant >── Player
Score >── Player
```

### Migrations

```bash
# Create a new migration during development
cd backend && npx prisma migrate dev --name your_change_name

# Apply pending migrations (production / CI)
cd backend && npx prisma migrate deploy

# Re-seed
cd backend && npm run db:seed
```

---

## Docker / Production Setup

### Build images locally

```bash
# Backend
docker build -t league-backend ./backend

# Frontend
docker build --build-arg VITE_API_URL=/api -t league-frontend ./frontend
```

### Run the full stack

```bash
cp .env.example .env
# Edit .env with real values

docker compose up -d
```

The app will be available on `http://localhost:80` (or whatever `HTTP_PORT` you set).

---

## TrueNAS SCALE Deployment

### One-time setup

1. **SSH into your TrueNAS host** and create the app directory:

   ```bash
   mkdir -p /mnt/tank/putting-league
   cd /mnt/tank/putting-league
   ```

2. **Copy required files** to the server:

   ```bash
   scp docker-compose.yml .env.example nginx/nginx.conf \
       user@truenas:/mnt/tank/putting-league/
   mkdir -p /mnt/tank/putting-league/nginx
   # (nginx.conf goes in nginx/ subdirectory)
   ```

3. **Create and populate `.env`**:

   ```bash
   cp .env.example .env
   nano .env   # fill in POSTGRES_PASSWORD, JWT_SECRET, APP_URL, GITHUB_REPOSITORY
   ```

4. **Log in to GHCR** on the TrueNAS host:

   ```bash
   echo $GITHUB_PAT | docker login ghcr.io -u youruser --password-stdin
   ```

5. **Pull and start**:

   ```bash
   docker compose pull
   docker compose up -d
   ```

6. **Run database seed**:

   ```bash
   docker compose exec backend npm run db:seed
   ```

### Subsequent deployments

CI/CD handles this automatically. See [CI/CD Pipeline](#cicd-pipeline).

---

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/ci-cd.yml`) runs on every push to `main`:

| Step | Description |
|------|-------------|
| **Lint & Typecheck** | Runs `tsc --noEmit` on backend and frontend |
| **Tests** | Runs Vitest against a real PostgreSQL test database |
| **Build & Push** | Builds Docker images and pushes to GHCR with `latest` + SHA tags |
| **Deploy** | SSHes into TrueNAS, pulls new images, restarts containers with zero-downtime rolling update |

### Required GitHub Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Description |
|--------|-------------|
| `TRUENAS_HOST` | IP or hostname of your TrueNAS server |
| `TRUENAS_USER` | SSH username |
| `TRUENAS_SSH_KEY` | Private SSH key (the public key must be in `~/.ssh/authorized_keys` on TrueNAS) |
| `TRUENAS_PORT` | SSH port (optional, default 22) |
| `APP_DIR` | App directory on TrueNAS (optional, default `/mnt/tank/putting-league`) |

### Zero-downtime rolling deploy

The deploy step restarts containers in order:

1. `backend` (runs `prisma migrate deploy` on startup)
2. 10-second wait for backend to be healthy
3. `frontend` + `nginx`

---

## Scoring Rules

- Each player throws **3 discs** per attempt
- **1 point** per made putt
- **+1 bonus point** for going 3-for-3 (4 points total for that attempt)
- Players attempt from both **short** and **long** positions at each hole
- **Total score** = sum of all made putts + all bonus points across all rounds and holes

### Rotation

Players are assigned to stations. Each round they rotate to the next hole:

```
station_hole = ((station_index + round_number - 1) % total_holes) + 1
```

The last hole wraps back to the first.

### Tie-Breaking

Configured per league night:

- **Split Winnings** – no extra throws; prize is divided equally
- **Putt-Off** – tied players throw 3 discs; if still tied, repeat until one player makes more than the others

---

## User Roles

| Role | Capabilities |
|------|-------------|
| **Admin** | Full access — manage all league data, players, divisions, seasons |
| **Scorekeeper** | Enter and edit scores for their assigned holes |
| **Player** | View own dashboard, scores, and history |
| **Spectator** | Read-only access to public leaderboards and league nights |

Players sign up by requesting a magic link. An admin then assigns them a player profile and division.

---

## License

MIT
