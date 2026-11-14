# Source layout

The browser still loads one JavaScript resource. Source files are separated for
editing and assembled at build time; no extra browser requests are introduced.

| File | Responsibility |
| --- | --- |
| `src/wiser-controls-card.js` | Card rendering, device controls, shared helpers and registrations |
| `src/wiser-controls-card-editor.js` | Visual editor, Content schemas, settings and editor layout |
| `src/wiser-controls-card-editor.css` | Visual editor stylesheet |
| `src/wiser-controls-panel.js` | Panel navigation, device details, settings and previews |
| `src/localize/` | Home Assistant localisation integration and translation fallbacks |
| `scripts/card-source.cjs` | Includes the editor and CSS inside the card's private scope |
| `scripts/build.mjs` | Assembles translations, card, panel and embedded device images |

The editor shares private card helpers. Its source is a build fragment, not a
standalone browser module. Keep the source slots in place; the assembler rejects
missing or duplicate slots. Tests use this same assembler.

## Editing layout

In the editor JavaScript, search for:

- `contentRows`: grouping of temperature, visibility and glow controls.
- `_compactHeaderSettings`: header row height and vertical gap.
- `_styleTemperatureFocus`: Content spacing and temperature-pill alignment.

Edit normal editor CSS in `src/wiser-controls-card-editor.css`. Native Home
Assistant components have their own shadow roots; layout helpers apply the few
rules that cannot cross those boundaries through the outer stylesheet.

## Verify and build

Run `npm test`, then `npm run build:dev`. The build script increments the dev
version and writes `dist/wiser-controls-card.js` and its legacy alias. Install the
built file, not the individual source fragments. Use `npm run build:release` only
when preparing a release.
