# Perleplade App

En dansk perlepladeapplikation bygget med React, Vite, Tailwind CSS og Supabase.

## Teknologier

- Vite + React + TypeScript
- shadcn-ui + Tailwind CSS
- Supabase (Auth, Database, Edge Functions)

---

## 🚀 Drift – to miljøer

### Cloud mode (Lovable / hosted Supabase)

Bruger den eksisterende `.env` fil med hosted Supabase-credentials.

```bash
# Kun frontend (Supabase kører i skyen)
docker compose up --build
```

Frontend tilgængelig på: **http://localhost:8080**

### Local mode (self-hosted, alt-i-én)

Kører hele stakken lokalt: frontend + Supabase (Postgres, Auth, REST, Realtime, Storage, Edge Functions, Studio).

#### 1. Opret `.env.local`

```bash
cp .env.local.example .env.local
```

> **Vigtigt:** `.env.local.example` indeholder standard Supabase demo-keys der virker out-of-the-box til lokal udvikling. Du kan bruge dem som de er, eller generere dine egne (se nedenfor).

#### 2. Start alle services

```bash
docker compose -f docker-compose.local.yml --env-file .env.local up --build
```

#### 3. Tilgængelige endpoints

| Service          | URL                          |
| ---------------- | ---------------------------- |
| Frontend (app)   | http://localhost:8080         |
| Supabase API     | http://localhost:54321        |
| Supabase Studio  | http://localhost:3000         |

#### 4. Stop / nulstil

```bash
# Stop
docker compose -f docker-compose.local.yml --env-file .env.local down

# Nulstil alt (sletter database-data)
docker compose -f docker-compose.local.yml --env-file .env.local down -v
```

---

## 📦 Hvad sker der ved local mode start?

1. **PostgreSQL** starter med Supabase-imaget (roller, extensions, schemas klar)
2. **Projekt-migrationer** (`supabase/migrations/*.sql`) køres automatisk i sorteret rækkefølge
3. **Edge Functions** (`supabase/functions/*`) mountes ind i edge-runtime og er tilgængelige via Kong API gateway
4. **Kong** router alle API-kald (`/auth/v1/`, `/rest/v1/`, `/functions/v1/` etc.)
5. **Frontend** bygges med lokale Supabase-credentials og serveres via Nginx

---

## 🔑 Generering af egne JWT keys (valgfrit)

Standard demo-keys i `.env.local.example` virker til lokal udvikling. Hvis du vil generere dine egne:

1. Vælg en `JWT_SECRET` (mindst 32 tegn)
2. Generer `ANON_KEY` og `SERVICE_ROLE_KEY` med [Supabase JWT Generator](https://supabase.com/docs/guides/self-hosting#api-keys) eller manuelt:

```bash
# Eksempel med node.js
node -e "
const jwt = require('jsonwebtoken');
const secret = 'your-super-secret-jwt-token-with-at-least-32-characters-long';
console.log('ANON_KEY:', jwt.sign({ role: 'anon', iss: 'supabase-demo', iat: 1641769200, exp: 1799535600 }, secret));
console.log('SERVICE_ROLE_KEY:', jwt.sign({ role: 'service_role', iss: 'supabase-demo', iat: 1641769200, exp: 1799535600 }, secret));
"
```

3. Opdater `ANON_KEY`, `SERVICE_ROLE_KEY`, `JWT_SECRET`, og `VITE_SUPABASE_PUBLISHABLE_KEY` i din `.env.local`

---

## 📁 Fil-struktur (Docker-relateret)

```
├── docker-compose.yml              # Cloud mode (kun frontend)
├── docker-compose.local.yml        # Local mode (fuld stack)
├── .env                            # Cloud Supabase credentials (auto-genereret)
├── .env.local.example              # Template til lokal .env.local
├── Dockerfile                      # Frontend multi-stage build
├── docker/
│   └── volumes/
│       ├── api/
│       │   └── kong.yml            # Kong API gateway routing config
│       ├── db/
│       │   ├── roles.sql           # DB rolle-passwords
│       │   ├── jwt.sql             # JWT config for PostgREST
│       │   ├── realtime.sql        # Realtime schema setup
│       │   ├── webhooks.sql        # Supabase functions hooks
│       │   └── apply-migrations.sh # Script der kører projekt-migrationer
│       └── functions/
│           └── main/
│               └── index.ts        # Edge-runtime dispatcher (lokal)
├── supabase/
│   ├── config.toml                 # Supabase function config
│   ├── migrations/                 # Database migrationer (deles af begge miljøer)
│   └── functions/                  # Edge functions (deles af begge miljøer)
```

---

## Lokal udvikling (uden Docker)

```bash
# Klon repo
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Installer dependencies
npm install

# Start dev server
npm run dev
```

Kræver Node.js – [installer med nvm](https://github.com/nvm-sh/nvm#installing-and-updating)
