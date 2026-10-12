# Project landing theme regression tools

These tools read the current project checkout and a separate pinned original checkout. They write reports/screenshots only beneath `PROJECT_SCREENSHOTS`. They do not edit either checkout, fetch/push, install dependencies, or contact a repository API.

## Integrating in each project

Copy `source.cjs`, `server.cjs`, `server.test.cjs`, and `browser.cjs` into `tools/theme-review/`. Keep the project-specific native baseline pinned:

- HackerPunk: `cad83d925ad2ef79b1efad4ad7da726f58535543`
- MonkePortals: `91091d1f00ce3dc3d3a25f4ee9881c3050d96632`

Prepare a full checkout of that original revision separately, for example `.local/baseline`. Monke's original JPG and both MP4s must be present in both checkouts. Missing media fails; it is never replaced by a fake passing video.

In CI, install Playwright 1.62.0, use the CI's Google Chrome (including its H.264 support), and set:

```sh
export CI=true
export PROJECT_ID=punk # or monke
export PROJECT_ROOT="$PWD"
export PROJECT_BASELINE_ROOT="$PWD/.local/baseline"
export PROJECT_SCREENSHOTS="$PWD/.local/theme-review"
export THEME_BROWSER_EXECUTABLE=/opt/google/chrome/chrome
# NODE_PATH may point at an existing CI-only Playwright install.
node --test tools/theme-review/server.test.cjs
node tools/theme-review/source.cjs
node tools/theme-review/browser.cjs
```

No local browser should be launched in the current restricted executor. The browser runner refuses to launch without `CI`. That guard is not an instruction to set `CI` locally; run the browser job on a real CI runner.

The scripts also accept `--project`, `--root`, `--baseline`, and `--output` flags. Without `PROJECT_BASELINE_ROOT`, they read the pinned baseline revision from the current repository's object database. `--baseline HEAD` is useful for text-only source development against local original text; Monke's missing local media still fails explicitly. CI uses the full pinned checkout and verifies its HEAD matches the known original revision.

## Artifacts and coverage

- `source.json`: exact source protection, original style/script blocks, CTA/media tags, canonical nav and protected original Git blobs. Only the opt-in html attributes, a single exact `PROJECT THEME START` / `PROJECT THEME END` head block and the navbar are allowed differences.
- `browser.json`: each pass/failure, uncaught JavaScript/local HTTP failures, network ranges, allowed/unavailable external assets, native snapshots/differences, foreground/background bound diagnostics and actual video results.
- PNGs: original/current native desktop and mobile at top/mid/footer; custom desktop and mobile Paper at top/mid/footer; both editor layouts.
- Source and server failures are separate from browser checks. An individual browser assertion is recorded and the runner continues independent checks. Runner setup errors and incomplete media initialization fail explicitly.

Native appearance is compared to the baseline, including content geometry, colors, background topology and transforms. Legacy native contrast is not asserted to pass. Existing clipped native elements are listed on both sides, and a newly introduced clipping difference fails. Document and navbar width/overlap checks are strict at 320, 360, 390, 768 and 1440 pixels, in native and custom modes.

All six presets, edited four-peg palettes in dark/light, modal focus/keyboard dismissal, reset/undo/native option, reload persistence, legacy-key isolation, ColorMagic, CTA anchoring and reduced motion are exercised. Text color is tested against the theme engine's worst-case bound; actual computed solid/gradient/transparent/pseudo/inset-shadow surfaces are conservatively composed and tested against that bound. Decorative particles/emoji and media pixels/fallback text are excluded. This is a conservative computed-style guarantee, not pixel/antialiasing certification.

Monke's absolute original media URLs remain unchanged. Playwright maps their network requests to each page's own local server. The server supports safe single HTTP byte ranges, suffix/open ranges, HEAD, index.htm defaults, and realpath confinement. Video checks require actual decoded dimensions, play-time advancement, stable pause and successful seek for both original MP4 files. Baseline/current Git object hashes protect media bytes.

YouTube is intentionally replaced by an explicitly labelled inert frame. Only the unchanged iframe attributes/layout are verified; provider playback, controls and availability are **unverified**. External fonts and original image hosts are narrowly allowed and cached consistently across baseline/current contexts. Asset failure remains visible in the JSON warnings.

Upload the entire output directory with the CI artifact step using `if: always()`, including failed jobs. Never describe an unexecuted browser suite, failed assertion or mocked YouTube playback as a pass.

### Close-event and 320px diagnostics

Dismissal checks wait for the browser's native `close` event and assert the final closed dialog, `aria-expanded=false`, and restored opener focus. The suite also deliberately closes/reopens in one JavaScript task, then waits for that queued close event and requires the reopened dialog to retain open/expanded/focused state. This detects stale-close races rather than masking them with a delay.

Reset remains strict. A fresh-context Reset/Undo check is separate from the main interaction-sequence Reset, and both retain click/input/change/close/focus traces, selected palette, stored state, and native/custom attributes. A failure does not become an assumed timing pass.

`overflow-320.json` and the `native-{baseline,current}-320-overflow.png` captures compare the untouched baseline and current page at 320px. The report includes off-viewport particles, every overflowing rendered element, scroll/client widths, transforms, positioning, and clipping ancestors. Decorative clipping can therefore be distinguished from content/nav regressions. Existing strict document/nav overflow assertions remain unchanged.
