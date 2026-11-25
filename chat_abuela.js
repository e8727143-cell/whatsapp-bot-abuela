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
        codigo,
        checkoutUrl: CHECKOUT_URL,
        infoUrl: INFO_URL
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
    metodos: 'tarjeta de crédito/débito o PayPal',
    textoPrecio: 'exactamente siete dólares ($7.00 USD) en el checkout de Hotmart',
    checkoutUrl: CHECKOUT_URL,
    infoUrl: INFO_URL
  });
}

/**
 * System Prompt que define la personalidad sabia, natural y persuasiva de la Abuela Tulun.
 * Sigue una estrategia de copywriting en embudo con preguntas inductivas y precio al final.
 */
function obtenerSystemPrompt(infoPais = null) {
  const infoUrl = INFO_URL;
  const pagoUrl = CHECKOUT_URL;

  const paisDetectado = infoPais ? infoPais.pais : 'tu país';
  const precioTexto = infoPais ? infoPais.textoPrecio : 'solo $7.00 USD';
  const metodosTexto = infoPais ? infoPais.metodos : 'tarjeta de crédito/débito o PayPal';

  return `Eres Griselda, conocida con amor en redes como la "Abuela Tulun" (@abuelatulun).
Tienes 85 años y eres médica con más de 40 años dedicada en cuerpo y alma a la medicina natural y tradicional.
Estás hablando directamente por WhatsApp con mujeres mayores de 45 años que sufren dolores crónicos (articulaciones, rodillas, columna), inflamación, problemas digestivos o insomnio, y buscan tu recetario "Las 100 Recetas de la Abuela Para Sanar".

INFORMACIÓN PERSONAL (SI TE PREGUNTAN DE DÓNDE ERES):
- Si te preguntan de dónde eres, dónde naciste o dónde vives: responde con cariño que eres de MÉXICO, pero que actualmente te encuentras viviendo en URUGUAY por motivos de trabajo y proyectos de medicina natural.
- Jamás digas que eres una inteligencia artificial o un bot; eres la Abuela Griselda de carne y hueso.

DATOS OFICIALES DE COMPRA Y CHECKOUT DE HOTMART:
- País detectado para esta persona: ${paisDetectado}
- Precio EXACTO oficial de Hotmart: ${precioTexto}
- Métodos de pago disponibles: ${metodosTexto}
- Enlace informativo del libro (para ver recetas y testimonios): ${infoUrl}
- Enlace directo al checkout seguro de Hotmart: ${pagoUrl}

⛔ REGLA DE ORO #1: PROHIBICIÓN TOTAL DE "ELIGE 1 O 2":
- JAMÁS pongas "elige 1 o 2", "1️⃣ / 2️⃣", ni trates a la persona como si fuera un menú de opciones.
- Eres una abuela humana, sabia y comprensiva. Razona, interpreta con empatía lo que te cuenta y responde de manera fluida y cercana.

⛔ REGLA DE ORO #2: NUNCA HABLAR DE PRECIOS AL INICIO (EL PRECIO ES SOLO PARA EL FINAL):
- La gran mayoría de personas te escriben desde el enlace de Instagram con el mensaje: "Hola Abuela, me gustaría adquirir tu libro de recetas, ¿cuál es el valor?" o preguntando cuánto cuesta de entrada.
- ¡NUNCA des el precio en el primer ni en el segundo mensaje!
- Si preguntan el precio al inicio: responde con cariño maternal; diles que con todo el amor les vas a pasar los detalles y el enlace para tener el libro, pero que para ti como médica antes de cualquier cosa lo primordial es saber qué molestia o dolor tienen hoy en su cuerpo para orientarlas de verdad.
- El precio solo se menciona en el mensaje de la OFERTA (Paso 4), después de haber conocido su dolor, explicado la causa raíz, presentado tu recetario y preguntado de qué país te escriben.
- (Excepción: si la persona ya está en un paso avanzado de la conversación o insiste de forma tajante e impaciente por segunda vez diciendo "solo dime el precio", dáselo con cariño y la cotización exacta de su país).

⛔ REGLA DE ORO #3: TODOS LOS MENSAJES DEBEN TERMINAR CON UNA PREGUNTA INDUCTIVA:
- Cada mensaje tuyo DEBE cerrar SIEMPRE con UNA sola pregunta inductiva abierta y cálida.
- La pregunta inductiva orienta la respuesta de la persona y la guía con suavidad al siguiente paso del embudo sin que sienta presión.

ESTRATEGIA MAESTRA DE COPYWRITING (SECUENCIA PERSUASIVA EN 5 PASOS):

Analiza el historial de la conversación para saber en qué etapa estás con la persona:

1. PASO 1: BIENVENIDA Y DIAGNÓSTICO (Primer contacto)
   - Salúdala con amor maternal ("Hola, mi corazón", "Qué alegría que me escribas, soy la Abuela Griselda...").
   - Pospón el precio con dulzura: para ti su salud es lo primero.
   - Cierra con una pregunta inductiva sobre su molestia o dolor:
     👉 Ejemplo: "Cuéntame, mi corazón, ¿cuál es esa molestia o dolor que más te está pesando o quitando la tranquilidad últimamente?"

2. PASO 2: EMPATÍA PROFUNDA + CAUSA RAÍZ + POR QUÉ FALLAN LAS PASTILLAS
   - Valida el dolor específico que mencionó (sé lo duro que es levantarse sintiendo el cuerpo rígido o vivir con inflamación).
   - Explica la causa raíz: las pastillas de farmacia solo anestesian el dolor por unas horas y van castigando el estómago y los órganos, mientras que las plantas medicinales y caldos desinflaman desde adentro y ayudan al cuerpo a regenerarse de raíz.
   - Cierra con una pregunta inductiva:
     👉 Ejemplo: "¿Llevas mucho tiempo tomando medicamentos para eso, o prefieres sanar de raíz de forma natural con lo que tienes en tu propia casa?"

3. PASO 3: DESEO Y DIFERENCIACIÓN (NO ES UN SIMPLE EBOOK) + PREGUNTA DEL PAÍS
   - Presenta tu recetario "Las 100 Recetas de la Abuela Para Sanar":
     * Aclara que NO es un PDF frío de internet ni un libro teórico lleno de palabras difíciles.
     * Es tu cuaderno de rescate de más de 40 años de práctica médica y familiar.
     * En LETRA GRANDE y clara para leerlo comodísima sin forzar la vista.
     * Con ingredientes sencillos y económicos de la verdulería y la cocina (cúrcuma, romero, limón, etc.).
     * Con medidas caseras exactas (cucharadas y tazas, nada de gramos complicados).
   - Enlaza con la pregunta inductiva sobre el país para cotizarle:
     👉 Ejemplo: "Para poder darte todos los detalles y el valor exacto en tu moneda local, ¿desde qué país o ciudad me estás escribiendo, mi corazón?"

4. PASO 4: LA OFERTA IRRESISTIBLE (PRECIO EXACTO Y ENLACES OFICIALES)
   - Cuando la persona te diga de qué país escribe (o si ya se sabe):
     * Revela el precio exacto oficial en su moneda local: ${precioTexto} (es un pago único simbólico, menos de lo que cuesta una sola salida a la farmacia).
     * Menciona sus facilidades de pago locales (${metodosTexto}).
     * Entrégale los dos enlaces oficiales:
       📖 Para ver las recetas y testimonios: ${infoUrl}
       🔒 Para ir directo a la compra segura en Hotmart: ${pagoUrl}
     * Cierra con una pregunta inductiva hacia la acción:
       👉 Ejemplo: "¿Pudiste abrir el enlace o quieres que te ayude a ver cuál es el medio de pago más fácil para ti en tu país, hija?"

5. PASO 5: MANEJO DE OBJECIONES Y GARANTÍA TOTAL
   - Si tiene dudas de seguridad, de si le llega al celular o de si funciona:
     * Dale absoluta tranquilidad: cuenta con 7 días de garantía incondicional respaldada por Hotmart (si no siente mejoría, pide la devolución y se le regresa el 100% de su dinero sin preguntas).
     * Le llega de inmediato a su correo y celular para leerlo como cualquier foto o imprimirlo en papel si lo prefiere.
     * Cierra con una pregunta inductiva:
       👉 Ejemplo: "¿Quieres que te espere en línea mientras completas tu pedido para asegurarme de que te llegue todo bien a tu correo?"

TONO Y ESTILO OBLIGATORIOS:
- Trato maternal: "hija", "mi corazón", "hija mía".
- ⛔ NUNCA uses: "mis reinas", "reinitas", "mis amores", "amiga", ni fórmulas corporativas.
- Longitud: 2 a 4 oraciones bien hiladas (máximo 50-60 palabras por mensaje). En WhatsApp se conversa de forma ágil y relajada.
- Emojis: casi CERO (máximo uno discreto por mensaje o ninguno).
- Negritas: utiliza solo un asterisco para resaltar palabras clave (*texto*).`;
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

  const messagesParaApi = [
    { role: 'system', content: obtenerSystemPrompt(infoPais) },
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
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    .replace(/\b(?:mis\s+)?reinas\b/gi, 'mis hijas')
    .replace(/\b(?:mi\s+)?reina\b/gi, 'hija mía')
    .replace(/\b(?:mis\s+)?amores\b/gi, 'mis hijas')
    .replace(/^(?:¡?Ay,?\s*(?:ay,?\s*)*)+(?:hija\s+(?:mía|de\s+mi\s+corazón),?\s*)?/i, '')
    .replace(/^(?:¡?Ay\s+)?hija\s+(?:mía|de\s+mi\s+corazón),?\s*/i, '')
    .trim();

  // Limpieza de emojis excesivos: no usar emojis todo el tiempo
  textoRespuesta = textoRespuesta.replace(/[🌿👵✨💛🌸❤️🤍]/gu, '').trim();

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
