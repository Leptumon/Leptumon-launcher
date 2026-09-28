# Leptumon branding

[Français](README.md) · **English**

| File | Notes |
| ---- | ----- |
| `leptumon-logo.png` | The official Leptumon logo from the client (1024×1024, transparent). Everything else is generated from it. |

The launcher UI started from a launcher template and carries the Leptumon logo and name.

## Where the assets end up

| File | What it's for |
| ---- | ------------- |
| `launcher/src/assets/logo.png` | Logo shown in the app (trimmed from the source) |
| `launcher/src/assets/logos/logo.png`, `.icns`, `.ico` | App icons |
| `launcher/src/assets/logos/install-loading.gif` | Splash shown while the Windows installer runs (268×167) |
| `launcher/src/assets/background.png` | Launcher background, a Leptumon screenshot from the client (1920×1080) |

If the logo changes, regenerate the logo and icons. You'll need Pillow, macOS `iconutil` and [gifski](https://gif.ski):

```bash
cd launcher
python3 scripts/generate-brand-assets.py
python3 scripts/generate-install-loading-gif.py
```

## Background

To change the background, save a new image over `launcher/src/assets/background.png`. It's scaled to fill the window (`object-fit: cover`), so keep the interesting part near the middle.
