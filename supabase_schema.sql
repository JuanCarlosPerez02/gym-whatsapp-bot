-- ============================================================
-- GYM WHATSAPP BOT — SCHEMA SUPABASE
-- Ejecuta esto en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- SOCIOS
CREATE TABLE IF NOT EXISTS members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  email        TEXT,
  plan         TEXT NOT NULL DEFAULT 'mensual',   -- mensual | trimestral | anual
  status       TEXT NOT NULL DEFAULT 'active',    -- active | cancelled | suspended
  start_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date     DATE NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- PAGOS
CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID REFERENCES members(id) ON DELETE CASCADE,
  phone         TEXT NOT NULL,
  amount        NUMERIC(10,2) NOT NULL,
  plan          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | refunded
  method        TEXT DEFAULT 'pendiente',          -- efectivo | bizum | tarjeta | stripe | pendiente
  payment_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- CONVERSACIONES (estado de la conversación del bot)
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT UNIQUE NOT NULL,
  state       TEXT NOT NULL DEFAULT 'menu',
  context     JSONB DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── ÍNDICES ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_payments_phone ON payments(phone);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone);

-- ── UPDATED_AT AUTOMÁTICO ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── ROW LEVEL SECURITY (opcional pero recomendado) ─────────────────────────
-- Descomenta si quieres proteger las tablas:
-- ALTER TABLE members ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- ── VISTA ÚTIL PARA EL GYM ────────────────────────────────────────────────
CREATE OR REPLACE VIEW active_members_view AS
SELECT
  m.name,
  m.phone,
  m.email,
  m.plan,
  m.status,
  m.end_date,
  (m.end_date - CURRENT_DATE) AS days_remaining,
  COALESCE(
    (SELECT SUM(p.amount) FROM payments p WHERE p.member_id = m.id AND p.status = 'paid'),
    0
  ) AS total_paid
FROM members m
WHERE m.status = 'active'
ORDER BY m.end_date ASC;

-- ── SOCIOS QUE VENCEN EN 7 DÍAS (para alertas) ────────────────────────────
CREATE OR REPLACE VIEW expiring_soon_view AS
SELECT name, phone, email, end_date, plan
FROM members
WHERE status = 'active'
  AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
ORDER BY end_date;
