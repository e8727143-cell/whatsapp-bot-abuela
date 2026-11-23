const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

// Buffer de logs para diagnóstico remoto
const recentLogs = [];
function log(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    console.log(entry);
    recentLogs.push(entry);
    if (recentLogs.length > 300) recentLogs.shift();
}

let sock = null;
let currentQR = null;
let qrImageBase64 = null;
let connectionStatus = 'Iniciando conexión con WhatsApp...';
let isConnected = false;
let pairingCode = null;

// Dashboard Web
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bot de WhatsApp - Recetas de la Abuela (Cloud 24/7)</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b132b; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
            .card { background: #1c2541; border-radius: 20px; padding: 32px; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4); max-width: 540px; width: 100%; border: 1px solid #3a506b; text-align: center; }
            h1 { font-size: 24px; margin-bottom: 8px; color: #6fffe9; font-weight: 700; }
            .subtitle { font-size: 14px; color: #94a3b8; margin-bottom: 20px; }
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
            .connected-view { padding: 20px 0; }
            .connected-icon { font-size: 64px; margin-bottom: 16px; }
            .audio-test { margin-top: 20px; padding: 16px; background: #0b132b; border-radius: 12px; text-align: left; }
            .audio-test p { font-size: 12px; color: #94a3b8; margin-bottom: 8px; }
            audio { width: 100%; height: 36px; border-radius: 8px; }
            .actions-bar { margin-top: 16px; display: flex; justify-content: center; gap: 12px; }
            .btn-small { background: #334155; border: none; color: #94a3b8; padding: 6px 12px; border-radius: 6px; font-size: 11px; cursor: pointer; text-decoration: none; }
            .btn-small:hover { background: #475569; color: white; }
            .footer { margin-top: 24px; font-size: 12px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>👵 Bot de Recetas de la Abuela</h1>
            <div class="subtitle">Servidor Render 24/7 • Respuestas Automáticas con Voz</div>
            
            <div id="statusBadge" class="badge waiting">
                ${connectionStatus}
            </div>

            <div id="notConnectedArea" style="display: ${isConnected ? 'none' : 'block'};">
                <div class="tabs">
                    <button class="tab-btn active" onclick="switchTab('tab-phone')">📱 Vincular con Número</button>
                    <button class="tab-btn" onclick="switchTab('tab-qr')">📷 Escanear QR</button>
                </div>

                <div id="tab-phone" class="tab-content active">
                    <div class="pairing-box">
                        <label>Tu número de WhatsApp (con código de país)</label>
                        <div class="pairing-input-row">
                            <input id="phoneNumberInput" type="tel" placeholder="Ej: 5491123456789 o 34612345678" />
                            <button id="btnPair" onclick="requestPairing()">Vincular</button>
                        </div>
                        <div id="pairingCodeContainer" style="display: none;" class="code-display">
                            <div style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">CÓDIGO DE VINCULACIÓN:</div>
                            <div id="codeDisplay" class="digits">----</div>
                        </div>
                        <div class="steps">
                            <ol>
                                <li>Escribe tu número y presiona <b>Vincular</b>.</li>
                                <li>En tu teléfono abre WhatsApp > <b>Dispositivos vinculados</b>.</li>
                                <li>Toca <b>Vincular un dispositivo</b> > <b>Vincular con el número de teléfono</b>.</li>
                                <li>Ingresa el código que aparecerá arriba.</li>
                            </ol>
                        </div>
                    </div>
                </div>

                <div id="tab-qr" class="tab-content">
                    <div id="qrBox" class="qr-box">
                        ${qrImageBase64 ? `<img id="qrImg" src="${qrImageBase64}" alt="QR" />` : '<div style="width:230px;height:230px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:13px;">Generando código QR...</div>'}
                    </div>
                    <div class="steps" style="text-align: center;">
                        Abre WhatsApp > <b>Dispositivos vinculados</b> > <b>Vincular un dispositivo</b> y apunta la cámara al código QR.
                    </div>
                </div>

                <div class="actions-bar">
                    <button class="btn-small" onclick="resetSession()">🔄 Reiniciar sesión</button>
                    <a class="btn-small" href="/logs" target="_blank">📋 Ver logs del servidor</a>
                </div>
            </div>

            <div id="connectedArea" class="connected-view" style="display: ${isConnected ? 'block' : 'none'};">
                <div class="connected-icon">✅</div>
                <h2 style="color: #4ade80; font-size: 20px; margin-bottom: 8px;">¡Bot Activo y Protegido en la Nube 24/7!</h2>
                <p style="font-size: 14px; color: #94a3b8; line-height: 1.5;">
                    Cada vez que un cliente pregunte por el <b>libro de recetas</b>, <b>precio</b>, <b>abuela</b> o <b>adquirir</b>, el bot simulará 3 segundos de grabación y enviará la nota de voz nativa de 1 minuto automáticamente.
                </p>

                <div class="audio-test">
                    <p>🎧 Nota de voz configurada (1m 4s - Opus PTT):</p>
                    <audio controls src="/audio-preview"></audio>
                </div>
            </div>

            <div class="footer">Servidor Cloud 24/7 • Monitoreo UptimeRobot • Costo $0.00</div>
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
                const phoneInput = document.getElementById('phoneNumberInput');
                const btn = document.getElementById('btnPair');
                const phone = phoneInput.value.replace(/[^0-9]/g, '');
                if (!phone || phone.length < 8) {
                    alert('Ingresa un número válido con código de país (ej: 54911...).');
                    return;
                }
                btn.disabled = true;
                btn.innerText = 'Generando...';
                try {
                    const res = await fetch('/api/request-pairing-code', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone })
                    });
                    const data = await res.json();
                    if (data.code) {
                        document.getElementById('codeDisplay').innerText = data.code;
                        document.getElementById('pairingCodeContainer').style.display = 'block';
                    } else {
                        alert(data.error || 'No se pudo generar el código. Intenta nuevamente.');
                    }
                } catch(e) {
                    alert('Error: ' + e.message);
                } finally {
                    btn.disabled = false;
                    btn.innerText = 'Vincular';
                }
            }

            async function resetSession() {
                if (!confirm('¿Reiniciar la sesión de WhatsApp para generar un nuevo código limpio?')) return;
                await fetch('/api/reset-session', { method: 'POST' });
                window.location.reload();
            }

            setInterval(async () => {
                try {
                    const res = await fetch('/api/status');
                    const data = await res.json();
                    const badge = document.getElementById('statusBadge');
                    badge.innerText = data.status;
                    
                    if (data.connected) {
                        badge.className = 'badge connected';
                        document.getElementById('notConnectedArea').style.display = 'none';
                        document.getElementById('connectedArea').style.display = 'block';
                    } else {
                        badge.className = data.status.includes('Reconectando') ? 'badge reconnecting' : 'badge waiting';
                        document.getElementById('notConnectedArea').style.display = 'block';
                        document.getElementById('connectedArea').style.display = 'none';

                        if (data.qrBase64) {
                            const qrBox = document.getElementById('qrBox');
                            qrBox.innerHTML = '<img id="qrImg" src="' + data.qrBase64 + '" alt="QR" />';
                        }
                    }
                } catch(e) {}
            }, 2500);
        </script>
    </body>
    </html>
    `);
});

app.get('/api/status', (req, res) => {
    res.json({
        status: connectionStatus,
        connected: isConnected,
        hasQR: !!qrImageBase64,
        qrBase64: qrImageBase64
    });
});

app.get('/logs', (req, res) => {
    res.type('text/plain').send(recentLogs.join('\n') || 'No logs yet.');
});

app.post('/api/reset-session', async (req, res) => {
    log('[RESET] Usuario solicitó reinicio completo de sesión');
    try {
        if (sock) {
            try { sock.ev.removeAllListeners(); sock.ws?.close(); } catch(e){}
            sock = null;
        }
        const authFolder = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
        }
        currentQR = null;
        qrImageBase64 = null;
        connectionStatus = 'Sesión reiniciada. Reconectando...';
        startWhatsApp();
        res.json({ ok: true });
    } catch (err) {
        log(`[RESET ERROR] ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/request-pairing-code', async (req, res) => {
    try {
        const { phone } = req.body;
        const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
        if (!cleanPhone || cleanPhone.length < 8) {
            return res.status(400).json({ error: 'Número de teléfono inválido' });
        }
        if (!sock) {
            return res.status(503).json({ error: 'Iniciando WhatsApp. Espera 5 segundos...' });
        }
        if (isConnected) {
            return res.status(400).json({ error: 'Ya está conectado.' });
        }

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

app.get('/audio-preview', (req, res) => {
    const audioPath = path.join(__dirname, 'audio_abuela.ogg');
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

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const remoteJid = msg.key.remoteJid;
            if (remoteJid.endsWith('@g.us') || remoteJid.includes('@newsletter') || remoteJid.includes('status@broadcast')) {
                return;
            }

            const body = (
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                ''
            ).toLowerCase().trim();

            log(`[MSG] De ${remoteJid}: "${body}"`);

            const keywords = [
                'libro', 'receta', 'recetas', 'abuela', 'valor', 'precio',
                'costo', 'adquirir', 'comprar', 'interesa', 'cuanto', 'cuánto',
                'informacion', 'información', 'info', 'hola', 'buenas'
            ];
            const matches = keywords.some(k => body.includes(k));

            if (matches) {
                log(`[INTENCIÓN] Mensaje coincide con intención de compra. Respondiendo...`);
                try {
                    // Simulación realista de 3s grabando nota de voz
                    await sock.sendPresenceUpdate('recording', remoteJid);
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    // Envío de nota de voz nativa (PTT Opus con micrófono verde)
                    const audioPath = path.join(__dirname, 'audio_abuela.ogg');
                    if (fs.existsSync(audioPath)) {
                        await sock.sendMessage(remoteJid, {
                            audio: fs.readFileSync(audioPath),
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: true
                        }, { quoted: msg });
                        log(`[ENVIADO] Nota de voz de 1 minuto entregada a ${remoteJid}`);
                    }
                } catch (err) {
                    log(`[ERROR ENVÍO] ${err.message}`);
                }
            }
        });

    } catch (err) {
        log(`[START ERROR] ${err.message}`);
        reconnectTimeout = setTimeout(startWhatsApp, 5000);
    }
}

startWhatsApp();
