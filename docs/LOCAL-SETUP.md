# Lokal/Self-Contained Drift

## Oversigt

Projektet understøtter to driftsformer:

1. **Hosted Mode** (standard): Bruger Lovable Cloud / Supabase
2. **Local Mode**: Selvstændig drift med PostgreSQL + TypeScript backend

## Hurtigstart (Local Mode)

```bash
# 1. Kopiér env-fil
cp .env.local.example .env.local

# 2. Ret JWT_SECRET og passwords i .env.local til sikre værdier

# 3. Start alt med Docker Compose
docker compose -f docker-compose.local.yml --env-file .env.local up --build

# 4. Åbn appen
# Frontend: http://localhost:8080
# Backend API: http://localhost:3001
# Database: localhost:5433
```

## Første gang

Når appen starter op for første gang uden brugere, vises en "Opret første administrator" formular på login-siden. Den første bruger bliver automatisk administrator.

## Arkitektur

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│   Frontend   │────▶│   Backend    │────▶│ PostgreSQL │
│   (Nginx)    │     │  (Express)   │     │            │
│   port 8080  │     │  port 3001   │     │  port 5433 │
└─────────────┘     └──────────────┘     └────────────┘
```

### Frontend
- Vite/React app bygget til Nginx
- Skifter datakilde via `VITE_BACKEND_MODE=local`
- Proxy-lag i `src/services/db.ts` sikrer at komponenter fungerer i begge modes

### Backend (`server/`)
- Express + TypeScript
- JWT-baseret autentificering
- Generisk query-handler der efterligner PostgREST-syntaks
- Lokale ækvivalenter til alle Edge Functions

### Database
- Standard PostgreSQL 16
- `server/init.sql` opretter hele skemaet + seed-data automatisk

## Miljøvariabler

| Variabel | Beskrivelse | Standard |
|----------|-------------|----------|
| `VITE_BACKEND_MODE` | `local` for lokal drift | (tom = hosted) |
| `VITE_LOCAL_API_URL` | Backend URL | `http://localhost:3001` |
| `POSTGRES_DB` | Database navn | `perleplade` |
| `POSTGRES_PASSWORD` | Database password | `postgres` |
| `JWT_SECRET` | JWT signerings-nøgle | (skift i produktion!) |
| `APP_PORT` | Frontend port | `8080` |
| `BACKEND_PORT` | Backend port | `3001` |

## Stop og reset

```bash
# Stop
docker compose -f docker-compose.local.yml --env-file .env.local down

# Stop og slet al data (fuld reset)
docker compose -f docker-compose.local.yml --env-file .env.local down -v
```

## Produktion

For produktion bør du:
1. Sætte et stærkt `JWT_SECRET`
2. Sætte et stærkt `POSTGRES_PASSWORD`
3. Overveje at sætte en reverse proxy (Nginx/Caddy) foran med HTTPS
4. Evt. flytte database til en separat server/managed PostgreSQL
