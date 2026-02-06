
# Perle Entusiasterne - Projektplan

## 🎨 Design & Tema
- **Titel:** "Perle Entusiasterne" med slogan "Keep it simple"
- **Tema-skifter:** Lys/mørk mode knap i øverste højre hjørne
- **Tema gemmes:** I databasen for loggede brugere, i localStorage for gæster
- **Hjælpetekster:** Input-labels og forklarende tekst på alle funktioner

---

## 📄 Side 1: Galleri (Hovedside)
**Tilgængelig for alle**

### Søgefunktion
- Google-stil søgefelt centreret på siden
- Ved søgning rykker feltet op i toppen
- Kategori-filter (Disney, Dyr, Diverse osv.)
- Viser nyeste opskrifter som standard

### Navigation
- **Ikke logget ind:** Login-knap
- **Bruger:** WorkShop + Logud
- **Administrator:** Administration + WorkShop + Logud

### Søgeresultat-kort
- **Header:** Opskrifttitel + Favorit-knap (❤️)
- **Body:** 
  - Kolonne 1: Genereret preview-billede af perlepladen
  - Kolonne 2: Metadata (dato, forfatter, dimensioner, antal perler, progress-bar)
- **Footer:** 
  - Alle: Åben, Nulstil
  - Admin: Rediger, Slet

### Perleplade-popup (Åben)
- Maksimal størrelse uden scroll
- Navigation: Frem/Tilbage mellem plader
- Nummereret perleplade-grid med farvekoder
- Hover viser farvenavn
- Checkbox for "færdig med plade" (gemmes i DB eller localStorage)
- Progress-tracking synkroniseres ved login

### Favoritter
- Separat favorit-side + filter i galleriet
- Synkronisering fra localStorage til database ved login

### Print
- Print-venlig version af perleplade-opskrifter

---

## 📄 Side 2: Login
**Kun admin opretter brugere**

- Felt: Email, adgangskode
- Første gang: Hjælp til at oprette første admin
- Redirect til Galleri efter login

---

## 📄 Side 3: Administration
**Kun for administratorer**

### Dashboard
- Antal opskrifter (privat/offentlig)
- Antal kategorier
- Statistik over startede/færdige perleplader

### Moduler
1. **Data-administration:** Import/eksport, nulstil alt data
2. **Bruger-administration:** Opret, rediger, slet brugere med roller
3. **Besked-administration:** Popup-beskeder med start/slut-tidspunkt for Galleri

---

## 📄 Side 4: WorkShop
**For Brugere og Administratorer**

### Oprettelsesmetoder
1. **Import billede:** 
   - Upload, fjern baggrund, beskær
   - Vælg perleplade-dimension (29x29 standard)
   - Vælg bredde i antal plader (højde beregnes automatisk)
   - Preview før import
   
2. **Ny opskrift:**
   - Vælg højde og bredde i antal plader
   - Tilføj/fjern rækker og kolonner undervejs

### Farve-administration (Popup)
- Tabel med alle tilgængelige farver
- Tilføj, rediger, slet farver
- Farvedata: Code, Navn, HEX-farve, Aktiv-status
- Gem-knap (ingen auto-gem)

### Metadata-input
- Titel (påkrævet)
- Kategori (autocomplete fra eksisterende kategorier)
- Offentlig/Privat toggle

### Redigerings-grid
- Grafisk perleplade-visning
- Edit-knap per plade → åbner redigerings-popup

### Redigerings-popup
- **Header:** Række X, Plade Y + Luk-knap
- **Body:**
  - Kolonne 1: Interaktiv perleplade med klik-for-at-farve
  - Kolonne 2: Værktøjer
    - Vælg farve (dropdown inkl. slet-farve)
    - Scan farve (pipette)
    - Fasthold farve (tegn ved at trække)
    - Erstat farve (global eller per plade)
    - Ryd plade
- **Footer:** Gem-knap

### Gem & Afslut
- Gem opskrift
- Spørg om redirect til Galleri

---

## 🗃️ Database-struktur

### Tabeller
1. **profiles** - Brugerinfo
2. **user_roles** - Roller (admin, user)
3. **bead_patterns** - Opskrifter med metadata
4. **bead_plates** - Individuelle plader per opskrift
5. **bead_colors** - Farvepalette
6. **categories** - Unikke kategorier
7. **user_favorites** - Favorit-relationer
8. **user_progress** - Progress per bruger/opskrift
9. **announcements** - Admin-beskeder med tidsperiode

### Sikkerhed
- Row Level Security (RLS) på alle tabeller
- Admin kan alt, brugere kun egne opskrifter
- Gæster kan kun læse offentlige opskrifter

---

## 🔧 Tekniske detaljer
- **Backend:** Lovable Cloud (Supabase)
- **Autentificering:** Email/password via Supabase Auth
- **Billedbehandling:** Canvas API til preview-generering
- **LocalStorage:** Synkronisering med database ved login
- **Responsivt design:** Optimeret til tablet-brug

