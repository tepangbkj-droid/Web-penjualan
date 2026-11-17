// Studio hias foto: pilih twibbon (opsional) + filter bando "Tarobun" (opsional), semua diproses di browser.
import { useEffect, useRef, useState } from "react";

const FRAMES = { 1: "/frames/twibbon-1.webp", 2: "/frames/twibbon-2.webp" };
const cache = {};
const loadImg = (src) => cache[src] || (cache[src] = new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }));
const PURPLE = "#4B1D8F", YELLOW = "#FFC928";

function star(c, x, y, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); }
function pill(c, x, y, w, h) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, h / 2); else c.rect(x, y, w, h); }

function drawBando(c, cx, cy, W, rot) {
  c.save(); c.translate(cx, cy); c.rotate((rot * Math.PI) / 180); c.lineCap = "round"; c.lineJoin = "round";
  const arc = () => { c.beginPath(); c.moveTo(-W / 2, 0); c.quadraticCurveTo(0, -W * 0.5, W / 2, 0); };
  arc(); c.strokeStyle = "#fff"; c.lineWidth = W * 0.1; c.stroke();
  arc(); c.strokeStyle = PURPLE; c.lineWidth = W * 0.065; c.stroke();
  for (const s of [-1, 1]) { c.beginPath(); c.arc(s * W / 2, 0, W * 0.055, 0, 7); c.fillStyle = YELLOW; c.fill(); c.lineWidth = W * 0.016; c.strokeStyle = PURPLE; c.stroke(); }
  const pw = W * 0.58, ph = W * 0.15, py = -W * 0.25 - ph / 2;
  pill(c, -pw / 2, py, pw, ph); c.strokeStyle = "#fff"; c.lineWidth = W * 0.045; c.stroke();
  pill(c, -pw / 2, py, pw, ph); c.fillStyle = YELLOW; c.fill(); c.strokeStyle = PURPLE; c.lineWidth = W * 0.017; c.stroke();
  c.fillStyle = PURPLE; c.textAlign = "center"; c.textBaseline = "middle";
  c.font = `900 ${ph * 0.6}px "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif`;
  c.fillText("TAROBUN", 0, py + ph / 2 + ph * 0.04, pw * 0.88);
  for (const s of [-1, 1]) { star(c, s * (pw / 2 + W * 0.045), py - ph * 0.05, W * 0.05); c.fillStyle = YELLOW; c.fill(); c.lineWidth = W * 0.012; c.strokeStyle = PURPLE; c.stroke(); }
  c.restore();
}

// Gambar foto + twibbon + bando. Posisi bando disimpan relatif terhadap foto asli (aman saat ganti twibbon).
function render(canvas, img, frameImg, st, S) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  let W, H, s, ox, oy;
  if (frameImg) { W = H = S; s = Math.max(S / iw, S / ih); ox = (W - iw * s) / 2; oy = (H - ih * s) * 0.3; }
  else { s = Math.min(1, S / Math.max(iw, ih)); W = Math.round(iw * s); H = Math.round(ih * s); ox = oy = 0; }
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
  c.drawImage(img, ox, oy, iw * s, ih * s);
  if (frameImg) c.drawImage(frameImg, 0, 0, W, H);
  if (st.bando) drawBando(c, ox + st.bx * iw * s, oy + st.by * ih * s, st.bw * iw * s, st.rot);
  return { s, ox, oy, iw, ih };
}

async function findFace(img) {
  try { if (!("FaceDetector" in window)) return null; const f = await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }).detect(img); return f[0]?.boundingBox || null; } catch { return null; }
}

export default function PhotoStudio({ photo, budget, onApply, onClose }) {
  const [st, setSt] = useState(photo.st || { frame: "none", bando: false, bx: 0.5, by: 0.25, bw: 0.55, rot: 0 });
  const [img, setImg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const cv = useRef(null), map = useRef(null), drag = useRef(false);

  useEffect(() => {
    const url = URL.createObjectURL(photo.src); const i = new Image();
    i.onload = async () => {
      setImg(i);
      if (!photo.st) { const b = await findFace(i); if (b) setSt((p) => ({ ...p, bx: (b.x + b.width / 2) / i.naturalWidth, by: (b.y + b.height * 0.12) / i.naturalHeight, bw: Math.min(1.1, (b.width * 1.4) / i.naturalWidth) })); }
    };
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (!img || !cv.current) return;
    let dead = false;
    (async () => {
      const fr = st.frame !== "none" ? await loadImg(FRAMES[st.frame]).catch(() => null) : null;
      if (!dead) map.current = render(cv.current, img, fr, st, 720);
    })();
    return () => { dead = true; };
  }, [img, st]);

  const upd = (d) => setSt((p) => ({ ...p, ...d }));
  const moveTo = (e) => {
    if (!st.bando || !map.current) return;
    const r = cv.current.getBoundingClientRect(), m = map.current;
    const x = ((e.clientX - r.left) / r.width) * cv.current.width, y = ((e.clientY - r.top) / r.height) * cv.current.height;
    upd({ bx: (x - m.ox) / (m.iw * m.s), by: (y - m.oy) / (m.ih * m.s) });
  };

  const apply = async () => {
    setSaving(true); setMsg("");
    try {
      const fr = st.frame !== "none" ? await loadImg(FRAMES[st.frame]) : null;
      const c = document.createElement("canvas"); render(c, img, fr, st, 1080);
      let blob = null;
      for (let q = 0.88; q >= 0.5; q -= 0.1) { blob = await new Promise((r) => c.toBlob(r, "image/jpeg", q)); if (blob && blob.size <= budget) break; }
      if (!blob || blob.size > budget) throw new Error("size");
      onApply(blob, st);
    } catch { setMsg("Gagal memproses foto atau ukuran terlalu besar. Coba pilih tanpa twibbon."); setSaving(false); }
  };

  const chip = (on) => `rounded-2xl border-2 transition ${on ? "border-[#3B1464] bg-purple-50" : "border-purple-100 bg-white"}`;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="max-w-md mx-auto my-4 bg-white rounded-3xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-[#3B1464]">✨ Hias Foto</h2>
          <button type="button" onClick={onClose} className="text-xs text-gray-500 underline">Lewati (pakai foto asli)</button>
        </div>
        <div className="rounded-2xl overflow-hidden border border-purple-100 bg-purple-50 mb-3">
          {!img && <p className="text-center text-xs text-purple-400 py-16">⏳ Memuat foto...</p>}
          <canvas ref={cv} className="w-full h-auto block" style={{ touchAction: st.bando ? "none" : "auto", cursor: st.bando ? "grab" : "default", display: img ? "block" : "none" }}
            onPointerDown={(e) => { if (!st.bando) return; drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); moveTo(e); }}
            onPointerMove={(e) => drag.current && moveTo(e)} onPointerUp={() => (drag.current = false)} onPointerCancel={() => (drag.current = false)} />
        </div>

        <p className="text-xs font-semibold text-[#3B1464] mb-1.5">Twibbon <span className="font-normal text-gray-400">(opsional)</span></p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <button type="button" onClick={() => upd({ frame: "none" })} className={`${chip(st.frame === "none")} aspect-square text-xs font-semibold text-[#3B1464]`}>🚫<br />Tanpa</button>
          {["1", "2"].map((k) => (
            <button key={k} type="button" onClick={() => upd({ frame: k })} className={`${chip(st.frame === k)} aspect-square p-1 bg-[linear-gradient(135deg,#e9d5ff,#fde68a)]`}>
              <img src={FRAMES[k]} alt={`Twibbon ${k}`} className="w-full h-full object-contain" loading="lazy" />
            </button>
          ))}
        </div>

        <button type="button" onClick={() => upd({ bando: !st.bando })} className={`${chip(st.bando)} w-full py-2.5 text-sm font-bold text-[#3B1464] mb-2`}>
          {st.bando ? "✅" : "🎀"} Filter Bando Tarobun {st.bando ? "(aktif)" : "(opsional)"}
        </button>
        {st.bando && (
          <div className="space-y-2 mb-3 px-1">
            <p className="text-[11px] text-gray-400">Seret bando di foto untuk memindahkan ke atas kepala.</p>
            <label className="block text-[11px] text-gray-500">Ukuran
              <input type="range" min="0.15" max="1.2" step="0.01" value={st.bw} onChange={(e) => upd({ bw: +e.target.value })} className="w-full accent-[#3B1464]" />
            </label>
            <label className="block text-[11px] text-gray-500">Miringkan
              <input type="range" min="-35" max="35" step="1" value={st.rot} onChange={(e) => upd({ rot: +e.target.value })} className="w-full accent-[#3B1464]" />
            </label>
          </div>
        )}
        {msg && <p className="text-xs text-red-500 mb-2">{msg}</p>}
        <button type="button" onClick={apply} disabled={!img || saving} className="w-full py-3 bg-[#3B1464] text-white rounded-2xl font-bold text-sm disabled:opacity-50">{saving ? "Memproses..." : "✅ Pakai Foto Ini"}</button>
      </div>
    </div>
  );
}
