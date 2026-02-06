

# Fix Nginx redirect-loop i Docker

## Problem
Nginx-konfigurationen indeholder `\$uri` i stedet for `$uri`, fordi backslash-escaping er forkert i printf-kommandoen.

Forklaring:
- `printf` bruger single quotes (`'...'`) i Dockerfilen
- Inde i single quotes fortolker shell'en IKKE `$`-tegn, saa `$uri` er allerede sikker
- Men `\$uri` sendes bogstaveligt til printf, som outputter `\$uri` i Nginx-konfigen
- Nginx forstaar ikke `\$uri` og kan ikke finde filen, saa `try_files` loeser sig aldrig – det skaber en uendelig redirect-loekke

## Fix
Fjern backslash foran `$uri` paa linje 39 i Dockerfile.

### Aendring i Dockerfile (linje 39)

**Foer:**
```text
        try_files \$uri \$uri/ /index.html;\n\
```

**Efter:**
```text
        try_files $uri $uri/ /index.html;\n\
```

### Filer der aendres

| Fil | Aendring |
|-----|----------|
| `Dockerfile` | Fjern `\` foran `$uri` paa linje 39 |

Det er den eneste aendring der skal til. Herefter vil Nginx-konfigurationen korrekt indeholde `try_files $uri $uri/ /index.html;` og SPA-routing vil fungere.

