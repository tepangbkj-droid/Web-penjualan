// ============================================================
// Kritik & Saran — dimuat lazy (hanya diunduh saat user scroll ke bawah)
// Alur: pilih Kritik/Saran → form → kirim ke Telegram (via /api/send-feedback)
//        + otomatis dialihkan ke WhatsApp toko.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { WA_STORE_NUMBER } from "./config.js";
import Turnstile, { turnstileEnabled } from "./Turnstile.jsx";

// Ubah ke false bila foto struk tidak ingin diwajibkan.
const REQUIRE_STRUK = true;

const MAX_VIDEO_BYTES = 3 * 1024 * 1024;   // batas Vercel: body ±4,5 MB
const MAX_TOTAL_BYTES = 3.2 * 1024 * 1024; // total semua lampiran
const MAX_BUKTI = 3;

const fmtSize = (n) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + " MB" : Math.round(n / 1024) + " KB");

// ─── Kompres foto di browser (foto galeri 5–10 MB → ±300 KB) ─
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}
const canvasToBlob = (canvas, q) => new Promise((res) => canvas.toBlob(res, "image/jpeg", q));

async function compressImage(file) {
  const img = await loadImage(file);
  let side = 1600;
  let blob = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    blob = await canvasToBlob(canvas, 0.8 - attempt * 0.08);
    if (blob && blob.size <= 700 * 1024) break;
    side = Math.round(side * 0.75);
  }
  if (!blob) throw new Error("encode");
  return blob;
}

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

const nowLocalInput = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

const prettyWhen = (v) => (v ? v.replace("T", " pukul ") : "");

// ─── Komponen kecil ──────────────────────────────────────────
function Field({ label, hint, error, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#3B1464] mb-1">
        {label} {hint && <span className="font-normal text-gray-400">{hint}</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

const inputCls = (err) =>
  `w-full border rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-purple-300 ${err ? "border-red-400" : "border-purple-200"}`;

function Thumb({ item, onRemove }) {
  return (
    <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-purple-50 border border-purple-100 flex items-center justify-center">
      {item.preview ? (
        <img src={item.preview} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="text-center px-1">
          <div className="text-xl">🎬</div>
          <p className="text-[10px] text-purple-600 leading-tight">{fmtSize(item.size)}</p>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Hapus lampiran"
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center"
      >
        ✕
      </button>
    </div>
  );
}

function UploadBox({ icon, title, sub, accept, multiple, disabled, onPick }) {
  return (
    <label className={`flex items-center gap-3 border-2 border-dashed rounded-2xl px-4 py-3 cursor-pointer transition ${disabled ? "opacity-50 cursor-not-allowed border-gray-200" : "border-purple-200 hover:border-purple-400 hover:bg-purple-50/60"}`}>
      <span className="text-2xl">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-[#3B1464]">{title}</span>
        <span className="block text-xs text-gray-400">{sub}</span>
      </span>
      <span className="text-xs font-semibold text-[#3B1464] bg-[#F6C445]/40 px-3 py-1.5 rounded-full">Pilih</span>
      <input
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => { onPick(Array.from(e.target.files || [])); e.target.value = ""; }}
      />
    </label>
  );
}

// ─── FORM (dipakai untuk Kritik & Saran) ─────────────────────
function FeedbackForm({ type, onBack }) {
  const isKritik = type === "kritik";
  const [form, setForm] = useState({ name: "", phone: "", kind: "", when: "", description: "" });
  const [struk, setStruk] = useState(null);
  const [bukti, setBukti] = useState([]);
  const [errors, setErrors] = useState({});
  const [hp, setHp] = useState("");
  const [cfToken, setCfToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { ok, failed, message, waUrl }
  const startedAt = useRef(Date.now());
  const urls = useRef(new Set());

  // bersihkan URL preview saat komponen ditutup
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const set = (field) => (e) => {
    setForm((p) => ({ ...p, [field]: e.target.value }));
    setErrors((p) => ({ ...p, [field]: "" }));
  };
  const setErr = (field, msg) => setErrors((p) => ({ ...p, [field]: msg }));

  const totalBytes = (s, b) => (s?.blob.size || 0) + b.reduce((a, x) => a + x.blob.size, 0);

  const makeImageItem = async (file) => {
    const blob = await compressImage(file);
    const preview = URL.createObjectURL(blob);
    urls.current.add(preview);
    return { id: crypto.randomUUID?.() || String(Math.random()), kind: "image", blob, size: blob.size, preview };
  };

  const dropPreview = (item) => {
    if (item?.preview) { URL.revokeObjectURL(item.preview); urls.current.delete(item.preview); }
  };

  const pickStruk = async (files) => {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return setErr("struk", "Struk harus berupa foto.");
    setProcessing(true);
    try {
      const item = await makeImageItem(f);
      if (totalBytes(null, bukti) + item.size > MAX_TOTAL_BYTES) {
        dropPreview(item);
        return setErr("struk", "Total lampiran terlalu besar. Hapus sebagian lampiran dulu.");
      }
      dropPreview(struk);
      setStruk(item);
      setErr("struk", "");
    } catch {
      setErr("struk", "Foto tidak bisa dibaca. Coba pilih foto lain (JPG/PNG).");
    } finally {
      setProcessing(false);
    }
  };

  const pickBukti = async (files) => {
    if (!files.length) return;
    setProcessing(true);
    setErr("bukti", "");
    let list = [...bukti];
    let msg = "";
    try {
      for (const f of files) {
        if (list.length >= MAX_BUKTI) { msg = `Maksimal ${MAX_BUKTI} lampiran.`; break; }
        let item;
        if (f.type.startsWith("video/")) {
          if (list.some((x) => x.kind === "video")) { msg = "Hanya boleh 1 video."; continue; }
          if (f.size > MAX_VIDEO_BYTES) {
            msg = `Video terlalu besar (${fmtSize(f.size)}). Maks ${fmtSize(MAX_VIDEO_BYTES)} — video lebih panjang bisa kamu kirim langsung di chat WhatsApp.`;
            continue;
          }
          item = { id: crypto.randomUUID?.() || String(Math.random()), kind: "video", blob: f, size: f.size, preview: null };
        } else if (f.type.startsWith("image/")) {
          try { item = await makeImageItem(f); } catch { msg = "Ada foto yang tidak bisa dibaca."; continue; }
        } else {
          msg = "Hanya foto atau video yang diperbolehkan.";
          continue;
        }
        if (totalBytes(struk, list) + item.size > MAX_TOTAL_BYTES) {
          dropPreview(item);
          msg = "Total lampiran melebihi 3,2 MB. Kirim sisanya lewat WhatsApp ya.";
          continue;
        }
        list = [...list, item];
      }
      setBukti(list);
      if (msg) setErr("bukti", msg);
    } finally {
      setProcessing(false);
    }
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Nama wajib diisi.";
    if (isKritik) {
      if (!/^\d{8,15}$/.test(form.phone.replace(/[\s()+\-.]/g, ""))) e.phone = "Nomor tidak valid (8–15 digit angka).";
      if (!form.kind) e.kind = "Pilih jenis kritik.";
      if (!form.when) e.when = "Tanggal & waktu kejadian wajib diisi.";
      else if (new Date(form.when).getTime() > Date.now() + 60000) e.when = "Waktu kejadian tidak boleh di masa depan.";
      if (REQUIRE_STRUK && !struk) e.struk = "Foto bukti struk wajib dilampirkan.";
    }
    if (form.description.trim().length < 10) e.description = "Jelaskan minimal 10 karakter.";
    if (turnstileEnabled && !cfToken) e.captcha = "Selesaikan verifikasi keamanan di atas.";
    return e;
  };

  const buildWaUrl = () => {
    const lampiran = isKritik && (struk || bukti.length)
      ? `📎 Lampiran: ${[struk && "foto struk", bukti.length && `${bukti.length} foto/video`].filter(Boolean).join(" + ")} (sudah terkirim ke sistem Tarobun, bisa saya kirim ulang di chat ini)\n`
      : "";
    const msg = isKritik
      ? `Halo Tarobun! 👋 Saya ingin menyampaikan *KRITIK*:\n\n` +
        `👤 Nama: ${form.name.trim()}\n` +
        `📱 Kontak: ${form.phone.trim()}\n` +
        `🏷 Jenis: ${form.kind}\n` +
        `🕒 Waktu kejadian: ${prettyWhen(form.when)}\n` +
        lampiran +
        `\n📝 Penjelasan:\n${form.description.trim()}\n\nTerima kasih 🙏`
      : `Halo Tarobun! 👋 Saya ingin memberi *SARAN*:\n\n` +
        `👤 Nama: ${form.name.trim()}\n\n` +
        `💡 Saran:\n${form.description.trim()}\n\nTerima kasih 🙏`;
    return `https://wa.me/${WA_STORE_NUMBER}?text=${encodeURIComponent(msg)}`;
  };

  const friendly = (status, fallback) => {
    if (status === 429) return "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.";
    if (status === 413) return "Lampiran terlalu besar. Kurangi ukuran/jumlah lampiran.";
    if (status === 403) return fallback || "Verifikasi keamanan gagal. Coba lagi.";
    return fallback || "Gagal mengirim ke sistem kami.";
  };

  const submit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true);
    const waUrl = buildWaUrl();
    try {
      const files = [];
      if (isKritik) {
        if (struk) files.push({ role: "struk", data: await blobToBase64(struk.blob) });
        for (const f of bukti) files.push({ role: "bukti", data: await blobToBase64(f.blob) });
      }
      const res = await fetch("/api/send-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: form.name,
          phone: form.phone,
          kind: form.kind,
          when: form.when,
          description: form.description,
          files,
          hp,
          elapsed: Date.now() - startedAt.current,
          cfToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const err = new Error(data.error || "");
        err.status = res.status;
        throw err;
      }
      setResult({ ok: true, failed: data.failedAttachments || 0, waUrl });
      window.open(waUrl, "_blank", "noopener");
    } catch (err) {
      setResult({ ok: false, message: friendly(err.status, err.message), waUrl });
      setCfToken("");
      setResetKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  // ─── Layar hasil ───
  if (result?.ok) {
    return (
      <div className="text-center py-8 fade-up">
        <div className="text-5xl mb-3">🎉</div>
        <h3 className="text-lg font-bold text-[#3B1464] mb-2">Terima kasih, {form.name.trim().split(" ")[0]}!</h3>
        <p className="text-sm text-gray-500 mb-1">
          {isKritik ? "Kritikmu" : "Saranmu"} sudah masuk ke tim Tarobun.
        </p>
        <p className="text-xs text-gray-400 mb-4">Kami sedang mengalihkanmu ke WhatsApp. Belum terbuka? Ketuk tombol di bawah.</p>
        {result.failed > 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-2 mb-4">
            Sebagian lampiran gagal terkirim — mohon kirim ulang lewat chat WhatsApp.
          </p>
        )}
        <a href={result.waUrl} target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-3 bg-[#25D366] text-white rounded-2xl text-sm font-bold shadow hover:brightness-95 transition">
          💬 Buka WhatsApp
        </a>
        <div className="mt-4">
          <button onClick={onBack} className="text-xs text-[#3B1464] underline underline-offset-2">Kembali</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-up">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-purple-500 hover:text-[#3B1464] mb-3">← Kembali</button>
      <h3 className="text-lg font-bold text-[#3B1464] mb-1">{isKritik ? "😕 Sampaikan Kritik" : "💡 Sampaikan Saran"}</h3>
      <p className="text-xs text-gray-400 mb-5">
        {isKritik ? "Maaf atas ketidaknyamanannya. Ceritakan sedetail mungkin supaya bisa kami tindak lanjuti." : "Ide darimu sangat berarti untuk Tarobun."}
      </p>

      <div className="space-y-4">
        <Field label="Nama" error={errors.name}>
          <input type="text" maxLength={60} value={form.name} onChange={set("name")} placeholder="Nama kamu..." className={inputCls(errors.name)} autoComplete="name" />
        </Field>

        {isKritik && (
          <>
            <Field label="Nomor yang bisa dihubungi" error={errors.phone}>
              <input type="tel" inputMode="tel" maxLength={20} value={form.phone} onChange={set("phone")} placeholder="08xxxxxxxxxx" className={inputCls(errors.phone)} autoComplete="tel" />
            </Field>

            <Field label="Jenis Kritik" error={errors.kind}>
              <div className="grid grid-cols-2 gap-2">
                {["Produk", "Layanan Servis"].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => { setForm((p) => ({ ...p, kind: k })); setErr("kind", ""); }}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition ${form.kind === k ? "bg-[#3B1464] text-white border-[#3B1464]" : "bg-white text-[#3B1464] border-purple-200 hover:bg-purple-50"}`}
                  >
                    {k === "Produk" ? "🍞 " : "🛎 "}{k}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Tanggal & waktu kejadian" error={errors.when}>
              <input type="datetime-local" max={nowLocalInput()} value={form.when} onChange={set("when")} className={inputCls(errors.when)} />
            </Field>

            <Field label="Foto bukti struk" hint={REQUIRE_STRUK ? "(wajib)" : "(opsional)"} error={errors.struk}>
              {struk ? (
                <Thumb item={struk} onRemove={() => { dropPreview(struk); setStruk(null); }} />
              ) : (
                <UploadBox icon="🧾" title="Ambil dari galeri" sub="Foto struk pembelian" accept="image/*" disabled={processing} onPick={pickStruk} />
              )}
            </Field>

            <Field label="Foto / video produk atau layanan" hint={`(opsional, maks ${MAX_BUKTI})`} error={errors.bukti}>
              <div className="flex flex-wrap gap-2 mb-2">
                {bukti.map((b) => (
                  <Thumb key={b.id} item={b} onRemove={() => { dropPreview(b); setBukti((p) => p.filter((x) => x.id !== b.id)); }} />
                ))}
              </div>
              {bukti.length < MAX_BUKTI && (
                <UploadBox icon="📷" title="Ambil dari galeri" sub={`Foto atau 1 video (maks ${fmtSize(MAX_VIDEO_BYTES)})`} accept="image/*,video/*" multiple disabled={processing} onPick={pickBukti} />
              )}
            </Field>
            {processing && <p className="text-xs text-purple-500">⏳ Memproses lampiran...</p>}
          </>
        )}

        <Field label={isKritik ? "Penjelasan kritik" : "Saran kamu"} error={errors.description}>
          <textarea
            rows={5}
            maxLength={1000}
            value={form.description}
            onChange={set("description")}
            placeholder={isKritik ? "Ceritakan apa yang terjadi..." : "Apa yang bisa kami tingkatkan atau tambahkan?"}
            className={inputCls(errors.description) + " resize-none"}
          />
          <p className="text-[11px] text-gray-400 text-right mt-0.5">{form.description.length}/1000</p>
        </Field>

        {/* Honeypot: disembunyikan dari manusia, bot biasanya mengisinya */}
        <input
          type="text"
          name="company_url"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
        />

        <div>
          <Turnstile key={resetKey} onToken={(t) => { setCfToken(t); if (t) setErr("captcha", ""); }} />
          {errors.captcha && <p className="text-xs text-red-500 mt-1">{errors.captcha}</p>}
        </div>

        {result && !result.ok && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            ⚠ {result.message}{" "}
            <a href={result.waUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline">Kirim lewat WhatsApp saja</a>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={loading || processing}
          className="w-full py-3 bg-[#3B1464] text-white rounded-2xl font-bold text-sm hover:bg-[#4d1c85] active:scale-[0.98] disabled:opacity-50 transition shadow-md shadow-purple-200"
        >
          {loading ? "Mengirim..." : "📲 Kirim & Buka WhatsApp"}
        </button>
        <p className="text-[11px] text-gray-400 text-center">
          Data dikirim ke tim Tarobun dan kamu akan dialihkan ke WhatsApp toko.
        </p>
      </div>
    </div>
  );
}

// ─── KOMPONEN UTAMA ──────────────────────────────────────────
// Baca hash link (#kritik-saran, #kritik, #saran) untuk buka bagian yang tepat otomatis.
function viewFromHash() {
  const h = window.location.hash.replace("#", "");
  if (h === "kritik" || h === "saran") return h;
  return "choose";
}

export default function Feedback() {
  const [view, setView] = useState(viewFromHash);
  const box = useRef(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      // Baru dibuka lewat link langsung → langsung gulir ke bagian ini juga.
      if (window.location.hash) box.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    box.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [view]);

  return (
    <section id="kritik-saran" ref={box} className="max-w-3xl mx-auto px-4 pb-16 scroll-mt-24">
      <div className="bg-white border border-purple-100 rounded-3xl shadow-sm p-5 md:p-8">
        {view === "choose" ? (
          <div className="fade-up">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-[#3B1464]">💬 Kritik & Saran</h2>
              <p className="text-sm text-gray-500 mt-1">Suaramu membantu Tarobun jadi lebih baik setiap hari.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <button onClick={() => setView("kritik")} className="text-left p-5 rounded-2xl border-2 border-purple-100 hover:border-[#3B1464] hover:bg-purple-50/50 transition group">
                <div className="text-3xl mb-2">😕</div>
                <p className="font-bold text-[#3B1464]">Kritik</p>
                <p className="text-xs text-gray-500 mt-1">Ada yang kurang dari produk atau layanan kami? Ceritakan ya.</p>
              </button>
              <button onClick={() => setView("saran")} className="text-left p-5 rounded-2xl border-2 border-purple-100 hover:border-[#3B1464] hover:bg-purple-50/50 transition group">
                <div className="text-3xl mb-2">💡</div>
                <p className="font-bold text-[#3B1464]">Saran</p>
                <p className="text-xs text-gray-500 mt-1">Punya ide supaya Tarobun makin enak? Kami dengarkan.</p>
              </button>
            </div>
          </div>
        ) : (
          <FeedbackForm key={view} type={view} onBack={() => setView("choose")} />
        )}
      </div>
    </section>
  );
}
