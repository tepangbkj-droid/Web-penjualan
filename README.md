# Tarobun

E-commerce SPA (React + Vite + Tailwind CSS).

## ⚠️ Sebelum push: ganti token Telegram

Token bot Telegram yang lama sudah pernah muncul di percakapan ini, jadi
anggap sudah bocor. Buka BotFather di Telegram → `/mybots` → pilih bot kamu →
**API Token** → **Revoke current token**, lalu pakai token baru. Isi token
baru itu nanti di file `.env` (bukan di kode), sesuai `.env.example`.

## Setup lokal (opsional, kalau nanti buka di laptop)

```
npm install
cp .env.example .env   # lalu isi token & chat id kamu
npm run dev
```

---

# Cara upload ke GitHub lewat HP (tanpa command line)

1. Buka **github.com** di browser HP kamu, login/daftar akun.
2. Ketuk ikon **+** di pojok kanan atas → **New repository**.
   - Isi nama repo, misalnya `tarobun`.
   - Pilih **Public** atau **Private**.
   - JANGAN centang "Add a README file" (biar tidak bentrok).
   - Ketuk **Create repository**.
3. Di halaman repo yang baru dibuat, cari link **"uploading an existing file"**
   (atau ketuk **Add file** → **Upload files**).
4. Ketuk area upload → pilih **Choose your files** → browser file HP kamu
   akan terbuka. Pilih semua file & folder project ini yang saya siapkan
   (`src/`, `package.json`, `vite.config.js`, `tailwind.config.js`,
   `postcss.config.js`, `index.html`, `.gitignore`, `.env.example`,
   `README.md`).
   - Catatan: **jangan upload file `.env`** kalau kamu sudah membuatnya —
     itu hanya untuk di HP/laptop kamu sendiri, bukan untuk GitHub.
5. Scroll ke bawah, isi kotak "Commit changes" dengan pesan singkat, misalnya
   `Initial commit`.
6. Ketuk tombol hijau **Commit changes**.

Selesai — project kamu sudah ada di GitHub. Kalau nanti mau update file lagi,
tinggal buka file tersebut di repo → ketuk ikon pensil (edit) → ubah → commit
lagi, semua bisa dari HP.

## Kalau mau pakai deploy otomatis (Vercel/Netlify)

Setelah repo ada di GitHub, kamu bisa hubungkan repo itu ke **Vercel** atau
**Netlify** lewat browser HP (login pakai akun GitHub) → pilih repo `tarobun`
→ Deploy. Jangan lupa isi environment variable `VITE_TELEGRAM_BOT_TOKEN`,
`VITE_TELEGRAM_CHAT_ID`, dan `VITE_WA_STORE_NUMBER` di pengaturan project
Vercel/Netlify (bukan di kode), supaya token tetap aman.
