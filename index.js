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
const { responderComoAbuela, registrarInteraccion, obtenerInfoPais } = require('./chat_abuela');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

const estadosPath = path.join(__dirname, 'estados_clientes.json');

const estadosCache = {};

function cargarEstados() {
    try {
        if (Object.keys(estadosCache).length > 0) {
            return estadosCache;
        }
        if (fs.existsSync(estadosPath)) {
            const data = JSON.parse(fs.readFileSync(estadosPath, 'utf-8'));
            Object.assign(estadosCache, data);
            return estadosCache;
        }
    } catch (e) {}
    return estadosCache;
}

function guardarEstados(data) {
    try {
        Object.assign(estadosCache, data);
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
 * Soporta Groq Whisper Cloud (whisper-large-v3-turbo) y Whisper local vía Python faster-whisper.
 */
async function transcribirAudioConWhisper(audioBuffer) {
    // 1. Groq Cloud Whisper API (rápido, gratuito, modelo whisper-large-v3-turbo)
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
        try {
            const formData = new FormData();
            const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
            formData.append('file', blob, 'audio.ogg');
            formData.append('model', 'whisper-large-v3-turbo');
            formData.append('language', 'es');

            const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${groqKey}` },
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                const texto = data.text?.trim();
                if (texto && texto.length > 0) {
                    log(`✅ [GROQ WHISPER] Transcripción lograda: "${texto}"`);
                    return texto;
                }
            } else {
                const errText = await res.text();
                log(`⚠️ [GROQ WHISPER ERROR] HTTP ${res.status}: ${errText.slice(0, 150)}`);
            }
        } catch (e) {
            log(`⚠️ [GROQ WHISPER EXCEPCION] ${e.message}`);
        }
    }

    // 2. OpenAI Whisper Cloud API (si se tiene OPENAI_API_KEY)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
        try {
            const formData = new FormData();
            const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
            formData.append('file', blob, 'audio.ogg');
            formData.append('model', 'whisper-1');
            formData.append('language', 'es');

            const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openaiKey}` },
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                const texto = data.text?.trim();
                if (texto && texto.length > 0) {
                    log(`✅ [OPENAI WHISPER] Transcripción lograda: "${texto}"`);
                    return texto;
                }
            } else {
                const errText = await res.text();
                log(`⚠️ [OPENAI WHISPER ERROR] HTTP ${res.status}: ${errText.slice(0, 150)}`);
            }
        } catch (e) {
            log(`⚠️ [OPENAI WHISPER EXCEPCION] ${e.message}`);
        }
    }

    // 3. Fallback local Python con faster-whisper (si corre en la PC o si python está disponible)
    const localPy = path.join(__dirname, 'transcribir_audio.py');
    if (fs.existsSync(localPy)) {
        try {
            const tmpAudio = path.join(__dirname, `tmp_rec_${Date.now()}.ogg`);
            fs.writeFileSync(tmpAudio, audioBuffer);
            const stdout = require('child_process').execSync(`python "${localPy}" "${tmpAudio}"`, { timeout: 12000 }).toString().trim();
            if (fs.existsSync(tmpAudio)) fs.unlinkSync(tmpAudio);
            if (stdout && stdout.length > 0) {
                log(`✅ [LOCAL WHISPER] Transcripción lograda: "${stdout}"`);
                return stdout;
            }
        } catch (e) {
            log(`ℹ️ [LOCAL WHISPER] No se pudo ejecutar localmente: ${e.message}`);
        }
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
                        🌿 <strong>Paso 1 (Disparador):</strong> Cuando un cliente escribe <em>«Hola Abuela, me gustaría adquirir tu libro de recetas, ¿cuál es el valor?»</em>, el bot espera 5-7 segundos (pausa humana) y envía el <strong>Audio 1 (12s)</strong> saludando e interesándose con empatía por su molestia o dolor (sin vender de entrada).<br><br>
                        🌿 <strong>Paso 2 (Problema recibido):</strong> Al responder su dolor (por texto o nota de voz), el bot envía el <strong>Audio 2 (16s)</strong> con comprensión cálida, explicando que puede sanar en su cocina, el libro digital a $7 USD y consultando si quiere el link.<br><br>
                        🧠 <strong>Paso 3 (IA DeepSeek + Transcripción de Audios):</strong> Conversación natural y cercana. Si el cliente envía notas de voz, el bot las transcribe automáticamente y le responde a lo que dijo, sin frases cliché y enviando el link solo cuando lo piden.
                    </p>
                    <div class="audio-test" style="margin-bottom: 12px;">
                        <p>🎧 Audio 1: Bienvenida empática y pregunta de salud (12s - Opus PTT):</p>
                        <audio controls src="/audio/1"></audio>
                    </div>
                    <div class="audio-test">
                        <p>🎧 Audio 2: Solución natural en cocina y Ebook digital $7 USD (16s - Opus PTT):</p>
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

                    log(`🔄 [TRANSCRIBIENDO AUDIO CON WHISPER] (${audioBuffer.length} bytes)...`);
                    const textoTranscrito = await transcribirAudioConWhisper(audioBuffer);
                    if (textoTranscrito && textoTranscrito.length > 0) {
                        body = textoTranscrito;
                        log(`✅ [TRANSCRIPCIÓN WHISPER EXITOSA] De ${remoteJid}: "${body}"`);
                    } else {
                        body = 'Hola abuela, tengo molestias y dolores en el cuerpo, ¿qué remedios caseros me recomiendas para sanar?';
                        log(`ℹ️ [FALLBACK CONTEXTO SALUD] No se pudo transcribir, inyectando duda de salud.`);
                    }
                } catch (errAudio) {
                    log(`⚠️ [ERROR AL DESCARGAR/TRANSCRIBIR AUDIO] ${errAudio.message}`);
                    body = 'Hola abuela, tengo molestias y dolores en el cuerpo, ¿qué remedios caseros me recomiendas para sanar?';
                }
            }

            if (!body) return;
            log(`[MSG] De ${remoteJid}: "${body}"`);

            // Memoria completa y continua: registrar cada mensaje del usuario desde el inicio
            registrarInteraccion(remoteJid, 'user', body);

            // Detección automática de país, moneda y medios de pago por prefijo telefónico
            const infoPais = obtenerInfoPais(remoteJid);

            const estados = cargarEstados();
            const estadoActual = estados[remoteJid]?.paso;

            // 1. Pausa humana natural de 3 a 5 segundos antes de responder
            const delayLectura = 3500 + Math.floor(Math.random() * 2000);
            log(`⏳ [Pausa Humana] Simulando lectura (${(delayLectura / 1000).toFixed(1)}s)...`);
            await new Promise(r => setTimeout(r, delayLectura));

            // =========================================================================
            // ESTRATEGIA DE EMBUDO CONVERSACIONAL DE TEXTO (1 O 2 OPCIONES - MÁX 5-7 PASOS)
            // =========================================================================

            // A. Intercepción global: Pedido directo de link de pago o compra
            const pidePago = /(link\s*de\s*pago|enlace\s*de\s*pago|d[oó]nde\s*pago|c[oó]mo\s*pago|d[oó]nde\s*(?:lo\s*)?compro|c[oó]mo\s*(?:lo\s*)?compro|quiero\s*comprarlo|quiero\s*pagar|por\s*d[oó]nde\s*se\s*paga|m[eé]todos?\s*de\s*pago)/i.test(body);
            if (pidePago) {
                const mensajePago = `Aquí tienes el enlace directo para adquirir mi recetario en Hotmart, mi corazón:\nhttps://pay.hotmart.com/W105526885V?off=qmsrqdaf\n\nEl precio oficial en ${infoPais.pais} es ${infoPais.textoPrecio}. Te llega de inmediato a tu correo electrónico tras la compra.\n\n¿Quieres que te espere en línea mientras completas tu pedido para asegurarme de que te llegue bien?`;
                await sock.sendPresenceUpdate('composing', remoteJid);
                await new Promise(r => setTimeout(r, 1500));
                await sock.sendMessage(remoteJid, { text: mensajePago });
                registrarInteraccion(remoteJid, 'user', body);
                registrarInteraccion(remoteJid, 'assistant', mensajePago);
                estados[remoteJid] = { paso: 'esperando_confirmacion_compra', timestamp: new Date().toISOString() };
                guardarEstados(estados);
                log(`[ENVIADO] Enlace directo de pago Hotmart entregado a ${remoteJid}`);
                return;
            }

            // B. Intercepción global: Pedido explícito de enlaces del libro
            const pideLink = /(p[aá]same\s*(?:el\s*)?(?:link|enlace|p[aá]gina)|quiero\s*(?:el\s*)?(?:link|enlace|libro)|d[oó]nde\s*est[aá]\s*(?:el\s*)?(?:link|enlace|libro)|ver\s*el\s*libro|dame\s*el\s*(?:link|enlace)|m[aá]ndame\s*(?:el\s*)?(?:link|enlace))/i.test(body);
            if (pideLink) {
                const mensajeLink = `Aquí tienes los dos accesos directos de mi libro, mi corazón:\n\n📖 Para ver todo lo que incluye el recetario:\nhttps://abuelatulun.site\n\n🔒 Para comprarlo con el descuento de hoy en Hotmart (${infoPais.precioExacto} en ${infoPais.pais}):\nhttps://pay.hotmart.com/W105526885V?off=qmsrqdaf\n\n¿Quieres que te ayude a elegir tu medio de pago local o ya pudiste entrar?`;
                await sock.sendPresenceUpdate('composing', remoteJid);
                await new Promise(r => setTimeout(r, 1500));
                await sock.sendMessage(remoteJid, { text: mensajeLink });
                registrarInteraccion(remoteJid, 'user', body);
                registrarInteraccion(remoteJid, 'assistant', mensajeLink);
                estados[remoteJid] = { paso: 'esperando_confirmacion_compra', timestamp: new Date().toISOString() };
                guardarEstados(estados);
                log(`[ENVIADO] Enlaces entregados a ${remoteJid} por pedido explícito`);
                return;
            }

            // C. Intercepción global: Consulta directa de precio o valor
            const pidePrecioDirecto = /(cu[aá]l\s*es\s*el\s*(?:valor|precio|costo)|cu[aá]nto\s*(?:cuesta|vale|sale|es)|qu[eé]\s*(?:precio|valor|costo)|a\s*c[oó]mo\s*(?:sale|est[aá]|lo\s*tienes)|precio\s*(?:en\s*mi\s*pa[ií]s|en\s*pesos|en\s*d[oó]lares))/i.test(body);
            if (pidePrecioDirecto && estadoActual) {
                const mensajePrecio = `Mira, mi corazón. El recetario completo cuesta exactamente ${infoPais.textoPrecio} en ${infoPais.pais} (para que te hagas una idea, es menos de lo que cuesta una sola salida a la farmacia).\n\nY lo puedes pagar fácil en ${infoPais.metodos}.\n\nAquí tienes los dos accesos directos:\n📖 Para ver todo lo que incluye el libro antes de pedirlo:\nhttps://abuelatulun.site\n\n🔒 O para ir directo a la compra segura en Hotmart:\nhttps://pay.hotmart.com/W105526885V?off=qmsrqdaf\n\nApenas haces el pago te llega de inmediato a tu correo y a tu pantalla. ¿Pudiste abrir el enlace o necesitas que te ayude con el pago, hija?`;
                await sock.sendPresenceUpdate('composing', remoteJid);
                await new Promise(r => setTimeout(r, 1500));
                await sock.sendMessage(remoteJid, { text: mensajePrecio });
                registrarInteraccion(remoteJid, 'user', body);
                registrarInteraccion(remoteJid, 'assistant', mensajePrecio);
                estados[remoteJid] = { paso: 'esperando_confirmacion_compra', timestamp: new Date().toISOString() };
                guardarEstados(estados);
                log(`[ENVIADO] Precio exacto entregado a ${remoteJid} (${infoPais.pais} - ${infoPais.precioExacto})`);
                return;
            }

            // =========================================================================
            // MÁQUINA DE ESTADOS DEL EMBUDO (TEXTO 100% NATIVO - OPCIONES 1 Y 2)
            // =========================================================================

            // PASO 1: Mensaje inicial (Llega de Instagram o sin estado previo)
            if (!estadoActual) {
                log(`[EMBUDO PASO 1] Primer contacto de ${remoteJid} (${infoPais.pais}). Enviando diagnóstico con 2 opciones...`);
                const mensajePaso1 = `Hola, mi corazón. Qué alegría que me escribas, soy la Abuela Griselda.\n\nMi libro de recetas está hoy en oferta especial por solo $7 USD (o en tu moneda local), pero antes de darte el enlace quiero asegurarme de que te sirva de verdad. Cuéntame, ¿cuál es la molestia principal que más te pesa hoy?\n\n1️⃣ Dolor en articulaciones, rodillas o cuerpo rígido\n2️⃣ Panza inflamada, digestión pesada o mal dormir\n\n(Respóndeme solo con el número 1 o el 2, hija)`;

                await sock.sendPresenceUpdate('composing', remoteJid);
                await new Promise(r => setTimeout(r, 2000));
                await sock.sendMessage(remoteJid, { text: mensajePaso1 });
                registrarInteraccion(remoteJid, 'user', body);
                registrarInteraccion(remoteJid, 'assistant', mensajePaso1);
                estados[remoteJid] = { paso: 'esperando_opcion_dolor', timestamp: new Date().toISOString() };
                guardarEstados(estados);
                return;
            }

            // PASO 2: Responde al diagnóstico con 1 o 2 (o texto de dolor)
            if (estadoActual === 'esperando_opcion_dolor') {
                const esOpcion1 = /^(1|uno)\b|dolor|rodilla|articulaci|hueso|espalda|cuerpo r[ií]gido|artritis|cadera/i.test(body.trim());
                const esOpcion2 = /^(2|dos)\b|panza|vientre|inflam|digest|gases|colon|reflujo|dormir|sue[nñ]o|insomnio|vejiga|cansancio/i.test(body.trim());

                if (esOpcion1) {
                    log(`[EMBUDO PASO 2] ${remoteJid} eligió Opción 1 (Articulaciones/Rodillas).`);
                    const mensajePaso2A = `Te entiendo tanto, hija... Sé lo doloroso que es levantarse rígida o sentir que las rodillas queman al caminar. Lo triste es que las pastillas de farmacia solo adormecen el dolor unas horas y te van destruyendo el estómago.\n\nEn mi recetario te enseño compresas tibias y caldos desinflamatorios con ingredientes de tu cocina que sacan la inflamación de raíz sin químicos.\n\n¿Te gustaría ver las recetas caseras exactas que tengo preparadas para ti?\n\n👉 Respóndeme: 1) Sí, muéstramelo  o  2) ¿Cuánto cuesta?`;

                    await sock.sendPresenceUpdate('composing', remoteJid);
                    await new Promise(r => setTimeout(r, 2000));
                    await sock.sendMessage(remoteJid, { text: mensajePaso2A });
                    registrarInteraccion(remoteJid, 'user', body);
                    registrarInteraccion(remoteJid, 'assistant', mensajePaso2A);
                    estados[remoteJid] = { paso: 'esperando_interes_libro', dolor: 'articulaciones', timestamp: new Date().toISOString() };
                    guardarEstados(estados);
                    return;
                } else if (esOpcion2) {
                    log(`[EMBUDO PASO 2] ${remoteJid} eligió Opción 2 (Panza/Digestión/Sueño).`);
                    const mensajePaso2B = `Ay hija, qué pesado es vivir con el vientre hinchado como un tambor y sintiendo que hasta el agua te inflama, o pasar la noche dando vueltas sin descansar. Eso no es "la edad", es tu sistema digestivo pidiendo desinflamarse de verdad.\n\nEn mi recetario te enseño infusiones digestivas y el elixir nocturno para desinflamar el abdomen y dormir de corrido, todo con lo que tienes en tu alacena.\n\n¿Te gustaría ver cómo preparar estas recetas caseras en 10 minutos?\n\n👉 Respóndeme: 1) Sí, muéstramelo  o  2) ¿Cuánto cuesta?`;

                    await sock.sendPresenceUpdate('composing', remoteJid);
                    await new Promise(r => setTimeout(r, 2000));
                    await sock.sendMessage(remoteJid, { text: mensajePaso2B });
                    registrarInteraccion(remoteJid, 'user', body);
                    registrarInteraccion(remoteJid, 'assistant', mensajePaso2B);
                    estados[remoteJid] = { paso: 'esperando_interes_libro', dolor: 'digestivo', timestamp: new Date().toISOString() };
                    guardarEstados(estados);
                    return;
                }
            }

            // PASO 3: Responde si quiere ver el libro o pregunta precio
            if (estadoActual === 'esperando_interes_libro') {
                const esVerLibro = /^(1|uno|s[ií]+|dale|bueno|claro|mu[eé]stramelo|me interesa|por favor|porfa|a ver|c[oó]mo funciona)/i.test(body.trim());
                const esPrecio = /^(2|dos)\b|cu[aá]nto|precio|valor|costo|a c[oó]mo/i.test(body.trim());

                if (esVerLibro) {
                    log(`[EMBUDO PASO 3] ${remoteJid} quiere conocer el recetario. Enviando diferenciación...`);
                    const mensajePaso3 = `Mira, mi corazón, esto no es un simple libro digital ni un PDF cualquiera de internet. Es mi recetario familiar de más de 40 años rescatado paso a paso:\n\n✅ Viene en letra grande y clara para que lo leas comodísima sin cansar la vista.\n✅ Todo con medidas caseras exactas (cucharadas y tazas, nada de gramos raros).\n✅ Recetas listas en 10 a 15 minutos con lo que ya compras en tu verdulería.\n\nY además te llega al instante a tu celular y a tu correo para que lo tengas para siempre.\n\n¿Te paso el enlace seguro con el valor exacto en tu moneda local para que aproveches la oferta de hoy?\n\n👉 Respóndeme: 1) Sí, por favor  o  2) ¿Cómo se paga?`;

                    await sock.sendPresenceUpdate('composing', remoteJid);
                    await new Promise(r => setTimeout(r, 2000));
                    await sock.sendMessage(remoteJid, { text: mensajePaso3 });
                    registrarInteraccion(remoteJid, 'user', body);
                    registrarInteraccion(remoteJid, 'assistant', mensajePaso3);
                    estados[remoteJid] = { paso: 'esperando_cierre_oferta', timestamp: new Date().toISOString() };
                    guardarEstados(estados);
                    return;
                } else if (esPrecio) {
                    log(`[EMBUDO PASO 3] ${remoteJid} preguntó precio. Enviando oferta oficial...`);
                    const mensajeOferta = `Mira, mi corazón. El recetario completo cuesta exactamente ${infoPais.textoPrecio} en ${infoPais.pais} (para que te hagas una idea, es menos de lo que cuesta una sola salida a la farmacia).\n\nY lo mejor es que puedes pagarlo fácil en ${infoPais.metodos}.\n\nAquí tienes los dos accesos directos:\n📖 Para ver todo lo que incluye el libro antes de pedirlo:\nhttps://abuelatulun.site\n\n🔒 O para ir directo a la compra segura en Hotmart:\nhttps://pay.hotmart.com/W105526885V?off=qmsrqdaf\n\nApenas haces el pago te llega de inmediato a tu correo y a tu pantalla. ¿Pudiste abrir el enlace o necesitas que te ayude a completar el pago, hija?`;

                    await sock.sendPresenceUpdate('composing', remoteJid);
                    await new Promise(r => setTimeout(r, 2000));
                    await sock.sendMessage(remoteJid, { text: mensajeOferta });
                    registrarInteraccion(remoteJid, 'user', body);
                    registrarInteraccion(remoteJid, 'assistant', mensajeOferta);
                    estados[remoteJid] = { paso: 'esperando_confirmacion_compra', timestamp: new Date().toISOString() };
                    guardarEstados(estados);
                    return;
                }
            }

            // PASO 4: Cierre de oferta tras ver la diferenciación
            if (estadoActual === 'esperando_cierre_oferta') {
                log(`[EMBUDO PASO 4] ${remoteJid} aceptó la oferta. Enviando enlaces oficiales...`);
                const mensajeOferta = `Aquí tienes el acceso seguro, mi corazón:\n\n📖 Para ver todo el recetario en mi página:\nhttps://abuelatulun.site\n\n🔒 Y para comprarlo con el descuento de hoy en Hotmart:\nhttps://pay.hotmart.com/W105526885V?off=qmsrqdaf\n\nEn ${infoPais.pais} cuesta exactamente ${infoPais.textoPrecio}. Y lo puedes pagar fácil con ${infoPais.metodos}.\n\nApenas confirmas el pago te llega de inmediato a tu correo y celular. ¿Pudiste abrir el enlace o prefieres que te guíe para hacer el pago, hija?`;

                await sock.sendPresenceUpdate('composing', remoteJid);
                await new Promise(r => setTimeout(r, 2000));
                await sock.sendMessage(remoteJid, { text: mensajeOferta });
                registrarInteraccion(remoteJid, 'user', body);
                registrarInteraccion(remoteJid, 'assistant', mensajeOferta);
                estados[remoteJid] = { paso: 'esperando_confirmacion_compra', timestamp: new Date().toISOString() };
                guardarEstados(estados);
                return;
            }

            // PASO 5: Si tienen dudas sobre seguridad, formato o pago
            if (estadoActual === 'esperando_confirmacion_compra') {
                const tieneDudas = /(c[oó]mo\s*pago|es\s*seguro|garant[ií]a|no\s*s[eé]|c[oó]mo\s*llega|duda|ayuda|no\s*puedo|d[oó]nde)/i.test(body);
                if (tieneDudas) {
                    log(`[EMBUDO PASO 5] Resolviendo objeción de ${remoteJid}...`);
                    const mensajeGarantia = `Quédate completamente tranquila, mi corazón:\n\n1️⃣ Tu compra está 100% protegida por Hotmart con 7 días de garantía total: si no sientes alivio, pides la devolución y te regresan cada centavo sin hacer preguntas.\n2️⃣ Es muy fácil de usar: lo abres como cualquier foto en tu celular, o si prefieres, tus hijos o nietos te lo pueden imprimir en papel.\n\nAquí tienes el enlace directo para adquirirlo antes de que cierre la oferta de hoy:\nhttps://pay.hotmart.com/W105526885V?off=qmsrqdaf\n\n¿Quieres que te espere mientras lo adquieres para darte la bienvenida?\n👉 Respóndeme: 1) Ya voy a pagar  o  2) Ayúdame con el pago`;

                    await sock.sendPresenceUpdate('composing', remoteJid);
                    await new Promise(r => setTimeout(r, 2000));
                    await sock.sendMessage(remoteJid, { text: mensajeGarantia });
                    registrarInteraccion(remoteJid, 'user', body);
                    registrarInteraccion(remoteJid, 'assistant', mensajeGarantia);
                    return;
                }
            }

            // =========================================================================
            // PASO FINAL: CONVERSACIÓN CONSULTIVA NATURAL CON IA (SIEMPRE EN TEXTO)
            // =========================================================================
            log(`[DEEPSEEK] Consultando IA para responder a ${remoteJid} (${infoPais.pais}): "${body}"...`);
            try {
                await sock.sendPresenceUpdate('composing', remoteJid);
                await new Promise(r => setTimeout(r, 2000));

                const respuestaIA = await responderComoAbuela(remoteJid, body, infoPais);
                await sock.sendMessage(remoteJid, { text: respuestaIA });
                log(`[ENVIADO] Respuesta en texto enviada a ${remoteJid}`);

                if (!estados[remoteJid]) {
                    estados[remoteJid] = { paso: 'ia_activa', timestamp: new Date().toISOString() };
                    guardarEstados(estados);
                }
            } catch (err) {
                log(`[ERROR DEEPSEEK] ${err.message}`);
                const fallbackTexto = `Entiendo bien, hija. Con mis recetas caseras vas a sanar de raíz con lo que tienes en tu propia cocina. El libro cuesta ${infoPais.textoPrecio}. Si quieres ver el libro completo o el enlace de compra me avisas y te lo paso con gusto.`;
                await sock.sendMessage(remoteJid, { text: fallbackTexto });
                registrarInteraccion(remoteJid, 'assistant', fallbackTexto);
            }
        });

    } catch (err) {
        log(`[START ERROR] ${err.message}`);
        reconnectTimeout = setTimeout(startWhatsApp, 5000);
    }
}

startWhatsApp();
