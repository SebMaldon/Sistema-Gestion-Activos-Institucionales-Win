const GRAPHQL_API_URL = import.meta.env.VITE_GQL_URL || 'http://localhost:4000/graphql';

export const queryGraphQL = async (query, variables = {}) => {
  const token = window.AUTO_SYNC_TOKEN || localStorage.getItem('jwtToken');
  const headers = {
    'Content-Type': 'application/json',
    'x-origen': 'win'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(GRAPHQL_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();
  if (json.errors) {
    const isAuthError = json.errors.some(err =>
      err.extensions?.code === 'UNAUTHENTICATED' ||
      err.message?.toLowerCase().includes('auth') ||
      err.message?.toLowerCase().includes('token')
    );
    if (isAuthError) {
      localStorage.removeItem('jwtToken');
      window.location.hash = '#/login';
      window.location.reload();
    }
    throw new Error(json.errors[0].message || 'GraphQL Error');
  }
  return json.data;
};

export const login = async (matricula, password) => {
  const query = `
    mutation($matricula: String!, $password: String!) {
      login(matricula: $matricula, password: $password) { token }
    }
  `;
  const data = await queryGraphQL(query, { matricula, password });
  if (data?.login?.token) {
    localStorage.setItem('jwtToken', data.login.token);
    return true;
  }
  return false;
};

export const logout = () => localStorage.removeItem('jwtToken');

export const getCatalogs = async () => {
  const query = `
    query {
      catModelos { clave_modelo descrip_disp tipo_disp }
      marcas { clave_marca marca }
      tiposDispositivo { tipo_disp nombre_tipo }
      unidades: catUnidades { clave descripcion desc_corta }
      segmentos: catSegmentos { id_segmento nombre clave ip bits }
    }
  `;
  return await queryGraphQL(query);
};

export const searchUsuarios = async (term) => {
  if (!term || term.length < 2) return [];
  const escaped = term.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const query = `
    query {
      usuarios(pagination: {first: 20}, search: "${escaped}") {
        edges { node { id_usuario matricula nombre_completo } }
      }
    }
  `;
  const data = await queryGraphQL(query);
  return data?.usuarios?.edges.map(e => ({
    value: String(e.node.id_usuario),
    label: `${e.node.matricula} - ${e.node.nombre_completo}`
  })) || [];
};

export const getUbicacionesPorUnidad = async (id_unidad) => {
  if (!id_unidad) return [];
  const query = `query { ubicacionesPorUnidad(id_unidad: "${id_unidad}") { id_ubicacion nombre_ubicacion } }`;
  const data = await queryGraphQL(query);
  return data?.ubicacionesPorUnidad || [];
};

export const createUbicacion = async (id_unidad, nombre_ubicacion) => {
  const query = `
    mutation { 
      createUbicacion(id_unidad: "${id_unidad}", nombre_ubicacion: "${nombre_ubicacion}") { 
        id_ubicacion nombre_ubicacion 
      } 
    }
  `;
  return await queryGraphQL(query);
};

export const createMarca = async (nombre_marca) => {
  const query = `mutation { createMarca(marca: "${nombre_marca}") { clave_marca marca } }`;
  return await queryGraphQL(query);
};

export const createModelo = async (clave_modelo, descrip_disp, clave_marca, tipo_disp) => {
  const query = `
    mutation { 
      createCatModelo(
        clave_modelo: "${clave_modelo}", 
        descrip_disp: "${descrip_disp}", 
        clave_marca: ${clave_marca}, 
        tipo_disp: ${tipo_disp}
      ) { clave_modelo descrip_disp } 
    }
  `;
  return await queryGraphQL(query);
};

export const saveAsset = async (isNew, assetData) => {
  const {
    id_bien, num_serie, num_inv, estatus_operativo, clave_unidad_ref,
    clave_modelo, id_usuario_resguardo, id_segmento, id_ubicacion, fecha_adquisicion
  } = assetData;

  const N = (v) => v ? JSON.stringify(v) : "null";
  const I = (v) => v ? v : "null";

  const mutCreate = `
    mutation { createBien(
      id_categoria: 1
      id_unidad_medida: 1
      num_serie: ${N(num_serie)}
      num_inv: ${N(num_inv)}
      estatus_operativo: ${N(estatus_operativo)}
      clave_unidad_ref: ${N(clave_unidad_ref)}
      clave_modelo: ${N(clave_modelo)}
      id_usuario_resguardo: ${I(id_usuario_resguardo)}
      id_segmento: ${I(id_segmento)}
      id_ubicacion: ${I(id_ubicacion)}
      fecha_adquisicion: ${N(fecha_adquisicion)}
    ) { id_bien } }
  `;

  const mutUpdate = `
    mutation { updateBien(
      id_bien: "${id_bien}"
      num_inv: ${N(num_inv)}
      estatus_operativo: ${N(estatus_operativo)}
      clave_unidad_ref: ${N(clave_unidad_ref)}
      clave_modelo: ${N(clave_modelo)}
      id_usuario_resguardo: ${I(id_usuario_resguardo)}
      id_segmento: ${I(id_segmento)}
      id_ubicacion: ${I(id_ubicacion)}
      fecha_adquisicion: ${N(fecha_adquisicion)}
    ) { id_bien } }
  `;


  const finalIdBien = isNew ? (await queryGraphQL(mutCreate)).createBien.id_bien : (await queryGraphQL(mutUpdate)).updateBien.id_bien;

  const hasTiFields = assetData.cpu_info || assetData.ram_gb || assetData.almacenamiento_gb ||
    assetData.nombre_host || assetData.mac_address || assetData.dir_ip ||
    assetData.modelo_so || assetData.windows_serial || assetData.version_office ||
    assetData.puerto_red || assetData.switch_red || assetData.fecha_act_antivirus;
  if (hasTiFields) {
    await queryGraphQL(`
      mutation { upsertEspecificacionTI(
        id_bien: "${finalIdBien}"
        cpu_info: ${N(assetData.cpu_info)}
        ram_gb: ${I(assetData.ram_gb)}
        almacenamiento_gb: ${I(assetData.almacenamiento_gb)}
        mac_address: ${N(assetData.mac_address)}
        dir_ip: ${N(assetData.dir_ip)}
        puerto_red: ${N(assetData.puerto_red)}
        switch_red: ${N(assetData.switch_red)}
        modelo_so: ${N(assetData.modelo_so)}
        last_scan: ${N(assetData.fecha_act_antivirus)}
        windows_serial: ${N(assetData.windows_serial)}
        nombre_host: ${N(assetData.nombre_host)}
        version_office: ${N(assetData.version_office)}
      ) { id_bien } }
    `);
  }

  // Guardar Cuentas PC (1:N) — procesar seleccionadas y eliminar las desmarcadas que ya existían
  const selectedCuentas = (assetData.cuentasList || []).filter(c => c._selected);
  const unselectedCuentas = (assetData.cuentasList || []).filter(c => !c._selected && c.id_cuenta);

  // Eliminar cuentas desmarcadas que ya estaban en BD
  if (unselectedCuentas.length > 0) {
    for (const c of unselectedCuentas) {
      try {
        await queryGraphQL(`mutation { deleteCuentaPC(id_cuenta: "${c.id_cuenta}") }`);
      } catch (err) {
        console.log(`Error eliminando cuenta desmarcada ${c.id_cuenta}:`, err);
      }
    }
  }

  if (selectedCuentas.length > 0) {
    for (const c of selectedCuentas) {
      if (c.id_cuenta && !c._new) {
        await queryGraphQL(`
          mutation {
            updateCuentaPC(
              id_cuenta: "${c.id_cuenta}"
              data: {
                cuenta_windows: ${N(c.cuenta_windows)}
                correo: ${N(c.correo)}
                tipo_user: ${N(c.tipo_user)}
              }
            ) { id_cuenta }
          }
        `);
      } else {
        await queryGraphQL(`
          mutation {
            createCuentaPC(
              id_bien: "${finalIdBien}"
              data: {
                cuenta_windows: ${N(c.cuenta_windows)}
                correo: ${N(c.correo)}
                tipo_user: ${N(c.tipo_user)}
              }
            ) { id_cuenta }
          }
        `);
      }
    }
  }


  if (assetData.programas && assetData.programas.length > 0) {
    const progsStr = JSON.stringify(assetData.programas.map(p => ({
      programa: p.nombre_programa || p.programa || '',
      version: p.version || '',
      fecha_instalacion: p.fecha_instalacion || ''
    }))).replace(/"([a-zA-Z0-9_]+)":/g, '$1:');

    try {
      await queryGraphQL(`
        mutation {
          syncProgramasPC(id_bien: "${finalIdBien}", programas: ${progsStr})
        }
      `);
    } catch (err) { console.log("No se pudo guardar programas_pc: ", err); }
  }

  return finalIdBien;
};

export const saveDirectSpecsAndPrograms = async (id_bien, assetData) => {
  const N = (v) => v ? JSON.stringify(v) : "null";
  const I = (v) => v ? v : "null";

  const hasTiFields2 = assetData.cpu_info || assetData.ram_gb || assetData.almacenamiento_gb ||
    assetData.nombre_host || assetData.mac_address || assetData.dir_ip ||
    assetData.modelo_so || assetData.windows_serial || assetData.version_office ||
    assetData.puerto_red || assetData.switch_red || assetData.fecha_act_antivirus;
  if (hasTiFields2) {
    await queryGraphQL(`
      mutation { upsertEspecificacionTI(
        id_bien: "${id_bien}"
        cpu_info: ${N(assetData.cpu_info)}
        ram_gb: ${I(assetData.ram_gb)}
        almacenamiento_gb: ${I(assetData.almacenamiento_gb)}
        mac_address: ${N(assetData.mac_address)}
        dir_ip: ${N(assetData.dir_ip)}
        puerto_red: ${N(assetData.puerto_red)}
        switch_red: ${N(assetData.switch_red)}
        modelo_so: ${N(assetData.modelo_so)}
        last_scan: ${N(assetData.fecha_act_antivirus)}
        windows_serial: ${N(assetData.windows_serial)}
        nombre_host: ${N(assetData.nombre_host)}
        version_office: ${N(assetData.version_office)}
      ) { id_bien } }
    `);
  }

  // Guardar cuentas — sincronizar con las seleccionadas (incluso si es 0, para borrar las existentes)
  const selectedCuentas2 = (assetData.cuentasList || []).filter(c => c._selected);
  const cuentasStr = JSON.stringify(selectedCuentas2.map(c => ({
    cuenta_windows: c.cuenta_windows || '',
    correo: c.correo || '',
    tipo_user: c.tipo_user || ''
  }))).replace(/"([a-zA-Z0-9_]+)":/g, '$1:');

  try {
    await queryGraphQL(`mutation { syncCuentasPC(id_bien: "${id_bien}", cuentas: ${cuentasStr}) }`);
  } catch (err) { console.log("No se pudo guardar cuentasList en update directo: ", err); }

  // Sincronizar monitores si hay detectados por WMI
  if (assetData.monitores && assetData.monitores.length > 0) {
    const monitoresStr = JSON.stringify(assetData.monitores.map(m => ({
      marca: m.marca || m.fabricante || '',
      modelo: m.modelo || '',
      num_serie: m.num_serie || ''
    }))).replace(/"([a-zA-Z0-9_]+)":/g, '$1:');

    try {
      await queryGraphQL(`mutation { syncMonitoresPC(id_bien: "${id_bien}", monitores: ${monitoresStr}) }`);
    } catch (err) { console.log("No se pudo guardar monitores en update directo: ", err); }
  }

  if (assetData.programas && assetData.programas.length > 0) {
    const progsStr = JSON.stringify(assetData.programas.map(p => ({
      programa: p.nombre_programa || p.programa || '',
      version: p.version || '',
      fecha_instalacion: p.fecha_instalacion || ''
    }))).replace(/"([a-zA-Z0-9_]+)":/g, '$1:');

    try {
      await queryGraphQL(`mutation { syncProgramasPC(id_bien: "${id_bien}", programas: ${progsStr}) }`);
    } catch (err) { console.log("No se pudo guardar programas_pc en update directo: ", err); }
  }
};

export const deleteCuentaPC = async (id_cuenta) => {
  return await queryGraphQL(`mutation { deleteCuentaPC(id_cuenta: "${id_cuenta}") }`);
};

export const solicitarActualizacionBien = async (idBien, datosNuevosJSON) => {
  const query = `
    mutation($idBien: ID!, $datosNuevos: String!) {
      solicitarActualizacionBien(idBien: $idBien, datosNuevos: $datosNuevos) {
        id estado fecha_solicitud
      }
    }
  `;
  return await queryGraphQL(query, { idBien, datosNuevos: datosNuevosJSON });
};

export const getUserRole = () => {
  const token = localStorage.getItem('jwtToken');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id_rol;
  } catch {
    return null;
  }
};

export const procesarMonitoresEquipo = async (idBienPc, monitores, forzar = false) => {
  const monitoresLimpios = monitores.map(m => ({
    num_serie: m.num_serie,
    marca: m.marca,
    modelo: m.modelo
  }));
  const query = `
    mutation($idBienPc: ID!, $monitores: [MonitorWmiInput!]!, $forzar: Boolean) {
      procesarMonitoresEquipo(id_bien_pc: $idBienPc, monitores: $monitores, forzar: $forzar) {
        ok
        conflictos {
          num_serie
          num_inv_equipo_anterior
          num_serie_equipo_anterior
        }
      }
    }
  `;
  const data = await queryGraphQL(query, { idBienPc, monitores: monitoresLimpios, forzar });
  return data?.procesarMonitoresEquipo ?? { ok: false, conflictos: [] };
};

export const getNotasBien = async (idBien) => {
  const query = `
    query($idBien: ID!) {
      notasBien(id_bien: $idBien) {
        id_nota
        contenido_nota
        fecha_creacion
        usuarioAutor {
          nombre_completo
          matricula
        }
      }
    }
  `;
  const data = await queryGraphQL(query, { idBien });
  return data?.notasBien || [];
};

export const createNotaBien = async (idBien, contenidoNota) => {
  const query = `
    mutation($idBien: ID!, $contenidoNota: String!) {
      createNotaBien(id_bien: $idBien, contenido_nota: $contenidoNota) {
        id_nota
        contenido_nota
        fecha_creacion
        usuarioAutor {
          nombre_completo
          matricula
        }
      }
    }
  `;
  const data = await queryGraphQL(query, { idBien, contenidoNota });
  return data?.createNotaBien;
};

export const checkIpUsage = async (ip, excludeIdBien) => {
  if (!ip || ip.trim() === '') return false;
  const q = `
    query checkIp($ip: String) {
      bienes(filter: { dir_ip: $ip }) {
        edges {
          node {
            id_bien
            especificacionTI {
              dir_ip
            }
          }
        }
      }
    }
  `;
  const data = await queryGraphQL(q, { ip });
  if (!data?.bienes?.edges) return false;

  const inUse = data.bienes.edges.some(({ node: b }) => {
    if (excludeIdBien && b.id_bien === excludeIdBien) return false;
    const ips = (b.especificacionTI?.dir_ip || '').split('/').map(x => x.trim()).filter(Boolean);
    return ips.includes(ip.trim());
  });
  return inUse;
};


