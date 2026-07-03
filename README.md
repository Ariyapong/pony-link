# url-shortener

Invite-only URL shortener behind `s.aritoton.com`. Elysia on Bun, PostgreSQL + Drizzle,
Redis, React dashboard at `/app`. Built as a backend-learning project — the "why"
comments in the code are the point, not noise.

## Dev

    docker compose --profile dev up -d   # postgres + redis
    cp .env.example apps/api/.env
    cd apps/api && bun install && bun run seed && bun run dev
    cd apps/web && bun run dev           # http://localhost:5173/app

Login: admin@local.test / admin-password-123

## Tests

    cd apps/api && bun test

## Deploy

Push to `main` → CI tests → image to GHCR → SSH deploy to the VPS.
Provisioning steps live in the deployment runbook (kept outside this repo).
