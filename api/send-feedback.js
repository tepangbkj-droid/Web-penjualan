// ============================================================
// /api/send-feedback — KRITIK & SARAN pelanggan → grup Telegram
// Mengirim: 1 pesan ringkasan lengkap + semua lampiran (foto struk,
// foto/video produk/layanan) sebagai balasan pada pesan tsb.
//
// ENV: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Opsional: TURNSTILE_SECRET_KEY, ALLOWED_ORIGINS
// Batas Vercel: body request maks ±4,5 MB → lampiran dibatasi 3,2 MB total.
// ============================================================
import {
  guard, looksLikeBot, verifyTurnstile, clean, escapeHtml, countLinks,
  normalizePhone, getIp, tgCall,
} from "./_lib/security.js";

const MAX_TOTAL_BYTES = 3.2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 3.2 * 1024 * 1024;
const KINDS = ["Produk", "Layanan Servis"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

// Deteksi tipe file dari isi (magic bytes), BUKAN dari label yang dikirim browser.
function sniff(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length > 12 && buf.slice(4, 8).toString("ascii") === "ftyp") return "mp4";
  if (buf.length > 12 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  return null;
}

function fmtWhen(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s || "");
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  if (asUtc > Date.now() + 36 * 3600 * 1000) return null;          // tidak boleh di masa depan
  if (asUtc < Date.now() - 400 * 24 * 3600 * 1000) return null;    // maks ±13 bulan lalu
  const dow = DAYS[new Date(asUtc).getUTCDay()];
  const pad = (n) => String(n).padStart(2, "0");
  return `${dow}, ${d} ${MONTHS[mo - 1]} ${y} · ${pad(h)}:${pad(mi)} WIB`;
}

export default async function handler(req, res) {
  if (!guard(req, res, { bucket: "feedback", max: 3, windowMs: 10 * 60 * 1000 })) return;

  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    return res.status(500).json({ error: "Server belum dikonfigurasi." });
  }
  const len = Number(req.headers["content-length"] || 0);
  if (len > 4.4 * 1024 * 1024) return res.status(413).json({ error: "Lampiran terlalu besar." });

  const b = req.body && typeof req.body === "object" ? req.body : {};

  if (looksLikeBot(b, 3000)) return res.status(400).json({ error: "Permintaan ditolak." });
  if (!(await verifyTurnstile(b.cfToken, getIp(req)))) {
    return res.status(403).json({ error: "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi." });
  }

  const type = b.type === "kritik" || b.type === "saran" ? b.type : null;
  const name = clean(b.name, 60);
  const description = clean(b.description, 1000, { multiline: true });
  if (!type || !name || description.length < 10) {
    return res.status(400).json({ error: "Data belum lengkap." });
  }
  if (countLinks(description) > 2 || countLinks(name) > 0) {
    return res.status(400).json({ error: "Terlalu banyak tautan pada pesan." });
  }

  // ─── Field khusus kritik ───
  let phone = null, kind = null, when = null;
  if (type === "kritik") {
    phone = normalizePhone(b.phone);
    kind = KINDS.includes(b.kind) ? b.kind : null;
    when = fmtWhen(b.when);
    if (!phone || !kind || !when) {
      return res.status(400).json({ error: "Nomor, jenis kritik, atau waktu kejadian tidak valid." });
    }
  }

  // ─── Lampiran (hanya untuk kritik) ───
  const files = [];
  if (type === "kritik") {
    const list = Array.isArray(b.files) ? b.files : [];
    if (list.length > 4) return res.status(400).json({ error: "Maksimal 4 lampiran." });
    let total = 0, struk = 0, bukti = 0;
    for (const f of list) {
      const role = f?.role === "struk" ? "struk" : f?.role === "bukti" ? "bukti" : null;
      if (!role || typeof f.data !== "string" || f.data.length > 4.4 * 1024 * 1024) {
        return res.status(400).json({ error: "Lampiran tidak valid." });
      }
      role === "struk" ? struk++ : bukti++;
      const buf = Buffer.from(f.data, "base64");
      const kindOfFile = sniff(buf);
      if (!kindOfFile) return res.status(400).json({ error: "Format lampiran tidak didukung." });
      const isVideo = kindOfFile !== "jpeg";
      if (role === "struk" && isVideo) return res.status(400).json({ error: "Struk harus berupa foto." });
      if (buf.length > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
        return res.status(413).json({ error: "Salah satu lampiran terlalu besar." });
      }
      total += buf.length;
      files.push({ role, buf, kind: kindOfFile });
    }
    if (struk > 1 || bukti > 3) return res.status(400).json({ error: "Jumlah lampiran melebihi batas." });
    if (total > MAX_TOTAL_BYTES) return res.status(413).json({ error: "Total lampiran melebihi 3,2 MB." });
  }

  // ─── Susun pesan Telegram (HTML, semua input di-escape) ───
  const nowWib = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short",
  });
  const n = escapeHtml(name);
  const desc = escapeHtml(description);
  const lampiran = files.length
    ? [
        files.some((f) => f.role === "struk") ? "🧾 Struk" : null,
        files.filter((f) => f.role === "bukti").length
          ? `📷 Foto/Video ×${files.filter((f) => f.role === "bukti").length}` : null,
      ].filter(Boolean).join(" · ")
    : "— tidak ada";

  const text = type === "kritik"
    ? `🔴 <b>KRITIK BARU</b>  #kritik #${kind === "Produk" ? "produk" : "layanan"}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>Nama:</b> ${n}\n` +
      `📱 <b>Kontak:</b> <code>${phone}</code>\n` +
      `🏷 <b>Jenis:</b> ${kind}\n` +
      `🕒 <b>Waktu kejadian:</b> ${when}\n` +
      `📎 <b>Lampiran:</b> ${lampiran}\n\n` +
      `📝 <b>Penjelasan:</b>\n${desc}\n\n` +
      `<i>Dikirim ${escapeHtml(nowWib)} WIB</i>`
    : `💡 <b>SARAN BARU</b>  #saran\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>Nama:</b> ${n}\n\n` +
      `📝 <b>Saran:</b>\n${desc}\n\n` +
      `<i>Dikirim ${escapeHtml(nowWib)} WIB</i>`;

  const chat_id = process.env.TELEGRAM_CHAT_ID;

  try {
    const main = await tgCall("sendMessage", {
      chat_id,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(phone && {
        reply_markup: { inline_keyboard: [[{ text: "💬 Chat Pelanggan via WhatsApp", url: `https://wa.me/${phone}` }]] },
      }),
    });
    if (!main.ok) return res.status(502).json({ error: "Telegram menolak pesan." });

    // Lampiran dikirim berurutan sebagai balasan pesan utama.
    const replyTo = main.result.message_id;
    let failed = 0;
    for (const f of files) {
      const isVideo = f.kind !== "jpeg";
      const label = f.role === "struk" ? "🧾 Bukti struk" : isVideo ? "🎬 Video produk/layanan" : "📷 Foto produk/layanan";
      const caption = `${label} — ${name}`.slice(0, 200);

      const send = async (method, field, filename, mime) => {
        const fd = new FormData();
        fd.append("chat_id", String(chat_id));
        fd.append("caption", caption);
        fd.append("reply_parameters", JSON.stringify({ message_id: replyTo, allow_sending_without_reply: true }));
        if (method === "sendVideo") fd.append("supports_streaming", "true");
        fd.append(field, new Blob([f.buf], { type: mime }), filename);
        return tgCall(method, fd);
      };

      let r;
      if (!isVideo) r = await send("sendPhoto", "photo", "foto.jpg", "image/jpeg");
      else {
        r = await send("sendVideo", "video", f.kind === "webm" ? "video.webm" : "video.mp4", f.kind === "webm" ? "video/webm" : "video/mp4");
        if (!r.ok) r = await send("sendDocument", "document", "video.mp4", "video/mp4"); // cadangan
      }
      if (!r.ok) failed++;
    }

    return res.status(200).json({ ok: true, failedAttachments: failed });
  } catch {
    return res.status(502).json({ error: "Gagal menghubungi Telegram." });
  }
}
