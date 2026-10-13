# Bounded native-dialog routing diagnostic

This is a test-only comparison, not a runtime fix or replacement release gate.
The existing source/browser/stress checks remain unchanged.

## First experiment

Run `node tools/theme-review/modal-routing.cjs --browser-mode headless` in the
existing real CI Chrome environment. Run the same command with `headed` under
existing Xvfb to distinguish a headless association. Use the same official Chrome,
Playwright 1.62.0, launch arguments, 1440 × 900 viewport, and device scale 1.
Do not install/launch Chrome locally or retry the denied local route.

Existing environment variables apply: `PROJECT_ID=punk`, `PROJECT_ROOT`,
`PROJECT_BASELINE_ROOT`, `PROJECT_SCREENSHOTS`, `THEME_BROWSER_EXECUTABLE`, and
`NODE_PATH`. Headed mode additionally requires `DISPLAY`. The script requires CI.
The parent owns workflow/publication changes. Suggested workflow: separate
headless/headed matrix jobs, pinned existing actions, read-only permissions,
no secrets, existing official Chrome installation, Xvfb 1920x1200x24 for headed,
and always-upload artifacts. A 200–240-second invocation timeout is sufficient;
internal ceilings are 165 seconds work, 175 seconds worker, 185 seconds wrapper.

Each mode runs exactly 48 fresh contexts: six repetitions of these eight cells:

- Actual app or simple native `showModal()` dialog
- Same-origin or controlled cross-origin child document
- Immediate or rendered modal before the first Reset

Cell order reverses on alternate repetitions. Native controls match the known
Reset/frame overlap geometry and modal-only iframe pointer suppression, while
omitting the app engine, complex layout, and decorative animations. Same-origin
app delivery changes only the iframe URL in the intercepted test HTML response;
the checkout, runtime JS, CSS, original HTML, and provider attributes on disk
remain unchanged. GET/HEAD only; any attempted non-read request is blocked and
fails that context. Source protection runs before launch, and input hashes are
compared at exit.

Each context records two separate one-click outcomes:

1. Initial open: the page is already native, so Reset must produce exactly one
   trusted parent Reset click, no child pointer events, and ordinary Reset focus.
   This tests routing, not a meaningful state transition.
2. Select cyan normally, Close, pause 25 ms as in existing stress, then reopen:
   the first Reset must remove project storage and restore native state. Undo
   must restore the exact cyan state. There are no retries or synthetic repair.

Close, actual Escape, reopening, focus, legacy storage isolation, and restored
normal child clicks are also checked. A failed Reset remains failed even when a
later phase succeeds. The immediate path has no screenshot, tracing, rAF, or
compositor barrier before Reset. Rendered cases explicitly await two frames in
both documents and capture the modal PNG. App load animation/transition setup
matches existing stress; subsequently created animations are recorded, not
silently assumed paused.

## Evidence

`PROJECT_SCREENSHOTS/modal-routing-{headless,headed}/` contains:

- `routing.json`: complete matrix, strict outcomes, lifecycle errors, source
  hashes, versions/launch mode, before/after geometry and hit targets, frame
  target IDs/URLs, native-modal state, storage/focus, and parent/child telemetry
- `dispatch.jsonl`: actual Playwright CDP `Input.dispatchMouseEvent` sends/acks
  with exact coordinates, protocol timestamps, observed wall time, and action IDs
- PNGs: rendered-cohort barriers and final failure-state captures (the latter
  are explicitly not claimed to show the instant of failed dispatch)

The launcher observes `DEBUG=pw:protocol` through stderr instead of patching input
methods. Each Reset requires exactly one mouse press and release and successful
acknowledgments; absent or duplicate dispatch fails. Event probes record trust,
coordinates, timestamps, pointer IDs/buttons, focus, and capture changes without
forcing event-time layout. Parent and child `performance.timeOrigin` accompany
`performance.now`; compare epoch timestamps, not raw per-frame clocks.

CDP iframe targets are recorded before interactions. Cross-origin alone is not
proof of a different renderer: use `oopifObserved` and the recorded targets when
interpreting process-isolation hypotheses. Headed still uses CDP and therefore
does not establish physical-user-input correctness.

## Falsifiable interpretation and stopping point

- Failure in the native cross-origin control demonstrates that the full app
  engine is unnecessary for that observed failure. It does not name a Chromium
  defect or prove all similar failures share one cause.
- Failure concentrated in cross-origin cells motivates a process/hit-test
  propagation hypothesis only when OOPIF targets were actually observed.
- Failure only in app cells retains app layout/compositor/lifecycle as possible
  contributors. It does not identify a CSS property to change.
- Initial/reopened and immediate/rendered differences remain separate evidence;
  delay is not accepted as a production fix or a passing replacement assertion.
- A headless/headed difference shows association with that execution mode, not
  proof of native physical-user behavior.
- Zero failures is a bounded negative result. Instrumentation/logging can alter
  scheduling, and six contexts per cell cannot exclude low-frequency races.

Stop after both finite mode reports are available (or an actionable setup
blocker). Choose one next experiment from observed differences, rather than
expanding an uncontrolled matrix. Existing strict release failures remain open.
The child is an inert labelled placeholder; actual YouTube playback and controls
remain unverified.

Local validation, without any browser launch:

`node --test tools/theme-review/modal-routing.test.cjs`

`node --check tools/theme-review/modal-routing.cjs`

`node --check tools/theme-review/modal-routing-fixtures.cjs`
