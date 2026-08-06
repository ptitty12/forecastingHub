# Overview deck

`../Forecasting-Pub-Overview.pptx` — a 10-slide functionality walkthrough,
built from the screenshots in this folder.

## Rebuilding it

Screenshots are captured from the running app, so refresh them whenever the
UI changes materially:

```bash
# 1. start the app (backend :7999, frontend :5173)
# 2. re-capture screenshots into this folder, then:
cd docs/deck && node build_deck.js
```

`build_deck.js` uses [pptxgenjs](https://gitbrent.github.io/PptxGenJS/) and
writes the deck one level up. Every screenshot in here is from the demo
world, so nothing in the deck describes real business.

| File | Slide |
|---|---|
| `mug.png` | title mark |
| `s_grid.png` | the forecast grid |
| `s_drilldown.png` | opportunities behind a row |
| `s_asof.png` | point-in-time view with compare |
| `s_dashboard.png` | dashboard |
| `s_admin.png`, `s_admin_edit.png` | administration and edit mode |
| `s_help_banner.png`, `s_tooltip.png` | in-app help |
