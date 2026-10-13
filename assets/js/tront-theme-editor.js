/*
 * Opt-in theme editor. Gallery and configured projects retain their original
 * appearance until a new palette is chosen. Project-local derivative of
 * TrentSterling/trentsterling.github.io@91d0a6874fbb4769d546574870e25c406a81608d.
 * See tools/project-theme/README.md and vendor-manifest.json for provenance.
 * Reuses the palette and color helpers in tront-system.js without changing its
 * shared engine. Never writes the legacy tront-theme / gallery preference keys.
 *
 * Readability: user colors are composited into bounded sRGB grounds before CSS
 * receives them. One foreground is checked against the component-wise worst
 * bound of ALL page, panel, control and button grounds, not against a different
 * black/white choice at each stop. Interpolation and alpha composition stay
 * inside that bound. tools/theme-editor tests cover ramps and composed grounds; browser checks are separate.
 */
(function (root) {
    'use strict';
    var T = root.Tront;
    if (!T) return;
    var doc = root.document;
    var gallery = !!(doc && doc.documentElement.getAttribute('data-tront-theme-surface') === 'gallery');
    var projectSurface = !!(doc && doc.documentElement.getAttribute('data-tront-theme-surface') === 'project');
    function validOriginal(value) {
        return value && typeof value === 'object' && !Array.isArray(value) &&
            ['dark', 'light'].indexOf(value.mode) !== -1 &&
            [['angle', 0, 360], ['intensity', 0, 100], ['frost', 75, 100]].every(function (range) {
                return Number.isFinite(value[range[0]]) && value[range[0]] >= range[1] && value[range[0]] <= range[2];
            }) && Array.isArray(value.pegs) && value.pegs.length === 4 && value.pegs.every(function (peg) {
                return peg && typeof peg.color === 'string' && /^#[0-9a-f]{6}$/i.test(peg.color) &&
                    T.hexToRgb(peg.color) && Number.isFinite(peg.position) && peg.position >= 0 && peg.position <= 100;
            });
    }
    function projectConfig(value) {
        if (!value || typeof value !== 'object' || ['punk', 'monke'].indexOf(value.id) === -1 ||
            value.storageKey !== 'tront-theme-' + value.id + '-v1' ||
            typeof value.nativeLabel !== 'string' || !value.nativeLabel.trim() || value.nativeLabel.length > 80 ||
            !validOriginal(value.original)) return null;
        return { id: value.id, storageKey: value.storageKey, nativeLabel: value.nativeLabel.trim(),
            original: { mode: value.original.mode, angle: Math.round(value.original.angle),
                intensity: Math.round(value.original.intensity), frost: Math.round(value.original.frost),
                pegs: value.original.pegs.map(function (peg) {
                    return { color: T.toHex(T.hexToRgb(peg.color)), position: Math.round(peg.position) };
                }) } };
    }
    var project = projectSurface ? projectConfig(root.TrontThemeProject) : null;
    // Punk's player is a cross-process frame. Keep its editor in document flow,
    // rather than placing newly interactive controls over an embedded surface.
    var inlineEditor = !!(project && project.id === 'punk');
    // A bad configuration must not opt the page into an unrelated default or key.
    if (projectSurface && !project) return;
    var KEY = project ? project.storageKey : gallery ? 'tront-theme-gallery-v1' : 'tront-theme-editor-v1';
    function originalProject() {
        var original = clone(project.original);
        original.version = 1; original.preset = 'project-original'; original.count = 4;
        return original;
    }
    var PRESETS = [
        { id: 'dark', name: 'Midnight', mode: 'dark', colors: ['#64748b', '#334155', '#171d2e', '#655783'] },
        { id: 'cyan', name: 'Cyan', mode: 'dark', colors: ['#56ccff', '#1871b8', '#2dd4bf', '#99f6e4'] },
        { id: 'purple', name: 'Violet', mode: 'dark', colors: ['#c084fc', '#6847bf', '#c15fba', '#f3b5d7'] },
        { id: 'ember', name: 'Ember', mode: 'dark', colors: ['#ff8b3d', '#ba3e42', '#f2b663', '#783547'] },
        { id: 'moss', name: 'Moss', mode: 'dark', colors: ['#8cbf8d', '#327b73', '#b0c888', '#477863'] },
        { id: 'light', name: 'Paper', mode: 'light', colors: ['#75a1ce', '#c5c0eb', '#efd4b6', '#8ec8c3'] }
    ];
    function clamp(n, lo, hi, fallback) {
        n = Number(n);
        return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
    }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function preset(id) {
        var p = PRESETS.find(function (item) { return item.id === id; }) || PRESETS[0];
        return { version: 1, preset: p.id, mode: p.mode, count: 4, angle: 135, intensity: 65, frost: 88,
            pegs: p.colors.map(function (color, i) { return { color: color, position: Math.round(i * 100 / 3) }; }) };
    }
    function normalize(value) {
        var fallback = preset('dark');
        if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
        if (project && value.preset === 'project-original') return originalProject();
        return {
            version: 1,
            preset: value.preset === 'gallery-original' || PRESETS.some(function (p) { return p.id === value.preset; }) ? value.preset : 'custom',
            mode: value.mode === 'light' ? 'light' : 'dark',
            count: 4, // Older one-to-three-peg choices migrate to the complete stored palette.
            angle: Math.round(clamp(value.angle, 0, 360, 135)),
            intensity: Math.round(clamp(value.intensity, 0, 100, 65)),
            frost: Math.round(clamp(value.frost, 75, 100, 88)),
            pegs: fallback.pegs.map(function (peg, i) {
                var input = Array.isArray(value.pegs) && value.pegs[i];
                return {
                    color: input && typeof input.color === 'string' && T.hexToRgb(input.color) ? T.toHex(T.hexToRgb(input.color)) : peg.color,
                    position: input ? Math.round(clamp(input.position, 0, 100, peg.position)) : peg.position
                };
            })
        };
    }
    function fromLegacy(id) {
        return preset(({ 'tront-cyan': 'cyan', 'tront-purple': 'purple', 'tront-ember': 'ember', light: 'light' })[id] || 'dark');
    }
    function luminance(rgb) {
        var c = rgb.map(function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    }
    function contrast(a, b) {
        var x = luminance(a), y = luminance(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    }
    // The direction and final foreground remain the same for the entire theme.
    function readable(color, bound, ink, target) {
        target = target || 4.7;
        for (var i = 0; i <= 100; i++) {
            var candidate = T.mix(color, ink, i / 100);
            if (contrast(candidate, bound) >= target) return candidate;
        }
        return ink;
    }
    function orderedPegs(state) {
        return state.pegs.slice(0, state.count).map(function (p, i) {
            return { color: T.hexToRgb(p.color), position: p.position, order: i };
        }).sort(function (a, b) { return a.position - b.position || a.order - b.order; });
    }
    function sample(stops, position) {
        if (position < stops[0].position) return stops[0].color.slice();
        for (var i = 1; i < stops.length; i++) {
            if (position < stops[i].position) {
                var a = stops[i - 1], b = stops[i];
                return T.mix(a.color, b.color, (position - a.position) / (b.position - a.position));
            }
        }
        return stops[stops.length - 1].color.slice();
    }
    function gradient(stops, angle) {
        // Explicit interpolation matches the sampling and compositing tests.
        var parts = stops.map(function (p) { return T.toHex(p.color) + ' ' + p.position + '%'; });
        if (parts.length === 1) parts.push(parts[0]);
        return 'linear-gradient(' + angle + 'deg in srgb, ' + parts.join(', ') + ')';
    }
    function buildTokens(input) {
        var state = normalize(input), dark = state.mode === 'dark';
        var base = dark ? [15, 18, 24] : [249, 250, 252];
        var panel = dark ? [23, 28, 37] : [255, 255, 255];
        var elem = dark ? [33, 40, 51] : [238, 241, 246];
        var hover = dark ? [44, 53, 65] : [224, 229, 237];
        var ink = dark ? [245, 247, 250] : [23, 28, 36];
        var raw = orderedPegs(state);
        var wash = raw.map(function (p) { return { position: p.position, color: T.mix(base, p.color, state.intensity / 100 * (dark ? 0.30 : 0.16)) }; });
        var button = raw.map(function (p) { return { position: p.position, color: T.mix(base, p.color, dark ? 0.35 : 0.20) }; });
        var grounds = [base, panel, elem, hover].concat(wash.map(function (p) { return p.color; }), button.map(function (p) { return p.color; }));
        var bound = [0, 1, 2].map(function (channel) {
            return Math[dark ? 'max' : 'min'].apply(Math, grounds.map(function (rgb) { return rgb[channel]; }));
        });
        var accent = readable(T.hexToRgb(state.pegs[0].color), bound, ink);
        var secondary = readable(T.hexToRgb(state.pegs[1].color), bound, ink);
        var muted = readable(dark ? [181, 192, 209] : [77, 87, 105], bound, ink);
        var colors = {
            ink: ink, muted: muted, accent: accent, secondary: secondary,
            green: readable([46, 180, 108], bound, ink),
            orange: readable([231, 141, 59], bound, ink),
            red: readable([227, 83, 112], bound, ink),
            blue: readable([83, 159, 228], bound, ink)
        };
        // Opaque grid lines stay inside the already-checked button color bounds.
        var gridX = T.mix(base, raw[0].color, dark ? 0.28 : 0.20);
        var gridY = T.mix(base, raw[2].color, dark ? 0.28 : 0.20);
        var vars = {
            '--te-bg': T.toHex(base), '--te-panel': T.toHex(panel), '--te-elem': T.toHex(elem), '--te-hover': T.toHex(hover),
            '--te-panel-fill': 'rgba(' + panel.join(',') + ',' + state.frost / 100 + ')',
            '--te-blur': (100 - state.frost) / 2 + 'px',
            '--te-wash': gradient(wash, state.angle), '--te-button': gradient(button, state.angle),
            '--te-preview': gradient(raw, state.angle),
            '--te-grid-x': T.toHex(gridX), '--te-grid-y': T.toHex(gridY),
            '--te-glow-opacity': String(state.intensity / 100 * (dark ? 0.15 : 0.08)),
            '--te-line': T.toHex(readable(T.mix(panel, ink, 0.28), bound, ink, 3.1))
        };
        Object.keys(colors).forEach(function (key) { vars['--te-' + key] = T.toHex(colors[key]); });
        return { state: state, vars: vars, colors: colors, bound: bound,
            grounds: { base: base, panel: panel, elem: elem, hover: hover, wash: wash, button: button, raw: raw } };
    }
    function colorMagic(input, random) {
        var state = normalize(input), rng = random || Math.random;
        var rule = T.HARMONY_RULES[Math.floor(rng() * T.HARMONY_RULES.length)];
        var harmony = T.generateHarmony([rng() * 360, 58 + rng() * 25, 48 + rng() * 17], rule);
        state.pegs = state.pegs.map(function (peg, i) {
            return { color: T.toHex(T.hslToRgb.apply(null, harmony[i % harmony.length])), position: peg.position };
        });
        state.preset = 'custom';
        return state;
    }
    root.TrontThemeEditor = { key: KEY, presets: clone(PRESETS), preset: preset, normalize: normalize,
        fromLegacy: fromLegacy, buildTokens: buildTokens, sample: sample, contrast: contrast, colorMagic: colorMagic };

    if (!doc || !doc.documentElement.hasAttribute('data-tront-theme-editor')) return;
    var html = doc.documentElement;
    var nativeColorScheme = html.style.colorScheme || '';
    var storageAvailable = true, legacyGallery = 'dark', galleryCards = [];
    function originalGallery() {
        var original = fromLegacy(legacyGallery);
        if (legacyGallery === 'dark') {
            original.pegs = ['#a855f7', '#ff8b3d', '#2ee6d7', '#58a6ff'].map(function (color, i) { return { color: color, position: Math.round(i * 100 / 3) }; });
        }
        original.preset = 'gallery-original';
        return original;
    }
    function readStored() {
        try {
            if (!project) legacyGallery = root.localStorage.getItem('tront-theme') || 'dark';
            var saved = root.localStorage.getItem(KEY);
            if (saved) {
                try {
                    var parsed = JSON.parse(saved);
                    if (parsed && parsed.version === 1 && (!project ||
                        (parsed.count === 4 && validOriginal(parsed) && parsed.preset !== 'gallery-original'))) return normalize(parsed);
                } catch (_) { /* Fall back to the prior choice. */ }
            }
            return project ? originalProject() : gallery ? originalGallery() : fromLegacy(legacyGallery);
        } catch (_) { storageAvailable = false; return project ? originalProject() : gallery ? originalGallery() : preset('dark'); }
    }
    var state = readStored(), history = [], draftStart = null, dialog, opener, status, currentTokens;
    function apply() {
        currentTokens = buildTokens(state);
        Object.keys(currentTokens.vars).forEach(function (key) { html.style.setProperty(key, currentTokens.vars[key]); });
        html.setAttribute('data-te-mode', state.mode);
        var nativeProject = project && state.preset === 'project-original';
        if (project) html.setAttribute('data-te-project', nativeProject ? 'native' : 'custom');
        html.style.colorScheme = nativeProject ? nativeColorScheme : state.mode;
        // Reading the original gallery choice never rewrites its old preference.
        var nativeGallery = gallery && state.preset === 'gallery-original';
        if (gallery) html.setAttribute('data-te-gallery', nativeGallery ? 'native' : 'custom');
        if (!project) {
            if (nativeGallery && legacyGallery !== 'dark') html.setAttribute('data-theme', legacyGallery);
            else html.removeAttribute('data-theme');
        }
        galleryCards.forEach(function (card) {
            var accent = readable(card.color, currentTokens.bound, currentTokens.colors.ink);
            card.element.style.setProperty('--te-card-accent', T.toHex(accent));
        });
        if (html.getAttribute('data-tront-theme-surface') === 'blog') html.setAttribute('data-mode', state.mode);
    }
    function save() {
        try {
            // Native reset removes only this project's choice, never other preferences.
            if (project && state.preset === 'project-original') root.localStorage.removeItem(KEY);
            else root.localStorage.setItem(KEY, JSON.stringify(state));
            storageAvailable = true;
        }
        catch (_) { storageAvailable = false; }
    }
    function remember(previous) {
        if (JSON.stringify(previous) === JSON.stringify(state)) return;
        history.push(clone(previous));
        if (history.length > 30) history.shift();
    }
    function commit(next) {
        var previous = clone(state);
        state = normalize(next);
        remember(previous); draftStart = null;
        apply(); save(); sync();
    }
    function announce() {
        if (status) status.textContent = storageAvailable ? (project ? 'Choices save only on this site in this browser.' : gallery ? 'Games keeps its radial background. Choices save in this browser.' : 'Choices save in this browser.') : 'Preview only. Browser storage is unavailable.';
    }
    function sync() {
        if (!dialog) return;
        dialog.querySelector('[name="preset"]').value = state.preset;
        dialog.querySelectorAll('[name="mode"]').forEach(function (input) { input.checked = input.value === state.mode; });
        ['angle', 'intensity', 'frost'].forEach(function (name) {
            dialog.querySelector('[name="' + name + '"]').value = state[name];
            var out = dialog.querySelector('[data-value="' + name + '"]');
            if (out) out.textContent = state[name] + (name === 'angle' ? '°' : '%');
        });
        state.pegs.forEach(function (peg, i) {
            dialog.querySelector('[name="color-' + i + '"]').value = peg.color;
            dialog.querySelector('[name="position-' + i + '"]').value = peg.position;
            dialog.querySelector('[data-value="position-' + i + '"]').textContent = peg.position + '%';
        });
        dialog.querySelector('[data-action="undo"]').disabled = !history.length;
        var original = gallery && state.preset === 'gallery-original';
        var legacyLabel = ({ 'tront-cyan': ['⚡', 'Cyan'], 'tront-purple': ['🔮', 'Purple'], 'tront-ember': ['🔥', 'Ember'], light: ['☀️', 'Light'] })[legacyGallery] || ['🌙', 'Dark'];
        opener.querySelector('.theme-label').textContent = original ? ' ' + legacyLabel[1] : ' Theme';
        opener.querySelector('.theme-icon').textContent = original ? legacyLabel[0] : state.mode === 'dark' ? '◐' : '◑';
        announce();
    }
    function init() {
        opener = doc.getElementById('tront-theme-btn');
        if (!opener || !root.HTMLDialogElement || typeof root.HTMLDialogElement.prototype.showModal !== 'function') return;
        dialog = doc.createElement('dialog');
        dialog.id = 'tront-theme-editor';
        dialog.className = 'te-dialog' + (inlineEditor ? ' te-inline' : '');
        dialog.setAttribute('aria-labelledby', 'te-title');
        var actions = '<div class="te-actions"><button type="button" data-action="undo">Undo</button><button type="button" data-action="reset">Reset</button></div>';
        dialog.innerHTML = '<div class="te-heading"><div><h2 id="te-title">Theme</h2></div><button type="button" class="te-close" data-action="close" aria-label="Close theme editor">×</button></div>' + (inlineEditor ? actions : '') +
            '<div class="te-presets"><label for="te-preset">Palette</label><select id="te-preset" name="preset">' + PRESETS.map(function (p) { return '<option value="' + p.id + '">' + p.name + '</option>'; }).join('') + (project ? '<option value="project-original">' + project.nativeLabel.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }) + '</option>' : gallery ? '<option value="gallery-original">Original gallery</option>' : '') + '<option value="custom" disabled>Custom</option></select><button type="button" data-action="magic">ColorMagic</button></div>' +
            '<fieldset class="te-mode"><legend>Appearance</legend><label><input type="radio" name="mode" value="dark"> Dark</label><label><input type="radio" name="mode" value="light"> Light</label></fieldset>' +
            '<div class="te-preview" role="img" aria-label="Your selected gradient colors"></div>' +
            '<section class="te-details" aria-labelledby="te-gradient-title"><h3 id="te-gradient-title">Gradient</h3><div class="te-tuning">' +
            [0, 1, 2, 3].map(function (i) { return '<div class="te-peg" data-peg-row="' + i + '"><label for="te-color-' + i + '">Color ' + (i + 1) + '</label><input id="te-color-' + i + '" name="color-' + i + '" type="color"><input type="range" min="0" max="100" step="1" id="te-position-' + i + '" name="position-' + i + '" aria-label="Color ' + (i + 1) + ' position"><output for="te-position-' + i + '" data-value="position-' + i + '"></output></div>'; }).join('') +
            '<label class="te-slider" for="te-angle">Angle <output for="te-angle" data-value="angle"></output><input id="te-angle" type="range" name="angle" min="0" max="360" step="1"></label>' +
            '<label class="te-slider" for="te-intensity">Color intensity <output for="te-intensity" data-value="intensity"></output><input id="te-intensity" type="range" name="intensity" min="0" max="100" step="1"></label>' +
            '<label class="te-slider" for="te-frost">Panel frost <output for="te-frost" data-value="frost"></output><input id="te-frost" type="range" name="frost" min="75" max="100" step="1"></label>' +
            '<p class="te-hint">Page colors stay softened so the text stays readable.</p></div></section>' +
            (inlineEditor ? '' : actions) + '<p class="te-status" role="status" aria-live="polite"></p>';
        if (inlineEditor) doc.body.insertBefore(dialog, doc.body.firstChild);
        else doc.body.appendChild(dialog);
        if (gallery && doc.querySelectorAll) {
            galleryCards = Array.prototype.map.call(doc.querySelectorAll('.item'), function (element) {
                return { element: element, color: T.hexToRgb(element.style.getPropertyValue('--highlight-color').trim()) || currentTokens.colors.accent };
            });
            apply();
        }
        status = dialog.querySelector('.te-status');
        opener.type = 'button'; opener.hidden = false;
        opener.setAttribute('aria-label', 'Choose a theme');
        opener.setAttribute('aria-haspopup', 'dialog');
        opener.setAttribute('aria-controls', dialog.id);
        opener.setAttribute('aria-expanded', 'false');
        var dialogSessionOpen = false;
        var readingPosition = null;
        var presentation = 0;
        var main = inlineEditor && doc.querySelector ? doc.querySelector('main') : null;
        var mainWasInert = main ? main.inert : false;
        function afterPaint(callback) {
            root.requestAnimationFrame(function () { root.requestAnimationFrame(callback); });
        }
        function setBusy(busy) {
            dialog.inert = busy;
            dialog.setAttribute('aria-busy', String(busy));
            opener.setAttribute('aria-busy', String(busy));
            if (main) main.inert = busy || mainWasInert;
        }
        function present(token, opened, started) {
            // First present the layout, then present the restored page input
            // state. Controls are exposed only after those two paint boundaries.
            afterPaint(function () {
                if (token !== presentation || dialog.open !== opened) return;
                if (main) main.inert = mainWasInert;
                afterPaint(function () {
                    if (token !== presentation || dialog.open !== opened) return;
                    setBusy(false);
                    dialog.setAttribute('data-te-phase', opened ? 'ready' : 'closed');
                    dialog.setAttribute('data-te-transition-ms', String(Date.now() - started));
                    if (opened) dialog.querySelector('[data-action="close"]').focus({ preventScroll: true });
                    else if (doc.activeElement === opener || doc.activeElement === doc.body || dialog.contains && dialog.contains(doc.activeElement)) opener.focus({ preventScroll: true });
                });
            });
        }
        function finishClose() {
            // Native close events are queued. An older event must never alter a
            // reopened dialog, split its draft, or steal focus from a later action.
            if (dialog.open || !dialogSessionOpen) return;
            dialogSessionOpen = false;
            if (draftStart) { remember(draftStart); draftStart = null; sync(); }
            opener.setAttribute('aria-expanded', 'false');
            if (inlineEditor && readingPosition) {
                root.scrollTo({ left: readingPosition.x, top: readingPosition.y, behavior: 'instant' });
                readingPosition = null;
            }
            // Native close already restored focus. Never overwrite a newer
            // focus choice when its queued notification eventually arrives.
        }
        function closeEditor() {
            if (!dialog.open) return;
            var token, started;
            if (inlineEditor) {
                token = ++presentation; started = Date.now(); setBusy(true);
                dialog.setAttribute('data-te-phase', 'closing');
            }
            dialog.close();
            // Our close button/backdrop updates are synchronous; native Escape
            // still uses the browser's close event and its default behavior.
            finishClose();
            if (inlineEditor) present(token, false, started);
            else if (!dialog.open) opener.focus({ preventScroll: true });
        }
        opener.addEventListener('click', function () {
            if (dialog.open) return;
            // A native close may have finished before its notification arrived.
            finishClose();
            if (inlineEditor) {
                readingPosition = { x: root.scrollX, y: root.scrollY };
                var token = ++presentation, started = Date.now();
                setBusy(true); dialog.setAttribute('data-te-phase', 'opening');
                dialog.show();
                root.scrollTo({ left: 0, top: 0, behavior: 'instant' });
            } else dialog.showModal();
            dialogSessionOpen = true;
            opener.setAttribute('aria-expanded', 'true');
            if (inlineEditor) present(token, true, started);
            else dialog.querySelector('[data-action="close"]').focus({ preventScroll: true });
        });
        opener.addEventListener('keydown', function (event) {
            if (inlineEditor && dialog.open && event.key === 'Escape') { event.preventDefault(); closeEditor(); }
        });
        dialog.addEventListener('close', finishClose);
        // Keep sequential keyboard navigation inside the editor even when a
        // browser would otherwise move from the last control to browser chrome.
        // These endpoints are always visible/enabled; native Tab order between
        // them still handles the native radio and slider controls.
        dialog.addEventListener('keydown', function (event) {
            if (inlineEditor) {
                if (event.key === 'Escape') { event.preventDefault(); closeEditor(); }
                return; // An in-page editor does not trap navigation to the page.
            }
            if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
            var first = dialog.querySelector('[data-action="close"]');
            var last = dialog.querySelector('[data-action="reset"]');
            if (event.shiftKey && doc.activeElement === first) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && doc.activeElement === last) {
                event.preventDefault(); first.focus();
            }
        });
        var backdropDown = false;
        function isOutside(event) {
            var rect = dialog.getBoundingClientRect();
            return !inlineEditor && event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
        }
        dialog.addEventListener('pointerdown', function (event) { backdropDown = isOutside(event); });
        dialog.addEventListener('click', function (event) {
            if (backdropDown && isOutside(event)) { closeEditor(); return; }
            var action = event.target.closest('[data-action]');
            if (!action) return;
            if (action.dataset.action === 'close') closeEditor();
            if (action.dataset.action === 'magic') commit(colorMagic(state));
            if (action.dataset.action === 'reset') commit(project ? originalProject() : gallery ? originalGallery() : preset('dark'));
            if (action.dataset.action === 'undo' && history.length) {
                state = history.pop(); draftStart = null; apply(); save(); sync();
            }
        });
        function updateInput(input) {
            var name = input.name;
            if (!name || name === 'preset' || name === 'mode') return;
            if (!draftStart) draftStart = clone(state);
            var next = clone(state);
            if (/^color-\d$/.test(name)) next.pegs[Number(name.slice(-1))].color = input.value;
            else if (/^position-\d$/.test(name)) next.pegs[Number(name.slice(-1))].position = Number(input.value);
            else if (['angle', 'intensity', 'frost'].indexOf(name) !== -1) next[name] = Number(input.value);
            else return;
            next.preset = 'custom'; state = normalize(next); apply(); save(); sync();
        }
        dialog.addEventListener('input', function (event) { updateInput(event.target); });
        dialog.addEventListener('change', function (event) {
            var input = event.target;
            if (input.name === 'preset') { commit(input.value === 'project-original' && project ? originalProject() : input.value === 'gallery-original' && gallery ? originalGallery() : preset(input.value)); return; }
            if (input.name === 'mode') { var next = clone(state); next.mode = input.value; next.preset = 'custom'; commit(next); return; }
            updateInput(input);
            if (draftStart) { remember(draftStart); draftStart = null; sync(); }
        });
        root.addEventListener('storage', function (event) {
            if (event.key !== KEY && !(project && event.key === null)) return;
            state = readStored(); history = []; draftStart = null; apply(); sync();
        });
        sync();
    }
    apply();
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
