const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    downloadContentFromMessage
} = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { responderComoAbuela } = require('./chat_abuela');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

// Rutas a los audios nativos del embudo
const audio1Path = path.join(__dirname, 'audio_1_bienvenida.ogg');
const audio2Path = path.join(__dirname, 'audio_2_solucion_ebook.ogg');
const estadosPath = path.join(__dirname, 'estados_clientes.json');

function cargarEstados() {
    try {
        if (fs.existsSync(estadosPath)) {
            return JSON.parse(fs.readFileSync(estadosPath, 'utf-8'));
        }
    } catch (e) {}
    return {};
}

function guardarEstados(data) {
    try {
        fs.writeFileSync(estadosPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {}
}

// Buffer de logs para diagnóstico remoto
const recentLogs = [];
function log(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    console.log(entry);
    recentLogs.push(entry);
    if (recentLogs.length > 300) recentLogs.shift();
}

/**
 * Transcribe un audio de WhatsApp (formato OGG Opus) palabra por palabra a texto en español.
 * Utiliza la API multimodal ultrarrápida de Gemini Flash.
 */
async function transcribirAudioConGemini(audioBuffer) {
    try {
        const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBnt8_IUnbEA1d3cgCqYTQTOel89nlUsUU';
        const base64Audio = audioBuffer.toString('base64');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: 'Transcribe exactamente todo lo que dice esta persona en su nota de voz de WhatsApp, palabra por palabra en español. Devuelve únicamente el texto transcrito sin comillas, explicaciones ni comentarios adicionales.' },
                        {
                            inlineData: {
                                mimeType: 'audio/ogg',
                                data: base64Audio
                            }
                        }
                    ]
                }]
            })
        });

        if (res.ok) {
            const data = await res.json();
            const transcripcion = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (transcripcion && transcripcion.length > 0) {
                return transcripcion;
            }
        } else {
            const errText = await res.text();
            log(`⚠️ [GEMINI STT ERROR] HTTP ${res.status}: ${errText.slice(0, 150)}`);
        }
    } catch (e) {
        log(`⚠️ [GEMINI STT EXCEPCION] ${e.message}`);
    }
    return null;
}

let sock = null;
let currentQR = null;
let qrImageBase64 = null;
let connectionStatus = 'Iniciando conexión con WhatsApp...';
let isConnected = false;
let pairingCode = null;

// Dashboard Web para Render
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bot Inteligente - Abuela Tulun (Cloud 24/7)</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b132b; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
            .card { background: #1c2541; border-radius: 20px; padding: 32px; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4); max-width: 580px; width: 100%; border: 1px solid #3a506b; text-align: center; }
            h1 { font-size: 24px; margin-bottom: 8px; color: #6fffe9; font-weight: 700; }
            .subtitle { font-size: 13px; color: #94a3b8; margin-bottom: 20px; }
            .badge { display: inline-block; padding: 8px 18px; border-radius: 9999px; font-size: 14px; font-weight: 600; margin-bottom: 20px; transition: all 0.3s ease; }
            .badge.waiting { background: #fef08a; color: #854d0e; }
            .badge.connected { background: #bbf7d0; color: #166534; box-shadow: 0 0 15px rgba(74, 222, 128, 0.4); }
            .badge.reconnecting { background: #fed7aa; color: #9a3412; }
            .tabs { display: flex; gap: 8px; margin-bottom: 20px; background: #0b132b; padding: 4px; border-radius: 12px; }
            .tab-btn { flex: 1; padding: 10px; background: transparent; border: none; color: #94a3b8; font-size: 13px; font-weight: 600; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
            .tab-btn.active { background: #3a506b; color: #6fffe9; }
            .tab-content { display: none; }
            .tab-content.active { display: block; }
            .qr-box { background: white; padding: 16px; border-radius: 16px; display: inline-block; margin: 12px 0; }
            .qr-box img { display: block; width: 230px; height: 230px; }
            .pairing-box { background: #0b132b; padding: 20px; border-radius: 12px; margin: 12px 0; border: 1px solid #3a506b; text-align: left; }
            .pairing-box label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 6px; font-weight: 600; text-transform: uppercase; }
            .pairing-input-row { display: flex; gap: 8px; }
            .pairing-input-row input { flex: 1; padding: 12px 14px; border-radius: 8px; border: 1px solid #3a506b; background: #1c2541; color: white; font-size: 15px; outline: none; }
            .pairing-input-row input:focus { border-color: #6fffe9; }
            .pairing-input-row button { padding: 12px 18px; border-radius: 8px; border: none; background: #6fffe9; color: #0b132b; font-weight: 700; cursor: pointer; font-size: 14px; }
            .pairing-input-row button:hover { background: #5bc0be; }
            .code-display { margin-top: 16px; background: #1c2541; padding: 14px; border-radius: 8px; text-align: center; border: 1px dashed #6fffe9; }
            .code-display .digits { font-size: 32px; font-weight: 800; letter-spacing: 4px; color: #6fffe9; font-family: monospace; }
            .steps { font-size: 13px; color: #cbd5e1; text-align: left; line-height: 1.6; margin-top: 14px; }
            .steps ol { padding-left: 20px; }
            .connected-view { padding: 10px 0; }
            .connected-icon { font-size: 56px; margin-bottom: 12px; }
            .audio-test { margin-top: 12px; padding: 14px; background: #0b132b; border-radius: 12px; text-align: left; border: 1px solid #3a506b; }
            .audio-test p { font-size: 12px; color: #6fffe9; margin-bottom: 8px; font-weight: 600; }
            audio { width: 100%; height: 36px; border-radius: 8px; }
            .actions-bar { margin-top: 16px; display: flex; justify-content: center; gap: 12px; }
            .btn-small { background: #334155; border: none; color: #94a3b8; padding: 6px 12px; border-radius: 6px; font-size: 11px; cursor: pointer; text-decoration: none; }
            .btn-small:hover { background: #475569; color: white; }
            .footer { margin-top: 24px; font-size: 12px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>👵 Bot Inteligente de la Abuela Tulun</h1>
            <div class="subtitle">Servidor Render 24/7 • IA DeepSeek V4.1 Flash + Embudo de Voz de 2 Pasos</div>
            
            <div id="statusBanner" style="padding: 14px 18px; border-radius: 12px; font-weight: 700; font-size: 15px; margin-bottom: 20px; transition: all 0.3s ease; background: ${isConnected ? '#064e3b' : '#7f1d1d'}; color: ${isConnected ? '#34d399' : '#fca5a5'}; border: 1px solid ${isConnected ? '#059669' : '#dc2626'};">
                ${isConnected ? '🟢 WHATSAPP CONECTADO Y EN LÍNEA 24/7 (EL BOT ESTÁ RESPONDIENDO)' : '🔴 WHATSAPP DESCONECTADO (VINCULA TU WHATSAPP ABAJO PARA ACTIVARLO)'}
            </div>
            
            <div id="statusBadge" class="badge ${isConnected ? 'connected' : 'waiting'}">
                ${connectionStatus}
            </div>

            <div id="notConnectedArea" style="display: ${isConnected ? 'none' : 'block'};">
                <div class="tabs">
                    <button class="tab-btn active" onclick="switchTab('tab-phone')">📱 Vincular con Número</button>
                    <button class="tab-btn" onclick="switchTab('tab-qr')">📷 Escanear QR</button>
                </div>

                <div id="tab-phone" class="tab-content active">
                    <div class="pairing-box">
                        <label>Número con código de país (sin +, ni guiones ni espacios):</label>
                        <div class="pairing-input-row">
                            <input type="text" id="phoneInput" placeholder="Ej: 59899123456 o 54911...">
                            <button id="btnPair" onclick="requestPairing()">Vincular</button>
                        </div>
                        <div id="pairingCodeArea" class="code-display" style="display: none;">
                            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">TU CÓDIGO DE WHATSAPP:</div>
                            <div class="digits" id="pairingCodeDisplay">----</div>
                        </div>
                    </div>
                    <div class="steps">
                        <ol>
                            <li>Ingresa tu número arriba y toca <strong>Vincular</strong>.</li>
                            <li>Abre WhatsApp en tu celular > <strong>Dispositivos vinculados</strong>.</li>
                            <li>Toca <strong>Vincular un dispositivo</strong> > <strong>Vincular con el número de teléfono</strong>.</li>
                            <li>Escribe el código de 8 letras/números que aparecerá arriba.</li>
                        </ol>
                    </div>
                </div>

                <div id="tab-qr" class="tab-content">
                    <div class="qr-box">
                        <img id="qrImage" src="${qrImageBase64 || ''}" alt="Código QR de WhatsApp" style="display: ${qrImageBase64 ? 'block' : 'none'};">
                        <div id="qrPlaceholder" style="width: 230px; height: 230px; display: ${qrImageBase64 ? 'none' : 'flex'}; align-items: center; justify-content: center; color: #64748b; font-size: 13px;">
                            Esperando QR del servidor...
                        </div>
                    </div>
                    <div class="steps">
                        <ol>
                            <li>Abre WhatsApp en tu teléfono.</li>
                            <li>Toca Menú (⋮) o Ajustes > <strong>Dispositivos vinculados</strong>.</li>
                            <li>Toca <strong>Vincular dispositivo</strong> y apunta tu cámara al QR.</li>
                        </ol>
                    </div>
                </div>
            </div>

            <div id="connectedArea" style="display: ${isConnected ? 'block' : 'none'};">
                <div class="connected-view">
                    <div class="connected-icon">✅</div>
                    <h3 style="color: #4ade80; margin-bottom: 12px;">¡Bot Activo con IA DeepSeek en la Nube 24/7!</h3>
                    <p style="color: #cbd5e1; font-size: 13.5px; line-height: 1.6; margin-bottom: 16px; text-align: left;">
                        🌿 <strong>Paso 1 (Disparador):</strong> Cuando un cliente escribe <em>«Hola Abuela, me gustaría adquirir tu libro de recetas, ¿cuál es el valor?»</em>, el bot espera 5-7 segundos (pausa humana) y envía el <strong>Audio 1 (26s)</strong> saludando e interesándose con empatía por su dolor o problema de salud (sin vender de entrada).<br><br>
                        🌿 <strong>Paso 2 (Problema recibido):</strong> Al responder su dolor, el bot envía el <strong>Audio 2 (46s)</strong> explicando la solución natural con sus 40 años de experiencia, el valor del libro digital a $7 USD y consultando si quiere el link.<br><br>
                        🧠 <strong>Paso 3 (IA DeepSeek):</strong> A partir de ahí entra la IA DeepSeek respondiendo en texto como la Abuela Tulun (sin frases cliché, sin muletillas repetitivas, y enviando el link solo cuando lo solicitan).
                    </p>
                    <div class="audio-test" style="margin-bottom: 12px;">
                        <p>🎧 Audio 1: Bienvenida y Diagnóstico (26s - Opus PTT):</p>
                        <audio controls src="/audio/1"></audio>
                    </div>
                    <div class="audio-test">
                        <p>🎧 Audio 2: Solución Casera y Ebook Digital $7 USD (46s - Opus PTT):</p>
                        <audio controls src="/audio/2"></audio>
                    </div>
                </div>
            </div>

            <div class="actions-bar">
                <button class="btn-small" onclick="location.reload()">🔄 Actualizar Estado</button>
                <a class="btn-small" href="/logs" target="_blank">📋 Ver Registros en Vivo</a>
            </div>

            <div class="footer">
                Servidor Cloud 24/7 • Monitoreo UptimeRobot • Costo $0.00
            </div>
        </div>

        <script>
            function switchTab(tabId) {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                if (tabId === 'tab-phone') {
                    document.querySelectorAll('.tab-btn')[0].classList.add('active');
                    document.getElementById('tab-phone').classList.add('active');
                } else {
                    document.querySelectorAll('.tab-btn')[1].classList.add('active');
                    document.getElementById('tab-qr').classList.add('active');
                }
            }

            async function requestPairing() {
                const phone = document.getElementById('phoneInput').value.trim();
                const btn = document.getElementById('btnPair');
                const codeArea = document.getElementById('pairingCodeArea');
                const codeDisplay = document.getElementById('pairingCodeDisplay');

                if (!phone || phone.length < 8) {
                    alert('Por favor escribe tu número con código de país (ej: 59899123456 o 54911...)');
                    return;
                }

                btn.disabled = true;
                btn.innerText = 'Pidiendo código...';

                try {
                    const res = await fetch('/pair', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone })
                    });
                    const data = await res.json();
                    if (data.ok && data.code) {
                        codeDisplay.innerText = data.code;
                        codeArea.style.display = 'block';
                    } else {
                        alert('Error al generar código: ' + (data.error || 'Intenta de nuevo en unos segundos'));
                    }
                } catch (e) {
                    alert('Error de conexión con el servidor: ' + e.message);
                } finally {
                    btn.disabled = false;
                    btn.innerText = 'Vincular';
                }
            }

            // Polling suave para actualizar QR o estado
            setInterval(async () => {
                try {
                    const res = await fetch('/status');
                    const data = await res.json();
                    
                    const banner = document.getElementById('statusBanner');
                    const badge = document.getElementById('statusBadge');
                    badge.innerText = data.statusText;
                    
                    if (data.connected) {
                        banner.style.background = '#064e3b';
                        banner.style.color = '#34d399';
                        banner.style.border = '1px solid #059669';
                        banner.innerText = '🟢 WHATSAPP CONECTADO Y EN LÍNEA 24/7 (EL BOT ESTÁ RESPONDIENDO)';
                        badge.className = 'badge connected';
                        document.getElementById('notConnectedArea').style.display = 'none';
                        document.getElementById('connectedArea').style.display = 'block';
                    } else {
                        banner.style.background = '#7f1d1d';
                        banner.style.color = '#fca5a5';
                        banner.style.border = '1px solid #dc2626';
                        banner.innerText = '🔴 WHATSAPP DESCONECTADO (VINCULA TU WHATSAPP ABAJO PARA ACTIVARLO)';
                        badge.className = 'badge waiting';
                        document.getElementById('notConnectedArea').style.display = 'block';
                        document.getElementById('connectedArea').style.display = 'none';

                        if (data.qrBase64) {
                            const img = document.getElementById('qrImage');
                            img.src = data.qrBase64;
                            img.style.display = 'block';
                            document.getElementById('qrPlaceholder').style.display = 'none';
                        }
                    }
                } catch (e) {}
            }, 4000);
        </script>
    </body>
    </html>
    `);
});

app.get('/status', (req, res) => {
    res.json({
        connected: isConnected,
        statusText: connectionStatus,
        qrBase64: qrImageBase64
    });
});

app.get('/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(recentLogs.slice(-150).join('\n') || 'Aún no hay logs registrados.');
});

app.post('/pair', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'Falta el número de teléfono' });

        const cleanPhone = phone.replace(/[^0-9]/g, '');
        if (!sock) return res.status(503).json({ error: 'WhatsApp no está inicializado aún' });

        log(`[PAIRING] Solicitando código de vinculación para +${cleanPhone}...`);
        let code = await sock.requestPairingCode(cleanPhone);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        log(`[PAIRING] Código generado exitosamente: ${code}`);
        res.json({ ok: true, code });
    } catch (err) {
        log(`[PAIRING ERROR] ${err.message}`);
        res.status(500).json({ error: err.message || 'Error solicitando código' });
    }
});

app.get('/audio/1', (req, res) => {
    if (fs.existsSync(audio1Path)) {
        res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
        fs.createReadStream(audio1Path).pipe(res);
    } else {
        res.status(404).send('Audio 1 no encontrado');
    }
});

app.get('/audio/2', (req, res) => {
    if (fs.existsSync(audio2Path)) {
        res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
        fs.createReadStream(audio2Path).pipe(res);
    } else {
        res.status(404).send('Audio 2 no encontrado');
    }
});

app.get('/audio', (req, res) => {
    const audioPath = fs.existsSync(audio1Path) ? audio1Path : path.join(__dirname, 'audio_abuela.ogg');
    if (fs.existsSync(audioPath)) {
        res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
        fs.createReadStream(audioPath).pipe(res);
    } else {
        res.status(404).send('Audio no encontrado');
    }
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        connected: isConnected,
        ai: 'DeepSeek-V4.1-Flash',
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    log(`[HTTP] Servidor listo en puerto ${PORT}`);
});

let reconnectTimeout = null;

async function startWhatsApp() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    if (sock) {
        try {
            sock.ev.removeAllListeners();
            sock.ws?.close();
        } catch (e) {}
        sock = null;
    }

    try {
        const authFolder = path.join(__dirname, 'auth_info');
        if (!fs.existsSync(authFolder)) {
            fs.mkdirSync(authFolder, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        log(`[BAILEYS] Versión Web: [${version.join(', ')}], isLatest: ${isLatest}`);

        const logger = pino({ level: 'silent' });

        sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            printQRInTerminal: false,
            logger: logger,
            browser: Browsers.macOS('Desktop'),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            emitOwnEvents: false,
            fireInitQueries: true
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                currentQR = qr;
                qrImageBase64 = await QRCode.toDataURL(qr, { scale: 8, margin: 2 });
                connectionStatus = 'Escanea el código QR o pide tu código de 8 dígitos 👇';
                log('[QR] Nuevo código QR generado y listo en el dashboard');
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                isConnected = false;
                connectionStatus = 'Reconectando con WhatsApp...';
                log(`[CONN CLOSE] Código de salida: ${statusCode}, error: ${lastDisconnect?.error?.message || 'none'}. Reconectando: ${shouldReconnect}`);

                if (statusCode === DisconnectReason.loggedOut) {
                    log('[LOGOUT] Limpiando credenciales para permitir nuevo login');
                    try { fs.rmSync(authFolder, { recursive: true, force: true }); } catch (e) {}
                }

                if (shouldReconnect) {
                    reconnectTimeout = setTimeout(startWhatsApp, 3000);
                }
            } else if (connection === 'open') {
                isConnected = true;
                connectionStatus = '✅ Conectado y Listo 24/7';
                currentQR = null;
                qrImageBase64 = null;
                log('====================================================');
                log('¡WHATSAPP CONECTADO EXITOSAMENTE Y RESPONDIENDO 24/7!');
                log('====================================================');
            }
        });

        // Manejador del Embudo de 2 Pasos y Chat con IA DeepSeek
        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const remoteJid = msg.key.remoteJid;
            if (remoteJid.includes('@newsletter') || remoteJid.includes('status@broadcast')) {
                return;
            }

            const esGrupo = remoteJid.endsWith('@g.us');

            // Desempaquetar contenido de mensaje efímero o normal
            const messageContent = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message;
            const esAudio = Boolean(messageContent?.audioMessage);

            let body = (
                messageContent?.conversation ||
                messageContent?.extendedTextMessage?.text ||
                messageContent?.imageMessage?.caption ||
                ''
            ).trim();

            if (esAudio) {
                log(`🎙️ [AUDIO RECIBIDO] Descargando nota de voz de ${remoteJid}...`);
                try {
                    const stream = await downloadContentFromMessage(messageContent.audioMessage, 'audio');
                    let audioBuffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        audioBuffer = Buffer.concat([audioBuffer, chunk]);
                    }

                    log(`🔄 [TRANSCRIBIENDO AUDIO] (${audioBuffer.length} bytes)...`);
                    const textoTranscrito = await transcribirAudioConGemini(audioBuffer);
                    if (textoTranscrito && textoTranscrito.length > 0) {
                        body = textoTranscrito;
                        log(`✅ [TRANSCRIPCIÓN EXITOSA] De ${remoteJid}: "${body}"`);
                    } else {
                        body = 'Hola abuela, te mandé un audio con dudas sobre mis dolores y cómo sanar.';
                        log(`ℹ️ [TRANSCRIPCIÓN VACÍA] Usando contexto de audio de salud.`);
                    }
                } catch (errAudio) {
                    log(`⚠️ [ERROR AL DESCARGAR/TRANSCRIBIR AUDIO] ${errAudio.message}`);
                    body = 'Hola abuela, te envié una nota de voz con mis dudas de salud.';
                }
            }

            if (!body) return;
            log(`[MSG] De ${remoteJid}: "${body}"`);

            const estados = cargarEstados();
            const estadoActual = estados[remoteJid]?.paso;

            const esDisparador = /(adquirir|libro|receta|recetas|valor|precio|costo|comprar|cu[aá]nto|hola abuela)/i.test(body);

            // En grupos solo respondemos si coincide con el disparador para no saturar
            if (esGrupo && !esDisparador) return;

            // 1. Pausa humana natural de 5 a 7 segundos antes de responder
            const delayLectura = 5000 + Math.floor(Math.random() * 2500);
            log(`⏳ [Pausa Humana] Simulando lectura (${(delayLectura / 1000).toFixed(1)}s)...`);
            await new Promise(r => setTimeout(r, delayLectura));

            // Si es un mensaje general (ej: "hola", "buenas", dudas generales) y no tiene estado previo:
            if (!estadoActual && !esDisparador) {
                log(`[DEEPSEEK] Mensaje general recibido de ${remoteJid}: "${body}". Respondiendo con IA...`);
                try {
                    await sock.sendPresenceUpdate('composing', remoteJid);
                    await new Promise(r => setTimeout(r, 2000));

                    const respuestaIA = await responderComoAbuela(remoteJid, body);
                    await sock.sendMessage(remoteJid, { text: respuestaIA });
                    log(`[ENVIADO] Respuesta DeepSeek a saludo entregada a ${remoteJid}`);
                } catch (e) {
                    log(`[ERROR SALUDO IA] ${e.message}`);
                    await sock.sendMessage(remoteJid, {
                        text: 'Hola, qué lindo que me escribas. Cuéntame con confianza, ¿qué dolor o qué molestia tienes hoy? Dime y te escucho con calma.'
                    });
                }
                return;
            }

            // PASO 1: Mensaje inicial / Disparador -> Envía Audio 1 (Bienvenida y pregunta de salud)
            if (!estadoActual && esDisparador) {
                log(`[EMBUDO] Disparador recibido de ${remoteJid}. Enviando Audio 1...`);
                const textoPaso1 = 'Hola... ¿cómo estás? Qué lindo que me escribas por acá. Mira, antes de hablarte del libro... cuéntame, ¿qué dolor o qué molestia tienes hoy? Dime y te escucho con calma.';
                let enviado = false;

                try {
                    await sock.sendPresenceUpdate('recording', remoteJid);
                    await new Promise(r => setTimeout(r, 2500));

                    if (fs.existsSync(audio1Path)) {
                        await sock.sendMessage(remoteJid, {
                            audio: fs.readFileSync(audio1Path),
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: true
                        });
                        enviado = true;
                        log(`[ENVIADO] Audio 1 (12s) entregado a ${remoteJid}`);
                    }
                } catch (errAudio) {
                    log(`⚠️ [FALLBACK AUDIO 1] Falló subida de audio (${errAudio.message}). Enviando texto de respaldo...`);
                }

                if (!enviado) {
                    await sock.sendPresenceUpdate('composing', remoteJid);
                    await sock.sendMessage(remoteJid, { text: textoPaso1 });
                    log(`[ENVIADO] Texto Paso 1 entregado a ${remoteJid}`);
                }

                estados[remoteJid] = { paso: 'esperando_problema', timestamp: new Date().toISOString() };
                guardarEstados(estados);
                return;
            }

            // PASO 2: Responde contando su dolor (texto o audio) -> Envía Audio 2 (Solución, Ebook digital, $7 USD y cierre)
            if (estadoActual === 'esperando_problema') {
                log(`[EMBUDO] Problema recibido de ${remoteJid}: "${body}". Enviando Audio 2...`);
                const textoPaso2 = 'Te entiendo tan bien... sé lo pesado que es vivir con esa molestia. Pero tranquila, en tu propia cocina tienes todo para aliviarte de raíz. El libro es digital, cuesta solo siete dólares y te llega al momento. ¿Quieres que te pase el enlace?';
                let enviado = false;

                try {
                    await sock.sendPresenceUpdate('recording', remoteJid);
                    await new Promise(r => setTimeout(r, 2500));

                    if (fs.existsSync(audio2Path)) {
                        await sock.sendMessage(remoteJid, {
                            audio: fs.readFileSync(audio2Path),
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: true
                        });
                        enviado = true;
                        log(`[ENVIADO] Audio 2 (13s) entregado a ${remoteJid}`);
                    }
                } catch (errAudio) {
                    log(`⚠️ [FALLBACK AUDIO 2] Falló subida de audio (${errAudio.message}). Enviando texto de respaldo...`);
                }

                if (!enviado) {
                    await sock.sendPresenceUpdate('composing', remoteJid);
                    await sock.sendMessage(remoteJid, { text: textoPaso2 });
                    log(`[ENVIADO] Texto Paso 2 entregado a ${remoteJid}`);
                }

                estados[remoteJid] = { paso: 'ia_activa', problema: body, timestamp: new Date().toISOString() };
                guardarEstados(estados);
                return;
            }

            // PASO 3: Conversación inteligente y natural con IA DeepSeek
            if (estadoActual === 'ia_activa' || esDisparador) {
                log(`[DEEPSEEK] Consultando IA para responder a ${remoteJid}...`);
                try {
                    await sock.sendPresenceUpdate('composing', remoteJid);
                    await new Promise(r => setTimeout(r, 2000));

                    const respuestaIA = await responderComoAbuela(remoteJid, body);
                    await sock.sendMessage(remoteJid, { text: respuestaIA });
                    log(`[ENVIADO] Respuesta DeepSeek enviada a ${remoteJid}`);

                    if (!estados[remoteJid]) {
                        estados[remoteJid] = { paso: 'ia_activa', timestamp: new Date().toISOString() };
                        guardarEstados(estados);
                    }
                } catch (err) {
                    log(`[ERROR DEEPSEEK] ${err.message}`);
                    await sock.sendMessage(remoteJid, {
                        text: 'Entiendo bien, hija. Con mis recetas caseras vas a sanar de raíz con lo que tienes en tu propia cocina. Si quieres ver el libro completo en letra grande, me avisas y te paso el enlace.'
                    });
                }
            }
        });

    } catch (err) {
        log(`[START ERROR] ${err.message}`);
        reconnectTimeout = setTimeout(startWhatsApp, 5000);
    }
}

startWhatsApp();
