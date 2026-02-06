
# Fix: Session tabes under gemning (og stille datatab)

## Problem-analyse

Der er TO sammenkoblede problemer:

### Problem 1: Sessionen mistes efter login
Auth-loggen viser 6+ samtidige `token_revoked` events inden for 2-3 sekunder efter login. Det sker fordi login udloeser en kaskade af samtidige database-kald:
- `syncFavoritesOnLogin()` koerer en for-loop med individuelle upserts (et kald per favorit)
- `checkAdminRole()` koerer et kald
- `ThemeContext` koerer et kald for at hente tema
- Alle disse kald rammer databasen naesten samtidigt og kan trigge samtidige token-refresh forsog

Naar to refresh-forsog bruger det SAMME refresh token, lykkes det ene, men det andet fejler. Supabase-klienten tolker dette som "session kompromitteret" og logger brugeren ud.

### Problem 2: Tavs datatab ved gem
Network-loggen afslorer noget kritisk: ALLE gem-requests bruger **anon-noeglen** som authorization - ikke brugerens JWT token. Det betyder sessionen allerede var tabt FoER brugeren trykkede "Gem alt".

RLS-politikkerne paa `bead_plates` kraever `auth.uid()` for UPDATE. Med anon-noeglen er `auth.uid() = NULL`, saa UPDATE matcher ingen raekker. Supabase returnerer status 204 (ingen fejl), men NUL raekker opdateres. **Data bliver IKKE gemt, men brugeren faar ingen fejlbesked.**

Naar koden naar til at opdatere `bead_patterns` (thumbnail), fejler det ogsaa stille. Til sidst opfanger noget at sessionen er vaek, og brugeren redirectes til login.

## Loesning (4 filer)

### 1. AuthContext.tsx - Stabil session-haandtering

**Problem**: TOKEN_REFRESHED ignoreres helt, saa React-stateens session-objekt bliver stale. Det er ikke i sig selv aarsagen, men det betyder at vi mister synkronisering med Supabase-klienten.

**Fix**: 
- Haandter TOKEN_REFRESHED ved at opdatere session-state UDEN at aendre user/isAdmin
- Behold currentUserIdRef for at forhindre unodvendige user-opdateringer
- Tilfoej INITIAL_SESSION haandtering der ogsaa opdaterer session silently

```text
onAuthStateChange handler (ny logik):
  TOKEN_REFRESHED:
    - Opdater session state (holder React i sync med klienten)
    - Opdater IKKE user eller isAdmin (undgaar re-render-kaskade)
  
  INITIAL_SESSION:
    - Ignorer (initializeAuth haandterer dette)
  
  SIGNED_IN:
    - Kun opdater hvis user ID er ny (via ref)
  
  SIGNED_OUT:
    - Nulstil alt
```

### 2. PatternEditor.tsx - Sikker batch-gemning

**Problem**: `handleSaveAll` koerer en sekventiel for-loop med N individuelle UPDATE-kald (et per plade). Med f.eks. 6 plader = 7 requests. Desuden er der ingen session-verifikation foer gemning.

**Fix**:
- Tilfoej session-tjek FOER gemning starter (kald `getSession()`)
- Hvis sessionen er ugyldig, vis en tydelig fejlbesked i stedet for at gemme stille
- Erstat den sekventielle for-loop med `Promise.all` for at reducere samlet tid
- Tilfoej fejldetektering der fanger auth-fejl specifikt

```text
handleSaveAll (ny logik):
  1. Kald supabase.auth.getSession()
  2. Hvis ingen session: vis fejl "Du er logget ud - log ind igen"
  3. Opret alle update-promises paa een gang
  4. Koer Promise.all (parallelt i stedet for sekventielt)
  5. Hvis nogen fejler: vis praecis fejlbesked
  6. Opdater thumbnail og total_beads
```

### 3. Login.tsx - Batch favorit-synkronisering

**Problem**: `syncFavoritesOnLogin` koerer en for-loop der laver individuelle upserts for hver favorit. Med 5 favoritter = 5 sekventielle requests + getUser(), som alle sker umiddelbart efter login = burst af 6+ requests paa 1-2 sekunder.

**Fix**: 
- Erstat for-loopen med en enkelt bulk-upsert
- Fjern det separate `getUser()` kald og brug `user` fra auth context i stedet

```text
syncFavoritesOnLogin (ny logik):
  1. Hent favorites fra localStorage
  2. Hvis ingen: return
  3. Byg et array af alle favorites
  4. Koer EN enkelt upsert med hele arrayet
  5. Slet localStorage
```

### 4. PatternDialog.tsx - Session-tjek paa progress-gem

**Problem**: `saveProgress` gemmer brugerens progress men tjekker ikke om sessionen er gyldig.

**Fix**: Tilfoej en session-verifikation foer database-operationer i `saveProgress`, saa brugeren faar en tydelig besked hvis sessionen er udloebet.

## Filer der aendres

| Fil | Aendring |
|-----|----------|
| `src/contexts/AuthContext.tsx` | Haandter TOKEN_REFRESHED med session-opdatering |
| `src/components/workshop/PatternEditor.tsx` | Session-tjek + batch gem med Promise.all |
| `src/pages/Login.tsx` | Bulk upsert for favorit-sync |
| `src/components/gallery/PatternDialog.tsx` | Session-tjek i saveProgress |

## Tekniske detaljer

### AuthContext.tsx

```text
// I onAuthStateChange:
if (event === 'TOKEN_REFRESHED') {
  // Opdater session saa React state forbliver synkroniseret
  if (session) {
    setSession(session);
  }
  return; // Opdater IKKE user/isAdmin - undgaar re-render kaskade
}

if (event === 'INITIAL_SESSION') return; // initializeAuth haandterer dette
```

### PatternEditor.tsx - handleSaveAll

```text
const handleSaveAll = async () => {
  if (!patternId) return;

  // KRITISK: Verificer session foer vi starter
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    toast({
      title: 'Session udloebet',
      description: 'Du er blevet logget ud. Log ind igen for at gemme.',
      variant: 'destructive',
    });
    return;
  }

  setIsSaving(true);
  try {
    // Batch: Koer alle plate-updates parallelt
    const updatePromises = plates.map(plate =>
      supabase
        .from('bead_plates')
        .update({ beads: plate.beads as unknown as Json })
        .eq('id', plate.id)
    );

    const results = await Promise.all(updatePromises);
    
    // Tjek for fejl
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      throw errors[0].error;
    }

    // Thumbnail + metadata
    const totalBeads = plates.reduce((sum, plate) => sum + plate.beads.length, 0);
    const thumbnail = generateThumbnail();

    const { error: metaError } = await supabase
      .from('bead_patterns')
      .update({ total_beads: totalBeads, thumbnail })
      .eq('id', patternId);

    if (metaError) throw metaError;

    setHasUnsavedChanges(false);
    toast({ title: 'Gemt', description: 'Alle aendringer er gemt.' });
  } catch (error) {
    console.error('Error saving:', error);
    toast({
      title: 'Fejl',
      description: 'Kunne ikke gemme aendringer. Proev at logge ind igen.',
      variant: 'destructive',
    });
  } finally {
    setIsSaving(false);
  }
};
```

### Login.tsx - syncFavoritesOnLogin

```text
const syncFavoritesOnLogin = async () => {
  try {
    const localFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    if (localFavorites.length === 0) return;

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;

    // EN enkelt bulk upsert i stedet for N individuelle
    await supabase
      .from('user_favorites')
      .upsert(
        localFavorites.map((patternId: string) => ({
          user_id: currentUser.id,
          pattern_id: patternId,
        })),
        { onConflict: 'user_id,pattern_id' }
      );

    localStorage.removeItem('favorites');
  } catch (err) {
    console.error('Error syncing favorites:', err);
  }
};
```

### PatternDialog.tsx - saveProgress

```text
const saveProgress = async (completed: string[], position: PlatePosition) => {
  if (!pattern) return { error: null };

  if (user) {
    // Verificer session foerst
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { error: new Error('Session expired') };
    }

    const { error } = await supabase
      .from('user_progress')
      .upsert({...}, { onConflict: 'user_id,pattern_id' });

    if (error) return { error };
  } else {
    localStorage.setItem(...);
  }

  onProgressChange?.();
  return { error: null };
};
```
