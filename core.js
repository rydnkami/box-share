// The share page, pure part (docs/share-flow.md section 6). No DOM, no network: share.js does those. Tested by core.test.mjs (Node).
// Plain ES module, no build step, no dependencies.

export const APP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A catalog app id (a uuid), checked on the raw text. */
export const isAppId = (id) => typeof id === 'string' && APP_ID.test(id);

/** An https URL with a host, checked on the raw text before parsing (new URL() repairs https:///x into something valid-looking). */
export function isHttps(url) {
  if (typeof url !== 'string' || /[\s\\]/.test(url) || !/^https:\/\/[^\s/\\?#@:]/i.test(url)) return false;
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
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
    scheme: typeof c.scheme === 'string' && /^[a-z][a-z0-9+.-]{0,30}$/.test(c.scheme) ? c.scheme : 'box',
    androidPackage: typeof c.androidPackage === 'string' && /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(c.androidPackage) ? c.androidPackage : '',
    install: { ios: isHttps(install.ios) ? install.ios : '', android: isHttps(install.android) ? install.android : '' },
  };
}

/** What the page was opened with. `state`: 'none' (no app parameter), 'invalid' or 'ok'; 'box' for a box link (docs/boxes.md section 8.3),
 *  whose id is `box`. An `app` parameter wins over `box` (that is an app link). */
export function readParams(search) {
  const p = new URLSearchParams(typeof search === 'string' ? search : '');
  const raw = p.get('app');
  const rawBox = raw === null || raw === '' ? p.get('box') : null;
  const lang = p.get('lang');
  const boxState = rawBox === null || rawBox === '' ? null : isAppId(rawBox) ? 'box' : 'invalid';
  return {
    id: isAppId(raw) ? raw.toLowerCase() : null,
    box: boxState === 'box' ? rawBox.toLowerCase() : null,
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

/** The page's own address for a box (origin and path, the box id and the given parameters; nothing else from the current URL). */
export function boxPageUrl(origin, pathname, id, extra) {
  const url = new URL(origin + (typeof pathname === 'string' && pathname.startsWith('/') ? pathname : '/'));
  if (isAppId(id)) url.searchParams.set('box', id.toLowerCase());
  for (const [k, v] of Object.entries(extra || {})) if (v) url.searchParams.set(k, v);
  return url.href;
}

/** "Open in BOX" for a box: box://box/<id> on iPhone; on Android intent://box/<id> with this page (nobox=1) as the fallback. */
export function openBoxInBoxUrl(platform, id, config, fallbackPage) {
  if (!isAppId(id)) return '';
  const boxId = id.toLowerCase();
  if (platform === 'android' && config.androidPackage) {
    const fallback = isHttps(fallbackPage) ? `;S.browser_fallback_url=${encodeURIComponent(fallbackPage)}` : '';
    return `intent://box/${boxId}#Intent;scheme=${config.scheme};package=${config.androidPackage}${fallback};end`;
  }
  return `${config.scheme}://box/${boxId}`;
}

/** The box link BOX accepts on Paste: the same function URL as an app's, with `box=` (the string the app shares). */
export const boxShareLink = (config, id) => (config.shareUrlBase && isAppId(id) ? config.shareUrlBase.replace(/app=$/, 'box=') + id.toLowerCase() : '');

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
 *  install: 'copyForLater' (shown only for a found app; getBoxBlock in share.js). */
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

/** The emoji icon: a short string without letters or digits, else a default. */
export function cleanIcon(value) {
  const text = cleanText(value, 8);
  return text && Array.from(text).length <= 4 && !/[A-Za-z0-9<>&"']/.test(text) ? text : '✨';
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

export const STRINGS = {
  he: {
    title: 'שיתפו איתכם אפליקציה ב־BOX',
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
    boxShared: 'שיתפו איתכם קופסה ב־BOX',
    boxHow: 'כדי לראות אותה צריך לפתוח את BOX ולהתחבר עם כתובת המייל שאליה היא שותפה.',
    boxLinkLabel: 'הקישור לקופסה',
    boxCopied: 'הקישור הועתק. אחרי ההתקנה פותחים את BOX, מתחברים עם כתובת המייל הזו, והקופסה מופיעה תחת "שותפו איתי".',
    boxAfterInstall: 'אחרי ההתקנה: פותחים את BOX ומתחברים עם כתובת המייל שאליה הקופסה שותפה. היא מופיעה תחת "שותפו איתי", גם בלי הקישור.',
  },
  en: {
    title: 'An app was shared with you on BOX',
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
    boxHow: 'Open BOX and sign in with the email address it was shared with to see it.',
    boxLinkLabel: 'Link to this box',
    boxCopied: 'Link copied. After installing, open BOX and sign in with this email address: the box shows up under "Shared with me".',
    boxAfterInstall: 'After installing: open BOX and sign in with the email address the box was shared with. It shows up under "Shared with me", even without the link.',
  },
};

/** A UI string; English if a key is missing in Hebrew (never happens: the test checks both dictionaries). */
export const t = (lang, key) => (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
