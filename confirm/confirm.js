// Email-confirmation landing page. Do not auto-submit: mail scanners can prefetch links.
// This is deliberately a confirmation-only flow; discard any session returned by GoTrue.
const API = 'https://vrqeitjcbstgnxufcrff.supabase.co/auth/v1/verify';
const KEY = 'sb_publishable_1gIKUfRQ_UoucTiKqtMCsA_Yggv0HIJ';
const params = new URLSearchParams(location.search);
const token = params.get('token_hash');
const type = params.get('type');
const status = document.getElementById('status');
const button = document.getElementById('confirm');
const valid = !!token && /^[a-f0-9]{32,256}$/i.test(token) && type === 'email';
history.replaceState(null, '', location.pathname);
if (!valid) {
  status.textContent = 'הקישור חסר או אינו תקין. בקשו מייל אימות חדש דרך BOX.';
  button.hidden = true;
} else {
  button.disabled = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = 'מאמתים את כתובת המייל…';
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: KEY },
        body: JSON.stringify({ token_hash: token, type: 'email' }),
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
      if (!res.ok) {
        status.textContent = res.status === 429
          ? 'בוצעו יותר מדי ניסיונות. נסו שוב מאוחר יותר.'
          : 'לא הצלחנו לאמת את המייל. ייתכן שהקישור פג תוקף או כבר נוצל. בקשו מייל חדש דרך BOX.';
        return;
      }
      status.textContent = 'כתובת המייל אומתה בהצלחה! אפשר לחזור לאפליקציית BOX ולהתחבר.';
      button.hidden = true;
    } catch {
      status.textContent = 'שגיאת תקשורת. בדקו את החיבור לאינטרנט ונסו שוב.';
    } finally {
      if (!button.hidden) button.disabled = false;
    }
  }, { once: false });
}
