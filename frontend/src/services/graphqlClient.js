const GRAPHQL_API_URL = import.meta.env.VITE_GQL_URL || 'http://11.1.19.4:4000/graphql';

export const queryGraphQL = async (query, variables = {}) => {
  const token = sessionStorage.getItem('jwtToken');
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
      sessionStorage.removeItem('jwtToken');
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
    sessionStorage.setItem('jwtToken', data.login.token);
    return true;
  }
  return false;
};

export const logout = () => sessionStorage.removeItem('jwtToken');

export const getCatalogs = async () => {
  const query = `
    query {
      catModelos { clave_modelo descrip_disp tipo_disp }
      marcas { clave_marca marca }
      tiposDispositivo { tipo_disp nombre_tipo }
      unidades: catUnidades { clave descripcion desc_corta }
      segmentos: catSegmentos { id_segmento nombre clave }
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

  const N = (v) => v ? `"${v}"` : "null";
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

  const mutSpec = `
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
      cuenta_windows: ${N(assetData.usuario_pc)}
      correo: ${N(assetData.correo_usuario)}
      tipo_user: ${N(assetData.tipo_usuario_pc)}
      last_scan: ${N(assetData.fecha_act_antivirus)}
      nombre_host: ${N(assetData.nombre_host)}
      windows_serial: ${N(assetData.windows_serial)}
    ) { id_bien } }
  `;

  const finalIdBien = isNew ? (await queryGraphQL(mutCreate)).createBien.id_bien : (await queryGraphQL(mutUpdate)).updateBien.id_bien;

  if (assetData.cpu_info || assetData.ram_gb || assetData.almacenamiento_gb) {
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
        cuenta_windows: ${N(assetData.usuario_pc)}
        correo: ${N(assetData.correo_usuario)}
        tipo_user: ${N(assetData.tipo_usuario_pc)}
        last_scan: ${N(assetData.fecha_act_antivirus)}
        nombre_host: ${N(assetData.nombre_host)}
        windows_serial: ${N(assetData.windows_serial)}
      ) { id_bien } }
    `);
  }
  return finalIdBien;
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
  const token = sessionStorage.getItem('jwtToken');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id_rol;
  } catch {
    return null;
  }
};

export const procesarMonitoresEquipo = async (idBienPc, monitores, forzar = false) => {
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
  const data = await queryGraphQL(query, { idBienPc, monitores, forzar });
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


