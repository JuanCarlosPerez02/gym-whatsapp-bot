const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

// Token simple firmado con la password (sin dependencias extra)
function makeToken(password) {
  const payload = Buffer.from(JSON.stringify({ pw: password, ts: Date.now() })).toString("base64");
  return payload;
}
function verifyToken(token, password) {
  try {
    const { pw } = JSON.parse(Buffer.from(token, "base64").toString());
    return pw === password;
  } catch { return false; }
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "");
  if (!token || !verifyToken(token, process.env.ADMIN_PASSWORD || "admin123")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

// ─── LOGIN ────────────────────────────────────────────────────────────────
router.post("/login", (req, res) => {
  const { password } = req.body;
  const adminPw = process.env.ADMIN_PASSWORD || "admin123";
  if (password !== adminPw) return res.status(401).json({ error: "Wrong password" });
  res.json({ token: makeToken(password), gymName: process.env.GYM_NAME || "GymBot" });
});

// ─── STATS ────────────────────────────────────────────────────────────────
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const sb = getSupabase();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const in7days = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];

    const [membersRes, newRes, revenueRes, expiringRes] = await Promise.all([
      sb.from("members").select("id", { count: "exact" }).eq("status", "active"),
      sb.from("members").select("id", { count: "exact" }).gte("created_at", startOfMonth),
      sb.from("payments").select("amount").eq("status", "paid").gte("created_at", startOfMonth),
      sb.from("members").select("id", { count: "exact" }).eq("status", "active").lte("end_date", in7days).gte("end_date", now.toISOString().split("T")[0]),
    ]);

    const revenue = (revenueRes.data || []).reduce((sum, p) => sum + Number(p.amount), 0);

    res.json({
      activeMembers: membersRes.count || 0,
      newThisMonth: newRes.count || 0,
      revenueThisMonth: revenue,
      expiringThisWeek: expiringRes.count || 0,
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── MEMBERS ──────────────────────────────────────────────────────────────
router.get("/members", authMiddleware, async (req, res) => {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("members")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PAYMENTS ─────────────────────────────────────────────────────────────
router.get("/payments", authMiddleware, async (req, res) => {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── CONFIRM PAYMENT MANUALLY ─────────────────────────────────────────────
router.post("/payments/:id/confirm", authMiddleware, async (req, res) => {
  try {
    const sb = getSupabase();
    const { id } = req.params;
    const { data: payment } = await sb.from("payments").select("*").eq("id", id).single();
    if (!payment) return res.status(404).json({ error: "Payment not found" });

    await sb.from("payments").update({ status: "paid", method: "manual" }).eq("id", id);
    await require("../services/supabase").renewMember(payment.phone);

    // Notificar al socio
    const { sendMessage } = require("../services/whatsapp");
    await sendMessage(payment.phone,
      `✅ *¡Pago confirmado!*\n\n💶 ${payment.amount}€ — Plan ${payment.plan}\n\n¡Gracias y a entrenar! 💪 — ${process.env.GYM_NAME || "El Gimnasio"}`
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ─── SERVE ADMIN HTML ─────────────────────────────────────────────────────
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../admin/index.html"));
});

module.exports = router;
