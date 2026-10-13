# Separate native-input discriminator

The first CDP control matrix reproduced reopened Reset misdelivery in both
headed and headless Chrome, limited in that sample to the actual app with a
cross-process child and no rendered-modal barrier. The primitive native dialog
did not reproduce it. The unchanged release stress failed 12/12 immediate cases
in the same CI run, while protocol-instrumented samples reproduced less often.
Instrumentation can therefore materially change the observed frequency.

`native-routing.cjs` tests the next specific question: can the same app/cross-frame
failure occur when the critical opener and Reset use XTEST instead of CDP mouse
injection? It does not change application assets or replace existing gates.

## CI contract

Use the existing official Chrome, Playwright 1.62.0, and ordinary launch flags.
The parent workflow installs Ubuntu's official `xdotool` package and provides an
isolated Xvfb display. Existing project environment variables apply, plus
`THEME_NATIVE_POINTER_DISPLAY_ISOLATED=1` and the local `DISPLAY` created by Xvfb.

Run `node tools/theme-review/native-routing.cjs` under that isolated display.
Output is `PROJECT_SCREENSHOTS/native-routing/routing.json` and any final
failure-state PNGs. Always upload the output, including failed runs. Use a
180–200-second outer CI timeout; the internal worker ceiling is 175 seconds,
work budget 165 seconds, and per-context budget 14 seconds. Do not launch a local
browser or set the CI/display guard locally to bypass the earlier denial.

## Finite sample and strict checks

- Eighteen fresh contexts, interleaved app/native/app: 12 actual app, 6 primitive
- Controlled cross-origin provider frame in every case; require an observed
  CDP iframe target before describing the sample as cross-process
- Bring the controlled headed page to the front before load; original readiness
  timeout stays unchanged
- Existing load/freeze, then while initially closed identify/focus the exact
  Chrome X window and calibrate two trusted native pointer moves
- Arm once before ordinary cyan selection, Close, and the existing 25 ms
  preparation interval; calibration cannot settle the just-closed modal
- Clear only preparatory native-probe event records after Close, before that
  25 ms interval; retain the original two-second permit including preparation
- Native opener once, read native-modal/focus/geometry state, native
  Reset once; no screenshot, animation-frame barrier, extra sleep or retry
- Require one trusted parent down/up/click for both activations, expected
  viewport/screen coordinates and targets, no child input, native theme, deleted
  project storage, and Reset focus
- Normal Playwright Undo restores exact cyan storage; Close, actual Escape,
  reopen, legacy isolation, and restored controlled-child clicks stay strict
- Source protection before launch and input hashes at exit; GET/HEAD only

A native setup/calibration or identity failure stops further contexts and
reports incomplete coverage. There is no fallback input path. Behavioral
failures remain failures while independent later contexts still run.

## Interpretation

The report includes calibrated screen coordinates, command start/end times,
trusted parent/child event times, Close-to-opener-click and
opener-click-to-Reset-down latency. Compare
that actual latency with the roughly 46–50 ms CDP failure window; native process
overhead can move the click later even without an explicit delay. A clean native
cohort does not establish physical-user correctness or authorize weakening the
original immediate assertion. A native child misdelivery would show that CDP
injection is not necessary for that observed failure.

Primitive/app geometry shares the overlapping frame arrangement, not guaranteed
pixel equality across browser modes: headed scrollbars shift app coordinates.
Use each case's recorded geometry. The frame is still a labelled controlled
placeholder; live YouTube playback, controls, and playback-state preservation
remain unverified.

Local non-browser validation:

`node --test tools/theme-review/native-routing.test.cjs tools/theme-review/native-pointer.test.cjs tools/theme-review/modal-routing.test.cjs`
