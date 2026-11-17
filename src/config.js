// Konfigurasi publik (aman tampil di browser). JANGAN taruh token bot di sini / di VITE_*.
export const WA_STORE_NUMBER = import.meta.env.VITE_WA_STORE_NUMBER || "6285899932582"; // format: 62xxx tanpa +
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
export const fmtPrice = (n) => "Rp " + n.toLocaleString("id-ID");
// Isi VITE_REVIEW_CODE_REQUIRED=1 (dan REVIEW_ACCESS_CODE di Vercel) agar halaman Review minta kode crew.
export const REVIEW_CODE_REQUIRED = import.meta.env.VITE_REVIEW_CODE_REQUIRED === "1";
