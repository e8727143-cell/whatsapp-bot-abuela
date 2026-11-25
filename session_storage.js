const fs = require('fs');
const path = require('path');

let mongodbClient = null;

/**
 * Restaura los archivos de sesión desde la nube (Upstash Redis o MongoDB) hacia authFolder.
 */
async function restaurarSesionDesdeNube(authFolder) {
  if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
  }

  // 1. UPSTASH REDIS REST API (100% serverless vía HTTP fetch nativo)
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    try {
      console.log('🔄 [SESION NUBE] Buscando credenciales guardadas en Upstash Redis...');
      const res = await fetch(`${upstashUrl}/hgetall/whatsapp_session`, {
        headers: { Authorization: `Bearer ${upstashToken}` }
      });
      if (res.ok) {
        const body = await res.json();
        const data = body.result;
        if (data && typeof data === 'object') {
          let files = {};
          if (Array.isArray(data)) {
            for (let i = 0; i < data.length; i += 2) {
              files[data[i]] = data[i + 1];
            }
          } else {
            files = data;
          }

          const keys = Object.keys(files);
          if (keys.length > 0) {
            let restoredCount = 0;
            for (const [filename, content] of Object.entries(files)) {
              if (filename && content) {
                const filePath = path.join(authFolder, filename);
                fs.writeFileSync(filePath, content, 'utf-8');
                restoredCount++;
              }
            }
            console.log(`✅ [SESION NUBE] ¡Sesión de WhatsApp restaurada desde Upstash Redis! (${restoredCount} archivos cargados)`);
            return true;
          }
        }
        console.log('ℹ️ [SESION NUBE] No hay sesión previa en Upstash Redis aún. Se guardará al vincular.');
      }
    } catch (e) {
      console.error('⚠️ [SESION NUBE] Error al restaurar desde Upstash Redis:', e.message);
    }
  }

  // 2. MONGODB ATLAS
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri) {
    try {
      console.log('🔄 [SESION NUBE] Buscando credenciales guardadas en MongoDB Atlas...');
      const { MongoClient } = require('mongodb');
      if (!mongodbClient) {
        mongodbClient = new MongoClient(mongoUri);
        await mongodbClient.connect();
      }
      const col = mongodbClient.db().collection('whatsapp_session');
      const docs = await col.find({}).toArray();
      if (docs.length > 0) {
        let restoredCount = 0;
        for (const doc of docs) {
          if (doc._id && doc.data) {
            const filePath = path.join(authFolder, doc._id);
            fs.writeFileSync(filePath, doc.data, 'utf-8');
            restoredCount++;
          }
        }
        console.log(`✅ [SESION NUBE] ¡Sesión de WhatsApp restaurada desde MongoDB Atlas! (${restoredCount} archivos cargados)`);
        return true;
      } else {
        console.log('ℹ️ [SESION NUBE] No hay sesión previa en MongoDB Atlas aún. Se guardará al vincular.');
      }
    } catch (e) {
      console.error('⚠️ [SESION NUBE] Error al restaurar desde MongoDB Atlas:', e.message);
    }
  }

  return false;
}

let syncTimeout = null;

/**
 * Guarda los archivos de sesión en la nube (Upstash Redis o MongoDB) de forma debounced.
 */
function guardarSesionEnNube(authFolder) {
  if (syncTimeout) clearTimeout(syncTimeout);

  syncTimeout = setTimeout(async () => {
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const mongoUri = process.env.MONGODB_URI;

    if (!upstashUrl && !mongoUri) return;
    if (!fs.existsSync(authFolder)) return;

    try {
      const files = fs.readdirSync(authFolder);
      if (files.length === 0) return;

      // 1. Guardar en Upstash Redis vía endpoint /pipeline
      if (upstashUrl && upstashToken) {
        const pipeline = [];
        for (const f of files) {
          const filePath = path.join(authFolder, f);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const content = fs.readFileSync(filePath, 'utf-8');
            pipeline.push(['HSET', 'whatsapp_session', f, content]);
          }
        }
        if (pipeline.length > 0) {
          const res = await fetch(`${upstashUrl}/pipeline`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${upstashToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(pipeline)
          });
          if (res.ok) {
            console.log(`💾 [SESION NUBE] ${pipeline.length} archivos de sesión guardados en Upstash Redis.`);
          }
        }
      }

      // 2. Guardar en MongoDB Atlas
      if (mongoUri) {
        if (!mongodbClient) {
          const { MongoClient } = require('mongodb');
          mongodbClient = new MongoClient(mongoUri);
          await mongodbClient.connect();
        }
        const col = mongodbClient.db().collection('whatsapp_session');
        const bulk = [];
        for (const f of files) {
          const filePath = path.join(authFolder, f);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const content = fs.readFileSync(filePath, 'utf-8');
            bulk.push({
              updateOne: {
                filter: { _id: f },
                update: { $set: { data: content, updatedAt: new Date() } },
                upsert: true
              }
            });
          }
        }
        if (bulk.length > 0) {
          await col.bulkWrite(bulk);
          console.log(`💾 [SESION NUBE] ${bulk.length} archivos de sesión guardados en MongoDB Atlas.`);
        }
      }
    } catch (e) {
      console.error('⚠️ [SESION NUBE] Error al sincronizar sesión:', e.message);
    }
  }, 2500); // Debounce de 2.5 segundos
}

/**
 * Borra la sesión en la nube si el usuario hace logout explícito.
 */
async function borrarSesionEnNube() {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const mongoUri = process.env.MONGODB_URI;

  try {
    if (upstashUrl && upstashToken) {
      await fetch(`${upstashUrl}/del/whatsapp_session`, {
        headers: { Authorization: `Bearer ${upstashToken}` }
      });
      console.log('🗑️ [SESION NUBE] Sesión eliminada de Upstash Redis por logout.');
    }
    if (mongoUri && mongodbClient) {
      await mongodbClient.db().collection('whatsapp_session').drop().catch(() => {});
      console.log('🗑️ [SESION NUBE] Sesión eliminada de MongoDB Atlas por logout.');
    }
  } catch (e) {}
}

let saveConvTimeout = null;

/**
 * Guarda el historial completo de conversaciones en la nube (Upstash Redis o MongoDB) de forma debounced.
 */
function guardarConversacionesEnNube(conversaciones) {
  if (saveConvTimeout) clearTimeout(saveConvTimeout);

  saveConvTimeout = setTimeout(async () => {
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const mongoUri = process.env.MONGODB_URI;

    if (!upstashUrl && !mongoUri) return;

    try {
      const payload = JSON.stringify(conversaciones);

      // 1. Upstash Redis
      if (upstashUrl && upstashToken) {
        await fetch(`${upstashUrl}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${upstashToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(['SET', 'whatsapp_conversaciones', payload])
        });
        console.log(`💾 [MEMORIA NUBE] ${Object.keys(conversaciones).length} chats respaldados en Upstash Redis.`);
      }

      // 2. MongoDB Atlas
      if (mongoUri) {
        if (!mongodbClient) {
          const { MongoClient } = require('mongodb');
          mongodbClient = new MongoClient(mongoUri);
          await mongodbClient.connect();
        }
        const col = mongodbClient.db().collection('whatsapp_memory');
        await col.updateOne(
          { _id: 'conversaciones' },
          { $set: { data: payload, updatedAt: new Date() } },
          { upsert: true }
        );
        console.log(`💾 [MEMORIA NUBE] Chats respaldados en MongoDB Atlas.`);
      }
    } catch (e) {
      console.warn('⚠️ [MEMORIA NUBE] Error al guardar historial en la nube:', e.message);
    }
  }, 2000);
}

/**
 * Restaura el historial completo de conversaciones desde la nube (Upstash Redis o MongoDB).
 */
async function restaurarConversacionesDesdeNube() {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const mongoUri = process.env.MONGODB_URI;

  if (upstashUrl && upstashToken) {
    try {
      console.log('🔄 [MEMORIA NUBE] Recuperando historial de conversaciones desde Upstash Redis...');
      const res = await fetch(`${upstashUrl}/get/whatsapp_conversaciones`, {
        headers: { Authorization: `Bearer ${upstashToken}` }
      });
      if (res.ok) {
        const body = await res.json();
        if (body.result) {
          const parsed = typeof body.result === 'string' ? JSON.parse(body.result) : body.result;
          console.log(`✅ [MEMORIA NUBE] ¡Historial de conversaciones restaurado desde Upstash! (${Object.keys(parsed).length} chats en memoria)`);
          return parsed;
        }
      }
    } catch (e) {
      console.warn('⚠️ [MEMORIA NUBE] Error al restaurar desde Upstash Redis:', e.message);
    }
  }

  if (mongoUri) {
    try {
      const { MongoClient } = require('mongodb');
      if (!mongodbClient) {
        mongodbClient = new MongoClient(mongoUri);
        await mongodbClient.connect();
      }
      const col = mongodbClient.db().collection('whatsapp_memory');
      const doc = await col.findOne({ _id: 'conversaciones' });
      if (doc && doc.data) {
        const parsed = typeof doc.data === 'string' ? JSON.parse(doc.data) : doc.data;
        console.log(`✅ [MEMORIA NUBE] ¡Historial de conversaciones restaurado desde MongoDB! (${Object.keys(parsed).length} chats en memoria)`);
        return parsed;
      }
    } catch (e) {
      console.warn('⚠️ [MEMORIA NUBE] Error al restaurar desde MongoDB:', e.message);
    }
  }

  return null;
}

module.exports = {
  restaurarSesionDesdeNube,
  guardarSesionEnNube,
  borrarSesionEnNube,
  guardarConversacionesEnNube,
  restaurarConversacionesDesdeNube
};
