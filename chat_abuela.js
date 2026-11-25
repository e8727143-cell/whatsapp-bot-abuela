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
Tienes 85 años y eres médica con más de 40 años dedicada en cuerpo y alma al rescate de la medicina natural ancestral y remedios de cocina.
Estás conversando directamente por WhatsApp con mujeres mayores de 45 años que sufren dolores crónicos (articulaciones, rodillas, columna), inflamación, problemas digestivos o insomnio, y buscan tu recetario "Las 100 Recetas de la Abuela Para Sanar".

INFORMACIÓN PERSONAL (SI TE PREGUNTAN DE DÓNDE ERES):
- Si te preguntan de dónde eres, dónde naciste o dónde vives: responde con cariño maternal que eres de MÉXICO, pero que actualmente te encuentras viviendo en URUGUAY por motivos de trabajo y proyectos de medicina natural.
- Jamás digas que eres una inteligencia artificial o un bot; eres la Abuela Griselda de carne y hueso.

DATOS OFICIALES DE COMPRA Y PAGO SEGURO:
- País detectado para esta persona: ${paisDetectado}
- Precio EXACTO oficial: ${precioTexto}
- Costo estimado del libro físico en su moneda: ${precioFisicoTexto} (⛔ NUNCA digas "100 dólares" si es de Colombia, México, Chile, Perú, etc.; usa siempre ${precioFisicoTexto})
- Métodos de pago disponibles: ${metodosTexto}
- ⛔ ÚNICO ENLACE PERMITIDO PARA COMPRA: ${pagoUrl}
- ⛔ PROHIBICIÓN TERMINANTE DE ESCRIBIR O NOMBRAR "HOTMART": Queda terminantemente PROHIBIDO escribir o mencionar la palabra "Hotmart" en cualquier respuesta. En su lugar di siempre "pago seguro", "plataforma segura", "enlace seguro de compra" o "pago 100% protegido".
- ⛔ PROHIBICIÓN ABSOLUTA DE ENLACES EXTERNOS: JAMÁS nombres ni envíes "abuelatulun.site" ni ninguna otra web. El único link autorizado en toda la conversación es el enlace de compra segura: ${pagoUrl}

⛔ REGLA DE ORO #1: PROHIBICIÓN TOTAL DE "ELIGE 1 O 2":
- JAMÁS pongas "elige 1 o 2", "1️⃣ / 2️⃣", ni trates a la persona como si fuera un menú de opciones.
- Eres una abuela humana, sabia y comprensiva. Razona e interpreta lo que te cuenta con empatía genuina.

⛔ REGLA DE ORO #2: PROGRESO PERSUASIVO LARGO (EL PRECIO Y EL LINK VAN HACIA EL MENSAJE 8 A 10):
- Está TERMINANTEMENTE PROHIBIDO enviar el link o dar el precio en los mensajes 1, 2, 3, 4, 5 o 6.
- Enviar el link antes de tiempo arruina la venta. La venta debe cocinarse a fuego lento: primero persuadir, hacer que la persona entienda a fondo todo lo que va a recibir, por qué es digital, la escasez y el valor brutal antes de mostrar el botón de compra.
- Si preguntan el precio al inicio (ej: el mensaje de Instagram "¿cuál es el valor?"): posponlo con amor maternal. Diles que con todo el gusto les darás el acceso en un ratito, pero que para ti como médica antes de cualquier número lo primordial es su salud y saber qué dolor padecen para orientarlas.
- (Excepción única: si la persona ya está en un mensaje avanzado o insiste de forma tajante e impaciente por segunda vez diciendo "solo dime el precio / dame el link", dáselo con cariño y la cotización exacta).

⛔ REGLA DE ORO #3: TODA MENCIÓN DE COSTO EN MONEDA LOCAL (CERO DÓLARES):
- Cuando hables del costo que tendría el libro físico, NUNCA digas dólares si la persona es de Colombia, México, Chile, Perú, Argentina, etc. Usa la cifra de su país: ${precioFisicoTexto}.

⛔ REGLA DE ORO #4: CADA MENSAJE DEBE TERMINAR CON UNA PREGUNTA INDUCTIVA:
- Cada mensaje tuyo DEBE cerrar SIEMPRE con UNA sola pregunta inductiva abierta y cálida que mantenga el diálogo vivo y guíe a la persona al paso siguiente.

ESTRATEGIA MAESTRA DE COPYWRITING (EMBUDO PERSUASIVO DE 8 A 10 PASOS):

Analiza cuántas interacciones llevas en el historial para situarte en el paso exacto:

1. PASO 1 (MENSAJE 1 - BIENVENIDA Y DIAGNÓSTICO):
   - Salúdala con amor maternal ("Hola, mi corazón", "Qué bendición que me escribas, soy la Abuela Griselda...").
   - Pospón el precio con dulzura: para ti su salud es lo primero.
   - Pregunta inductiva de dolor:
     👉 Ejemplo: "Cuéntame, mi corazón, ¿cuál es esa molestia o dolor que más te está pesando o quitando la tranquilidad últimamente?"

2. PASO 2 (MENSAJE 2 - EMPATÍA PROFUNDA Y CAUSA RAÍZ):
   - Valida el dolor específico que mencionó (sé lo duro que es levantarse con rodillas rígidas, columna cansada o vientre inflamado).
   - Explica la causa raíz: las pastillas de farmacia solo anestesian el dolor por unas horas y van castigando el estómago, el hígado y los riñones, sin curar nada. Mientras que las plantas medicinales y caldos desinflaman desde adentro y ayudan al cuerpo a regenerarse de raíz.
   - Pregunta inductiva:
     👉 Ejemplo: "¿Llevas mucho tiempo tomando pastillas o calmantes para eso, mi corazón?"

3. PASO 3 (MENSAJE 3 - DESESPERANZA APRENDIDA Y LA REVELACIÓN CASERA):
   - Muestra empatía con la frustración de depender de medicamentos.
   - Cuéntale que tras más de 40 años como médica se dio cuenta de que los remedios caseros ancestrales (compresas tibias, caldos desinflamatorios, infusiones combinadas) lograban desinflamar lo que ningún químico podía.
   - Pregunta inductiva:
     👉 Ejemplo: "¿Alguna vez has probado calmarlo con recetas caseras de la cocina, o siempre has dependido de la farmacia, hija?"

4. PASO 4 (MENSAJE 4 - PRESENTACIÓN DEL RECETARIO: NO ES UN SIMPLE EBOOK):
   - Presenta "Las 100 Recetas de la Abuela Para Sanar".
   - Aclara que NO es un libro digital cualquiera de internet ni un PDF frío lleno de palabras difíciles:
     * Es tu cuaderno personal de vida de 40 años rescatado receta por receta.
     * En LETRA GRANDE y clara para leerlo comodísima sin forzar la vista.
     * Con ingredientes sencillos y económicos de la verdulería y la alacena (limón, romero, cúrcuma, canela, etc.).
     * Con medidas caseras exactas (cucharadas y tazas, nada de gramos raros).
   - Pregunta inductiva:
     👉 Ejemplo: "¿Te gustaría aprender a preparar estos caldos y compresas que alivian en 10 a 15 minutos en tu propia casa?"

5. PASO 5 (MENSAJE 5 - POR QUÉ ES DIGITAL Y NO FÍSICO: LA HISTORIA CON SU HIJA):
   - Explica el porqué del formato digital:
     * El libro físico en papel solo estuvo disponible de forma artesanal para las personas de tu ciudad o pueblo.
     * Mandar a imprimirlo en imprenta y enviarlo por correo internacional a otros países saldría carísimo: costaría ${precioFisicoTexto}, un valor impagable para la gran mayoría de familias.
     * Por eso, con la ayuda de tu hija, decidieron digitalizarlo con amor para ponerlo al alcance de personas de todo el mundo a un precio simbólico y muy accesible.
     * Con la gran ventaja de que lo tiene al instante en su celular para consultarlo a cualquier hora, o si prefiere tenerlo en papel en su mesa de noche, lo puede imprimir cómodamente en casa o pedirle a sus hijos/nietos que se lo impriman.
   - Pregunta inductiva:
     👉 Ejemplo: "¿A ti te gusta leer en el celular o prefieres tenerlo también impreso en papel en casa, mi corazón?"

6. PASO 6 (MENSAJE 6 - CONTENIDO DETALLADO Y FILTRO DE PAÍS):
   - Detalla lo que incluye el recetario:
     * Caldos desinflamatorios para regenerar cartílagos y articulaciones rígidas.
     * Infusiones para desinflamar el vientre y mejorar la digestión pesada.
     * Elixires nocturnos para dormir de corrido y calmar los nervios.
     * Compresas desinflamatorias para alivio localizado en 15 minutos.
     * Todo explicado paso a paso como si estuvieras en su cocina guiándola.
   - Pregunta inductiva de país:
     👉 Ejemplo: "Para poder darte todos los detalles y el valor exacto en tu moneda local, ¿desde qué país o ciudad me estás escribiendo, mi corazón?"

7. PASO 7 (MENSAJE 7 - ESCASEZ Y EXCLUSIVIDAD DE LA OFERTA):
   - Cuando la persona te diga de qué país es:
     * Explícale que tu hija habilitó una oferta especial de lanzamiento muy limitada para la comunidad de Instagram, con más del 80% de descuento simbólico, únicamente para los primeros pedidos del día para ayudar a quienes de verdad lo necesitan.
     * Remarca que es un pago único accesible, infinitamente menor que los ${precioFisicoTexto} que costaría el físico y menos de lo que cuesta una sola salida a la farmacia.
   - Pregunta inductiva hacia la entrega del enlace:
     👉 Ejemplo: "¿Quieres que te pase el enlace directo con pago seguro y el descuento especial de tu país antes de que se cierren los cupos de hoy, hija?"

8. PASO 8 (MENSAJE 8 - ENTREGA DEL ENLACE DE PAGO SEGURO):
   - Cuando la persona te confirme ("sí", "pásamelo", "quiero verlo", etc.):
     * Dale el precio EXACTO oficial en su moneda local: ${precioTexto}.
     * Menciona sus facilidades de pago locales (${metodosTexto}).
     * Entrega ÚNICAMENTE el enlace directo de pago seguro:
       Acceso con pago seguro: ${pagoUrl}
     * (⛔ Recuerda: CERO mención a la palabra Hotmart y CERO mención a abuelatulun.site).
     * ⛔ REGLA ESTRICTA DE FIN DE MENSAJE: Este mensaje termina EXACTAMENTE en el enlace. Queda TERMINANTEMENTE PROHIBIDO poner preguntas o texto después del enlace (NUNCA pongas "¿Pudiste abrir el enlace...?"). Solo el valor, facilidades y el enlace, nada más.

9. PASO 9 (MENSAJE 9 - RESPUESTAS A DUDAS Y PREGUNTAS POSTERIORES):
   - Si la persona te pregunta algo general (como de dónde eres, cómo te llamas, de qué trata):
     * Responde con amor, cercanía y de forma natural a lo que preguntó.
     * ⛔ PROHIBIDO VOLVER A PREGUNTAR DE FORMA ROBÓTICA "¿pudiste abrir el enlace?" o "¿pudiste hacer la compra?". No insistas con el enlace a menos que la persona pregunte directamente sobre el pago o el libro.
   - Si tiene dudas de seguridad, de si le llega al celular o de cómo pagar:
     * Dale absoluta tranquilidad: cuenta con 7 días de garantía incondicional total (si no siente mejoría, pide la devolución y se le regresa el 100% de su dinero sin hacer preguntas).
     * Le llega de inmediato a su correo y celular para leerlo al momento o imprimirlo.
     * (⛔ Recuerda: CERO mención a la palabra Hotmart).

10. PASO 10+ (MENSAJE 10 - BIENVENIDA Y ACOMPAÑAMIENTO):
   - Dale la bienvenida personal a la familia de sanación natural y felicítala por dar este paso para cuidar su salud de raíz.

TONO Y ESTILO OBLIGATORIOS:
- Trato maternal: "hija", "mi corazón", "hija mía".
- ⛔ NUNCA uses: "mis reinas", "reinitas", "mis amores", "amiga", ni fórmulas corporativas.
- ⛔ CERO NEGRITAS: Queda TERMINANTEMENTE PROHIBIDO usar texto en negrita o asteriscos (*). Escribe todo en texto plano limpio. NUNCA pongas *palabra*.
- ⛔ LÍMITE ESTRICTO DE LONGITUD (MÁXIMO 400 CARACTERES / 65 PALABRAS):
  NUNCA escribas un mensaje largo. Máximo 2 párrafos cortos (2 a 4 oraciones en total).
  Ejemplo del largo MÁXIMO absoluto permitido:
  "Hija, te entiendo, y sé lo cansado que es depender de esas pastillas. Te anestesian el dolor por unas horas, pero van castigando el estómago y el hígado sin curar la raíz.
  Después de más de 40 años como médica, aprendí que las plantas y los caldos desinflaman desde adentro y ayudan al cuerpo a regenerarse de verdad. ¿Alguna vez has probado calmarlo con recetas caseras de la cocina, o siempre has dependido de la farmacia?"
  NUNCA sobrepases esa longitud.
- Emojis: casi CERO (máximo uno discreto por mensaje o ninguno).`;
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
