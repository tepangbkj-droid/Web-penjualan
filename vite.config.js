import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    cssMinify: true,
    chunkSizeWarningLimit: 300,
    rollupOptions: {
      output: {
        // React dipisah supaya di-cache browser terpisah dari kode toko yang sering berubah
        manualChunks: { react: ["react", "react-dom"] },
      },
    },
  },
});
