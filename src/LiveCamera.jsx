// Kamera langsung dengan filter: twibbon & bando Tarobun terlihat live sebelum foto diambil (hasil = yang terlihat).
import { useEffect, useRef, useState } from "react";
import { FRAMES, loadImg, render, hasFaceDetector, toJpeg } from "./fx.js";

export default function LiveCamera({ role, budget, onCapture, onClose, onNative }) {
  const [facing, setFacing] = useState(role === "selfie" ? "user" : "environment");
  const [st, setSt] = useState({ frame: "none", bando: false, bx: 0.5, by: 0.25, bw: 0.55, rot: 0 });
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const vid = useRef(null), cv = useRef(null), map = useRef(null), frames = useRef({});
  const stRef = useRef(st), manual = useRef(false), drag = useRef(false);
  stRef.current = st;
  const mirror = facing === "user";
  const auto = hasFaceDetector();

  useEffect(() => { Object.entries(FRAMES).forEach(([k, u]) => loadImg(u).then((i) => { frames.current[k] = i; }).catch(() => {})); }, []);

  useEffect(() => {
    let stream, dead = false;
    setReady(false); setErr("");
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("nocam");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
        if (dead) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = vid.current; v.srcObject = stream; await v.play(); setReady(true);
      } catch (e) {
        if (!dead) setErr(e?.name === "NotAllowedError" ? "Izin kamera ditolak. Aktifkan izin kamera untuk situs ini di browser, atau pakai kamera bawaan HP." : "Kamera tidak bisa dibuka di perangkat ini.");
      }
    })();
    return () => { dead = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [facing]);

  useEffect(() => {
    if (!ready) return;
    let raf, dead = false;
    const tick = () => {
      if (dead) return;
      const v = vid.current, c = cv.current;
      if (v && c && v.videoWidth) { const s = stRef.current; map.current = render(c, v, s.frame !== "none" ? frames.current[s.frame] : null, s, 640, mirror); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, [ready, mirror]);

  // Bando otomatis mengikuti wajah (bila browser mendukung); kalau digeser manual, auto berhenti.
  useEffect(() => {
    if (!ready || !auto) return;
    let dead = false;
    const det = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    const id = setInterval(async () => {
      if (dead || !stRef.current.bando || manual.current) return;
      try {
        const v = vid.current, b = (await det.detect(v))[0]?.boundingBox;
        if (!b || dead) return;
        const cx = (b.x + b.width / 2) / v.videoWidth, tx = mirror ? 1 - cx : cx;
        const ty = (b.y + b.height * 0.12) / v.videoHeight, tw = Math.min(1.1, (b.width * 1.4) / v.videoWidth);
        setSt((p) => ({ ...p, bx: p.bx + (tx - p.bx) * 0.5, by: p.by + (ty - p.by) * 0.5, bw: p.bw + (tw - p.bw) * 0.5 }));
      } catch { /* abaikan */ }
    }, 180);
    return () => { dead = true; clearInterval(id); };
  }, [ready, mirror, auto]);

  const upd = (d) => setSt((p) => ({ ...p, ...d }));
  const moveTo = (e) => {
    if (!st.bando || !map.current) return;
    manual.current = true;
    const r = cv.current.getBoundingClientRect(), m = map.current;
    const x = ((e.clientX - r.left) / r.width) * cv.current.width, y = ((e.clientY - r.top) / r.height) * cv.current.height;
    upd({ bx: (x - m.ox) / (m.iw * m.s), by: (y - m.oy) / (m.ih * m.s) });
  };

  const shoot = async () => {
    if (busy || !ready) return;
    setBusy(true);
    try {
      const v = vid.current, s = stRef.current;
      const out = document.createElement("canvas"); render(out, v, s.frame !== "none" ? frames.current[s.frame] : null, s, 1080, mirror);
      const raw = document.createElement("canvas"); raw.width = v.videoWidth; raw.height = v.videoHeight;
      const rc = raw.getContext("2d"); if (mirror) { rc.translate(raw.width, 0); rc.scale(-1, 1); } rc.drawImage(v, 0, 0);
      const blob = await toJpeg(out, budget);
      const src = await new Promise((r) => raw.toBlob(r, "image/jpeg", 0.85));
      if (!blob || !src) throw new Error("fail");
      onCapture({ blob, src, st: s });
    } catch { setErr("Foto gagal diambil atau ukurannya terlalu besar. Coba lagi."); setBusy(false); }
  };

  const chip = (on) => `rounded-xl border-2 shrink-0 w-14 h-14 flex items-center justify-center text-[10px] font-bold ${on ? "border-[#F6C445] bg-white/20 text-white" : "border-white/20 bg-white/5 text-white/80"}`;
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button type="button" onClick={onClose} className="text-sm font-semibold">✕ Tutup</button>
        <span className="text-sm font-bold">{role === "selfie" ? "Selfie + Produk" : "Foto Produk"}</span>
        <button type="button" onClick={() => setFacing(mirror ? "environment" : "user")} disabled={!ready} className="text-sm font-semibold disabled:opacity-40">🔄 Balik</button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-3">
        <video ref={vid} playsInline muted autoPlay style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
        {err ? (
          <div className="bg-white rounded-3xl p-5 text-center max-w-xs">
            <p className="text-sm text-gray-700 mb-4">{err}</p>
            <label className="block w-full py-3 bg-[#3B1464] text-white rounded-2xl text-sm font-bold cursor-pointer">
              📷 Pakai Kamera Bawaan HP
              <input type="file" accept="image/*" capture={role === "selfie" ? "user" : "environment"} className="sr-only" onChange={onNative} />
            </label>
          </div>
        ) : !ready ? (
          <p className="text-white/70 text-sm">⏳ Membuka kamera...</p>
        ) : (
          <canvas ref={cv} className="max-w-full max-h-full rounded-2xl" style={{ touchAction: st.bando ? "none" : "auto" }}
            onPointerDown={(e) => { if (!st.bando) return; drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); moveTo(e); }}
            onPointerMove={(e) => drag.current && moveTo(e)} onPointerUp={() => (drag.current = false)} onPointerCancel={() => (drag.current = false)} />
        )}
      </div>

      {!err && (
        <div className="px-4 pt-3 pb-5 text-white space-y-3" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
          {st.bando && (
            <div className="flex items-center gap-3 text-[11px] text-white/80">
              <span>Ukuran</span>
              <input type="range" min="0.15" max="1.2" step="0.01" value={st.bw} onChange={(e) => { manual.current = true; upd({ bw: +e.target.value }); }} className="flex-1 accent-[#F6C445]" />
            </div>
          )}
          <p className="text-[11px] text-white/60 text-center">
            {st.bando ? (auto && !manual.current ? "Bando otomatis mengikuti wajah. Geser untuk mengatur sendiri." : "Seret bando ke atas kepala, atur ukuran dengan slider.") : "Pilih twibbon atau bando, lalu pas-kan posisi sebelum foto."}
          </p>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => upd({ frame: "none" })} className={chip(st.frame === "none")}>Tanpa</button>
            {["1", "2"].map((k) => (
              <button key={k} type="button" onClick={() => upd({ frame: k })} className={`${chip(st.frame === k)} p-1 bg-[linear-gradient(135deg,#e9d5ff,#fde68a)]`}>
                <img src={FRAMES[k]} alt={`Twibbon ${k}`} className="w-full h-full object-contain" />
              </button>
            ))}
            <button type="button" onClick={() => { manual.current = false; upd({ bando: !st.bando }); }} className={chip(st.bando)}>🎀<br />Bando</button>
          </div>
          <div className="flex justify-center">
            <button type="button" onClick={shoot} disabled={!ready || busy} aria-label="Ambil foto" className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40">
              <span className="w-14 h-14 rounded-full bg-white active:scale-90 transition" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
