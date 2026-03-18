const { sendMessage, sendButtons, sendList } = require("../services/whatsapp");
const db = require("../services/supabase");

const STEPS = {
  ASK_NAME: "reg_ask_name",
  ASK_EMAIL: "reg_ask_email",
  ASK_PLAN: "reg_ask_plan",
  CONFIRM: "reg_confirm",
};

async function startRegistration(phone) {
  await sendMessage(
    phone,
    `📋 *¡Vamos a darte de alta!*\n\nEs muy rápido, solo necesito unos datos.\n\n¿Cuál es tu *nombre completo*?`
  );
  await db.setConversation(phone, STEPS.ASK_NAME, {});
}

async function handleRegistrationStep(phone, text, conversation) {
  const { state, context } = conversation;

  if (text.toLowerCase() === "cancelar") {
    await db.clearConversation(phone);
    await sendMessage(phone, "❌ Alta cancelada. Escribe *hola* para volver al menú.");
    return;
  }

  switch (state) {
    case STEPS.ASK_NAME: {
      const name = text.trim();
      if (name.length < 2) {
        await sendMessage(phone, "⚠️ Por favor, escribe tu nombre completo.");
        return;
      }
      await db.setConversation(phone, STEPS.ASK_EMAIL, { name });
      await sendMessage(phone, `✅ Perfecto, *${name}*.\n\nAhora dime tu *email* (para enviarte los justificantes de pago):`);
      break;
    }

    case STEPS.ASK_EMAIL: {
      const email = text.trim().toLowerCase();
      if (!isValidEmail(email)) {
        await sendMessage(phone, "⚠️ El email no parece válido. Inténtalo de nuevo:");
        return;
      }
      await db.setConversation(phone, STEPS.ASK_PLAN, { ...context, email });
      await sendList(
        phone,
        "💶 Elige tu plan",
        "¿Qué plan prefieres?",
        "Ver planes",
        [
          {
            title: "Planes disponibles",
            rows: [
              { id: "plan_mensual", title: "📅 Mensual — 35€", description: "Pago mes a mes, sin compromiso" },
              { id: "plan_trimestral", title: "📅 Trimestral — 90€", description: "3 meses, ahorra 15€" },
              { id: "plan_anual", title: "📅 Anual — 300€", description: "12 meses, ahorra 120€" },
            ],
          },
        ]
      );
      break;
    }

    case STEPS.ASK_PLAN: {
      const planMap = {
        plan_mensual: "mensual",
        plan_trimestral: "trimestral",
        plan_anual: "anual",
        mensual: "mensual",
        trimestral: "trimestral",
        anual: "anual",
      };
      const plan = planMap[text.toLowerCase()];
      if (!plan) {
        await sendMessage(phone, "⚠️ Elige una opción válida: *mensual*, *trimestral* o *anual*.");
        return;
      }
      const prices = db.PLAN_PRICES;
      await db.setConversation(phone, STEPS.CONFIRM, { ...context, plan });
      await sendButtons(
        phone,
        `📋 *Resumen del alta:*\n\n👤 Nombre: ${context.name}\n📧 Email: ${context.email}\n📋 Plan: ${plan} — ${prices[plan]}€\n\n¿Confirmas el alta?`,
        [
          { id: "reg_confirm_yes", title: "✅ Confirmar" },
          { id: "reg_confirm_no", title: "❌ Cancelar" },
        ]
      );
      break;
    }

    case STEPS.CONFIRM: {
      const answer = text.toLowerCase();
      if (answer === "reg_confirm_no" || answer === "no" || answer === "cancelar") {
        await db.clearConversation(phone);
        await sendMessage(phone, "❌ Alta cancelada. ¡Cuando quieras, aquí estaremos! Escribe *hola* para volver.");
        return;
      }
      if (answer === "reg_confirm_yes" || answer === "sí" || answer === "si" || answer === "confirmar") {
        await completeRegistration(phone, context);
        return;
      }
      await sendButtons(
        phone,
        "Por favor, confirma o cancela el alta:",
        [
          { id: "reg_confirm_yes", title: "✅ Confirmar" },
          { id: "reg_confirm_no", title: "❌ Cancelar" },
        ]
      );
      break;
    }
  }
}

async function completeRegistration(phone, context) {
  try {
    const member = await db.createMember({
      phone,
      name: context.name,
      email: context.email,
      plan: context.plan,
    });

    const prices = db.PLAN_PRICES;
    const amount = prices[context.plan];
    const useStripe = !!process.env.STRIPE_SECRET_KEY;

    // Mensaje de bienvenida
    await sendMessage(
      phone,
      `🎉 *¡Alta completada!* Bienvenido/a a ${process.env.GYM_NAME || "el gimnasio"}, *${context.name}*!\n\n` +
      `📋 Plan: ${context.plan} (${amount}€)\n` +
      `📅 Válido 1 mes desde hoy`
    );

    if (useStripe) {
      await sendMessage(phone, `⏳ Generando tu enlace de pago seguro...`);
      try {
        const { url } = await require("../services/stripe").createPaymentLink({
          phone,
          memberId: member.id,
          plan: context.plan,
          memberName: context.name,
        });

        await db.createPayment({ memberId: member.id, phone, plan: context.plan, method: "stripe_pending" });

        await sendMessage(
          phone,
          `💳 *Completa tu pago para activar el acceso:*\n\n${url}\n\n` +
          `🔒 Pago seguro con Stripe — Tarjeta de crédito/débito\n` +
          `⏱️ El enlace caduca en 30 minutos\n\n` +
          `¡Tu acceso se activará automáticamente al pagar! ✅`
        );
      } catch (e) {
        console.error("Error generando link Stripe:", e.message);
        await sendFallbackFirst(phone, member, context.plan, amount);
      }
    } else {
      await sendFallbackFirst(phone, member, context.plan, amount);
    }

    await db.clearConversation(phone);
  } catch (err) {
    console.error("Error completando alta:", err);
    await sendMessage(phone, "⚠️ Ha ocurrido un error al procesar tu alta. Por favor, contacta con recepción o inténtalo de nuevo.");
    await db.clearConversation(phone);
  }
}

async function sendFallbackFirst(phone, member, plan, amount) {
  const payment = await db.createPayment({ memberId: member.id, phone, plan });
  await sendMessage(
    phone,
    `💳 *Pago pendiente: ${amount}€*\n\n` +
    `Puedes pagar:\n` +
    `• En recepción en efectivo o tarjeta\n` +
    `• Por Bizum al ${process.env.GYM_PHONE || "+34600000000"} (concepto: tu nombre)\n\n` +
    `Mándanos el comprobante aquí y lo confirmamos al momento ✅\n` +
    `Referencia: #${payment.id.slice(0, 8).toUpperCase()}`
  );
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = { startRegistration, handleRegistrationStep, STEPS };
