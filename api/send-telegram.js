// ============================================================
// /api/send-telegram — Vercel Serverless Function
// Mengirim notifikasi pesanan baru ke grup Telegram, lengkap
// dengan tombol interaktif "Sudah Dibayar" / "Belum Dibayar"
// yang bisa diklik oleh siapa pun anggota grup.
// ============================================================
// ENV VARS yang wajib diisi di Vercel (Project Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN   → token dari @BotFather
//   TELEGRAM_CHAT_ID     → id grup/channel tujuan notifikasi
// ============================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diset di environment." });
  }

  const { text } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Field 'text' wajib diisi." });
  }

  // Tambahkan baris status pembayaran di akhir pesan (plain text, tanpa markdown,
  // supaya nanti mudah & aman di-replace ulang saat tombol diklik di webhook).
  const fullText = `${text}\n\n💳 Status Pembayaran: ⏳ Belum Dibayar`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "⬜ Belum Dibayar", callback_data: "mark_unpaid" },
        { text: "✅ Tandai Sudah Dibayar", callback_data: "mark_paid" },
      ],
    ],
  };

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: fullText,
        reply_markup: replyMarkup,
      }),
    });

    const data = await tgRes.json();
    if (!data.ok) {
      return res.status(502).json({ error: "Telegram API error", detail: data });
    }

    return res.status(200).json({ ok: true, message_id: data.result.message_id });
  } catch (err) {
    return res.status(500).json({ error: "Gagal mengirim ke Telegram", detail: String(err) });
  }
}
