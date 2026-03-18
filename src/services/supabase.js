const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── SOCIOS ────────────────────────────────────────────────────────────────

async function getMemberByPhone(phone) {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("phone", phone)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

async function createMember({ phone, name, email, plan }) {
  const dayjs = require("dayjs");
  const startDate = dayjs().format("YYYY-MM-DD");
  const endDate = dayjs().add(1, "month").format("YYYY-MM-DD");

  const { data, error } = await supabase
    .from("members")
    .insert([{ phone, name, email, plan, status: "active", start_date: startDate, end_date: endDate }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateMember(phone, updates) {
  const { data, error } = await supabase
    .from("members")
    .update(updates)
    .eq("phone", phone)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function cancelMember(phone) {
  return updateMember(phone, { status: "cancelled", end_date: new Date().toISOString().split("T")[0] });
}

async function renewMember(phone) {
  const dayjs = require("dayjs");
  const member = await getMemberByPhone(phone);
  const newEnd = dayjs(member.end_date).add(1, "month").format("YYYY-MM-DD");
  return updateMember(phone, { status: "active", end_date: newEnd });
}

// ─── PAGOS ─────────────────────────────────────────────────────────────────

const PLAN_PRICES = {
  mensual: 35,
  trimestral: 90,
  anual: 300,
};

async function createPayment({ memberId, phone, plan, method = "pendiente" }) {
  const amount = PLAN_PRICES[plan] || 35;
  const { data, error } = await supabase
    .from("payments")
    .insert([{
      member_id: memberId,
      phone,
      amount,
      plan,
      method,
      status: "pending",
      payment_date: new Date().toISOString().split("T")[0],
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function confirmPayment(paymentId, method) {
  const { data, error } = await supabase
    .from("payments")
    .update({ status: "paid", method })
    .eq("id", paymentId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getPaymentsByPhone(phone) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("phone", phone)
    .order("payment_date", { ascending: false })
    .limit(5);
  if (error) throw error;
  return data || [];
}

// ─── CONVERSACIONES (estado de la conversación) ────────────────────────────

async function getConversation(phone) {
  const { data } = await supabase
    .from("conversations")
    .select("*")
    .eq("phone", phone)
    .single();
  return data;
}

async function setConversation(phone, state, context = {}) {
  const { data, error } = await supabase
    .from("conversations")
    .upsert({ phone, state, context, updated_at: new Date().toISOString() }, { onConflict: "phone" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function clearConversation(phone) {
  await supabase.from("conversations").delete().eq("phone", phone);
}

module.exports = {
  getMemberByPhone,
  createMember,
  updateMember,
  cancelMember,
  renewMember,
  createPayment,
  confirmPayment,
  getPaymentsByPhone,
  getConversation,
  setConversation,
  clearConversation,
  PLAN_PRICES,
};
