// The share page, DOM part (docs/share-flow.md section 6). Every value from the server goes in through textContent; no HTML string is ever parsed (core.test.mjs checks).
// No cookies, no storage, no analytics. The only requests: config.json, then, with the public key, one read-only catalog query for an app
// link, or one box_open_link call for a box link that carries its key (section 6.1). A box link without a key makes no request at all.
import {
  appView, boxCountText, boxMoreText, boxOpenOutcome, boxOpenRequest, boxPageUrl, boxPlan, boxShareLink, catalogQuery, detectPlatform,
  documentTitle, fitsDevice, getBoxLabel, installUrl, noInstallNote, openBoxInBoxUrl, openInBoxUrl, pageUrl, pickLang, platformChips,
  readConfig, readParams, runsInBox, shareLink, t,
} from './core.js';

const params = readParams(location.search, location.hash);
const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
let lang = pickLang(params.lang, navigator.languages);
let config = readConfig(null);
// Whether config.json has loaded. Until then (and when it fails) nothing is known about installing BOX or the link to carry, so the page
// names no install path: no install line, no closed-test line, no paste steps (those would be a wrong reason or steps that cannot work).
let configLoaded = false;
/** 'loading' | 'found' | 'missing' | 'invalid' | 'none' | 'error' (an app link) | 'box' (a box link: what it shows is boxPlan's) */
let state = params.state === 'ok' ? 'loading' : params.state;
let view = null;
/** A box link with its key: 'loading', then the outcome of box_open_link (boxOpenOutcome in core.js). Without a key: null, nothing asked. */
let boxOutcome = params.state === 'box' && params.token ? 'loading' : null;
let note = ''; // a status line after Get BOX: '' | 'copied' | 'copyFailed'
// BOX looks missing: Android came back through the intent fallback (nobox=1), or iOS stayed on the page after "Open in BOX".
let nobox = params.nobox;

const $ = (id) => document.getElementById(id);
const boxShown = () => boxPlan(params.token, boxOutcome);

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
  // documentTitle in core.js: a link that is not valid (an app link or a box link) keeps index.html's neutral title.
  document.title = documentTitle(lang, state, view, state === 'box' ? boxShown() : null);
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

/** The link Get BOX carries through the install and the link field shows: an app's share link once the app was found; a box's link, with
 *  its key when it has one, unless that link no longer works. A dead or unknown link is not carried. */
function carryLink() {
  if (state === 'found') return shareLink(config, params.id);
  if (state === 'box') {
    const plan = boxShown();
    return plan.copy ? boxShareLink(config, params.box, plan.token) : '';
  }
  return '';
}

/** "Get BOX": copy the link on this tap (so BOX can paste it after the install), then go to the install link. */
async function getBox() {
  const link = carryLink();
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
  const value = carryLink();
  if (!value) return;
  const label = t(lang, state === 'box' ? 'boxLinkLabel' : 'linkLabel');
  const wrap = el('div', { className: 'linkbox' });
  wrap.append(el('label', { for: 'link-field' }, label));
  const row = el('div', { className: 'linkrow' });
  const field = el('input', { id: 'link-field', type: 'text', readonly: true, dir: 'ltr', value, 'aria-label': label });
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

/** Get BOX and the install lines. `desktopKey`: the line a computer shows first ('' for none). The install lines, or the closed-test line
 *  in their place, wait for config.json (configLoaded). */
function getBoxBlock(card, first, desktopKey = 'desktop') {
  const target = installUrl(config, platform);
  if (platform === 'desktop') {
    if (desktopKey) card.append(el('p', { className: 'muted' }, t(lang, desktopKey)));
    const links = [['installIos', config.install.ios], ['installAndroid', config.install.android]].filter(([, href]) => href);
    if (links.length) {
      card.append(el('p', { className: 'muted' }, t(lang, 'desktopInstall')));
      for (const [key, href] of links) card.append(link(t(lang, key), href, 'secondary'));
      // No public TestFlight link yet: iPhone testers get in through an invite from the sender.
      if (!config.install.ios) card.append(el('p', { className: 'muted' }, t(lang, 'iosInvite')));
    } else if (configLoaded) card.append(el('p', { className: 'muted' }, t(lang, 'closedTest')));
    return;
  }
  // Without an install link and with nothing to copy, the button would do nothing: only the closed-test line is shown. Without an
  // install link but with a link to carry, it only copies the link, and its label says so (no promise of an install).
  if (target || carryLink()) card.append(button(t(lang, getBoxLabel(config, platform, first)), getBox, first ? 'primary' : 'secondary'));
  const isBox = state === 'box';
  if (note === 'copied') card.append(el('p', { className: 'note', role: 'status' }, t(lang, isBox ? 'boxCopied' : 'copied')));
  if (note === 'copyFailed') {
    card.append(el('p', { className: 'note warn', role: 'status' }, t(lang, isBox ? 'boxCopyFailed' : 'copyFailed')));
    if (target) card.append(link(t(lang, 'continueInstall'), target, 'secondary'));
  }
  const missing = configLoaded ? noInstallNote(config, platform) : '';
  if (missing) card.append(el('p', { className: 'muted' }, t(lang, missing)));
}

/** "Open in BOX". iOS has no fallback for a missing app (Safari shows an error and stays here): if the page is still visible shortly after
 *  the tap, BOX is probably not installed, so Get BOX moves first. Safari's "Open in BOX?" prompt or the switch to BOX blurs or hides the
 *  page, which cancels the hint. Apps and boxes alike. */
function openButton(href) {
  const open = link(t(lang, 'openInBox'), href, nobox ? 'secondary' : 'primary');
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
  return open;
}

/** Open in BOX and Get BOX on a phone (Get BOX first, under the "isn't installed" line, once BOX looks missing); on a computer only the
 *  desktop line and the install links. */
function openBlock(card, href, desktopKey) {
  if (platform === 'desktop') { getBoxBlock(card, false, desktopKey); return; }
  const open = openButton(href);
  if (nobox) {
    card.append(el('p', { className: 'note' }, t(lang, 'noBoxHint')));
    getBoxBlock(card, true, desktopKey);
    card.append(open);
  } else {
    card.append(open);
    getBoxBlock(card, false, desktopKey);
  }
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

/** A box anyone with the link may open, as boxView in core.js keeps it: the emoji icon, the name, the number of apps and up to 12 app
 *  names, each as text. Nothing else of the server's answer exists here. */
function boxHeader(card, box) {
  const icon = el('div', { className: 'icon', 'aria-hidden': 'true' }, box.icon);
  if (box.color) icon.style.background = box.color;
  card.append(icon);
  card.append(el('h1', { dir: 'auto' }, box.name));
  card.append(el('p', { className: 'by' }, t(lang, 'boxShared')));
  card.append(el('p', { className: 'platforms' }, boxCountText(lang, box.count)));
  if (box.apps.length) {
    const list = el('ul', { className: 'apps', 'aria-label': t(lang, 'boxAppsLabel') });
    for (const name of box.apps) list.append(el('li', { dir: 'auto' }, name));
    card.append(list);
  }
  if (box.more) card.append(el('p', { className: 'platforms' }, boxMoreText(lang, box.more)));
}

function message(card, titleKey, ...bodyKeys) {
  card.append(el('div', { className: 'icon', 'aria-hidden': 'true' }, '📦'));
  card.append(el('h1', {}, t(lang, titleKey)));
  for (const key of bodyKeys) if (key) card.append(el('p', { className: 'muted' }, t(lang, key)));
}

function render() {
  const card = $('card');
  card.replaceChildren();
  const plan = state === 'box' ? boxShown() : null;
  card.setAttribute('aria-busy', state === 'loading' || (plan && plan.screen === 'loading') ? 'true' : 'false');

  if (state === 'loading') {
    card.append(el('p', { className: 'muted', role: 'status' }, t(lang, 'loading')));
  } else if (state === 'found') {
    header(card);
    if (!fitsDevice(view, platform)) card.append(el('p', { className: 'note' }, t(lang, view.platforms.ios ? 'iosOnly' : 'androidOnly')));
    const fallback = pageUrl(location.origin, location.pathname, params.id, { lang, nobox: '1' });
    openBlock(card, openInBoxUrl(platform, params.id, config, fallback), 'desktop');
    linkBox(card);
    card.append(el('p', { className: 'muted small' }, t(lang, 'howTo')));
  } else if (state === 'box') {
    // A box link (docs/share-flow.md section 6.1). With its key: the box as box_open_link answered, or why not. Without one: the account
    // text (the box is for the people its owner added), and nothing about the box is read. boxPlan in core.js decides; this only draws it.
    if (plan.screen === 'loading') {
      card.append(el('p', { className: 'muted', role: 'status' }, t(lang, 'loading')));
    } else {
      if (plan.view) {
        boxHeader(card, plan.view);
        for (const key of plan.body) card.append(el('p', { className: 'muted' }, t(lang, key)));
      } else message(card, plan.title, ...plan.body);
      if (plan.open) {
        const fallback = boxPageUrl(location.origin, location.pathname, params.box, { lang, nobox: '1' }, plan.token);
        openBlock(card, openBoxInBoxUrl(platform, params.box, config, fallback, plan.token), 'boxDesktop');
      } else getBoxBlock(card, false, '');
      if (plan.retry) card.append(button(t(lang, 'retry'), () => { boxOutcome = 'loading'; note = ''; render(); load(); }, 'ghost'));
      linkBox(card);
      // The paste steps only when there is a link to paste (Get BOX copies it, the link field shows it): not before config.json loads.
      if (plan.copy && carryLink()) card.append(el('p', { className: 'muted small' }, t(lang, 'boxAfterInstall')));
    }
  } else if (state === 'missing') {
    // No "open this link on your phone" line on a computer: the app is not there, and a phone shows the same page.
    message(card, 'missing', 'missingBody');
    getBoxBlock(card, false, '');
  } else if (state === 'invalid') {
    // Nor for a link that is not valid (an app link or a box link, such as one whose key was cut off): a phone shows the same page.
    message(card, 'invalid', 'invalidBody');
    getBoxBlock(card, false, '');
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

/** A box link with its key: one box_open_link call. Every answer becomes something to show (boxOpenOutcome, boxPlan): the box, "no longer
 *  works", busy, "We couldn't load this box" and Retry when nothing (or something else) answered, or the account text when box links are
 *  off or the SQL is not there. */
async function loadBox() {
  const request = boxOpenRequest(config, params.box, params.token);
  let status = 0;
  let body = null;
  if (request) {
    try {
      const res = await fetch(request.url, request.init);
      status = res.status;
      try { body = await res.json(); } catch { body = null; }
    } catch { status = 0; }
  }
  boxOutcome = request ? boxOpenOutcome(status, body, params.box) : { kind: 'off' };
  setLang(lang);
}

async function load() {
  try {
    const res = await fetch('config.json', { cache: 'no-cache', credentials: 'omit' });
    if (!res.ok) throw new Error('config ' + res.status);
    config = readConfig(await res.json());
    configLoaded = true;
  } catch {
    if (params.state === 'ok') { state = 'error'; render(); }
    // A box link with its key cannot ask without the config: "We couldn't load this box" and Retry (never a blank page).
    else if (boxOutcome === 'loading') { boxOutcome = { kind: 'failed' }; setLang(lang); }
    return;
  }
  if (boxOutcome === 'loading') { await loadBox(); return; }
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
