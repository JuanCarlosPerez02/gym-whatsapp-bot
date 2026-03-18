# 🤖 Gym WhatsApp Bot

Bot de WhatsApp para gestión automatizada de gimnasios. Permite dar de alta, baja, gestionar pagos y renovaciones directamente desde WhatsApp.

---

## ✨ Funcionalidades

| Función | Descripción |
|---------|-------------|
| 📋 **Alta** | Registro de nuevo socio con nombre, email y plan |
| ❌ **Baja** | Cancelación de suscripción con confirmación |
| 🔄 **Renovación** | Renovar mensualidad eligiendo plan |
| 💶 **Pagos** | Gestión de pagos (Bizum/efectivo, con Stripe en producción) |
| 📊 **Estado** | Consulta de cuenta, vencimiento y pagos |
| ℹ️ **Info** | Horarios, tarifas y contacto |

---

## 🏗️ Stack tecnológico

```
WhatsApp Cloud API (Meta) — gratis hasta 1000 conv/mes
Node.js + Express          — backend
Supabase                   — base de datos PostgreSQL
Render                     — hosting gratis (demo)
Railway                    — hosting de pago (~5€/mes, producción)
```

---

## 🚀 Instalación y puesta en marcha

### 1. Clonar el proyecto

```bash
git clone <repo>
cd gym-whatsapp-bot
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Edita .env con tus credenciales
```

### 3. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com)
2. Ve a **SQL Editor**
3. Ejecuta el contenido de `supabase_schema.sql`
4. Copia la **URL** y la **Service Role Key** de Settings → API

### 4. Configurar Meta WhatsApp Cloud API

#### 4.1 Crear la App en Meta

1. Ve a [developers.facebook.com](https://developers.facebook.com)
2. **My Apps → Create App**
3. Tipo: **Business**
4. Añade el producto **WhatsApp**

#### 4.2 Obtener credenciales

En **WhatsApp → API Setup**:
- Copia el **Temporary Access Token** → `WHATSAPP_TOKEN`
- Copia el **Phone Number ID** → `WHATSAPP_PHONE_ID`

> ⚠️ El token temporal caduca en 24h. Para producción, genera un token permanente con un System User.

#### 4.3 Configurar Webhook

Una vez desplegado el servidor (paso siguiente), vuelve a Meta:

1. **WhatsApp → Configuration → Webhook**
2. Callback URL: `https://TU-APP.onrender.com/webhook`
3. Verify Token: el valor de tu `WHATSAPP_VERIFY_TOKEN`
4. Suscríbete a: `messages`

---

## ☁️ Despliegue — Demo Gratuita (Render)

### Opción A: Render (recomendado para demo)

1. Sube el código a GitHub
2. Ve a [render.com](https://render.com) → **New Web Service**
3. Conecta tu repositorio
4. Configuración:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Añade las variables de entorno en el panel de Render
6. Despliega ✅

> ⚠️ **Límite Render free**: el servidor se duerme tras 15 min de inactividad. Usa [cron-job.org](https://cron-job.org) para hacer ping cada 10 min y mantenerlo activo.

### Opción B: Railway (recomendado para producción)

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Añade las variables de entorno en el dashboard de Railway.

### Opción C: Pruebas locales con ngrok

```bash
# Terminal 1
npm run dev

# Terminal 2
ngrok http 3000
# Copia la URL https://xxx.ngrok.io y úsala en Meta como Callback URL
```

---

## 💬 Flujo de conversación

```
Usuario escribe cualquier cosa
        │
        ▼
  ¿Palabra clave?  ──(hola/menú/inicio)──→  Menú Principal
        │
        ▼
  ¿Es socio? ────(No)──→  [Alta / Info / Contacto]
        │
       (Sí)
        │
        ▼
  Menú de Socio:
  ├── 🔄 Renovar → Elige plan → Confirma → Datos de pago
  ├── 📊 Estado → Info + últimos pagos
  └── ❌ Baja → Confirmación → Baja tramitada
```

---

## 💶 Planes y precios (configurable)

| Plan | Precio | 
|------|--------|
| Mensual | 35€/mes |
| Trimestral | 90€ (ahorro 15€) |
| Anual | 300€ (ahorro 120€) |

Para cambiar los precios, edita `PLAN_PRICES` en `src/services/supabase.js`.

---

## 📊 Base de datos

### Tablas principales

**`members`** — Socios
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | ID único |
| phone | TEXT | Número WhatsApp (con prefijo, ej: 34612345678) |
| name | TEXT | Nombre completo |
| email | TEXT | Email |
| plan | TEXT | mensual / trimestral / anual |
| status | TEXT | active / cancelled / suspended |
| start_date | DATE | Inicio de la suscripción |
| end_date | DATE | Fecha de vencimiento |

**`payments`** — Pagos
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID | ID único |
| member_id | UUID | FK a members |
| amount | NUMERIC | Importe |
| status | TEXT | pending / paid / refunded |
| method | TEXT | efectivo / bizum / tarjeta / stripe |

**`conversations`** — Estado del bot
| Campo | Tipo | Descripción |
|-------|------|-------------|
| phone | TEXT | Teléfono del usuario |
| state | TEXT | Estado actual del flujo |
| context | JSONB | Datos temporales de la conversación |

### Vistas útiles

```sql
-- Ver socios activos
SELECT * FROM active_members_view;

-- Ver socios que vencen en 7 días (para recordatorios)
SELECT * FROM expiring_soon_view;
```

---

## 🔮 Roadmap — Mejoras para producción

### Corto plazo
- [ ] Recordatorios automáticos 7 días antes del vencimiento (cron job)
- [ ] Panel de admin web (React/Next.js)
- [ ] Confirmación de pago con foto del Bizum

### Medio plazo
- [ ] Integración Stripe para pago online directo
- [ ] QR de acceso al gimnasio por WhatsApp
- [ ] Notificaciones masivas (promociones, cierres)

### Producción
- [ ] Token permanente de Meta (System User)
- [ ] Número de teléfono dedicado verificado
- [ ] Número real de WhatsApp Business
- [ ] Backups automáticos de Supabase

---

## 🔧 Variables de entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `WHATSAPP_TOKEN` | Token de acceso Meta API | ✅ |
| `WHATSAPP_PHONE_ID` | ID del número de WhatsApp | ✅ |
| `WHATSAPP_VERIFY_TOKEN` | Token secreto para verificar webhook | ✅ |
| `SUPABASE_URL` | URL de tu proyecto Supabase | ✅ |
| `SUPABASE_SERVICE_KEY` | Service Role Key de Supabase | ✅ |
| `GYM_NAME` | Nombre del gimnasio | ⬜ |
| `GYM_PHONE` | Teléfono del gimnasio | ⬜ |
| `PORT` | Puerto del servidor (default: 3000) | ⬜ |

---

## 🤝 Para vender el producto

### Pitch para el gimnasio

> "Imagina que un cliente nuevo manda un WhatsApp a las 11 de la noche queriendo apuntarse. Con este bot, se apunta solo, elige su plan y recibe los datos de pago al instante. Sin que nadie tenga que contestar."

### Modelo de negocio sugerido

| Tier | Precio | Incluye |
|------|--------|---------|
| **Setup** | 300-500€ | Instalación + configuración + formación |
| **Mantenimiento** | 30-50€/mes | Hosting + soporte + actualizaciones |
| **Premium** | +100€/mes | Panel admin + pagos Stripe + recordatorios automáticos |

---

## 📞 Soporte

Para dudas técnicas, contacta con el desarrollador.
