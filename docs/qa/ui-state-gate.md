# UI state gate

Issue: #50. Spec: #42. Every UI change signs this gate before merge.
Screenshots are PR evidence. They never enter the repo, and no visual
harness ships: the component tests already pin each state at the rendered
seam, so this gate adds proof of how the states look, not another runner.

## The twelve states

Composer, from `src/app/composer.tsx`:

| State | What the reviewer must see |
|---|---|
| idle | Mono placeholder in muted ink, expiry select on `1 jam`, submit disabled while the secret is empty |
| busy | Submit disabled with `Membuat…`, previous alert cleared; an earlier link stays until the new result lands |
| error | `role="alert"` reading `Gagal membuat link: …`, no link kept |
| link | Share link in mono `break-all`, `Salin link` below it, hint line unchanged |
| copy-failed | Share link stays visible; `role="alert"` reads exactly `Penyalinan gagal. Salin link secara manual.`, without the create-link prefix |

Reveal, from `src/app/s/reveal-view.tsx`:

| State | What the reviewer must see |
|---|---|
| idle | `Seseorang mengirim rahasia untukmu.` with one reveal action |
| loading | Same heading, reveal action disabled, label `Membuka…` |
| done | `Rahasia terbuka. Link sudah hangus.`, Secret in a paper panel, `Didekripsi lokal. Salin sekarang.` |
| burned | `Link sudah hangus.` plus the already-opened explanation |
| expired | `Link kedaluwarsa.` plus the ask-the-sender next step |
| unavailable | `Link tidak tersedia.` plus `Minta pengirim buat link baru.`, with no retry |
| failed | `Link tidak bisa dibuka.` plus the reason, retry only on a network error |

Each state renders in the canvas tokens from `src/app/tokens.ts`. A new
color, font, or size needs a canvas diff first. The [canvas token snapshot](../design/canvas-tokens.md)
records the reference values for review.

## Capture path

The twelve states come from the running app, driven in a real browser:

1. Start the app with `npm run dev`.
2. Open it in a real browser and drive the composer and reveal flows
   into each state named above.
3. Capture one screenshot per state — twelve in total.
4. Attach them to the PR only. No capture file, image, or harness is
   committed to the repo.

## Sign-off

Copy this checklist into the PR body and tick it there. The repo file stays
unticked; the signed copy lives with the PR it gates.

- [ ] Twelve screenshots attached to the PR, one per state named above
- [ ] `npm test -- --run` green
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` lists `/api/secrets` and `/api/secrets/[id]`

## Recheck

```sh
npx tsc --noEmit
npm test -- --run
npm run build
```

`npm run build` prints the route table. Both secret routes must appear as
dynamic (`ƒ`) entries. A missing route means the build dropped the API
surface, not that the build is stale.

## Why no screenshot folder

Spec #42 puts screenshot proof in the PR and bans a repo copy. A committed
image goes stale silently: nothing fails when it stops matching the code.
A PR attachment dies with the pull request it proves, which is the
lifetime the proof should have.
