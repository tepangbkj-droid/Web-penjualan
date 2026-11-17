// Halaman internal crew: Customer Experience Review → Telegram (via /api/send-review).
import { useEffect, useRef, useState } from "react";
import { PRODUCTS } from "./products.js";
import { REVIEW_CODE_REQUIRED } from "./config.js";
import Turnstile, { turnstileEnabled } from "./Turnstile.jsx";
import { getFormToken } from "./formToken.js";

const MAX_PHOTOS = 3;
const MAX_TOTAL = 3.2 * 1024 * 1024;
const GROUPS = [["🍞 Tarobun Satuan", PRODUCTS.buns], ["📦 Family Pack", PRODUCTS.packs], ["🧋 Taro Latte", PRODUCTS.drinks]];
const inputCls = (e) => `w-full border rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-purple-300 ${e ? "border-red-400" : "border-purple-200"}`;

// Kompres + simpan ulang sebagai JPEG (otomatis membuang data lokasi/EXIF dari foto).
async function compress(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    let side = 1400, blob = null;
    for (let a = 0; a < 4; a++) {
      const s = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.8 - a * 0.08));
      if (blob && blob.size <= 800 * 1024) break;
      side = Math.round(side * 0.75);
    }
    if (!blob) throw new Error("encode");
    return blob;
  } finally { URL.revokeObjectURL(url); }
}
const b64 = (blob) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = no; r.readAsDataURL(blob); });

function Field({ label, hint, error, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#3B1464] mb-1">{label} {hint && <span className="font-normal text-gray-400">{hint}</span>}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export default function Review() {
  const [f, setF] = useState({ crew: "", customer: "", fp: "", fs: "", code: "" });
  const [order, setOrder] = useState({});
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [hp, setHp] = useState("");
  const [cfToken, setCfToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const startedAt = useRef(Date.now());
  const tokenRef = useRef("");
  const urls = useRef(new Set());

  useEffect(() => {
    document.title = "Customer Experience Review — Tarobun";
    const m = document.createElement("meta"); m.name = "robots"; m.content = "noindex,nofollow"; document.head.appendChild(m);
    getFormToken().then((t) => { tokenRef.current = t; });
    return () => { m.remove(); urls.current.forEach((u) => URL.revokeObjectURL(u)); };
  }, []);

  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setErrors((p) => ({ ...p, [k]: "" })); };
  const err = (k, v) => setErrors((p) => ({ ...p, [k]: v }));

  const toggle = (name) => { setOrder((p) => { const n = { ...p }; if (n[name]) delete n[name]; else n[name] = { qty: 1, note: "" }; return n; }); err("order", ""); };
  const patch = (name, d) => setOrder((p) => ({ ...p, [name]: { ...p[name], ...d } }));

  const pick = (role) => async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return err("photo", "File harus berupa foto.");
    if (photos.length >= MAX_PHOTOS) return err("photo", `Maksimal ${MAX_PHOTOS} foto.`);
    setBusy(true);
    try {
      const blob = await compress(file);
      if (photos.reduce((a, x) => a + x.blob.size, 0) + blob.size > MAX_TOTAL) return err("photo", "Total foto terlalu besar. Hapus satu foto dulu.");
      const preview = URL.createObjectURL(blob); urls.current.add(preview);
      setPhotos((p) => [...p, { id: Math.random().toString(36).slice(2), role, blob, preview }]);
      err("photo", "");
    } catch { err("photo", "Foto tidak bisa dibaca. Coba ambil ulang."); }
    finally { setBusy(false); }
  };
  const dropPhoto = (p) => { URL.revokeObjectURL(p.preview); urls.current.delete(p.preview); setPhotos((x) => x.filter((i) => i.id !== p.id)); };

  const submit = async () => {
    if (sending) return;
    const e = {};
    if (!f.crew.trim()) e.crew = "Nama crew wajib diisi.";
    if (!f.customer.trim()) e.customer = "Nama customer wajib diisi.";
    if (!Object.keys(order).length) e.order = "Pilih minimal 1 produk pesanan.";
    if (f.fp.trim().length < 3) e.fp = "Feedback produk wajib diisi.";
    if (f.fs.trim().length < 3) e.fs = "Feedback services wajib diisi.";
    if (!photos.length) e.photo = "Foto wajib diambil (produk atau selfie bareng produk).";
    if (REVIEW_CODE_REQUIRED && !f.code.trim()) e.code = "Kode crew wajib diisi.";
    if (turnstileEnabled && !cfToken) e.captcha = "Selesaikan verifikasi keamanan dulu.";
    if (Object.keys(e).length) { setErrors(e); return; }
    setSending(true);
    try {
      const files = [];
      for (const p of photos) files.push({ role: p.role, data: await b64(p.blob) });
      const res = await fetch("/api/send-review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crew: f.crew, customer: f.customer, feedbackProduk: f.fp, feedbackService: f.fs, code: f.code,
          items: Object.entries(order).map(([name, v]) => ({ name, qty: v.qty, note: v.note })),
          files, hp, formToken: tokenRef.current, cfToken, elapsed: Date.now() - startedAt.current,
        }),
      });
      tokenRef.current = "";
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) throw new Error(res.status === 429 ? "Terlalu banyak percobaan. Tunggu beberapa menit." : d.error || "Gagal mengirim.");
      setResult({ ok: true, failed: d.failed || 0 });
    } catch (x) {
      setResult({ ok: false, message: x.message || "Gagal mengirim." });
      setCfToken(""); setResetKey((k) => k + 1); getFormToken().then((t) => { tokenRef.current = t; });
    } finally { setSending(false); }
  };

  const reset = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    setPhotos([]); setOrder({}); setF((p) => ({ ...p, customer: "", fp: "", fs: "" })); setResult(null);
    setCfToken(""); setResetKey((k) => k + 1); startedAt.current = Date.now();
    getFormToken().then((t) => { tokenRef.current = t; });
  };

  const cam = (role, icon, title, sub, capture) => (
    <label className={`flex-1 flex flex-col items-center text-center gap-1 border-2 border-dashed rounded-2xl px-3 py-4 transition ${busy || photos.length >= MAX_PHOTOS ? "opacity-50 border-gray-200" : "border-purple-200 hover:border-[#3B1464] hover:bg-purple-50/60 cursor-pointer"}`}>
      <span className="text-3xl">{icon}</span>
      <span className="text-sm font-bold text-[#3B1464]">{title}</span>
      <span className="text-[11px] text-gray-400 leading-tight">{sub}</span>
      <input type="file" accept="image/*" capture={capture} className="sr-only" disabled={busy || photos.length >= MAX_PHOTOS} onChange={pick(role)} />
    </label>
  );

  return (
    <div className="min-h-screen bg-[#FBF7EF] font-sans">
      <header className="bg-[#3B1464] text-white">
        <div className="max-w-xl mx-auto px-4 py-6 flex items-center gap-3">
          <img src="/logo.webp" alt="Tarobun" width={48} height={48} className="w-12 h-12 object-contain" />
          <div>
            <p className="text-[11px] text-purple-300 uppercase tracking-wider font-semibold">Khusus Crew</p>
            <h1 className="text-xl font-black leading-tight">Customer Experience Review</h1>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6">
        <div className="bg-white border border-purple-100 rounded-3xl shadow-sm p-5 md:p-7">
          {result?.ok ? (
            <div className="text-center py-8 fade-up">
              <div className="text-5xl mb-3">🎉</div>
              <h2 className="text-lg font-bold text-[#3B1464] mb-1">Review terkirim ke Telegram!</h2>
              <p className="text-sm text-gray-500 mb-4">Terima kasih sudah mencatat pengalaman customer.</p>
              {result.failed > 0 && <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-2 mb-4">Sebagian foto/teks tambahan gagal terkirim. Hubungi admin bila ada yang kurang.</p>}
              <button onClick={reset} className="px-6 py-3 bg-[#3B1464] text-white rounded-2xl text-sm font-bold hover:bg-[#4d1c85] transition">➕ Isi Review Baru</button>
            </div>
          ) : (
            <div className="space-y-5 fade-up">
              <Field label="Store">
                <div className="px-3 py-2.5 rounded-xl bg-purple-50 text-sm font-semibold text-[#3B1464]">🏬 Green Pramuka Square</div>
              </Field>
              <Field label="Nama Crew" error={errors.crew}><input className={inputCls(errors.crew)} maxLength={60} value={f.crew} onChange={set("crew")} placeholder="Nama crew yang melayani" autoComplete="off" /></Field>
              <Field label="Nama Customer" error={errors.customer}><input className={inputCls(errors.customer)} maxLength={60} value={f.customer} onChange={set("customer")} placeholder="Nama customer" autoComplete="off" /></Field>

              <Field label="Pesanan Customer" hint="(ketuk produk, keterangan opsional)" error={errors.order}>
                <div className="space-y-4">
                  {GROUPS.map(([title, list]) => (
                    <div key={title}>
                      <p className="text-[11px] font-bold text-purple-400 uppercase tracking-wide mb-1.5">{title}</p>
                      <div className="space-y-2">
                        {list.filter((p) => !p.soldOut).map((p) => {
                          const o = order[p.name];
                          return (
                            <div key={p.id} className={`rounded-2xl border transition ${o ? "border-[#3B1464] bg-purple-50/60" : "border-purple-100 bg-white"}`}>
                              <div className="flex items-center gap-3 p-2.5">
                                <button type="button" onClick={() => toggle(p.name)} aria-pressed={!!o} className="flex-1 flex items-center gap-3 text-left min-w-0">
                                  <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-[11px] shrink-0 ${o ? "bg-[#3B1464] border-[#3B1464] text-white" : "border-purple-200"}`}>{o ? "✓" : ""}</span>
                                  <span className="text-sm font-medium text-[#3B1464] leading-tight">{p.name}</span>
                                </button>
                                {o && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button type="button" aria-label="Kurangi" onClick={() => patch(p.name, { qty: Math.max(1, o.qty - 1) })} className="w-7 h-7 rounded-full bg-white border border-purple-200 text-[#3B1464] font-bold">−</button>
                                    <span className="w-5 text-center text-sm font-bold text-[#3B1464]">{o.qty}</span>
                                    <button type="button" aria-label="Tambah" onClick={() => patch(p.name, { qty: Math.min(99, o.qty + 1) })} className="w-7 h-7 rounded-full bg-white border border-purple-200 text-[#3B1464] font-bold">+</button>
                                  </div>
                                )}
                              </div>
                              {o && (
                                <div className="px-2.5 pb-2.5">
                                  <input className="w-full border border-purple-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:ring-2 focus:ring-purple-300" maxLength={80} value={o.note} onChange={(e) => patch(p.name, { note: e.target.value })} placeholder="Keterangan (opsional), mis. isi Coklat+Vanilla, dibungkus terpisah" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Field>

              <Field label="Feedback Produk" error={errors.fp}>
                <textarea rows={3} maxLength={500} className={inputCls(errors.fp) + " resize-none"} value={f.fp} onChange={set("fp")} placeholder="Komentar customer soal rasa, tekstur, tampilan produk..." />
              </Field>
              <Field label="Feedback Services" error={errors.fs}>
                <textarea rows={3} maxLength={500} className={inputCls(errors.fs) + " resize-none"} value={f.fs} onChange={set("fs")} placeholder="Komentar customer soal pelayanan, kecepatan, keramahan..." />
              </Field>

              <Field label="Foto Langsung" hint={`(wajib, maks ${MAX_PHOTOS})`} error={errors.photo}>
                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {photos.map((p) => (
                      <div key={p.id} className="relative w-24 h-24 rounded-2xl overflow-hidden border border-purple-100 bg-purple-50">
                        <img src={p.preview} alt="" className="w-full h-full object-cover" />
                        <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] text-center py-0.5">{p.role === "selfie" ? "Selfie + Produk" : "Foto Produk"}</span>
                        <button type="button" onClick={() => dropPhoto(p)} aria-label="Hapus foto" className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-[10px]">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-3">
                  {cam("produk", "📷", "Foto Produk", "Kamera langsung ke produk", "environment")}
                  {cam("selfie", "🤳", "Selfie + Produk", "Selfie customer bareng produk", "user")}
                </div>
                {busy && <p className="text-xs text-purple-500 mt-2">⏳ Memproses foto...</p>}
                <p className="text-[11px] text-gray-400 mt-2">Foto diambil langsung dari kamera HP. Data lokasi pada foto otomatis dihapus.</p>
              </Field>

              {REVIEW_CODE_REQUIRED && (
                <Field label="Kode Crew" error={errors.code}>
                  <input type="password" autoComplete="off" className={inputCls(errors.code)} maxLength={64} value={f.code} onChange={set("code")} placeholder="Kode dari admin/store leader" />
                </Field>
              )}

              {/* Honeypot anti-bot */}
              <input type="text" name="company_url" tabIndex={-1} autoComplete="off" aria-hidden="true" value={hp} onChange={(e) => setHp(e.target.value)} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

              <div>
                <Turnstile key={resetKey} onToken={(t) => { setCfToken(t); if (t) err("captcha", ""); }} />
                {errors.captcha && <p className="text-xs text-red-500 mt-1">{errors.captcha}</p>}
              </div>

              {result && !result.ok && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">⚠ {result.message}</div>}

              <button type="button" onClick={submit} disabled={sending || busy} className="w-full py-3.5 bg-[#3B1464] text-white rounded-2xl font-bold text-sm hover:bg-[#4d1c85] active:scale-[0.98] disabled:opacity-50 transition shadow-md shadow-purple-200">
                {sending ? "Mengirim..." : "📨 Kirim ke Telegram"}
              </button>
            </div>
          )}
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-4">Tarobun · Green Pramuka Square</p>
      </main>
    </div>
  );
}
