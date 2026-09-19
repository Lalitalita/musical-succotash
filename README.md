# WebDesktop

Bureau virtuel ("Web Desktop") auto-hébergé, conteneurisé, avec authentification
forte et second facteur déguisé, dashboard de sécurité réservé au LAN, et un
"navigateur distant" en mode texte (aucun flux vidéo/canvas).

Déploiement 100 % automatisé derrière un reverse-proxy Nginx externe qui gère
déjà le TLS.

## Architecture

```
Internet ──HTTPS──▶ Nginx externe (TLS, hors de ce dépôt)
                          │  (X-Forwarded-For / X-Real-IP / X-Forwarded-Proto)
                          ▼
                 ┌──────────────────────┐
     réseau      │  frontend (Nginx)    │  seul service exposé publiquement
     "public"    │  sert le SPA React   │  (port ${FRONTEND_PORT})
                 └──────────┬───────────┘
                            │ proxy /api/*
     réseau      ┌──────────▼───────────┐   ┌────────────┐   ┌─────────┐
     "internal"  │  backend (FastAPI)   │──▶│ PostgreSQL │   │  Redis  │
     (isolé,     │  auth, MFA leurre,   │──▶│            │   │ rate    │
      pas de     │  rate limit, geoip,  │   └────────────┘   │ limit   │
      sortie)    │  proxy navigateur    │──────────────────▶ └─────────┘
                 └──────────────────────┘
```

- Le **frontend** est le seul service publié sur le réseau `public` (mappé
  sur `FRONTEND_PORT`, `8080` par défaut). C'est vers ce port que doit
  pointer le reverse-proxy Nginx externe.
- Le **backend**, **PostgreSQL** et **Redis** vivent uniquement sur le
  réseau Docker `internal` (`internal: true`, sans passerelle vers
  l'extérieur) et ne publient aucun port sur l'hôte.
- Les endpoints `/api/admin/security/*` (dashboard) ne répondent que si
  l'adresse IP réelle du client (reconstituée depuis la chaîne
  `X-Forwarded-For`, voir `TRUSTED_PROXY_HOPS`) appartient à un réseau privé
  (RFC1918/loopback) ou à `ADMIN_IP_WHITELIST`.

## Démarrage

```bash
cp .env.example .env
# éditer .env : SECRET_KEY, POSTGRES_PASSWORD, SMTP_*, ADMIN_IP_WHITELIST...
docker compose up -d --build
```

Tout est automatique : création du schéma PostgreSQL, génération du compte
admin (si aucun utilisateur n'existe) avec mot de passe et secret TOTP
imprimés **une seule fois** dans les logs :

```bash
docker compose logs backend | grep -A8 "FIRST RUN BOOTSTRAP"
```

Ajoutez le secret TOTP affiché dans Aegis / Google Authenticator. Aucune
autre étape manuelle n'est nécessaire.

Configurez ensuite votre reverse-proxy Nginx externe (déjà en place, hors de
ce dépôt) pour terminer le TLS et faire suivre vers
`http://<hôte-debian>:${FRONTEND_PORT}` en transmettant
`X-Forwarded-For` / `X-Real-IP` / `X-Forwarded-Proto`.

## Authentification et leurre MFA

1. `POST /api/auth/login` vérifie le mot de passe (haché Argon2id). En cas
   de succès, un jeton `mfa_token` de courte durée est renvoyé.
2. L'écran de second facteur ressemble à un champ de date anodin
   (`JJ/MM/AAAA`), avec insertion automatique de `/` tous les 2 chiffres
   pendant la frappe. Une fois les slashs retirés côté serveur, le résultat
   est un code TOTP standard à 6 chiffres, validé avec `pyotp`
   (compatible Aegis / Google Authenticator).
3. En cas de succès, un cookie de session `httpOnly` (JWT) est posé.

### Anti-bruteforce

- Compteurs Redis par IP et par compte, fenêtre glissante
  (`LOGIN_MAX_ATTEMPTS_PER_WINDOW` / `LOGIN_WINDOW_SECONDS`).
- Verrouillage progressif : chaque échec supplémentaire double la durée de
  blocage (`LOCKOUT_BASE_SECONDS` → `LOCKOUT_MAX_SECONDS`).
- Une alerte email (SMTP configurable) est envoyée immédiatement en cas de
  verrouillage de compte/IP ou d'échecs répétés sur l'étape MFA
  (`MFA_ALERT_FAILURE_THRESHOLD`).

## Dashboard de sécurité (LAN uniquement)

`GET /api/admin/security/attempts` et `/stats`, protégés par
`require_lan_or_whitelisted` **et** par une session admin. Chaque tentative
loguée contient : horodatage, statut, IP, User-Agent, et géolocalisation
(pays/ville) via une base locale MaxMind GeoLite2 (voir
`backend/geoip/README.md` pour l'installation, non fournie pour raisons de
licence).

## Navigateur distant en mode texte

Aucun flux vidéo/canvas : le composant "Navigateur" du bureau demande une
URL au backend (`GET /api/browser/view?url=...`), qui :

1. Valide l'URL et résout le DNS pour bloquer tout accès SSRF (IP privées,
   loopback, link-local, métadonnées cloud) — y compris à chaque redirection.
2. Récupère la page avec sa propre IP sortante (celle de l'hôte Debian).
3. Supprime scripts, gestionnaires d'événements, `javascript:`, iframes/objets
   et styles inline, puis réécrit tous les liens/formulaires/ressources
   statiques (`img`, `link[rel=stylesheet]`) pour repasser par le proxy.
4. Renvoie du HTML texte pur, affiché dans une `<iframe sandbox>` sans
   exécution de script côté client.

Les assets (CSS/images/fonts) transitent par `GET /api/browser/asset` avec
la même protection SSRF et une limite de taille (`BROWSER_PROXY_MAX_BYTES`).

## Arborescence

```
.
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── geoip/                  # placer GeoLite2-City.mmdb ici
│   └── app/
│       ├── main.py             # FastAPI, montage des routers
│       ├── config.py           # Settings (pydantic-settings, tout via env)
│       ├── database.py         # SQLAlchemy engine/session
│       ├── models.py           # User, LoginAttempt
│       ├── schemas.py          # Pydantic I/O
│       ├── security.py         # Argon2id, JWT, leurre TOTP
│       ├── rate_limit.py       # Compteurs Redis + verrouillage progressif
│       ├── geoip.py            # Lookups GeoLite2
│       ├── mailer.py           # Alertes SMTP
│       ├── deps.py             # IP réelle, garde LAN, session courante
│       ├── browser_ssrf.py     # Validation anti-SSRF
│       ├── init_db.py          # Bootstrap admin au premier démarrage
│       └── routers/
│           ├── auth.py
│           ├── admin.py
│           └── browser_proxy.py
└── frontend/
    ├── Dockerfile               # build Vite -> Nginx
    ├── nginx.conf               # sert le SPA + proxy /api -> backend:8000
    └── src/
        ├── api/client.ts
        ├── state/{authStore,windowStore}.ts
        ├── components/
        │   ├── Login/{LoginForm,MfaDecoyForm}.tsx
        │   └── Desktop/{Desktop,Taskbar,StartMenu,Window,WindowManager}.tsx
        │   └── Apps/{BrowserApp,SecurityDashboard}/
        └── styles/global.css     # thème Windows 11 (acrylique/mica)
```

## Développement local (hors Docker)

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (proxy /api vers localhost:8000, voir vite.config.ts)
cd frontend && npm install && npm run dev
```

## Notes de sécurité

- Aucune gestion TLS dans l'application : c'est la responsabilité du
  reverse-proxy Nginx externe.
- `TRUSTED_PROXY_HOPS` doit correspondre exactement au nombre de proxies HTTP
  entre l'utilisateur et le backend (2 par défaut : Nginx externe + Nginx du
  conteneur frontend), sinon la restriction LAN du dashboard peut être
  contournée ou, à l'inverse, bloquer des IP légitimes.
- Changez impérativement `SECRET_KEY` et les mots de passe PostgreSQL/SMTP
  dans `.env` avant tout déploiement réel.
