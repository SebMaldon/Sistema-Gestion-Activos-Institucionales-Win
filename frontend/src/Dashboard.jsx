import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchHardwareInfo } from './services/wmiClient';
import { 
  getCatalogs, 
  getUbicacionesPorUnidad, 
  saveAsset, 
  queryGraphQL, 
  logout,
  searchUsuarios
} from './services/graphqlClient';
import { LogOut, RefreshCcw, Save, Server, Monitor, HardDrive, Cpu, MapPin, Network, Activity } from 'lucide-react';
import { clsx } from 'clsx';
import SearchableSelect from './components/SearchableSelect';
import { ModalUbicacion, ModalModeloMarca } from './components/Modals';

const initialFormState = {
  num_serie: '', num_inv: '', estatus_operativo: 'ACTIVO', clave_inmueble_ref: '', 
  clave_modelo: '', id_usuario_resguardo: '', id_unidad: '', id_ubicacion: '', fecha_adquisicion: '',
  nom_pc: '', cpu_info: '', ram_gb: '', almacenamiento_gb: '', 
  mac_address: '', dir_ip: '', puerto_red: '', switch_red: '', modelo_so: ''
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
        setCatUnidades(data.unidades.map(u => ({ value: String(u.id_unidad), label: u.nombre })));
        setCatInmuebles(data.inmuebles.map(i => ({ value: i.clave, label: i.desc_corta || i.descripcion })));
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
    if (formState.id_unidad) {
      getUbicacionesPorUnidad(formState.id_unidad).then(data => {
        setCatUbicaciones(data.map(u => ({ value: String(u.id_ubicacion), label: u.nombre_ubicacion })));
      });
    } else {
      setCatUbicaciones([]);
    }
  }, [formState.id_unidad]);

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
      
      // Merge WMI data into formState
      setFormState(prev => ({
        ...prev,
        ...data
      }));

      if (data && data.num_serie && !searchSerial) {
        setSearchSerial(data.num_serie);
      }
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
            id_bien num_inv estatus_operativo clave_inmueble_ref clave_modelo 
            id_usuario_resguardo id_unidad id_ubicacion fecha_adquisicion
            especificacionTI {
              nom_pc cpu_info ram_gb almacenamiento_gb mac_address dir_ip puerto_red switch_red modelo_so
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
          clave_inmueble_ref: bien.clave_inmueble_ref || '',
          clave_modelo: bien.clave_modelo || '',
          id_usuario_resguardo: bien.id_usuario_resguardo ? String(bien.id_usuario_resguardo) : '',
          id_unidad: bien.id_unidad ? String(bien.id_unidad) : '',
          id_ubicacion: bien.id_ubicacion ? String(bien.id_ubicacion) : '',
          fecha_adquisicion: bien.fecha_adquisicion ? bien.fecha_adquisicion.split('T')[0] : '',
          nom_pc: esp.nom_pc || '',
          cpu_info: esp.cpu_info || '',
          ram_gb: esp.ram_gb ? String(esp.ram_gb) : '',
          almacenamiento_gb: esp.almacenamiento_gb ? String(esp.almacenamiento_gb) : '',
          mac_address: esp.mac_address || '',
          dir_ip: esp.dir_ip || '',
          puerto_red: esp.puerto_red || '',
          switch_red: esp.switch_red || '',
          modelo_so: esp.modelo_so || ''
        };

        setDbInfo(mergedObj);
        
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
      const dataToSave = { ...formState, especificacionTI: formState }; 
      
      const newId = await saveAsset(isNew, dataToSave);
      alert('Guardado exitoso.');
      setSearchSerial(formState.num_serie); // Para resincronizar
      await syncDB(); // Recargar de base de datos
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
            <Monitor className="w-5 h-5" /> Cargar HW (WMI)
          </button>
          <button onClick={handleSave} disabled={loadingAction} className="bg-white border-2 border-[#006241] text-[#006241] hover:bg-[#F9FAFB] py-4 px-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-colors disabled:opacity-50 shadow-sm mt-auto">
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
              <h2 className="text-xl font-bold mb-8 flex items-center gap-3 text-[#333333]">
                <HardDrive className="w-6 h-6 text-[#006241]" /> Datos Generales
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <FieldInput label="No. Serie" val={formState.num_serie} onChange={v => updateForm('num_serie', v)} color={getBorderColor('num_serie')} />
                <FieldInput label="No. Inventario" val={formState.num_inv} onChange={v => updateForm('num_inv', v)} color={getBorderColor('num_inv')} />
                
                <div className="w-full">
                  <label className="text-xs font-bold text-[#757575] uppercase tracking-wider block mb-1">Estatus Operativo</label>
                  <select 
                    value={formState.estatus_operativo} 
                    onChange={e => updateForm('estatus_operativo', e.target.value)}
                    className={clsx("w-full bg-white text-[#333333] rounded-xl py-2 px-3 border shadow-sm focus:outline-none focus:ring-1 focus:ring-[#006241]", getBorderColor('estatus_operativo'))}
                  >
                    <option value="ACTIVO">ACTIVO</option>
                    <option value="INACTIVO">INACTIVO</option>
                    <option value="EN REPARACIÓN">EN REPARACIÓN</option>
                    <option value="BAJA">BAJA</option>
                  </select>
                </div>

                <div className={clsx("w-full rounded-xl border bg-white", getBorderColor('clave_inmueble_ref'))}>
                  <SearchableSelect label="Inmueble Físico" options={catInmuebles} value={formState.clave_inmueble_ref} onChange={v => updateForm('clave_inmueble_ref', v)} />
                </div>
                
                <div className={clsx("w-full rounded-xl border bg-white", getBorderColor('id_unidad'))}>
                  <SearchableSelect label="Unidad Operativa" options={catUnidades} value={formState.id_unidad} onChange={v => updateForm('id_unidad', v)} />
                </div>
                
                <div className="w-full flex items-end gap-2">
                  <div className={clsx("flex-1 rounded-xl border bg-white", getBorderColor('id_ubicacion'))}>
                    <SearchableSelect label="Ubicación Específica" options={catUbicaciones} value={formState.id_ubicacion} onChange={v => updateForm('id_ubicacion', v)} disabled={!formState.id_unidad} placeholder={formState.id_unidad ? "Buscar ubicación..." : "Seleccione unidad primero"} />
                  </div>
                  <button onClick={() => setShowModalUbicacion(true)} disabled={!formState.id_unidad} className="h-[42px] px-3 bg-white hover:bg-[#F9FAFB] border border-[#E0E0E0] text-[#006241] font-bold rounded-xl disabled:opacity-50 transition-colors">
                    +
                  </button>
                </div>

                <div className="w-full flex items-end gap-2">
                  <div className={clsx("flex-1 rounded-xl border bg-white", getBorderColor('clave_modelo'))}>
                    <SearchableSelect label="Modelo (PC)" options={catModelos} value={formState.clave_modelo} onChange={v => updateForm('clave_modelo', v)} />
                  </div>
                  <button onClick={() => setShowModalModelo(true)} className="h-[42px] px-3 bg-white hover:bg-[#F9FAFB] border border-[#E0E0E0] text-[#006241] font-bold rounded-xl transition-colors">
                    +
                  </button>
                </div>

                <div className={clsx("w-full rounded-xl border bg-white", getBorderColor('id_usuario_resguardo'))}>
                  <SearchableSelect 
                    label="Usuario a Resguardo" 
                    options={formState.id_usuario_resguardo ? [{ value: formState.id_usuario_resguardo, label: `Usuario ID: ${formState.id_usuario_resguardo} (Buscar para cambiar)` }] : []}
                    asyncSearch={searchUsuarios}
                    value={formState.id_usuario_resguardo} 
                    onChange={v => updateForm('id_usuario_resguardo', v)} 
                  />
                </div>

                <div className="w-full">
                  <label className="text-xs font-bold text-[#757575] uppercase tracking-wider block mb-1">Fecha Adquisición</label>
                  <input type="date" value={formState.fecha_adquisicion} onChange={e => updateForm('fecha_adquisicion', e.target.value)} className={clsx("w-full bg-white text-[#333333] rounded-xl py-2 px-3 border shadow-sm focus:outline-none focus:ring-1 focus:ring-[#006241]", getBorderColor('fecha_adquisicion'))} />
                </div>
              </div>
            </section>

            {/* Sección 2: Especificaciones */}
            <section className="bg-white border border-[#E0E0E0] border-t-4 border-t-[#008F59] rounded-3xl p-8 shadow-sm relative">
              <h2 className="text-xl font-bold mb-8 flex items-center gap-3 text-[#333333]">
                <Cpu className="w-6 h-6 text-[#008F59]" /> Especificaciones de Hardware & Red
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <FieldInput label="Nombre de Host (PC)" val={formState.nom_pc} onChange={v => updateForm('nom_pc', v)} color={getBorderColor('nom_pc')} />
                <FieldInput label="Sistema Operativo" val={formState.modelo_so} onChange={v => updateForm('modelo_so', v)} color={getBorderColor('modelo_so')} />
                <FieldInput label="Procesador (CPU)" val={formState.cpu_info} onChange={v => updateForm('cpu_info', v)} color={getBorderColor('cpu_info')} />
                <FieldInput label="Memoria RAM (GB)" val={formState.ram_gb} onChange={v => updateForm('ram_gb', v)} color={getBorderColor('ram_gb')} type="number" />
                <FieldInput label="Almacenamiento (GB)" val={formState.almacenamiento_gb} onChange={v => updateForm('almacenamiento_gb', v)} color={getBorderColor('almacenamiento_gb')} type="number" />
                <FieldInput label="Dirección IPv4" val={formState.dir_ip} onChange={v => updateForm('dir_ip', v)} color={getBorderColor('dir_ip')} />
                <FieldInput label="Dirección MAC" val={formState.mac_address} onChange={v => updateForm('mac_address', v)} color={getBorderColor('mac_address')} />
                <FieldInput label="Puerto / Nodo Red" val={formState.puerto_red} onChange={v => updateForm('puerto_red', v)} color={getBorderColor('puerto_red')} />
                <FieldInput label="Switch Conectado" val={formState.switch_red} onChange={v => updateForm('switch_red', v)} color={getBorderColor('switch_red')} />
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* Modals */}
      {showModalUbicacion && (
        <ModalUbicacion 
          unidadId={formState.id_unidad}
          unidadNombre={catUnidades.find(u => u.value === formState.id_unidad)?.label || ''}
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

function FieldInput({ label, val, onChange, color, type = "text" }) {
  return (
    <div className="w-full">
      <label className="text-xs font-bold text-[#757575] uppercase tracking-wider block mb-1">{label}</label>
      <input
        type={type}
        value={val || ''}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          "w-full bg-white text-[#333333] rounded-xl py-2 px-3 border shadow-sm focus:outline-none focus:ring-1 focus:ring-[#006241] transition-colors",
          color
        )}
      />
    </div>
  );
}
