# Report diagrams

Drawn with [tldraw](https://tldraw.dev). The source is `scripts-report/tldraw/src/diagrams.js`: boxes, frames and bound arrows in tldraw page coordinates.

- `*.png`: exports used in the report.
- `*.tldr.json`: tldraw store snapshots. Load one with `editor.store.loadStoreSnapshot(JSON.parse(text))` to edit the diagram on a tldraw canvas.

To regenerate the PNGs:

```bash
cd scripts-report/tldraw
npm install && npm run assets
npm run dev            # leave running
npm run export         # writes ../../report/diagrams/*.png and *.tldr.json (needs Playwright)
```
