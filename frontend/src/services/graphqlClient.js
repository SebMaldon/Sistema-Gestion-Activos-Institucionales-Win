const GRAPHQL_API_URL = 'http://localhost:4000/graphql';

export const queryGraphQL = async (query, variables = {}) => {
  const token = localStorage.getItem('jwtToken');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(GRAPHQL_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();
  if (json.errors) {
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
      catModelos { clave_modelo descrip_disp }
      marcas { clave_marca marca }
      tiposDispositivo { tipo_disp nombre_tipo }
      inmuebles: catLegacyInmuebles { clave descripcion desc_corta }
      unidades: catUnidades { id_unidad nombre }
    }
  `;
  return await queryGraphQL(query);
};

export const searchUsuarios = async (term) => {
  if (!term || term.length < 2) return [];
  const query = `
    query {
      usuarios(pagination: {first: 20}, search: "${term}") {
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
  const query = `query { ubicacionesPorUnidad(id_unidad: ${id_unidad}) { id_ubicacion nombre_ubicacion } }`;
  const data = await queryGraphQL(query);
  return data?.ubicacionesPorUnidad || [];
};

export const createUbicacion = async (id_unidad, nombre_ubicacion) => {
  const query = `
    mutation { 
      createUbicacion(id_unidad: ${id_unidad}, nombre_ubicacion: "${nombre_ubicacion}") { 
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
    id_bien, num_serie, num_inv, estatus_operativo, clave_inmueble_ref, 
    clave_modelo, id_usuario_resguardo, id_unidad, id_ubicacion, fecha_adquisicion 
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
      clave_inmueble_ref: ${N(clave_inmueble_ref)}
      clave_modelo: ${N(clave_modelo)}
      id_usuario_resguardo: ${I(id_usuario_resguardo)}
      id_unidad: ${I(id_unidad)}
      id_ubicacion: ${I(id_ubicacion)}
      fecha_adquisicion: ${N(fecha_adquisicion)}
    ) { id_bien } }
  `;

  const mutUpdate = `
    mutation { updateBien(
      id_bien: "${id_bien}"
      num_inv: ${N(num_inv)}
      estatus_operativo: ${N(estatus_operativo)}
      clave_inmueble_ref: ${N(clave_inmueble_ref)}
      clave_modelo: ${N(clave_modelo)}
      id_usuario_resguardo: ${I(id_usuario_resguardo)}
      id_unidad: ${I(id_unidad)}
      id_ubicacion: ${I(id_ubicacion)}
      fecha_adquisicion: ${N(fecha_adquisicion)}
    ) { id_bien } }
  `;

  let finalIdBien = id_bien;
  if (isNew) {
    const res = await queryGraphQL(mutCreate);
    finalIdBien = res.createBien.id_bien;
  } else {
    await queryGraphQL(mutUpdate);
  }

  // Especificaciones
  const {
    nom_pc, cpu_info, ram_gb, almacenamiento_gb,
    mac_address, dir_ip, puerto_red, switch_red, modelo_so
  } = assetData.especificacionTI || {};

  const mutSpec = `
    mutation { upsertEspecificacionTI(
      id_bien: "${finalIdBien}"
      nom_pc: ${N(nom_pc)}
      cpu_info: ${N(cpu_info)}
      ram_gb: ${parseInt(ram_gb) || 0}
      almacenamiento_gb: ${parseInt(almacenamiento_gb) || 0}
      mac_address: ${N(mac_address)}
      dir_ip: ${N(dir_ip)}
      puerto_red: ${N(puerto_red)}
      switch_red: ${N(switch_red)}
      modelo_so: ${N(modelo_so)}
    ) { id_bien } }
  `;

  await queryGraphQL(mutSpec);
  return finalIdBien;
};
