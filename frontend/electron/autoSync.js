import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export const startAutoSync = () => {
  // Checa cada hora
  setInterval(async () => {
    try {
      const syncFile = path.join(app.getPath('userData'), 'autosync.json');
      let lastSync = 0;
      if (fs.existsSync(syncFile)) {
        lastSync = JSON.parse(fs.readFileSync(syncFile, 'utf-8')).lastSync || 0;
      }
      
      const now = Date.now();
      if (now - lastSync < 48 * 3600 * 1000) return;

      const jitter = Math.floor(Math.random() * 8 * 3600 * 1000);
      console.log(`[AutoSync Main] Programado en ${Math.round(jitter / 60000)} mins`);

      setTimeout(async () => {
        try {
          const wmiRes = await fetch('http://localhost:5200/api/wmi/hardware');
          if (!wmiRes.ok) return;
          const wmiData = await wmiRes.json();
          if (!wmiData.num_serie) return;

          const GQL_URL = 'http://11.1.19.4:4000/graphql';
          const user = 'ti_autosync';
          const pass = 'ti_autosync123';

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
          const dirIpString = (wmiData.adaptadores_red?.slice(0,3) || []).map(x => x.ip).filter(Boolean).join('/');
          const macString = (wmiData.adaptadores_red?.slice(0,3) || []).map(x => x.mac).filter(Boolean).join('/');

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
              nombre_programa: p.nombre_programa || '',
              version: p.version || '',
              editor: p.editor || '',
              fecha_instalacion: p.fecha_instalacion || ''
            }))).replace(/"([a-zA-Z0-9_]+)":/g, '$1:');
            await queryGraphQL(`mutation { syncProgramasPC(id_bien: "${id_bien}", programas: ${progsStr}) }`, token);
          }

          fs.writeFileSync(syncFile, JSON.stringify({ lastSync: Date.now() }));
          console.log("[AutoSync Main] Éxito");

        } catch (e) {
          console.error("[AutoSync Main] Falló:", e);
        }
      }, jitter);
    } catch (e) {
      console.error("[AutoSync Interval] Error:", e);
    }
  }, 3600000); // 1 hora
};
