# Identité visuelle Leptumon

**Français** · [English](README.en.md)

| Fichier | Notes |
| ------- | ----- |
| `leptumon-logo.png` | Le logo officiel de Leptumon fourni par le client (1024×1024, fond transparent). Tout le reste est généré à partir de lui. |

L'interface du launcher est partie d'un modèle de launcher et reprend le logo et le nom de Leptumon.

## Où vont les fichiers

| Fichier | À quoi il sert |
| ------- | -------------- |
| `launcher/src/assets/logo.png` | Logo affiché dans l'application (rogné à partir de la source) |
| `launcher/src/assets/logos/logo.png`, `.icns`, `.ico` | Icônes de l'application |
| `launcher/src/assets/logos/install-loading.gif` | Écran affiché pendant l'installation sous Windows (268×167) |
| `launcher/src/assets/background.png` | Fond du launcher, une capture de Leptumon fournie par le client (1920×1080) |

Si le logo change, régénérez le logo et les icônes. Il vous faut Pillow, `iconutil` sur macOS et [gifski](https://gif.ski) :

```bash
cd launcher
python3 scripts/generate-brand-assets.py
python3 scripts/generate-install-loading-gif.py
```

## Fond d'écran

Pour changer le fond, enregistrez une nouvelle image par-dessus `launcher/src/assets/background.png`. Elle est agrandie pour remplir la fenêtre (`object-fit: cover`), alors gardez l'essentiel vers le centre.
