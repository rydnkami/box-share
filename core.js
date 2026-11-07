// The share page, pure part (docs/share-flow.md section 6). No DOM, no network: share.js does those. Tested by core.test.mjs (Node).
// Plain ES module, no build step, no dependencies.

export const APP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A catalog app id (a uuid), checked on the raw text. */
export const isAppId = (id) => typeof id === 'string' && APP_ID.test(id);

/** The key of a box link that anyone may open (docs/share-flow.md section 6.1): exactly 64 lower-case hex characters, the rule of the
 *  server (box_open_link) and of the app (src/links.ts), so a key one of them refuses is refused by all three. */
export const LINK_TOKEN = /^[0-9a-f]{64}$/;
export const isLinkToken = (k) => typeof k === 'string' && LINK_TOKEN.test(k);

/** An https URL with a host, checked on the raw text before parsing (new URL() repairs https:///x into something valid-looking). */
export function isHttps(url) {
  if (typeof url !== 'string' || /[\s\\]/.test(url) || !/^https:\/\/[^\s/\\?#@:]/i.test(url)) return false;
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}

/** The base of a box link: this page's https address ending in `?box=`, with no other parameter, no fragment and no credentials. */
function isBoxUrlBase(url) {
  if (!isHttps(url) || !/^https:\/\/[^?#]+\?box=$/.test(url)) return false;
  const u = new URL(url);
  return !u.username && !u.password;
}

/** The public config.json, checked: anything malformed falls back to "not configured" rather than to an unsafe value. */
export function readConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const supabaseUrl = isHttps(c.supabaseUrl) ? new URL(c.supabaseUrl).origin : '';
  const install = c.install && typeof c.install === 'object' ? c.install : {};
  const shareUrlBase = typeof c.shareUrlBase === 'string' && isHttps(c.shareUrlBase) && /[?&]app=$/.test(c.shareUrlBase) ? c.shareUrlBase : '';
  return {
    supabaseUrl,
    publishableKey: typeof c.publishableKey === 'string' && /^[A-Za-z0-9_.-]{10,400}$/.test(c.publishableKey) ? c.publishableKey : '',
    shareUrlBase,
    // Box links point at this page itself, never at the box-share function (docs/share-flow.md section 6.1).
    boxUrlBase: isBoxUrlBase(c.boxUrlBase) ? c.boxUrlBase : '',
    scheme: typeof c.scheme === 'string' && /^[a-z][a-z0-9+.-]{0,30}$/.test(c.scheme) ? c.scheme : 'box',
    androidPackage: typeof c.androidPackage === 'string' && /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(c.androidPackage) ? c.androidPackage : '',
    install: { ios: isHttps(install.ios) ? install.ios : '', android: isHttps(install.android) ? install.android : '' },
  };
}

/** What the page was opened with (`search` and `hash` of its address). `state`: 'none' (no app parameter), 'invalid' or 'ok'; 'box' for a
 *  box link (docs/boxes.md section 8.3), whose id is `box`. An `app` parameter wins over `box` (that is an app link).
 *  A box link may carry its key (`token`, docs/share-flow.md section 6.1): in the fragment `#k=` (what BOX shares; a fragment never reaches
 *  a server) or in the query `k=`, and the fragment wins. A key that is there but is not 64 lower-case hex characters makes the link
 *  'invalid' (most likely cut off when it was copied), never a box without a key. Apps ignore `k`. */
export function readParams(search, hash) {
  const p = new URLSearchParams(typeof search === 'string' ? search : '');
  const h = new URLSearchParams(typeof hash === 'string' ? hash.replace(/^#/, '') : '');
  const raw = p.get('app');
  const rawBox = raw === null || raw === '' ? p.get('box') : null;
  const lang = p.get('lang');
  const key = h.get('k') || p.get('k') || '';
  let boxState = rawBox === null || rawBox === '' ? null : isAppId(rawBox) ? 'box' : 'invalid';
  if (boxState === 'box' && key && !isLinkToken(key)) boxState = 'invalid';
  return {
    id: isAppId(raw) ? raw.toLowerCase() : null,
    box: boxState === 'box' ? rawBox.toLowerCase() : null,
    token: boxState === 'box' && key ? key : null,
    state: boxState ?? (raw === null || raw === '' ? 'none' : isAppId(raw) ? 'ok' : 'invalid'),
    lang: lang === 'he' || lang === 'en' ? lang : null,
    nobox: p.get('nobox') === '1',
  };
}

/** Hebrew or English: the `lang` parameter, else the browser's first language if it is one of them, else Hebrew. */
export function pickLang(param, languages) {
  if (param === 'he' || param === 'en') return param;
  const first = Array.isArray(languages) && typeof languages[0] === 'string' ? languages[0].toLowerCase() : '';
  if (first.startsWith('he') || first.startsWith('iw')) return 'he';
  if (first.startsWith('en')) return 'en';
  return 'he';
}

/** 'ios', 'android' or 'desktop', from the user agent (used on the page only, never sent). iPadOS 13+ reports a Mac with touch. */
export function detectPlatform(userAgent, maxTouchPoints) {
  const ua = typeof userAgent === 'string' ? userAgent : '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && Number(maxTouchPoints) > 1) return 'ios';
  return 'desktop';
}

/** The page's own address for an app (origin and path only, nothing else from the current URL), with optional extra parameters. */
export function pageUrl(origin, pathname, id, extra) {
  const url = new URL(origin + (typeof pathname === 'string' && pathname.startsWith('/') ? pathname : '/'));
  if (isAppId(id)) url.searchParams.set('app', id.toLowerCase());
  for (const [k, v] of Object.entries(extra || {})) if (v) url.searchParams.set(k, v);
  return url.href;
}

/** The page's own address for a box (origin and path, the box id and the given parameters, and the box's key as `#k=` when it has a valid
 *  one; nothing else from the current URL). */
export function boxPageUrl(origin, pathname, id, extra, token) {
  const url = new URL(origin + (typeof pathname === 'string' && pathname.startsWith('/') ? pathname : '/'));
  if (isAppId(id)) url.searchParams.set('box', id.toLowerCase());
  for (const [k, v] of Object.entries(extra || {})) if (v) url.searchParams.set(k, v);
  if (isAppId(id) && isLinkToken(token)) url.hash = 'k=' + token;
  return url.href;
}

/** "Open in BOX" for a box: box://box/<id> on iPhone; on Android intent://box/<id> with this page (nobox=1) as the fallback. A box anyone
 *  with the link may open carries its key as `?k=` (box://box/<id>?k=..., intent://box/<id>?k=...#Intent;...). */
export function openBoxInBoxUrl(platform, id, config, fallbackPage, token) {
  if (!isAppId(id)) return '';
  const path = 'box/' + id.toLowerCase() + (isLinkToken(token) ? '?k=' + token : '');
  if (platform === 'android' && config.androidPackage) {
    const fallback = isHttps(fallbackPage) ? `;S.browser_fallback_url=${encodeURIComponent(fallbackPage)}` : '';
    return `intent://${path}#Intent;scheme=${config.scheme};package=${config.androidPackage}${fallback};end`;
  }
  return `${config.scheme}://${path}`;
}

/** The box link BOX accepts on Paste, as BOX shares it (contract of 7 Nov 2026, decision 3): this page with `?box=<id>`, plus `#k=` and the
 *  key for a box anyone with the link may open. Never the box-share function, whose deployed copy drops `box=`. '' when not configured. */
export const boxShareLink = (config, id, token) =>
  (config.boxUrlBase && isAppId(id) ? config.boxUrlBase + id.toLowerCase() + (isLinkToken(token) ? '#k=' + token : '') : '');

/** The "Open in BOX" address: box://app/<id> on iPhone; on Android an intent:// URL whose fallback (BOX missing) is this page with nobox=1. */
export function openInBoxUrl(platform, id, config, fallbackPage) {
  if (!isAppId(id)) return '';
  const appId = id.toLowerCase();
  if (platform === 'android' && config.androidPackage) {
    const fallback = isHttps(fallbackPage) ? `;S.browser_fallback_url=${encodeURIComponent(fallbackPage)}` : '';
    return `intent://app/${appId}#Intent;scheme=${config.scheme};package=${config.androidPackage}${fallback};end`;
  }
  return `${config.scheme}://app/${appId}`;
}

/** The link BOX accepts on Paste: the stable https share link (the same string the app shares). */
export const shareLink = (config, id) => (config.shareUrlBase && isAppId(id) ? config.shareUrlBase + id.toLowerCase() : '');

/** Where "Get BOX" goes on this platform; '' when no install link is configured (closed test). */
export const installUrl = (config, platform) => (platform === 'ios' ? config.install.ios : platform === 'android' ? config.install.android : '');

/** The line shown instead of an install link on this platform: '' when there is one; on iPhone without a public TestFlight link, ask the
 *  sender for a TestFlight invite; elsewhere the general closed-test line. */
export const noInstallNote = (config, platform) =>
  installUrl(config, platform) ? '' : platform === 'ios' ? 'iosInvite' : 'closedTest';

/** The label of the "Get BOX" button on a phone. Without an install link it only copies the share link, so it must not promise an
 *  install: 'copyForLater' (shown only when there is a link to carry; getBoxBlock in share.js). */
export const getBoxLabel = (config, platform, first) =>
  !installUrl(config, platform) ? 'copyForLater' : first ? 'getBoxFirst' : 'getBox';

/** The catalog read for one published app with its active packages. Never selects owner_id. */
export function catalogQuery(config, id) {
  if (!config.supabaseUrl || !isAppId(id)) return '';
  const select = 'id,name,developer_name,summary,icon,icon_url,color,launch_url,mini_app_packages(platform,kind,url)';
  return `${config.supabaseUrl}/rest/v1/mini_apps?select=${encodeURIComponent(select)}&id=eq.${id.toLowerCase()}&status=eq.published&limit=1`;
}

/** Text from the catalog, made safe for a single line: control and bidi-override characters removed, whitespace collapsed, capped. Shown
 *  through textContent only. */
export function cleanText(value, max) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : text;
}

/** The emoji icon: a short string without letters or digits, else a default (✨ for an app, 📦 for a box). */
export function cleanIcon(value, fallback = '✨') {
  const text = cleanText(value, 8);
  return text && Array.from(text).length <= 4 && !/[A-Za-z0-9<>&"']/.test(text) ? text : fallback;
}

/** A creator image is shown only from BOX's own public storage, so no third-party host learns who opened the page. */
export function safeIconUrl(url, config) {
  if (!isHttps(url) || !config.supabaseUrl) return '';
  const u = new URL(url);
  return u.origin === config.supabaseUrl && u.pathname.startsWith('/storage/v1/object/public/') && !u.username ? u.href : '';
}

export const cleanColor = (value) => (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '');

/** A catalog row as the page shows it, or null when the row is not the requested app. */
export function appView(row, config, id) {
  if (!row || typeof row !== 'object' || !isAppId(row.id) || (id && row.id.toLowerCase() !== id.toLowerCase())) return null;
  const packages = Array.isArray(row.mini_app_packages) ? row.mini_app_packages.filter((p) => p && typeof p === 'object') : [];
  const has = (pl) => packages.some((p) => p.platform === pl && typeof p.url === 'string' && p.url);
  const web = isHttps(row.launch_url) || has('web');
  return {
    id: row.id.toLowerCase(),
    name: cleanText(row.name, 80) || 'BOX',
    developer: cleanText(row.developer_name, 60),
    summary: cleanText(row.summary, 300),
    icon: cleanIcon(row.icon),
    iconUrl: safeIconUrl(row.icon_url, config),
    color: cleanColor(row.color),
    platforms: { ios: has('ios'), android: has('android'), web },
  };
}

/** The "Available for" chips: platforms only. The page never offers the app outside BOX (owner rule, docs/decisions.md): an app with
 *  a version that runs in BOX on any device (`platforms.web`, technically a web package) shows iPhone and Android; a native-only app
 *  shows only the platform it has (an APK-only app stays Android only). */
export function platformChips(view) {
  if (!view) return [];
  const { ios, android, web } = view.platforms;
  return [ios || web ? 'ios' : '', android || web ? 'android' : ''].filter(Boolean);
}

/** Whether to add the "Runs in BOX" line under the chips: a property of the app, not a platform, so it is not one of the chips. */
export const runsInBox = (view) => !!view && view.platforms.web;

/** Whether this device can use the app once it is in BOX: a package for its platform, or a version that runs in BOX on any device. */
export const fitsDevice = (view, platform) =>
  !!view && (view.platforms.web || (platform === 'ios' && view.platforms.ios) || (platform === 'android' && view.platforms.android) || platform === 'desktop');

// Box links anyone may open (docs/share-flow.md section 6.1) ------------------------------------------------------------------------

/** The one request a box link with its key makes: the anonymous RPC box_open_link, a POST with the public key and a JSON body (no
 *  Authorization header, no cookie), so the key never appears in an address or a server log. null when the page is not configured or the
 *  link has no valid id and key: a box link without a key makes no request at all. */
export function boxOpenRequest(config, id, token) {
  if (!config || !config.supabaseUrl || !config.publishableKey || !isAppId(id) || !isLinkToken(token)) return null;
  return {
    url: config.supabaseUrl + '/rest/v1/rpc/box_open_link',
    init: {
      method: 'POST',
      headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_box: id.toLowerCase(), p_token: token }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    },
  };
}

// What PostgREST answers while the SQL is not applied (or was rolled back): a missing function, column, table or relationship, or a role
// that may not run the function. The page then shows the account text of a box without a key, as when the feature is switched off.
const RPC_UNAVAILABLE = ['PGRST202', 'PGRST204', 'PGRST205', 'PGRST200', '42703', '42P01', '42883', '42501'];

/** What a failed box_open_link answer means for the page:
 *  - 'gone': PT404 box_not_found (unknown, turned off, reset, deleted, taken down: one answer for all, so it says nothing more)
 *  - 'busy': PT429 rate_limited (the daily counters), or any 429
 *  - 'off': PT422 (feature_off: box links are switched off), or the function missing or not allowed (SQL not applied)
 *  - 'failed': anything else (no answer, a server error)
 *  The server's word is read like src/cloudErrors.ts reads it, from the message (`box: <word> ...`, 11_boxes.sql), or else from the hint. */
export function boxOpenError(status, body) {
  const b = body && typeof body === 'object' ? body : {};
  const code = typeof b.code === 'string' ? b.code : '';
  const fromMessage = /^box:\s*([a-z_]+)/.exec(typeof b.message === 'string' ? b.message : '');
  const word = fromMessage ? fromMessage[1] : typeof b.hint === 'string' && /^[a-z_]+$/.test(b.hint) ? b.hint : '';
  if (code === 'PT404' || word === 'box_not_found') return 'gone';
  if (status === 429 || code === 'PT429' || word === 'rate_limited') return 'busy';
  if (code === 'PT422' || word === 'feature_off' || RPC_UNAVAILABLE.includes(code)) return 'off';
  return 'failed';
}

/** At most this many app names are listed for a box; the others are counted ("and 3 more"). */
export const BOX_APP_NAMES = 12;

/** A box_open_link answer as the page shows it, or null when it is not the requested box. Only the box's name, its icon (an emoji through
 *  cleanIcon: never an image, never letters) and colour, and the names of its live apps are read; nothing else of the answer (an email,
 *  a member, a member count, an owner) is ever kept, so nothing else can be shown. */
export function boxView(body, id) {
  const r = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  const b = r && r.box && typeof r.box === 'object' && !Array.isArray(r.box) ? r.box : null;
  if (!b || !isAppId(b.id) || (id && b.id.toLowerCase() !== String(id).toLowerCase())) return null;
  const seen = new Set();
  const names = [];
  for (const x of Array.isArray(r.items) ? r.items : []) {
    if (!x || typeof x !== 'object' || (x.state !== undefined && x.state !== 'live')) continue;
    const appId = isAppId(x.id) ? x.id.toLowerCase() : isAppId(x.app_id) ? x.app_id.toLowerCase() : '';
    if (!appId || seen.has(appId)) continue;
    seen.add(appId);
    names.push(cleanText(x.name, 40) || 'BOX');
  }
  return {
    id: b.id.toLowerCase(),
    name: cleanText(b.name, 60) || 'BOX',
    icon: cleanIcon(b.icon, '📦'),
    color: cleanColor(b.color),
    count: names.length,
    apps: names.slice(0, BOX_APP_NAMES),
    more: Math.max(0, names.length - BOX_APP_NAMES),
  };
}

/** The answer of box_open_link as the page uses it: { kind: 'found', view }, or { kind: 'gone' | 'busy' | 'off' | 'failed' }. `status` 0
 *  means no answer (a network failure). A 2xx answer that is not this box counts as failed. */
export function boxOpenOutcome(status, body, id) {
  if (status >= 200 && status < 300) {
    const view = boxView(body, id);
    return view ? { kind: 'found', view } : { kind: 'failed' };
  }
  return { kind: boxOpenError(status, body) };
}

/** What the page shows for a box link, from its key and the outcome of box_open_link ('loading' while it runs):
 *  - no key, a box for the people its owner added: the account text ('invited'); nothing is asked
 *  - found: the box (name, icon, number of apps, up to 12 app names), Open in BOX and Get BOX carrying the key
 *  - gone: "This link no longer works", nothing to open or copy
 *  - busy: the busy text and Retry; Open in BOX and the copied link keep the key (it may work later)
 *  - failed (no answer, a server error, an answer that is not this box, config.json not loaded; anything not listed here): "We couldn't
 *    load this box", check the connection, and Retry; Open in BOX and the copied link keep the key. Never the account text: a key means
 *    the owner chose "anyone with the link", so "sign in with the email address the owner added" would give the wrong reason.
 *  - off (box links switched off, or the SQL not applied): the account text, as BOX itself falls back to the invited path (while links
 *    are off, only the people the owner added can open the box); the key is still carried so BOX can try itself
 *  `title` and `body` are string keys; `token` is the key Open in BOX and the copied link carry; `open`: Open in BOX is offered; `copy`:
 *  Get BOX copies the box link (and the link field shows it); `retry`: a Retry button. */
export function boxPlan(token, outcome) {
  const key = isLinkToken(token) ? token : null;
  const general = { screen: 'invited', title: 'boxShared', body: ['boxHow', 'boxWhere'], view: null, token: key, open: true, copy: true, retry: false };
  if (!key) return general;
  if (!outcome || outcome === 'loading') return { ...general, screen: 'loading', body: [], open: false, copy: false };
  if (outcome.kind === 'found' && outcome.view) return { ...general, screen: 'found', title: '', body: ['boxOpenHint'], view: outcome.view };
  if (outcome.kind === 'gone') return { ...general, screen: 'gone', title: 'boxLinkGone', body: ['boxLinkGoneBody'], token: null, open: false, copy: false };
  if (outcome.kind === 'busy') return { ...general, screen: 'busy', title: 'boxLinkBusy', body: ['boxLinkBusyBody'], retry: true };
  if (outcome.kind === 'off') return general;
  return { ...general, screen: 'failed', title: 'boxLoadFailed', body: ['errorBody'], retry: true };
}

/** The page's title (document.title): the app's or the box's name once known; for a box link, the heading of its plan (boxPlan); for an
 *  app link that is loading, missing or failed, the app title. Anything else (no link, or a link that is not valid, which may be an app
 *  link or a box link, such as a box link whose key was cut off) keeps the neutral title of index.html, never the app title.
 *  `view`: the app (appView) once found; `plan`: the box link's boxPlan. */
export function documentTitle(lang, state, view, plan) {
  if (state === 'found' && view) return `${view.name} · BOX`;
  if (state === 'box' && plan) return plan.view ? `${plan.view.name} · BOX` : t(lang, plan.title || 'boxShared');
  if (state === 'loading' || state === 'found' || state === 'missing' || state === 'error') return t(lang, 'title');
  return t(lang, 'sharedTitle');
}

/** A UI string with its {name} parts filled in. */
export const tf = (lang, key, vars) => t(lang, key).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));

/** The number of apps in a box: "No apps in this box yet.", "1 app", "5 apps". */
export const boxCountText = (lang, n) => (n === 0 ? t(lang, 'boxAppsNone') : n === 1 ? t(lang, 'boxAppsOne') : tf(lang, 'boxAppsMany', { count: n }));

/** The line under the listed names when there are more: "and 1 more", "and 3 more". */
export const boxMoreText = (lang, n) => (n === 1 ? t(lang, 'boxMoreOne') : tf(lang, 'boxMoreMany', { count: n }));

export const STRINGS = {
  he: {
    title: 'שיתפו איתכם אפליקציה ב־BOX',
    // The neutral title of index.html (an app link or a box link): no link, or a link that is not valid (documentTitle).
    sharedTitle: 'שיתפו איתכם ב־BOX',
    loading: 'טוען…',
    by: 'מאת',
    platforms: 'זמינה ל:',
    ios: 'iPhone',
    android: 'Android',
    runsInBox: 'האפליקציה פועלת בתוך BOX, באייפון ובאנדרואיד.',
    openInBox: 'פתיחה ב־BOX',
    getBox: 'להורדת BOX',
    getBoxFirst: 'עוד אין לכם BOX? מתחילים כאן',
    copyForLater: 'העתקת הקישור לשימוש אחרי ההתקנה',
    // copied, copyFailed and howTo name what both Homes show (docs/share-flow.md section 8 (b) step 3): a fresh install's first launch runs
    // the JavaScript built into 1.1.0 ("Paste a link", Paste, then "Save to BOX"); from the next cold launch, the hand-off card's Paste, or
    // "Catalog +", "+ Link", Paste. core.test.mjs checks the labels against both.
    copied: 'הקישור הועתק. אחרי ההתקנה פותחים את BOX ולוחצים על "הדבקה" בכרטיס שבראש המסך, או על "הדבקת קישור" ואז על "הדבקה".',
    copyFailed: 'לא הצלחנו להעתיק אוטומטית. העתיקו את הקישור למטה לפני ההתקנה, ואז פתחו את BOX ולחצו על "הדבקה" בכרטיס שבראש המסך, או על "הדבקת קישור" ואז על "הדבקה".',
    continueInstall: 'המשך להתקנה',
    closedTest: 'BOX נמצא כרגע בבדיקה סגורה. בקשו הזמנה ממי ששלח לכם את הקישור.',
    iosInvite: 'BOX ל־iPhone נמצא כרגע בבדיקה סגורה ב־TestFlight. בקשו ממי ששלח לכם את הקישור הזמנה ל־TestFlight.',
    linkLabel: 'הקישור לאפליקציה',
    copy: 'העתקה',
    copyDone: 'הועתק',
    howTo: 'אחרי שמתקינים את BOX: פותחים אותו ולוחצים על "הדבקה" בכרטיס שבראש המסך, או על "הדבקת קישור" ואז על "הדבקה". לא רואים אף אחד מהם? פותחים את "קטלוג +", לוחצים על "＋ קישור" ואז על "הדבקה". אם BOX מציג את דף האפליקציה עם "שמור ב־BOX", לוחצים עליו כדי להוסיף אותה.',
    noBoxHint: 'נראה ש־BOX לא מותקן במכשיר הזה.',
    iosOnly: 'כרגע זמין רק ל־iPhone.',
    androidOnly: 'כרגע זמין רק ל־Android.',
    desktop: 'פתחו את הקישור הזה בטלפון כדי להוסיף את האפליקציה ל־BOX.',
    desktopInstall: 'התקנת BOX:',
    installIos: 'BOX ל־iPhone',
    installAndroid: 'BOX ל־Android',
    invalid: 'הקישור הזה אינו תקין.',
    invalidBody: 'ייתכן שהוא נחתך בהעתקה. בקשו מהשולח לשלוח אותו שוב.',
    missing: 'האפליקציה הזו אינה זמינה יותר',
    missingBody: 'ייתכן שהיא הוסרה או שעוד לא פורסמה.',
    none: 'BOX: כל האפליקציות שלכם במקום אחד',
    noneBody: 'קטלוג ומשגר לאפליקציות קטנות. קיבלתם קישור לאפליקציה? פתחו אותו בטלפון.',
    error: 'לא הצלחנו לטעון את האפליקציה.',
    errorBody: 'בדקו את החיבור לאינטרנט ונסו שוב.',
    retry: 'נסו שוב',
    language: 'English',
    privacy: 'הדף הזה לא משתמש בעוגיות ולא עוקב אחריכם.',
    // Box links (docs/share-flow.md section 6.1). A fresh install's first launch runs the JavaScript built into 1.1.0, which knows no boxes:
    // the box texts therefore say to close BOX and open it again (the next cold launch runs the current app), never "Paste a link".
    boxShared: 'שיתפו איתכם קופסה ב־BOX',
    boxHow: 'הקופסה הזו מיועדת לאנשים שהבעלים שלה הוסיפו. כדי לראות אותה, פותחים את BOX ומתחברים, או יוצרים חשבון BOX בחינם, עם כתובת המייל שהבעלים הוסיפו.',
    boxWhere: 'אחר כך הקופסה מופיעה כעמוד במסך הבית של BOX (מחליקים הצידה מ"ה־BOX שלי"), וגם בהגדרות, תחת "קופסאות".',
    boxOpenHint: 'פותחים אותה ב־BOX כדי לראות את האפליקציות ולשמור את אלה שרוצים. לא צריך חשבון.',
    boxAppsLabel: 'האפליקציות בקופסה',
    boxAppsNone: 'עדיין אין אפליקציות בקופסה הזו.',
    boxAppsOne: 'אפליקציה אחת',
    boxAppsMany: '{count} אפליקציות',
    boxMoreOne: 'ועוד אחת',
    boxMoreMany: 'ועוד {count}',
    boxLinkGone: 'הקישור הזה כבר לא עובד.',
    boxLinkGoneBody: 'בקשו ממי ששלח לכם אותו קישור חדש.',
    boxLinkBusy: 'BOX עמוס כרגע',
    boxLinkBusyBody: 'הרבה אנשים פותחים קופסאות כרגע. נסו שוב מאוחר יותר.',
    boxLoadFailed: 'לא הצלחנו לטעון את הקופסה.',
    boxDesktop: 'פתחו את הקישור הזה בטלפון כדי לראות את הקופסה ב־BOX.',
    boxLinkLabel: 'הקישור לקופסה',
    boxCopied: 'הקישור הועתק. אחרי ההתקנה פותחים את BOX ולוחצים על "הדבקה" בכרטיס שבראש המסך. אם BOX נפתח ריק בפעם הראשונה, סוגרים אותו, פותחים אותו שוב ולוחצים על "הדבקה".',
    boxCopyFailed: 'לא הצלחנו להעתיק אוטומטית. העתיקו את הקישור למטה לפני ההתקנה, ואז פתחו את BOX ולחצו על "הדבקה" בכרטיס שבראש המסך. אם BOX נפתח ריק בפעם הראשונה, סגרו אותו, פתחו אותו שוב ולחצו על "הדבקה".',
    boxAfterInstall: 'אחרי שמתקינים את BOX: פותחים אותו ולוחצים על "הדבקה" בכרטיס שבראש המסך. אם BOX נפתח ריק בפעם הראשונה, סוגרים אותו, פותחים אותו שוב ולוחצים על "הדבקה". לא רואים את הכרטיס? פותחים את "קטלוג +", לוחצים על "＋ קישור" ואז על "הדבקה".',
  },
  en: {
    title: 'An app was shared with you on BOX',
    sharedTitle: 'Shared with you on BOX',
    loading: 'Loading…',
    by: 'by',
    platforms: 'Available for:',
    ios: 'iPhone',
    android: 'Android',
    runsInBox: 'The app runs inside BOX, on iPhone and Android.',
    openInBox: 'Open in BOX',
    getBox: 'Get BOX',
    getBoxFirst: "Don't have BOX yet? Start here",
    copyForLater: 'Copy the link for after installing',
    copied: 'Link copied. After installing, open BOX and tap Paste on the card at the top, or "Paste a link" and then Paste.',
    copyFailed: 'We couldn\'t copy it automatically. Copy the link below before installing, then open BOX and tap Paste on the card at the top, or "Paste a link" and then Paste.',
    continueInstall: 'Continue to install',
    closedTest: 'BOX is in a closed test right now. Ask the person who sent this for an invite.',
    iosInvite: 'BOX for iPhone is in a closed TestFlight test right now. Ask the person who sent this for a TestFlight invite.',
    linkLabel: 'Link to this app',
    copy: 'Copy',
    copyDone: 'Copied',
    howTo: 'After installing BOX, open it and tap Paste on the card at the top, or "Paste a link" and then Paste. Don\'t see either? Open "Catalog +", tap "＋ Link", then Paste. If BOX shows the app\'s page with "Save to BOX", tap it to add the app.',
    noBoxHint: "It looks like BOX isn't installed on this device.",
    iosOnly: 'Available on iPhone only for now.',
    androidOnly: 'Available on Android only for now.',
    desktop: 'Open this link on your phone to add the app to BOX.',
    desktopInstall: 'Install BOX:',
    installIos: 'BOX for iPhone',
    installAndroid: 'BOX for Android',
    invalid: 'This link is not valid.',
    invalidBody: 'It may have been cut off when copied. Ask the sender to send it again.',
    missing: 'This app is no longer available',
    missingBody: 'It may have been removed, or it is not published yet.',
    none: 'BOX: all your apps in one place',
    noneBody: 'A catalog and launcher for small apps. Got a link to an app? Open it on your phone.',
    error: "We couldn't load this app.",
    errorBody: 'Check your internet connection and try again.',
    retry: 'Try again',
    language: 'עברית',
    privacy: 'This page uses no cookies and does not track you.',
    boxShared: 'A box was shared with you on BOX',
    boxHow: 'This box is for the people its owner added. To see it, open BOX and sign in, or create a free BOX account, with the email address the owner added.',
    boxWhere: 'The box then appears as a page on BOX\'s Home (swipe sideways from "My Box"), and in Settings, under "Boxes".',
    boxOpenHint: 'Open it in BOX to see its apps and save the ones you want. No account needed.',
    boxAppsLabel: 'Apps in this box',
    boxAppsNone: 'No apps in this box yet.',
    boxAppsOne: '1 app',
    boxAppsMany: '{count} apps',
    boxMoreOne: 'and 1 more',
    boxMoreMany: 'and {count} more',
    boxLinkGone: 'This link no longer works.',
    boxLinkGoneBody: 'Ask the person who sent it for a new one.',
    boxLinkBusy: 'BOX is busy right now',
    boxLinkBusyBody: 'Many people are opening boxes right now. Try again later.',
    boxLoadFailed: "We couldn't load this box.",
    boxDesktop: 'Open this link on your phone to see the box in BOX.',
    boxLinkLabel: 'Link to this box',
    boxCopied: 'Link copied. After installing, open BOX and tap Paste on the card at the top. If BOX opens empty the first time, close it and open it again, then Paste.',
    boxCopyFailed: 'We couldn\'t copy it automatically. Copy the link below before installing, then open BOX and tap Paste on the card at the top. If BOX opens empty the first time, close it and open it again, then Paste.',
    boxAfterInstall: 'After installing BOX, open it and tap Paste on the card at the top. If BOX opens empty the first time, close it and open it again, then Paste. Don\'t see the card? Open "Catalog +", tap "＋ Link", then Paste.',
  },
};

/** A UI string; English if a key is missing in Hebrew (never happens: the test checks both dictionaries). */
export const t = (lang, key) => (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
