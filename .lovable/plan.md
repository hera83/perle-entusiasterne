
## Plan: Ret 401 ved "Kopier delingslink" i local mode

### Årsag
Cloud-edge-funktionen `generate-share-token` kører med `verify_jwt = false` og bruger service role — alle kan kalde den med et `pattern_id`. Den lokale ækvivalent i `server/src/index.ts` bruger derimod `requireAuth`, så hvis JWT'en mangler eller er ugyldig (fx udløbet, eller `JWT_SECRET` blev ændret efter login), returneres 401. Det er derfor det fejler lokalt men virker i cloud.

Sekundær mulig årsag: token i `localStorage` er gammel/ugyldig efter container-rebuild med nyt `JWT_SECRET`, og selvom Supabase-klienten viser brugeren som "logget ind", afviser backend tokenen.

### Løsning
Match adfærden i cloud: tillad anonyme kald til `generate-share-token` lokalt — endpointet har kun brug for `pattern_id` for at lave et UUID og gemme det. Sikkerhedsmæssigt er det samme niveau som hosted/Supabase-versionen (delelink er en deling alligevel, og UUID'et er ikke gætbart).

### Ændringer

**`server/src/index.ts` (linje 702)**
- Fjern `requireAuth` fra `/api/functions/generate-share-token`-route. Behold `authMiddleware` (så `req.userId` er tilgængelig hvis brugeren er logget ind, til evt. fremtidig audit), men kræv ikke at den er sat.
- Resultat: linjen bliver `app.post('/api/functions/generate-share-token', authMiddleware, async (req, res) => { ... })`.

### Bruger-handling
Efter ændringen skal kun backend-containeren rebuildes:
```
docker compose -f docker-compose.local.yml --env-file .env.local up --build -d backend
```
Derefter virker "Kopier delingslink" anonymt — præcis som i cloud.

### Filer der ændres
- `server/src/index.ts` — fjern `requireAuth` fra share-token-routen.
