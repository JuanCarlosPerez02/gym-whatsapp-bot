const { sendMessage, sendButtons, sendList } = require("../services/whatsapp");
const db = require("../services/supabase");
const stripeService = require("../services/stripe");
const dayjs = require("dayjs");

// ─── RENOVACIÓN ───────────────────────────────────────────────────────────

async function startRenewal(phone, member) {
  if (!member) {
    await sendMessage(phone, "⚠️ No encontramos tu cuenta. Escribe *alta* para registrarte.");
    return;
  }

  const expiry = dayjs(member.end_date).format("DD/MM/YYYY");
  const daysLeft = dayjs(member.end_date).diff(dayjs(), "day");
  const prices = db.PLAN_PRICES;

  let msg = `🔄 *Renovar suscripción*\n\n`;
  msg += `Tu cuota actual vence el *${expiry}*`;
  if (daysLeft <= 7 && daysLeft >= 0) msg += ` _(¡quedan ${daysLeft} días!)_`;
  msg += `\n\n¿Con qué plan quieres renovar?`;

  await sendList(
    phone,
    "🔄 Renovar suscripción",
    msg,
    "Elegir plan",
    [
      {
        title: "Planes de renovación",
        rows: [
          { id: "renew_mensual", title: `📅 Mensual — ${prices.mensual}€`, description: "30 días más" },
          { id: "renew_trimestral", title: `📅 Trimestral — ${prices.trimestral}€`, description: "3 meses, ahorra 15€" },
          { id: "renew_anual", title: `📅 Anual — ${prices.anual}€`, description: "12 meses, ahorra 120€" },
        ],
      },
    ]
  );

  await db.setConversation(phone, "renewal_choose_plan");
}

async function handleRenewalStep(phone, text, member) {
  const planMap = {
    renew_mensual: "mensual",
    renew_trimestral: "trimestral",
    renew_anual: "anual",
    mensual: "mensual",
    trimestral: "trimestral",
    anual: "anual",
  };

  const plan = planMap[text.toLowerCase()];

  if (!plan) {
    await sendMessage(phone, "⚠️ Elige un plan válido: *mensual*, *trimestral* o *anual*.");
    return;
  }

  const prices = db.PLAN_PRICES;
  const amount = prices[plan];

  await db.setConversation(phone, "renewal_confirm", { plan });

  await sendButtons(
    phone,
    `📋 *Resumen de renovación:*\n\n📋 Plan: ${plan}\n💶 Importe: *${amount}€*\n\n¿Confirmas?`,
    [
      { id: "renew_ok", title: "✅ Confirmar" },
      { id: "renew_cancel", title: "❌ Cancelar" },
    ]
  );
}

async function confirmRenewal(phone, member, plan) {
  try {
    const prices = db.PLAN_PRICES;
    const amount = prices[plan];

    // Intentar generar link de pago Stripe
    const useStripe = !!process.env.STRIPE_SECRET_KEY;

    if (useStripe) {
      await sendMessage(phone, `⏳ Generando tu enlace de pago seguro...`);

      try {
        const { url, sessionId } = await stripeService.createPaymentLink({
          phone,
          memberId: member.id,
          plan,
          memberName: member.name,
        });

        // Guardar pago pendiente con sessionId en notas
        await db.createPayment({
          memberId: member.id,
          phone,
          plan,
          method: "stripe_pending",
        });

        await sendMessage(
          phone,
          `💳 *Enlace de pago seguro generado*\n\n` +
          `💶 Importe: *${amount}€* — Plan ${plan}\n\n` +
          `👇 *Pulsa para pagar con tarjeta:*\n${url}\n\n` +
          `🔒 Pago 100% seguro con Stripe\n` +
          `⏱️ El enlace caduca en 30 minutos\n\n` +
          `En cuanto pagues, tu suscripción se activa automáticamente ✅`
        );
      } catch (stripeErr) {
        console.error("Error Stripe, usando pago manual:", stripeErr.message);
        await sendFallbackPayment(phone, member, plan, amount);
      }
    } else {
      // Sin Stripe configurado → pago manual (Bizum/efectivo)
      await sendFallbackPayment(phone, member, plan, amount);
    }

    await db.clearConversation(phone);
  } catch (err) {
    console.error("Error en renovación:", err);
    await sendMessage(phone, "⚠️ Error procesando la renovación. Por favor, inténtalo de nuevo o contacta con recepción.");
    await db.clearConversation(phone);
  }
}

async function sendFallbackPayment(phone, member, plan, amount) {
  const payment = await db.createPayment({ memberId: member.id, phone, plan });
  await sendMessage(
    phone,
    `🎉 *¡Renovación registrada!*\n\n` +
    `💶 Importe: *${amount}€*\n` +
    `🔖 Referencia: #${payment.id.slice(0, 8).toUpperCase()}\n\n` +
    `💳 *Métodos de pago:*\n` +
    `• En recepción (efectivo o tarjeta)\n` +
    `• Bizum al ${process.env.GYM_PHONE || "+34600000000"} (concepto: tu nombre + ref)\n\n` +
    `Cuando pagues, mándanos el comprobante y lo activamos al momento ✅`
  );
}

// ─── CONFIRMACIÓN DE PAGO (admin o comprobante) ───────────────────────────

async function handlePaymentConfirmation(phone, paymentRef) {
  // Esta función sería llamada por un admin para confirmar un pago
  // En producción se conectaría con Stripe/TPV
  const member = await db.getMemberByPhone(phone);
  if (!member) return;

  await db.renewMember(phone);

  const expiry = dayjs(member.end_date).add(1, "month").format("DD/MM/YYYY");

  await sendMessage(
    phone,
    `✅ *¡Pago confirmado!*\n\n` +
    `Tu suscripción ha sido renovada hasta el *${expiry}*.\n\n` +
    `¡Gracias y a entrenar! 💪 — ${process.env.GYM_NAME || "El Gimnasio"}`
  );
}

module.exports = { startRenewal, handleRenewalStep, confirmRenewal, handlePaymentConfirmation };
