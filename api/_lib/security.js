// ============================================================
// api/_lib/security.js — helper keamanan bersama untuk semua endpoint.
// Awalan "_" membuat Vercel TIDAK menganggap file ini sebagai endpoint publik.
//
// ENV yang dipakai (semua diatur di Vercel → Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET   (wajib)
//   TURNSTILE_SECRET_KEY        (wajib di production → CAPTCHA anti-bot)
//   FORM_SECRET                 (disarankan → token form bertanda tangan, anti-replay)
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//                               (disarankan → rate limit yang benar-benar persisten)
//   ALLOWED_ORIGINS             (opsional → domain tambahan, pisahkan dengan koma)
//   TELEGRAM_ALLOWED_USER_IDS   (opsional → hanya ID Telegram ini yang boleh klik tombol)
//   ALLOW_NO_CAPTCHA=1          (HANYA untuk testing; mematikan kewajiban CAPTCHA)
// ============================================================
import crypto from "node:crypto";

const IS_PROD = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

export function logSecurity(event, req, extra = {}) {
  // Log ringkas tanpa data pribadi → bisa dilihat di Vercel → Logs
  console.warn(JSON.stringify({ sec: event, ip: getIp(req), ...extra }));
}

// ─── Perbandingan string aman dari timing attack ─────────────
export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

// ─── Penyimpanan counter: Upstash Redis (persisten) atau memori (cadangan) ─
const UP_URL = process.env.UPSTASH_REDIS_REST_URL;
const UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
export const hasRedis = Boolean(UP_URL && UP_TOKEN);

async function redis(command) {
  const r = await fetch(UP_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${UP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error("redis " + r.status);
  return (await r.json()).result;
}

const buckets = new Map();
function memHit(key, windowMs) {
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
  return { count: b.count, retryAfter: Math.ceil((b.reset - now) / 1000) };
}

async function hit(key, windowMs) {
  if (hasRedis) {
    try {
      const k = `rl:${key}`;
      const count = await redis(["INCR", k]);
      if (count === 1) await redis(["PEXPIRE", k, windowMs]);
      const ttl = await redis(["PTTL", k]);
      return { count, retryAfter: Math.max(1, Math.ceil((ttl > 0 ? ttl : windowMs) / 1000)) };
    } catch {
      /* Redis bermasalah → jatuh ke memori, jangan sampai situs mati */
    }
  }
  return memHit(key, windowMs);
}

export async function rateLimit(key, max, windowMs) {
  const r = await hit(key, windowMs);
  return { ok: r.count <= max, retryAfter: r.retryAfter };
}

// Token sekali pakai (anti-replay). Hanya efektif jika Redis aktif.
async function consumeOnce(id, ttlMs) {
  if (!hasRedis) return true;
  try {
    const res = await redis(["SET", `once:${id}`, "1", "PX", ttlMs, "NX"]);
    return res === "OK";
  } catch {
    return true;
  }
}

export function getIp(req) {
  const h = req.headers || {};
  // x-vercel-forwarded-for diisi Vercel & tidak bisa dipalsukan klien
  const raw = String(h["x-vercel-forwarded-for"] || h["x-real-ip"] || h["x-forwarded-for"] || "");
  return raw.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

// ─── Origin check: hanya menerima request dari website sendiri ─
export function originAllowed(req) {
  const h = req.headers || {};
  if (h["sec-fetch-site"] === "cross-site") return false;
  const origin = h.origin;
  if (!origin) return false;
  try {
    const host = new URL(origin).host;
    const own = String(h["x-forwarded-host"] || h.host || "").split(",")[0].trim();
    if (host === own) return true;
    const extra = (process.env.ALLOWED_ORIGINS || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    return extra.includes(origin);
  } catch {
    return false;
  }
}

// ─── Cloudflare Turnstile ────────────────────────────────────
// Di production CAPTCHA WAJIB: jika secret belum diisi, request DITOLAK (fail-closed).
export async function verifyTurnstile(token, ip, req) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (IS_PROD && process.env.ALLOW_NO_CAPTCHA !== "1") return { ok: false, misconfigured: true };
    return { ok: true };
  }
  if (!token || typeof token !== "string" || token.length > 2048) return { ok: false };
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    const data = await r.json();
    if (data.success !== true) return { ok: false };
    // pastikan token dibuat di domain kita (bukan hasil curian dari situs lain)
    if (data.hostname && req) {
      const own = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().split(":")[0];
      const extra = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => { try { return new URL(s.trim()).hostname; } catch { return ""; } });
      if (data.hostname !== own && !extra.includes(data.hostname)) return { ok: false };
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ─── Token form bertanda tangan (HMAC) ───────────────────────
// Dibuat server saat form dibuka; waktu pengisian dihitung dari tanda tangan,
// jadi bot TIDAK bisa memalsukan nilai "elapsed" lagi.
const TOKEN_MAX_AGE = 30 * 60 * 1000;
const formSecret = () => process.env.FORM_SECRET || "";

export function issueFormToken() {
  const secret = formSecret();
  if (!secret) return null;
  const ts = Date.now();
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = `${ts}.${nonce}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

async function verifyFormToken(token, minMs) {
  const secret = formSecret();
  if (typeof token !== "string" || token.length > 200) return false;
  const [ts, nonce, sig] = token.split(".");
  if (!ts || !nonce || !sig) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${ts}.${nonce}`).digest("hex");
  if (!safeEqual(sig, expected)) return false;
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < minMs || age > TOKEN_MAX_AGE) return false;
  return consumeOnce(nonce, TOKEN_MAX_AGE); // tiap token hanya boleh dipakai 1×
}

// ─── Pembersih teks ──────────────────────────────────────────
export function clean(value, max = 200, { multiline = false } = {}) {
  let s = typeof value === "string" ? value : value == null ? "" : String(value);
  s = s.replace(/\r\n/g, "\n");
  // buang karakter kontrol (kecuali newline bila multiline) & karakter pengecoh arah teks
  s = s.replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, "");
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "");
  if (multiline) s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim().slice(0, max);
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function countLinks(s) {
  return (String(s).match(/https?:\/\/|www\.|t\.me\/|bit\.ly|\.(com|net|org|xyz|ru|cn|top|click)\b/gi) || []).length;
}

export function normalizePhone(raw) {
  let d = String(raw || "").replace(/[\s()+\-.]/g, "");
  if (!/^\d{8,15}$/.test(d)) return null;
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}

// ─── Guard umum: method, origin, ukuran, rate limit ──────────
// Mengembalikan true bila request boleh dilanjutkan; jika tidak, response sudah dikirim.
// Dua lapis batas: per-IP (anti spam satu orang) + global (anti serangan banyak IP).
export async function guard(req, res, { bucket, max, windowMs, globalMax = 60, maxBytes = 20 * 1024 }) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return false;
  }
  if (!originAllowed(req)) {
    logSecurity("bad-origin", req, { bucket, origin: String(req.headers.origin || "") });
    res.status(403).json({ error: "Origin tidak diizinkan." });
    return false;
  }
  const ct = String(req.headers["content-type"] || "");
  if (!ct.includes("application/json")) {
    res.status(415).json({ error: "Content-Type harus application/json." });
    return false;
  }
  if (Number(req.headers["content-length"] || 0) > maxBytes) {
    res.status(413).json({ error: "Permintaan terlalu besar." });
    return false;
  }
  const rl = await rateLimit(`${bucket}:${getIp(req)}`, max, windowMs);
  if (!rl.ok) {
    logSecurity("rate-limited", req, { bucket });
    res.setHeader("Retry-After", String(rl.retryAfter));
    res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." });
    return false;
  }
  const gl = await rateLimit(`${bucket}:ALL`, globalMax, windowMs);
  if (!gl.ok) {
    logSecurity("global-limit", req, { bucket });
    res.setHeader("Retry-After", String(gl.retryAfter));
    res.status(429).json({ error: "Server sedang sibuk. Coba lagi sebentar lagi." });
    return false;
  }
  return true;
}

// ─── Cek anti-bot: honeypot + waktu pengisian (diverifikasi server) ─
export async function looksLikeBot(body, minMs) {
  if (body.hp) return true; // honeypot terisi → bot
  if (formSecret()) return !(await verifyFormToken(body.formToken, minMs));
  // Tanpa FORM_SECRET: cadangan lama (bisa dipalsukan, jadi hanya perlindungan dasar)
  const elapsed = Number(body.elapsed);
  return !Number.isFinite(elapsed) || elapsed < minMs;
}

export async function tgCall(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const isForm = typeof FormData !== "undefined" && payload instanceof FormData;
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? payload : JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  return r.json();
}
