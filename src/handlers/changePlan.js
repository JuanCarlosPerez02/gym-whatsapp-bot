const { sendMessage, sendButtons, sendList } = require("../services/whatsapp");
const db = require("../services/supabase");

const PLAN_LABELS = {
  mensual: "Mensual — 35€/mes",
  trimestral: "Trimestral — 90€/3 meses",
  anual: "Anual — 300€/año",
};

async function startChangePlan(phone, member) {
  if (!member || member.status !== "active") {
    await sendMessage(phone, "⚠️ Necesitas tener una suscripción activa para cambiar de plan.");
    return;
  }

  const otherPlans = Object.keys(PLAN_LABELS).filter(p => p !== member.plan);

  await sendList(
    phone,
    "🔄 Cambiar de plan",
    `Actualmente estás en el plan *${member.plan}*.\n\n¿A qué plan quieres cambiar?`,
    "Ver planes",
    [{
      title: "Planes disponibles",
      rows: otherPlans.map(plan => ({
        id: `changeplan_${plan}`,
        title: `📅 ${PLAN_LABELS[plan]}`,
        description: plan === "trimestral"
          ? "Ahorra 15€ respecto al mensual"
          : plan === "anual"
          ? "Ahorra 120€, la opción más económica"
          : "Flexibilidad total, mes a mes",
      })),
    }]
  );

  await db.setConversation(phone, "changeplan_choose");
}

async function handleChangePlanStep(phone, text, member) {
  const planMap = {
    changeplan_mensual: "mensual",
    changeplan_trimestral: "trimestral",
    changeplan_anual: "anual",
    mensual: "mensual",
    trimestral: "trimestral",
    anual: "anual",
  };

  if (text.toLowerCase() === "cancelar") {
    await db.clearConversation(phone);
    await sendMessage(phone, "❌ Cambio de plan cancelado. Escribe *hola* para volver al menú.");
    return;
  }

  const newPlan = planMap[text.toLowerCase()];

  if (!newPlan) {
    await sendMessage(phone, "⚠️ Opción no válida. Elige *mensual*, *trimestral* o *anual*.");
    return;
  }

  if (newPlan === member.plan) {
    await sendMessage(phone, `ℹ️ Ya estás en el plan *${member.plan}*. Elige otro plan diferente.`);
    return;
  }

  await db.setConversation(phone, "changeplan_confirm", { newPlan });

  const prices = db.PLAN_PRICES;
  const useStripe = !!process.env.STRIPE_SECRET_KEY;
  const paymentNote = useStripe
    ? "El pago se procesará con Stripe de forma segura."
    : `El pago de ${prices[newPlan]}€ puedes hacerlo en recepción o por Bizum.`;

  await sendButtons(
    phone,
    `📋 *Resumen del cambio:*\n\n` +
    `📌 Plan actual: *${member.plan}*\n` +
    `✅ Plan nuevo: *${newPlan}* — ${prices[newPlan]}€\n\n` +
    `${paymentNote}\n\n` +
    `El cambio se aplica a partir de ahora.`,
    [
      { id: "changeplan_yes", title: "✅ Confirmar cambio" },
      { id: "changeplan_no", title: "❌ Cancelar" },
    ]
  );
}

async function confirmChangePlan(phone, member, newPlan) {
  try {
    const useStripe = !!process.env.STRIPE_SECRET_KEY;

    // Actualizar plan en BD
    await db.updateMember(phone, { plan: newPlan });

    if (useStripe) {
      const { createPaymentLink } = require("../services/stripe");
      await sendMessage(phone, `⏳ Generando enlace de pago seguro...`);

      try {
        const { url } = await createPaymentLink({
          phone,
          memberId: member.id,
          plan: newPlan,
          memberName: member.name,
        });

        await db.createPayment({ memberId: member.id, phone, plan: newPlan, method: "stripe_pending" });

        await sendMessage(
          phone,
          `✅ *¡Plan cambiado a ${newPlan}!*\n\n` +
          `💳 Completa el pago para activarlo:\n${url}\n\n` +
          `🔒 Pago seguro con Stripe · ⏱️ Caduca en 30 min`
        );
      } catch (e) {
        await sendFallback(phone, member, newPlan);
      }
    } else {
      await sendFallback(phone, member, newPlan);
    }

    await db.clearConversation(phone);
  } catch (err) {
    console.error("Error cambiando plan:", err);
    await sendMessage(phone, "⚠️ Error procesando el cambio. Inténtalo de nuevo o contacta con recepción.");
    await db.clearConversation(phone);
  }
}

async function sendFallback(phone, member, newPlan) {
  const prices = db.PLAN_PRICES;
  const payment = await db.createPayment({ memberId: member.id, phone, plan: newPlan });
  await sendMessage(
    phone,
    `✅ *¡Plan cambiado a ${newPlan}!*\n\n` +
    `💶 Importe: *${prices[newPlan]}€*\n` +
    `🔖 Ref: #${payment.id.slice(0, 8).toUpperCase()}\n\n` +
    `Paga en recepción o por Bizum al ${process.env.GYM_PHONE || "+34600000000"} y mándanos el comprobante ✅`
  );
}

module.exports = { startChangePlan, handleChangePlanStep, confirmChangePlan };
