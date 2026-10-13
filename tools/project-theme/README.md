# Project-local ColorMagic integration

This package is a narrow local derivative for the HackerPunk and MonkePortals
landing pages. It does not modify the main site, game code, project media, or
hosting. Assets are served from each landing page's own origin, with no runtime
dependency on a mutable main-site asset URL or a third-party JavaScript CDN.

## Provenance and boundary

Upstream: `TrentSterling/trentsterling.github.io` at immutable commit
`91d0a6874fbb4769d546574870e25c406a81608d`.

The original source snapshots are under `upstream/assets/`. Their Git blob hashes
were checked against the fresh GitHub connector tree for that exact commit.
`vendor-manifest.json` records each original and shipped hash. The patch in
`project-local.patch` shows all asset changes. `upstream-test.cjs.txt` records the
original test basis, also verified against the upstream Git blob.

- `assets/js/tront-system.js`: byte-identical upstream color/harmony helpers and
  navigation registry. No automatic page mounting or theme application.
- `assets/css/tront-navbar.css`: byte-identical upstream primary-nav geometry.
- `assets/js/tront-theme-editor.js`: adds validated project configuration,
  isolated storage, a native project state, native Reset/Undo, and idempotent
  dialog-session cleanup that cannot affect a reopened modal. The token and
  harmony math is unchanged.
- `assets/css/tront-theme-editor.css`: excludes `surface="project"` from generic
  page-color rules. Modal, primary-nav, accessible focus, hidden controls and
  reduced-motion behavior remain shared.

Do not import `tront-system.css` or use gallery mode to simulate a project.
Do not edit the source snapshots. Regenerate provenance after an intentional
asset edit with `node tools/project-theme/provenance.cjs`.

## Page contract

Use these initial document attributes:

```html
<html lang="en" data-tront-theme-editor data-tront-theme-surface="project" data-te-project="native">
```

Load the page's original styles, the editor CSS, shared navbar CSS, then the
page-specific adapter CSS. Before the editor script, assign this trusted static
configuration (example for HackerPunk):

```js
window.TrontThemeProject = {
    id: 'punk',
    storageKey: 'tront-theme-punk-v1',
    nativeLabel: 'Original HackerPunk',
    original: {
        mode: 'dark', angle: 135, intensity: 65, frost: 88,
        pegs: [
            { color: '#ff00ff', position: 0 },
            { color: '#00ffff', position: 33 },
            { color: '#ffff00', position: 67 },
            { color: '#00dd00', position: 100 }
        ]
    }
};
```

For MonkePortals use `id: 'monke'`, `storageKey: 'tront-theme-monke-v1'`,
`nativeLabel: 'Original MonkePortals'`, and colors
`['#ff8c32', '#00ffff', '#ff00ff', '#e0e0e0']` at the same positions.
These are existing brand roles for the editor's four pegs; the native pages
are not replaced by a four-stop gradient.

The validator accepts only `punk` and `monke`; the key must match its ID. It
requires a nonempty label of at most 80 characters, a dark/light mode, numeric
angle 0–360, intensity 0–100, frost 75–100, and exactly four six-digit hex colors
with numeric positions 0–100. Invalid configuration leaves the editor hidden,
native page state unchanged, and storage untouched. Configuration is copied;
later mutation cannot redirect storage or alter the original state.

Load scripts synchronously in this order in the head: `tront-system.js`, static
project configuration, `tront-theme-editor.js`. The same order also works with
ordered deferred scripts. Use the existing button contract:

```html
<button id="tront-theme-btn" class="nav-link" type="button" hidden>
  <span class="theme-icon">◐</span><span class="theme-label"> Theme</span>
</button>
```

The parent integration supplies five primary controls: Home, Games, Blog,
Discord and Theme. Its project hero supplies the project identity. Use absolute
canonical main-site links on the subdomains. Keep a working static nav fallback.
Native page typography, geometry, effects and media remain in the page itself.

## Native/custom behavior

- First visit, invalid stored settings, and denied storage start in
  `data-te-project="native"` with all four original peg colors visible.
- Merely loading, opening or closing the editor does not save anything or opt
  the page into custom colors.
- An explicit preset, ColorMagic, appearance, color, position, angle, intensity,
  or frost change sets `data-te-project="custom"`.
- Reset or selecting the named original option returns to the project's
  original state and removes only that project's saved key. Undo can move
  between native and custom states, including undoing Reset.
- A saved custom choice restores before DOM ready. Corrupt settings are not
  silently rewritten. Storage failures retain a usable preview and an honest
  status message.
- `data-theme` is never changed on project pages. Native inline `color-scheme`
  is preserved and restored after Reset.

The shared `--te-*` token API remains available in both states for modal/nav
styling. Page-specific adapters must gate their mappings on
`html[data-tront-theme-surface="project"][data-te-project="custom"]`.
Keep each existing background layer and accent role; use bounded background
tokens for surfaces and readable foreground tokens for text. No generic page
wash or blanket heading/CTA recoloring is applied by the common CSS.

## Storage and subdomains

No project reads or writes `tront-theme`, `tront-theme-editor-v1`,
`tront-theme-gallery-v1`, playback preferences, or the other project's key.
The storage event synchronizes only the same project's other same-origin tabs.
An external storage clear returns that page to native without writing back.

`localStorage` is scoped to an origin, so `tront.xyz`, `punk.tront.xyz`, and
`monke.tront.xyz` do not share settings. There is no cookie, iframe bridge,
postMessage relay, URL preference, or storage interception in this package.
The UI says choices save only on this site in this browser.

References: [localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
and [storage event](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event).

## Verification

```sh
node --check assets/js/tront-theme-editor.js
node --test tools/project-theme/test.cjs
```

Tests retain the upstream deterministic contrast stress suite and DOM contracts,
and add both projects' native/reset/undo, original peg values, storage isolation,
failure handling, validation, modal behavior, CSS scope and provenance checks.
The dialog fixture can queue close notifications like the browser: five race
regressions failed against the original lifecycle handler and pass with the
session-aware handler. Explicit close/backdrop actions settle synchronously;
late close notifications cannot change a reopened dialog's focus, ARIA state,
or undo grouping. Native Escape behavior remains browser-owned. Background
focus restoration uses `preventScroll` only during explicit close actions.
The fixture also models immediate native focus restoration: a sixth regression,
run for both projects, proves that queued cleanup preserves an external focus
choice made after native closure. Native notifications and pre-reopen cleanup
finalize state/history without focusing again.
The DOM fixture is not a browser: it cannot prove CSS layout, native focus
trapping, actual Escape defaults, responsive geometry, or visual preservation.
Those require the separate GitHub Actions Playwright/visual checks against each
landing page and its native baseline. Do not bypass blocked browser execution.

The asynchronous close notification is specified in the
[HTML dialog closing algorithm](https://html.spec.whatwg.org/multipage/interactive-elements.html#close-the-dialog).

## HackerPunk's in-page editor

HackerPunk uses the same four-peg controls in a modeless, in-flow panel above the
original page. Reset/Undo sit near the heading, and wide screens use two columns.
The player remains its original DOM node with the original source and attributes.
No opacity, visibility, inertness, pointer suppression, or reload is applied to it.
Opening saves the reading position and scrolls to the editor; Close or Escape
restores that position and returns keyboard focus to Theme. Tab stays in ordinary
page order. Other project configurations retain the native modal behavior.

This is a local structural response to reproducible cross-origin iframe input
misrouting during native-modal reopening in Chrome. Both CDP and real XTEST
single clicks reproduced it, including a minimal animation-free control. The
observations do not establish a specific Chromium internal defect. Historical
failing artifacts are retained separately; passing a delayed/rendered case never
replaces an immediate first-click failure.
