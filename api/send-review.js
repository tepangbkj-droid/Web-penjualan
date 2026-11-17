// ============================================================
// /api/send-review — CUSTOMER EXPERIENCE REVIEW (diisi crew) → Telegram
// Foto (hasil kamera, dikompres browser) + format teks dikirim ke grup bot.
// ENV: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (atau TELEGRAM_REVIEW_CHAT_ID untuk grup khusus review)
// Opsional: REVIEW_ACCESS_CODE (kode crew), TURNSTILE_SECRET_KEY, FORM_SECRET, UPSTASH_*
// ============================================================
import {
  guard, looksLikeBot, verifyTurnstile, clean, escapeHtml, countLinks,
  getIp, tgCall, logSecurity, safeEqual, rateLimit,
} from "./_lib/security.js";
import { PRODUCTS } from "../src/products.js";

const STORE = "Green Pramuka Square";
const MAX_PHOTO = 1.5 * 1024 * 1024;
const MAX_TOTAL = 3.2 * 1024 * 1024;
const ROLES = { produk: "📷 Foto produk", selfie: "🤳 Selfie bareng produk" };
const ALLOWED = new Set(Object.values(PRODUCTS).flat().map((p) => p.name));
const isJpeg = (b) => b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

export default async function handler(req, res) {
  if (!(await guard(req, res, { bucket: "review", max: 6, windowMs: 10 * 60 * 1000, globalMax: 60, maxBytes: 4.5 * 1024 * 1024 }))) return;
  const chat_id = process.env.TELEGRAM_REVIEW_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!process.env.TELEGRAM_BOT_TOKEN || !chat_id) return bad(res, "Server belum dikonfigurasi.", 500);

  const b = req.body && typeof req.body === "object" ? req.body : {};
  if (await looksLikeBot(b, 5000)) {
    logSecurity("bot-suspect", req, { bucket: "review" });
    return bad(res, "Permintaan ditolak. Muat ulang halaman lalu coba lagi.");
  }
  const cap = await verifyTurnstile(b.cfToken, getIp(req), req);
  if (!cap.ok) {
    if (cap.misconfigured) return bad(res, "Server belum dikonfigurasi.", 500);
    logSecurity("captcha-failed", req, { bucket: "review" });
    return bad(res, "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.", 403);
  }

  // Kode crew (opsional, aktif bila REVIEW_ACCESS_CODE diisi) + batas percobaan salah
  const need = process.env.REVIEW_ACCESS_CODE;
  if (need) {
    const t = await rateLimit(`reviewcode:${getIp(req)}`, 8, 15 * 60 * 1000);
    if (!t.ok || !safeEqual(clean(b.code, 64), need)) {
      logSecurity("review-code-wrong", req);
      return bad(res, t.ok ? "Kode crew salah." : "Terlalu banyak percobaan kode. Tunggu 15 menit.", t.ok ? 401 : 429);
    }
  }

  const crew = clean(b.crew, 60), customer = clean(b.customer, 60);
  const fProduk = clean(b.feedbackProduk, 500, { multiline: true });
  const fService = clean(b.feedbackService, 500, { multiline: true });
  if (!crew || !customer || fProduk.length < 3 || fService.length < 3) return bad(res, "Data belum lengkap.");
  if ([crew, customer].some((v) => countLinks(v) > 0) || countLinks(fProduk) + countLinks(fService) > 2) {
    return bad(res, "Terlalu banyak tautan pada isian.");
  }

  // Pesanan: nama produk wajib cocok daftar resmi (server tidak percaya teks bebas)
  const raw = Array.isArray(b.items) ? b.items : [];
  if (raw.length < 1 || raw.length > 12) return bad(res, "Pilih 1–12 produk pesanan.");
  const items = [];
  for (const i of raw) {
    const name = typeof i?.name === "string" ? i.name : "";
    const qty = Number.isInteger(i?.qty) ? i.qty : 0;
    if (!ALLOWED.has(name) || qty < 1 || qty > 99) return bad(res, "Pesanan tidak valid.");
    items.push({ name, qty, note: clean(i.note, 80) });
  }

  // Foto: wajib 1–3, dicek dari isi file (JPEG), bukan dari label kiriman
  const list = Array.isArray(b.files) ? b.files : [];
  if (list.length < 1 || list.length > 3) return bad(res, "Lampirkan 1–3 foto.");
  const files = [];
  let total = 0;
  for (const f of list) {
    if (!ROLES[f?.role] || typeof f.data !== "string" || f.data.length > 2.2 * 1024 * 1024) return bad(res, "Foto tidak valid.");
    const buf = Buffer.from(f.data, "base64");
    if (!isJpeg(buf)) return bad(res, "Format foto tidak didukung.");
    if (buf.length > MAX_PHOTO) return bad(res, "Salah satu foto terlalu besar.", 413);
    total += buf.length;
    files.push({ role: f.role, buf });
  }
  if (total > MAX_TOTAL) return bad(res, "Total foto terlalu besar.", 413);

  const when = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "full", timeStyle: "short" });
  const order = items.map((i) => `• ${i.qty}x ${escapeHtml(i.name)}${i.note ? ` — <i>${escapeHtml(i.note)}</i>` : ""}`).join("\n");
  const text =
    `⭐ <b>CUSTOMER EXPERIENCE REVIEW</b>  #review\n━━━━━━━━━━━━━━━━━━\n` +
    `🏬 <b>Store:</b> ${STORE}\n👨‍🍳 <b>Nama Crew:</b> ${escapeHtml(crew)}\n🙋 <b>Nama Customer:</b> ${escapeHtml(customer)}\n\n` +
    `🛍 <b>Pesanan Customer:</b>\n${order}\n\n` +
    `🍞 <b>Feedback Produk:</b>\n${escapeHtml(fProduk)}\n\n` +
    `🛎 <b>Feedback Services:</b>\n${escapeHtml(fService)}\n\n` +
    `<i>${escapeHtml(when)} WIB</i>`;

  const photo = (f, caption, replyTo) => {
    const fd = new FormData();
    fd.append("chat_id", String(chat_id));
    fd.append("caption", caption);
    fd.append("parse_mode", "HTML");
    if (replyTo) fd.append("reply_parameters", JSON.stringify({ message_id: replyTo, allow_sending_without_reply: true }));
    fd.append("photo", new Blob([f.buf], { type: "image/jpeg" }), "review.jpg");
    return tgCall("sendPhoto", fd);
  };

  try {
    const fits = text.length <= 950; // batas caption Telegram 1024
    const first = await photo(files[0], fits ? text : `⭐ <b>Customer Experience Review</b>\n${escapeHtml(customer)} · crew ${escapeHtml(crew)}`);
    if (!first.ok) return bad(res, "Telegram menolak kiriman.", 502);
    const replyTo = first.result.message_id;
    let failed = 0;
    if (!fits) {
      const m = await tgCall("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } });
      if (!m.ok) failed++;
    }
    for (const f of files.slice(1)) {
      const r = await photo(f, `${ROLES[f.role]} — ${escapeHtml(customer)}`, replyTo);
      if (!r.ok) failed++;
    }
    return res.status(200).json({ ok: true, failed });
  } catch {
    return bad(res, "Gagal menghubungi Telegram.", 502);
  }
}
