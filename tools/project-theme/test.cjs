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
const PROJECTS = {
    punk: { id: 'punk', storageKey: 'tront-theme-punk-v1', nativeLabel: 'Original HackerPunk',
        original: { mode: 'dark', angle: 135, intensity: 65, frost: 88,
            pegs: ['#ff00ff', '#00ffff', '#ffff00', '#00dd00'].map((color, i) => ({ color, position: Math.round(i * 100 / 3) })) } },
    monke: { id: 'monke', storageKey: 'tront-theme-monke-v1', nativeLabel: 'Original MonkePortals',
        original: { mode: 'dark', angle: 135, intensity: 65, frost: 88,
            pegs: ['#ff8c32', '#00ffff', '#ff00ff', '#e0e0e0'].map((color, i) => ({ color, position: Math.round(i * 100 / 3) })) } }
};

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
    insertBefore(child, before) { this.children.splice(Math.max(0, this.children.indexOf(before)), 0, child); }
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
    show() { this.showModal(); this.modeless = true; }
    showModal() {
        assert.equal(this.open || false, false, 'showModal is not called twice');
        this.previouslyFocused = this.doc.activeElement; this.open = true;
    }
    close() {
        if (!this.open) return;
        this.open = false;
        // Native restoration happens before the queued close notification.
        if (this.previouslyFocused) this.previouslyFocused.focus({ preventScroll: true });
        this.previouslyFocused = null;
        if (this.doc.queuedDialogClose) this.doc.closeTasks.push(() => this.fire('close'));
        else this.fire('close');
    }
}
function environment(options = {}) {
    const writes = [], reads = [], removals = [], store = { ...(options.storage || {}) };
    const doc = { readyState: options.loading ? 'loading' : 'complete', listeners: {}, activeElement: null,
        queuedDialogClose: !!options.queuedDialogClose, closeTasks: [], paintTasks: [] };
    doc.documentElement = new Element('html', { ...(options.optIn === false ? {} : { 'data-tront-theme-editor': '' }), ...(options.gallery ? { 'data-tront-theme-surface': 'gallery', 'data-te-gallery': 'native' } : {}), ...(options.project ? { 'data-tront-theme-surface': 'project', 'data-te-project': 'native' } : {}), ...(options.attrs || {}) }, doc);
    doc.documentElement.style.colorScheme = options.colorScheme || '';
    doc.body = new Element('body', {}, doc);
    const opener = new Element('button', { id: 'tront-theme-btn', hidden: '' }, doc);
    opener.children.push(new Element('span', { class: 'theme-label' }, doc), new Element('span', { class: 'theme-icon' }, doc));
    // Model the initial user click's focus before showModal captures it.
    opener.fire = function (type, extra) {
        if (type === 'click' && !doc.body.children[0]?.open) this.focus();
        Element.prototype.fire.call(this, type, extra);
    };
    doc.getElementById = id => id === 'tront-theme-btn' ? opener : null;
    doc.createElement = name => name === 'dialog' ? new Dialog(name, {}, doc) : new Element(name, {}, doc);
    doc.addEventListener = (name, callback) => { (doc.listeners[name] ||= []).push(callback); };
    const events = {};
    const win = { requestAnimationFrame(callback) { if (options.queuedPaint) doc.paintTasks.push(callback); else callback(); }, scrollX: 0, scrollY: 0, scrollTo(point) { this.scrollX = point.left; this.scrollY = point.top; }, document: doc, TrontThemeProject: options.config === undefined ? plain(PROJECTS[options.project] || null) : options.config, HTMLDialogElement: options.noDialog ? undefined : Dialog,
        localStorage: {
            getItem(key) { if (options.deniedStorage) throw new Error('SecurityError'); reads.push(key); return store[key] ?? null; },
            setItem(key, value) { if (options.deniedStorage || options.deniedWrite) throw new Error('QuotaExceededError'); store[key] = value; writes.push([key, value]); },
            removeItem(key) { if (options.deniedStorage || options.deniedWrite) throw new Error('SecurityError'); delete store[key]; removals.push(key); }
        },
        addEventListener(name, callback) { (events[name] ||= []).push(callback); }
    };
    const context = vm.createContext({ window: win });
    if (!options.noSystem) vm.runInContext(systemSource, context);
    vm.runInContext(editorSource, context);
    return { win, doc, opener, writes, reads, removals, store,
        api: win.TrontThemeEditor,
        ready() { doc.readyState = 'complete'; (doc.listeners.DOMContentLoaded || []).forEach(fn => fn()); },
        flushPaint() { while (doc.paintTasks.length) doc.paintTasks.shift()(); }, context, get dialog() { return doc.body.children[0]; },
        flushClose(count = doc.closeTasks.length) { while (count-- > 0 && doc.closeTasks.length) doc.closeTasks.shift()(); },
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

function presentation(env) { return env.doc.documentElement.getAttribute('data-te-project'); }
function shownPegs(env) {
    return [0, 1, 2, 3].map(i => ({ color: env.dialog.querySelector(`[name="color-${i}"]`).value,
        position: Number(env.dialog.querySelector(`[name="position-${i}"]`).value) }));
}

for (const project of ['punk', 'monke']) {
    const config = PROJECTS[project];
    test(`${project}: first visit and repeated modal opens keep native state without storage writes`, () => {
        const env = environment({ project });
        assert.equal(env.api.key, config.storageKey);
        assert.equal(presentation(env), 'native');
        assert.equal(env.doc.documentElement.style.colorScheme, '');
        assert.equal(env.doc.documentElement.hasAttribute('data-te-gallery'), false);
        assert.deepEqual(shownPegs(env), config.original.pegs);
        assert.equal(env.dialog.querySelector('[name="preset"]').value, 'project-original');
        assert.match(env.dialog.markup, /value="project-original"/);
        assert.ok(env.dialog.markup.includes(config.nativeLabel));
        assert.doesNotMatch(env.dialog.markup, /gallery-original|Original gallery/);
        assert.equal(env.dialog.querySelectorAll('[data-peg-row]').length, 4);
        for (let i = 0; i < 3; i++) { env.opener.fire('click'); env.opener.fire('click'); click(env, 'close'); }
        assert.deepEqual(env.reads, [config.storageKey]);
        assert.deepEqual(env.writes, []); assert.deepEqual(env.removals, []);
        assert.equal(presentation(env), 'native');
        assert.equal(env.doc.activeElement, env.opener);
        assert.match(env.dialog.querySelector('.te-status').textContent, /only on this site/);
    });
    test(`${project}: each explicit edit opts in; reset restores exact brand pegs and is undoable`, () => {
        const actions = [
            env => change(env, 'preset', 'cyan'), env => change(env, 'mode', 'light'),
            env => click(env, 'magic'), env => change(env, 'color-3', '#123abc'),
            env => change(env, 'position-2', 45), env => change(env, 'angle', 10),
            env => change(env, 'intensity', 20), env => change(env, 'frost', 95)
        ];
        for (const action of actions) {
            const env = environment({ project, colorScheme: 'normal', attrs: { 'data-theme': 'unchanged-native-attribute' } });
            action(env);
            assert.equal(presentation(env), 'custom');
            const custom = stateOf(env);
            assert.equal(custom.count, 4); assert.equal(custom.pegs.length, 4);
            assert.ok(env.writes.every(([key]) => key === config.storageKey));
            click(env, 'reset');
            assert.equal(presentation(env), 'native');
            assert.equal(env.store[config.storageKey], undefined);
            assert.deepEqual(env.removals, [config.storageKey]);
            assert.deepEqual(shownPegs(env), config.original.pegs);
            assert.equal(env.doc.documentElement.style.colorScheme, 'normal');
            assert.equal(env.doc.documentElement.getAttribute('data-theme'), 'unchanged-native-attribute');
            click(env, 'undo');
            assert.equal(presentation(env), 'custom'); assert.deepEqual(stateOf(env), custom);
            change(env, 'preset', 'project-original');
            assert.equal(presentation(env), 'native'); assert.equal(env.store[config.storageKey], undefined);
            assert.deepEqual(shownPegs(env), config.original.pegs);
        }
    });
    test(`${project}: continuous four-peg editing can undo all the way to native`, () => {
        const env = environment({ project });
        change(env, 'color-0', '#123456', 'input'); change(env, 'color-0', '#234567', 'input');
        change(env, 'color-0', '#345678');
        assert.equal(stateOf(env).pegs[0].color, '#345678');
        click(env, 'undo');
        assert.equal(presentation(env), 'native'); assert.equal(env.store[config.storageKey], undefined);
        assert.deepEqual(shownPegs(env), config.original.pegs);
        assert.equal(env.dialog.querySelector('[data-action="undo"]').disabled, true);
    });
    test(`${project}: saved custom restores before DOM ready and storage updates never write`, () => {
        const saved = engine.preset('light'); saved.angle = 201; saved.pegs[3].position = 18;
        const env = environment({ project, loading: true, storage: { [config.storageKey]: JSON.stringify(saved) } });
        assert.equal(presentation(env), 'custom'); assert.equal(env.dialog, undefined);
        env.ready(); assert.equal(env.dialog.querySelector('[name="angle"]').value, 201);
        assert.deepEqual(shownPegs(env), plain(saved.pegs)); assert.deepEqual(env.writes, []);
        delete env.store[config.storageKey]; env.storageEvent(config.storageKey);
        assert.equal(presentation(env), 'native'); assert.deepEqual(shownPegs(env), config.original.pegs);
        env.store[config.storageKey] = JSON.stringify(saved); env.storageEvent(config.storageKey);
        assert.equal(presentation(env), 'custom');
        delete env.store[config.storageKey]; env.storageEvent(null);
        assert.equal(presentation(env), 'native'); assert.deepEqual(env.writes, []); assert.deepEqual(env.removals, []);
    });
    test(`${project}: malformed or unsupported own storage returns to native without repairing it`, () => {
        const valid = engine.preset('cyan');
        const badValues = ['{', 'null', 'true', '[]', '{"version":2}', '{"version":1}',
            JSON.stringify({ ...valid, count: 1 }), JSON.stringify({ ...valid, mode: 'other' }),
            JSON.stringify({ ...valid, intensity: -1 }), JSON.stringify({ ...valid, pegs: [] }),
            JSON.stringify({ ...valid, preset: 'gallery-original' }),
            JSON.stringify({ ...valid, pegs: valid.pegs.map((p, i) => i ? p : { ...p, color: 'red);url(evil)' }) })];
        for (const stored of badValues) {
            const env = environment({ project, storage: { [config.storageKey]: stored } });
            assert.equal(presentation(env), 'native', stored);
            assert.equal(env.store[config.storageKey], stored);
            assert.deepEqual(shownPegs(env), config.original.pegs);
            assert.deepEqual(env.writes, []); assert.deepEqual(env.removals, []);
        }
    });
    test(`${project}: storage read/write/removal denial retains a working preview and honest status`, () => {
        for (const options of [{ deniedStorage: true }, { deniedWrite: true }]) {
            const env = environment({ project, ...options });
            assert.equal(presentation(env), 'native');
            change(env, 'mode', 'light'); assert.equal(presentation(env), 'custom');
            assert.match(env.dialog.querySelector('.te-status').textContent, /Preview only/);
            click(env, 'reset'); assert.equal(presentation(env), 'native');
            assert.deepEqual(shownPegs(env), config.original.pegs);
            assert.match(env.dialog.querySelector('.te-status').textContent, /Preview only/);
            assert.deepEqual(env.writes, []); assert.deepEqual(env.removals, []);
        }
    });
    test(`${project}: missing dialog/helper support or missing opt-in does not expose broken controls`, () => {
        for (const options of [{ noDialog: true }, { noSystem: true }, { optIn: false }]) {
            const env = environment({ project, ...options });
            assert.equal(env.opener.hidden, true); assert.equal(env.dialog, undefined);
            assert.equal(presentation(env), 'native');
            assert.deepEqual(env.writes, []); assert.deepEqual(env.removals, []);
        }
    });
}

test('project keys are isolated from each other and all legacy/home/gallery/playback preferences', () => {
    const unrelated = { 'tront-theme': 'light', 'tront-theme-editor-v1': JSON.stringify(engine.preset('moss')),
        'tront-theme-gallery-v1': JSON.stringify(engine.preset('purple')), 'tront-previews-paused': 'true',
        'tront-theme-monke-v1': JSON.stringify(engine.preset('cyan')) };
    const env = environment({ project: 'punk', storage: unrelated });
    assert.equal(presentation(env), 'native');
    assert.deepEqual(env.reads, ['tront-theme-punk-v1']);
    for (const key of Object.keys(unrelated)) env.storageEvent(key);
    assert.deepEqual(env.reads, ['tront-theme-punk-v1']);
    change(env, 'preset', 'light'); click(env, 'reset');
    assert.deepEqual(env.store, unrelated);
    assert.ok(env.writes.every(([key]) => key === 'tront-theme-punk-v1'));
    assert.deepEqual(env.removals, ['tront-theme-punk-v1']);
});

test('invalid/missing project configuration fails closed without accessing storage or markup', () => {
    const good = PROJECTS.punk;
    const invalid = [null, {}, [], { ...good, id: 'gallery' }, { ...good, id: 'another-site' },
        { ...good, storageKey: 'tront-theme-editor-v1' }, { ...good, storageKey: 'tront-theme-monke-v1' },
        { ...good, nativeLabel: '' }, { ...good, nativeLabel: 'a'.repeat(81) },
        { ...good, original: { ...good.original, pegs: [] } },
        { ...good, original: { ...good.original, mode: 'unknown' } },
        { ...good, original: { ...good.original, angle: Infinity } },
        { ...good, original: { ...good.original, frost: 74 } },
        { ...good, original: { ...good.original, pegs: good.original.pegs.map((p, i) => i ? p : { ...p, color: '#fff' }) } }];
    for (const config of invalid) {
        const env = environment({ project: 'punk', config });
        assert.equal(env.api, undefined); assert.equal(env.dialog, undefined); assert.equal(env.opener.hidden, true);
        assert.deepEqual(env.reads, []); assert.deepEqual(env.writes, []); assert.deepEqual(env.removals, []);
        assert.equal(presentation(env), 'native'); assert.deepEqual(env.doc.documentElement.style.values, {});
    }
});

test('configuration is copied and labels are escaped before HTML insertion', () => {
    const config = plain(PROJECTS.punk); config.nativeLabel = 'Original <img src=x> & "quoted"';
    const env = environment({ project: 'punk', config });
    assert.ok(env.dialog.markup.includes('Original &lt;img src=x&gt; &amp; &quot;quoted&quot;'));
    assert.doesNotMatch(env.dialog.markup, /<img/);
    config.original.pegs[0].color = '#123456'; config.storageKey = 'tront-theme';
    change(env, 'preset', 'cyan'); click(env, 'reset');
    assert.deepEqual(shownPegs(env), PROJECTS.punk.original.pegs);
    assert.deepEqual(env.removals, ['tront-theme-punk-v1']);
});

test('project modal keeps native focus/Tab, outside dismissal, repeated open and Escape contract', () => {
    const env = environment({ project: 'monke' });
    env.opener.fire('click'); env.opener.fire('click');
    const first = env.dialog.querySelector('[data-action="close"]');
    const last = env.dialog.querySelector('[data-action="reset"]');
    let prevented = false; last.focus();
    env.dialog.fire('keydown', { key: 'Tab', preventDefault() { prevented = true; } });
    assert.equal(prevented, true); assert.equal(env.doc.activeElement, first);
    first.focus(); env.dialog.fire('keydown', { key: 'Tab', shiftKey: true, preventDefault() {} });
    assert.equal(env.doc.activeElement, last);
    prevented = false; env.dialog.fire('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
    assert.equal(prevented, false, 'Escape remains the browser default');
    env.dialog.close(); assert.equal(env.doc.activeElement, env.opener);
    env.opener.fire('click');
    env.dialog.fire('pointerdown', { clientX: 200, clientY: 200 });
    env.dialog.fire('click', { clientX: 10, clientY: 10 }); assert.equal(env.dialog.open, true);
    env.dialog.fire('pointerdown', { clientX: 10, clientY: 10 });
    env.dialog.fire('click', { clientX: 10, clientY: 10 }); assert.equal(env.dialog.open, false);
    assert.equal(env.doc.activeElement, env.opener); assert.deepEqual(env.writes, []);
});

test('explicit close updates modal state synchronously even when the browser queues close events', () => {
    const env = environment({ project: 'punk', queuedDialogClose: true });
    for (let i = 0; i < 3; i++) {
        env.opener.fire('click'); click(env, 'close');
        assert.equal(env.dialog.open, false);
        assert.equal(env.opener.attrs['aria-expanded'], 'false');
        assert.equal(env.doc.activeElement, env.opener);
    }
    assert.equal(env.doc.closeTasks.length, 3);
    env.flushClose();
    assert.equal(env.opener.attrs['aria-expanded'], 'false');
});

test('a delayed close event cannot collapse aria state or move focus after reopening', () => {
    const env = environment({ project: 'monke', queuedDialogClose: true });
    env.opener.fire('click'); click(env, 'close'); env.opener.fire('click');
    const color = env.dialog.querySelector('[name="color-2"]'); color.focus();
    env.flushClose();
    assert.equal(env.dialog.open, true);
    assert.equal(env.opener.attrs['aria-expanded'], 'true');
    assert.equal(env.doc.activeElement, color);
    change(env, 'preset', 'cyan'); click(env, 'reset');
    assert.equal(presentation(env), 'native'); assert.equal(env.store[env.api.key], undefined);
});

test('a stale close task does not split a new session continuous edit into extra undo steps', () => {
    const env = environment({ project: 'punk', queuedDialogClose: true });
    env.opener.fire('click'); click(env, 'close'); env.opener.fire('click');
    change(env, 'angle', 20, 'input'); env.flushClose();
    change(env, 'angle', 30, 'input'); change(env, 'angle', 40);
    click(env, 'undo');
    assert.equal(presentation(env), 'native');
    assert.equal(env.dialog.querySelector('[data-action="undo"]').disabled, true);
});

test('a handled close notification cannot steal focus from a later action while still closed', () => {
    const env = environment({ project: 'monke', queuedDialogClose: true });
    env.opener.fire('click'); click(env, 'close');
    const other = new Element('a', { href: '/games/' }, env.doc); other.focus();
    env.flushClose();
    assert.equal(env.doc.activeElement, other);
    assert.equal(env.opener.attrs['aria-expanded'], 'false');
});

test('native closing finalizes the prior draft before a same-task reopen and ignores its late event', () => {
    const env = environment({ project: 'punk', queuedDialogClose: true });
    env.opener.fire('click'); change(env, 'angle', 20, 'input');
    env.dialog.close(); // Native Escape closes immediately, notification is queued.
    env.opener.fire('click'); change(env, 'angle', 30, 'input'); env.flushClose();
    change(env, 'angle', 40); click(env, 'undo');
    assert.equal(stateOf(env).angle, 20);
    click(env, 'undo'); assert.equal(presentation(env), 'native');
});

for (const project of ['punk', 'monke']) test(`${project}: native close preserves external focus chosen before its queued notification`, () => {
    const env = environment({ project, queuedDialogClose: true });
    env.opener.fire('click'); change(env, 'angle', 20, 'input'); env.dialog.close();
    assert.ok(env.doc.activeElement === env.opener, 'native close restores the opener immediately');
    const other = new Element('a', { href: '/games/' }, env.doc); other.focus();
    env.flushClose();
    assert.ok(env.doc.activeElement === other, 'queued cleanup preserves the later focus choice');
    assert.equal(env.opener.attrs['aria-expanded'], 'false');
    env.opener.fire('click'); click(env, 'undo');
    assert.equal(presentation(env), 'native', 'queued cleanup still records the pending draft');
});

test('project CSS excludes generic page recoloring but retains shared dialog/nav/focus contracts', () => {
    const css = fs.readFileSync(path.join(base, 'assets/css/tront-theme-editor.css'), 'utf8');
    const navbar = fs.readFileSync(path.join(base, 'assets/css/tront-navbar.css'), 'utf8');
    const projectExclusion = ':not([data-tront-theme-surface="project"])';
    for (const block of css.split('}')) {
        const open = block.lastIndexOf('{'); if (open < 0) continue;
        const selectors = block.slice(0, open).trim();
        if (selectors.includes(':not([data-tront-theme-surface="gallery"])') &&
            !selectors.includes('#magic-navbar-container') && !selectors.includes('#tront-theme-btn')) {
            assert.ok(selectors.includes(projectExclusion), selectors);
        }
    }
    assert.match(css, /html\[data-tront-theme-editor\] \.te-dialog \{/);
    assert.match(css, /html\[data-tront-theme-editor\] :is\(a, button, input, select, summary\):focus-visible/);
    assert.match(css, /html\[data-tront-theme-editor\] \[hidden\]\s*\{\s*display: none !important/);
    assert.match(css, /prefers-reduced-motion: reduce/); assert.match(css, /100dvh/);
    assert.match(navbar, /#magic-navbar-container/);
    assert.doesNotMatch(editorSource, /setItem\(['"]tront-theme['"]|localStorage\.clear\(/);
});

test('the vendored color/math engine, shared navbar and core token/harmony algorithms stay unchanged', () => {
    const upstream = name => fs.readFileSync(path.join(__dirname, 'upstream', name), 'utf8');
    assert.equal(systemSource, upstream('assets/js/tront-system.js'));
    assert.equal(fs.readFileSync(path.join(base, 'assets/css/tront-navbar.css'), 'utf8'), upstream('assets/css/tront-navbar.css'));
    const original = upstream('assets/js/tront-theme-editor.js');
    const core = source => source.slice(source.indexOf('    function luminance('), source.indexOf('    root.TrontThemeEditor ='));
    assert.equal(core(editorSource), core(original));
});

test('provenance locks original snapshots and the exact shipped derivative bytes', () => {
    const { createHash } = require('node:crypto');
    const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'vendor-manifest.json'), 'utf8'));
    assert.equal(manifest.upstreamCommit, '91d0a6874fbb4769d546574870e25c406a81608d');
    assert.equal(manifest.files.length, 4);
    for (const file of manifest.files) {
        const original = fs.readFileSync(path.join(__dirname, 'upstream', file.path));
        const shipped = fs.readFileSync(path.join(base, file.path));
        assert.equal(gitBlob(original), file.upstreamGitBlob, file.path);
        assert.equal(sha256(original), file.upstreamSha256, file.path);
        assert.equal(gitBlob(shipped), file.shippedGitBlob, file.path);
        assert.equal(sha256(shipped), file.shippedSha256, file.path);
        assert.equal(!original.equals(shipped), file.modified);
    }
});



test('Punk editor is an in-flow disclosure with unrestricted Tab, Escape and restored reading position', () => {
    const env = environment({ project: 'punk', queuedDialogClose: true });
    env.context.window.scrollY = 1000;
    env.opener.fire('click');
    assert.equal(env.dialog.modeless, true);
    assert.match(env.dialog.className, /te-inline/);
    assert.equal(env.context.window.scrollY, 0);
    assert.ok(env.dialog.markup.indexOf('data-action="reset"') < env.dialog.markup.indexOf('name="preset"'));
    let prevented = false;
    env.dialog.fire('keydown', { key: 'Tab', preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
    env.dialog.fire('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
    assert.equal(prevented, true); assert.equal(env.dialog.open, false);
    assert.equal(env.context.window.scrollY, 1000); assert.equal(env.doc.activeElement, env.opener);
    env.opener.fire('click'); env.flushClose();
    assert.equal(env.dialog.open, true); assert.equal(env.context.window.scrollY, 0);
    click(env, 'close'); assert.equal(env.context.window.scrollY, 1000);
});

test('Punk exposes controls only after presentation and cancels stale open/close work', () => {
    const env=environment({project:'punk', queuedPaint:true, queuedDialogClose:true});
    env.win.scrollY=700; env.opener.fire('click');
    assert.equal(env.dialog.inert,true); assert.equal(env.dialog.attrs['data-te-phase'],'opening');
    assert.equal(env.opener.attrs['aria-busy'],'true');
    env.opener.fire('click'); assert.equal(env.dialog.open,true);
    env.flushPaint(); assert.equal(env.dialog.inert,false); assert.equal(env.dialog.attrs['data-te-phase'],'ready');
    assert.equal(env.doc.activeElement.attrs['data-action'],'close');
    click(env,'close'); assert.equal(env.dialog.attrs['data-te-phase'],'closing');
    assert.equal(env.win.scrollY,700); env.opener.fire('click'); env.flushClose(); env.flushPaint();
    assert.equal(env.dialog.open,true); assert.equal(env.dialog.attrs['data-te-phase'],'ready');
    assert.equal(env.opener.attrs['aria-busy'],'false');
    click(env,'close'); env.flushPaint(); assert.equal(env.dialog.attrs['data-te-phase'],'closed');
    assert.equal(env.win.scrollY,700); assert.equal(env.doc.activeElement,env.opener);
});
