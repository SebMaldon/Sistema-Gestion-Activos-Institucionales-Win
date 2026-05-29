const fs = require('fs');

const initialFormState = {
  num_serie: '', num_inv: '', estatus_operativo: 'ACTIVO',
  clave_unidad_ref: '', clave_modelo: '', id_usuario_resguardo: '',
  id_segmento: '', id_ubicacion: '', fecha_adquisicion: '',
  nombre_host: '', windows_serial: '', cpu_info: '', ram_gb: '', almacenamiento_gb: '',
  mac_address: '', dir_ip: '', dir_ip_list: [], puerto_red: '', switch_red: '', modelo_so: '',
  fecha_act_antivirus: '', fecha_actualizacion: '',
  tipo_equipo: '', monitores: [], cuentasList: []
};

// Simulate dbInfo (no correo)
const dbInfo = {
  id_bien: '123',
  cuentasList: [{ cuenta_windows: 'PC\\User', correo: '', tipo_user: '' }],
  dir_ip_list: [{ ip: '192.168.1.1', adapter: 'BD' }]
};

// Simulate formState (WMI found correo)
const formState = {
  id_bien: '123',
  cuentasList: [{ cuenta_windows: 'PC\\User', correo: 'test@imss.gob.mx', tipo_user: '' }],
  dir_ip_list: [{ ip: '192.168.1.1', adapter: 'WMI' }]
};

const datosNuevos = {};

Object.keys(initialFormState).forEach(key => {
  if (['id_bien', 'correos_usuario', 'tipo_equipo', 'nombre_usuario_resguardo', 'monitores'].includes(key)) return;
  
  if (key === 'dir_ip_list') {
    const cIp = (formState.dir_ip_list || []).map(x => (x.ip || '').trim()).filter(Boolean).join('/');
    const oIp = (dbInfo.dir_ip_list || []).map(x => (x.ip || '').trim()).filter(Boolean).join('/');
    if (cIp !== oIp) datosNuevos.dir_ip_list = formState.dir_ip_list;
    return;
  }
  if (key === 'cuentasList') {
    const cStr = JSON.stringify((formState.cuentasList || []).map(c => ({ w: c.cuenta_windows, m: c.correo, t: c.tipo_user })));
    const oStr = JSON.stringify((dbInfo.cuentasList || []).map(c => ({ w: c.cuenta_windows, m: c.correo, t: c.tipo_user })));
    if (cStr !== oStr) datosNuevos.cuentasList = formState.cuentasList;
    return;
  }
  if (Array.isArray(formState[key])) {
    if (JSON.stringify(formState[key]) !== JSON.stringify(dbInfo[key])) {
      datosNuevos[key] = formState[key];
    }
  } else {
    const current = String(formState[key] ?? '');
    const original = String(dbInfo[key] ?? '');
    if (current !== original) {
      datosNuevos[key] = formState[key] === '' ? null : formState[key];
    }
  }
});

console.log(JSON.stringify(datosNuevos, null, 2));
