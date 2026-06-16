import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const log = require('electron-log');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const AUTOSYNC_USER = process.env.VITE_AUTOSYNC_USER;
const AUTOSYNC_PASS = process.env.VITE_AUTOSYNC_PASS;
const GQL_URL = process.env.VITE_GQL_URL ?? 'http://11.1.19.4:4000/graphql';
const WMI_URL = process.env.VITE_WMI_URL ?? 'http://localhost:6060/api/hw-info';

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

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

      const jitter = Math.floor(Math.random() * 30 * 60000); // max 30 min
      log.info(`[AutoSync Main] Programado en ${Math.round(jitter / 60000)} mins`);

      syncScheduled = true;
      setTimeout(async () => {
        await performSync(syncFile);
        syncScheduled = false;
      }, jitter);
    } catch (e) {
      log.error("[AutoSync Interval] Error:", e);
    }
  }, 3600000); // cada 1 hora

  // Intervalo 2: Polling de Forzar Sincronización (cada 24h, y también al arrancar)
  const checkForzarSync = async () => {
    try {
      const wmiRes = await fetchWithTimeout(WMI_URL);
      if (!wmiRes.ok) return;
      const wmiData = await wmiRes.json();
      if (!wmiData.num_serie) return;

      const user = AUTOSYNC_USER;
      const pass = AUTOSYNC_PASS;

      const headers = { 'Content-Type': 'application/json', 'x-origen': 'win' };
      // Login
      const logRes = await fetchWithTimeout(GQL_URL, {
        method: 'POST', headers, body: JSON.stringify({ query: `mutation { login(matricula: "${user}", password: "${pass}", equipoInfo: "${wmiData.num_serie}") { token } }` })
      });
      const logJson = await logRes.json();
      const token = logJson?.data?.login?.token;
      if (!token) return;

      // Check Forzar Sync
      headers['Authorization'] = `Bearer ${token}`;
      const checkRes = await fetchWithTimeout(GQL_URL, {
        method: 'POST', headers, body: JSON.stringify({ query: `query { checkSyncPending(num_serie: "${wmiData.num_serie}") }` })
      });
      const checkJson = await checkRes.json();
      const isPending = checkJson?.data?.checkSyncPending;

      if (isPending) {
        log.info("[AutoSync] Forzar Sincronización detectado.");
        const syncFile = path.join(app.getPath('userData'), 'autosync.json');
        await performSync(syncFile);

        // Limpiar bandera
        await fetchWithTimeout(GQL_URL, {
          method: 'POST', headers, body: JSON.stringify({ query: `mutation { clearSyncPending(num_serie: "${wmiData.num_serie}") }` })
        });
        log.info("[AutoSync] Bandera de forzar sync limpiada.");
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        log.error("[Polling] Timeout de 15s excedido en fetch.");
      } else {
        log.error("[Polling] Error:", e);
      }
    }
  };


  // Correr al arrancar (jitter entre 30s y 5m para evitar saturación)
  const initJitter = Math.floor(Math.random() * 20000) + 10000; // 10-30s
  log.info(`[AutoSync] Arranque programado en ${Math.round(initJitter / 1000)}s`);
  setTimeout(checkForzarSync, initJitter);
  // Y repetir cada 24h
  setInterval(checkForzarSync, 24 * 3600000);
};

async function performSync(syncFile) {
  try {
    const wmiRes = await fetchWithTimeout(WMI_URL);
    if (!wmiRes.ok) return;
    const wmiData = await wmiRes.json();
    if (!wmiData.num_serie) return;

    const user = AUTOSYNC_USER;
    const pass = AUTOSYNC_PASS;

    const queryGraphQL = async (query, token = null) => {
      const headers = { 'Content-Type': 'application/json', 'x-origen': 'win' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetchWithTimeout(GQL_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query })
      });
      const json = await res.json();
      return json.data;
    };

    // 1. Login
    const loginData = await queryGraphQL(`mutation { login(matricula: "${user}", password: "${pass}", equipoInfo: "${wmiData.num_serie}") { token } }`);
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

    await queryGraphQL(`
      mutation { upsertEspecificacionTI(
        id_bien: "${id_bien}"
        cpu_info: ${N(wmiData.cpu_info)}
        ram_gb: ${I(wmiData.ram_gb)}
        almacenamiento_gb: ${I(wmiData.almacenamiento_gb)}
        mac_address: ${N(macString || wmiData.mac_address)}
        dir_ip: ${N(dirIpString || wmiData.dir_ip)}
        modelo_so: ${N(wmiData.modelo_so)}
        windows_serial: ${N(wmiData.windows_serial)}
        nombre_host: ${N(wmiData.nom_pc)}
        version_office: ${N(wmiData.version_office)}
        last_scan: ${N(wmiData.fecha_act_antivirus)}
      ) { id_bien } }
    `, token);
    log.info(`[AutoSync Main] Specs TI sincronizados para id_bien: ${id_bien}`);

    // Las cuentas de usuario ahora se gestionan de forma manual en la web
    // Ya no se sincronizan automáticamente desde el agente de Windows

    if (wmiData.programas && wmiData.programas.length > 0) {
      const progsStr = JSON.stringify(wmiData.programas.map(p => ({
        programa: p.nombre_programa || p.programa || '',
        version: p.version || '',
        fecha_instalacion: p.fecha_instalacion || ''
      }))).replace(/"([a-zA-Z0-9_]+)":/g, '$1:');
      await queryGraphQL(`mutation { syncProgramasPC(id_bien: "${id_bien}", programas: ${progsStr}) }`, token);
      log.info(`[AutoSync Main] ${wmiData.programas.length} programas sincronizados`);
    }

    if (wmiData.monitores && wmiData.monitores.length > 0) {
      const monitoresStr = JSON.stringify(wmiData.monitores.map(m => ({
        marca: m.marca || '',
        modelo: m.modelo || '',
        num_serie: m.num_serie || ''
      }))).replace(/"([a-zA-Z0-9_]+)":/g, '$1:');
      await queryGraphQL(`mutation { syncMonitoresPC(id_bien: "${id_bien}", monitores: ${monitoresStr}) }`, token);
      log.info(`[AutoSync Main] ${wmiData.monitores.length} monitores sincronizados`);
    }

    fs.writeFileSync(syncFile, JSON.stringify({ lastSync: Date.now() }));
    log.info("[AutoSync Main] Éxito");

  } catch (e) {
    if (e.name === 'AbortError') {
      log.error("[AutoSync Main] Timeout de 15s excedido en fetch.");
    } else {
      log.error("[AutoSync Main] Falló:", e);
    }
  }
}
