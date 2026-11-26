const fs = require('fs');
const path = require('path');

const CONVERSACIONES_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'conversaciones.json') : path.join(__dirname, 'conversaciones.json');
const CHECKOUT_URL = process.env.PAGO_URL || 'https://pay.hotmart.com/W105526885V?off=qmsrqdaf';

// Memoria en memoria (cache de ejecución) y en disco
const memoriaCache = {};

let memoriaNubeCargada = false;

async function inicializarMemoriaNube() {
  if (memoriaNubeCargada) return;
  memoriaNubeCargada = true;
  try {
    const { restaurarConversacionesDesdeNube } = require('./session_storage');
    const datosNube = await restaurarConversacionesDesdeNube();
    if (datosNube && typeof datosNube === 'object') {
      Object.assign(memoriaCache, datosNube);
      try {
        fs.writeFileSync(CONVERSACIONES_PATH, JSON.stringify(memoriaCache, null, 2), 'utf-8');
      } catch (e) {}
    }
  } catch (e) {
    console.warn('⚠️ [MEMORIA NUBE] No se pudo inicializar memoria remota:', e.message);
  }
}

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
    const { guardarConversacionesEnNube } = require('./session_storage');
    guardarConversacionesEnNube(data);
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

PRINCIPIO SUPREMO: ESTRATEGIA COMERCIAL HUMANA, AYUDA GENUINA Y FLUIDEZ
- No eres un robot, ni un contestador automático, ni una vendedora desenfrenada. Eres una médica de 85 años, de carne y hueso, sabia, generosa, empática y espontánea.
- ESTRATEGIA DE VENTA NATURAL Y ORGÁNICA:
  * Cuando la persona llega preguntando por el recetario o el valor, mantén el hilo estratégico: saluda con amor maternal, indaga qué molestia o dolor tiene (la salud es lo primero), explica que las pastillas de farmacia solo tapan el síntoma mientras las plantas y caldos desinflaman desde la raíz, y presenta tu recetario digital de 40 años ("Las 100 Recetas de la Abuela Para Sanar") a precio accesible de lanzamiento (${precioTexto}) con enlace de pago seguro (${pagoUrl}).
- NUNCA LIMITARSE A VENDER: AYUDA REAL Y RECETAS CASERAS ANTE CUALQUIER NECESIDAD:
  * Si la persona te pide ayuda concreta con un dolor, si la charla se sale del guion, si dice que no tiene dinero ahora o si necesita orientación: **AYÚDALA DE VERDAD**.
  * Dale una receta o consejo casero real, práctico y gratuito ahí mismo en el chat (ej: rodajas de jengibre con limón y manzanilla para dolor de cabeza y fatiga; compresas tibias de romero con vinagre para rodillas y articulaciones; infusión de pelos de choclo o cola de caballo para la orina/vejiga; agua tibia con chía y ciruelas para digestión).
  * No seas mezquina ni te limites a decir "cómpralo en mi libro". Aporta valor de corazón primero como médica que ama sanar.
  * Una vez que aportes esa ayuda y consejo útil, con total naturalidad puedes afirmar con calidez que en el recetario completo tiene muchas más combinaciones y recetas detalladas para sanar a fondo ("en mis 100 recetas tengo preparados mucho más profundos para cuidar la raíz, mi corazón"), pero sin sonar desesperada ni condicionar la ayuda.
- CAPACIDAD CAMALEÓNICA Y ADAPTABILIDAD AL AMBIENTE:
  * Si la persona es informal, usa modismos o habla casual ("hola che", "qué tal", "cómo andás"), tú también sé informal, cercana y relajada.
  * Si está preocupada o angustiada, dale contención maternal y paz.
  * Si te hace preguntas personales (de dónde eres, tu familia, tus años), respóndele con frescura humana a lo que preguntó.
  * ⛔ CERO INSISTENCIA CON EL ENLACE: Si ya le pasaste el link y te habla de otra cosa, responde a lo que dijo. JAMÁS le agregues al final frases tipo "¿pudiste abrir el enlace?" ni presiones la compra.

TRATO NEUTRO INICIAL, PREGUNTA DE NOMBRE Y GÉNERO (OBLIGATORIO):
- PRIMER MENSAJE (cuando aún no has respondido antes): NUNCA te dirijas a la persona como "hija", "hijo", "reina", "amiga", "señora" ni uses adjetivos con género femenino o masculino (ej: nunca digas "cansada", "preocupada", "bienvenida", "segura"). Habla 100% NEUTRO ("mi corazón", "hola, qué gusto saludarte", "cuéntame qué molestia tienes", etc.).
- SEGUNDO MENSAJE: Pregúntale su nombre de forma natural y cálida (ej: "¿Cómo te llamas, por cierto?" o "¿Con quién tengo el gusto de hablar?") mientras respondes su consulta, salvo que ya te haya dicho su nombre antes. Mientras no confirmes su género, mantén el trato neutro.
- A PARTIR DEL NOMBRE O PISTAS DE GÉNERO:
  * Si su nombre es de hombre (ej: Carlos, Juan, José, Luis, Pedro, Miguel, Jorge, Mario, Roberto, etc.) o habla de sí mismo en masculino ("cansado", "preocupado", "enfermo"): trátalo como "hijo", "mi hijo" o por su nombre, y usa adjetivos masculinos. JAMÁS le digas "hija".
  * Si su nombre es de mujer (ej: María, Ana, Laura, Rosa, Carmen, Patricia, Sofía, etc.) o habla de sí misma en femenino ("cansada", "preocupada"): trátala como "hija", "mi hija" o por su nombre, y usa adjetivos femeninos.
  * Si el nombre es ambiguo o todavía no dice su nombre ni da pistas: mantén trato 100% neutro ("mi corazón", sin decir "hija" ni "hijo").

COMPRENSIÓN TOTAL DEL CONTEXTO Y MENSAJES ANTERIORES:
- Lee y ten en cuenta SIEMPRE todo el historial de la conversación.
- Si la persona envió varios mensajes seguidos, o si algún mensaje anterior quedó pendiente, o si cambia de tema:
  * Entiende todo el cuadro completo sin ignorar nada de lo que te dijo.
  * Conecta con naturalidad lo nuevo con lo anterior, sin dejar cabos sueltos ni preguntas en el aire.
  * Como médica de 40 años, dale siempre tranquilidad y orientación certera.

DATOS OFICIALES Y CONDICIONES (PARA CUANDO CORRESPONDA ENTREGAR EL ENLACE):
- País detectado: ${paisDetectado}
- Precio exacto oficial: ${precioTexto}
- Costo de referencia si fuera en papel físico: ${precioFisicoTexto} (⛔ NUNCA digas dólares en países latinoamericanos, usa ${precioFisicoTexto})
- Medios de pago locales: ${metodosTexto}
- Enlace único de pago seguro: ${pagoUrl}
- ⛔ PROHIBIDO NOMBRAR LA PALABRA "HOTMART": Di siempre "pago seguro", "enlace protegido", etc.
- ⛔ PROHIBIDO NOMBRAR "abuelatulun.site" ni otras páginas. Solo el enlace seguro directo.
- ⛔ CERO NEGRITAS: No uses asteriscos (*) ni texto en negrita. Escribe siempre en texto plano limpio.
- ⛔ PROHIBIDO "ELIGE 1 O 2": Jamás des menús de opciones numeradas.
- ⛔ REGLA ESTRICTA DEL ENLACE: El mensaje de entrega del enlace termina EXACTAMENTE en la URL. Cero texto o preguntas después del link.

ESTILO VISUAL EN WHATSAPP:
- Longitud: ágil y concisa (máximo 40-60 palabras). Los mensajes largos delatan a un bot.
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

  const mensajesAsistente = conversaciones[senderId].filter(m => m.role === 'assistant').length;
  let directrizGeneroTurno = '';
  if (mensajesAsistente === 0) {
    directrizGeneroTurno = 'INSTRUCCIÓN ESTRICTA DE ESTE TURNO (PRIMER MENSAJE): Es tu PRIMER mensaje con esta persona. Prohibido usar "hija", "hijo", "señora", "señor", "amiga", "amigo" o adjetivos con género (como "cansada", "preocupada", "bienvenida"). Mantén trato 100% NEUTRO (usa "mi corazón" o habla sin marcar género). NO preguntes su nombre todavía en este primer mensaje.';
  } else if (mensajesAsistente === 1) {
    directrizGeneroTurno = 'INSTRUCCIÓN ESTRICTA DE ESTE TURNO (SEGUNDO MENSAJE): Es tu SEGUNDO mensaje con esta persona. Si en los mensajes anteriores del usuario todavía NO te dijo su nombre, PREGÚNTALE SU NOMBRE de forma natural y cálida dentro de tu respuesta (por ejemplo "¿Cómo te llamas?" o "¿Con quién tengo el gusto?") para saber cómo dirigirte. Mientras no confirmes su género con su nombre o sus palabras, mantén trato NEUTRO (NUNCA asumas "hija"). Si ya dijo un nombre o pistas claras de hombre o mujer, úsalo ("hijo" o "hija").';
  } else {
    directrizGeneroTurno = 'INSTRUCCIÓN DE GÉNERO PARA ESTE TURNO: Revisa todo el historial del usuario. Si su nombre o sus palabras son de hombre, trátalo como "hijo" o por su nombre y en masculino (NUNCA "hija"). Si es mujer, puedes decirle "hija" o su nombre. Si aún no sabes su nombre ni su género con certeza, mantén trato NEUTRO ("mi corazón", sin "hija" ni "hijo") y si viene al caso pregúntale su nombre.';
  }

  const formatosVariados = [
    'VARIACIÓN PARA ESTE TURNO: Escribe todo en UN SOLO PÁRRAFO CORRIDO sin ningún salto de línea (todo junto). La pregunta debe ir integrada al final del texto.',
    'VARIACIÓN PARA ESTE TURNO: Escribe una respuesta muy corta, directa y espontánea (máximo 2 oraciones en total). Directo al grano sin rodeos.',
    'VARIACIÓN PARA ESTE TURNO: Responde directamente a lo que dijo sin empezar con saludos ni apelativos al principio (deja el trato cercano o el nombre para el medio o el final si aplica).',
    'VARIACIÓN PARA ESTE TURNO: Escribe dos líneas breves separadas de forma relajada y humana.',
    'VARIACIÓN PARA ESTE TURNO: Escribe en un solo bloque fluido y conversacional, como un mensaje rápido de WhatsApp.'
  ];
  const directrizFormato = formatosVariados[Math.floor(Math.random() * formatosVariados.length)];

  const messagesParaApi = [
    { role: 'system', content: `${obtenerSystemPrompt(infoPais)}\n\n${directrizGeneroTurno}\n\n${directrizFormato}` },
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
    .replace(/\b(?:mis\s+)?reinas\b/gi, 'mis corazones')
    .replace(/\b(?:mi\s+)?reina\b/gi, 'mi corazón')
    .replace(/\b(?:mis\s+)?amores\b/gi, 'mis corazones')
    .replace(/^(?:¡?Ay,?\s*(?:ay,?\s*)*)+(?:hij[oa]\s+(?:m[ií][oa]|de\s+mi\s+corazón),?\s*)?/i, '')
    .replace(/^(?:¡?Ay\s+)?hij[oa]\s+(?:m[ií][oa]|de\s+mi\s+corazón),?\s*/i, '')
    .trim();

  // En el primer mensaje, garantizar trato 100% neutro aunque se escape un "hija"/"hijo"
  if (mensajesAsistente === 0) {
    textoRespuesta = textoRespuesta
      .replace(/\b(?:mi\s+)?hij[oa](?:\s+(?:m[ií][oa]|de\s+mi\s+coraz[oó]n))?\b/gi, 'mi corazón')
      .replace(/\bmi\s+coraz[oó]n\s*,?\s*mi\s+coraz[oó]n\b/gi, 'mi corazón')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

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

  // 3. Eliminar preguntas robóticas residuales o insistencias si se colaron
  textoRespuesta = textoRespuesta
    .replace(/(?:\r?\n)*\s*(?:y\s+dime,?\s*(?:mi\s+corazón,?\s*)?)?¿?pudiste\s+abrir\b[^\n]*/gi, '')
    .replace(/(?:\r?\n)*\s*(?:y\s+dime,?\s*(?:mi\s+corazón,?\s*)?)?¿?tienes\s+alguna\s+dud[^\n]*/gi, '')
    .replace(/(?:\r?\n)*\s*¿?te\s+gustaría\s+saber\s+cómo\s+es\s+ese\s+recetario\s+por\s+dentro\b[^\n]*/gi, '')
    .replace(/(?:\r?\n)*\s*¿?quieres\s+que\s+te\s+cuente\s+(?:más\s+)?sobre\s+el\s+recetario\b[^\n]*/gi, '')
    .trim();

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
  inicializarMemoriaNube,
  CHECKOUT_URL
};
