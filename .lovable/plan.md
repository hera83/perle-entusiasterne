

# Fix Docker Build Fejl

## Problemer fundet

### 1. Nginx `$uri` bliver tolket som shell-variabel
I Dockerfile'ens `printf`-kommando bliver `$uri` tolket som en tom shell-variabel. Det medfører at Nginx-konfigurationen bliver ugyldig:

```text
# Nuvaerende (forkert - $uri forsvinder):
try_files $uri $uri/ /index.html;

# Resultat efter shell-tolkning:
try_files   /index.html;
```

**Fix**: Escape `$uri` som `\$uri` i printf-strengen.

### 2. `npm ci` fejler med usynkroniseret lockfile
Projektet bruger primaert `bun` (der findes en `bun.lockb`), saa `package-lock.json` kan vaere ude af sync. `npm ci` kraever at lockfilen matcher `package.json` praecist og fejler ellers.

**Fix**: Brug `npm install --frozen-lockfile` eller bare `npm install` i stedet for `npm ci`.

## Aendringer

### Dockerfile (opdateret)
Filen skrives om med to rettelser:

1. Linje 7: `RUN npm ci` aendres til `RUN npm install`
2. Linje 38-39: `$uri` escapes som `\$uri` i printf-strengen

Den opdaterede Dockerfile:

```text
# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install              <-- aendret fra "npm ci"

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# SPA routing med korrekt escaped $uri
RUN printf 'server {\n\
    listen 80;\n\
    server_name localhost;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    location /assets/ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
\n\
    location / {\n\
        try_files \$uri \$uri/ /index.html;\n\  <-- escaped
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Filer der aendres

| Fil | Aendring |
|-----|----------|
| `Dockerfile` | Fix `npm ci` til `npm install` + escape `$uri` |

Ingen andre filer behoever aendringer.

## Bemaekning
Hvis buildet stadig fejler efter disse rettelser, kan du proeve at paste de sidste 20-30 linjer af fejlloggen direkte i chatten, saa kan jeg finde den praecise fejl.

