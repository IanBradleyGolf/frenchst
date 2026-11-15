import { useEffect, useState } from 'react';

/** The bundle this page is running, e.g. "/assets/index-AbC123.js". */
function currentBundle() {
  const s = document.querySelector('script[type="module"][src*="/assets/"]') as HTMLScriptElement | null;
  return s ? new URL(s.src).pathname : null;
}

/** Shows a banner when a newer version of the app has been deployed since this page loaded. */
export function UpdateBanner() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const mine = currentBundle();
    if (!mine) return; // dev server
    const check = async () => {
      try {
        const html = await (await fetch('/', { cache: 'no-store' })).text();
        const m = html.match(/\/assets\/index-[^"']+\.js/);
        if (m && m[0] !== mine) setStale(true);
      } catch {
        /* offline */
      }
    };
    const t = setInterval(check, 60_000);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    check();
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
  if (!stale) return null;
  return (
    <div className="banner warn update-banner">
      A newer version of the app is available. Your work is saved.
      <button className="primary" onClick={() => location.reload()}>Reload now</button>
    </div>
  );
}
