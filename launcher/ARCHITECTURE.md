# Architecture du launcher

**Français** · [English](ARCHITECTURE.en.md)

Un plan de l'organisation du Leptumon Launcher, pour trouver rapidement le bon fichier.

## Processus

```text
┌─────────────────────────────────────────────────────────────────┐
│  Renderer (React)          preload.ts       Processus principal │
│  ─────────────────         ──────────       ─────────────────── │
│  views/ + components/  →  contextBridge  →  main/registerIpc.ts │
│  contexts/                  window.electron      modules main/* │
│  renderer.tsx               window.config       core/*          │
└─────────────────────────────────────────────────────────────────┘
```

- Le renderer n'a pas accès à Node. Il passe uniquement par `window.electron` et `window.config`.
- Le script preload est le pont IPC typé (`preload.ts` et `types/electron.d.ts`).
- Le processus principal gère la connexion, les téléchargements, les réglages, le ping du serveur, les mises à jour et le lancement de Minecraft.

## Où se trouve quoi

| Chemin | Rôle |
| ------ | ---- |
| `src/index.ts` | Démarrage de l'application (instance unique, protection contre les plantages, handler ready) |
| `src/main/registerIpc.ts` | Tous les handlers `ipcMain` |
| `src/main/launchPipeline.ts` | Les étapes du lancement : modpack, Java, NeoForge, serveur, connexion, jeu |
| `src/main/launchProgress.ts` | Transforme les étapes en une seule progression pour l'interface |
| `src/main/updater.ts` | Mise à jour automatique du launcher via les GitHub Releases |
| `src/main/settings.ts` | Stockage `electron-store` et plage de RAM pour la machine |
| `src/main/rendererConfig.ts` | Les réglages que React a le droit de lire et d'écrire |
| `src/main/window.ts` | Création de la `BrowserWindow` : vrais boutons de fenêtre sur macOS, fenêtre sans cadre et transparente avec boutons personnalisés ailleurs. Signale au renderer quand la fenêtre est agrandie ou en plein écran (coins carrés). |
| `src/main/news.ts` | Actualités de l'accueil : dernier flux gardé dans `news-cache.json`, rafraîchi en arrière-plan, liens ouverts par identifiant d'article |
| `src/core/news/feed.ts` | Télécharge et vérifie le flux de `news.url` (API ou `news.json` statique) |
| `src/main/avatarCache.ts` | Têtes des joueurs mises en cache sur le disque pour s'afficher tout de suite |
| `src/core/modpack/manifest.ts` | Synchronise le manifeste hébergé dans l'instance (par défaut) |
| `src/core/modpack/installer.ts` | Installe ou met à jour une version du modpack via CurseForge (quand il n'y a pas de manifeste) |
| `src/core/modpack/curseforge.ts` | Client de l'API CurseForge Core |
| `src/core/modpack/common.ts` | File de téléchargement partagée, fichiers d'état, dossiers gérés par le pack |
| `scripts/generate-pack-manifest.mjs` | Génère `manifest.json` et les objets auto-hébergés à partir d'une instance |
| `src/core/server/status.ts` | Server List Ping (joueurs, MOTD, version, latence, icône) |
| `src/core/server/motd.ts` | Convertit le MOTD (JSON et codes §) en texte mis en forme |
| `src/core/server/serversDat.ts` | Épingle le serveur dans la liste multijoueur |
| `src/core/engine/` | Téléchargement de Java, installation de NeoForge/Fabric, téléchargement et lancement de Minecraft |
| `src/core/auth/microsoft/` | Connexion OAuth et serveur de retour local |
| `src/core/utils/clientConfig.ts` | Charge et vérifie `assets/client-config.json` |
| `src/constants/launcher.ts` | Nom du launcher, limites de RAM, réglages par défaut |
| `src/views/`, `src/components/` | L'interface (voir plus bas) |
| `src/contexts/` | État React : progression du lancement et textes |

## Ce qui se passe au clic sur Jouer

Quand le joueur clique sur Jouer, `main/registerIpc.ts` passe la main à `main/launchPipeline.ts` :

1. Modpack. Si `modpack.manifestUrl` est renseigné, `core/modpack/manifest.ts` récupère le manifeste et ne télécharge que les fichiers manquants, abîmés ou modifiés (les règles de synchronisation sont dans le README). Sinon, `core/modpack/installer.ts` passe par CurseForge. Si `.leptumon/modpack.json` indique déjà le `curseforge.fileId` configuré, l'étape se termine tout de suite. Sinon, il :
   - télécharge l'archive du pack
   - retrouve chaque entrée via l'API CurseForge
   - télécharge les mods, resource packs et shader packs en parallèle
   - applique les overrides
   - supprime les fichiers installés par l'ancienne version que la nouvelle n'utilise plus
   - écrit le fichier d'état
2. Java (`core/engine/java/`). Temurin, ou Zulu si besoin, pour la version de Minecraft du pack, rangé dans `{data}/jdk`.
3. Loader (`core/engine/downloader/modloader/neoforge.ts`). Lance le jar d'installation de NeoForge avec `--install-client` sur le dossier de données partagé, et réutilise un profil `neoforge-<version>` existant.
4. Serveur (`core/server/serversDat.ts`). Garde le serveur en premier dans `servers.dat`. Si « Rejoindre le serveur au lancement » est activé, il passe `--quickPlayMultiplayer`.
5. Connexion. Renouvelle les jetons Microsoft et obtient un jeton de session Minecraft.
6. Lancement. `GameLauncher.launch()` vérifie le client, les bibliothèques et les ressources de Minecraft, puis démarre le jeu.

Les erreurs destinées aux joueurs sont levées sous forme de `UserFacingError` (`core/utils/errors.ts`). Le message s'affiche sur la carte de lancement et `detail` part dans le log.

## L'IPC en un coup d'œil

| API preload | Canal IPC | Handler |
| ----------- | --------- | ------- |
| `installAndLaunchMC` / `cancelLaunch` | `install-and-launch-mc` / `cancel-launch` | `registerLaunchHandlers` |
| `getLauncherInfo` | `get-launcher-info` | `registerLauncherInfoHandlers` |
| `getServerStatus` | `get-server-status` (cache de 10 s) | `registerLauncherInfoHandlers` |
| `openLink('discord' \| 'store')` | `open-link` | `registerLauncherInfoHandlers` |
| `getNews` / `onNewsUpdated` / `openNewsLink(id)` | `get-news` / `news-updated` / `open-news-link` | `registerNewsHandlers` |
| `getWindowState` / `onWindowState` | `get-window-state` / `window-state` | `registerWindowHandlers` |
| `getAvatar` / `onAvatarUpdated` | `get-avatar` / `avatar-updated` | `registerAuthHandlers` |
| `getRamInfo` | `get-ram-info` | `registerConfigHandlers` |
| `getUpdateState` / `checkForUpdates` / `installUpdate` | `updater:*` | `registerUpdaterHandlers` |
| `config.get/set` | `get-config` / `set-config` | `registerConfigHandlers` |

La liste complète se trouve dans `preload.ts` (classée par section) et `main/registerIpc.ts`.

## L'interface

L'interface est partie d'un modèle de launcher et a été redessinée pour Leptumon. Le panneau Actualités occupe l'espace à côté de la carte de lancement quand un flux est configuré ; sinon la carte reste seule.

| Zone | Fichiers principaux |
| ---- | ------------------- |
| Navigation et accès après connexion | `components/RouterContainer.tsx` |
| Écran de connexion | `views/Login.tsx`, `components/LoginForm.tsx` |
| Cadre de la fenêtre | `views/MainPage.tsx` (fondu entre les pages), `components/Sidebar.tsx` (accueil, Discord et Boutique, paramètres, avatar, repère de page active qui glisse), `components/Titlebar/` |
| Accueil | `views/pages/HomePage.tsx`, qui affiche `Content/Content.tsx` (logo) et `Footer.tsx` (actualités et carte de lancement) |
| Actualités | `components/News.tsx` (cartes qui défilent à la molette, au trackpad ou avec les flèches posées sur les bords, masqué sans flux), `components/NewsArticleDialog.tsx` (article complet, bouton « Ouvrir le lien ») |
| Coins de la fenêtre | `utils/windowFrame.ts` et le bloc `clip-path` de `styles/main.scss` : sous Windows et Linux la page arrondit elle-même la fenêtre (`$radius-window`), carrée quand elle est agrandie |
| Carte de lancement et statut en direct | `components/LaunchButton.tsx` (nombre de joueurs dans la pastille de statut, MOTD en infobulle, texte de progression qui passe sur deux lignes quand il est long), `ProgressBar.tsx`, `MiniProgressPill.tsx` |
| Liens | `components/SocialMediaLinks.tsx` et `SidebarIcons.tsx`, affichés dans la barre latérale |
| Mises à jour | `components/UpdatePrompt.tsx` (propose de redémarrer quand une mise à jour du launcher est prête) |
| Paramètres | `views/pages/Settings.tsx`, `components/SettingsLayout.tsx` (sections, lignes, ligne dépliable), `MemorySlider.tsx`, `DropdownMenu.tsx` |
| Contrôles partagés | `components/Button.tsx`, `Switch.tsx`, `ConfirmDialog.tsx` |
| Tête du joueur | `utils/useAvatar.ts`, alimenté par `main/avatarCache.ts` |
| Textes | `i18n/<locale>.json` (11 langues) via `i18n/index.ts` et `contexts/I18nContext.tsx`. La détection de la langue au premier lancement est dans `src/index.ts`. |
| Apparence | `styles/base/_variables.scss` (toutes les couleurs, arrondis, tailles de texte et courbes d'animation), `styles/base/_mixins.scss`, et `constants/motion.ts` avec les mêmes valeurs d'animation pour le package motion. Inter 4.1 est inclus dans `assets/fonts/inter/`. |

## Ajouter des choses

### Un nouveau réglage de build

1. Ajoutez-le à `types/config/ClientConfig.ts`.
2. Vérifiez-le dans `core/utils/clientConfig.ts`.
3. Ajoutez-le à `assets/client-config.json` et aux tableaux des deux README.

### Un nouveau réglage joueur

1. Ajoutez la clé à `types/config/LauncherConfig.ts`.
2. Autorisez-la dans `main/rendererConfig.ts` si React doit la lire ou l'écrire.
3. Utilisez `window.config` côté React.

### Une nouvelle langue

1. Ajoutez `i18n/<locale>.json` avec exactement les mêmes clés que `en_US.json`, en gardant chaque `<placeholder>`.
2. Importez-le dans `STRINGS` dans `i18n/index.ts` et ajoutez son nom natif à `LOCALE_NAMES`.

La détection au premier lancement se base sur le code de langue, donc la nouvelle langue est prise en compte automatiquement.

### Un nouveau comportement au lancement

Modifiez `main/launchPipeline.ts` ou le module `core/` concerné, et gardez les commentaires des étapes à jour.

## Dépendances forcées (overrides)

Les `overrides` de `package.json` forcent des versions corrigées pour les outils de build, afin que `npm audit` reste propre. Deux d'entre elles n'ont aucune version corrigée, donc de petits correctifs se trouvent dans `vendor/` :

| Correctif | Remplace | Pourquoi |
| --------- | -------- | -------- |
| `vendor/extract-zip` | `extract-zip` 2.0.1 (utilisé par `@electron/packager` 18 dans Forge 7) | Il a une faille de traversée de chemin via les liens symboliques, jamais corrigée. Le correctif passe par `@electron-internal/extract-zip`, l'extracteur renforcé qu'utilise `@electron/packager` 20. |
| `vendor/image-size` | `image-size` 0.7 (utilisé par `appdmg` pour le fond du DMG) | Ses failles de déni de service ne sont corrigées qu'en 2.x, qui a changé d'API. Le correctif garde l'appel `sizeOf(path, callback)` de la 0.7 par-dessus la 2.x. |

Les deux ne servent qu'au build ; rien dans `vendor/` ne se retrouve dans l'application. Quand Electron Forge 8 sera stable (il utilise `@electron/packager` 20), le correctif `extract-zip` pourra disparaître. Relancez `npm audit` après chaque mise à jour des dépendances et retirez les overrides devenus inutiles.

## Conventions de code

- La logique du processus principal va dans `src/main/` ou `src/core/`, pas dans `index.ts`.
- Rien de privilégié ne tourne dans React. Tout passe par `preload.ts`.
- Chaque champ de la config de build est facultatif. Une valeur manquante donne un état « bientôt disponible », pas un plantage.
- Les commentaires expliquent le pourquoi (règles métier, ordre des étapes), pas ce que fait un code évident.
