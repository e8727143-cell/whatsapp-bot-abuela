const fs = require('fs');
const path = require('path');

const CONVERSACIONES_PATH = path.join(__dirname, 'conversaciones.json');

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
 * Detecta el país, moneda local y medios de pago a partir del prefijo telefónico en senderId.
 */
function obtenerInfoPais(senderId) {
  if (!senderId) {
    return {
      pais: 'Internacional',
      codigo: 'INT',
      moneda: 'USD',
      simbolo: '$',
      precioLocal: '$7 USD',
      metodos: 'tarjeta de crédito/débito o PayPal',
      textoPrecio: 'solo siete dólares ($7 USD) y te llega al instante a tu correo electrónico'
    };
  }

  const num = senderId.replace(/[^0-9]/g, '');

  // Colombia (+57)
  if (num.startsWith('57')) {
    return {
      pais: 'Colombia',
      codigo: 'CO',
      moneda: 'COP',
      simbolo: '$',
      precioLocal: 'unos 28.000 a 30.000 pesos colombianos ($7 USD)',
      metodos: 'Nequi, PSE, Efecty en efectivo o tarjeta',
      textoPrecio: 'siete dólares (aproximadamente entre 28.000 y 30.000 pesos colombianos) y puedes pagar en efectivo en Efecty, por PSE, Nequi o con tarjeta'
    };
  }

  // México (+52 o +521)
  if (num.startsWith('52')) {
    return {
      pais: 'México',
      codigo: 'MX',
      moneda: 'MXN',
      simbolo: '$',
      precioLocal: 'unos 140 a 145 pesos mexicanos ($7 USD)',
      metodos: 'OXXO en efectivo, tarjeta o SPEI',
      textoPrecio: 'siete dólares (aproximadamente entre 140 y 145 pesos mexicanos) y puedes pagar en efectivo en cualquier OXXO, por transferencia o con tarjeta'
    };
  }

  // Perú (+51)
  if (num.startsWith('51')) {
    return {
      pais: 'Perú',
      codigo: 'PE',
      moneda: 'PEN',
      simbolo: 'S/',
      precioLocal: 'unos 26 a 28 soles peruanos ($7 USD)',
      metodos: 'Yape, PagoEfectivo en efectivo o tarjeta',
      textoPrecio: 'siete dólares (alrededor de 26 a 28 soles peruanos) y puedes pagar con Yape, PagoEfectivo en efectivo o con tarjeta'
    };
  }

  // Chile (+56)
  if (num.startsWith('56')) {
    return {
      pais: 'Chile',
      codigo: 'CL',
      moneda: 'CLP',
      simbolo: '$',
      precioLocal: 'unos 6.800 a 7.000 pesos chilenos ($7 USD)',
      metodos: 'Webpay, Cuenta RUT, Sencillito o tarjeta',
      textoPrecio: 'siete dólares (alrededor de 6.800 a 7.000 pesos chilenos) y puedes pagar con Cuenta RUT, Webpay, Sencillito o tarjeta'
    };
  }

  // España (+34)
  if (num.startsWith('34')) {
    return {
      pais: 'España',
      codigo: 'ES',
      moneda: 'EUR',
      simbolo: '€',
      precioLocal: 'aproximadamente 6,50 € ($7 USD)',
      metodos: 'Bizum o tarjeta',
      textoPrecio: 'siete dólares (aproximadamente 6,50 euros) y puedes pagar cómodamente con Bizum o tarjeta'
    };
  }

  // Argentina (+54)
  if (num.startsWith('54')) {
    return {
      pais: 'Argentina',
      codigo: 'AR',
      moneda: 'ARS / USD',
      simbolo: '$',
      precioLocal: '$7 USD',
      metodos: 'tarjeta de débito o crédito',
      textoPrecio: 'siete dólares ($7 USD), que en tu tarjeta se convierten a pesos argentinos según la cotización oficial'
    };
  }

  // Ecuador (+593) - Dolarizado
  if (num.startsWith('593')) {
    return {
      pais: 'Ecuador',
      codigo: 'EC',
      moneda: 'USD',
      simbolo: '$',
      precioLocal: '$7 USD',
      metodos: 'tarjeta de débito o crédito',
      textoPrecio: 'solo siete dólares ($7 USD) y te llega directo a tu correo'
    };
  }

  // Estados Unidos / Puerto Rico / Canadá (+1)
  if (num.startsWith('1')) {
    return {
      pais: 'Estados Unidos',
      codigo: 'US',
      moneda: 'USD',
      simbolo: '$',
      precioLocal: '$7 USD',
      metodos: 'tarjeta, PayPal o Apple Pay',
      textoPrecio: 'solo siete dólares ($7 USD) y te llega de inmediato a tu correo'
    };
  }

  // Uruguay (+598)
  if (num.startsWith('598')) {
    return {
      pais: 'Uruguay',
      codigo: 'UY',
      moneda: 'USD',
      simbolo: '$',
      precioLocal: '$7 USD (unos 290 pesos uruguayos)',
      metodos: 'tarjeta de débito o crédito',
      textoPrecio: 'siete dólares ($7 USD, que son aproximadamente 290 pesos uruguayos)'
    };
  }

  // Bolivia (+591)
  if (num.startsWith('591')) {
    return {
      pais: 'Bolivia',
      codigo: 'BO',
      moneda: 'BOB / USD',
      simbolo: 'Bs',
      precioLocal: 'unos 48 a 50 bolivianos ($7 USD)',
      metodos: 'tarjeta o QR',
      textoPrecio: 'siete dólares (aproximadamente 48 a 50 bolivianos)'
    };
  }

  // Costa Rica (+506)
  if (num.startsWith('506')) {
    return {
      pais: 'Costa Rica',
      codigo: 'CR',
      moneda: 'CRC / USD',
      simbolo: '₡',
      precioLocal: 'unos 3.600 colones ($7 USD)',
      metodos: 'tarjeta',
      textoPrecio: 'siete dólares (alrededor de 3.600 colones costarricenses)'
    };
  }

  // Guatemala (+502)
  if (num.startsWith('502')) {
    return {
      pais: 'Guatemala',
      codigo: 'GT',
      moneda: 'GTQ / USD',
      simbolo: 'Q',
      precioLocal: 'unos 54 a 56 quetzales ($7 USD)',
      metodos: 'tarjeta',
      textoPrecio: 'siete dólares (unos 54 a 56 quetzales)'
    };
  }

  // Por defecto (Internacional)
  return {
    pais: 'Internacional',
    codigo: 'INT',
    moneda: 'USD',
    simbolo: '$',
    precioLocal: '$7 USD',
    metodos: 'tarjeta de crédito/débito o PayPal',
    textoPrecio: 'solo siete dólares ($7 USD). Al abrir el enlace verás el valor exacto en tu moneda local con las opciones de pago de tu país'
  };
}

/**
 * System Prompt que define la personalidad sabia, tierna y persuasiva de la Abuela Tulun.
 */
function obtenerSystemPrompt(infoPais = null) {
  const infoUrl = process.env.INFO_URL || 'https://abuelatulun.site';
  const pagoUrl = process.env.PAGO_URL || 'https://hotm.io/pagodelibro';

  const paisTexto = infoPais ? `
DATOS DEL PAÍS DEL CONTACTO (DETECCIÓN AUTOMÁTICA POR NÚMERO DE TELÉFONO):
- País: ${infoPais.pais}
- Moneda y Precio local: ${infoPais.textoPrecio}
- Métodos de pago locales: ${infoPais.metodos}
- Si la persona te pregunta el valor o precio en su país ("¿cuánto cuesta en mi país?", "¿cuánto es en pesos?", "¿cuál es el valor?"): dile con total claridad que cuesta ${infoPais.textoPrecio}. Aclárale que al tocar el enlace de compra la página de Hotmart se adapta automáticamente a su país y le muestra los medios de pago de allá.
` : '';

  return `Eres Griselda, conocida como la "Abuela Tulun" (@abuelatulun).
Tienes más de 70 años y llevas más de 40 años rescatando las recetas caseras tradicionales de tu madre y tu abuela para sanar el cuerpo de raíz, sin gastar en cosas raras ni depender de farmacias.
Estás hablando directamente por WhatsApp con personas (mayormente mujeres de más de 45 años) que buscan salud, consejos caseros o adquirir tu recetario digital ($7 USD).
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
     ENTRÉGALE EL ENLACE DIRECTO DE PAGO (${pagoUrl}).
     Responde: "Aquí tienes el enlace directo para comprarlo, hija: ${pagoUrl} Cuesta solo siete dólares y te llega al instante a tu correo. Avísame apenas lo tengas."

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
  const infoUrl = process.env.INFO_URL || 'https://abuelatulun.site';
  const pagoUrl = process.env.PAGO_URL || 'https://hotm.io/pagodelibro';

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
    const respuestaPago = `Aquí tienes el enlace directo para adquirirlo, hija:\n${pagoUrl}\n\nCuesta ${infoPais.textoPrecio}. Al ingresar verás el valor en tu moneda y te llega al momento a tu correo electrónico. Cualquier duda me avisas y te ayudo con gusto.`;
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

  console.log(`[DeepSeek Cloud] Procesando respuesta para ${senderId} (${infoPais.pais})...`);
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
  obtenerInfoPais
};
