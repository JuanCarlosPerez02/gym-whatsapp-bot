const { sendMessage, sendButtons } = require("../services/whatsapp");
const db = require("../services/supabase");
const dayjs = require("dayjs");

async function startCancellation(phone, member) {
  if (!member || member.status !== "active") {
    await sendMessage(phone, "ℹ️ No tienes ninguna suscripción activa en este momento.");
    await db.clearConversation(phone);
    return;
  }

  const expiry = dayjs(member.end_date).format("DD/MM/YYYY");

  await sendButtons(
    phone,
    `⚠️ *¿Seguro que quieres darte de baja?*\n\n` +
    `Tu suscripción está activa hasta el *${expiry}*.\n\n` +
    `Si te das de baja, perderás el acceso al finalizar tu período actual. No se realizará ningún cargo más.`,
    [
      { id: "cancel_confirm", title: "❌ Sí, darme de baja" },
      { id: "cancel_abort", title: "🔙 No, volver" },
    ]
  );

  await db.setConversation(phone, "cancellation_confirm");
}

async function handleCancellationStep(phone, text) {
  const answer = text.toLowerCase();

  if (answer === "cancel_confirm" || answer === "sí" || answer === "si" || answer === "baja") {
    await db.cancelMember(phone);
    await sendMessage(
      phone,
      `✅ *Baja tramitada.*\n\nSentimos que te vayas. Tu acceso seguirá activo hasta la fecha de vencimiento.\n\n` +
      `Si cambias de opinión, escribe *alta* para volver a suscribirte. ¡Siempre serás bienvenido/a! 💪\n\n` +
      `— El equipo de ${process.env.GYM_NAME || "el gimnasio"}`
    );
    await db.clearConversation(phone);
  } else if (answer === "cancel_abort" || answer === "no" || answer === "volver") {
    await sendMessage(phone, "✅ ¡Perfecto! Suscripción mantenida. Escribe *hola* para ver el menú.");
    await db.clearConversation(phone);
  } else {
    await sendButtons(
      phone,
      "¿Confirmas que quieres darte de baja?",
      [
        { id: "cancel_confirm", title: "❌ Sí, darme de baja" },
        { id: "cancel_abort", title: "🔙 No, volver" },
      ]
    );
  }
}

module.exports = { startCancellation, handleCancellationStep };
