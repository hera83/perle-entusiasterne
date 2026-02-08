
# Fix: Delingslink fungerer ikke

## Problem

`handleShareLink` i PatternCard.tsx genererer en share_token og prøver at UPDATE bead_patterns, men:

1. Supabase `.update()` returnerer ikke en fejl når RLS blokerer opdateringen - den returnerer bare 0 berørte rækker
2. Koden tjekker kun `if (error)` som aldrig er sat, og tror derfor opdateringen lykkedes
3. Brugere kan ikke UPDATE andres offentlige opskrifter (RLS: `auth.uid() = user_id`)
4. URL kopieres med et token der aldrig blev gemt i databasen

## Løsning

Flytte token-generering til en edge function der bruger service role (ligesom `get-shared-pattern` allerede gør for læsning). Dette sikrer:
- Token genereres altid korrekt, uanset RLS
- Verificering at tokenet faktisk blev gemt
- Både ejere og ikke-ejere kan generere delingslinks

### Ændringer

**1. Ny edge function: `generate-share-token`**

Fil: `supabase/functions/generate-share-token/index.ts`

- Modtager `pattern_id` i request body
- Bruger service role til at tjekke om opskriften allerede har et `share_token`
- Hvis ja: returnerer det eksisterende token
- Hvis nej: genererer et nyt UUID, opdaterer rækken, verificerer at det blev gemt, og returnerer det
- Kræver ikke login (public patterns kan deles af alle)

```text
POST /generate-share-token
Body: { "pattern_id": "uuid" }
Response: { "share_token": "uuid" }
```

**2. Opdater PatternCard.tsx**

Fil: `src/components/gallery/PatternCard.tsx`

Ændr `handleShareLink` funktionen til at kalde den nye edge function i stedet for at lave inline Supabase-queries:

```text
// I stedet for direkte SELECT + UPDATE via Supabase client:
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-share-token`,
  {
    method: 'POST',
    headers: {
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pattern_id: pattern.id }),
  }
);
const { share_token } = await response.json();
const url = `${window.location.origin}/opskrift/${share_token}`;
```

Fjern `as any` casts og direkte Supabase-kald fra funktionen.

**3. Registrer edge function i config**

Fil: `supabase/config.toml`

Tilfoej:
```text
[functions.generate-share-token]
verify_jwt = false
```

### Oversigt

| Fil | Ændring |
|-----|---------|
| `supabase/functions/generate-share-token/index.ts` | NY - Genererer/henter share token via service role |
| `src/components/gallery/PatternCard.tsx` | Brug edge function i stedet for direkte UPDATE |
| `supabase/config.toml` | Registrer ny edge function |
