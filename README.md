# Leptumon Launcher

**Français** · [English](README.en.md)

Le launcher officiel de **Leptumon**, un serveur Minecraft communautaire et détendu qui tourne sous **All the Mons** (Cobblemon + All the Mods) en Minecraft 1.21.1 avec NeoForge. Il est développé avec Electron, React et TypeScript.

- Organisation du code : [`launcher/ARCHITECTURE.md`](launcher/ARCHITECTURE.md)
- Logo et éléments graphiques : [`branding/README.md`](branding/README.md)

## Ce qu'il fait

- L'identité Leptumon partout : logo, icônes de l'application, fond d'écran et écran de chargement de l'installateur Windows.
- 11 langues : français, anglais, allemand, espagnol, polonais, portugais (Brésil), russe, turc, hindi, japonais et chinois simplifié. Au premier lancement, il suit la langue du système et passe en français si elle n'est pas disponible. Les joueurs peuvent la changer dans les Paramètres.
- Connexion avec un compte Microsoft, avec une vérification que le compte possède bien Minecraft.
- Installation en un clic. Jouer installe All the Mons depuis le manifeste hébergé (CurseForge sert de solution de secours), puis NeoForge, Minecraft et un environnement Java. Les joueurs n'ont rien à installer eux-mêmes.
- Des mises à jour sans réinstaller :
  - Modpack : il suffit de publier un nouveau manifeste, et les joueurs passent à la nouvelle version au prochain clic sur Jouer. Pas besoin de sortir une nouvelle version du launcher.
  - Launcher : quand un dépôt de versions est configuré, il vérifie les GitHub Releases au démarrage, télécharge les nouvelles versions en arrière-plan et propose de redémarrer. C'est désactivé pour l'instant.
- Un curseur de RAM avec des préréglages et une recommandation adaptée à la machine du joueur (6 Go minimum, 8 Go par défaut), plus un champ pour des arguments JVM personnalisés.
- Les infos du serveur en direct sur l'accueil : statut en ligne et nombre de joueurs, avec le MOTD au survol.
- Jouer connecte directement au serveur depuis l'écran titre (Quick Play) et le garde en tête de la liste multijoueur.
- Un panneau Actualités à côté de la carte de lancement, avec des cartes illustrées et l'article complet au clic. Les articles viennent du flux de votre choix (voir [Actualités](#actualités)) ; sans flux, le panneau reste masqué.
- Liens Discord et Boutique dans la barre latérale.
- Coins de fenêtre arrondis sous Windows et Linux (macOS garde les siens).
- Fonctionne sous Windows, macOS (Intel et Apple Silicon) et Linux.

## Valeurs de configuration

Tout se trouve dans [`launcher/src/assets/client-config.json`](launcher/src/assets/client-config.json).

| Valeur | Clé | État |
| ------ | --- | ---- |
| ID client Microsoft Azure | `microsoftClientId` | Renseigné. L'application Azure doit accepter les comptes Microsoft personnels, utiliser l'URI de redirection `http://localhost:59016/auth/callback` et être approuvée pour l'API des services Minecraft. |
| URL du manifeste du pack | `modpack.manifestUrl` | Renseignée : `https://leptumon.voxelith.dev/manifest.json` (hébergée derrière Cloudflare). |
| Clé API CurseForge | `curseforge.apiKey` | Facultative. Utilisée seulement si `modpack.manifestUrl` est vide. Une clé demande une candidature approuvée sur <https://console.curseforge.com>. |
| Version d'All the Mons | `curseforge.fileId` | Renseignée : `8822048` (All the Mons 1.3.0). Pour la changer, prenez le nombre à la fin de l'URL CurseForge de la version (`.../all-the-mons/files/<fileId>`). Le launcher ne choisit jamais « la dernière » tout seul. |
| Adresse du serveur | `server.address` | Renseignée : `leptunia.fr` (port par défaut 25565). |
| Flux d'actualités | `news.url` | Vide, donc le panneau Actualités est masqué. À renseigner avec l'adresse du flux une fois le serveur des actualités en ligne (voir [Actualités](#actualités)). |
| Dépôt des versions | `updates.githubRepo` | Vide, donc la mise à jour automatique du launcher est désactivée. Pour l'activer, indiquez le `propriétaire/dépôt` du dépôt GitHub public où le workflow publie les versions. |

L'ID du projet CurseForge d'All the Mons (`1356598`) est déjà renseigné.

## Configuration

`client-config.json` est intégré à chaque build, les joueurs ne peuvent donc pas le modifier. Pour le changer, il faut publier une nouvelle version, que les installations existantes récupèrent via la mise à jour automatique une fois celle-ci activée.

```json
{
  "microsoftClientId": "ac0cda15-bdc4-4e19-88bf-b1c884a0e8f7",
  "modpack": { "manifestUrl": "https://leptumon.voxelith.dev/manifest.json" },
  "curseforge": { "apiKey": "", "projectId": 1356598, "fileId": 8822048 },
  "server": { "name": "Leptumon", "address": "leptunia.fr" },
  "links": {
    "discord": "https://discord.com/invite/s5yxVPfJGE",
    "store": "https://leptumon-webshop.tebex.io/"
  },
  "news": { "url": "" },
  "updates": { "githubRepo": "" }
}
```

| Clé | À quoi elle sert |
| --- | ---------------- |
| `microsoftClientId` | L'application OAuth Azure utilisée pour la connexion Microsoft |
| `modpack.manifestUrl` | Le manifeste hébergé du pack. S'il est renseigné, le launcher installe à partir de lui et ignore `curseforge` |
| `curseforge.apiKey` | Clé de l'API CurseForge Core |
| `curseforge.projectId` | Le projet du modpack (All the Mons) |
| `curseforge.fileId` | La version exacte du modpack à installer. Les versions de Minecraft et de NeoForge viennent de cette version. |
| `server.name` | Nom affiché sur l'accueil et dans la liste multijoueur |
| `server.address` | Serveur interrogé pour le statut en direct et rejoint au clic sur Jouer (les enregistrements SRV `_minecraft._tcp` sont pris en charge) |
| `links.discord` / `links.store` | Les boutons Discord et Boutique de la barre latérale. Ce sont les seules URL que le launcher peut ouvrir. |
| `news.url` | Le flux du panneau Actualités : `/v1/public/news` de l'API des actualités, ou un `news.json` statique. Vide, le panneau est masqué. Seules les adresses `https://` sont acceptées. |
| `updates.githubRepo` | L'endroit où les versions du launcher sont publiées |

Les réglages des joueurs (RAM, arguments JVM, connexion automatique, réduction pendant la partie, langue, compte) sont enregistrés en local avec `electron-store`.

## Ce qui se passe quand on clique sur Jouer

`launcher/src/main/launchPipeline.ts` enchaîne ces étapes :

1. Modpack : synchronise le manifeste hébergé, ou la version CurseForge configurée s'il n'y a pas de manifeste (`core/modpack/`).
2. Java : télécharge la version de Java dont cette version de Minecraft a besoin (`core/engine/java/`).
3. NeoForge : lance l'installateur officiel sans fenêtre (`core/engine/downloader/modloader/neoforge.ts`).
4. Serveur : épingle le serveur dans `servers.dat` et prépare la connexion Quick Play.
5. Connexion : renouvelle la session Microsoft et obtient un jeton Minecraft.
6. Lancement : vérifie les fichiers de Minecraft et démarre le jeu.

Le dossier du jeu se trouve dans le dossier de données du launcher :

```text
minecraft/instances/Leptumon/minecraft
```

### Manifeste hébergé

Le launcher installe le pack à partir d'un `manifest.json` que vous hébergez, donc pas besoin de clé API CurseForge. Le manifeste liste les versions de Minecraft et de NeoForge, ainsi que l'URL, le SHA-1 et la taille de chaque fichier.

Pour publier une version du pack :

1. Importez le pack dans Prism Launcher ou l'application CurseForge. Évitez de le lancer, pour qu'aucun fichier créé pendant le jeu ne se retrouve dans le pack.
2. Générez le manifeste :

   ```bash
   cd launcher
   node scripts/generate-pack-manifest.mjs \
     --instance "<chemin du dossier de l'instance>" \
     --base-url https://<votre hébergeur de fichiers>/leptumon \
     --version 1.3.0
   ```

   Les jars déjà hébergés par Modrinth pointent vers le CDN de Modrinth. Tout le reste est copié dans `pack-dist/objects/`, et les mods auto-hébergés sont listés dans `pack-dist/self-hosted-mods.txt`. Les versions de Minecraft et du loader sont lues depuis l'instance ; `--minecraft` et `--loader neoforge-<version>` permettent de les forcer.
3. Envoyez `pack-dist/` à l'URL de base en gardant l'arborescence. Envoyez `objects/` d'abord et `manifest.json` en dernier, pour que les joueurs ne reçoivent jamais un manifeste qui pointe vers des fichiers pas encore en ligne. Servez `manifest.json` avec un cache court. Les objets sont nommés d'après leur contenu, alors laissez les anciens en ligne ; une nouvelle version ne fait qu'ajouter des fichiers.
4. La première fois seulement : mettez `<url-de-base>/manifest.json` dans `modpack.manifestUrl` et faites un build du launcher.

Le générateur ignore les mondes, les logs, les captures d'écran, les fichiers cachés et `.disabled`, ainsi que les métadonnées de l'instance. `options.txt` n'est installé que s'il est absent, pour que les joueurs gardent leurs réglages de jeu d'une mise à jour à l'autre.

### Installation et mises à jour du modpack

Avec le manifeste hébergé (état dans `.leptumon/manifest-state.json`) :

- Le manifeste est récupéré à chaque clic sur Jouer. S'il n'a pas changé, seuls les fichiers manquants ou de mauvaise taille sont retéléchargés, donc le lancement reste rapide et les modifications de config sont conservées.
- S'il a changé, les fichiers nouveaux ou modifiés sont téléchargés et vérifiés. Les fichiers retirés du pack sont supprimés de `mods/`, `resourcepacks/` et `shaderpacks/`. Ailleurs, ils ne sont supprimés que si le joueur ne les a jamais modifiés.
- Si l'hébergeur est injoignable, les joueurs qui ont déjà le pack peuvent quand même jouer. Seule une première installation échoue.

Avec CurseForge (état dans `.leptumon/modpack.json`), utilisé quand `modpack.manifestUrl` est vide :

- La version installée est notée dans `.leptumon/modpack.json`, dans le dossier du jeu. Si elle correspond à `curseforge.fileId`, Jouer ne contacte pas CurseForge du tout.
- Quand `fileId` change, le launcher :
  1. télécharge les mods, resource packs et shader packs du nouveau pack
  2. applique ses overrides (configs, quêtes, scripts)
  3. supprime les fichiers installés par l'ancienne version que la nouvelle n'utilise plus

  Les mondes, les captures d'écran et les mods ajoutés par les joueurs ne sont pas touchés.
- Les auteurs de mods peuvent bloquer les téléchargements tiers sur CurseForge. Aucun launcher tiers n'a le droit de télécharger ces fichiers, donc l'installation s'arrête et le log les liste. Vérifiez ce point avant de choisir une version du pack.

### Mise à jour automatique du launcher

Active uniquement quand `updates.githubRepo` est renseigné.

- Windows : lance le `Setup.exe` Squirrel de la version, qui met à jour sur place et relance le launcher.
- macOS : remplace l'`.app` par celle du zip de la version et relance. L'application doit se trouver dans un dossier modifiable comme `/Applications`, pas être lancée depuis le DMG. Les builds ne sont pas signés, donc le tout premier lancement demande un clic droit, puis Ouvrir.
- Linux : ouvre la page de la version, car les mises à jour `.deb` et `.rpm` passent par le gestionnaire de paquets.
- La mise à jour cherche les noms de fichiers produits par [`.github/workflows/release.yml`](.github/workflows/release.yml). Les tags doivent suivre le semver (`v1.0.1`) et correspondre à `version` dans `launcher/package.json`.
- Elle ne redémarre jamais pendant que le jeu tourne.

## Actualités

Le panneau Actualités de l'accueil affiche les articles du flux indiqué dans `news.url`. Le launcher garde le dernier flux reçu sur le disque : les actualités s'affichent tout de suite au démarrage, même hors ligne, puis se mettent à jour en arrière-plan. Les articles sont du texte simple, avec une image et un lien facultatifs.

Le flux vient du dossier [`news-api/`](news-api/README.md), à faire tourner sur votre serveur (Docker ou Node.js) : il fournit le flux et une page d'administration pour publier les articles. Sans serveur, un simple `news.json` modifié à la main et mis en ligne n'importe où fonctionne aussi.

| Option | `news.url` |
| ------ | ---------- |
| `news-api/` sur votre serveur | `https://<votre domaine>/v1/public/news` |
| Fichier statique | `https://<votre site>/news.json` |

Comme `news.url` est intégré au build, choisissez une adresse stable, par exemple un sous-domaine dédié.

## Organisation du dépôt

```text
.
├── launcher/                 Application Electron
│   ├── src/
│   │   ├── index.ts              Démarrage du processus principal
│   │   ├── main/                 Fenêtre, IPC, réglages, étapes de lancement, mises à jour
│   │   ├── core/
│   │   │   ├── auth/microsoft/   Connexion OAuth et serveur de retour local
│   │   │   ├── modpack/          Client CurseForge et installateur du modpack
│   │   │   ├── server/           Ping du serveur, MOTD, servers.dat
│   │   │   ├── engine/           Java, NeoForge/Fabric, téléchargement et lancement de Minecraft
│   │   │   └── utils/            Config, logs, erreurs
│   │   ├── renderer.tsx          Point d'entrée React
│   │   ├── preload.ts            Pont entre la page et le processus principal
│   │   ├── views/ components/ contexts/ styles/
│   │   └── assets/               Logo, fond, icônes, police, client-config.json
│   ├── scripts/              Génération du logo, des icônes et du GIF d'installation, build multi-plateforme
│   └── vendor/               Petits correctifs de dépendances utilisés au build
├── news-api/                 Serveur des actualités et page d'administration (facultatif, voir Actualités)
├── branding/                 Logo source et notes graphiques
└── .github/workflows/        Builds des versions
```

## Développement

Il vous faut Node.js 22.15 ou plus récent (22 ou 24 LTS ; le packaging d'Electron Forge n'est pas fiable à partir de Node 25), npm et Git.

```bash
cd launcher
npm ci
node node_modules/electron/install.js   # seulement si npm n'a pas lancé le téléchargement d'Electron
npm start
```

Connectez-vous avec un compte Microsoft qui possède Minecraft et cliquez sur Jouer pour tester tout le parcours. Pratique pendant le développement :

- `LEPTUMON_NO_DEVTOOLS=1 npm start` démarre sans le panneau DevTools
- `LEPTUMON_UPDATER_DEV=1` active la vérification des mises à jour dans un build de développement

## Build et publication

```bash
cd launcher
npm run package    # application non empaquetée
npm run make       # installateurs pour cette plateforme, dans launcher/out/
```

Faites le build de chaque plateforme sur son propre système ; `Dockerfile.build` couvre Linux x64 sans interface graphique.

Pour publier une version :

1. Augmentez `version` dans `launcher/package.json`.
2. Publiez une GitHub Release avec le tag `v<version>`.

[`.github/workflows/release.yml`](.github/workflows/release.yml) construit alors Windows x64, macOS x64 et ARM64, et Linux x64, puis joint les installateurs. Une fois la mise à jour automatique activée, les launchers ouverts récupèrent la nouvelle version en quelques heures, ou au prochain démarrage.

## Où le launcher range ses données

| Système | Dossier |
| ------- | ------- |
| Windows | `%APPDATA%\Leptumon-Launcher` |
| macOS | `~/Library/Application Support/Leptumon-Launcher` |
| Linux | `~/.leptumon-launcher` |

Ce dossier contient l'environnement Java, les fichiers partagés de Minecraft et NeoForge, le dossier du jeu, le dernier flux d'actualités (`news-cache.json`) et `launcher-logs/`. Les logs du jeu se trouvent dans `{dossier du jeu}/logs`.

---

Conçu et livré par [Ege sur Fiverr](https://fiverr.com/egelosing).
