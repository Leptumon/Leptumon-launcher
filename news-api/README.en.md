# News API

[Français](README.md) · **English**

The small server behind the launcher's News panel: a public feed the launcher reads, and an admin page to publish, edit and delete articles with an image and a link.

## Two ways to publish news

The launcher reads a single address: `news.url` in [`launcher/src/assets/client-config.json`](../launcher/src/assets/client-config.json). That address just has to return `{ "news": [...] }`.

| Option | What you need | `news.url` value |
| ------ | ------------- | ---------------- |
| This server, on your machine (recommended) | Docker, or Node.js 20.12 or newer, and a domain with HTTPS. You publish from an admin page. | `https://<your domain>/v1/public/news` |
| A static file | Any web host. You edit a `news.json` file by hand. | `https://<your site>/news.json` |

`news.url` is built into the launcher, so changing it takes a new launcher release that players have to install. Pick an address that won't move, such as a dedicated subdomain (`news.your-domain.com`): if the server ever changes machines, only the DNS needs updating.

When `news.url` is empty, the launcher shows no News panel.

## Running the server

Pick the case that matches your server. Either way, keep the admin token to yourself: it unlocks the admin page.

### Case 1: a Linux server with no website (simplest)

Docker runs the news server plus Caddy, which gets and renews the HTTPS certificate on its own. Ports 80 and 443 on the server must be free.

1. At your domain provider, create a DNS A record for a subdomain (for example `news.your-domain.com`) pointing at the server's IP address.
2. Install Docker on the server: <https://docs.docker.com/engine/install/>.
3. Copy the `news-api/` folder to the server, then:

   ```bash
   cd news-api
   cp .env.example .env
   nano .env    # NEWS_ADMIN_TOKEN (see below) and DOMAIN=news.your-domain.com
   docker compose --profile https up -d --build
   ```

4. Open `https://news.your-domain.com/admin/` and sign in with the token.

The `news.url` value is then `https://news.your-domain.com/v1/public/news`. The admin page shows it too, with a button to copy it.

### Case 2: the server already runs nginx (or another web server)

```bash
cd news-api
cp .env.example .env
nano .env    # NEWS_ADMIN_TOKEN and PUBLIC_URL
docker compose up -d --build
```

The news server then listens on `127.0.0.1:8787`, reachable only from the machine itself. Add one of the two blocks from [`deploy/nginx.conf.example`](deploy/nginx.conf.example) to your nginx:

- under a path of an existing site, for example `https://your-domain.com/news/`
- on its own subdomain, for example `https://news.your-domain.com`

### Case 3: without Docker

You need Node.js 20.12 or newer.

```bash
cd news-api
npm ci --omit=dev
cp .env.example .env
nano .env    # NEWS_ADMIN_TOKEN and PUBLIC_URL
npm start
```

To start it with the machine, a ready-made systemd unit is in [`deploy/leptumon-news.service`](deploy/leptumon-news.service). Put it behind nginx as in case 2.

### Updating

Replace the files in `news-api/` with the new version (leave `.env` alone), then run the same `docker compose ... up -d --build` command again, or `npm ci --omit=dev` and a restart without Docker. Articles and images are kept.

### Settings

Everything is set in `.env` (template: [`.env.example`](.env.example)).

| Variable | Purpose |
| -------- | ------- |
| `NEWS_ADMIN_TOKEN` | Required. The admin page password, at least 24 characters. To generate one: `openssl rand -base64 32` |
| `DOMAIN` | Case 1 only. The subdomain pointing at the server, without `https://`. |
| `PUBLIC_URL` | The server's public address, without a trailing `/`. Used for links to uploaded images. Optional on a dedicated subdomain, required under a path (`https://your-domain.com/news`). |
| `TRUST_PROXY` | `1` behind a reverse proxy (the normal setup, and what Docker always uses). Empty only if visitors reach the server directly. |
| `MAX_IMAGE_MB` | Largest image upload. Defaults to 5 MB. |
| `HOST`, `PORT`, `DATA_DIR` | Without Docker only: where to listen (defaults to `127.0.0.1:8787`) and where to store data (defaults to `./data`). |

## Publishing news

Open `<server address>/admin/` and paste the token. The FR / EN toggle at the top of the page switches the language and remembers it; until then, the page follows the browser language. It also shows the exact address to put in `news.url`.

For each article:

- **Title** (120 characters at most).
- **Text**: plain text. Line breaks are kept in the launcher; there is no formatting.
- **Image** (optional): upload a PNG, JPEG, WebP or GIF file, or paste an `https://` address. Landscape (16:9) works best: the image is the card background and shows at the top of the article.
- **Link** (optional): an `https://` address. The launcher then adds an "Open link" button under the article.

The launcher shows the latest news it knows straight away, then checks for new articles when the home screen opens and every ten minutes. A new article therefore reaches players within ten minutes, or at the next launcher start.

## Without a server: a plain file

Start from [`news.example.json`](news.example.json), edit it and put it online anywhere with HTTPS (your website, GitHub Pages...).

| Field | Required | Notes |
| ----- | -------- | ----- |
| `id` | No | A unique id per article |
| `title` | Yes | Articles without a title are skipped |
| `description` | No | Plain text, `\n` for a line break |
| `image` | No | An `https://` address, or a path relative to the file (`images/event.png`) |
| `url` | No | `https://` address for the "Open link" button |
| `created_at` | No | ISO date (`2026-09-19T10:00:00Z`). If every article has one, the newest comes first; otherwise the file order is kept. |

The launcher shows the first 20 articles.

## API

| Request | Purpose |
| ------- | ------- |
| `GET /v1/public/news` | The feed the launcher reads: `{ "news": [...] }`, newest first |
| `GET /v1/public/news/:id` | One article |
| `GET /v1/admin/news` | The list, with image values as stored |
| `POST /v1/admin/news` | Create an article: `{ title, description, image?, url? }` |
| `PUT /v1/admin/news/:id` | Edit an article (only the fields sent) |
| `DELETE /v1/admin/news/:id` | Delete an article (and its uploaded image once nothing uses it) |
| `POST /v1/admin/images` | Upload an image (the raw file as the request body, type `image/png`, `image/jpeg`, `image/webp` or `image/gif`) |
| `GET /admin/` | The admin page |
| `GET /healthz` | Checks the server is up |

`/v1/admin/...` requests need the `Authorization: Bearer <NEWS_ADMIN_TOKEN>` header. The public feed accepts requests from any site (open CORS), so a website can show the same news.

## Backups

Everything lives in `DATA_DIR`: `news.json` (the articles) and `uploads/` (uploaded images). `news.json` is itself a valid feed: it can be put online as-is as a static file.

- Without Docker: copy the `data/` folder.
- With Docker: `docker compose cp news:/data ./backup`.

To restore or move, put those files back in `DATA_DIR` before starting the server.

## Security

- The token is compared in constant time. After 10 failed attempts, an address has to wait 15 minutes.
- Images are checked by their content, not their name. SVG is refused.
- The admin page never inserts HTML from articles and only allows its own scripts.
- The launcher shows articles as plain text, only loads images over HTTPS and only opens `https://` links, from the main process.
- Keep the server behind HTTPS: the token is sent with every admin request.

## Tests

```bash
npm test
```
