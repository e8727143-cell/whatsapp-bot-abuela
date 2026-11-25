const fs = require('fs');
const path = require('path');

const CONVERSACIONES_PATH = path.join(__dirname, 'conversaciones.json');
const CHECKOUT_URL = process.env.PAGO_URL || 'https://pay.hotmart.com/W105526885V?off=qmsrqdaf';
const INFO_URL = process.env.INFO_URL || 'https://abuelatulun.site';

// Memoria en memoria (cache de ejecución) y en disco
const memoriaCache = {};

function cargarConversaciones() {
  try {
    if (Object.keys(memoriaCache).length > 0) {
      return memoriaCache;
    }
    if (fs.existsSync(CONVERSACIONES_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONVERSACIONES_PATH, 'utf-8'));
      Object.assign(memoriaCache, data);
      return memoriaCache;
    }
  } catch (e) {
    console.warn('⚠️ Error al leer conversaciones.json:', e.message);
  }
  return memoriaCache;
}

function guardarConversaciones(data) {
  try {
    Object.assign(memoriaCache, data);
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
    const ult = conversaciones[senderId][conversaciones[senderId].length - 1];
    if (ult && ult.role === role && ult.content === content) {
      return;
    }
    conversaciones[senderId].push({
      role,
      content,
      timestamp: new Date().toISOString()
    });
    // Conserva TODO el contexto desde el primer mensaje (hasta 100 mensajes)
    if (conversaciones[senderId].length > 100) {
      conversaciones[senderId] = conversaciones[senderId].slice(-100);
    }
    guardarConversaciones(conversaciones);
  } catch (e) {
    console.error('⚠️ Error al registrar interacción:', e.message);
  }
}

/**
 * Precios EXACTOS y oficiales del Checkout de Hotmart (oferta off=qmsrqdaf).
 * Verificados directamente en https://pay.hotmart.com/W105526885V?off=qmsrqdaf
 */
function obtenerInfoPais(senderId) {
  if (!senderId) {
    return {
      pais: 'Internacional',
      codigo: 'INT',
      moneda: 'USD',
      simbolo: '$',
      precioExacto: '$7.00 USD',
      metodos: 'tarjeta de crédito/débito o PayPal',
      textoPrecio: 'exactamente siete dólares ($7.00 USD) en el checkout de Hotmart',
      checkoutUrl: CHECKOUT_URL
    };
  }

  const num = senderId.replace(/[^0-9]/g, '');

  // Colombia (+57) -> Exacto Hotmart: $ 26.747 COP
  if (num.startsWith('57')) {
    return {
      pais: 'Colombia',
      codigo: 'CO',
      moneda: 'COP',
      simbolo: '$',
      precioExacto: '$26.747 COP',
      metodos: 'Nequi, PSE, Efecty en efectivo o tarjeta',
      textoPrecio: 'exactamente $26.747 pesos colombianos ($26.747 COP) en el checkout de Hotmart, y puedes pagar en efectivo en Efecty, por Nequi, PSE o con tarjeta',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // México (+52 o +521) -> Exacto Hotmart: $170.52 MXN (con IVA incluido)
  if (num.startsWith('52')) {
    return {
      pais: 'México',
      codigo: 'MX',
      moneda: 'MXN',
      simbolo: '$',
      precioExacto: '$170.52 MXN',
      metodos: 'OXXO en efectivo, tarjeta o SPEI',
      textoPrecio: 'exactamente $170.52 pesos mexicanos ($170.52 MXN, con IVA incluido) en el checkout de Hotmart, y puedes pagar en cualquier OXXO en efectivo, por transferencia o con tarjeta',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // Perú (+51) -> Exacto Hotmart: S/ 27.00 PEN
  if (num.startsWith('51')) {
    return {
      pais: 'Perú',
      codigo: 'PE',
      moneda: 'PEN',
      simbolo: 'S/',
      precioExacto: 'S/ 27.00',
      metodos: 'Yape, PagoEfectivo en efectivo o tarjeta',
      textoPrecio: 'exactamente 27 soles (S/ 27.00) en el checkout de Hotmart, y puedes pagar con Yape, PagoEfectivo en efectivo o con tarjeta',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // Chile (+56) -> Exacto Hotmart: $7.630 CLP (con IVA incluido)
  if (num.startsWith('56')) {
    return {
      pais: 'Chile',
      codigo: 'CL',
      moneda: 'CLP',
      simbolo: '$',
      precioExacto: '$7.630 CLP',
      metodos: 'Webpay, Cuenta RUT, Sencillito o tarjeta',
      textoPrecio: 'exactamente $7.630 pesos chilenos ($7.630 CLP, con IVA incluido) en el checkout de Hotmart, y puedes pagar con Cuenta RUT, Webpay, Sencillito o tarjeta',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // España (+34) -> Exacto Hotmart: 7,00 € (con IVA incluido)
  if (num.startsWith('34')) {
    return {
      pais: 'España',
      codigo: 'ES',
      moneda: 'EUR',
      simbolo: '€',
      precioExacto: '7,00 €',
      metodos: 'Bizum o tarjeta',
      textoPrecio: 'exactamente 7,00 euros (7,00 €) en el checkout de Hotmart, y puedes pagar con Bizum o tarjeta',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // Argentina (+54) -> Exacto Hotmart: $ 13.757,00 ARS
  if (num.startsWith('54')) {
    return {
      pais: 'Argentina',
      codigo: 'AR',
      moneda: 'ARS',
      simbolo: '$',
      precioExacto: '$13.757,00 ARS',
      metodos: 'tarjeta de débito o crédito',
      textoPrecio: 'exactamente $13.757 pesos argentinos ($13.757,00 ARS) en el checkout de Hotmart',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // Estados Unidos / Puerto Rico / Canadá (+1) -> Exacto Hotmart: $7.00 USD
  if (num.startsWith('1')) {
    // Si es República Dominicana (+1809, +1829, +1849) -> Exacto Hotmart: RD$ 442.00
    if (num.startsWith('1809') || num.startsWith('1829') || num.startsWith('1849')) {
      return {
        pais: 'República Dominicana',
        codigo: 'DO',
        moneda: 'DOP',
        simbolo: 'RD$',
        precioExacto: 'RD$ 442.00',
        metodos: 'tarjeta o PayPal',
        textoPrecio: 'exactamente 442 pesos dominicanos (RD$ 442.00) en el checkout de Hotmart',
        checkoutUrl: CHECKOUT_URL
      };
    }
    return {
      pais: 'Estados Unidos',
      codigo: 'US',
      moneda: 'USD',
      simbolo: '$',
      precioExacto: '$7.00 USD',
      metodos: 'tarjeta, PayPal o Apple Pay',
      textoPrecio: 'exactamente siete dólares ($7.00 USD) en el checkout de Hotmart',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // Ecuador (+593) -> Dolarizado: $7.00 USD
  if (num.startsWith('593')) {
    return {
      pais: 'Ecuador',
      codigo: 'EC',
      moneda: 'USD',
      simbolo: '$',
      precioExacto: '$7.00 USD',
      metodos: 'tarjeta de débito o crédito',
      textoPrecio: 'exactamente siete dólares ($7.00 USD) en el checkout de Hotmart',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // Uruguay (+598) -> Exacto Hotmart: $ 300,00 UYU
  if (num.startsWith('598')) {
    return {
      pais: 'Uruguay',
      codigo: 'UY',
      moneda: 'UYU',
      simbolo: '$',
      precioExacto: '$300,00 UYU',
      metodos: 'tarjeta de débito o crédito',
      textoPrecio: 'exactamente $300 pesos uruguayos ($300,00 UYU) en el checkout de Hotmart',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // Bolivia (+591) -> Exacto Hotmart: Bs 87,00 BOB
  if (num.startsWith('591')) {
    return {
      pais: 'Bolivia',
      codigo: 'BO',
      moneda: 'BOB',
      simbolo: 'Bs',
      precioExacto: 'Bs 87,00',
      metodos: 'tarjeta o QR',
      textoPrecio: 'exactamente 87 bolivianos (Bs 87,00) en el checkout de Hotmart',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // Costa Rica (+506) -> Exacto Hotmart: ₡3.284,00 CRC
  if (num.startsWith('506')) {
    return {
      pais: 'Costa Rica',
      codigo: 'CR',
      moneda: 'CRC',
      simbolo: '₡',
      precioExacto: '₡3.284,00',
      metodos: 'tarjeta',
      textoPrecio: 'exactamente 3.284 colones (₡3.284,00) en el checkout de Hotmart',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // Guatemala (+502) -> Exacto Hotmart: Q 57.00 GTQ
  if (num.startsWith('502')) {
    return {
      pais: 'Guatemala',
      codigo: 'GT',
      moneda: 'GTQ',
      simbolo: 'Q',
      precioExacto: 'Q 57.00',
      metodos: 'tarjeta',
      textoPrecio: 'exactamente 57 quetzales (Q 57.00) en el checkout de Hotmart',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // El Salvador (+503) -> Dolarizado: $7.00 USD
  if (num.startsWith('503')) {
    return {
      pais: 'El Salvador',
      codigo: 'SV',
      moneda: 'USD',
      simbolo: '$',
      precioExacto: '$7.00 USD',
      metodos: 'tarjeta',
      textoPrecio: 'exactamente siete dólares ($7.00 USD) en el checkout de Hotmart',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // Panamá (+507) -> Exacto Hotmart: B/. 9.00
  if (num.startsWith('507')) {
    return {
      pais: 'Panamá',
      codigo: 'PA',
      moneda: 'PAB/USD',
      simbolo: 'B/.',
      precioExacto: 'B/. 9.00',
      metodos: 'tarjeta',
      textoPrecio: 'exactamente 9 balboas / dólares (B/. 9.00) en el checkout de Hotmart',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // Paraguay (+595) -> Exacto Hotmart: Gs. 47.417 PYG
  if (num.startsWith('595')) {
    return {
      pais: 'Paraguay',
      codigo: 'PY',
      moneda: 'PYG',
      simbolo: 'Gs.',
      precioExacto: 'Gs. 47.417',
      metodos: 'tarjeta',
      textoPrecio: 'exactamente 47.417 guaraníes (Gs. 47.417) en el checkout de Hotmart',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // Honduras (+504) -> Exacto Hotmart: L 199.00 HNL
  if (num.startsWith('504')) {
    return {
      pais: 'Honduras',
      codigo: 'HN',
      moneda: 'HNL',
      simbolo: 'L',
      precioExacto: 'L 199.00',
      metodos: 'tarjeta',
      textoPrecio: 'exactamente 199 lempiras (L 199.00) en el checkout de Hotmart',
      checkoutUrl: CHECKOUT_URL
    };
  }

  // Por defecto (Internacional)
  return {
    pais: 'Internacional',
    codigo: 'INT',
    moneda: 'USD',
    simbolo: '$',
    precioExacto: '$7.00 USD',
    metodos: 'tarjeta de crédito/débito o PayPal',
    textoPrecio: 'exactamente siete dólares ($7.00 USD) en el checkout de Hotmart. Al abrir el enlace verás el importe en tu moneda con las opciones locales de tu país',
    checkoutUrl: CHECKOUT_URL
  };
}

/**
 * System Prompt que define la personalidad sabia, tierna y persuasiva de la Abuela Tulun.
 */
function obtenerSystemPrompt(infoPais = null) {
  const infoUrl = INFO_URL;
  const pagoUrl = CHECKOUT_URL;

  const paisTexto = infoPais ? `
DATOS EXACTOS OFICIALES DEL CHECKOUT DE HOTMART (OFERTA DIRECTA: ${pagoUrl}):
- País detectado por número telefónico: ${infoPais.pais}
- Precio EXACTO oficial de Hotmart: ${infoPais.precioExacto} (${infoPais.textoPrecio})
- Métodos de pago disponibles: ${infoPais.metodos}
- ⛔ REGLA ESTRICTA DE PRECIO EXACTO: Si la persona pregunta cuánto cuesta, el valor en su país o cómo pagar ("¿cuánto cuesta en mi país?", "¿cuánto es en pesos?", "¿cuál es el valor?"): dile con precisión milimétrica que cuesta ${infoPais.textoPrecio}. PROHIBIDO dar números aproximados, rangos o inventados. Si te pide el link de pago dale: ${pagoUrl}
` : '';

  return `Eres Griselda, conocida como la "Abuela Tulun" (@abuelatulun).
Tienes más de 70 años y llevas más de 40 años rescatando las recetas caseras tradicionales de tu madre y tu abuela para sanar el cuerpo de raíz, sin gastar en cosas raras ni depender de farmacias.
Estás hablando directamente por WhatsApp con personas (mayormente mujeres de más de 45 años) que buscan salud, consejos caseros o adquirir tu recetario digital.
${paisTexto}
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

6. ⛔ REGLA DE ORO DE ENLACES Y AFIRMACIONES (¡MÁXIMA PRIORIDAD!):
   - Si la persona dice "Sí", "dale", "claro", "bueno", "pásamelo", "por favor", "me interesa", "quiero", o acepta el libro tras preguntarle si quiere el enlace:
     ENTRÉGALE INMEDIATAMENTE EL ENLACE INFORMATIVO (${infoUrl}).
     ⛔ PROHIBIDO TERMINANTEMENTE hablar de dolores de rodilla, cataplasmas de repollo ni inventar recetas si la persona está diciendo que sí o pidiendo el enlace.
     Responde siempre algo como: "Aquí tienes el enlace de mi libro, hija: ${infoUrl} Ahí puedes ver todas las recetas caseras que incluye para sanar de raíz y cómo tenerlo en tu teléfono hoy mismo. Cualquier duda me avisas y te ayudo con gusto."
   - Si la persona pide pagar directamente o consulta cómo abonar ("pásame el link de pago", "dónde pago", "¿cómo lo pago?", "¿por dónde se abona?", "quiero comprarlo ya"):
     ENTRÉGALE EL ENLACE DIRECTO DE PAGO DE HOTMART (${pagoUrl}).
     Responde: "Aquí tienes el enlace directo para comprarlo, hija: ${pagoUrl} Cuesta ${infoPais ? infoPais.textoPrecio : 'solo siete dólares'} y te llega al instante a tu correo. Avísame apenas lo tengas."

7. ⛔ PROHIBICIÓN ABSOLUTA DE ASUMIR O INVENTAR DOLORES:
   - NUNCA inventes que la persona tiene dolor de rodilla o de articulaciones si no lo ha escrito explícitamente.
   - Si la persona dice "tengo varios", "me duele el cuerpo" o algo general, pregúntale con cariño cuáles son las molestias principales para aconsejarle lo mejor, o explícale que en el recetario tienes soluciones para todo el cuerpo.

CONOCIMIENTO DE TU LIBRO "100 RECETAS DE LA ABUELA PARA SANAR" (5 CAPÍTULOS):
- Cap. 1: Articulaciones, Dolores y Movilidad (Compresas naturales desinflamatorias, leche dorada con cúrcuma, caldo de colágeno, fricción de romero).
- Cap. 2: Vientre Plano y Digestión (Pan de semillas de chía y linaza sin gluten, infusiones para gases, reflujo y colon irritable).
- Cap. 3: Control del Azúcar, Hígado y Circulación (Limpieza hepática natural, piernas pesadas, picos de glucosa).
- Cap. 4: Sueño Profundo y Vejiga (Infusión tibia para fortalecer vejiga y evitar despertar a medianoche).
- Cap. 5: Energía, Defensas y Vitalidad (Remedios para flemas y el Elixir de Griselda).

FORMATO WHATSAPP:
- Negrita con un solo asterisco: *texto*.
- Cero emojis o máximo uno discreto solo si hace falta.`;
}

/**
 * Consulta a DeepSeek mediante River AI usando fetch nativo.
 */
async function responderComoAbuela(senderId, mensajeUsuario, infoPaisParam = null) {
  const apiKey = process.env.DEEPSEEK_API_KEY || 'rv_oWTevchKGofvZ2yOyzj3c7CLMC-CWqSlM8AT88HiCco';
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.river.ai/v1';
  const modelo = process.env.DEEPSEEK_MODEL || 'deepseek-ai/DeepSeek-V4.1-Flash-1017';

  const infoPais = infoPaisParam || obtenerInfoPais(senderId);
  const infoUrl = INFO_URL;
  const pagoUrl = CHECKOUT_URL;

  // BLINDAJE DETERMINISTA: Intercepción inmediata de afirmaciones para evitar alucinaciones
  const textoLimpio = (mensajeUsuario || '').trim().toLowerCase();
  const esAfirmativo = /^(s[ií]+|dale|bueno|claro|por\s*favor|porfa|ok|oka|p[aá]salo|p[aá]samelo|m[aá]ndalo|m[aá]ndamelo|a\s*ver|me\s*interesa|quiero|link|enlace|p[aá]gina|web|s[ií]\s*abuela|s[ií]\s*porfa|s[ií]\s*gracias|s[ií]\s*quiero|manda|pasa)$/i.test(textoLimpio);

  if (esAfirmativo) {
    const respuestaDirecta = `Aquí tienes el enlace de mi libro, hija:\n${infoUrl}\n\nAhí puedes ver todas las recetas caseras que incluye para sanar de raíz y cómo tenerlo en tu teléfono hoy mismo. Cualquier duda me avisas y te ayudo con gusto.`;
    registrarInteraccion(senderId, 'user', mensajeUsuario);
    registrarInteraccion(senderId, 'assistant', respuestaDirecta);
    return respuestaDirecta;
  }

  // BLINDAJE DETERMINISTA: Pedido directo de link de pago
  const pidePago = /(link\s*de\s*pago|enlace\s*de\s*pago|d[oó]nde\s*pago|c[oó]mo\s*pago|d[oó]nde\s*(?:lo\s*)?compro|c[oó]mo\s*(?:lo\s*)?compro|quiero\s*comprarlo|quiero\s*pagar|por\s*d[oó]nde\s*se\s*paga)/i.test(textoLimpio);
  if (pidePago) {
    const respuestaPago = `Aquí tienes el enlace directo para adquirirlo en Hotmart, hija:\n${pagoUrl}\n\nCuesta ${infoPais.textoPrecio}. Al ingresar verás el valor en tu moneda y te llega al momento a tu correo electrónico. Cualquier duda me avisas y te ayudo con gusto.`;
    registrarInteraccion(senderId, 'user', mensajeUsuario);
    registrarInteraccion(senderId, 'assistant', respuestaPago);
    return respuestaPago;
  }

  const conversaciones = cargarConversaciones();
  if (!conversaciones[senderId]) {
    conversaciones[senderId] = [];
  }

  // Registrar el mensaje actual del usuario solo si no estaba ya registrado
  const ult = conversaciones[senderId][conversaciones[senderId].length - 1];
  if (!ult || ult.role !== 'user' || ult.content !== mensajeUsuario) {
    conversaciones[senderId].push({
      role: 'user',
      content: mensajeUsuario,
      timestamp: new Date().toISOString()
    });
  }

  // Todo el historial completo desde el inicio para que la IA tenga contexto absoluto
  if (conversaciones[senderId].length > 100) {
    conversaciones[senderId] = conversaciones[senderId].slice(-100);
  }

  const messagesParaApi = [
    { role: 'system', content: obtenerSystemPrompt(infoPais) },
    ...conversaciones[senderId].map(m => ({ role: m.role, content: m.content }))
  ];

  console.log(`[DeepSeek Cloud] Procesando respuesta para ${senderId} (${infoPais.pais} - ${infoPais.precioExacto})...`);
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
  registrarInteraccion,
  obtenerInfoPais,
  CHECKOUT_URL,
  INFO_URL
};
