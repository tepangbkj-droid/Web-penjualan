// ============================================================
// /api/telegram-webhook — Vercel Serverless Function
// Menerima update dari Telegram setiap kali ada anggota grup
// yang menekan tombol "Sudah Dibayar" / "Belum Dibayar", lalu
// meng-update pesan tersebut secara langsung (tidak perlu database —
// status pembayaran "hidup" di dalam pesan Telegram itu sendiri).
// ============================================================
// SETUP (sekali saja, lihat SETUP_TELEGRAM.md):
//   1. Deploy project ini ke Vercel dulu supaya dapat URL publik, misal:
//      https://tarobun.vercel.app/api/telegram-webhook
//   2. Daftarkan URL itu ke Telegram lewat perintah setWebhook (lihat SETUP_TELEGRAM.md).
//
// ENV VARS:
//   TELEGRAM_BOT_TOKEN         → sama seperti di send-telegram.js
//   TELEGRAM_WEBHOOK_SECRET    → (opsional tapi disarankan) string acak untuk
//                                 memastikan request memang dari Telegram, bukan orang iseng.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("ok"); // Telegram hanya perlu 200, method lain diabaikan saja
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const SECRET    = process.env.TELEGRAM_WEBHOOK_SECRET;

  // Verifikasi request benar-benar dari Telegram (jika secret diset saat setWebhook)
  if (SECRET) {
    const incomingSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (incomingSecret !== SECRET) {
      return res.status(401).json({ error: "Invalid secret token" });
    }
  }

  const update = req.body;
  const callback = update?.callback_query;

  // Update selain tombol yang diklik (misal chat biasa) — abaikan saja, cukup balas 200.
  if (!callback) {
    return res.status(200).send("ok");
  }

  const data      = callback.data; // "mark_paid" | "mark_unpaid"
  const chatId    = callback.message.chat.id;
  const messageId = callback.message.message_id;
  const oldText   = callback.message.text || "";
  const clickedBy = callback.from.first_name + (callback.from.last_name ? ` ${callback.from.last_name}` : "");
  const now       = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" });

  const isPaid = data === "mark_paid";

  const statusLine = isPaid
    ? `💳 Status Pembayaran: ✅ Sudah Dibayar (oleh ${clickedBy}, ${now} WIB)`
    : `💳 Status Pembayaran: ⏳ Belum Dibayar (diubah oleh ${clickedBy}, ${now} WIB)`;

  // Ganti baris status lama (apa pun isinya) dengan baris status baru.
  const newText = /💳 Status Pembayaran:.*/.test(oldText)
    ? oldText.replace(/💳 Status Pembayaran:.*/, statusLine)
    : `${oldText}\n\n${statusLine}`;

  const newReplyMarkup = {
    inline_keyboard: [
      [
        { text: isPaid ? "⬜ Belum Dibayar" : "✅ Sudah Dibayar", callback_data: isPaid ? "mark_unpaid" : "mark_paid" },
        { text: isPaid ? "✅ Sudah Dibayar (aktif)" : "⬜ Belum Dibayar (aktif)", callback_data: isPaid ? "mark_paid" : "mark_unpaid" },
      ],
    ],
  };

  try {
    // 1) Update teks pesan supaya semua anggota grup langsung lihat status terbaru
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: newText,
        reply_markup: newReplyMarkup,
      }),
    });

    // 2) Kasih notifikasi kecil (toast) ke orang yang klik, biar tahu aksinya berhasil
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callback.id,
        text: isPaid ? "✅ Ditandai Sudah Dibayar" : "⏳ Ditandai Belum Dibayar",
      }),
    });

    return res.status(200).send("ok");
  } catch (err) {
    // Tetap balas 200 ke Telegram supaya tidak retry terus-menerus, tapi log error-nya
    console.error("telegram-webhook error:", err);
    return res.status(200).send("ok");
  }
}
