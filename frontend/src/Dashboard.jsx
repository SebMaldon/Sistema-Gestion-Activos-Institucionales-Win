import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchHardwareInfo } from './services/wmiClient';
import {
  getCatalogs,
  getUbicacionesPorUnidad,
  saveAsset,
  queryGraphQL,
  logout,
  searchUsuarios,
  solicitarActualizacionBien,
  getUserRole
} from './services/graphqlClient';
import { LogOut, RefreshCcw, Save, Server, Monitor, HardDrive, Cpu, MapPin, Network, Activity, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import SearchableSelect from './components/SearchableSelect';
import { ModalUbicacion, ModalModeloMarca } from './components/Modals';

const initialFormState = {
  num_serie: '', num_inv: '', estatus_operativo: 'ACTIVO',
  clave_unidad_ref: '', clave_modelo: '', id_usuario_resguardo: '',
  id_segmento: '', id_ubicacion: '', fecha_adquisicion: '',
  nombre_host: '', windows_serial: '', cpu_info: '', ram_gb: '', almacenamiento_gb: '',
  mac_address: '', dir_ip: '', puerto_red: '', switch_red: '', modelo_so: '',
  fecha_act_antivirus: '', correo_usuario: '', correos_usuario: [], usuario_pc: '', tipo_usuario_pc: '', fecha_actualizacion: '',
  tipo_equipo: '', monitores: []
};

export default function Dashboard() {
  const navigate = useNavigate();

  // Catalogs
  const [catUnidades, setCatUnidades] = useState([]);
  const [catInmuebles, setCatInmuebles] = useState([]);
  const [catModelos, setCatModelos] = useState([]);
  const [catMarcas, setCatMarcas] = useState([]);
  const [catTiposDisp, setCatTiposDisp] = useState([]);
  const [catUbicaciones, setCatUbicaciones] = useState([]);

  // States
  const [formState, setFormState] = useState(initialFormState);
  const [dbInfo, setDbInfo] = useState(null); // Reference to check discrepancies
  const [wmiInfo, setWmiInfo] = useState(null); // Reference to check discrepancies with physical HW
  const [lastSubmitted, setLastSubmitted] = useState(null); // Reference to check discrepancies

  const [searchSerial, setSearchSerial] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);

  // Modals
  const [showModalUbicacion, setShowModalUbicacion] = useState(false);
  const [showModalModelo, setShowModalModelo] = useState(false);

  // Load Catalogs on Mount
  useEffect(() => {
    loadAllCatalogs();
  }, []);

  const loadAllCatalogs = async () => {
    try {
      const data = await getCatalogs();
      if (data) {
        if (data.segmentos) {
          setCatUnidades(data.segmentos.map(s => ({ value: String(s.id_segmento), label: s.nombre })));
        }
        if (data.unidades) {
          setCatInmuebles(data.unidades.map(u => ({ value: u.clave, label: u.desc_corta || u.descripcion })));
        } else {
          setCatInmuebles([]);
        }
        setCatModelos(data.catModelos.map(m => ({ value: m.clave_modelo, label: m.descrip_disp })));
        setCatMarcas(data.marcas.map(m => ({ value: String(m.clave_marca), label: m.marca })));
        setCatTiposDisp(data.tiposDispositivo.map(t => ({ value: String(t.tipo_disp), label: t.nombre_tipo })));
      }
    } catch (err) {
      console.error(err);
      alert('Error cargando catálogos principales.');
    }
  };

  // Watch Unidad Change -> Fetch Ubicaciones
  useEffect(() => {
    if (formState.clave_unidad_ref) {
      getUbicacionesPorUnidad(formState.clave_unidad_ref).then(data => {
        setCatUbicaciones(data.map(u => ({ value: String(u.id_ubicacion), label: u.nombre_ubicacion })));
      });
    } else {
      setCatUbicaciones([]);
    }
  }, [formState.clave_unidad_ref]);

  const updateForm = (key, value) => {
    setFormState(prev => ({ ...prev, [key]: value }));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Load WMI
  const loadWMI = async () => {
    setLoadingAction(true);
    try {
      const data = await fetchHardwareInfo();
      setWmiInfo(data);

      const scannedSerial = data.num_serie || '';
      const isDifferentMachine = searchSerial && scannedSerial && scannedSerial !== searchSerial;

      if (isDifferentMachine) {
        setSearchSerial(scannedSerial);
        setDbInfo(null);
      } else if (scannedSerial && !searchSerial) {
        setSearchSerial(scannedSerial);
      }

      // Merge WMI data into formState
      setFormState(prev => {
        const baseState = isDifferentMachine ? initialFormState : prev;
        const newData = { ...baseState, ...data };
        
        if (data.nom_pc) {
          newData.nombre_host = data.nom_pc;
          delete newData.nom_pc;
        }
        if (data.windows_serial || data.serial_number) {
          newData.windows_serial = data.windows_serial || data.serial_number;
        }
        if (data.correos_usuario && data.correos_usuario.length > 0) {
          newData.correo_usuario = data.correos_usuario[0];
        } else {
          newData.correo_usuario = baseState.correo_usuario;
        }
        return newData;
      });
    } catch (err) {
      alert('Error obteniendo WMI del backend C#. Asegúrate de que el backend C# esté corriendo.');
    } finally {
      setLoadingAction(false);
    }
  };

  // Sync DB
  const syncDB = async () => {
    if (!searchSerial) return alert('Ingresa un número de serie para buscar en la BD.');

    setLoadingAction(true);
    try {
      const query = `
        query {
          bienByNumSerie(num_serie: "${searchSerial}") {
            id_bien num_inv estatus_operativo clave_unidad_ref clave_modelo 
            id_usuario_resguardo id_segmento id_ubicacion fecha_adquisicion fecha_actualizacion
            usuarioResguardo {
              nombre_completo
            }
            especificacionTI {
              nombre_host windows_serial cpu_info ram_gb almacenamiento_gb mac_address dir_ip puerto_red switch_red modelo_so
              cuenta_windows correo tipo_user last_scan
            }
          }
        }
      `;
      const data = await queryGraphQL(query);
      if (data && data.bienByNumSerie) {
        const bien = data.bienByNumSerie;
        const esp = bien.especificacionTI || {};

        const mergedObj = {
          id_bien: bien.id_bien,
          num_serie: searchSerial,
          num_inv: bien.num_inv || '',
          estatus_operativo: bien.estatus_operativo || 'ACTIVO',
          clave_unidad_ref: bien.clave_unidad_ref || '',
          clave_modelo: bien.clave_modelo || '',
          id_usuario_resguardo: bien.id_usuario_resguardo ? String(bien.id_usuario_resguardo) : '',
          nombre_usuario_resguardo: bien.usuarioResguardo?.nombre_completo || '',
          id_segmento: bien.id_segmento ? String(bien.id_segmento) : '',
          id_ubicacion: bien.id_ubicacion ? String(bien.id_ubicacion) : '',
          fecha_adquisicion: bien.fecha_adquisicion ? bien.fecha_adquisicion.split('T')[0] : '',
          fecha_actualizacion: bien.fecha_actualizacion ? new Date(bien.fecha_actualizacion).toLocaleString() : '',
          nombre_host: esp.nombre_host || '',
          windows_serial: esp.windows_serial || '',
          cpu_info: esp.cpu_info || '',
          ram_gb: esp.ram_gb ? String(esp.ram_gb) : '',
          almacenamiento_gb: esp.almacenamiento_gb ? String(esp.almacenamiento_gb) : '',
          mac_address: esp.mac_address || '',
          dir_ip: esp.dir_ip || '',
          puerto_red: esp.puerto_red || '',
          switch_red: esp.switch_red || '',
          modelo_so: esp.modelo_so || '',
          usuario_pc: esp.cuenta_windows || '',
          correo_usuario: esp.correo || '',
          tipo_usuario_pc: esp.tipo_user || '',
          fecha_act_antivirus: esp.last_scan || ''
        };

        setDbInfo(mergedObj);
        setLastSubmitted(null);

        // Populate form but don't overwrite physical WMI fields if they differ
        setFormState(prev => {
          const ns = { ...prev };
          // For each key in mergedObj, if it's not a WMI field, we take DB value
          Object.keys(mergedObj).forEach(k => {
            ns[k] = mergedObj[k];
          });
          return ns;
        });
      } else {
        alert('Activo no encontrado en la BD. Rellene los campos para registrar uno nuevo.');
        setDbInfo(null);
        setFormState(prev => ({ ...prev, id_bien: undefined }));
      }
    } catch (err) {
      alert('Error conectando a GraphQL.');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleSave = async () => {
    if (!formState.num_serie) return alert('El número de serie es obligatorio.');

    setLoadingAction(true);
    try {
      const isNew = !dbInfo || !dbInfo.id_bien;
      const userRole = getUserRole();

      // Rol Maestro (1) → guardado directo
      if (userRole === 1) {
        const dataToSave = { ...formState, especificacionTI: formState };
        await saveAsset(isNew, dataToSave);
        alert('Guardado exitoso.');
        setSearchSerial(formState.num_serie);
        await syncDB();
      } else {
        // Roles 2, 3, 4 → solicitud de cambio
        const datosNuevos = {};

        if (isNew) {
          // Creación: enviar todos los campos con valor
          Object.keys(formState).forEach(key => {
            if (['correos_usuario', 'monitores', 'tipo_equipo', 'nombre_usuario_resguardo'].includes(key)) return;
            if (formState[key] !== '' && formState[key] !== undefined && formState[key] !== null) {
              datosNuevos[key] = formState[key];
            }
          });
          datosNuevos._esCreacion = true;
        } else {
          // Actualización: solo campos que cambiaron vs dbInfo
          Object.keys(formState).forEach(key => {
            if (['id_bien', 'correos_usuario', 'monitores', 'tipo_equipo', 'nombre_usuario_resguardo'].includes(key)) return;
            const current = String(formState[key] ?? '');
            const original = String(dbInfo[key] ?? '');
            if (current !== original) {
              datosNuevos[key] = formState[key];
            }
          });
        }

        if (Object.keys(datosNuevos).filter(k => k !== '_esCreacion').length === 0) {
          alert('No se detectaron cambios para enviar.');
          return;
        }

        const idBien = isNew ? crypto.randomUUID() : dbInfo.id_bien;
        await solicitarActualizacionBien(idBien, JSON.stringify(datosNuevos));
        setLastSubmitted(JSON.stringify(datosNuevos));
        alert('Tus cambios han sido enviados a revisión y están pendientes de aprobación.');
      }
    } catch (err) {
      alert('Error guardando: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  };

  // Helper for discrepancy styling
  const getFieldStatus = (key) => {
    const val = formState[key];
    if (dbInfo && dbInfo[key] !== undefined && String(dbInfo[key]) !== String(val)) return 'db-diff';
    if (wmiInfo && wmiInfo[key] !== undefined && String(wmiInfo[key]) !== String(val) && key !== 'num_serie') return 'wmi-diff';
    return 'ok';
  };

  const getBorderColor = (key) => {
    const st = getFieldStatus(key);
    if (st === 'db-diff') return 'border-yellow-500';
    if (st === 'wmi-diff') return 'border-red-500';
    return 'border-[#E0E0E0]';
  };

  const isNew = !dbInfo || !dbInfo.id_bien;
  let currentDatosNuevos = {};
  if (isNew) {
    Object.keys(formState).forEach(key => {
      if (['correos_usuario', 'monitores', 'tipo_equipo', 'nombre_usuario_resguardo'].includes(key)) return;
      if (formState[key] !== '' && formState[key] !== undefined && formState[key] !== null) {
        currentDatosNuevos[key] = formState[key];
      }
    });
    currentDatosNuevos._esCreacion = true;
  } else {
    Object.keys(formState).forEach(key => {
      if (['id_bien', 'correos_usuario', 'monitores', 'tipo_equipo', 'nombre_usuario_resguardo'].includes(key)) return;
      const current = String(formState[key] ?? '');
      const original = String(dbInfo[key] ?? '');
      if (current !== original) {
        currentDatosNuevos[key] = formState[key];
      }
    });
  }

  const hasDbChanges = Object.keys(currentDatosNuevos).filter(k => k !== '_esCreacion').length > 0;
  const hasPendingChanges = lastSubmitted !== JSON.stringify(currentDatosNuevos);
  const canSave = hasDbChanges && hasPendingChanges;

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#333333] flex flex-col">
      {/* Navbar */}
      <header className="bg-[#006241] px-6 py-4 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-3">
          <Server className="text-white w-6 h-6" />
          <h1 className="text-xl font-bold tracking-wide text-white">Gestor Activos HW</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center bg-white/10 rounded-xl px-2 py-1 border border-white/20 focus-within:bg-white/20 transition-colors">
            <input
              type="text"
              value={searchSerial}
              onChange={(e) => setSearchSerial(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && syncDB()}
              className="bg-transparent border-none text-white px-2 py-1 w-48 focus:outline-none text-sm placeholder-white/70"
              placeholder="Buscar Serial..."
            />
            <button
              onClick={syncDB}
              disabled={loadingAction}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white/80 hover:text-white"
            >
              <RefreshCcw className={clsx("w-4 h-4", loadingAction && "animate-spin")} />
            </button>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-red-300/80 hover:text-red-400 transition-colors text-sm font-bold">
            <LogOut className="w-4 h-4" /> Salir
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Actions */}
        <aside className="w-64 bg-white border-r border-[#E0E0E0] p-6 flex flex-col gap-4 shadow-sm z-10">
          <button onClick={loadWMI} disabled={loadingAction} className="bg-[#006241] hover:bg-[#008F59] text-white py-4 px-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-colors disabled:opacity-50 shadow-sm">
            <Monitor className="w-5 h-5" /> Cargar Datos Locales (WMI)
          </button>
          <button onClick={handleSave} disabled={loadingAction || !canSave} className="bg-white border-2 border-[#006241] text-[#006241] hover:bg-[#F9FAFB] py-4 px-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-colors disabled:opacity-50 shadow-sm mt-auto">
            <Save className="w-5 h-5" /> Guardar Cambios
          </button>
          <div className="mt-4 p-4 bg-[#F9FAFB] rounded-xl border border-[#E0E0E0]">
            <p className="text-xs text-[#333333] font-bold uppercase mb-2">Simbología</p>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div> <span className="text-xs text-[#757575]">Diferente a BD</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div> <span className="text-xs text-[#757575]">Discrepancia Física</span>
            </div>
          </div>
        </aside>

        {/* Main Form */}
        <main className="flex-1 p-8 overflow-y-auto custom-scrollbar relative">

          <div className="max-w-6xl mx-auto space-y-8">

            {/* Sección 1: Generales */}
            <section className="bg-white border border-[#E0E0E0] border-t-4 border-t-[#006241] rounded-3xl p-8 shadow-sm relative">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold flex items-center gap-3 text-[#333333]">
                  <HardDrive className="w-6 h-6 text-[#006241]" /> Datos Generales
                </h2>
                {dbInfo && dbInfo.id_bien && (
                  <div className="flex items-center gap-4">
                    {dbInfo.fecha_actualizacion && (
                      <span className="text-xs text-gray-400 font-medium italic">
                        Última actualización: {dbInfo.fecha_actualizacion}
                      </span>
                    )}
                    <span className="text-xs font-bold bg-green-50 text-green-700 px-3 py-1 rounded-full border border-green-200">
                      Sincronizado con BD
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <FieldInput label="No. Serie" val={formState.num_serie} onChange={v => updateForm('num_serie', v)} color={getBorderColor('num_serie')} readOnly={true} />
                <FieldInput label="No. Inventario" val={formState.num_inv} onChange={v => updateForm('num_inv', v)} color={getBorderColor('num_inv')} />

                <div className="w-full">
                  <label className="text-xs font-bold text-[#757575] uppercase tracking-wider block mb-1">Estatus Operativo</label>
                  <select
                    value={formState.estatus_operativo}
                    onChange={e => updateForm('estatus_operativo', e.target.value)}
                    className={clsx("w-full bg-white text-[#333333] rounded-xl py-2 px-3 border shadow-sm focus:outline-none focus:ring-1 focus:ring-[#006241]", getBorderColor('estatus_operativo'))}
                  >
                    <option value="ACTIVO">Activo</option>
                    <option value="INACTIVO">Inactivo</option>
                    <option value="EN REPARACION">En Reparación</option>
                    <option value="BAJA">Baja</option>
                  </select>
                </div>

                <div className="col-span-full border-t border-[#E0E0E0] my-2"></div>

                <div className="w-full">
                  <SearchableSelect label="Inmueble Físico" options={catInmuebles} value={formState.clave_unidad_ref} onChange={v => updateForm('clave_unidad_ref', v)} />
                </div>

                <div className="w-full">
                  <SearchableSelect label="Unidad Operativa" options={catUnidades} value={formState.id_segmento} onChange={v => updateForm('id_segmento', v)} />
                </div>

                <div className="w-full">
                  <SearchableSelect label="Ubicación Específica" options={catUbicaciones} value={formState.id_ubicacion} onChange={v => updateForm('id_ubicacion', v)} disabled={!formState.clave_unidad_ref} placeholder={formState.clave_unidad_ref ? "Buscar ubicación..." : "Seleccione unidad primero"} />
                </div>

                <div className="w-full">
                  <SearchableSelect label="Modelo (PC)" options={catModelos} value={formState.clave_modelo} onChange={v => updateForm('clave_modelo', v)} />
                </div>

                <div className="w-full">
                  <SearchableSelect
                    label="Usuario a Resguardo"
                    options={formState.id_usuario_resguardo ? [{ value: formState.id_usuario_resguardo, label: formState.nombre_usuario_resguardo || `Usuario ID: ${formState.id_usuario_resguardo}` }] : []}
                    asyncSearch={searchUsuarios}
                    value={formState.id_usuario_resguardo}
                    onChange={(v, opt) => {
                      updateForm('id_usuario_resguardo', v);
                      // Handle the case where the selected option label might be "Name (ID)"
                      let nameToSave = opt?.label || '';
                      if (nameToSave.includes('(')) {
                        nameToSave = nameToSave.split(' (')[0].trim();
                      }
                      updateForm('nombre_usuario_resguardo', nameToSave);
                    }}
                  />
                </div>

                <div className="w-full">
                  <label className="text-xs font-bold text-[#757575] uppercase tracking-wider block mb-1">Fecha Adquisición</label>
                  <input type="date" value={formState.fecha_adquisicion} disabled className={clsx("w-full bg-gray-50 text-gray-500 cursor-not-allowed rounded-xl py-2 px-3 border shadow-sm focus:outline-none", getBorderColor('fecha_adquisicion'))} />
                </div>
              </div>
            </section>

            {/* Sección 2: Especificaciones */}
            <section className="bg-white border border-[#E0E0E0] border-t-4 border-t-[#008F59] rounded-3xl p-8 shadow-sm relative">
              <h2 className="text-xl font-bold mb-8 flex items-center gap-3 text-[#333333]">
                <Cpu className="w-6 h-6 text-[#008F59]" /> Especificaciones de Hardware & Red
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <FieldInput label="Nombre de Host (PC)" val={formState.nombre_host} onChange={v => updateForm('nombre_host', v)} color={getBorderColor('nombre_host')} readOnly={true} />
                <FieldInput label="Serial SO (Windows)" val={formState.windows_serial} onChange={v => updateForm('windows_serial', v)} color={getBorderColor('windows_serial')} readOnly={true} />
                <FieldInput label="Sistema Operativo" val={formState.modelo_so} onChange={v => updateForm('modelo_so', v)} color={getBorderColor('modelo_so')} readOnly={true} />
                <FieldInput label="Procesador (CPU)" val={formState.cpu_info} onChange={v => updateForm('cpu_info', v)} color={getBorderColor('cpu_info')} readOnly={true} />
                <FieldInput label="Memoria RAM (GB)" val={formState.ram_gb} onChange={v => updateForm('ram_gb', v)} color={getBorderColor('ram_gb')} type="number" readOnly={true} />
                <FieldInput label="Almacenamiento (GB)" val={formState.almacenamiento_gb} onChange={v => updateForm('almacenamiento_gb', v)} color={getBorderColor('almacenamiento_gb')} type="number" readOnly={true} />
                <FieldInput label="Dirección IPv4" val={formState.dir_ip} onChange={v => updateForm('dir_ip', v)} color={getBorderColor('dir_ip')} readOnly={true} />
                <FieldInput label="Dirección MAC" val={formState.mac_address} onChange={v => updateForm('mac_address', v)} color={getBorderColor('mac_address')} readOnly={true} />
                <FieldInput label="Puerto / Nodo Red" val={formState.puerto_red} onChange={v => updateForm('puerto_red', v)} color={getBorderColor('puerto_red')} />
                <FieldInput label="Switch Conectado" val={formState.switch_red} onChange={v => updateForm('switch_red', v)} color={getBorderColor('switch_red')} />

                <div className="col-span-full border-t border-[#E0E0E0] my-4"></div>

                <div className="col-span-full flex justify-between items-center">
                  <h3 className="text-md font-bold text-[#333333]">Monitores Físicos Conectados</h3>
                  {formState.tipo_equipo && (
                    <span className="text-xs font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200">
                      Equipo detectado: {formState.tipo_equipo}
                    </span>
                  )}
                </div>

                {(!formState.monitores || formState.monitores.length === 0) && (
                  <div className="col-span-full text-sm text-gray-500 italic">No se detectaron monitores externos.</div>
                )}

                {formState.monitores && formState.monitores.map((mon, idx) => (
                  <div key={idx} className="col-span-full grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <FieldInput label={`Monitor ${idx + 1} - Marca`} val={mon.marca} readOnly={true} />
                    <FieldInput label={`Monitor ${idx + 1} - Modelo`} val={mon.modelo} readOnly={true} />
                    <FieldInput label={`Monitor ${idx + 1} - No. Serie`} val={mon.num_serie} readOnly={true} />
                  </div>
                ))}
              </div>
            </section>

            {/* Sección 3: Seguridad y Usuario */}
            <section className="bg-white border border-[#E0E0E0] border-t-4 border-t-[#004f34] rounded-3xl p-8 shadow-sm relative">
              <h2 className="text-xl font-bold mb-8 flex items-center gap-3 text-[#333333]">
                <Activity className="w-6 h-6 text-[#004f34]" /> Seguridad y Usuario de PC
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <FieldInput label="Última Act. Antivirus" val={formState.fecha_act_antivirus} color={getBorderColor('fecha_act_antivirus')} readOnly={true} />
                <FieldInput label="Usuario de la PC" val={formState.usuario_pc} color={getBorderColor('usuario_pc')} readOnly={true} />
                <FieldInput label="Tipo de Usuario" val={formState.tipo_usuario_pc} color={getBorderColor('tipo_usuario_pc')} readOnly={true} />

                <div className="w-full md:col-span-2 lg:col-span-3">
                  <label className="text-xs font-bold text-[#757575] uppercase tracking-wider block mb-1">Correo Electrónico (Windows)</label>
                  {formState.correos_usuario && formState.correos_usuario.length > 1 ? (
                    <select
                      value={formState.correo_usuario || ''}
                      onChange={e => updateForm('correo_usuario', e.target.value)}
                      className={clsx("w-full bg-white text-[#333333] rounded-xl py-2 px-3 border shadow-sm focus:outline-none focus:ring-1 focus:ring-[#006241]", getBorderColor('correo_usuario'))}
                    >
                      <option value="">-- Seleccione un correo --</option>
                      {formState.correos_usuario.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={formState.correo_usuario || (formState.correos_usuario && formState.correos_usuario[0]) || ''}
                      onChange={e => updateForm('correo_usuario', e.target.value)}
                      className={clsx("w-full bg-white text-[#333333] rounded-xl py-2 px-3 border shadow-sm focus:outline-none focus:ring-1 focus:ring-[#006241]", getBorderColor('correo_usuario'))}
                    />
                  )}
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* Modals */}
      {showModalUbicacion && (
        <ModalUbicacion
          unidadId={formState.clave_unidad_ref}
          unidadNombre={catUnidades.find(u => u.value === formState.id_segmento)?.label || ''}
          onClose={() => setShowModalUbicacion(false)}
          onSuccess={(nuevaUb) => {
            setCatUbicaciones(prev => [...prev, { value: String(nuevaUb.id_ubicacion), label: nuevaUb.nombre_ubicacion }]);
            setFormState(prev => ({ ...prev, id_ubicacion: String(nuevaUb.id_ubicacion) }));
            setShowModalUbicacion(false);
          }}
        />
      )}

      {showModalModelo && (
        <ModalModeloMarca
          marcas={catMarcas}
          tiposDispositivo={catTiposDisp}
          onClose={() => setShowModalModelo(false)}
          onSuccess={(nuevoMod, nuevaMarcaId) => {
            if (nuevaMarcaId && !catMarcas.find(m => m.value === String(nuevaMarcaId))) {
              loadAllCatalogs();
            }
            setCatModelos(prev => [...prev, { value: nuevoMod.clave_modelo, label: nuevoMod.descrip_disp }]);
            setFormState(prev => ({ ...prev, clave_modelo: nuevoMod.clave_modelo }));
            setShowModalModelo(false);
          }}
        />
      )}

    </div>
  );
}

function FieldInput({ label, val, onChange, color, type = "text", readOnly = false }) {
  return (
    <div className="w-full">
      <label className="text-xs font-bold text-[#757575] uppercase tracking-wider block mb-1">{label}</label>
      <input
        type={type}
        value={val || ''}
        readOnly={readOnly}
        onChange={e => !readOnly && onChange(e.target.value)}
        className={clsx(
          "w-full text-[#333333] rounded-xl py-2 px-3 border shadow-sm focus:outline-none focus:ring-1 focus:ring-[#006241]",
          color,
          readOnly ? "bg-gray-100 cursor-not-allowed text-gray-500" : "bg-white"
        )}
      />
    </div>
  );
}
