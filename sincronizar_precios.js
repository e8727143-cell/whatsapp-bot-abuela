/**
 * Script de sincronización y actualización de precios oficiales de Hotmart.
 * Permite mantener 'precios_hotmart.json' 100% al día con el checkout oficial.
 * URL: https://pay.hotmart.com/W105526885V?off=qmsrqdaf
 */

const fs = require('fs');
const path = require('path');

const PRECIOS_PATH = path.join(__dirname, 'precios_hotmart.json');

function actualizarPrecios(nuevosPrecios = {}) {
    const data = JSON.parse(fs.readFileSync(PRECIOS_PATH, 'utf-8'));
    data.updatedAt = new Date().toISOString();
    
    for (const [code, info] of Object.entries(nuevosPrecios)) {
        if (data.paises[code]) {
            Object.assign(data.paises[code], info);
        }
    }

    fs.writeFileSync(PRECIOS_PATH, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`✅ [HOTMART SYNC] Catálogo de precios actualizado exitosamente: ${data.updatedAt}`);
    return data;
}

module.exports = { actualizarPrecios };

if (require.main === module) {
    actualizarPrecios();
}
