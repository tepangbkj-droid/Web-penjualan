// Mesin gambar bersama: twibbon + bando Tarobun (dipakai kamera langsung dan studio hias foto).
export const FRAMES = { 1: "/frames/twibbon-1.webp", 2: "/frames/twibbon-2.webp" };
const cache = {};
export const loadImg = (src) => cache[src] || (cache[src] = new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }));
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
export function render(canvas, img, frameImg, st, S, mirror = false) {
  const iw = img.videoWidth || img.naturalWidth, ih = img.videoHeight || img.naturalHeight;
  let W, H, s, ox, oy;
  if (frameImg) { W = H = S; s = Math.max(S / iw, S / ih); ox = (W - iw * s) / 2; oy = (H - ih * s) * 0.3; }
  else { s = Math.min(1, S / Math.max(iw, ih)); W = Math.round(iw * s); H = Math.round(ih * s); ox = oy = 0; }
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
  if (mirror) { c.save(); c.translate(ox + iw * s, oy); c.scale(-1, 1); c.drawImage(img, 0, 0, iw * s, ih * s); c.restore(); }
  else c.drawImage(img, ox, oy, iw * s, ih * s);
  if (frameImg) c.drawImage(frameImg, 0, 0, W, H);
  if (st.bando) drawBando(c, ox + st.bx * iw * s, oy + st.by * ih * s, st.bw * iw * s, st.rot);
  return { s, ox, oy, iw, ih };
}

export async function findFace(img) {
  try { if (!("FaceDetector" in window)) return null; const f = await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }).detect(img); return f[0]?.boundingBox || null; } catch { return null; }
}

export const hasFaceDetector = () => typeof window !== "undefined" && "FaceDetector" in window;

export async function toJpeg(canvas, budget) {
  for (let q = 0.88; q >= 0.5; q -= 0.1) {
    const b = await new Promise((r) => canvas.toBlob(r, "image/jpeg", q));
    if (b && b.size <= budget) return b;
  }
  return null;
}
