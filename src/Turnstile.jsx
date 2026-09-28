// Cloudflare Turnstile (CAPTCHA modern, gratis, tanpa puzzle untuk kebanyakan orang).
// Aktif HANYA jika VITE_TURNSTILE_SITE_KEY diisi. Script-nya baru diunduh saat form dibuka,
// jadi tidak memberatkan loading halaman awal.
import { useEffect, useRef } from "react";
import { TURNSTILE_SITE_KEY } from "./config.js";

export const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY);

let scriptPromise = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error("turnstile-load")); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export default function Turnstile({ onToken }) {
  const box = useRef(null);
  const widgetId = useRef(null);

  useEffect(() => {
    if (!turnstileEnabled) return undefined;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current) return;
        widgetId.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "light",
          language: "id",
          callback: (t) => onToken(t),
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
      })
      .catch(() => onToken(""));
    return () => {
      cancelled = true;
      try { if (widgetId.current != null) window.turnstile.remove(widgetId.current); } catch { /* abaikan */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!turnstileEnabled) return null;
  return <div ref={box} className="min-h-[65px]" />;
}
