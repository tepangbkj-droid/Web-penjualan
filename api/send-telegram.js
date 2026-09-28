// ============================================================
// /api/send-telegram — notifikasi PESANAN ke grup Telegram
// (dengan tombol "Sudah Dibayar / Belum Dibayar").
//
// PERUBAHAN KEAMANAN: server TIDAK lagi menerima teks bebas dari browser
// (dulu siapa pun bisa curl endpoint ini & spam grup). Sekarang browser
// mengirim data terstruktur; server memvalidasi lalu menyusun pesannya sendiri.
//
// ENV: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Opsional: TURNSTILE_SECRET_KEY, ALLOWED_ORIGINS
// ============================================================
import { guard, looksLikeBot, verifyTurnstile, clean, normalizePhone, getIp, tgCall } from "./_lib/security.js";

const fmtPrice = (n) => "Rp " + Number(n).toLocaleString("id-ID");

export default async function handler(req, res) {
  if (!guard(req, res, { bucket: "order", max: 6, windowMs: 10 * 60 * 1000 })) return;

  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    return res.status(500).json({ error: "Server belum dikonfigurasi." });
  }

  const b = req.body && typeof req.body === "object" ? req.body : {};

  if (looksLikeBot(b, 2000)) return res.status(400).json({ error: "Permintaan ditolak." });
  if (!(await verifyTurnstile(b.cfToken, getIp(req)))) {
    return res.status(403).json({ error: "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi." });
  }

  const name = clean(b.name, 60);
  const phone = normalizePhone(b.phone);
  const type = ["Pick Up di Toko", "Online Delivery"].includes(b.type) ? b.type : null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : null;
  const time = /^\d{2}:\d{2}$/.test(b.time || "") ? b.time : null;

  if (!name || !phone || !type || !date || !time) {
    return res.status(400).json({ error: "Data pesanan tidak lengkap / tidak valid." });
  }

  const rawItems = Array.isArray(b.items) ? b.items.slice(0, 30) : [];
  const items = rawItems
    .map((i) => ({
      label: clean(i?.label, 200),
      qty: Number.isInteger(i?.qty) ? i.qty : 0,
      price: Number.isInteger(i?.price) ? i.price : -1,
    }))
    .filter((i) => i.label && i.qty >= 1 && i.qty <= 99 && i.price >= 0 && i.price <= 1_000_000);

  if (items.length === 0 || items.length !== rawItems.length) {
    return res.status(400).json({ error: "Isi keranjang tidak valid." });
  }

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const detail = items.map((i) => `- ${i.qty}x ${i.label} (${fmtPrice(i.price)})`).join("\n");

  // Teks polos (tanpa parse_mode) → aman dari karakter aneh & mudah di-parse webhook.
  const text =
    `🚨 PESANAN BARU MASUK! 🚨\n` +
    `Nama: ${name}\n` +
    `No WA: ${phone}\n` +
    `Tipe: ${type}\n` +
    `Tanggal & Waktu: ${date} - ${time}\n\n` +
    `📦 Detail Pesanan:\n${detail}\n\n` +
    `Total: ${fmtPrice(total)}\n\n` +
    `💳 Status Pembayaran: ⏳ Belum Dibayar`;

  try {
    const data = await tgCall("sendMessage", {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      reply_markup: {
        inline_keyboard: [[
          { text: "⬜ Belum Dibayar", callback_data: "mark_unpaid" },
          { text: "✅ Tandai Sudah Dibayar", callback_data: "mark_paid" },
        ]],
      },
    });
    if (!data.ok) return res.status(502).json({ error: "Telegram menolak pesan." });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ error: "Gagal menghubungi Telegram." });
  }
}
