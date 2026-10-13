# Bounded native-pointer diagnostic helper

`native-pointer.cjs` is an optional test-only X11/XTEST control for deciding whether a headed Chromium routing failure also occurs outside CDP mouse injection. It is not an application fix or a replacement for the immediate single-click regression. It does not launch a browser, install software, run a scenario, or modify deployed assets.

## CI prerequisites

The integrating CI job must install Ubuntu's official `xdotool` package, provision a dedicated Xvfb display, and run one controlled headed Google Chrome window at device scale 1 with a 1440 × 900 page viewport. Keep the existing approved Chrome launch options. The display must not be a shared desktop. Set `CI`, `DISPLAY=:N`, and `THEME_NATIVE_POINTER_DISPLAY_ISOLATED=1` only on that genuine isolated CI runner. The last variable is an explicit caller assertion, not automatic Xvfb discovery. Never set these locally to bypass the CI-only guard.

The helper requires exactly one visible Google Chrome X11 window, matches its title to a unique token set on the controlled page, focuses it, records its geometry, and calibrates screen-to-viewport translation using two actual trusted pointer moves in the left gutter. Unknown mappings, extra Chrome windows, unexpected scale, missing parent events, or focus/window changes fail closed. It never guesses the browser toolbar offset. An unfamiliar window class or a child X11 focus-window ID is a setup failure, not permission to bypass identity checks.

## Integration contract

Keep this as a separate finite cohort. Complete loading, custom-palette preparation, and closing the editor first. `prepareNativePointer({page})` performs all calibration before the critical reopen/Reset window. Existing `modal-routing-fixtures.cjs` child telemetry is recognized when present. Otherwise missing parent delivery remains a failure, but child routing will not be attributable by this helper alone.

Example (the caller owns scenario deadlines, state assertions, evidence saving, and cleanup):

```js
const {prepareNativePointer} = require('./native-pointer.cjs');
let native;
try {
  native = await prepareNativePointer({page});
  const opener = await page.locator('#tront-theme-btn').boundingBox();
  if (!opener) throw Error('Missing opener');
  const openerPoint = {x:opener.x+opener.width/2, y:opener.y+opener.height/2};
  await native.arm(); // Checks identity while dialog is still closed.
  await native.clickAt(openerPoint, {label:'open', expectedId:'tront-theme-btn'});
  await page.waitForFunction(() => document.querySelector('dialog').matches(':modal'));
  const before = await page.evaluate(() => window.__routingSnapshot());
  await native.clickAt(before.reset.point, {label:'reset', expectedAction:'reset'});
  const input = await native.finish(); // Observation only; no further input.
  // Save input even on failure. Assert native theme, empty storage, expected
  // focus, unchanged geometry, and no child click in the caller.
} finally {
  if (native) await native.dispose().catch(() => {});
  await context.close();
}
```

Do not insert screenshots, frame waits, tracing snapshots, or extra readiness barriers between opening and Reset in the immediate cohort. The helper's critical activation contains only one fresh `xdotool mousemove X Y mousedown 1 mouseup 1` invocation. It does not use `click --window`, a command window-stack, a DOM click, retries, repeated activations, or explicit sleeps. This selects XTEST rather than XSendEvent and avoids `xdotool click`'s built-in press/release delay. Default `mousedown`/`mouseup` command overhead is still real and is captured by event times.

Each prepared helper can arm once, permits at most one `open` and one `reset` activation, and expires two seconds after arming. A failed command prohibits further input. `finish()` preserves command errors and requires exactly one trusted parent pointerdown, pointerup, and click at the expected client/screen position for each activation. It records event timing and optional child events. The caller must still assert Reset's application result and compare open-to-down latency with the CDP failure window; changing input timing can change reproduction probability. Native and CDP samples stay separate even when native passes.

All native commands have a two-second deadline; post-input observation is bounded to one second. Close the context after calibration errors because setup may have installed a probe or changed the title before returning a helper. A future caller must bound the total number of contexts and total job duration separately. This helper's pure unit tests do not certify actual Xvfb/Chrome compatibility.

Primary source: [xdotool's official manual](https://github.com/jordansissel/xdotool/blob/master/xdotool.pod), “MOUSE COMMANDS” and “SENDEVENT NOTES.”
