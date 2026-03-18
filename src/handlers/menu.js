const { sendMessage, sendButtons, sendList } = require("../services/whatsapp");
const db = require("../services/supabase");
const dayjs = require("dayjs");

const GYM = process.env.GYM_NAME || "El Gimnasio";

// ─── MENÚ PRINCIPAL ────────────────────────────────────────────────────────

async function sendMainMenu(phone, member = null) {
  const greeting = member
    ? `¡Hola de nuevo, *${member.name.split(" ")[0]}*! 👋`
    : `¡Bienvenido/a a *${GYM}*! 💪`;

  if (!member) {
    await sendButtons(phone, `${greeting}\n\n¿Qué quieres hacer?`, [
      { id: "menu_alta", title: "📋 Darme de alta" },
      { id: "menu_info", title: "ℹ️ Más información" },
      { id: "menu_contacto", title: "📞 Contactar" },
    ]);
  } else {
    const statusEmoji = member.status === "active" ? "✅" : "⚠️";
    const expiry = dayjs(member.end_date).format("DD/MM/YYYY");
    const daysLeft = dayjs(member.end_date).diff(dayjs(), "day");

    let statusText = `${statusEmoji} Estado: *${member.status === "active" ? "Activo" : "Cancelado"}*`;
    if (member.status === "active") {
      statusText += `\n📅 Válido hasta: *${expiry}*`;
      if (daysLeft <= 7) statusText += `\n⚠️ ¡Solo quedan ${daysLeft} días!`;
    }

    await sendList(
      phone,
      `${greeting}`,
      `${statusText}\n\n¿Qué necesitas hoy?`,
      "Ver opciones",
      [
        {
          title: "Mi cuenta",
          rows: [
            { id: "menu_renovar", title: "🔄 Renovar mensualidad", description: "Pagar y renovar tu cuota" },
            { id: "menu_estado", title: "📊 Ver mi estado", description: "Cuota, pagos y datos" },
            { id: "menu_baja", title: "❌ Darme de baja", description: "Cancelar mi suscripción" },
          ],
        },
        {
          title: "Información",
          rows: [
            { id: "menu_horarios", title: "🕐 Horarios", description: "Horario del gimnasio" },
            { id: "menu_tarifas", title: "💶 Tarifas", description: "Precios y planes" },
            { id: "menu_contacto", title: "📞 Contactar", description: "Hablar con un humano" },
          ],
        },
      ]
    );
  }

  await db.setConversation(phone, "menu");
}

// ─── ROUTER PRINCIPAL ──────────────────────────────────────────────────────

async function handleMenuOption(phone, option, member) {
  switch (option) {
    case "menu_alta":
      return require("./registration").startRegistration(phone);

    case "menu_renovar":
      return require("./payments").startRenewal(phone, member);

    case "menu_baja":
      return require("./cancellation").startCancellation(phone, member);

    case "menu_estado":
      return sendStatus(phone, member);

    case "menu_horarios":
      return sendMessage(
        phone,
        `🕐 *Horarios de ${GYM}*\n\nLunes a Viernes: 7:00 - 22:00\nSábado: 9:00 - 14:00\nDomingo: Cerrado\n\n¡Te esperamos! 💪`
      );

    case "menu_tarifas":
      return sendMessage(
        phone,
        `💶 *Tarifas de ${GYM}*\n\n📅 Mensual: *35€/mes*\n📅 Trimestral: *90€* (ahorra 15€)\n📅 Anual: *300€* (ahorra 120€)\n\nTodos los planes incluyen acceso completo a instalaciones.\n\nEscribe *alta* para apuntarte 👇`
      );

    case "menu_contacto":
      return sendMessage(
        phone,
        `📞 *Contacto ${GYM}*\n\nTeléfono: ${process.env.GYM_PHONE || "+34600000000"}\nEmail: info@${GYM.toLowerCase().replace(/\s/g, "")}.com\n\nO responde aquí y te contestamos en breve 😊`
      );

    case "menu_info":
      return sendMessage(
        phone,
        `ℹ️ *${GYM}* — Tu gimnasio de confianza 💪\n\n🏋️ Sala de musculación completa\n🧘 Clases dirigidas\n🚿 Vestuarios con taquillas\n🅿️ Parking gratuito\n\nEscribe *alta* para apuntarte o *tarifas* para ver precios.`
      );

    default:
      await sendMainMenu(phone, member);
  }
}

// ─── ESTADO DEL SOCIO ─────────────────────────────────────────────────────

async function sendStatus(phone, member) {
  const payments = await db.getPaymentsByPhone(phone);
  const expiry = dayjs(member.end_date).format("DD/MM/YYYY");
  const daysLeft = dayjs(member.end_date).diff(dayjs(), "day");

  let msg = `📊 *Tu estado en ${GYM}*\n\n`;
  msg += `👤 Nombre: ${member.name}\n`;
  msg += `📱 Teléfono: ${member.phone}\n`;
  msg += `📋 Plan: ${member.plan}\n`;
  msg += `✅ Estado: ${member.status === "active" ? "Activo" : "Cancelado"}\n`;
  msg += `📅 Vence: ${expiry}`;
  if (daysLeft >= 0) msg += ` (${daysLeft} días)`;
  msg += `\n\n`;

  if (payments.length > 0) {
    msg += `💳 *Últimos pagos:*\n`;
    payments.slice(0, 3).forEach((p) => {
      const icon = p.status === "paid" ? "✅" : "⏳";
      msg += `${icon} ${p.payment_date} — ${p.amount}€ (${p.plan})\n`;
    });
  }

  await sendMessage(phone, msg);
  await db.setConversation(phone, "menu");
}

module.exports = { sendMainMenu, handleMenuOption, sendStatus };
