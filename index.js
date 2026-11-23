const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

let currentQR = null;
let connectionStatus = 'Iniciando servidor...';
let qrImageBase64 = null;

// Dashboard Web para escanear el QR y verificar estado
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bot de WhatsApp - Libro de la Abuela</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; text-align: center; }
            .card { background: #1e293b; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); max-width: 480px; width: 100%; border: 1px solid #334155; }
            h1 { font-size: 22px; margin-bottom: 12px; color: #38bdf8; }
            .status { display: inline-block; padding: 6px 14px; border-radius: 9999px; font-size: 14px; font-weight: 600; margin-bottom: 24px; }
            .status.waiting { background: #fef08a; color: #854d0e; }
            .status.connected { background: #bbf7d0; color: #166534; }
            .qr-box { background: white; padding: 16px; border-radius: 12px; display: inline-block; margin-bottom: 20px; }
            .qr-box img { display: block; max-width: 250px; height: auto; }
            p { font-size: 14px; color: #94a3b8; line-height: 1.5; margin: 0; }
            .footer { margin-top: 24px; font-size: 12px; color: #64748b; }
        </style>
        <script>
            // Auto refrescar si no está conectado
            setTimeout(() => {
                const status = "${connectionStatus}";
                if (!status.includes("Conectado")) {
                    window.location.reload();
                }
            }, 6000);
        </script>
    </head>
    <body>
        <div class="card">
            <h1>👵 Bot de Recetas de la Abuela</h1>
            <div class="status ${connectionStatus.includes('Conectado') ? 'connected' : 'waiting'}">
                ${connectionStatus}
            </div>
            
            ${qrImageBase64 && !connectionStatus.includes('Conectado') ? `
                <div class="qr-box">
                    <img src="${qrImageBase64}" alt="Código QR de WhatsApp" />
                </div>
                <p>Abre WhatsApp en tu teléfono > <b>Dispositivos vinculados</b> > <b>Vincular un dispositivo</b> y apunta la cámara a este código.</p>
            ` : ''}

            ${connectionStatus.includes('Conectado') ? `
                <div style="font-size: 54px; margin: 20px 0;">✅</div>
                <p style="color: #4ade80; font-weight: 600;">¡Bot 100% activo en la nube y respondiendo 24/7!</p>
                <p style="margin-top: 10px;">Cada vez que alguien pregunte por el libro o precio, responderá automáticamente con la nota de voz.</p>
            ` : ''}

            <div class="footer">Servidor Render 24/7 • Uptime activo</div>
        </div>
    </body>
    </html>
    `);
});

// Endpoint de salud para UptimeRobot
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), connected: connectionStatus.includes('Conectado') });
});

app.listen(PORT, () => {
    console.log(`Servidor HTTP activo en puerto ${PORT}`);
});

// Baileys WhatsApp Connection
async function connectToWhatsApp() {
    const authFolder = path.join(__dirname, 'auth_info');
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQR = qr;
            qrImageBase64 = await QRCode.toDataURL(qr);
            connectionStatus = 'Escanea el código QR abajo 👇';
            console.log('Nuevo QR generado para escanear.');
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            connectionStatus = 'Reconectando con WhatsApp...';
            console.log('Conexión cerrada. Reconectando:', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 3000);
            }
        } else if (connection === 'open') {
            connectionStatus = '✅ Conectado y Listo 24/7';
            currentQR = null;
            qrImageBase64 = null;
            console.log('¡Conexión abierta con WhatsApp!');
        }
    });

    // Escuchar mensajes entrantes
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        // Evitar responder en grupos
        if (remoteJid.endsWith('@g.us')) return;

        const body = (
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            ''
        ).toLowerCase();

        console.log(`Mensaje recibido de ${remoteJid}: "${body}"`);

        // Palabras clave de intención de compra
        const keywords = ['libro', 'receta', 'recetas', 'abuela', 'valor', 'precio', 'costo', 'adquirir', 'comprar', 'interesa', 'cuanto', 'cuánto'];
        const matches = keywords.some(k => body.includes(k));

        if (matches) {
            console.log(`Detectada intención de compra en ${remoteJid}. Enviando audio de la abuela...`);

            try {
                // 1. Simular que está grabando nota de voz por 3 segundos
                await sock.sendPresenceUpdate('recording', remoteJid);
                await new Promise(resolve => setTimeout(resolve, 3000));

                // 2. Enviar nota de voz nativa (.ogg Opus con ptt: true)
                const audioPath = path.join(__dirname, 'audio_abuela.ogg');
                if (fs.existsSync(audioPath)) {
                    await sock.sendMessage(remoteJid, {
                        audio: fs.readFileSync(audioPath),
                        mimetype: 'audio/ogg; codecs=opus',
                        ptt: true
                    }, { quoted: msg });
                    console.log(`Nota de voz enviada exitosamente a ${remoteJid}`);
                } else {
                    console.error('El archivo audio_abuela.ogg no fue encontrado.');
                }
            } catch (err) {
                console.error('Error enviando nota de voz:', err);
            }
        }
    });
}

connectToWhatsApp();
