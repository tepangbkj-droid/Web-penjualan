// ============================================================
// api/_lib/security.js — helper keamanan bersama untuk semua endpoint.
// Awalan "_" membuat Vercel TIDAK menganggap file ini sebagai endpoint publik.
// ============================================================

// ─── Rate limit (best-effort, in-memory per instance) ────────
// Untuk perlindungan penuh, aktifkan juga Vercel Firewall / Attack Challenge Mode.
const buckets = new Map();

export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  }
  let b = buckets.get(key);
  if (!b || b.reset < now) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return { ok: b.count <= max, retryAfter: Math.ceil((b.reset - now) / 1000) };
}

export function getIp(req) {
  const h = req.headers || {};
  const xff = String(h["x-vercel-forwarded-for"] || h["x-real-ip"] || h["x-forwarded-for"] || "");
  return xff.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

// ─── Origin check: hanya menerima request dari website sendiri ─
export function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const host = new URL(origin).host;
    if (host === req.headers.host) return true;
    const extra = (process.env.ALLOWED_ORIGINS || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    return extra.includes(origin);
  } catch {
    return false;
  }
}

// ─── Cloudflare Turnstile (opsional, aktif jika TURNSTILE_SECRET_KEY diisi) ─
export async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // fitur tidak diaktifkan
  if (!token || typeof token !== "string" || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const data = await r.json();
    return data.success === true;
  } catch {
    return false;
  }
}

// ─── Pembersih teks ──────────────────────────────────────────
export function clean(value, max = 200, { multiline = false } = {}) {
  let s = typeof value === "string" ? value : value == null ? "" : String(value);
  s = s.replace(/\r\n/g, "\n");
  // buang karakter kontrol (kecuali newline bila multiline) & karakter pengecoh arah teks
  s = s.replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, "");
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "");
  if (multiline) s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim().slice(0, max);
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function countLinks(s) {
  return (String(s).match(/https?:\/\/|www\.|t\.me\/|bit\.ly/gi) || []).length;
}

export function normalizePhone(raw) {
  let d = String(raw || "").replace(/[\s()+\-.]/g, "");
  if (!/^\d{8,15}$/.test(d)) return null;
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}

// ─── Guard umum: method, origin, ukuran, rate limit ──────────
// Mengembalikan true bila request boleh dilanjutkan; jika tidak, response sudah dikirim.
export function guard(req, res, { bucket, max, windowMs }) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return false;
  }
  if (!originAllowed(req)) {
    res.status(403).json({ error: "Origin tidak diizinkan." });
    return false;
  }
  const ct = String(req.headers["content-type"] || "");
  if (!ct.includes("application/json")) {
    res.status(415).json({ error: "Content-Type harus application/json." });
    return false;
  }
  const rl = rateLimit(`${bucket}:${getIp(req)}`, max, windowMs);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." });
    return false;
  }
  return true;
}

// ─── Cek anti-bot: honeypot + waktu pengisian minimum ────────
export function looksLikeBot(body, minMs) {
  if (body.hp) return true; // honeypot terisi → bot
  const elapsed = Number(body.elapsed);
  if (!Number.isFinite(elapsed) || elapsed < minMs) return true;
  return false;
}

export async function tgCall(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const isForm = typeof FormData !== "undefined" && payload instanceof FormData;
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? payload : JSON.stringify(payload),
  });
  return r.json();
}
