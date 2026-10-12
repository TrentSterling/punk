/* Pure engine and DOM-contract tests. These do not replace browser/render QA. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.resolve(__dirname, '../..');
const systemSource = fs.readFileSync(path.join(base, 'assets/js/tront-system.js'), 'utf8');
const editorSource = fs.readFileSync(path.join(base, 'assets/js/tront-theme-editor.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

// Minimal DOM contract, deliberately not a layout engine or browser substitute.
class Element {
    constructor(tag = 'div', attrs = {}, doc) {
        this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.listeners = {};
        this.children = []; this.doc = doc; this.value = attrs.value || ''; this.name = attrs.name || '';
        this.hidden = 'hidden' in attrs; this.disabled = 'disabled' in attrs; this.checked = false;
        this.style = { values: {}, setProperty: (key, value) => { this.style.values[key] = value; } };
        this.dataset = Object.fromEntries(Object.entries(attrs).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value]));
    }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    getAttribute(key) { return this.attrs[key]; }
    hasAttribute(key) { return key in this.attrs; }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
    fire(type, extra = {}) { const event = { type, target: this, ...extra }; for (const listener of this.listeners[type] || []) listener(event); }
    appendChild(child) { this.children.push(child); }
    focus() { this.doc.activeElement = this; }
    matches(selector) {
        if (selector[0] === '.') return (this.attrs.class || '').split(' ').includes(selector.slice(1));
        const match = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
        if (match) return match[1] in this.attrs && (match[2] === undefined || this.attrs[match[1]] === match[2]);
        return this.tagName.toLowerCase() === selector;
    }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return this.matches(selector) ? this : null; }
    getBoundingClientRect() { return { left: 100, top: 100, right: 540, bottom: 700 }; }
    set innerHTML(markup) {
        this.markup = markup; this.children = [];
        for (const match of markup.matchAll(/<([a-z][\w-]*)([^>]*)>/gi)) {
            const attrs = {};
            for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[attr[1]] = attr[2] || '';
            this.children.push(new Element(match[1], attrs, this.doc));
        }
    }
}
class Dialog extends Element {
    showModal() { assert.equal(this.open || false, false, 'showModal is not called twice'); this.open = true; }
    close() { this.open = false; this.fire('close'); }
}
function environment(options = {}) {
    const writes = [], reads = [], store = { ...(options.storage || {}) };
    const doc = { readyState: options.loading ? 'loading' : 'complete', listeners: {}, activeElement: null };
    doc.documentElement = new Element('html', options.optIn === false ? {} : { 'data-tront-theme-editor': '', ...(options.gallery ? { 'data-tront-theme-surface': 'gallery', 'data-te-gallery': 'native' } : {}) }, doc);
    doc.body = new Element('body', {}, doc);
    const opener = new Element('button', { id: 'tront-theme-btn', hidden: '' }, doc);
    opener.children.push(new Element('span', { class: 'theme-label' }, doc), new Element('span', { class: 'theme-icon' }, doc));
    doc.getElementById = id => id === 'tront-theme-btn' ? opener : null;
    doc.createElement = name => name === 'dialog' ? new Dialog(name, {}, doc) : new Element(name, {}, doc);
    doc.addEventListener = (name, callback) => { (doc.listeners[name] ||= []).push(callback); };
    const events = {};
    const win = { document: doc, HTMLDialogElement: options.noDialog ? undefined : Dialog,
        localStorage: {
            getItem(key) { if (options.deniedStorage) throw new Error('SecurityError'); reads.push(key); return store[key] ?? null; },
            setItem(key, value) { if (options.deniedStorage || options.deniedWrite) throw new Error('QuotaExceededError'); store[key] = value; writes.push([key, value]); }
        },
        addEventListener(name, callback) { (events[name] ||= []).push(callback); }
    };
    const context = vm.createContext({ window: win });
    if (!options.noSystem) vm.runInContext(systemSource, context);
    vm.runInContext(editorSource, context);
    return { win, doc, opener, writes, reads, store,
        api: win.TrontThemeEditor,
        ready() { doc.readyState = 'complete'; (doc.listeners.DOMContentLoaded || []).forEach(fn => fn()); },
        get dialog() { return doc.body.children[0]; },
        storageEvent(key) { (events.storage || []).forEach(fn => fn({ key })); }
    };
}
const engine = environment({ optIn: false }).api;
function stateOf(env) { return JSON.parse(env.store[env.api.key]); }
function click(env, action) { env.dialog.fire('click', { target: env.dialog.querySelector(`[data-action="${action}"]`) }); }
function change(env, name, value, type = 'change') {
    const control = env.dialog.querySelectorAll(`[name="${name}"]`).find(input => name !== 'mode' || input.value === value);
    assert.ok(control, `control ${name} exists`); control.value = String(value);
    env.dialog.fire(type, { target: control });
}
function checkRamp(state, steps = 128) {
    const tokens = engine.buildTokens(state), T = environmentPure;
    const { wash, button, panel, base, elem, hover } = tokens.grounds;
    for (let i = 0; i <= steps; i++) {
        const page = engine.sample(wash, i * 100 / steps);
        const frosted = T.mix(page, panel, tokens.state.frost / 100);
        const nested = T.mix(frosted, panel, tokens.state.frost / 100);
        const a = Number(tokens.vars['--te-glow-opacity']);
        const glow = T.mix(T.mix(base, tokens.grounds.raw[0].color, a), tokens.grounds.raw[2].color, a);
        const grounds = [base, panel, elem, hover, page, frosted, nested, glow, T.mix(glow, panel, tokens.state.frost / 100), T.hexToRgb(tokens.vars['--te-grid-x']), T.hexToRgb(tokens.vars['--te-grid-y']), engine.sample(button, i * 100 / steps)];
        for (const [name, foreground] of Object.entries(tokens.colors)) {
            for (const background of grounds) assert.ok(engine.contrast(foreground, background) >= 4.5, `${name} failed ${JSON.stringify(state)}`);
        }
    }
    for (const color of Object.values(tokens.colors)) assert.ok(engine.contrast(color, tokens.bound) >= 4.7);
    assert.ok(engine.contrast(environmentPure.hexToRgb(tokens.vars['--te-line']), tokens.bound) >= 3.1, 'borders/controls stay visible');
}
const environmentPure = environment({ optIn: false }).win.Tront;

test('all presets, modes, legacy peg-count migrations, grid and radial grounds pass contrast', () => {
    for (const p of engine.presets) for (const mode of ['dark', 'light']) for (const count of [1, 2, 3, 4]) {
        for (const intensity of [0, 50, 100]) for (const frost of [75, 100]) {
            checkRamp({ ...engine.preset(p.id), mode, count, intensity, frost });
        }
    }
});
test('extreme colors, coincident/crossed stops and 240 deterministic random themes remain readable', () => {
    let seed = 314159;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let n = 0; n < 240; n++) {
        const state = engine.preset('dark');
        state.mode = n % 2 ? 'light' : 'dark'; state.count = 1 + n % 4;
        state.intensity = n % 3 === 0 ? 100 : Math.floor(random() * 101); state.frost = 75 + n % 26;
        state.pegs = state.pegs.map((p, i) => ({ color: n < 16 ? ['#000000', '#ffffff', '#ff00ff', '#00ff00'][(n + i) % 4] : '#' + Math.floor(random() * 0x1000000).toString(16).padStart(6, '0'), position: n < 16 ? [100, 0, 50, 50][i] : Math.floor(random() * 101) }));
        checkRamp(state, 257);
    }
});
test('normalization rejects injected colors, limits all fields, retains four independent pegs', () => {
    const s = engine.normalize({ mode: 'bad', count: 99, angle: -1, intensity: Infinity, frost: 0, pegs: [{ color: 'red);url(evil)', position: -4 }, { color: '#fff', position: 300 }] });
    assert.equal(s.count, 4); assert.equal(s.mode, 'dark'); assert.equal(s.angle, 0); assert.equal(s.intensity, 65); assert.equal(s.frost, 75);
    assert.equal(s.pegs.length, 4); assert.equal(s.pegs[0].position, 0); assert.equal(s.pegs[1].position, 100); assert.equal(s.pegs[1].color, '#ffffff');
    assert.equal(s.pegs[0].color, engine.preset('dark').pegs[0].color);
    for (const bad of [null, [], true, 7, 'bad']) assert.deepEqual(plain(engine.normalize(bad)), plain(engine.preset('dark')));
});
test('four movable stops render exact sorted positions and preserve old hidden colors', () => {
    const state = engine.preset('cyan'); state.angle = 217;
    state.pegs = [{ color: '#ff0000', position: 75 }, { color: '#00ff00', position: 10 }, { color: '#0000ff', position: 75 }, { color: '#ffffff', position: 100 }];
    const tokens = engine.buildTokens(state);
    assert.deepEqual(plain(tokens.grounds.raw.map(p => p.position)), [10, 75, 75, 100]);
    assert.match(tokens.vars['--te-preview'], /^linear-gradient\(217deg in srgb, #00ff00 10%, #ff0000 75%, #0000ff 75%, #ffffff 100%\)$/);
    assert.deepEqual(plain(engine.sample(tokens.grounds.raw, 75)), [0, 0, 255]);
    state.count = 1; const migrated = engine.buildTokens(state);
    assert.equal(migrated.state.count, 4);
    assert.deepEqual(plain(migrated.state.pegs), plain(state.pegs));
});
test('ColorMagic preserves four stops, mode, positions, angle and frost while replacing the palette', () => {
    const prior = engine.preset('light'); prior.pegs[0].position = 22;
    const next = engine.colorMagic(prior, () => .314);
    for (const key of ['mode', 'count', 'angle', 'intensity', 'frost']) assert.equal(next[key], prior[key]);
    assert.deepEqual(plain(next.pegs.map(p => p.position)), plain(prior.pegs.map(p => p.position)));
    assert.notDeepEqual(plain(next.pegs), plain(prior.pegs)); assert.equal(next.preset, 'custom');
    checkRamp(next);
});
test('non-opted-in documents do not touch storage, styles, markup or the old gallery button', () => {
    const env = environment({ optIn: false });
    assert.equal(env.reads.length, 0); assert.equal(env.writes.length, 0); assert.equal(env.doc.body.children.length, 0);
    assert.deepEqual(env.doc.documentElement.style.values, {}); assert.equal(env.opener.hidden, true);
});
test('known legacy preferences migrate without changing the old key or writing on load', () => {
    for (const [old, current] of Object.entries({ dark: 'dark', 'tront-cyan': 'cyan', 'tront-purple': 'purple', 'tront-ember': 'ember', light: 'light', unknown: 'dark' })) {
        const env = environment({ storage: { 'tront-theme': old, 'tront-previews-paused': '1' } });
        assert.equal(env.dialog.querySelector('[name="preset"]').value, current); assert.equal(env.writes.length, 0);
        change(env, 'mode', 'light'); click(env, 'magic'); click(env, 'reset'); click(env, 'undo'); assert.equal(env.store['tront-theme'], old); assert.equal(env.store['tront-previews-paused'], '1');
        assert.ok(env.writes.every(([key]) => key === engine.key));
    }
});
test('saved themes restore, malformed/unsupported saved themes fall back to the prior preference', () => {
    const saved = engine.preset('moss'); saved.angle = 203;
    let env = environment({ storage: { [engine.key]: JSON.stringify(saved), 'tront-theme': 'light' } });
    assert.equal(env.dialog.querySelector('[name="angle"]').value, 203);
    for (const broken of ['{', 'null', '{"version":2}', 'true']) {
        env = environment({ storage: { [engine.key]: broken, 'tront-theme': 'light' } });
        assert.equal(env.doc.documentElement.attrs['data-te-mode'], 'light'); assert.equal(env.writes.length, 0);
    }
});
test('storage denial and quota failures still allow theme changes and show an honest status', () => {
    for (const options of [{ deniedStorage: true }, { deniedWrite: true }]) {
        const env = environment(options); change(env, 'mode', 'light'); click(env, 'magic');
        assert.equal(env.doc.documentElement.attrs['data-te-mode'], 'light');
        assert.match(env.dialog.querySelector('.te-status').textContent, /Preview only/); assert.equal(env.writes.length, 0);
    }
});
test('head initialization paints the saved theme before DOM ready and mounts controls afterward', () => {
    const env = environment({ loading: true, storage: { 'tront-theme': 'light' } });
    assert.equal(env.doc.documentElement.attrs['data-te-mode'], 'light'); assert.equal(env.dialog, undefined);
    env.ready(); assert.ok(env.dialog); assert.equal(env.opener.hidden, false);
});
test('unavailable native dialogs or missing color helpers leave unavailable controls hidden', () => {
    for (const options of [{ noDialog: true }, { noSystem: true }]) {
        const env = environment(options); assert.equal(env.opener.hidden, true); assert.equal(env.dialog, undefined);
    }
});
test('repeated open/close is idempotent and restores focus and expanded state', () => {
    const env = environment();
    for (let i = 0; i < 4; i++) {
        env.opener.fire('click'); env.opener.fire('click');
        assert.equal(env.dialog.open, true); assert.equal(env.opener.attrs['aria-expanded'], 'true');
        assert.equal(env.doc.activeElement.attrs['aria-label'], 'Close theme editor');
        click(env, 'close'); assert.equal(env.dialog.open, false); assert.equal(env.doc.activeElement, env.opener);
        assert.equal(env.opener.attrs['aria-expanded'], 'false');
    }
    // A native Escape dismissal raises the same close event; its browser default
    // and focus containment need the separate real-browser smoke test.
    env.opener.fire('click'); env.dialog.close(); assert.equal(env.doc.activeElement, env.opener);
});
test('Tab wraps only at modal boundaries; reverse Tab, modifiers and other keys keep native behavior', () => {
    const env = environment(); env.opener.fire('click');
    const first = env.dialog.querySelector('[data-action="close"]');
    const last = env.dialog.querySelector('[data-action="reset"]');
    function key(active, key, modifiers = {}) {
        let prevented = false; active.focus();
        env.dialog.fire('keydown', { key, ...modifiers, preventDefault() { prevented = true; } });
        return prevented;
    }
    for (let i = 0; i < 4; i++) {
        assert.equal(key(last, 'Tab'), true); assert.equal(env.doc.activeElement, first);
        assert.equal(key(first, 'Tab', { shiftKey: true }), true); assert.equal(env.doc.activeElement, last);
    }
    assert.equal(key(first, 'Tab'), false, 'native forward navigation is retained within the editor');
    assert.equal(key(last, 'Tab', { shiftKey: true }), false, 'native reverse navigation is retained within the editor');
    const middle = env.dialog.querySelector('[name="angle"]');
    assert.equal(key(middle, 'Tab'), false); assert.equal(key(middle, 'Tab', { shiftKey: true }), false);
    for (const modifiers of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) assert.equal(key(last, 'Tab', modifiers), false);
    assert.equal(key(first, 'Escape'), false, 'native Escape dismissal remains untouched');
    assert.equal(key(middle, 'ArrowRight'), false, 'native slider keyboard editing remains untouched');
    assert.equal(env.dialog.querySelectorAll('[data-peg-row]').length, 4);
    assert.equal(env.dialog.querySelector('[name="count"]'), null);
});
test('outside dismissal requires both pointerdown and click outside; dragging out does not dismiss', () => {
    const env = environment(); env.opener.fire('click');
    env.dialog.fire('pointerdown', { clientX: 200, clientY: 200 });
    env.dialog.fire('click', { clientX: 10, clientY: 10 }); assert.equal(env.dialog.open, true);
    env.dialog.fire('pointerdown', { clientX: 10, clientY: 10 });
    env.dialog.fire('click', { clientX: 10, clientY: 10 }); assert.equal(env.dialog.open, false);
});
test('continuous editing is one undo step; reset is undoable; all four pegs stay visible', () => {
    const env = environment(); const original = engine.preset('dark');
    change(env, 'angle', 23, 'input'); change(env, 'angle', 24, 'input'); change(env, 'angle', 25, 'input'); change(env, 'angle', 25);
    assert.equal(stateOf(env).angle, 25); click(env, 'undo'); assert.equal(stateOf(env).angle, original.angle);
    assert.equal(env.dialog.querySelector('[data-action="undo"]').disabled, true);
    change(env, 'color-3', '#ff00aa');
    assert.equal(stateOf(env).pegs[3].color, '#ff00aa'); assert.equal(env.dialog.querySelector('[data-peg-row="3"]').hidden, false);
    const before = stateOf(env); click(env, 'reset'); assert.equal(stateOf(env).preset, 'dark'); click(env, 'undo'); assert.deepEqual(stateOf(env), before);
});
test('preset/mode changes and external saved choices remain in sync without touching gallery storage', () => {
    const env = environment({ storage: { 'tront-theme': 'tront-ember', 'tront-previews-paused': 'true' } });
    change(env, 'preset', 'light'); assert.equal(stateOf(env).mode, 'light'); change(env, 'mode', 'dark'); assert.equal(stateOf(env).mode, 'dark');
    env.store[engine.key] = JSON.stringify(engine.preset('cyan')); const count = env.writes.length; env.storageEvent(engine.key);
    assert.equal(env.dialog.querySelector('[name="preset"]').value, 'cyan'); assert.equal(env.writes.length, count);
    env.storageEvent('tront-theme'); assert.equal(env.dialog.querySelector('[name="preset"]').value, 'cyan');
    assert.equal(env.store['tront-theme'], 'tront-ember'); assert.equal(env.store['tront-previews-paused'], 'true');
});
test('all generated controls have accessible names and native keyboard semantics', () => {
    const env = environment(), markup = env.dialog.markup;
    assert.equal(env.opener.attrs['aria-haspopup'], 'dialog'); assert.equal(env.dialog.attrs['aria-labelledby'], 'te-title');
    assert.match(markup, /<fieldset[^>]*>\s*<legend>Appearance<\/legend>/);
    for (const input of env.dialog.querySelectorAll('input')) {
        assert.ok(input.attrs['aria-label'] || (input.attrs.id && markup.includes(`for="${input.attrs.id}"`)) || input.name === 'mode');
    }
    assert.equal(env.dialog.querySelector('[data-action="close"]').attrs.type, 'button');
});
test('integration adds the editor while preserving the legacy gallery styles and motion assets', () => {
    for (const file of ['index.html', 'discord/index.html']) {
        const html = fs.readFileSync(path.join(base, file), 'utf8');
        assert.match(html, /<html[^>]*data-tront-theme-editor/);
        assert.match(html, /assets\/css\/tront-theme-editor\.css/); assert.match(html, /assets\/js\/tront-theme-editor\.js/);
        assert.ok(!html.includes('src="/assets/js/tront-theme.js"')); assert.ok(!html.includes('href="/assets/css/tront-themes.css"'));
        assert.ok(html.indexOf('assets/js/tront-system.js') < html.indexOf('assets/js/tront-theme-editor.js'));
    }
    const games = fs.readFileSync(path.join(base, 'games/index.html'), 'utf8');
    assert.match(games, /data-tront-theme-surface="gallery" data-te-gallery="native"/);
    assert.match(games, /assets\/js\/tront-theme-editor\.js/); assert.match(games, /assets\/css\/tront-themes\.css/);
    assert.match(games, /games\/gallery-motion\.js/); assert.match(games, /games\/gallery-motion\.css/);
    const css = fs.readFileSync(path.join(base, 'assets/css/tront-theme-editor.css'), 'utf8');
    assert.match(css, /html\[data-tront-theme-editor\] \[hidden\]\s*\{\s*display: none !important/);
    assert.match(css, /prefers-reduced-motion: reduce/); assert.match(css, /100dvh/);
    assert.ok(!editorSource.includes("setItem('tront-theme'"));
});

test('gallery defaults and Reset preserve its native theme, radial shape and separate preferences', () => {
    const savedHome = JSON.stringify(engine.preset('light'));
    const env = environment({ gallery: true, storage: { 'tront-theme': 'tront-purple', 'tront-theme-editor-v1': savedHome, 'tront-previews-paused': 'true' } });
    assert.equal(env.api.key, 'tront-theme-gallery-v1');
    assert.equal(env.doc.documentElement.getAttribute('data-te-gallery'), 'native');
    assert.equal(env.doc.documentElement.getAttribute('data-theme'), 'tront-purple');
    assert.equal(env.writes.length, 0);
    change(env, 'preset', 'cyan');
    assert.equal(env.doc.documentElement.getAttribute('data-te-gallery'), 'custom');
    assert.equal(env.doc.documentElement.hasAttribute('data-theme'), false);
    assert.equal(stateOf(env).count, 4);
    click(env, 'reset');
    assert.equal(env.doc.documentElement.getAttribute('data-te-gallery'), 'native');
    assert.equal(env.doc.documentElement.getAttribute('data-theme'), 'tront-purple');
    assert.equal(env.store['tront-theme-editor-v1'], savedHome);
    assert.equal(env.store['tront-theme'], 'tront-purple');
    assert.equal(env.store['tront-previews-paused'], 'true');
    assert.ok(env.writes.every(([key]) => key === 'tront-theme-gallery-v1'));
});
test('editor always exposes four pegs without a collapsed or count-dependent mode', () => {
    const saved = engine.preset('cyan'); saved.count = 1;
    const env = environment({ storage: { [engine.key]: JSON.stringify(saved) } });
    assert.equal(env.dialog.querySelectorAll('[data-peg-row]').length, 4);
    assert.ok(env.dialog.querySelectorAll('[data-peg-row]').every(row => !row.hidden));
    assert.equal(env.dialog.querySelector('details'), null);
    assert.equal(env.dialog.querySelector('[name="count"]'), null);
    assert.equal(env.api.normalize(saved).count, 4);
});


test('Home and Discord keep their own grid composition, while Games keeps its radial surface', () => {
    const fs = require('node:fs'), path = require('node:path');
    const root = path.resolve(__dirname, '../..');
    for (const page of ['index.html', 'discord/index.html']) {
        const html = fs.readFileSync(path.join(root, page), 'utf8');
        assert.match(html, /data-tront-theme-surface="grid"/);
        assert.match(html, /background-size:\s*50px 50px/);
    }
    assert.match(fs.readFileSync(path.join(root, 'games/index.html'), 'utf8'), /data-tront-theme-surface="gallery"/);
});
