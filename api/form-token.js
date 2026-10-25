// /api/form-token — memberi token bertanda tangan saat form dibuka.
// Token dipakai server untuk memastikan form benar-benar "dibuka dulu" lalu diisi manusia.
import { guard, issueFormToken } from "./_lib/security.js";

export default async function handler(req, res) {
  if (!(await guard(req, res, { bucket: "token", max: 20, windowMs: 10 * 60 * 1000, globalMax: 300, maxBytes: 1024 }))) return;
  return res.status(200).json({ token: issueFormToken() });
}
