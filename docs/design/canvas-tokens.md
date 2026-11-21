# Tempel canvas tokens

This snapshot comes from the Tempel Homepage, Reveal, and Result frames in
`tempel.pen`. The app contract lives in [`src/app/tokens.ts`](../../src/app/tokens.ts).

| Pencil variable | Value |
| --- | --- |
| `bg` | `#FFFFFF` |
| `surface` | `#F4F4F2` |
| `line` | `#E3E3DE` |
| `text-primary` | `#1A1A1A` |
| `text-secondary` | `#525252` |
| `accent` | `#0E7A4F` |
| `warn` | `#B25E00` |
| `danger` | `#C22E2E` |
| `font-display` | `Inter` |
| `font-body` | `Inter` |
| `font-mono` | `IBM Plex Mono` |
| `font-mono-css` | `"IBM Plex Mono", monospace` |

The browser export previously used `"IBM Plex Mono", system-ui, sans-serif`.
Issue [#65](https://github.com/rinopatrick/tempel/issues/65) records the new
stack in the canvas's `font-mono-css` variable. Text layers use `font-mono`
for their font family. When the web font is unavailable, the browser uses
its generic monospace family.

The canvas text layers use sizes 13, 14, 15, 16, 17, 22, 40, 56, and 60 px.
The app uses 13, 15, 17, 40, 56, and 60 px. [Spec #42](https://github.com/rinopatrick/tempel/issues/42)
maps the canvas's 14, 16, and 22 px sizes to 13, 15, and 17 px in the app.
