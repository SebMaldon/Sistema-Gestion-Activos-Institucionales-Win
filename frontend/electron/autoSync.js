import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const AUTOSYNC_USER = process.env.VITE_AUTOSYNC_USER;
const AUTOSYNC_PASS = process.env.VITE_AUTOSYNC_PASS;
const GQL_URL = process.env.VITE_GQL_URL ?? 'http://11.1.19.4:4000/graphql';
const WMI_URL = process.env.VITE_WMI_URL ?? 'http://localhost:6060/api/hw-info';

export const startAutoSync = () => {
  // Intervalo 1: AutoSync natural (cada hora chequea si pasaron 72h)
  let syncScheduled = false; // evita acumular timeouts si el app corre mucho tiempo
  setInterval(async () => {
    try {
      const syncFile = path.join(app.getPath('userData'), 'autosync.json');
      let lastSync = 0;
      if (fs.existsSync(syncFile)) {
        lastSync = JSON.parse(fs.readFileSync(syncFile, 'utf-8')).lastSync || 0;
      }

      const now = Date.now();
      if (now - lastSync < 72 * 3600 * 1000) return;
      if (syncScheduled) return; // ya hay un sync pendiente en cola

      const jitter = Math.floor(Math.random() * 8 * 3600 * 1000);
      console.log(`[AutoSync Main] Programado en ${Math.round(jitter / 60000)} mins`);

      syncScheduled = true;
      setTimeout(async () => {
        await performSync(syncFile);
        syncScheduled = false;
      }, jitter);
    } catch (e) {
      console.error("[AutoSync Interval] Error:", e);
    }
  }, 3600000); // cada 1 hora

  // Intervalo 2: Polling de Forzar Sincronización (cada 24h, y también al arrancar)
  const checkForzarSync = async () => {
    try {
      const wmiRes = await fetch(WMI_URL);
      if (!wmiRes.ok) return;
      const wmiData = await wmiRes.json();
      if (!wmiData.num_serie) return;

      const user = AUTOSYNC_USER;
      const pass = AUTOSYNC_PASS;

      const headers = { 'Content-Type': 'application/json', 'x-origen': 'win' };
      // Login
      const logRes = await fetch(GQL_URL, {
        method: 'POST', headers, body: JSON.stringify({ query: `mutation { login(matricula: "${user}", password: "${pass}") { token } }` })
      });
      const logJson = await logRes.json();
      const token = logJson?.data?.login?.token;
      if (!token) return;

      // Check Forzar Sync
      headers['Authorization'] = `Bearer ${token}`;
      const checkRes = await fetch(GQL_URL, {
        method: 'POST', headers, body: JSON.stringify({ query: `query { checkSyncPending(num_serie: "${wmiData.num_serie}") }` })
      });
      const checkJson = await checkRes.json();
      const isPending = checkJson?.data?.checkSyncPending;

      if (isPending) {
        console.log("[AutoSync] Forzar Sincronización detectado.");
        const syncFile = path.join(app.getPath('userData'), 'autosync.json');
        await performSync(syncFile);

        // Limpiar bandera
        await fetch(GQL_URL, {
          method: 'POST', headers, body: JSON.stringify({ query: `mutation { clearSyncPending(num_serie: "${wmiData.num_serie}") }` })
        });
        console.log("[AutoSync] Bandera de forzar sync limpiada.");
      }
    } catch (e) {
      console.error("[Polling] Error:", e);
    }
  };

  // Correr al arrancar (con delay de 30s para dar tiempo al app de inicializar)
  setTimeout(checkForzarSync, 30000);
  // Y repetir cada 24h
  setInterval(checkForzarSync, 24 * 3600000);
};

async function performSync(syncFile) {
  try {
    const wmiRes = await fetch(WMI_URL);
    if (!wmiRes.ok) return;
    const wmiData = await wmiRes.json();
    if (!wmiData.num_serie) return;

    const user = AUTOSYNC_USER;
    const pass = AUTOSYNC_PASS;

    const queryGraphQL = async (query, token = null) => {
      const headers = { 'Content-Type': 'application/json', 'x-origen': 'win' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(GQL_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query })
      });
      const json = await res.json();
      return json.data;
    };

    // 1. Login
    const loginData = await queryGraphQL(`mutation { login(matricula: "${user}", password: "${pass}") { token } }`);
    const token = loginData?.login?.token;
    if (!token) return;

    // 2. Obtener id_bien
    const bienData = await queryGraphQL(`query { bienes(filter: { search: "${wmiData.num_serie}" }) { edges { node { id_bien } } } }`, token);
    const id_bien = bienData?.bienes?.edges?.[0]?.node?.id_bien;
    if (!id_bien) return;

    // 3. Sincronizar
    const N = (v) => v ? JSON.stringify(v) : "null";
    const I = (v) => v ? v : "null";
    const dirIpString = (wmiData.adaptadores_red?.slice(0, 3) || []).map(x => x.ip).filter(Boolean).join('/');
    const macString = (wmiData.adaptadores_red?.slice(0, 3) || []).map(x => x.mac).filter(Boolean).join('/');

    if (wmiData.cpu_info || wmiData.ram_gb || wmiData.almacenamiento_gb) {
      await queryGraphQL(`
        mutation { upsertEspecificacionTI(
          id_bien: "${id_bien}"
          cpu_info: ${N(wmiData.cpu_info)}
          ram_gb: ${I(wmiData.ram_gb)}
          almacenamiento_gb: ${I(wmiData.almacenamiento_gb)}
          mac_address: ${N(macString || wmiData.mac_address)}
          dir_ip: ${N(dirIpString || wmiData.dir_ip)}
          modelo_so: ${N(wmiData.modelo_so)}
        ) { id_bien } }
      `, token);
    }

    if (wmiData.programas && wmiData.programas.length > 0) {
      const progsStr = JSON.stringify(wmiData.programas.map(p => ({
        programa: p.nombre_programa || p.programa || '',
        version: p.version || '',
        fecha_instalacion: p.fecha_instalacion || ''
      }))).replace(/"([a-zA-Z0-9_]+)":/g, '$1:');
      await queryGraphQL(`mutation { syncProgramasPC(id_bien: "${id_bien}", programas: ${progsStr}) }`, token);
    }

    fs.writeFileSync(syncFile, JSON.stringify({ lastSync: Date.now() }));
    console.log("[AutoSync Main] Éxito");

  } catch (e) {
    console.error("[AutoSync Main] Falló:", e);
  }
}
