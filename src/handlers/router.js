const db = require("../services/supabase");
const { sendMessage } = require("../services/whatsapp");
const { sendMainMenu, handleMenuOption } = require("./menu");
const { startRegistration, handleRegistrationStep, STEPS: REG_STEPS } = require("./registration");
const { startCancellation, handleCancellationStep } = require("./cancellation");
const { startRenewal, handleRenewalStep, confirmRenewal } = require("./payments");

// Palabras clave globales que reinician el flujo
const RESET_KEYWORDS = ["hola", "menu", "menú", "inicio", "start", "ayuda", "help", "hi", "buenas"];

async function handleIncomingMessage(phone, text, messageType) {
  try {
    // Normalizar texto
    const normalizedText = text?.trim() || "";

    // Obtener socio y conversación en paralelo
    const [member, conversation] = await Promise.all([
      db.getMemberByPhone(phone),
      db.getConversation(phone),
    ]);

    // ── Palabras clave globales → reset al menú principal ──────────────────
    if (RESET_KEYWORDS.includes(normalizedText.toLowerCase())) {
      await db.clearConversation(phone);
      await sendMainMenu(phone, member);
      return;
    }

    // ── Atajos directos sin importar el estado ─────────────────────────────
    const shortcuts = {
      alta: () => startRegistration(phone),
      registro: () => startRegistration(phone),
      baja: () => startCancellation(phone, member),
      renovar: () => startRenewal(phone, member),
      renovación: () => startRenewal(phone, member),
      renovacion: () => startRenewal(phone, member),
      estado: () => require("./menu").sendStatus(phone, member),
      pagos: () => require("./menu").sendStatus(phone, member),
    };

    if (shortcuts[normalizedText.toLowerCase()]) {
      await db.clearConversation(phone);
      await shortcuts[normalizedText.toLowerCase()]();
      return;
    }

    // ── Sin conversación activa → menú principal ───────────────────────────
    if (!conversation) {
      await sendMainMenu(phone, member);
      return;
    }

    const { state, context } = conversation;

    // ── Flujos activos ─────────────────────────────────────────────────────

    // Registro
    if (Object.values(REG_STEPS).includes(state)) {
      await handleRegistrationStep(phone, normalizedText, conversation);
      return;
    }

    // Cancelación
    if (state === "cancellation_confirm") {
      await handleCancellationStep(phone, normalizedText);
      return;
    }

    // Renovación - elegir plan
    if (state === "renewal_choose_plan") {
      await handleRenewalStep(phone, normalizedText, member);
      return;
    }

    // Renovación - confirmar
    if (state === "renewal_confirm") {
      if (normalizedText === "renew_ok" || normalizedText.toLowerCase() === "confirmar" || normalizedText.toLowerCase() === "sí" || normalizedText.toLowerCase() === "si") {
        await confirmRenewal(phone, member, context.plan);
      } else if (normalizedText === "renew_cancel" || normalizedText.toLowerCase() === "cancelar" || normalizedText.toLowerCase() === "no") {
        await db.clearConversation(phone);
        await sendMessage(phone, "❌ Renovación cancelada. Escribe *hola* para volver al menú.");
      } else {
        await handleRenewalStep(phone, normalizedText, member);
      }
      return;
    }

    // Menú (opciones de lista/botones)
    if (state === "menu") {
      await handleMenuOption(phone, normalizedText, member);
      return;
    }

    // ── Fallback: volver al menú ───────────────────────────────────────────
    await sendMainMenu(phone, member);
  } catch (err) {
    console.error(`Error procesando mensaje de ${phone}:`, err);
    await sendMessage(
      phone,
      "⚠️ Ha ocurrido un error inesperado. Por favor, escribe *hola* para volver al menú o contacta con recepción."
    );
  }
}

module.exports = { handleIncomingMessage };
