// ============================================================
// /api/telegram-webhook — menerima klik tombol "Sudah/Belum Dibayar"
// dari grup Telegram lalu meng-update pesan pesanan tsb.
//
// PERUBAHAN KEAMANAN:
//  • TELEGRAM_WEBHOOK_SECRET sekarang WAJIB (sebelumnya opsional).
//  • Hanya menerima klik dari grup TELEGRAM_CHAT_ID milik Anda.
//  • Hanya memproses pesan "PESANAN BARU MASUK".
//
// ENV: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET
// ============================================================
import { tgCall } from "./_lib/security.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");

  const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!SECRET) return res.status(500).json({ error: "TELEGRAM_WEBHOOK_SECRET belum diset." });
  if (req.headers["x-telegram-bot-api-secret-token"] !== SECRET) {
    return res.status(401).json({ error: "Invalid secret token" });
  }

  const callback = req.body?.callback_query;
  if (!callback || !callback.message) return res.status(200).send("ok");

  const chatId = callback.message.chat.id;
  if (String(chatId) !== String(process.env.TELEGRAM_CHAT_ID)) return res.status(200).send("ok");

  const oldText = callback.message.text || "";
  if (!oldText.includes("PESANAN BARU MASUK")) {
    await tgCall("answerCallbackQuery", { callback_query_id: callback.id });
    return res.status(200).send("ok");
  }
  if (callback.data !== "mark_paid" && callback.data !== "mark_unpaid") {
    return res.status(200).send("ok");
  }

  const isPaid = callback.data === "mark_paid";
  const clickedBy = [callback.from.first_name, callback.from.last_name].filter(Boolean).join(" ");
  const now = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" });

  const statusLine = isPaid
    ? `💳 Status Pembayaran: ✅ Sudah Dibayar (oleh ${clickedBy}, ${now} WIB)`
    : `💳 Status Pembayaran: ⏳ Belum Dibayar (diubah oleh ${clickedBy}, ${now} WIB)`;

  const newText = /💳 Status Pembayaran:.*/.test(oldText)
    ? oldText.replace(/💳 Status Pembayaran:.*/, statusLine)
    : `${oldText}\n\n${statusLine}`;

  try {
    await tgCall("editMessageText", {
      chat_id: chatId,
      message_id: callback.message.message_id,
      text: newText,
      reply_markup: {
        inline_keyboard: [[
          { text: isPaid ? "⬜ Belum Dibayar" : "✅ Sudah Dibayar", callback_data: isPaid ? "mark_unpaid" : "mark_paid" },
          { text: isPaid ? "✅ Sudah Dibayar (aktif)" : "⬜ Belum Dibayar (aktif)", callback_data: isPaid ? "mark_paid" : "mark_unpaid" },
        ]],
      },
    });
    await tgCall("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: isPaid ? "✅ Ditandai Sudah Dibayar" : "⏳ Ditandai Belum Dibayar",
    });
  } catch (err) {
    console.error("telegram-webhook error:", err);
  }
  return res.status(200).send("ok");
}
