const axios = require("axios");

const BASE_URL = "https://graph.facebook.com/v19.0";

async function sendMessage(to, text) {
  try {
    await axios.post(
      `${BASE_URL}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("Error enviando mensaje:", err.response?.data || err.message);
    throw err;
  }
}

async function sendButtons(to, text, buttons) {
  // buttons: [{ id: "btn_id", title: "Texto botón" }] (máx 3)
  try {
    await axios.post(
      `${BASE_URL}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text },
          action: {
            buttons: buttons.map((b) => ({
              type: "reply",
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("Error enviando botones:", err.response?.data || err.message);
    // Fallback a texto plano si falla
    await sendMessage(to, text);
  }
}

async function sendList(to, header, body, buttonText, sections) {
  try {
    await axios.post(
      `${BASE_URL}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: header },
          body: { text: body },
          action: {
            button: buttonText,
            sections,
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("Error enviando lista:", err.response?.data || err.message);
    await sendMessage(to, body);
  }
}

module.exports = { sendMessage, sendButtons, sendList };
