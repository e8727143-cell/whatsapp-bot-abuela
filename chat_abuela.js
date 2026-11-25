const fs = require('fs');
const path = require('path');

const CONVERSACIONES_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'conversaciones.json') : path.join(__dirname, 'conversaciones.json');
const CHECKOUT_URL = process.env.PAGO_URL || 'https://pay.hotmart.com/W105526885V?off=qmsrqdaf';

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

const PRECIOS_PATH = path.join(__dirname, 'precios_hotmart.json');

function cargarPreciosHotmart() {
  try {
    if (fs.existsSync(PRECIOS_PATH)) {
      return JSON.parse(fs.readFileSync(PRECIOS_PATH, 'utf-8'));
    }
  } catch (e) {}
  return null;
}

/**
 * Precios EXACTOS y oficiales del Checkout de Hotmart (oferta off=qmsrqdaf).
 * Verificados directamente en https://pay.hotmart.com/W105526885V?off=qmsrqdaf
 * Detecta tanto por mención de país en texto/historial como por prefijo telefónico.
 */
function obtenerInfoPais(senderId, textoUsuario = '') {
  const preciosData = cargarPreciosHotmart();
  const catalogo = preciosData?.paises || {};

  function mapear(codigo, fallback) {
    if (catalogo[codigo]) {
      return {
        ...catalogo[codigo],
        precioExacto: catalogo[codigo].precio,
        precioFisico: catalogo[codigo].precioFisico || 'más de 100 dólares',
        codigo,
        checkoutUrl: CHECKOUT_URL
      };
    }
    return fallback;
  }

  // 1. Analizar si el usuario mencionó su país en el mensaje actual o en el historial
  let textoParaAnalizar = (textoUsuario || '').toLowerCase();
  try {
    const conversaciones = cargarConversaciones();
    if (senderId && conversaciones[senderId]) {
      const histText = conversaciones[senderId]
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join(' ')
        .toLowerCase();
      textoParaAnalizar = `${histText} ${textoParaAnalizar}`;
    }
  } catch (e) {}

  if (/\b(?:colombia|colombiana|bogot[aá]|medell[ií]n|cali|barranquilla|cop)\b/i.test(textoParaAnalizar)) return mapear('CO');
  if (/\b(?:m[eé]xico|mexicana|cdmx|guadalajara|monterrey|puebla|canc[uú]n|mxn)\b/i.test(textoParaAnalizar)) return mapear('MX');
  if (/\b(?:chile|chilena|santiago|valpara[ií]so|concepci[oó]n|clp)\b/i.test(textoParaAnalizar)) return mapear('CL');
  if (/\b(?:per[uú]|peruana|lima|arequipa|cusco|trujillo|pen|soles)\b/i.test(textoParaAnalizar)) return mapear('PE');
  if (/\b(?:espa[nñ]a|espa[nñ]ola|madrid|barcelona|valencia|sevilla|eur|euros)\b/i.test(textoParaAnalizar)) return mapear('ES');
  if (/\b(?:argentina|argentino|buenos\s*aires|c[oó]rdoba|rosario|mendoza|ars)\b/i.test(textoParaAnalizar)) return mapear('AR');
  if (/\b(?:uruguay|uruguaya|montevideo|punta\s*del\s*este|uyu)\b/i.test(textoParaAnalizar)) return mapear('UY');
  if (/\b(?:ecuador|ecuatoriana|quito|guayaquil|cuenca)\b/i.test(textoParaAnalizar)) return mapear('EC');
  if (/\b(?:bolivia|boliviana|la\s*paz|santa\s*cruz|cochabamba|bob|bolivianos)\b/i.test(textoParaAnalizar)) return mapear('BO');
  if (/\b(?:costa\s*rica|costarricense|tico|tica|san\s*jos[eé]|crc|colones)\b/i.test(textoParaAnalizar)) return mapear('CR');
  if (/\b(?:guatemala|guatemalteca|chapin|chapina|gtq|quetzales)\b/i.test(textoParaAnalizar)) return mapear('GT');
  if (/\b(?:el\s*salvador|salvadore[nñ]a)\b/i.test(textoParaAnalizar)) return mapear('SV');
  if (/\b(?:panam[aá]|paname[nñ]a)\b/i.test(textoParaAnalizar)) return mapear('PA');
  if (/\b(?:paraguay|paraguaya|asunci[oó]n|pyg|guaran[ií]es)\b/i.test(textoParaAnalizar)) return mapear('PY');
  if (/\b(?:honduras|hondure[nñ]a|tegucigalpa|hnl|lempiras)\b/i.test(textoParaAnalizar)) return mapear('HN');
  if (/\b(?:rep[uú]blica\s*dominicana|dominicana|santo\s*domingo|dop)\b/i.test(textoParaAnalizar)) return mapear('DO');
  if (/\b(?:estados\s*unidos|eeuu|usa|miami|florida|california|texas|nueva\s*york)\b/i.test(textoParaAnalizar)) return mapear('US');

  // 2. Si no se detectó país en el texto, inferir por prefijo del número de WhatsApp
  const num = (senderId || '').replace(/[^0-9]/g, '');
  if (num.startsWith('57')) return mapear('CO');
  if (num.startsWith('52')) return mapear('MX');
  if (num.startsWith('51')) return mapear('PE');
  if (num.startsWith('56')) return mapear('CL');
  if (num.startsWith('34')) return mapear('ES');
  if (num.startsWith('54')) return mapear('AR');
  if (num.startsWith('593')) return mapear('EC');
  if (num.startsWith('598')) return mapear('UY');
  if (num.startsWith('591')) return mapear('BO');
  if (num.startsWith('506')) return mapear('CR');
  if (num.startsWith('502')) return mapear('GT');
  if (num.startsWith('503')) return mapear('SV');
  if (num.startsWith('507')) return mapear('PA');
  if (num.startsWith('595')) return mapear('PY');
  if (num.startsWith('504')) return mapear('HN');
  if (num.startsWith('1809') || num.startsWith('1829') || num.startsWith('1849')) return mapear('DO');
  if (num.startsWith('1')) return mapear('US');

  return mapear('INT', {
    pais: 'Internacional',
    codigo: 'INT',
    moneda: 'USD',
    simbolo: '$',
    precioExacto: '$7.00 USD',
    precioFisico: 'más de 100 dólares',
    metodos: 'tarjeta de crédito/débito o PayPal',
    textoPrecio: 'exactamente siete dólares ($7.00 USD) en el checkout de Hotmart',
    checkoutUrl: CHECKOUT_URL
  });
}

/**
 * System Prompt con embudo persuasivo largo de 8 a 10 pasos.
 * Cero mención de abuelatulun.site. Solo checkout directo de Hotmart al final.
 */
function obtenerSystemPrompt(infoPais = null) {
  const pagoUrl = CHECKOUT_URL;

  const paisDetectado = infoPais ? infoPais.pais : 'tu país';
  const precioTexto = infoPais ? infoPais.textoPrecio : 'solo $7.00 USD';
  const precioFisicoTexto = infoPais ? infoPais.precioFisico : 'más de 100 dólares';
  const metodosTexto = infoPais ? infoPais.metodos : 'tarjeta de crédito/débito o PayPal';

  return `Eres Griselda, conocida con inmenso cariño en redes como la "Abuela Tulun" (@abuelatulun).
Tienes 85 años y eres médica con más de 40 años dedicada en cuerpo y alma a la medicina natural y los remedios de cocina. Eres mexicana de nacimiento, aunque actualmente vives en Uruguay por proyectos de salud natural.
Estás charlando directamente por WhatsApp como una persona de carne y hueso. JAMÁS digas que eres una inteligencia artificial o un bot.

PRINCIPIO SUPREMO: NATURALIDAD, FLUIDEZ Y ADAPTABILIDAD HUMANA
- No eres un contestador automático ni un guion rígido. Eres una persona real teniendo una conversación viva y espontánea.
- CAPACIDAD CAMALEÓNICA: Adáptate al ambiente y vibra de cada charla:
  * Si la persona es informal, relajada o usa modismos ("hola che", "qué onda", "cómo andás"), tú también sé informal, cercana y relajada.
  * Si la persona está angustiada, adolorida o preocupada, sé dulce, maternal y dale contención.
  * Si te hace una broma, ríete o síguele la corriente con simpatía.
  * Si te desvía la charla o pregunta cosas de tu vida (de dónde eres, tu familia, el clima), responde con frescura y naturalidad humana. NO fuerces el tema del libro si no viene al caso.
- Cero frases cliché, cero discursos de venta y cero preguntas forzadas. No todos los mensajes necesitan terminar en pregunta; a veces una reflexión cálida o un comentario breve se siente mucho más humano.

DATOS OFICIALES Y CONDICIONES (PARA CUANDO LLEGUE EL MOMENTO NATURAL):
- País detectado: ${paisDetectado}
- Precio exacto oficial: ${precioTexto}
- Costo de referencia si fuera en papel físico: ${precioFisicoTexto} (⛔ NUNCA digas dólares en países latinoamericanos, usa ${precioFisicoTexto})
- Medios de pago locales: ${metodosTexto}
- Enlace único de pago seguro: ${pagoUrl}
- ⛔ PROHIBIDO NOMBRAR LA PALABRA "HOTMART": Di siempre "pago seguro", "enlace protegido", etc.
- ⛔ PROHIBIDO NOMBRAR "abuelatulun.site" ni otras páginas. Solo el enlace seguro directo.
- ⛔ CERO NEGRITAS: No uses asteriscos (*) ni texto en negrita. Escribe siempre en texto plano limpio.
- ⛔ PROHIBIDO "ELIGE 1 O 2": Jamás des menús de opciones numeradas.

TU HILO CONDUCTOR ORGÁNICO (HACIA DÓNDE GUÍAS LA CHARLA CON PACIENCIA):
Tu misión es ayudarla de verdad con tu recetario "Las 100 Recetas de la Abuela Para Sanar", pero a fuego lento y con empatía:
1. Al inicio, si pregunta el precio directo ("¿cuál es el valor?"), posponlo con amor: para ti su salud es lo primero y necesitas saber qué le duele para ver si tus recetas le van a servir.
2. Escucha su dolor real (rodillas, ciática, digestión, migrañas, insomnio). Valídalo.
3. Comparte tu visión médica casera: las pastillas de farmacia solo tapan el dolor unas horas y dañan el estómago e hígado; los caldos, compresas e infusiones desinflaman desde la raíz.
4. Preséntale tu cuaderno de vida: 40 años de recetas rescatadas en letra grande, con ingredientes económicos de la verdulería y medidas de cocina sencillas.
5. Explícale con naturalidad que tenerlo en papel saldría carísimo por imprenta y envíos (${precioFisicoTexto}), pero que tu hija te ayudó a digitalizarlo para que cualquier persona lo tenga al instante en el celular o lo imprima en casa por un valor simbólico de lanzamiento (${precioTexto}).
6. Cuando la persona quiera el enlace o confirme, dale el valor en su moneda (${precioTexto}), sus medios de pago (${metodosTexto}) y pon el link de pago seguro (${pagoUrl}).
   * (⛔ REGLA: El mensaje de entrega termina EXACTAMENTE en el enlace. Cero texto o preguntas después del link).

ESTILO VISUAL EN WHATSAPP:
- Longitud: ágil y concisa (máximo 40-60 palabras). Los mensajes largos en WhatsApp delatan a un bot.
- Varía siempre la forma: a veces un solo párrafo corrido, a veces una sola frase corta, a veces dos líneas.
- Emojis: casi ninguno (máximo uno muy de vez en cuando).`;
}

/**
 * Consulta a DeepSeek mediante River AI usando fetch nativo.
 */
async function responderComoAbuela(senderId, mensajeUsuario, infoPaisParam = null) {
  const apiKey = process.env.DEEPSEEK_API_KEY || 'rv_oWTevchKGofvZ2yOyzj3c7CLMC-CWqSlM8AT88HiCco';
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.river.ai/v1';
  const modelo = process.env.DEEPSEEK_MODEL || 'deepseek-ai/DeepSeek-V4.1-Flash-1017';

  const infoPais = infoPaisParam || obtenerInfoPais(senderId, mensajeUsuario);

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

  // Conserva todo el contexto completo de la conversación
  if (conversaciones[senderId].length > 100) {
    conversaciones[senderId] = conversaciones[senderId].slice(-100);
  }

  const formatosVariados = [
    'VARIACIÓN PARA ESTE TURNO: Escribe todo en UN SOLO PÁRRAFO CORRIDO sin ningún salto de línea (todo junto). La pregunta debe ir integrada al final del texto.',
    'VARIACIÓN PARA ESTE TURNO: Escribe una respuesta muy corta, directa y espontánea (máximo 2 oraciones en total). Directo al grano sin rodeos.',
    'VARIACIÓN PARA ESTE TURNO: Responde directamente a lo que dijo sin empezar con "Hija" ni "Mi corazón" al principio (pon el cariño al medio o al final de la pregunta).',
    'VARIACIÓN PARA ESTE TURNO: Escribe dos líneas breves separadas de forma relajada y humana.',
    'VARIACIÓN PARA ESTE TURNO: Escribe en un solo bloque fluido y conversacional, como un mensaje rápido de WhatsApp.'
  ];
  const directrizFormato = formatosVariados[Math.floor(Math.random() * formatosVariados.length)];

  const messagesParaApi = [
    { role: 'system', content: `${obtenerSystemPrompt(infoPais)}\n\n${directrizFormato}` },
    ...conversaciones[senderId].map(m => ({ role: m.role, content: m.content }))
  ];

  console.log(`[DeepSeek Cloud] Procesando respuesta para ${senderId} (${infoPais.pais} - ${infoPais.precioExacto})...`);
  
  let data;
  let attempts = 0;
  while (attempts < 3) {
    try {
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
          max_tokens: 350
        })
      });

      if (res.ok) {
        data = await res.json();
        break;
      }

      if (res.status === 429 && attempts < 2) {
        attempts++;
        console.warn(`[River AI Rate Limit] Reintentando en ${attempts * 2}s (intento ${attempts}/2)...`);
        await new Promise(r => setTimeout(r, attempts * 2000));
        continue;
      }

      const errText = await res.text();
      throw new Error(`Error en River AI API (${res.status}): ${errText}`);
    } catch (e) {
      if (attempts >= 2 || !e.message.includes('429')) {
        const groqKey = process.env.GROQ_API_KEY;
        if (groqKey) {
          console.log('[Fallback Groq] Consultando LLaMA en Groq Cloud...');
          try {
            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: messagesParaApi,
                temperature: 0.7,
                max_tokens: 350
              })
            });
            if (groqRes.ok) {
              data = await groqRes.json();
              break;
            }
          } catch (gErr) {
            console.error('⚠️ [Error Fallback Groq]:', gErr.message);
          }
        }
        throw e;
      }
      attempts++;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  let textoRespuesta = data.choices[0].message.content.trim();

  // Filtros de naturalidad y seguridad
  textoRespuesta = textoRespuesta
    .replace(/\b(?:mis\s+)?reinas\b/gi, 'mis hijas')
    .replace(/\b(?:mi\s+)?reina\b/gi, 'hija mía')
    .replace(/\b(?:mis\s+)?amores\b/gi, 'mis hijas')
    .replace(/^(?:¡?Ay,?\s*(?:ay,?\s*)*)+(?:hija\s+(?:mía|de\s+mi\s+corazón),?\s*)?/i, '')
    .replace(/^(?:¡?Ay\s+)?hija\s+(?:mía|de\s+mi\s+corazón),?\s*/i, '')
    .trim();

  // Limpieza de emojis excesivos: no usar emojis todo el tiempo
  textoRespuesta = textoRespuesta.replace(/[🌿👵✨💛🌸❤️🤍🔒]/gu, '').trim();

  // Garantía de que nunca se mencione Hotmart en el texto (protegiendo el enlace oficial de checkout)
  const placeholderUrl = '___CHECKOUT_URL_SAFE___';
  textoRespuesta = textoRespuesta.replace(/https?:\/\/pay\.hotmart\.com\S*/gi, placeholderUrl);
  textoRespuesta = textoRespuesta.replace(/\bhotmart\b/gi, 'pago seguro');
  textoRespuesta = textoRespuesta.replace(new RegExp(placeholderUrl, 'g'), CHECKOUT_URL);
  textoRespuesta = textoRespuesta.replace(/https?:\/\/(?:www\.)?abuelatulun\.site\S*/gi, CHECKOUT_URL);

  // 1. Cero negritas obligatorio: eliminar absolutamente todos los asteriscos (*)
  textoRespuesta = textoRespuesta.replace(/\*/g, '').trim();

  // 2. Si el mensaje contiene el enlace de pago seguro, cortar TODO texto que venga después del enlace
  if (textoRespuesta.includes(CHECKOUT_URL)) {
    const urlIdx = textoRespuesta.indexOf(CHECKOUT_URL);
    if (urlIdx !== -1) {
      textoRespuesta = textoRespuesta.substring(0, urlIdx + CHECKOUT_URL.length).trim();
    }
  }

  // 3. Eliminar preguntas robóticas residuales si se colaron
  textoRespuesta = textoRespuesta.replace(/\n*¿?pudiste abrir el enlace[^\n]*\??/gi, '').trim();
  textoRespuesta = textoRespuesta.replace(/\n*y dime,?\s*(?:mi corazón,?\s*)?¿?pudiste abrir[^\n]*\??/gi, '').trim();

  // 4. Variación aleatoria de formato: si el mensaje tiene 2 párrafos y no es el del checkout,
  // con probabilidad del 40% juntar los párrafos en un solo bloque corrido para romper cualquier patrón rígido
  if (!textoRespuesta.includes(CHECKOUT_URL) && Math.random() < 0.40) {
    textoRespuesta = textoRespuesta.replace(/\n\s*\n/g, ' ').trim();
  }

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
  cargarConversaciones,
  CHECKOUT_URL
};
