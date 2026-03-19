require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { handleIncomingMessage } = require("./handlers/router");
const { constructEvent, handleCheckoutCompleted } = require("./services/stripe");
const path = require("path");
const adminRouter = require("./routes/admin");

const app = express();
app.use(cors());

// ⚠️ El webhook de Stripe necesita el body RAW (sin parsear)
// Por eso registramos el parser JSON DESPUÉS del endpoint de Stripe
app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn("STRIPE_WEBHOOK_SECRET no configurado, ignorando webhook");
    return res.sendStatus(200);
  }

  let event;
  try {
    event = constructEvent(req.body, sig);
  } catch (err) {
    console.error("Webhook Stripe inválido:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Confirmar recepción inmediatamente
  res.sendStatus(200);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "checkout.session.expired":
        console.log("Sesión Stripe expirada:", event.data.object.id);
        // Opcional: notificar al socio que el link ha expirado
        break;
      default:
        console.log(`Evento Stripe ignorado: ${event.type}`);
    }
  } catch (err) {
    console.error("Error procesando evento Stripe:", err);
  }
});

// Parser JSON para el resto de rutas
app.use(express.json());

// ─── ADMIN PANEL
app.use("/admin", adminRouter);

// ─── HEALTH CHECK ──────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", bot: process.env.GYM_NAME || "Gym Bot", uptime: process.uptime() });
});

// ─── PÁGINAS DE RESULTADO PAGO ────────────────────────────────────────────
app.get("/payment/success", (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pago completado</title>
  <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0fdf4;}
  .box{text-align:center;padding:2rem;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:380px;}
  h1{color:#16a34a;font-size:2rem;margin:.5rem 0;} p{color:#555;margin:.5rem 0;} .emoji{font-size:3rem;}</style></head>
  <body><div class="box"><div class="emoji">✅</div><h1>¡Pago completado!</h1>
  <p>Tu suscripción se ha activado correctamente.</p>
  <p>Recibirás confirmación por WhatsApp en breve.</p>
  <p style="margin-top:1.5rem;color:#16a34a;font-weight:600;">¡A entrenar! 💪</p></div></body></html>`);
});

app.get("/payment/cancel", (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pago cancelado</title>
  <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef2f2;}
  .box{text-align:center;padding:2rem;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:380px;}
  h1{color:#dc2626;font-size:2rem;margin:.5rem 0;} p{color:#555;margin:.5rem 0;} .emoji{font-size:3rem;}</style></head>
  <body><div class="box"><div class="emoji">❌</div><h1>Pago cancelado</h1>
  <p>El pago no se ha completado. Puedes intentarlo de nuevo respondiendo al WhatsApp del gimnasio.</p></div></body></html>`);
});

// ─── WEBHOOK WHATSAPP ─────────────────────────────────────────────────────
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ Webhook verificado por Meta");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    const phone = message.from;
    let text = "";

    switch (message.type) {
      case "text": text = message.text?.body || ""; break;
      case "interactive":
        text = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || ""; break;
      case "image": case "document": text = "__comprobante__"; break;
      default: text = message.text?.body || "";
    }

    if (!phone || !text) return;
    console.log(`📩 ${phone}: "${text}"`);

    if (text === "__comprobante__") {
      const { sendMessage } = require("./services/whatsapp");
      await sendMessage(phone, "📸 ¡Comprobante recibido! Lo revisaremos y confirmaremos tu pago en breve. ¡Gracias! 💪");
      return;
    }

    await handleIncomingMessage(phone, text, message.type);
  } catch (err) {
    console.error("Error en webhook:", err);
  }
});

// ─── ARRANQUE ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
🤖 ${process.env.GYM_NAME || "Gym"} WhatsApp Bot
🚀 Puerto ${PORT}
💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? "✅ configurado" : "⚠️ no configurado (modo manual)"}
🔗 Webhook WhatsApp: /webhook
🔗 Webhook Stripe:   /stripe/webhook
🔗 Panel admin:      /admin
  `);
});
