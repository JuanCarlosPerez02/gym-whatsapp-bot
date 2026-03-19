const db = require("../services/supabase");
const { sendMessage } = require("../services/whatsapp");
const { sendMainMenu, handleMenuOption } = require("./menu");
const { startRegistration, handleRegistrationStep, STEPS: REG_STEPS } = require("./registration");
const { startCancellation, handleCancellationStep } = require("./cancellation");
const { startRenewal, handleRenewalStep, confirmRenewal } = require("./payments");
const { startChangePlan, handleChangePlanStep, confirmChangePlan } = require("./changePlan");

const RESET_KEYWORDS = [
  "hola","buenas","menu","menú","inicio","ayuda","empezar","comenzar","ey","hey",
  "hi","hello","help","start","home","bonjour","salut","olá","ola","oi","hallo","👋",
];

async function handleIncomingMessage(phone, text, messageType) {
  try {
    const normalizedText = (text?.trim() || "");
    const lowerText = normalizedText.toLowerCase();

    const [member, conversation] = await Promise.all([
      db.getMemberByPhone(phone),
      db.getConversation(phone),
    ]);

    if (RESET_KEYWORDS.includes(lowerText)) {
      await db.clearConversation(phone);
      await sendMainMenu(phone, member);
      return;
    }

    const shortcuts = {
      alta:         () => startRegistration(phone),
      registro:     () => startRegistration(phone),
      baja:         () => startCancellation(phone, member),
      renovar:      () => startRenewal(phone, member),
      "renovación": () => startRenewal(phone, member),
      renovacion:   () => startRenewal(phone, member),
      estado:       () => require("./menu").sendStatus(phone, member),
      pagos:        () => require("./menu").sendStatus(phone, member),
      "cambiar plan": () => startChangePlan(phone, member),
      cambio:       () => startChangePlan(phone, member),
    };

    if (shortcuts[lowerText]) {
      await db.clearConversation(phone);
      await shortcuts[lowerText]();
      return;
    }

    if (!conversation) {
      await sendMainMenu(phone, member);
      return;
    }

    const { state, context } = conversation;

    if (Object.values(REG_STEPS).includes(state)) {
      await handleRegistrationStep(phone, normalizedText, conversation);
      return;
    }
    if (state === "cancellation_confirm") {
      await handleCancellationStep(phone, normalizedText);
      return;
    }
    if (state === "renewal_choose_plan") {
      await handleRenewalStep(phone, normalizedText, member);
      return;
    }
    if (state === "renewal_confirm") {
      const yes = ["renew_ok","confirmar","sí","si"].includes(lowerText);
      const no  = ["renew_cancel","cancelar","no"].includes(lowerText);
      if (yes) await confirmRenewal(phone, member, context.plan);
      else if (no) { await db.clearConversation(phone); await sendMessage(phone, "❌ Renovación cancelada. Escribe *hola* para volver."); }
      else await handleRenewalStep(phone, normalizedText, member);
      return;
    }
    if (state === "changeplan_choose") {
      await handleChangePlanStep(phone, normalizedText, member);
      return;
    }
    if (state === "changeplan_confirm") {
      const yes = ["changeplan_yes","confirmar","sí","si"].includes(lowerText);
      const no  = ["changeplan_no","cancelar","no"].includes(lowerText);
      if (yes) await confirmChangePlan(phone, member, context.newPlan);
      else if (no) { await db.clearConversation(phone); await sendMessage(phone, "❌ Cambio cancelado. Escribe *hola* para volver."); }
      else await handleChangePlanStep(phone, normalizedText, member);
      return;
    }
    if (state === "menu") {
      await handleMenuOption(phone, normalizedText, member);
      return;
    }

    await sendMainMenu(phone, member);
  } catch (err) {
    console.error(`Error procesando mensaje de ${phone}:`, err);
    await sendMessage(phone, "⚠️ Error inesperado. Escribe *hola* para volver al menú.");
  }
}

module.exports = { handleIncomingMessage };
