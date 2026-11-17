import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Halaman internal crew: /review (atau #review). Dimuat terpisah supaya halaman toko tetap ringan.
const Review = lazy(() => import("./Review.jsx"));
const isReview = window.location.pathname.replace(/\/$/, "") === "/review" || window.location.hash === "#review";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isReview ? <Suspense fallback={<div className="min-h-screen bg-[#FBF7EF]" />}><Review /></Suspense> : <App />}
  </React.StrictMode>
);
