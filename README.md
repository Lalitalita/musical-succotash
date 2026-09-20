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
     réseau      ┌──────────▼───────────┐   réseau      ┌────────────┐
     "internal"  │  backend (FastAPI)   │───"data"─────▶│ PostgreSQL │
     (égress     │  auth, MFA leurre,   │   (internal:  │  + Redis   │
      Internet   │  rate limit, geoip,  │    true, pas  │            │
      OK)        │  proxy navigateur    │──▶ d'égress)  └────────────┘
                 └──────────────────────┘
                            │ égress Internet (DNS + HTTP sortant)
                            ▼
                    sites web demandés par l'app "Navigateur"
```

- Le **frontend** est le seul service publié sur le réseau `public` (mappé
  sur `FRONTEND_PORT`, `8080` par défaut). C'est vers ce port que doit
  pointer le reverse-proxy Nginx externe.
- Le **backend** vit sur le réseau `internal` (bridge Docker classique) : il
  n'est **jamais** exposé sur un port de l'hôte, mais garde un accès sortant
  à Internet (DNS + HTTP), indispensable pour que l'app "Navigateur" puisse
  aller chercher les pages demandées.
- **PostgreSQL** et **Redis** vivent sur un second réseau `data`
  (`internal: true`, sans passerelle du tout) : ils ne parlent qu'au backend
  et n'ont besoin d'aucun accès sortant.
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

### Mot de passe admin perdu / non reçu

La banniere de bootstrap ne s'affiche qu'a la toute premiere creation de la
base (elle est stockee dans le volume Docker `postgres-data`, qui survit a
un `docker compose down && up -d --build`). Si vous n'avez pas recupere le
mot de passe a temps, pas besoin de tout reinitialiser :

```bash
# Dans .env :
RESET_ADMIN_PASSWORD=true

docker compose up -d --build backend
docker compose logs backend | grep -A8 "ADMIN PASSWORD RESET"

# Remettre RESET_ADMIN_PASSWORD=false dans .env ensuite, sinon le mot de
# passe (et le secret TOTP) est regenere a chaque redemarrage du backend.
```

Configurez ensuite votre reverse-proxy Nginx externe (déjà en place, hors de
ce dépôt) pour terminer le TLS et faire suivre vers
`http://<hôte-debian>:${FRONTEND_PORT}` en transmettant
`X-Forwarded-For` / `X-Real-IP` / `X-Forwarded-Proto`.

## Authentification et leurre MFA

1. `POST /api/auth/login` vérifie le mot de passe (haché Argon2id). En cas
   de succès, un jeton `mfa_token` de courte durée est renvoyé.
2. L'écran de second facteur ressemble à une demande anodine de confirmation
   de date de naissance (`JJ/MM/AAAA`), avec insertion automatique de `/`
   tous les 2 chiffres pendant la frappe. Une fois les slashs retirés côté
   serveur, le résultat est un code TOTP standard à 6 chiffres, validé avec
   `pyotp` (compatible Aegis / Google Authenticator).
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

Les assets (CSS/images/fonts/**vidéo/audio**) transitent par
`GET /api/browser/asset`, avec la même protection SSRF, streaming et support
des requêtes `Range` (lecture/seek vidéo sans tout charger en mémoire, plafond
`BROWSER_PROXY_MAX_STREAM_BYTES`). Les formulaires `GET` et `POST` sont
proxifiés correctement (le formulaire de recherche Google, par exemple,
fonctionne : le champ caché `__wd_url` transporte la cible réelle puisqu'un
`<form method="get">` remplace toujours la query string de son `action` par
ses propres champs au moment de la soumission).

La fenêtre Navigateur gère plusieurs onglets indépendants (chacun garde son
HTML chargé quand on change d'onglet, avec un bouton recharger par onglet) et
une barre de favoris personnels (`/api/bookmarks`, avec icône personnalisable
par URL d'image).

### Mode complet (Chromium + VNC) - au cas par cas, zéro configuration côté client

Le mode texte n'exécute jamais de JavaScript : les sites qui en ont besoin
pour s'afficher (SPA modernes type Instagram, webmail avec skin JS...)
resteront cassés ou illisibles. Pour ces cas, chaque onglet a un bouton
**Mode texte / Mode complet** qui bascule vers un vrai Chromium isolé piloté
côté serveur (`backend/app/full_browser.py`), diffusé au navigateur du
client par VNC - le poste client n'a **rien à installer ni à configurer** :
il ouvre cette appli dans son navigateur habituel, comme n'importe quelle
autre page.

- Chaque onglet en mode complet obtient son **propre** trio Chromium +
  écran virtuel (`Xvfb`) + serveur VNC (`x11vnc`), lancés et détruits à la
  volée par le backend. C'est volontairement plus lourd qu'un seul
  Chromium partagé entre onglets : un flux VNC montre tout un écran, donc
  chaque onglet a besoin du sien pour que les fenêtres de différents
  utilisateurs (ou de différents onglets) ne se retrouvent jamais
  superposées dans le même flux. `x11vnc` n'écoute que sur `localhost` à
  l'intérieur du conteneur - rien n'est jamais exposé au-delà du WebSocket
  authentifié du backend (`/api/browser/full/ws`), qui relaie ses octets
  RFB tels quels, sans aucun protocole maison au-dessus.
- Chromium tourne en mode **normal** (pas headless) : plusieurs sites
  (Google en tête) détectent et bloquent activement Chromium headless
  ("this browser may not be secure"), et tourner en mode normal referme
  cet écart en plus des correctifs déjà posés (user-agent standard,
  `navigator.webdriver` masqué).
- Le flux vidéo, la souris, le clavier et le copier-coller passent tous par
  le protocole VNC standard (RFB), via [noVNC](https://novnc.com/) côté
  client - plus robuste qu'un protocole maison, avec un rafraîchissement
  qui ne pousse une image que quand l'écran change réellement.
  L'adresse/retour/suivant/recharger restent des boutons de la barre de
  l'appli (au-dessus du flux VNC), qui appellent le Chromium distant par
  une petite API REST dédiée.
- Chaque requête réseau de la page (documents, XHR, images...) passe par le
  même garde-fou anti-SSRF que le mode texte (`page.route` + `validate_url`).
- Ressources plafonnées : `FULL_BROWSER_MAX_SESSIONS` sessions (donc trios
  Chromium+Xvfb+x11vnc) simultanées au maximum, fermeture automatique après
  `FULL_BROWSER_IDLE_TIMEOUT_SECONDS` d'inactivité, `FULL_BROWSER_MAX_LIFETIME_SECONDS`
  au total, ou dès que l'onglet est fermé/repassé en mode texte côté client.
- **Compromis assumé** : chaque onglet en mode complet coûte un Chromium
  entier (~150-300 Mo de RAM), à multiplier par `FULL_BROWSER_MAX_SESSIONS`
  - surveillez la RAM/CPU du conteneur `backend` si vous l'augmentez sur une
  petite machine. Le mode complet est un mode d'appoint pour les sites qui
  ont vraiment besoin de JavaScript, pas le comportement par défaut.
  `FULL_BROWSER_ENABLED=false` le désactive entièrement, et rien n'est
  lancé pour un onglet tant qu'il ne passe pas explicitement en mode
  complet.

## Proxy SOCKS5 (bundled, optionnel) - pour un appareil que vous POUVEZ configurer

Le mode complet ci-dessus est la solution "zéro trace côté client" : aucun
réglage réseau à toucher sur l'appareil qui se connecte, juste ouvrir
l'appli dans un navigateur normal. Le proxy SOCKS5 décrit ici est
l'inverse : il exige de configurer manuellement le proxy sur l'appareil
client (voir plus bas), donc **ne convient pas** si vous ne voulez laisser
aucune trace de réglage sur cette machine - dans ce cas, restez sur le mode
complet. Il reste utile sur un appareil que vous possédez et pouvez
configurer librement (votre propre laptop, par exemple), quand vous voulez
la vitesse et la fidélité natives de votre propre navigateur plutôt qu'un
flux distant :

```bash
# Dans .env :
SOCKS5_USER=quelquechose
SOCKS5_PASSWORD=un-mot-de-passe-solide

docker compose --profile proxy up -d --build
```

Refuse de démarrer si `SOCKS5_USER`/`SOCKS5_PASSWORD` ne sont pas définis -
jamais un relais ouvert. Le port `SOCKS5_PORT` (1080 par défaut) est publié
sur l'hôte, comme le frontend - configurez ensuite n'importe quel appareil
du réseau local pour l'utiliser :

- **Firefox** : Paramètres → Général → Paramètres réseau → Configuration
  manuelle du proxy → Hôte SOCKS = IP de votre Debian, Port = 1080,
  SOCKS v5, cochez "Proxy DNS lors de l'utilisation de SOCKS v5" (sinon les
  requêtes DNS partent en clair depuis votre appareil au lieu de passer par
  le proxy).
- **Chrome/Chromium** (pas de réglage réseau natif équivalent) : via une
  extension comme "Proxy SwitchyOmega", ou en lançant Chrome avec
  `--proxy-server="socks5://<ip>:1080"`.
- **Système entier** (Linux/Windows/macOS) : réglages proxy SOCKS de l'OS -
  fait alors transiter tout le trafic réseau de l'appareil, pas seulement
  le navigateur.

**Différence avec le mode complet/texte** : ici c'est réellement VOTRE
navigateur qui s'exécute et rend les pages (vitesse et fidélité natives,
aucune limite de compatibilité JS) - seul le trafic réseau transite par le
Debian. Contrepartie : le site voit le vrai navigateur/OS de votre
appareil (pas un fingerprint générique), et JS s'exécute directement chez
vous plutôt que d'être tenu à distance dans un bac à sable - c'est un choix
different du mode texte/complet, pas strictement plus sécurisé, juste plus
rapide et plus fidèle. L'app "Navigateur" du bureau reste disponible à côté
pour un accès rapide depuis un appareil qu'on ne veut pas reconfigurer.

## Session persistante du bureau

À chaque déconnexion (et toutes les 45s en tâche de fond), l'état du bureau
est sauvegardé côté serveur par utilisateur (`PUT /api/desktop/state`) :
fenêtres ouvertes, position/taille, onglets du navigateur et leurs adresses,
fond d'écran, couleur d'accent, position des icônes. À la reconnexion
(`GET /api/desktop/state`), tout est restauré à l'identique. Le fond d'écran
et l'accent sont en plus sauvegardés immédiatement dès qu'on les change,
sans attendre le cycle de 45s.

### Connexions aux sites (Google, Instagram...) mémorisées

Le mode texte comme le mode complet mémorisent désormais vos cookies de
session par utilisateur (stockés en base, `app/browser_cookies.py` pour le
mode texte, `storage_state` Playwright par utilisateur pour le mode
complet) : se reconnecter à un site à chaque nouvel onglet ou après un
redémarrage du backend n'est plus nécessaire. "Effacer les cookies de
navigation" dans Paramètres → Système repart de zéro si un site reste
bloqué dans un état bizarre.

## Bureau et compte

- **Volet horloge** : cliquer sur l'heure dans la barre des tâches ouvre un
  mini calendrier du mois en cours, plus des raccourcis "Messagerie" /
  "Calendrier" vers les URL configurées dans Paramètres → Applications
  (par ex. le SnappyMail bundled), ouverts via le navigateur sécurisé.
- **Menu Démarrer → Paramètres** : onglets Compte (nom affiché, photo de
  profil uploadée via `POST /api/uploads`), Bureau (fond d'écran, couleur
  d'accent - qui teinte aussi les boutons du navigateur, pas juste la
  barre des tâches), **Applications** (liste façon Paramètres Windows :
  cliquer une app affiche ses réglages - changer son icône depuis la
  banque d'icônes, plus une section dédiée pour Messagerie/Calendrier
  (URL) et pour l'Explorateur de fichiers (icône par type de fichier :
  dossier, PDF, image, vidéo...)), Utilisateurs (admin uniquement),
  Système (état de l'API, accès rapide au dashboard sécurité pour les
  admins) et **À propos** (pas d'app dédiée pour ça : description de
  l'appli + génération d'un rapport de diagnostic - infos sur l'appareil,
  état complet du bureau (fenêtres/onglets/paramètres) et description du
  problème, téléchargeable en `.txt` ou envoyé par email via le SMTP déjà
  configuré pour les alertes de sécurité). Pratique à joindre quand vous
  me signalez un bug.
- **Banque d'icônes** : un jeu d'emoji prédéfinis ou une image uploadée,
  utilisable partout où une icône se choisit (icône d'app dans
  Paramètres → Applications, icône de raccourci de bureau, icône par
  type de fichier dans l'Explorateur) - un seul composant partagé
  (`IconPicker`), les icônes d'app changées dans Paramètres s'appliquent
  partout (menu Démarrer, barre des tâches, bureau) immédiatement.
- **Clic droit personnalisé** : bureau (actualiser, nouvelle fenêtre
  navigateur, nouveau raccourci, personnaliser), barre des tâches
  (restaurer/fermer une fenêtre), barre de titre des fenêtres
  (réduire/agrandir/fermer), favoris du navigateur (ouvrir/supprimer),
  explorateur de fichiers (télécharger/supprimer).
- **Raccourcis de bureau** : clic droit → "Nouveau raccourci" crée une icône
  vers un site web ou une application, en plus de l'icône Navigateur fixe.
  Persistés avec le reste de l'état du bureau. Les icônes se déplacent à la
  souris (glisser-déposer, position mémorisée) et leur icône peut être
  remplacée par une image (clic droit → "Changer l'icône...", upload via
  `POST /api/uploads`).
- **Personnalisation du fond d'écran** : en plus des dégradés prédéfinis,
  Paramètres → Bureau propose une couleur unie (sélecteur natif) ou une
  image personnelle uploadée.
- **Volet horloge avec agenda** : l'heure affichée inclut les secondes ; un
  petit calendrier du mois marque les jours ayant un événement, avec une
  liste "Événements à venir" et un formulaire d'ajout rapide
  (`/api/events`, CRUD minimal par utilisateur).

## Comptes multiples (admin uniquement)

Aucune inscription publique n'existe : seul un administrateur crée des
comptes, depuis Paramètres → Utilisateurs (`/api/admin/users`, protégé par
session admin). À la création, mot de passe (généré si laissé vide) et
secret TOTP sont affichés **une seule fois** - à transmettre à la personne
concernée hors bande. L'admin peut aussi promouvoir/rétrograder un compte,
réinitialiser un TOTP ou supprimer un compte (le dernier compte admin ne
peut ni être rétrogradé ni supprimé, pour ne jamais se retrouver sans accès
admin).

## Webmail SnappyMail (bundled, optionnel)

Un conteneur SnappyMail (successeur maintenu de Roundcube/Rainloop) est
inclus, **désactivé par défaut** (profil Docker Compose `webmail`) :

```bash
docker compose --profile webmail up -d --build
```

Contrairement à Roundcube, SnappyMail sait nativement gérer **plusieurs
vrais comptes IMAP sous un seul login**, sans infra d'agrégation
supplémentaire côté serveur : on se connecte une première fois avec un
compte mail réel, puis on ajoute les autres directement dans l'appli
(Paramètres → Comptes une fois connecté) - rien à configurer côté
webdesktop au-delà de l'URL.

- Première mise en route : ouvrez `http://<hôte>/?admin` (via le navigateur
  du bureau, proxifié comme n'importe quelle adresse) - identifiants par
  défaut `admin`/`admin`, **à changer immédiatement**. C'est là qu'on
  autorise les domaines IMAP/SMTP voulus (ou "n'importe quel domaine").
- Tourne sur le réseau `internal` uniquement - jamais exposé publiquement
  ni même sur l'hôte. Le proxy navigateur a une exception ciblée à son
  garde-fou anti-SSRF pour le seul hostname `snappymail`
  (`INTERNAL_PROXY_ALLOWLIST`).
- Configurez l'URL du webmail sur `http://snappymail` dans Paramètres →
  Applications (assez JS-dépendant, le mode complet donne un meilleur
  résultat que le mode texte - et grâce à la mémorisation des
  cookies/session, vous n'aurez plus à vous reconnecter à chaque fois).

## Explorateur de fichiers (local + SMB)

Une app "Explorateur de fichiers" (`/api/files/*`) avec deux sources :

- **Local** : espace personnel par utilisateur (`backend-userfiles` volume),
  isolé - chaque compte ne voit que son propre espace.
- **SMB** : un partage réseau unique, partagé entre tous les comptes (ex. un
  NAS à la maison), configuré via `SMB_HOST`/`SMB_SHARE`/`SMB_USERNAME`/
  `SMB_PASSWORD` dans `.env`. Non configuré = message explicite plutôt qu'une
  erreur, l'onglet SMB reste simplement inutilisable.

Chaque chemin envoyé par le client est validé pour interdire toute sortie du
répertoire autorisé (`../`, chemins absolus...), aussi bien côté local que
côté UNC pour le partage SMB.

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
│       ├── browser_ssrf.py     # Validation anti-SSRF (+ allowlist interne)
│       ├── full_browser.py     # Sessions mode complet (Chromium+Xvfb+x11vnc par onglet)
│       ├── init_db.py          # Bootstrap admin + migrations légères
│       └── routers/
│           ├── auth.py, admin.py, admin_users.py
│           ├── browser_proxy.py, full_browser.py
│           ├── bookmarks.py, events.py, files.py
│           ├── desktop.py      # état de session persistant
│           └── uploads.py      # avatars / icônes de favoris
└── frontend/
    ├── Dockerfile               # build Vite -> Nginx
    ├── nginx.conf               # sert le SPA + proxy /api -> backend:8000 (+ WS)
    └── src/
        ├── api/client.ts
        ├── state/
        │   ├── authStore.ts, windowStore.ts, browserStore.ts
        │   ├── settingsStore.ts, bookmarksStore.ts, contextMenuStore.ts
        │   ├── eventsStore.ts, adminUsersStore.ts, desktopItemsStore.ts
        │   └── persistence.ts      # save/restore de l'état du bureau
        ├── components/
        │   ├── Login/{LoginForm,MfaDecoyForm}.tsx
        │   ├── Desktop/{Desktop,Taskbar,StartMenu,ClockFlyout,ContextMenu,
        │   │            NewShortcutForm,Window,WindowManager}.tsx
        │   └── Apps/{BrowserApp(+RemoteFrame),SecurityDashboard,Settings(+UsersPanel),
        │             FileExplorer}/
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

## Débloquer un compte/une IP verrouillé(e)

Le dashboard de sécurité ne peut pas aider ici puisqu'il faut déjà être
connecté en admin pour y accéder. En cas de verrouillage (vous y compris),
une petite CLI agit directement sur Redis, à lancer dans le conteneur :

```bash
# Voir les blocages actifs (et, si besoin, les écrire dans un fichier à consulter/emporter)
docker compose exec backend python -m app.cli locks
docker compose exec backend python -m app.cli locks --write /app/locked_accounts.txt
docker compose exec backend cat /app/locked_accounts.txt   # si vous avez utilisé --write

# Débloquer une IP ou un compte précis
docker compose exec backend python -m app.cli unlock ip 203.0.113.5
docker compose exec backend python -m app.cli unlock user admin

# Ou tout débloquer d'un coup (IP + comptes + fenêtres de limitation)
docker compose exec backend python -m app.cli unlock-all
```

Solution de secours encore plus directe (vide tout Redis, sans distinction) :

```bash
docker compose exec redis redis-cli FLUSHALL
```

## Mise à jour automatique (opt-in, donne un accès root à l'hôte)

Un bouton "Sauvegarder et mettre à jour" dans Paramètres → Système (admin
uniquement) vérifie GitHub, sauvegarde la base + les fichiers, puis
reconstruit et redémarre toute la stack. **Désactivé par défaut** et il doit
le rester tant que vous n'avez pas conscience de ce qu'il implique :

- Activé (`SELF_UPDATE_ENABLED=true` + `docker-compose.selfupdate.yml`), le
  backend obtient l'accès au socket Docker de l'hôte - un contrôle
  équivalent à root sur la machine. C'est nécessaire pour qu'il puisse
  lancer `git pull` + `docker compose up -d --build` sur le vrai
  répertoire du projet, mais ça reste un changement de surface de sécurité
  important pour une appli par ailleurs pensée pour être cloisonnée.
- Pour l'activer :
  ```bash
  # Dans .env :
  SELF_UPDATE_ENABLED=true
  UPDATE_GITHUB_REPO=owner/repo
  HOST_PROJECT_DIR=/chemin/absolu/reel/vers/ce/dossier/sur/l-hote

  docker compose -f docker-compose.yml -f docker-compose.selfupdate.yml up -d --build
  ```
- Le vrai travail (sauvegarde, `git pull`, rebuild) se déroule dans un
  conteneur jetable lancé à la volée (`docker run -d --rm docker:cli ...`),
  pas dans le backend lui-même - sinon reconstruire le backend tuerait le
  script qui pilote la mise à jour en plein milieu. Le statut de la
  dernière tentative est visible dans le même panneau.
- Sauvegardes déposées dans le volume `backend-backups` (dump SQL Postgres
  + archive des fichiers utilisateurs), à chaque mise à jour.

## Notes de sécurité

- Aucune gestion TLS dans l'application : c'est la responsabilité du
  reverse-proxy Nginx externe.
- `TRUSTED_PROXY_HOPS` doit correspondre exactement au nombre de proxies HTTP
  entre l'utilisateur et le backend (2 par défaut : Nginx externe + Nginx du
  conteneur frontend), sinon la restriction LAN du dashboard peut être
  contournée ou, à l'inverse, bloquer des IP légitimes.
- Changez impérativement `SECRET_KEY` et les mots de passe PostgreSQL/SMTP
  dans `.env` avant tout déploiement réel.
- Le backend a besoin d'un accès Internet sortant (DNS + HTTP) pour l'app
  Navigateur : ne remettez jamais le réseau `internal` en `internal: true`
  sans garder un second réseau dédié pour la base de données/Redis, sous
  peine de retomber sur `Temporary failure in name resolution`.
- Les avatars et icônes de favoris uploadés sont stockés dans le volume
  `backend-uploads` (`/app/uploads`), séparé du reste pour survivre aux
  reconstructions d'image. Les fichiers personnels vivent dans
  `backend-userfiles` (`/app/userfiles`), également persistant.
- Le mode complet ouvre un vrai Chromium (+ son propre Xvfb/x11vnc) par
  onglet : gardez `FULL_BROWSER_MAX_SESSIONS` raisonnable sur une petite
  machine, et surveillez la RAM/CPU du conteneur `backend` si vous
  l'augmentez pour plusieurs comptes en parallèle.
- `INTERNAL_PROXY_ALLOWLIST` est une liste blanche exacte de hostnames
  (par défaut juste `snappymail`) : n'y ajoutez que des services de
  confiance que vous avez vous-même déployés sur le réseau `internal`,
  jamais un nom dérivé d'une entrée utilisateur.
- Le proxy SOCKS5 (profil `proxy`) publie un port sur l'hôte, comme le
  frontend : n'importe qui pouvant atteindre ce port ET connaissant
  `SOCKS5_USER`/`SOCKS5_PASSWORD` peut faire sortir du trafic par ce Debian
  - gardez ce mot de passe aussi solide que les autres secrets de `.env`.
