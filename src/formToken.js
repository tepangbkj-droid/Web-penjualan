// Mengambil token form bertanda tangan dari server (dipakai untuk verifikasi anti-bot).
export async function getFormToken() {
  try {
    const r = await fetch("/api/form-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!r.ok) return "";
    const d = await r.json();
    return typeof d.token === "string" ? d.token : "";
  } catch {
    return "";
  }
}
