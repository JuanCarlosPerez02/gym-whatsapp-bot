const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const db = require("./supabase");

// Precio en céntimos para Stripe
const PLAN_CENTS = {
  mensual:     3500,   // 35€
  trimestral:  9000,   // 90€
  anual:      30000,   // 300€
};

const PLAN_LABELS = {
  mensual:    "Cuota mensual",
  trimestral: "Cuota trimestral",
  anual:      "Cuota anual",
};

// ─── CREAR PAYMENT LINK ────────────────────────────────────────────────────
// Genera un link de pago único para un socio+plan concreto.
// Stripe redirige a success_url con {CHECKOUT_SESSION_ID} cuando paga.

async function createPaymentLink({ phone, memberId, plan, memberName }) {
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "eur",
          unit_amount: PLAN_CENTS[plan],
          product_data: {
            name: `${process.env.GYM_NAME || "Gimnasio"} — ${PLAN_LABELS[plan]}`,
            description: `Socio: ${memberName}`,
          },
        },
        quantity: 1,
      },
    ],
    // Metadata que recibiremos en el webhook para identificar al socio
    metadata: {
      phone,
      member_id: memberId,
      plan,
    },
    // URL de éxito (puedes personalizar)
    success_url: `${process.env.APP_URL || "https://tu-app.onrender.com"}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${process.env.APP_URL || "https://tu-app.onrender.com"}/payment/cancel`,
    // Expira en 30 minutos
    expires_at: Math.floor(Date.now() / 1000) + 1800,
    // Pre-rellenar email si lo tenemos
    customer_email: undefined, // puedes pasar member.email aquí
  });

  return {
    url: session.url,
    sessionId: session.id,
  };
}

// ─── VERIFICAR WEBHOOK DE STRIPE ──────────────────────────────────────────
// Stripe firma cada evento. Verificamos la firma antes de procesar nada.

function constructEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

// ─── PROCESAR PAGO COMPLETADO ─────────────────────────────────────────────

async function handleCheckoutCompleted(session) {
  const { phone, member_id, plan } = session.metadata;

  if (!phone || !plan) {
    console.error("Webhook sin metadata válida:", session.id);
    return;
  }

  // Registrar pago en Supabase
  await db.createPayment({
    memberId: member_id,
    phone,
    plan,
    method: "stripe",
  });

  // Renovar/activar al socio
  await db.renewMember(phone);

  // Confirmar el pago en la tabla de payments (buscar el último pendiente)
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  await supabase
    .from("payments")
    .update({ status: "paid", method: "stripe" })
    .eq("phone", phone)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  // Notificar al socio por WhatsApp
  const { sendMessage } = require("./whatsapp");
  const dayjs = require("dayjs");
  const member = await db.getMemberByPhone(phone);
  const expiry = dayjs(member?.end_date).format("DD/MM/YYYY");

  await sendMessage(
    phone,
    `✅ *¡Pago confirmado!*\n\n` +
    `💶 Importe: *${PLAN_CENTS[plan] / 100}€* — Plan ${plan}\n` +
    `📅 Tu suscripción está activa hasta el *${expiry}*\n\n` +
    `¡Gracias y a entrenar! 💪 — ${process.env.GYM_NAME || "El Gimnasio"}`
  );

  console.log(`✅ Pago Stripe confirmado: ${phone} | ${plan} | sesión ${session.id}`);
}

module.exports = { createPaymentLink, constructEvent, handleCheckoutCompleted };
