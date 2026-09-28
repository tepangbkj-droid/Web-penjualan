// Konfigurasi publik (aman tampil di browser). JANGAN taruh token bot di sini / di VITE_*.
export const WA_STORE_NUMBER = import.meta.env.VITE_WA_STORE_NUMBER || "6285899932582"; // format: 62xxx tanpa +
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
export const fmtPrice = (n) => "Rp " + n.toLocaleString("id-ID");
