

# Docker-support til projektet

## Oversigt
Tilfoej Docker-filer saa frontenden kan bygges og koeres lokalt paa din egen server. Ingen eksisterende filer aendres – kun tre nye filer tilfoejes i roden af projektet.

## Hvad bliver tilfoejet

### 1. Dockerfile (multi-stage build)
Bygger projektet i to trin:

- **Trin 1 (Build)**: Bruger Node.js til at installere dependencies og koere `npm run build`. Supabase-miljoevariabler injiceres som build-argumenter, da Vite indlejrer dem i den statiske kode under byggeprocessen.
- **Trin 2 (Serve)**: Kopierer det byggede output til en letvaegtets Nginx-container der serverer filerne. Inkluderer en Nginx-konfiguration til korrekt SPA-routing (alle ruter peger tilbage til `index.html`).

### 2. docker-compose.yml
En simpel compose-fil der:

- Bygger image fra Dockerfile
- Eksponerer port 8080
- Sender Supabase-miljoevariabler ind som build-argumenter via en `.env`-fil

### 3. .dockerignore
Ekskluderer unodvendige filer fra Docker-buildet (node_modules, .git, dist, osv.) for hurtigere builds.

## Brug

Efter tilfoejelsen kan du koere projektet med:

```text
# Opret en .env fil med dine Supabase-vaerdier (allerede eksisterer i projektet)
# Byg og start containeren
docker-compose up --build

# Aaben i browseren
http://localhost:8080
```

## Filer der oprettes

| Fil | Beskrivelse |
|-----|-------------|
| `Dockerfile` | Multi-stage build: Node.js build + Nginx serving |
| `docker-compose.yml` | Simpel compose-opsaetning med port og env-variabler |
| `.dockerignore` | Ekskluder node_modules, .git, dist m.m. |

## Tekniske detaljer

### Dockerfile-struktur

```text
Stage 1: node:20-alpine
  -> WORKDIR /app
  -> Kopier package.json + package-lock.json
  -> npm ci (installer dependencies)
  -> Kopier resten af koden
  -> ARG VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID
  -> npm run build

Stage 2: nginx:alpine
  -> Kopier build-output fra stage 1 til /usr/share/nginx/html
  -> Kopier custom nginx.conf (SPA-routing)
  -> Eksponerer port 80
```

### Nginx-konfiguration (indlejret i Dockerfile)
En simpel konfiguration der:

- Serverer statiske filer fra `/usr/share/nginx/html`
- Redirecter alle ukendte ruter til `index.html` (noedvendigt for React Router)
- Saetter korrekte cache-headers for assets

### docker-compose.yml

```text
services:
  app:
    build:
      context: .
      args:
        - VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
        - VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
        - VITE_SUPABASE_PROJECT_ID=${VITE_SUPABASE_PROJECT_ID}
    ports:
      - "8080:80"
```

### Vigtige noter
- Backend (database, auth, edge functions) forbliver paa Lovable Cloud – Docker koerer kun frontenden
- `.env`-filen i projektet indeholder allerede de noedvendige variabler, saa `docker-compose` kan bruge dem direkte
- Ingen eksisterende filer aendres overhovedet

