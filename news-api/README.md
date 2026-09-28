# API des actualités

**Français** · [English](README.en.md)

Le petit serveur derrière le panneau Actualités du launcher : un flux public que le launcher lit, et une page d'administration pour publier, modifier et supprimer des articles avec une image et un lien.

## Deux façons de publier des actualités

Le launcher ne lit qu'une seule adresse : `news.url` dans [`launcher/src/assets/client-config.json`](../launcher/src/assets/client-config.json). Il suffit que cette adresse renvoie `{ "news": [...] }`.

| Option | Ce qu'il faut | Valeur de `news.url` |
| ------ | ------------- | -------------------- |
| Ce serveur, sur votre machine (conseillé) | Docker, ou Node.js 20.12 ou plus récent, et un nom de domaine en HTTPS. Vous publiez depuis une page d'administration. | `https://<votre domaine>/v1/public/news` |
| Un fichier statique | N'importe quel hébergement web. Vous modifiez un fichier `news.json` à la main. | `https://<votre site>/news.json` |

`news.url` est intégré au launcher : le changer demande une nouvelle version du launcher, que les joueurs doivent installer. Choisissez donc une adresse qui ne bougera pas, par exemple un sous-domaine dédié (`actus.votre-domaine.fr`) : si le serveur change de machine un jour, il suffira de modifier le DNS.

Quand `news.url` est vide, le launcher n'affiche pas de panneau Actualités.

## Lancer le serveur

Choisissez le cas qui correspond à votre serveur. Dans tous les cas, gardez le jeton d'administration pour vous : il donne accès à la page d'administration.

### Cas 1 : serveur Linux sans site web (le plus simple)

Docker lance le serveur des actualités et Caddy, qui obtient et renouvelle tout seul le certificat HTTPS. Il faut que les ports 80 et 443 du serveur soient libres.

1. Chez votre fournisseur de nom de domaine, créez un enregistrement DNS de type A pour un sous-domaine (par exemple `actus.leptunia.fr`) qui pointe vers l'adresse IP du serveur.
2. Installez Docker sur le serveur : <https://docs.docker.com/engine/install/>.
3. Copiez le dossier `news-api/` sur le serveur, puis :

   ```bash
   cd news-api
   cp .env.example .env
   nano .env    # NEWS_ADMIN_TOKEN (voir plus bas) et DOMAIN=actus.leptunia.fr
   docker compose --profile https up -d --build
   ```

4. Ouvrez `https://actus.leptunia.fr/admin/` et connectez-vous avec le jeton.

L'adresse à mettre dans `news.url` est alors `https://actus.leptunia.fr/v1/public/news`. La page d'administration l'affiche aussi, avec un bouton pour la copier.

### Cas 2 : le serveur a déjà nginx (ou un autre serveur web)

```bash
cd news-api
cp .env.example .env
nano .env    # NEWS_ADMIN_TOKEN et PUBLIC_URL
docker compose up -d --build
```

Le serveur des actualités écoute alors sur `127.0.0.1:8787`, joignable seulement depuis la machine. Ajoutez un des deux blocs de [`deploy/nginx.conf.example`](deploy/nginx.conf.example) à votre nginx :

- sous un chemin d'un site existant, par exemple `https://leptunia.fr/news/`
- sur son propre sous-domaine, par exemple `https://actus.leptunia.fr`

### Cas 3 : sans Docker

Il faut Node.js 20.12 ou plus récent.

```bash
cd news-api
npm ci --omit=dev
cp .env.example .env
nano .env    # NEWS_ADMIN_TOKEN et PUBLIC_URL
npm start
```

Pour qu'il démarre avec la machine, un service systemd prêt à l'emploi se trouve dans [`deploy/leptumon-news.service`](deploy/leptumon-news.service). Placez-le derrière nginx comme dans le cas 2.

### Mettre à jour

Remplacez les fichiers du dossier `news-api/` par la nouvelle version (sans toucher à `.env`), puis relancez la même commande `docker compose ... up -d --build`, ou `npm ci --omit=dev` puis un redémarrage sans Docker. Les articles et les images sont conservés.

### Réglages

Tout se règle dans `.env` (modèle : [`.env.example`](.env.example)).

| Variable | Rôle |
| -------- | ---- |
| `NEWS_ADMIN_TOKEN` | Obligatoire. Le mot de passe de la page d'administration, 24 caractères minimum. Pour en générer un : `openssl rand -base64 32` |
| `DOMAIN` | Cas 1 seulement. Le sous-domaine qui pointe vers le serveur, sans `https://`. |
| `PUBLIC_URL` | L'adresse publique du serveur, sans `/` final. Sert aux liens des images importées. Facultative sur un sous-domaine dédié, obligatoire sous un chemin (`https://leptunia.fr/news`). |
| `TRUST_PROXY` | `1` derrière un reverse proxy (le cas normal, et la valeur imposée par Docker). Vide seulement si les visiteurs arrivent directement sur le serveur. |
| `MAX_IMAGE_MB` | Taille maximale d'une image importée. Par défaut 5 Mo. |
| `HOST`, `PORT`, `DATA_DIR` | Sans Docker seulement : où écouter (par défaut `127.0.0.1:8787`) et où ranger les données (par défaut `./data`). |

## Publier des actualités

Ouvrez `<adresse du serveur>/admin/` et collez le jeton. Le bouton FR / EN en haut de la page change la langue et s'en souvient ; au départ, la page suit la langue du navigateur. Elle affiche aussi l'adresse exacte à mettre dans `news.url`.

Pour chaque article :

- **Titre** (120 caractères maximum).
- **Texte** : du texte simple. Les retours à la ligne sont conservés dans le launcher ; il n'y a pas de mise en forme.
- **Image** (facultative) : importez un fichier PNG, JPEG, WebP ou GIF, ou collez une adresse `https://`. Un format paysage (16:9) rend le mieux : l'image sert de fond à la carte et s'affiche en haut de l'article.
- **Lien** (facultatif) : une adresse `https://`. Le launcher ajoute alors un bouton « Ouvrir le lien » sous l'article.

Le launcher affiche tout de suite les dernières actualités qu'il connaît, puis vérifie s'il y en a de nouvelles quand l'accueil s'ouvre et toutes les dix minutes. Un nouvel article apparaît donc chez les joueurs en dix minutes au plus, ou au prochain démarrage.

## Sans serveur : un simple fichier

Partez de [`news.example.json`](news.example.json), modifiez-le et mettez-le en ligne n'importe où en HTTPS (votre site, GitHub Pages...).

| Champ | Obligatoire | Notes |
| ----- | ----------- | ----- |
| `id` | Non | Un identifiant unique par article |
| `title` | Oui | Les articles sans titre sont ignorés |
| `description` | Non | Texte simple, `\n` pour aller à la ligne |
| `image` | Non | Adresse `https://`, ou un chemin relatif au fichier (`images/evenement.png`) |
| `url` | Non | Adresse `https://` du bouton « Ouvrir le lien » |
| `created_at` | Non | Date ISO (`2026-09-19T10:00:00Z`). Si tous les articles en ont une, le plus récent passe en premier ; sinon l'ordre du fichier est gardé. |

Le launcher affiche les 20 premiers articles.

## API

| Requête | Rôle |
| ------- | ---- |
| `GET /v1/public/news` | Le flux lu par le launcher : `{ "news": [...] }`, le plus récent en premier |
| `GET /v1/public/news/:id` | Un article |
| `GET /v1/admin/news` | La liste, avec les valeurs d'image telles qu'enregistrées |
| `POST /v1/admin/news` | Crée un article : `{ title, description, image?, url? }` |
| `PUT /v1/admin/news/:id` | Modifie un article (seulement les champs envoyés) |
| `DELETE /v1/admin/news/:id` | Supprime un article (et son image importée si plus rien ne l'utilise) |
| `POST /v1/admin/images` | Importe une image (le fichier brut en corps de requête, type `image/png`, `image/jpeg`, `image/webp` ou `image/gif`) |
| `GET /admin/` | La page d'administration |
| `GET /healthz` | Vérification que le serveur tourne |

Les requêtes `/v1/admin/...` demandent l'en-tête `Authorization: Bearer <NEWS_ADMIN_TOKEN>`. Le flux public accepte les requêtes de n'importe quel site (CORS ouvert), pour pouvoir afficher les mêmes actualités sur un site web.

## Sauvegardes

Tout se trouve dans `DATA_DIR` : `news.json` (les articles) et `uploads/` (les images importées). `news.json` est lui-même un flux valide : on peut le mettre en ligne tel quel comme fichier statique.

- Sans Docker : copiez le dossier `data/`.
- Avec Docker : `docker compose cp news:/data ./sauvegarde`.

Pour restaurer ou déménager, remettez ces fichiers dans `DATA_DIR` avant de démarrer le serveur.

## Sécurité

- Le jeton est comparé en temps constant. Après 10 essais ratés, une adresse doit attendre 15 minutes.
- Les images sont vérifiées d'après leur contenu, pas leur nom. Le SVG est refusé.
- La page d'administration n'insère jamais de HTML venant des articles et n'autorise que ses propres scripts.
- Le launcher affiche les articles en texte simple, ne charge les images qu'en HTTPS et n'ouvre que des liens `https://`, depuis le processus principal.
- Gardez le serveur derrière HTTPS : le jeton part avec chaque requête d'administration.

## Tests

```bash
npm test
```
