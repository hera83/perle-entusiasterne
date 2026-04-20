
Screenshot bekræfter samme fejl: `POST /api/query 413 (Request Entity Too Large)` på lokal instans (perler.ramskov.pro). Billedet er 174×116 perler × 6×4 plader = ~20.184 celler — det er payload'en der er stor, ikke billedet.

Den forrige fix hævede limits i `Dockerfile` (Nginx → 50m) og `server/src/index.ts` (Express → 50mb), men de er kun aktive efter `docker compose build`. Hvis 20k celler + thumbnail stadig overstiger 50 MB, eller hvis containeren ikke er rebuilt, fejler det stadig.

Jeg foreslår en kombineret løsning: rebuild-instruktion + reelle payload-reduktioner så det virker robust uanset størrelse.

## Plan: Reducér payload + sikr Docker-limits

### 1. Komprimér thumbnail (`src/components/workshop/CreatePatternDialog.tsx` + `ImportImageDialog.tsx`)
Thumbnail genereres som base64 PNG — for et 174×116 mønster kan det nemt blive 1-3 MB. Konvertér til JPEG kvalitet 0.7 før gem:
```ts
canvas.toDataURL('image/jpeg', 0.7)  // i stedet for toDataURL() (PNG default)
```
Reducerer typisk 5-10×.

### 2. Batch-insert af bead_cells (`src/components/workshop/CreatePatternDialog.tsx` + `ImportImageDialog.tsx`)
20.184 celler i én insert er hovedårsagen. Split i bidder af 1000:
```ts
for (let i = 0; i < cells.length; i += 1000) {
  await db.from('bead_cells').insert(cells.slice(i, i + 1000));
}
```
Ingen enkelt request bliver større end ~200 KB.

### 3. Hæv server-side limit som sikkerhedsnet (`server/src/index.ts` + `Dockerfile`)
Hæv fra 50mb → 100mb begge steder, så fremtidige store mønstre ikke fejler.

### 4. Tjek lokal backend understøtter array-insert
Bekræft at `server/src/index.ts` `/api/query` håndterer `body` som array korrekt (det gør Supabase-klienten allerede).

### Bruger-handling efter implementering
Kør i dit lokale miljø:
```
docker compose -f docker-compose.local.yml --env-file .env.local up --build -d
```
så både frontend (med batch + JPEG-thumbnail) og backend (med højere limit) opdateres.

### Filer der ændres
- `src/components/workshop/ImportImageDialog.tsx` — JPEG-thumbnail + batch-insert af celler
- `src/components/workshop/CreatePatternDialog.tsx` — samme optimeringer hvis relevant
- `server/src/index.ts` — limit 100mb
- `Dockerfile` — Nginx `client_max_body_size 100m`
