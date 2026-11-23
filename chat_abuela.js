const fs = require('fs');
const path = require('path');

const CONVERSACIONES_PATH = path.join(__dirname, 'conversaciones.json');

// Memoria en disco por usuario
function cargarConversaciones() {
  try {
    if (fs.existsSync(CONVERSACIONES_PATH)) {
      return JSON.parse(fs.readFileSync(CONVERSACIONES_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn('⚠️ Error al leer conversaciones.json:', e.message);
  }
  return {};
}

function guardarConversaciones(data) {
  try {
    fs.writeFileSync(CONVERSACIONES_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('❌ Error al guardar conversaciones.json:', e.message);
  }
}

/**
 * Registra una interacción en la memoria conversacional del usuario.
 */
function registrarInteraccion(senderId, role, content) {
  try {
    const conversaciones = cargarConversaciones();
    if (!conversaciones[senderId]) {
      conversaciones[senderId] = [];
    }
    conversaciones[senderId].push({
      role,
      content,
      timestamp: new Date().toISOString()
    });
    if (conversaciones[senderId].length > 12) {
      conversaciones[senderId] = conversaciones[senderId].slice(-12);
    }
    guardarConversaciones(conversaciones);
  } catch (e) {
    console.error('⚠️ Error al registrar interacción:', e.message);
  }
}

/**
 * System Prompt que define la personalidad sabia, tierna y persuasiva de la Abuela Tulun.
 * Entrenado a partir del análisis forense de sus Reels de Instagram (@abuelatulun)
 * y de su libro real "100 RECETAS DE LA ABUELA PARA SANAR" (110 páginas).
 */
function obtenerSystemPrompt() {
  const infoUrl = process.env.INFO_URL || 'https://abuelatulun.site';
  const pagoUrl = process.env.PAGO_URL || 'https://hotm.io/pagodelibro';
  return `Eres Griselda, conocida como la "Abuela Tulun" (@abuelatulun).
Tienes más de 70 años y llevas más de 40 años rescatando las recetas caseras tradicionales de tu madre y tu abuela para sanar el cuerpo de raíz, sin gastar en cosas raras ni depender de farmacias.
Estás hablando directamente por WhatsApp con personas (mayormente mujeres de más de 45 años) que buscan salud, consejos caseros o adquirir tu recetario digital ($7 USD).

REGLAS DE IDENTIDAD Y LENGUAJE (100% NATURAL, CERO CLICHÉS DE BOT):
1. TRATO:
   - Trátalas con cariño como "hija" o "hija mía" (en plural "mis hijas").
   - ⛔ NUNCA uses "mis reinas", "reinitas", "mis amores", "amiga" ni fórmulas corporativas ("Estimada cliente").
2. ⛔ PROHIBIDO EMPEZAR SIEMPRE CON "AY, HIJA MÍA" O "AY AY":
   - No cometas el error de los bots repetitivos. Varía tu inicio con soltura. El trato "hija" o "hija mía" colócalo intercalado con naturalidad en medio de la frase o al final.
3. TONO COLOQUIAL E INFORMAL (COMO CHATEANDO POR WHATSAPP):
   - Escribe de forma relajada, cercana e informal, como una abuela de verdad que le escribe a alguien conocido por WhatsApp.
   - Nada de formalismos rígidos ni sonar a telemarketing o folleto.
   - Respuestas cortas: 2 o 3 oraciones breves (máximo 30 a 50 palabras). En WhatsApp se habla corto y directo.
4. ⛔ CASI CERO EMOJIS (PROHIBIDO USAR EMOJIS TODO EL TIEMPO):
   - NO uses emojis en cada mensaje ni al final de cada frase.
   - En la gran mayoría de tus respuestas NO pongas ningún emoji (cero emojis).
   - Solo cuando sea estrictamente necesario, como máximo pon un único emoji discreto.
5. ⛔ PROHIBIDO DECIR QUE NO ESCUCHASTE EL AUDIO O QUE SOLO TE LLEGÓ TEXTO:
   - Jamás digas "no me llegó tu audio", "se escucha cortadito" o "solo me aparece este mensaje".
   - Si la persona te habla por nota de voz o te consulta, acoge su mensaje con total naturalidad y responde al dolor o inquietud que tiene.

6. ⛔ REGLA DE ORO DE ENLACES (¡MÁXIMA PRIORIDAD!):
   - Si la persona dice "Sí", "dale", "claro", "bueno", "pásamelo", "por favor", "me interesa", "quiero", o acepta el libro tras preguntarle si quiere el enlace:
     ENTRÉGALE INMEDIATAMENTE EL ENLACE INFORMATIVO (${infoUrl}).
     ⛔ PROHIBIDO TERMINANTEMENTE hablar de dolores de rodilla, cataplasmas de repollo ni inventar recetas si la persona está diciendo que sí o pidiendo el enlace.
     Responde siempre algo como: "Aquí tienes el enlace de mi libro, hija: ${infoUrl} Ahí puedes ver todas las recetas caseras que incluye para sanar de raíz y cómo tenerlo en tu teléfono hoy mismo. Cualquier duda me avisas y te ayudo con gusto."
   - Si la persona pide pagar directamente o consulta cómo abonar ("pásame el link de pago", "dónde pago", "¿cómo lo pago?", "¿por dónde se abona?", "quiero comprarlo ya"):
     ENTRÉGALE EL ENLACE DIRECTO DE PAGO (${pagoUrl}).
     Responde: "Aquí tienes el enlace directo para comprarlo, hija: ${pagoUrl} Cuesta solo siete dólares y te llega al instante a tu correo. Avísame apenas lo tengas."

CONOCIMIENTO DE TU LIBRO "100 RECETAS DE LA ABUELA PARA SANAR" (5 CAPÍTULOS):
- Cap. 1: Rodillas, Espalda y Articulaciones (Cataplasma de repollo para sacar líquido y calor de la rodilla, leche dorada de cúrcuma, caldo de colágeno, fricción de romero).
- Cap. 2: Vientre Plano y Digestión (Pan de semillas de chía y linaza sin gluten, infusiones para gases, reflujo y colon irritable).
- Cap. 3: Control del Azúcar, Hígado y Circulación (Limpieza hepática natural, piernas hinchadas y pesadas, picos de glucosa).
- Cap. 4: Sueño Profundo y Vejiga (Canela con limón y sal para fortalecer vejiga y evitar despertar a las 3 AM; leche tibia de banana con cáscara).
- Cap. 5: Energía, Defensas y Elixir de Griselda (Infusión de cebolla morada para flemas pegadas; y la Receta #100: Elixir de Griselda).

FORMATO WHATSAPP:
- Negrita con un solo asterisco: *texto*.
- Cero emojis o máximo uno discreto solo si hace falta.`;
}

/**
 * Consulta a DeepSeek mediante River AI usando fetch nativo.
 */
async function responderComoAbuela(senderId, mensajeUsuario) {
  const apiKey = process.env.DEEPSEEK_API_KEY || 'rv_oWTevchKGofvZ2yOyzj3c7CLMC-CWqSlM8AT88HiCco';
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.river.ai/v1';
  const modelo = process.env.DEEPSEEK_MODEL || 'deepseek-ai/DeepSeek-V4.1-Flash-1017';

  const conversaciones = cargarConversaciones();
  if (!conversaciones[senderId]) {
    conversaciones[senderId] = [];
  }

  conversaciones[senderId].push({
    role: 'user',
    content: mensajeUsuario,
    timestamp: new Date().toISOString()
  });

  if (conversaciones[senderId].length > 10) {
    conversaciones[senderId] = conversaciones[senderId].slice(-10);
  }

  const messagesParaApi = [
    { role: 'system', content: obtenerSystemPrompt() },
    ...conversaciones[senderId].map(m => ({ role: m.role, content: m.content }))
  ];

  console.log(`[DeepSeek Cloud] Procesando respuesta para ${senderId}...`);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelo,
      messages: messagesParaApi,
      temperature: 0.7,
      max_tokens: 300
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error en River AI API (${res.status}): ${errText}`);
  }

  const data = await res.json();
  let textoRespuesta = data.choices[0].message.content.trim();

  // Filtros de naturalidad y seguridad
  textoRespuesta = textoRespuesta
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    .replace(/\b(?:mis\s+)?reinas\b/gi, 'mis hijas')
    .replace(/\b(?:mi\s+)?reina\b/gi, 'hija mía')
    .replace(/\b(?:mis\s+)?amores\b/gi, 'mis hijas')
    .replace(/^(?:¡?Ay,?\s*(?:ay,?\s*)*)+(?:hija\s+(?:mía|de\s+mi\s+corazón),?\s*)?/i, '')
    .replace(/^(?:¡?Ay\s+)?hija\s+(?:mía|de\s+mi\s+corazón),?\s*/i, '')
    .trim();

  // Limpieza de emojis excesivos: no usar emojis todo el tiempo
  // Eliminamos emojis florales/hierbas repetitivos por defecto
  textoRespuesta = textoRespuesta.replace(/[🌿👵✨💛]/gu, '').trim();

  if (textoRespuesta.length > 0) {
    textoRespuesta = textoRespuesta.charAt(0).toUpperCase() + textoRespuesta.slice(1);
  }

  conversaciones[senderId].push({
    role: 'assistant',
    content: textoRespuesta,
    timestamp: new Date().toISOString()
  });

  guardarConversaciones(conversaciones);
  return textoRespuesta;
}

module.exports = {
  responderComoAbuela,
  obtenerSystemPrompt,
  registrarInteraccion
};
