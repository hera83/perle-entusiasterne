
# Plan: Deaktiver Email-bekræftelse + Tilføj Navn-felt

## Overblik
Der skal laves to ændringer:
1. **Slå email-bekræftelse fra** - så brugere kan logge ind med det samme
2. **Tilføj "Navn" felt** til login-flowet for første administrator

## Ændringer

### 1. Konfigurer Authentication
Deaktiver email-bekræftelse i Lovable Cloud, så nye brugere kan logge ind med det samme uden at skulle bekræfte deres email først.

### 2. Login-siden (Første Administrator)
Tilføj et "Navn" felt til formularen for oprettelse af første administrator:
- Nyt input-felt: **Navn** (f.eks. "Dit fulde navn")
- Navnet gemmes i `profiles.display_name` når brugeren oprettes
- Feltet vises kun når der oprettes første administrator

### 3. Bruger-administration 
Bruger-administrationen har allerede et "Navn" felt, så det behøver ikke ændres. Dog skal toast-beskeden opdateres, da den stadig nævner bekræftelses-email.

### 4. Galleri - "Oprettet af"
Galleriet henter allerede `creator_name` fra `profiles.display_name` og viser det som "Oprettet af" på hvert kort. Dette fungerer korrekt, da queryen joiner med `profiles(display_name)`.

---

## Tekniske Detaljer

### Fil-ændringer

**src/pages/Login.tsx**
- Tilføj `displayName` state variabel
- Tilføj nyt input-felt for navn i formularen (kun ved første admin)
- Ved oprettelse: gem `display_name` i profiles-tabellen efter signup
- Opdater valideringsschema til at inkludere navn (kun for signup)
- Fjern tekst om email-bekræftelse fra success-toast

**src/components/admin/UserManagement.tsx**
- Fjern tekst om bekræftelses-email fra success-toast
- Formularen har allerede navn-feltet

### Auth-konfiguration
Brug `configure-auth` værktøjet til at slå email-bekræftelse fra i Lovable Cloud.

---

## Flow efter ændringer

### Første Administrator
1. Bruger åbner login-siden
2. Systemet opdager ingen brugere → viser "Opret første administrator"
3. Bruger udfylder: **Navn**, Email, Adgangskode
4. Bruger trykker "Opret administrator"
5. Bruger oprettes og logges ind med det samme
6. Redirect til Galleriet

### Admin opretter ny bruger
1. Admin går til Administration → Brugere → Opret bruger
2. Udfylder: Navn, Email, Adgangskode, Rolle
3. Bruger oprettes og kan logge ind med det samme
