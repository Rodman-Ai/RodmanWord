# RodmanWord

A Microsoft Word–style document editor that runs entirely in your browser. Works on desktop and mobile, with no backend, no build step, and no dependencies.

**Live demo:** deploys automatically to GitHub Pages from the `main` branch.

## Features

- Ribbon UI with **Home**, **Insert**, **Layout**, **View**, and **File** tabs
- Rich text formatting — bold, italic, underline, strikethrough, sub/superscript
- Font family + size, font color, highlighting, paragraph styles (H1–H4, quote, code)
- Lists (bulleted/numbered), indent, alignment (left/center/right/justify)
- Insert images, links, tables, horizontal lines, dates, symbols, page breaks
- Page sizes (A4 / Letter / Legal), portrait/landscape, normal/narrow/wide margins
- Zoom 50–200 %, dark mode, optional ruler
- Find & Replace (with case sensitivity)
- Auto-save to local storage
- File menu — New, Open, Save (`.rwd`), Export HTML, Export Text, Print/PDF, Recent
- Keyboard shortcuts: `Ctrl/Cmd + B/I/U/S/P/F/N/O/Z/Y`
- Fully responsive; mobile-friendly toolbar that scrolls horizontally
- Print-ready stylesheet — Print → "Save as PDF" produces a clean export

## Run locally

It's a static site. Just open `index.html` in any modern browser, or serve the folder:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .
```

Then visit http://localhost:8000/

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. The included `.github/workflows/deploy.yml` will publish the site.

The workflow uploads the entire repo root as the Pages artifact, so any change to `index.html`, `styles.css`, or `app.js` ships automatically.

## File format

The native `.rwd` format is just JSON:

```json
{
  "version": 1,
  "title": "My document",
  "html": "<h1>...</h1>",
  "layout": { "size": "a4", "orientation": "portrait", "margins": "normal" },
  "savedAt": "2026-04-30T00:00:00.000Z"
}
```

You can also import `.html` and `.txt` files.

## Project layout

```
.
├── index.html        # App shell, ribbon, modals, page
├── styles.css        # Theming, ribbon, page styles, mobile, print
├── app.js            # Editor logic — commands, files, prefs, find/replace
├── 404.html          # Pages SPA fallback
└── .github/workflows/deploy.yml
```

## License

MIT
