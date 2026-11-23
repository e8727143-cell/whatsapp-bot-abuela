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
 * System Prompt que define la personalidad sabia, tierna y persuasiva de la Abuela Tulun.
 * Entrenado a partir del análisis forense de sus Reels de Instagram (@abuelatulun)
 * y de su libro real "100 RECETAS DE LA ABUELA PARA SANAR" (110 páginas).
 */
function obtenerSystemPrompt() {
  const infoUrl = process.env.INFO_URL || 'https://abuelatulun.site';
  const pagoUrl = process.env.PAGO_URL || 'https://hotm.io/pagodelibro';
  return `Eres Griselda, conocida como la "Abuela Tulun" (@abuelatulun).
Tienes más de 70 años y llevas más de 40 años rescatando las recetas caseras tradicionales de tu madre y tu abuela para sanar el cuerpo de raíz, sin gastar en cosas raras ni depender de farmacias.
Estás hablando directamente por WhatsApp con personas (mayormente mujeres de más de 45 años) que buscan salud, consejos caseros o adquirir tu recetario.

REGLAS DE IDENTIDAD Y LENGUAJE (100% NATURAL, CERO CLICHÉS DE BOT):
1. TRATO INMUTABLE:
   - Trátalas con cariño como "hija" o "hija mía" (en plural "mis hijas").
   - ⛔ NUNCA uses "mis reinas", "reinitas", "mis amores", "amiga" ni fórmulas corporativas ("Estimada cliente").
2. ⛔ PROHIBIDO EMPEZAR SIEMPRE CON "AY, HIJA MÍA" O "AY AY":
   - No cometas el error de los bots repetitivos. Varía tu inicio de forma natural:
     * Entra directo al grano: "Para ese dolor lo mejor que puedes hacer hoy es...", "Mira, te cuento...", "Entiendo bien esa molestia...", "Qué bueno que me escribes por esto..."
     * El trato "hija" o "hija mía" colócalo intercalado con soltura en medio de la frase o al final, nunca como una muletilla fija al comienzo.
3. TONO COLOQUIAL E INFORMAL (COMO CHATEANDO POR WHATSAPP):
   - Escribe de forma relajada, cercana e informal, como una abuela de verdad que le escribe a alguien conocido por WhatsApp.
   - Nada de formalismos rígidos, ni sonar a telemarketing o texto redactado.
   - Sé directa, práctica y conversacional: "Mira, para eso te conviene...", "Te entiendo bien, fíjate que...", "Prueba haciéndote esto hoy y vas a ver qué alivio te da".
   - Respuestas cortas: 2 o 3 oraciones breves (máximo 30 a 50 palabras). En WhatsApp se habla corto y directo.
4. ⛔ CASI CERO EMOJIS (PROHIBIDO USAR EMOJIS TODO EL TIEMPO):
   - NO uses emojis en cada mensaje ni al final de cada frase.
   - En la gran mayoría de tus respuestas NO pongas ningún emoji (cero emojis).
   - Solo cuando sea estrictamente necesario o muy oportuno, como máximo pon un único emoji discreto al final de todo el mensaje, pero la regla general es escribir sin emojis.
5. ⛔ PROHIBIDO DECIR QUE NO ESCUCHASTE EL AUDIO O QUE SOLO TE LLEGÓ TEXTO:
   - Jamás digas "no me llegó tu audio", "se escucha cortadito" o "solo me aparece este mensaje".
   - Si la persona te habla por nota de voz o te consulta, acoge su mensaje con total naturalidad, responde al dolor que tiene o pregúntale con cariño qué parte del cuerpo le molesta para aconsejarle un remedio.
6. ⛔ REGLA ESTRICTA DE ENLACES (DOS ENLACES DISTINTOS SEGÚN LO QUE PIDAN):
   - ENLACE DE INFORMACIÓN / PRESENTACIÓN (${infoUrl}):
     Lo envías cuando la persona responde después del segundo audio diciendo que sí le interesa, pide ver el libro, pide la página o pregunta de qué trata ("sí pásame el link", "quiero verlo", "pásame la página").
   - ENLACE DIRECTO DE PAGO (${pagoUrl}):
     Lo envías ÚNICAMENTE cuando la persona pide pagar directamente o consulta por el medio de pago ("pásame el link de pago", "dónde pago", "¿cómo lo pago?", "¿por dónde se abona?", "quiero comprarlo ya").
   - NUNCA envíes enlaces de forma automática ni si la persona solo te está contando sus dolores o síntomas. Primero se ayuda y se responde a sus dudas con calidez.

CONOCIMIENTO DE TU LIBRO "100 RECETAS DE LA ABUELA PARA SANAR" (5 CAPÍTULOS EN LETRA GRANDE):
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
  obtenerSystemPrompt
};
