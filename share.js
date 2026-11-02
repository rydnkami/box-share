// The share page, DOM part (docs/share-flow.md section 6). Every catalog value goes in through textContent; no HTML string is ever parsed (core.test.mjs checks).
// No cookies, no storage, no analytics: the only requests are config.json and one read-only catalog query with the public key.
import {
  appView, catalogQuery, detectPlatform, fitsDevice, getBoxLabel, installUrl, noInstallNote, openInBoxUrl, pageUrl, pickLang, platformChips, readConfig, runsInBox,
  readParams, shareLink, t,
} from './core.js';

const params = readParams(location.search);
const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
let lang = pickLang(params.lang, navigator.languages);
let config = readConfig(null);
/** 'loading' | 'found' | 'missing' | 'invalid' | 'none' | 'error' */
let state = params.state === 'ok' ? 'loading' : params.state;
let view = null;
let note = ''; // a status line after Get BOX: '' | 'copied' | 'copyFailed'
// BOX looks missing: Android came back through the intent fallback (nobox=1), or iOS stayed on the page after "Open in BOX".
let nobox = params.nobox;

const $ = (id) => document.getElementById(id);

function el(tag, attrs, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'className') node.className = v; else node.setAttribute(k, v === true ? '' : String(v));
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function setLang(next) {
  lang = next;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.title = view ? `${view.name} · BOX` : t(lang, 'title');
  render();
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the selection copy */ }
  const field = $('link-field');
  if (!field) return false;
  try { field.focus(); field.select(); field.setSelectionRange(0, text.length); return document.execCommand('copy'); } catch { return false; }
}

/** "Get BOX": copy the share link on this tap (so BOX can paste it after the install), then go to the install link. */
async function getBox() {
  // Only a link to an app that exists is worth carrying through the install.
  const link = state === 'found' ? shareLink(config, params.id) : '';
  const target = installUrl(config, platform);
  if (link) {
    const ok = await copyText(link);
    note = ok ? 'copied' : 'copyFailed';
    render();
    // When the copy failed, the person copies the link by hand and continues with the "Continue to install" button.
    if (!ok) return;
  }
  if (target) location.href = target;
}

function button(label, onClick, kind) {
  const b = el('button', { type: 'button', className: 'btn ' + (kind || 'primary') }, label);
  b.addEventListener('click', onClick);
  return b;
}

function link(label, href, kind) {
  return el('a', { className: 'btn ' + (kind || 'primary'), href, rel: 'noopener noreferrer' }, label);
}

function linkBox(card) {
  const value = shareLink(config, params.id);
  if (!value) return;
  const wrap = el('div', { className: 'linkbox' });
  wrap.append(el('label', { for: 'link-field' }, t(lang, 'linkLabel')));
  const row = el('div', { className: 'linkrow' });
  const field = el('input', { id: 'link-field', type: 'text', readonly: true, dir: 'ltr', value, 'aria-label': t(lang, 'linkLabel') });
  field.value = value;
  field.addEventListener('focus', () => field.select());
  const copy = button(t(lang, 'copy'), async () => {
    const ok = await copyText(value);
    copy.textContent = ok ? t(lang, 'copyDone') : t(lang, 'copy');
  }, 'secondary small');
  row.append(field, copy);
  wrap.append(row);
  card.append(wrap);
}

function getBoxBlock(card, first) {
  const target = installUrl(config, platform);
  if (platform === 'desktop') {
    card.append(el('p', { className: 'muted' }, t(lang, 'desktop')));
    const links = [['installIos', config.install.ios], ['installAndroid', config.install.android]].filter(([, href]) => href);
    if (links.length) {
      card.append(el('p', { className: 'muted' }, t(lang, 'desktopInstall')));
      for (const [key, href] of links) card.append(link(t(lang, key), href, 'secondary'));
      // No public TestFlight link yet: iPhone testers get in through an invite from the sender.
      if (!config.install.ios) card.append(el('p', { className: 'muted' }, t(lang, 'iosInvite')));
    } else card.append(el('p', { className: 'muted' }, t(lang, 'closedTest')));
    return;
  }
  // Without an install link and with nothing to copy, the button would do nothing: only the closed-test line is shown. Without an
  // install link but with a found app, it only copies the link, and its label says so (no promise of an install).
  if (target || state === 'found') card.append(button(t(lang, getBoxLabel(config, platform, first)), getBox, first ? 'primary' : 'secondary'));
  if (note === 'copied') card.append(el('p', { className: 'note', role: 'status' }, t(lang, 'copied')));
  if (note === 'copyFailed') {
    card.append(el('p', { className: 'note warn', role: 'status' }, t(lang, 'copyFailed')));
    if (target) card.append(link(t(lang, 'continueInstall'), target, 'secondary'));
  }
  const missing = noInstallNote(config, platform);
  if (missing) card.append(el('p', { className: 'muted' }, t(lang, missing)));
}

function header(card) {
  if (!view) return;
  const icon = el('div', { className: 'icon', 'aria-hidden': 'true' });
  if (view.color) icon.style.background = view.color;
  if (view.iconUrl) {
    const img = el('img', { src: view.iconUrl, alt: '', width: 72, height: 72, referrerpolicy: 'no-referrer', decoding: 'async' });
    img.addEventListener('error', () => { img.remove(); icon.textContent = view.icon; });
    icon.append(img);
  } else icon.textContent = view.icon;
  card.append(icon);
  card.append(el('h1', { dir: 'auto' }, view.name));
  if (view.developer) {
    const by = el('p', { className: 'by' });
    by.append(document.createTextNode(t(lang, 'by') + ' '), el('span', { dir: 'auto' }, view.developer));
    card.append(by);
  }
  if (view.summary) card.append(el('p', { className: 'summary', dir: 'auto' }, view.summary));
  const pls = platformChips(view);
  if (pls.length) {
    const row = el('p', { className: 'platforms' });
    row.append(document.createTextNode(t(lang, 'platforms') + ' '));
    pls.forEach((p) => row.append(el('span', { className: 'chip' }, t(lang, p))));
    card.append(row);
  }
  if (runsInBox(view)) card.append(el('p', { className: 'platforms' }, t(lang, 'runsInBox')));
}

function message(card, titleKey, bodyKey) {
  card.append(el('div', { className: 'icon', 'aria-hidden': 'true' }, '📦'));
  card.append(el('h1', {}, t(lang, titleKey)));
  if (bodyKey) card.append(el('p', { className: 'muted' }, t(lang, bodyKey)));
}

function render() {
  const card = $('card');
  card.replaceChildren();
  card.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');

  if (state === 'loading') {
    card.append(el('p', { className: 'muted', role: 'status' }, t(lang, 'loading')));
  } else if (state === 'found') {
    header(card);
    if (!fitsDevice(view, platform)) card.append(el('p', { className: 'note' }, t(lang, view.platforms.ios ? 'iosOnly' : 'androidOnly')));
    if (platform !== 'desktop') {
      const fallback = pageUrl(location.origin, location.pathname, params.id, { lang, nobox: '1' });
      const open = link(t(lang, 'openInBox'), openInBoxUrl(platform, params.id, config, fallback), nobox ? 'secondary' : 'primary');
      // iOS has no fallback for a missing app (Safari shows an error and stays here): if the page is still visible shortly after the
      // tap, BOX is probably not installed, so Get BOX moves first.
      // Safari's "Open in BOX?" prompt or the switch to BOX blurs or hides the page, which cancels the hint.
      if (platform === 'ios') open.addEventListener('click', () => {
        let left = false;
        const away = () => { left = true; };
        window.addEventListener('blur', away, { once: true });
        window.addEventListener('pagehide', away, { once: true });
        document.addEventListener('visibilitychange', away, { once: true });
        setTimeout(() => {
          window.removeEventListener('blur', away); window.removeEventListener('pagehide', away);
          document.removeEventListener('visibilitychange', away);
          if (!left && !nobox) { nobox = true; render(); }
        }, 2500);
      });
      if (nobox) {
        card.append(el('p', { className: 'note' }, t(lang, 'noBoxHint')));
        getBoxBlock(card, true);
        card.append(open);
      } else {
        card.append(open);
        getBoxBlock(card, false);
      }
    } else getBoxBlock(card, false);
    linkBox(card);
    card.append(el('p', { className: 'muted small' }, t(lang, 'howTo')));
  } else if (state === 'missing') {
    message(card, 'missing', 'missingBody');
    getBoxBlock(card, false);
  } else if (state === 'invalid') {
    message(card, 'invalid', 'invalidBody');
    getBoxBlock(card, false);
  } else if (state === 'error') {
    message(card, 'error', 'errorBody');
    card.append(button(t(lang, 'retry'), () => { state = 'loading'; render(); load(); }, 'primary'));
  } else {
    message(card, 'none', 'noneBody');
    getBoxBlock(card, false);
  }

  const toggle = $('lang-toggle');
  toggle.textContent = t(lang, 'language');
  toggle.setAttribute('lang', lang === 'he' ? 'en' : 'he');
  $('privacy').textContent = t(lang, 'privacy');
}

async function load() {
  try {
    const res = await fetch('config.json', { cache: 'no-cache', credentials: 'omit' });
    if (!res.ok) throw new Error('config ' + res.status);
    config = readConfig(await res.json());
  } catch {
    if (params.state === 'ok') { state = 'error'; render(); }
    return;
  }
  if (params.state !== 'ok') { render(); return; }
  const query = catalogQuery(config, params.id);
  if (!query || !config.publishableKey) { state = 'error'; render(); return; }
  try {
    const res = await fetch(query, {
      headers: { apikey: config.publishableKey, Accept: 'application/json' },
      credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
    });
    if (!res.ok) throw new Error('catalog ' + res.status);
    const rows = await res.json();
    view = Array.isArray(rows) ? appView(rows[0], config, params.id) : null;
    state = view ? 'found' : 'missing';
  } catch {
    state = 'error';
  }
  setLang(lang);
}

$('lang-toggle').addEventListener('click', () => setLang(lang === 'he' ? 'en' : 'he'));
setLang(lang);
load();
