// ============================================================
// TAROBUN — E-Commerce SPA
// Stack: React + Tailwind CSS (CDN) + Vanilla JS
// ============================================================
// SETUP: lihat README.md di root project ini.
// Secrets (token Telegram, dll) diisi lewat file .env, BUKAN di file ini.
// ============================================================

import { useState, useCallback } from "react";

// ─── CONFIG (isi lewat file .env, JANGAN hardcode di sini) ───
const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID   = import.meta.env.VITE_TELEGRAM_CHAT_ID || "";
const WA_STORE_NUMBER    = import.meta.env.VITE_WA_STORE_NUMBER || "6285899932582"; // format: 62xxx tanpa +
// ─────────────────────────────────────────────────────────────

// ─── SANITASI INPUT (mencegah XSS) ───────────────────────────
const sanitize = (str) =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

// ─── DATABASE PRODUK ──────────────────────────────────────────
const BUNS_FLAVORS = ["Butter", "Coklat", "Vanilla", "Raspberry", "Peach Cream", "Pine Poop"];

const PRODUCTS = {
  buns: [
    { id: "b1", name: "Tarobun Butter (OG)",   price: 13000, desc: "Roti lembut dengan krim mentega klasik yang kaya.",                                      img: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80" },
    { id: "b2", name: "Tarobun Chocolate",      price: 16000, desc: "Isian krim cokelat yang manis, halus, dan pekat.",                                       img: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&q=80" },
    { id: "b3", name: "Tarobun Vanilla",        price: 16000, desc: "Krim vanila klasik yang lembut dan nyaman di lidah.",                                    img: "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=400&q=80" },
    { id: "b4", name: "Tarobun Peach Cream",    price: 17000, desc: "Krim buah peach yang juicy dan segar.",                                                  img: "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=400&q=80" },
    { id: "b5", name: "Tarobun Raspberry",      price: 17000, desc: "Krim raspberry manis dengan sedikit asam yang menyegarkan.",                             img: "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400&q=80" },
    { id: "b6", name: "Tarobun Pine Poop",      price: 16000, desc: "Varian roti spesial dengan isian nanas yang unik dan gurih.",                            img: "https://images.unsplash.com/photo-1549931319-a545dcf3bc7b?w=400&q=80" },
  ],
  packs: [
    { id: "p1", name: "Family Pack Custom",    price: 88000, desc: "Pilih 6 rasa sesukamu! Kombinasi bebas dari semua varian.", custom: true,                 img: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&q=80" },
    { id: "p2", name: "Family Pack VanCok",    price: 88000, desc: "Isi fix: 3 Vanilla + 3 Coklat. Pasangan sempurna yang tak pernah gagal.", fix: "3 Vanilla + 3 Coklat",    img: "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=400&q=80" },
    { id: "p3", name: "Family Pack BuVanCok",  price: 88000, desc: "Isi fix: 2 Butter + 2 Vanilla + 2 Coklat. Trio klasik dalam satu box.", fix: "2 Butter + 2 Vanilla + 2 Coklat", img: "https://images.unsplash.com/photo-1474495086132-c24bec3cbcf7?w=400&q=80" },
  ],
  drinks: [
    { id: "d1", name: "Taro Latte Original",           price: 18000, desc: "Minuman susu creamy dengan rasa taro khas Tarobun yang pekat dan manis pas.",                                              img: "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400&q=80" },
    { id: "d2", name: "Taro Latte Blueberry",          price: 20000, desc: "Perpaduan taro latte creamy dengan tambahan blueberry manis dan sedikit asam.",                                            img: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&q=80" },
    { id: "d3", name: "Taro Latte Strawberry Cheese",  price: 21000, desc: "Varian favorit: taro latte dengan keju dan stroberi — creamy, milky, manis, gurih, ada sensasi sedikit asin.",            img: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&q=80" },
  ],
};

const fmtPrice = (n) => "Rp " + n.toLocaleString("id-ID");

// ─── CUSTOM PACK SELECTOR (modal inner) ───────────────────────
function CustomPackSelector({ onConfirm, onClose }) {
  const [counts, setCounts] = useState(
    Object.fromEntries(BUNS_FLAVORS.map((f) => [f, 0]))
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const adjust = (flavor, delta) => {
    setCounts((prev) => {
      const next = prev[flavor] + delta;
      if (next < 0 || total + delta > 6) return prev;
      return { ...prev, [flavor]: next };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl">×</button>
        <h2 className="text-xl font-bold text-purple-900 mb-1">Family Pack Custom</h2>
        <p className="text-sm text-gray-500 mb-4">Pilih total <strong>6 rasa</strong>. Sudah: <span className={total === 6 ? "text-green-600 font-bold" : "text-purple-600 font-semibold"}>{total}/6</span></p>
        <div className="space-y-3 mb-5">
          {BUNS_FLAVORS.map((f) => (
            <div key={f} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{f}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => adjust(f, -1)} disabled={counts[f] === 0} className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 font-bold text-lg flex items-center justify-center disabled:opacity-30 hover:bg-purple-200 transition">−</button>
                <span className="w-5 text-center text-sm font-semibold">{counts[f]}</span>
                <button onClick={() => adjust(f, 1)} disabled={total >= 6} className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 font-bold text-lg flex items-center justify-center disabled:opacity-30 hover:bg-purple-200 transition">+</button>
              </div>
            </div>
          ))}
        </div>
        {total !== 6 && (
          <p className="text-xs text-red-500 mb-3">⚠ Total harus 6 pcs — sekarang {total < 6 ? `kurang ${6 - total}` : `lebih ${total - 6}`} pcs.</p>
        )}
        <button
          onClick={() => total === 6 && onConfirm(counts)}
          disabled={total !== 6}
          className="w-full py-3 rounded-2xl bg-purple-600 text-white font-semibold text-sm disabled:opacity-40 hover:bg-purple-700 transition"
        >
          Tambah ke Keranjang
        </button>
      </div>
    </div>
  );
}

// ─── PRODUCT CARD ─────────────────────────────────────────────
function ProductCard({ product, onAdd }) {
  const [showSelector, setShowSelector] = useState(false);

  const handleAdd = () => {
    if (product.custom) {
      setShowSelector(true);
    } else {
      onAdd({ ...product, label: product.fix ? `${product.name} (${product.fix})` : product.name, qty: 1, key: product.id + "_" + Date.now() });
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-purple-50 hover:shadow-md transition-shadow flex flex-col">
        <div className="h-40 overflow-hidden">
          <img src={product.img} alt={product.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" onError={(e) => { e.target.src = `https://placehold.co/400x200/f3e8ff/7c3aed?text=${encodeURIComponent(product.name)}`; }} />
        </div>
        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-semibold text-purple-900 text-sm mb-1 leading-tight">{product.name}</h3>
          <p className="text-xs text-gray-500 flex-1 mb-3 leading-relaxed">{product.desc}</p>
          {product.fix && <p className="text-xs bg-purple-50 text-purple-700 rounded-lg px-2 py-1 mb-3">📦 {product.fix}</p>}
          <div className="flex items-center justify-between mt-auto">
            <span className="text-purple-700 font-bold text-sm">{fmtPrice(product.price)}</span>
            <button onClick={handleAdd} className="bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-purple-700 active:scale-95 transition">
              {product.custom ? "Pilih Rasa" : "+ Tambah"}
            </button>
          </div>
        </div>
      </div>
      {showSelector && (
        <CustomPackSelector
          onClose={() => setShowSelector(false)}
          onConfirm={(counts) => {
            const detail = Object.entries(counts).filter(([, v]) => v > 0).map(([f, v]) => `${v} ${f}`).join(", ");
            onAdd({ ...product, label: `Family Pack Custom (${detail})`, customDetail: counts, qty: 1, key: product.id + "_" + Date.now() });
            setShowSelector(false);
          }}
        />
      )}
    </>
  );
}

// ─── CART SIDEBAR / PANEL ─────────────────────────────────────
function Cart({ items, onQty, onRemove, onCheckout }) {
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <div className="bg-white border border-purple-100 rounded-3xl p-5 shadow-sm sticky top-24">
      <h2 className="text-lg font-bold text-purple-900 mb-4 flex items-center gap-2">
        🛒 Keranjang
        {items.length > 0 && <span className="bg-purple-600 text-white text-xs rounded-full px-2 py-0.5">{items.reduce((s, i) => s + i.qty, 0)}</span>}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Keranjangmu masih kosong 🥺</p>
      ) : (
        <>
          <div className="space-y-3 mb-4 max-h-72 overflow-y-auto pr-1">
            {items.map((item) => (
              <div key={item.key} className="flex gap-2 items-start text-sm border-b border-purple-50 pb-3">
                <div className="flex-1">
                  <p className="font-medium text-purple-900 text-xs leading-tight">{item.label}</p>
                  <p className="text-purple-500 text-xs">{fmtPrice(item.price)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onQty(item.key, -1)} className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-sm flex items-center justify-center hover:bg-purple-200">−</button>
                  <span className="w-4 text-center text-xs font-semibold">{item.qty}</span>
                  <button onClick={() => onQty(item.key, 1)} className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-sm flex items-center justify-center hover:bg-purple-200">+</button>
                  <button onClick={() => onRemove(item.key)} className="w-6 h-6 rounded-full bg-red-50 text-red-400 text-xs flex items-center justify-center hover:bg-red-100 ml-1">✕</button>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-purple-100 pt-3 mb-4">
            <div className="flex justify-between text-sm font-bold text-purple-900">
              <span>Total</span>
              <span>{fmtPrice(total)}</span>
            </div>
          </div>
          <button onClick={onCheckout} className="w-full py-3 bg-purple-600 text-white rounded-2xl font-semibold text-sm hover:bg-purple-700 active:scale-98 transition shadow-md shadow-purple-200">
            Checkout →
          </button>
        </>
      )}
    </div>
  );
}

// ─── CHECKOUT MODAL ───────────────────────────────────────────
function CheckoutModal({ items, total, onClose }) {
  const [form, setForm] = useState({ name: "", phone: "", date: "", time: "", type: "Pick Up di Toko" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState(null); // null | "tg_error" | "done"

  const validate = () => {
    const e = {};
    if (!form.name.trim())                         e.name  = "Nama wajib diisi.";
    if (!/^\d{8,15}$/.test(form.phone.replace(/\s/g, ""))) e.phone = "Nomor WhatsApp tidak valid (8-15 digit angka).";
    if (!form.date)                                e.date  = "Tanggal pengambilan wajib dipilih.";
    if (!form.time)                                e.time  = "Waktu pengambilan wajib dipilih.";
    return e;
  };

  const buildDetail = () =>
    items.map((i) => `- ${i.qty}x ${i.label} (${fmtPrice(i.price)})`).join("\n");

  const buildTgMsg = () =>
    `🚨 *PESANAN BARU MASUK!* 🚨\n` +
    `Nama: ${sanitize(form.name)}\n` +
    `No WA: ${sanitize(form.phone)}\n` +
    `Tipe: ${form.type}\n` +
    `Tanggal & Waktu: ${form.date} - ${form.time}\n\n` +
    `*Detail Pesanan:*\n${buildDetail()}\n` +
    `*Total: ${fmtPrice(total)}*`;

  const buildWaMsg = () =>
    `Halo Tarobun! 👋 Saya ingin memesan:\n\n` +
    `👤 Nama: ${form.name}\n` +
    `📱 No WA: ${form.phone}\n` +
    `🚚 Tipe: ${form.type}\n` +
    `📅 Tanggal & Waktu: ${form.date} pukul ${form.time}\n\n` +
    `📦 *Detail Pesanan:*\n${buildDetail()}\n\n` +
    `💳 *Total: ${fmtPrice(total)}*\n\n` +
    `Mohon dikonfirmasi ya, terima kasih! 🙏`;

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true);

    // AKSI A — Telegram
    try {
  await fetch("/api/send-telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: buildTgMsg() }),
  });
} catch (_) {
  setStatus("tg_error");
    }
    // AKSI B — WhatsApp redirect
    const waUrl = `https://wa.me/${WA_STORE_NUMBER}?text=${encodeURIComponent(buildWaMsg())}`;
    window.open(waUrl, "_blank");
    setLoading(false);
    setStatus("done");
  };

  const inp = (field, label, type = "text", extra = {}) => (
    <div>
      <label className="block text-xs font-semibold text-purple-800 mb-1">{label}</label>
      <input
        type={type}
        value={form[field]}
        onChange={(e) => { setForm((p) => ({ ...p, [field]: e.target.value })); setErrors((p) => ({ ...p, [field]: "" })); }}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-300 ${errors[field] ? "border-red-400" : "border-purple-200"}`}
        {...extra}
      />
      {errors[field] && <p className="text-xs text-red-500 mt-1">{errors[field]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl">×</button>
        <h2 className="text-xl font-bold text-purple-900 mb-1">Detail Pemesanan</h2>
        <p className="text-xs text-gray-400 mb-5">Isi data di bawah untuk konfirmasi pesananmu 🎀</p>

        {status === "done" ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">🎉</div>
            <h3 className="text-lg font-bold text-purple-900 mb-2">Pesanan Terkirim!</h3>
            <p className="text-sm text-gray-500 mb-1">Kamu diarahkan ke WhatsApp Tarobun.</p>
            {status === "tg_error" && <p className="text-xs text-amber-500">Catatan: notif Telegram gagal, tapi WA sudah terbuka.</p>}
            <button onClick={onClose} className="mt-5 px-6 py-2 bg-purple-600 text-white rounded-full text-sm font-semibold hover:bg-purple-700 transition">Tutup</button>
          </div>
        ) : (
          <div className="space-y-4">
            {inp("name", "Nama Lengkap", "text", { placeholder: "Nama kamu..." })}
            {inp("phone", "Nomor WhatsApp", "tel", { placeholder: "08xxxxxxxxxx" })}
            {inp("date", "Tanggal Pengambilan", "date")}
            {inp("time", "Waktu Pengambilan", "time")}
            <div>
              <label className="block text-xs font-semibold text-purple-800 mb-2">Jenis Pengambilan</label>
              <div className="flex gap-3">
                {["Pick Up di Toko", "Online Delivery"].map((opt) => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="radio" name="type" value={opt} checked={form.type === opt} onChange={() => setForm((p) => ({ ...p, type: opt }))} className="accent-purple-600" />
                    <span className={form.type === opt ? "text-purple-700 font-semibold" : "text-gray-600"}>{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Ringkasan pesanan */}
            <div className="bg-purple-50 rounded-2xl p-4 mt-2">
              <p className="text-xs font-bold text-purple-800 mb-2 uppercase tracking-wide">Ringkasan Pesanan</p>
              {items.map((i) => (
                <div key={i.key} className="flex justify-between text-xs text-purple-700 mb-1">
                  <span>{i.qty}× {i.label}</span>
                  <span>{fmtPrice(i.price * i.qty)}</span>
                </div>
              ))}
              <div className="border-t border-purple-200 mt-2 pt-2 flex justify-between text-sm font-bold text-purple-900">
                <span>Total</span>
                <span>{fmtPrice(total)}</span>
              </div>
            </div>

            {status === "tg_error" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                ⚠ Notifikasi Telegram gagal (cek koneksi). Kamu tetap bisa lanjut ke WhatsApp.
              </div>
            )}

            <button onClick={handleSubmit} disabled={loading} className="w-full py-3 bg-purple-600 text-white rounded-2xl font-bold text-sm hover:bg-purple-700 active:scale-98 disabled:opacity-50 transition shadow-md shadow-purple-200">
              {loading ? "Memproses..." : "📲 Konfirmasi & Buka WhatsApp"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SECTION HEADER ───────────────────────────────────────────
function SectionHeader({ emoji, title, subtitle }) {
  return (
    <div className="mb-6">
      <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 text-xs font-semibold px-3 py-1 rounded-full mb-2">{emoji} {subtitle}</div>
      <h2 className="text-2xl font-bold text-purple-900">{title}</h2>
    </div>
  );
}

// ─── FLOATING CART BUTTON (mobile) ────────────────────────────
function FloatingCart({ count, total, onClick }) {
  if (count === 0) return null;
  return (
    <button onClick={onClick} className="fixed bottom-6 right-6 z-40 bg-purple-600 text-white rounded-2xl px-5 py-3 shadow-xl shadow-purple-300 flex items-center gap-3 hover:bg-purple-700 transition lg:hidden">
      <span className="text-xl">🛒</span>
      <div className="text-left">
        <p className="text-xs opacity-80">{count} item</p>
        <p className="text-sm font-bold">{fmtPrice(total)}</p>
      </div>
    </button>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────
export default function App() {
  const [cart, setCart]           = useState([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);

  const addToCart = useCallback((product) => {
    setCart((prev) => {
      // Family Pack Custom selalu entry baru karena kombinasi bisa beda
      if (product.custom) return [...prev, product];
      const existing = prev.find((i) => i.id === product.id && !i.custom);
      if (existing) return prev.map((i) => i.key === existing.key ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, product];
    });
  }, []);

  const adjustQty = useCallback((key, delta) => {
    setCart((prev) => prev.map((i) => i.key === key ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
  }, []);

  const removeItem = useCallback((key) => {
    setCart((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const total      = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount  = cart.reduce((s, i) => s + i.qty, 0);

  const cartProps = { items: cart, onQty: adjustQty, onRemove: removeItem, onCheckout: () => setShowCheckout(true) };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 font-sans">
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-purple-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white font-black text-lg shadow">T</div>
            <div>
              <h1 className="text-xl font-black text-purple-900 leading-none">Tarobun</h1>
              <p className="text-xs text-purple-400">Freshly baked, daily</p>
            </div>
          </div>
          {/* Mobile cart icon */}
          <button onClick={() => setShowMobileCart(true)} className="lg:hidden relative p-2">
            <span className="text-2xl">🛒</span>
            {cartCount > 0 && <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{cartCount}</span>}
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-r from-purple-900 via-purple-700 to-pink-700 text-white">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-24 relative z-10">
          <p className="text-purple-300 text-sm font-medium mb-3 tracking-widest uppercase">Bakery · Specialty Buns</p>
          <h2 className="text-4xl md:text-6xl font-black leading-tight mb-4">Roti Lembut<br />Penuh Cinta 🤍</h2>
          <p className="text-purple-200 text-base md:text-lg max-w-lg mb-8">Tarobun hadir dengan isian krim premium yang tebal — dibuat segar setiap hari, siap bikin harimu lebih manis.</p>
          <a href="#menu" className="inline-block bg-white text-purple-800 font-bold px-6 py-3 rounded-2xl hover:bg-purple-50 transition shadow-lg">Lihat Menu →</a>
        </div>
        {/* Decorative blobs */}
        <div className="absolute -top-10 -right-10 w-72 h-72 bg-pink-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-purple-300/20 rounded-full blur-2xl" />
      </section>

      {/* MAIN CONTENT */}
      <main id="menu" className="max-w-6xl mx-auto px-4 py-12">
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8">
          {/* Product sections */}
          <div className="space-y-14">
            {/* Satuan Buns */}
            <section>
              <SectionHeader emoji="🍞" title="Tarobun Satuan" subtitle="Best Seller" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {PRODUCTS.buns.map((p) => <ProductCard key={p.id} product={p} onAdd={addToCart} />)}
              </div>
            </section>

            {/* Family Pack */}
            <section>
              <SectionHeader emoji="📦" title="Family Pack" subtitle="Isi 6 Pcs" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PRODUCTS.packs.map((p) => <ProductCard key={p.id} product={p} onAdd={addToCart} />)}
              </div>
            </section>

            {/* Drinks */}
            <section>
              <SectionHeader emoji="🧋" title="Taro Latte" subtitle="Minuman Khas" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PRODUCTS.drinks.map((p) => <ProductCard key={p.id} product={p} onAdd={addToCart} />)}
              </div>
            </section>
          </div>

          {/* Desktop cart */}
          <aside className="hidden lg:block">
            <Cart {...cartProps} />
          </aside>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="bg-purple-900 text-purple-300 text-center text-xs py-8 mt-12">
        <p className="font-bold text-white text-base mb-1">🍞 Tarobun</p>
        <p>Freshly baked with love · {new Date().getFullYear()}</p>
      </footer>

      {/* FLOATING CART (mobile) */}
      <FloatingCart count={cartCount} total={total} onClick={() => setShowMobileCart(true)} />

      {/* MOBILE CART DRAWER */}
      {showMobileCart && (
        <div className="fixed inset-0 z-40 flex items-end lg:hidden" onClick={() => setShowMobileCart(false)}>
          <div className="bg-white w-full rounded-t-3xl p-6 shadow-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <Cart {...cartProps} />
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {showCheckout && cart.length > 0 && (
        <CheckoutModal items={cart} total={total} onClose={() => setShowCheckout(false)} />
      )}
    </div>
  );
}
