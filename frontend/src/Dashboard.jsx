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
  getUserRole,
  procesarMonitoresEquipo,
  getNotasBien,
  createNotaBien,
  saveDirectSpecsAndPrograms,
  checkIpUsage
} from './services/graphqlClient';
import { LogOut, RefreshCcw, Save, Server, Monitor, HardDrive, Cpu, MapPin, Network, Activity, Plus, ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertTriangle, HelpCircle, Search, MessageSquare, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import SearchableSelect from './components/SearchableSelect';
import { ModalUbicacion, ModalModeloMarca } from './components/Modals';
import { IpInput, MacInput } from './components/MaskedInputs';
import pkg from '../package.json';

const initialFormState = {
  num_serie: '', num_inv: '', estatus_operativo: 'ACTIVO',
  clave_unidad_ref: '', clave_modelo: '', id_usuario_resguardo: '',
  id_segmento: '', id_ubicacion: '', fecha_adquisicion: '',
  nombre_host: '', windows_serial: '', cpu_info: '', ram_gb: '', almacenamiento_gb: '',
  mac_address: '', dir_ip: '', dir_ip_list: [], puerto_red: '', switch_red: '', modelo_so: '', version_office: '',
  fecha_act_antivirus: '', fecha_actualizacion: '',
  tipo_equipo: '', monitores: [], cuentasList: [], programas: []
};

const NotasBienSection = ({ idBien, title, showAlert }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notas, setNotas] = useState([]);
  const [nuevaNota, setNuevaNota] = useState('');
  const [loadingNotas, setLoadingNotas] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  useEffect(() => {
    if (idBien) {
      loadNotas(idBien);
    }
  }, [idBien]);

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  const loadNotas = async (id) => {
    try {
      setLoadingNotas(true);
      const data = await getNotasBien(id);
      setNotas(data);
    } catch (err) {
      console.error('Error al cargar notas:', err);
    } finally {
      setLoadingNotas(false);
    }
  };

  const handleAddNota = async () => {
    if (!nuevaNota.trim()) return;
    try {
      setLoadingAction(true);
      await createNotaBien(idBien, nuevaNota.trim());
      setNuevaNota('');
      await loadNotas(idBien);
      showAlert('Nota agregada correctamente.', 'success');
      if (!isOpen) setIsOpen(true);
    } catch (err) {
      showAlert('Error al agregar nota: ' + err.message, 'error');
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div className="w-full">
      {title && (
        <button
          onClick={toggleOpen}
          className="w-full flex items-center justify-between text-sm font-bold text-[#333333] mb-2 hover:bg-gray-100 p-2 rounded-lg transition-colors focus:outline-none"
        >
          <span className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#006241]" />
            {title}
            {!loadingNotas && (
              <span className={clsx("ml-2 px-2 py-0.5 rounded-full text-[10px] tracking-wide", notas.length > 0 ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-600")}>
                {notas.length} {notas.length === 1 ? 'nota' : 'notas'}
              </span>
            )}
            {loadingNotas && <RefreshCcw className="w-3 h-3 text-gray-400 animate-spin ml-2" />}
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4 text-[#757575]" /> : <ChevronDown className="w-4 h-4 text-[#757575]" />}
        </button>
      )}

      {isOpen && (
        <div className="animate-fade-in pl-1 mt-1">
          <div className="flex flex-col sm:flex-row gap-3 mb-3">
            <input
              type="text"
              value={nuevaNota}
              onChange={e => setNuevaNota(e.target.value)}
              placeholder="Escribe una nueva nota..."
              className="flex-1 bg-white text-[#333333] rounded-xl py-2 px-3 border border-[#E0E0E0] shadow-sm focus:outline-none focus:ring-1 focus:ring-[#006241] text-sm"
              onKeyDown={e => e.key === 'Enter' && handleAddNota()}
            />
            <button
              onClick={handleAddNota}
              disabled={loadingAction || !nuevaNota.trim()}
              className="bg-[#006241] hover:bg-[#008F59] text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm shadow-sm"
            >
              <Plus className="w-4 h-4" /> Agregar
            </button>
          </div>

          {loadingNotas ? (
            <div className="text-center py-4 text-sm text-gray-500 animate-pulse">Cargando notas...</div>
          ) : notas.length === 0 ? (
            <div className="text-center py-4 text-xs text-gray-500 italic bg-white rounded-xl border border-dashed border-gray-200">
              No hay notas registradas.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
              {notas.map(nota => (
                <div key={nota.id_nota} className="bg-white border border-gray-200 p-2.5 rounded-xl flex flex-col gap-1 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-center text-[10px] text-gray-500 font-semibold">
                    <span className="text-[#006241]">{nota.usuarioAutor ? `${nota.usuarioAutor.matricula} - ${nota.usuarioAutor.nombre_completo}` : 'Usuario desconocido'}</span>
                    <span>{new Date(isNaN(Number(nota.fecha_creacion)) ? nota.fecha_creacion : Number(nota.fecha_creacion)).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-gray-800 whitespace-pre-line font-medium">{nota.contenido_nota}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const isElectron = typeof window !== 'undefined' && !!window.process?.versions?.electron;

  // Listeners de auto-actualizacion
  useEffect(() => {
    if (!isElectron) return;
    const { ipcRenderer } = window.require('electron');
    const onAvailable = (_, version) => setUpdateInfo({ version, countdown: null });
    const onCountdown = (_, seconds) => setUpdateInfo(prev => prev ? { ...prev, countdown: seconds } : { version: '?', countdown: seconds });
    ipcRenderer.on('update-available', onAvailable);
    ipcRenderer.on('update-countdown', onCountdown);
    return () => {
      ipcRenderer.removeListener('update-available', onAvailable);
      ipcRenderer.removeListener('update-countdown', onCountdown);
    };
  }, [isElectron]);

  const [alertState, setAlertState] = useState(null); // { type, title, message, onConfirm, onCancel }
  const [updateInfo, setUpdateInfo] = useState(null);

  const showAlert = (message, type = 'info', title = '') => {
    return new Promise((resolve) => {
      setAlertState({
        type,
        title: title || (type === 'success' ? 'Éxito' : type === 'error' ? 'Error' : type === 'confirm' ? 'Confirmación' : 'Información'),
        message,
        onConfirm: () => {
          setAlertState(null);
          resolve(true);
        },
        onCancel: type === 'confirm' ? () => {
          setAlertState(null);
          resolve(false);
        } : null
      });
    });
  };

  useEffect(() => {
    if (alertState && alertState.type !== 'confirm') {
      const timer = setTimeout(() => {
        alertState.onConfirm();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [alertState]);

  // Catalogs
  const [catUnidades, setCatUnidades] = useState([]);
  const [catInmuebles, setCatInmuebles] = useState([]);
  const [catModelos, setCatModelos] = useState([]);
  const [catMarcas, setCatMarcas] = useState([]);
  const [catTiposDisp, setCatTiposDisp] = useState([]);
  const [catUbicaciones, setCatUbicaciones] = useState([]);

  // States
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [formState, setFormState] = useState(initialFormState);
  const [dbInfo, setDbInfo] = useState(null); // Reference to check discrepancies
  const [wmiInfo, setWmiInfo] = useState(null); // Reference to check discrepancies with physical HW
  const [lastSubmitted, setLastSubmitted] = useState(null); // Reference to check discrepancies

  const [searchSerial, setSearchSerial] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [selectedCuentaIdx, setSelectedCuentaIdx] = useState(0);

  const [collapsed, setCollapsed] = useState({
    generales: false,
    seguridad: false,
    especificaciones: false
  });
  const toggleCollapse = (section) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Modals
  const [showModalUbicacion, setShowModalUbicacion] = useState(false);
  const [showModalModelo, setShowModalModelo] = useState(false);

  // Notes state (moved to NotasBienSection component)

  // Load Catalogs on Mount
  useEffect(() => {
    const initDashboard = async () => {
      setIsInitialLoading(true);
      try {
        await loadAllCatalogs();
        // Disparar carga local automáticamente simulando el botón
        await loadWMI();
      } finally {
        setIsInitialLoading(false);
      }
    };
    initDashboard();
  }, []);



  const loadAllCatalogs = async () => {
    try {
      const data = await getCatalogs();
      if (data) {
        if (data.segmentos) {
          setCatUnidades(data.segmentos.map(s => ({ 
            value: String(s.id_segmento), 
            label: s.ip ? `${s.ip}/${s.bits} - ${s.nombre}` : s.nombre, 
            clave: s.clave,
            ip: s.ip,
            bits: s.bits
          })));
        }
        if (data.unidades) {
          setCatInmuebles(data.unidades.map(u => ({ value: u.clave, label: u.desc_corta || u.descripcion })));
        } else {
          setCatInmuebles([]);
        }
        setCatModelos(data.catModelos.filter(m => m.tipo_disp === 3 || m.tipo_disp === 4).map(m => ({ value: m.clave_modelo, label: m.descrip_disp })));
        setCatMarcas(data.marcas.map(m => ({ value: String(m.clave_marca), label: m.marca })));
        setCatTiposDisp(data.tiposDispositivo.map(t => ({ value: String(t.tipo_disp), label: t.nombre_tipo })));
      }
    } catch (err) {
      console.error(err);
      showAlert('Error cargando catálogos principales.', 'error');
    }
  };

  // Watch Unidad Change -> Fetch Ubicaciones & Clear invalid Segmento
  useEffect(() => {
    if (formState.clave_unidad_ref) {
      getUbicacionesPorUnidad(formState.clave_unidad_ref).then(data => {
        setCatUbicaciones(data.map(u => ({ value: String(u.id_ubicacion), label: u.nombre_ubicacion })));
      });
      if (formState.id_segmento) {
        const currentSeg = catUnidades.find(s => String(s.value) === String(formState.id_segmento));
        if (currentSeg && currentSeg.clave !== formState.clave_unidad_ref) {
          updateForm('id_segmento', '');
        }
      }
    } else {
      setCatUbicaciones([]);
      updateForm('id_segmento', '');
    }
  }, [formState.clave_unidad_ref, catUnidades]);

  // Watch IP changes -> Auto assign Segmento
  useEffect(() => {
    if (formState.dir_ip && catUnidades.length > 0) {
      const primaryIp = formState.dir_ip.split('/')[0].trim();
      
      const ip2long = (ip) => {
        const parts = ip.split('.');
        if (parts.length !== 4) return null;
        return parts.reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
      };

      const isIpInSubnet = (ip, subnetIp, bits) => {
        if (!subnetIp || !bits) return false;
        const ipLong = ip2long(ip);
        const subLong = ip2long(subnetIp);
        if (ipLong === null || subLong === null) return false;
        const mask = ~((1 << (32 - bits)) - 1) >>> 0;
        return (ipLong & mask) === (subLong & mask);
      };

      const matchedSegment = catUnidades.find(s => isIpInSubnet(primaryIp, s.ip, s.bits));
      if (matchedSegment) {
        if (formState.id_segmento !== matchedSegment.value) {
          updateForm('id_segmento', matchedSegment.value);
          if (matchedSegment.clave && !formState.clave_unidad_ref) {
            updateForm('clave_unidad_ref', matchedSegment.clave);
          }
        }
      } else if (formState.id_segmento) {
        updateForm('id_segmento', '');
      }
    } else if (!formState.dir_ip && formState.id_segmento) {
      updateForm('id_segmento', '');
    }
  }, [formState.dir_ip, catUnidades]);

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
      // 1. Traer datos WMI
      const data = await fetchHardwareInfo();
      setWmiInfo(data);

      const scannedSerial = data.num_serie || '';
      if (scannedSerial && !searchSerial) setSearchSerial(scannedSerial);

      // 2. Volcar datos locales al state primero
      setFormState(prev => {
        // Siempre resetear al estado inicial para limpiar datos de una búsqueda anterior
        const baseState = initialFormState;
        const newData = { ...baseState, ...data };

        if (data.windows_serial || data.serial_number) {
          newData.windows_serial = data.windows_serial || data.serial_number;
        }
        if (data.nom_pc) newData.nombre_host = data.nom_pc;

        // Cuentas locales (WMI)
        const norm = (s) => (s || '').trim().toLowerCase();
        const wmiCuentas = data.cuentasList || [];
        const finalCuentas = [];
        
        wmiCuentas.forEach(wmiC => {
          let cWin = (wmiC.cuenta_windows || '').replace(/\\\\/g, '\\');
          let cCorreo = wmiC.correo || '';
          
          if (!cCorreo && data.usuario_pc && cWin.toLowerCase().includes(data.usuario_pc.toLowerCase())) {
             cCorreo = (data.correos_usuario?.length > 0) ? data.correos_usuario[0] : '';
          }

          finalCuentas.push({
            _new: true, _editing: false, _selected: false,
            cuenta_windows: cWin,
            correo: cCorreo,
            tipo_user: wmiC.tipo_user || ''
          });
        });

        // Fallback si WMI no trae cuentasList pero sí usuario_pc
        if (finalCuentas.length === 0 && data.usuario_pc) {
          finalCuentas.push({
            _new: true, _editing: false, _selected: false,
            cuenta_windows: data.usuario_pc || '',
            correo: (data.correos_usuario?.length > 0) ? data.correos_usuario[0] : '',
            tipo_user: data.tipo_usuario_pc || ''
          });
        }

        const isCurrent = (c) => data.usuario_pc && (c.cuenta_windows || '').toLowerCase().includes(data.usuario_pc.toLowerCase());
        newData.cuentasList = finalCuentas.sort((a, b) => {
          if (isCurrent(a) && !isCurrent(b)) return -1;
          if (!isCurrent(a) && isCurrent(b)) return 1;
          return 0;
        });

        if (data.adaptadores_red?.length > 0) {
          newData.dir_ip_list = data.adaptadores_red.slice(0, 3).map(a => ({ ip: a.ip, mac: a.mac, adapter: a.descripcion }));
          newData.dir_ip = data.dir_ip;
          newData.mac_address = data.mac_address;
        } else if (data.dir_ip) {
          newData.dir_ip_list = [{ ip: data.dir_ip, mac: data.mac_address || '', adapter: 'WMI' }];
        }

        return newData;
      });

      // 3. Ahora que el state tiene WMI, buscar en BD todo el registro y fusionarlo (syncDB)
      if (scannedSerial) {
        // Ejecutamos syncDB asíncronamente y preservamos la data WMI local
        await syncDB(scannedSerial, true);
      }

    } catch (err) {
      showAlert('Error obteniendo WMI del backend C#. Asegúrate de que el backend C# esté corriendo.', 'error');
    } finally {
      setLoadingAction(false);
    }
  };

  // Sync DB
  const syncDB = async (overrideSerial = null, preserveLocal = false) => {
    const serialToSearch = typeof overrideSerial === 'string' ? overrideSerial : searchSerial;
    if (!serialToSearch && !formState.dir_ip) {
      showAlert('Ingresa un número de serie o dirección IP para buscar.', 'warning');
      return;
    }

    setLoadingAction(true);
    try {
      // 1. Buscar en BD
      let query = '';
      if (serialToSearch) {
        query = `
          query {
            bienByTermino(termino: "${serialToSearch}") {
              id_bien
              num_serie
              num_inv
              estatus_operativo
              clave_unidad_ref
              clave_modelo
              id_usuario_resguardo
              id_segmento
              id_ubicacion
              fecha_adquisicion
              fecha_actualizacion
              usuarioResguardo {
                matricula
                nombre_completo
              }
              especificacionTI {
                nombre_host
                windows_serial
                cpu_info
                ram_gb
                almacenamiento_gb
                mac_address
                dir_ip
                puerto_red
                switch_red
                modelo_so
                version_office
                last_scan
              }
              monitores {
                monitor {
                  id_bien
                  num_serie
                  modelo { descrip_disp, marca { marca } }
                }
              }
              cuentasPC {
                id_cuenta
                cuenta_windows
                correo
                tipo_user
              }
            }
          }
        `;
      } else if (formState.dir_ip) {
        query = `
          query {
            bienByTermino(termino: "${formState.dir_ip}") {
              id_bien
              num_serie
              num_inv
              estatus_operativo
              clave_unidad_ref
              clave_modelo
              id_usuario_resguardo
              id_segmento
              id_ubicacion
              fecha_adquisicion
              fecha_actualizacion
              usuarioResguardo {
                matricula
                nombre_completo
              }
              especificacionTI {
                nombre_host
                windows_serial
                cpu_info
                ram_gb
                almacenamiento_gb
                mac_address
                dir_ip
                puerto_red
                switch_red
                modelo_so
                version_office
                last_scan
              }
              monitores {
                monitor {
                  id_bien
                  num_serie
                  modelo { descrip_disp, marca { marca } }
                }
              }
              cuentasPC {
                id_cuenta
                cuenta_windows
                correo
                tipo_user
              }
            }
          }
        `;
      }
      const data = await queryGraphQL(query);
      if (data && data.bienByTermino && data.bienByTermino.length > 0) {
        const bien = Array.isArray(data.bienByTermino) ? data.bienByTermino[0] : data.bienByTermino;
        const esp = bien.especificacionTI || {};

        const mergedObj = {
          id_bien: bien.id_bien,
          num_serie: bien.num_serie || serialToSearch,
          num_inv: bien.num_inv || '',
          estatus_operativo: bien.estatus_operativo || 'ACTIVO',
          clave_unidad_ref: bien.clave_unidad_ref || '',
          clave_modelo: bien.clave_modelo || '',
          id_usuario_resguardo: bien.id_usuario_resguardo ? String(bien.id_usuario_resguardo) : '',
          nombre_usuario_resguardo: bien.usuarioResguardo
            ? `${bien.usuarioResguardo.matricula} - ${bien.usuarioResguardo.nombre_completo}`
            : '',
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
          dir_ip_list: (() => {
            const ips = (esp.dir_ip || '').split('/').filter(Boolean);
            const macs = (esp.mac_address || '').split('/').filter(Boolean);
            return ips.map((ip, i) => ({ ip, mac: macs[i] || '', adapter: 'BD' }));
          })(),
          puerto_red: esp.puerto_red || '',
          switch_red: esp.switch_red || '',
          modelo_so: esp.modelo_so || '',
          version_office: esp.version_office || '',
          cuentasList: (bien.cuentasPC || []).map(c => ({
            id_cuenta: c.id_cuenta,
            cuenta_windows: c.cuenta_windows || '',
            correo: c.correo || '',
            tipo_user: c.tipo_user || '',
            _editing: false,
            _selected: true  // ya existe en BD → marcada
          })),
          fecha_act_antivirus: (() => {
            if (!esp.last_scan) return '';
            const d = new Date(isNaN(Number(esp.last_scan)) ? esp.last_scan : Number(esp.last_scan));
            if (isNaN(d.getTime())) return '';
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
          })(),
          monitores: (bien.monitores || []).map(bm => {
            const desc = bm.monitor?.modelo?.descrip_disp || '';
            const marca = bm.monitor?.modelo?.marca?.marca || '';
            let cleanMod = desc;
            if (marca && desc.toLowerCase().startsWith(marca.toLowerCase())) {
              cleanMod = desc.substring(marca.length).trim();
            }
            return {
              id_bien: bm.monitor?.id_bien || '',
              num_serie: bm.monitor?.num_serie || '',
              marca: marca,
              modelo: cleanMod
            };
          })
        };

        setDbInfo(mergedObj);
        setLastSubmitted(null);

        // Populate form
        setFormState(prev => {
          const ns = { ...prev };
          const wmiFields = ['num_serie', 'nombre_host', 'windows_serial', 'cpu_info', 'ram_gb', 'almacenamiento_gb', 'mac_address', 'dir_ip', 'modelo_so', 'version_office', 'fecha_act_antivirus'];
          
          Object.keys(mergedObj).forEach(k => {
            if (wmiFields.includes(k) && preserveLocal) {
              // Dar prioridad al dato local (WMI) si ya existe y preservar. Si está vacío, usar el de la BD.
              if (!ns[k]) {
                ns[k] = mergedObj[k];
              }
            } else if ((k === 'cuentasList' || k === 'monitores' || k === 'dir_ip_list') && preserveLocal) {
              // Si debemos preservar lo local y es una lista, la fusionamos.
              if (k === 'cuentasList' && ns.cuentasList && ns.cuentasList.length > 0 && ns.cuentasList.some(c => c._new)) {
                const bdCuentas = new Map(mergedObj.cuentasList.map(c => [(c.cuenta_windows || '').trim().toLowerCase(), c]));
                const finalCuentas = [];

                ns.cuentasList.forEach(localC => {
                  const lNorm = (localC.cuenta_windows || '').trim().toLowerCase();
                  if (bdCuentas.has(lNorm)) {
                    const bdC = bdCuentas.get(lNorm);
                    finalCuentas.push({
                      ...localC,
                      id_cuenta: bdC.id_cuenta,
                      correo: localC.correo || bdC.correo,
                      tipo_user: localC.tipo_user || bdC.tipo_user,
                      _new: false,
                      _selected: true
                    });
                    bdCuentas.delete(lNorm);
                  } else {
                    finalCuentas.push({ ...localC, _selected: false });
                  }
                });

                bdCuentas.forEach(bdC => {
                  finalCuentas.push({ ...bdC, _new: false, _selected: false });
                });

                const isCurrentDB = (c) => ns.usuario_pc && (c.cuenta_windows || '').toLowerCase().includes(ns.usuario_pc.toLowerCase());
                ns.cuentasList = finalCuentas.sort((a, b) => {
                  if (isCurrentDB(a) && !isCurrentDB(b)) return -1;
                  if (!isCurrentDB(a) && isCurrentDB(b)) return 1;
                  return 0;
                });
              } else if (k === 'monitores' || k === 'dir_ip_list') {
                 // Dejar las listas de WMI como prioritarias
              } else {
                ns[k] = mergedObj[k];
              }
            } else {
              // Buscar normal: la BD manda y sobreescribe todo
              ns[k] = mergedObj[k];
            }
          });
          return ns;
        });
      } else {
        if (preserveLocal) {
          showAlert('El equipo no se encuentra registrado en la base de datos. Se han cargado únicamente los datos locales.', 'info', 'No Encontrado');
          setDbInfo(null);
          setFormState(prev => ({ ...prev, id_bien: undefined }));
        } else {
          showAlert('Activo no encontrado en la BD. Rellene los campos para registrar uno nuevo.', 'info', 'No Encontrado');
          setDbInfo(null);
          setFormState(prev => ({ ...prev, id_bien: undefined }));
        }
      }
    } catch (err) {
      showAlert('Error conectando a la base de datos (GraphQL).', 'error');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleSave = async () => {
    if (!formState.num_serie) return showAlert('El número de serie es obligatorio.', 'warning');

    setLoadingAction(true);
    try {
      const dbIps = (formState.dir_ip_list || []).map(x => (x.ip || '').trim()).filter(Boolean);
      for (const ip of dbIps) {
        const inUse = await checkIpUsage(ip, dbInfo?.id_bien);
        if (inUse) {
          setLoadingAction(false);
          await showAlert(`La dirección IP ${ip} ya se encuentra registrada en otro activo.`, 'error', 'IP Duplicada');
          return;
        }
      }

      const isNew = !dbInfo || !dbInfo.id_bien;
      const userRole = getUserRole();

      let effectiveIsNew = isNew;
      let effectiveDbInfo = dbInfo;
      if (isNew && formState.num_serie) {
        const chk = await queryGraphQL(`query { bienByNumSerie(num_serie: "${formState.num_serie}") { id_bien } }`);
        if (chk?.bienByNumSerie?.id_bien) {
          effectiveIsNew = false;
          effectiveDbInfo = { ...dbInfo, id_bien: chk.bienByNumSerie.id_bien };
        }
      }

      // Helper: llama procesarMonitoresEquipo con confirm dialog si hay conflictos
      // Returns true if monitors were saved (including after conflict resolution)
      const _procesarMonitoresFrontend = async (idBien, monitores, forzar) => {
        const result = await procesarMonitoresEquipo(idBien, monitores, forzar);
        if (!result.ok && result.conflictos && result.conflictos.length > 0) {
          // Construir mensaje de conflicto
          const msgs = result.conflictos.map(c => {
            const inv = c.num_inv_equipo_anterior ? `No. Inv: ${c.num_inv_equipo_anterior}` : '';
            return `• Monitor serie ${c.num_serie} ya está vinculado al equipo:\n   No. Serie equipo anterior: ${c.num_serie_equipo_anterior}${inv ? `\n   ${inv}` : ''}`;
          }).join('\n\n');
          const confirmar = await showAlert(
            `Conflicto de monitores:\n\n${msgs}\n\n¿Deseas desvincular esos monitores de su equipo anterior y enlazarlos a este equipo?`,
            'confirm',
            'Conflicto de Monitores'
          );
          if (confirmar) {
            await procesarMonitoresEquipo(idBien, monitores, true);
            // Actualizar formState.monitores para que los monitores recién vinculados aparezcan de inmediato
            // Mezclar: los WMI ya tienen marca/modelo, solo aseguramos que todos los de WMI estén
            setFormState(prev => ({ ...prev, monitores }));
            return true; // conflict resolved
          }
          return false;
        }
        return result.ok;
      };


      // Roles Admin(1) y Maestro(2) → guardado directo sin solicitud
      if (userRole === 1 || userRole === 2) {
        const dirIpString = (formState.dir_ip_list || []).map(x => (x.ip || '').trim()).filter(Boolean).join('/');
        const macString = (formState.dir_ip_list || []).map(x => (x.mac || '').trim()).filter(Boolean).join('/');
        const dataToSave = { ...formState, id_bien: effectiveDbInfo?.id_bien, dir_ip: dirIpString, mac_address: macString, especificacionTI: { ...formState, dir_ip: dirIpString, mac_address: macString } };
        const finalIdBien = await saveAsset(effectiveIsNew, dataToSave);
        const idBien = typeof finalIdBien === 'string' ? finalIdBien : effectiveDbInfo?.id_bien;

        // Procesar monitores WMI — siempre, para desvincular los que ya no están
        const monitores = (formState.monitores || []).filter(m => m.num_serie);
        if (idBien) {
          await _procesarMonitoresFrontend(idBien, monitores, false);
        }

        setLastSubmitted(JSON.stringify(formState));
        if (hasDbChanges || monitorsChanged || tiFieldsChanged) {
          await showAlert('El activo y sus componentes han sido guardados exitosamente.', 'success', 'Guardado Exitoso');
        } else {
          await showAlert('Se actualizaron los programas y la información técnica, no hubo cambios adicionales para guardar.', 'success', 'Sincronización Exitosa');
        }
        setSearchSerial(formState.num_serie);
        await syncDB(formState.num_serie, wmiInfo !== null);
      } else {

        // Roles 2, 3, 4 → solicitud de cambio
        const datosNuevos = {};
        const dirIpString = (formState.dir_ip_list || []).map(x => (x.ip || '').trim()).filter(Boolean).join('/');
        const macString = (formState.dir_ip_list || []).map(x => (x.mac || '').trim()).filter(Boolean).join('/');

        let idBienTarget = effectiveDbInfo?.id_bien;

        if (effectiveIsNew) {
          // Creación: enviar todos los campos con valor
          Object.keys(initialFormState).forEach(key => {
            if (['correos_usuario', 'tipo_equipo', 'nombre_usuario_resguardo'].includes(key)) return;
            if (formState[key] !== '' && formState[key] !== undefined && formState[key] !== null) {
              datosNuevos[key] = formState[key];
            }
          });
          datosNuevos._esCreacion = true;
          // Si es nuevo y es rol menor, la info de TI se enviará como solicitud junto con lo general
        } else {
          // Actualización: Guardado directo de specs, programas y MONITORES aunque sea rol menor
          try {
            await saveDirectSpecsAndPrograms(idBienTarget, { ...formState, dir_ip: dirIpString, mac_address: macString });
            
            // Auto-guardar monitores
            const monitores = (formState.monitores || []).filter(m => m.num_serie);
            if (idBienTarget) {
              await _procesarMonitoresFrontend(idBienTarget, monitores, false);
            }
          } catch (err) {
            console.log("Error guardando datos técnicos directos:", err);
          }

          // Actualización: solo campos generales para la solicitud
          const safeDbInfo = effectiveDbInfo || {};
          Object.keys(initialFormState).forEach(key => {
            // Ignoramos campos de TI porque ya se guardaron directo
            if (['id_bien', 'correos_usuario', 'tipo_equipo', 'nombre_usuario_resguardo', 'monitores', 'mac_address', 'dir_ip', 'dir_ip_list', 'cuentasList', 'programas', 'nombre_host', 'windows_serial', 'cpu_info', 'ram_gb', 'almacenamiento_gb', 'puerto_red', 'switch_red', 'modelo_so', 'version_office', 'fecha_act_antivirus'].includes(key)) return;

            if (key === 'dir_ip_list') {
              const cIp = (formState.dir_ip_list || []).map(x => (x.ip || '').trim()).filter(Boolean).join('/');
              const oIp = (safeDbInfo.dir_ip_list || []).map(x => (x.ip || '').trim()).filter(Boolean).join('/');
              const cMac = (formState.dir_ip_list || []).map(x => (x.mac || '').trim()).filter(Boolean).join('/');
              const oMac = (safeDbInfo.dir_ip_list || []).map(x => (x.mac || '').trim()).filter(Boolean).join('/');
              if (cIp !== oIp || cMac !== oMac) datosNuevos.dir_ip_list = formState.dir_ip_list;
              return;
            }
            if (key === 'cuentasList') {
              const cStr = JSON.stringify((formState.cuentasList || []).map(c => ({ w: c.cuenta_windows, m: c.correo, t: c.tipo_user })));
              const oStr = JSON.stringify((safeDbInfo.cuentasList || []).map(c => ({ w: c.cuenta_windows, m: c.correo, t: c.tipo_user })));
              if (cStr !== oStr) datosNuevos.cuentasList = formState.cuentasList;
              return;
            }
            if (Array.isArray(formState[key])) {
              if (JSON.stringify(formState[key]) !== JSON.stringify(safeDbInfo[key])) {
                datosNuevos[key] = formState[key];
              }
            } else {
              const current = String(formState[key] ?? '').trim();
              const original = String(safeDbInfo[key] ?? '').trim();
              if (current !== original) {
                datosNuevos[key] = formState[key] === '' ? null : formState[key];
              }
            }
          });
          // Monitores ya no se incluyen en la solicitud, se auto-guardan arriba
        }

        if (datosNuevos.dir_ip_list) {
          datosNuevos.dir_ip = (formState.dir_ip_list || []).map(x => (x.ip || '').trim()).filter(Boolean).join('/');
          datosNuevos.mac_address = (formState.dir_ip_list || []).map(x => (x.mac || '').trim()).filter(Boolean).join('/');
          delete datosNuevos.dir_ip_list;
        }

        if (Object.keys(datosNuevos).filter(k => k !== '_esCreacion').length === 0) {
          if (!effectiveIsNew) {
            await showAlert('Se actualizaron los programas y la información técnica, no hubo cambios adicionales para guardar.', 'success', 'Sincronización Exitosa');
            setSearchSerial(formState.num_serie);
            await syncDB(formState.num_serie, wmiInfo !== null);
          } else {
            await showAlert('No se detectaron cambios en el formulario para enviar a revisión.', 'info', 'Sin Cambios');
          }
          return;
        }

        const finalIdBien = effectiveIsNew ? crypto.randomUUID() : idBienTarget;
        await solicitarActualizacionBien(finalIdBien, JSON.stringify(datosNuevos));
        setLastSubmitted(JSON.stringify(formState));
        await showAlert('Tus cambios generales han sido enviados a revisión y la información técnica se actualizó directamente.', 'success', 'Enviado a revisión');
      }
    } catch (err) {
      await showAlert('Error al guardar: ' + err.message, 'error');
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

  const filteredSegmentos = formState.clave_unidad_ref
    ? catUnidades.filter(s => s.clave === formState.clave_unidad_ref)
    : [];

  const isNew = !dbInfo || !dbInfo.id_bien;
  let currentDatosNuevos = {};
  if (isNew) {
    Object.keys(initialFormState).forEach(key => {
      if (['correos_usuario', 'monitores', 'tipo_equipo', 'nombre_usuario_resguardo', 'mac_address', 'dir_ip', 'programas'].includes(key)) return;
      if (formState[key] !== '' && formState[key] !== undefined && formState[key] !== null) {
        currentDatosNuevos[key] = formState[key];
      }
    });
    currentDatosNuevos._esCreacion = true;
  } else {
    Object.keys(initialFormState).forEach(key => {
      if (['id_bien', 'correos_usuario', 'monitores', 'tipo_equipo', 'nombre_usuario_resguardo', 'mac_address', 'dir_ip', 'dir_ip_list', 'cuentasList', 'programas', 'nombre_host', 'windows_serial', 'cpu_info', 'ram_gb', 'almacenamiento_gb', 'puerto_red', 'switch_red', 'modelo_so', 'version_office', 'fecha_act_antivirus'].includes(key)) return;
      if (Array.isArray(formState[key])) {
        if (JSON.stringify(formState[key]) !== JSON.stringify(dbInfo[key])) {
          currentDatosNuevos[key] = formState[key];
        }
      } else {
        const current = String(formState[key] ?? '').trim();
        const original = String(dbInfo[key] ?? '').trim();
        if (current !== original) {
          currentDatosNuevos[key] = formState[key] === '' ? null : formState[key];
        }
      }
    });
  }

  const monitorsChanged = (() => {
    const dbMons = dbInfo?.monitores || [];
    const formMons = formState.monitores || [];
    if (dbMons.length !== formMons.length) return true;
    return formMons.some((fm, idx) => {
      const dbm = dbMons[idx] || {};
      return fm.monitor?.num_serie !== dbm.monitor?.num_serie ||
        fm.marca !== dbm.marca ||
        fm.modelo !== dbm.modelo;
    });
  })();

  const tiFieldsChanged = (() => {
    if (!dbInfo) return true;
    const tiKeys = ['dir_ip_list', 'cuentasList', 'programas', 'nombre_host', 'windows_serial', 'cpu_info', 'ram_gb', 'almacenamiento_gb', 'puerto_red', 'switch_red', 'modelo_so', 'version_office'];
    return tiKeys.some(key => {
      if (key === 'dir_ip_list') {
        const cIp = (formState.dir_ip_list || []).map(x => (x.ip || '').trim()).filter(Boolean).join('/');
        const oIp = (dbInfo.dir_ip_list || []).map(x => (x.ip || '').trim()).filter(Boolean).join('/');
        const cMac = (formState.dir_ip_list || []).map(x => (x.mac || '').trim()).filter(Boolean).join('/');
        const oMac = (dbInfo.dir_ip_list || []).map(x => (x.mac || '').trim()).filter(Boolean).join('/');
        return cIp !== oIp || cMac !== oMac;
      }
      if (key === 'cuentasList') {
        // Comparar solo datos relevantes, ignorar _selected/_new/_editing
        const norm = (arr) => JSON.stringify(
          (arr || []).map(c => ({ w: c.cuenta_windows || '', m: c.correo || '', t: c.tipo_user || '' }))
            .sort((a, b) => a.w.localeCompare(b.w))
        );
        return norm(formState.cuentasList) !== norm(dbInfo.cuentasList);
      }
      if (key === 'programas') {
        const norm = (arr) => JSON.stringify(
          (arr || []).map(p => p.programa || p.nombre_programa || '').sort()
        );
        return norm(formState.programas) !== norm(dbInfo.programas);
      }
      if (Array.isArray(formState[key])) {
        return JSON.stringify(formState[key]) !== JSON.stringify(dbInfo[key]);
      }
      return String(formState[key] ?? '').trim() !== String(dbInfo[key] ?? '').trim();
    });
  })();

  const hasDbChanges = Object.keys(currentDatosNuevos).filter(k => k !== '_esCreacion').length > 0;
  const hasPendingChanges = lastSubmitted !== JSON.stringify(formState);
  const canSave = (hasDbChanges || monitorsChanged || tiFieldsChanged) && hasPendingChanges;

  if (isInitialLoading) {
    return (
      <div className="h-screen bg-[#F5F5F5] flex flex-col items-center justify-center relative">
        <header
          className="bg-[#006241] h-11 w-full absolute top-0 left-0 flex items-center justify-between px-6 select-none text-white shadow-md z-20"
          style={{ WebkitAppRegion: 'drag' }}
        >
          <div className="flex items-center gap-4">
            <img src="IMSS_Logosímbolo_Blanco.png" alt="IMSS" className="h-5 w-5 object-contain" />
            <span className="text-xs font-semibold tracking-wide">Gestor de Activos — IMSS</span>
          </div>
        </header>
        <div className="flex flex-col items-center gap-4 mt-11">
          <RefreshCcw className="w-12 h-12 text-[#006241] animate-spin" />
          <p className="text-lg font-semibold text-[#333333]">Cargando datos del equipo...</p>
          <p className="text-sm text-[#757575]">Por favor espere un momento mientras se recupera la información.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#F5F5F5] text-[#333333] flex flex-col overflow-hidden">
      {/* Unified TitleBar/Navbar for Electron Window Control Overlay */}
      <header
        className="bg-[#006241] h-11 w-full flex items-center justify-between px-6 select-none text-white shadow-md z-20"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <div className="flex items-center gap-4">
          <img src="IMSS_Logosímbolo_Blanco.png" alt="IMSS" className="h-5 w-5 object-contain" />
          <span className="text-xs font-semibold tracking-wide">Gestor de Activos — IMSS <span className="text-[10px] text-gray-300 ml-1 font-normal">v{pkg.version}</span></span>
          {dbInfo && dbInfo.id_bien && (
            <div
              className="flex items-center gap-2 bg-[#008F59]/30 border border-[#008F59]/50 px-2 py-0.5 rounded-full"
              style={{ WebkitAppRegion: 'no-drag' }}
            >
              <span className="text-[10px] font-bold text-green-300 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                Sincronizado
              </span>
              {dbInfo.fecha_actualizacion && (
                <span className="text-[9px] text-white/70 italic border-l border-white/20 pl-2">
                  Act: {dbInfo.fecha_actualizacion.split(',')[0]}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Actions */}
        <aside className="w-64 bg-white border-r border-[#E0E0E0] p-6 flex flex-col gap-4 shadow-sm z-10">

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[#757575] uppercase tracking-wider">Buscar Equipo (N/S)</label>
            <div className="flex items-center bg-[#F9FAFB] rounded-xl px-2 py-1.5 border border-[#E0E0E0] focus-within:border-[#006241] focus-within:ring-1 focus-within:ring-[#006241] transition-all">
              <input
                type="text"
                value={searchSerial}
                onChange={(e) => setSearchSerial(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && syncDB()}
                className="bg-transparent border-none text-[#333333] px-2 py-1 w-full focus:outline-none text-sm placeholder-gray-400"
                placeholder="Buscar Serial..."
              />
              <button
                onClick={syncDB}
                disabled={loadingAction}
                title="Buscar en Base de Datos"
                className="p-1.5 hover:bg-[#E0E0E0] rounded-lg transition-colors text-[#757575] hover:text-[#006241]"
              >
                <Search className={clsx("w-4 h-4", loadingAction && "animate-pulse text-[#006241]")} />
              </button>
            </div>
          </div>

          <button onClick={loadWMI} disabled={loadingAction} className="bg-[#006241] hover:bg-[#008F59] text-white py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-colors disabled:opacity-50 shadow-sm">
            <Monitor className="w-5 h-5" /> Cargar Datos Locales (WMI)
          </button>

          {/* Info. del Sistema */}
          <div className="p-4 bg-[#F9FAFB] rounded-xl border border-[#E0E0E0] space-y-3">
            <p className="text-xs text-[#333333] font-bold uppercase tracking-wider border-b border-[#E0E0E0] pb-1.5 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[#006241]" /> Info. del Sistema
            </p>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[#757575] font-semibold block uppercase text-[10px]">Últ. Antivirus</span>
                <span className="text-[#333333] font-medium block truncate" title={formState.fecha_act_antivirus}>{formState.fecha_act_antivirus || '—'}</span>
              </div>
              <div>
                <span className="text-[#757575] font-semibold block uppercase text-[10px]">Fecha Adquisición</span>
                <span className="text-[#333333] font-medium block truncate" title={formState.fecha_adquisicion}>{formState.fecha_adquisicion || '—'}</span>
              </div>
            </div>
          </div>

          {/* Cuentas PC (Tarjetas con checkbox) */}
          {formState.cuentasList && formState.cuentasList.length > 0 && (
            <div className="space-y-1.5 max-h-[14rem] overflow-y-auto no-scrollbar pb-1">
              <p className="text-[10px] font-bold text-[#757575] uppercase tracking-wider px-1">Cuentas Detectadas</p>
              {formState.cuentasList.map((c, i) => {
                const isExpanded = selectedCuentaIdx === i;
                const isChecked = !!c._selected;
                // Fix 2: key estable por nombre de cuenta, no por índice
                const stableKey = c.cuenta_windows || c.id_cuenta || `cuenta-${i}`;
                return (
                  <div key={stableKey} className={clsx(
                    "border rounded-xl overflow-hidden shadow-sm transition-colors",
                    isChecked ? "border-[#006241] bg-[#F0FAF4]" : "border-[#E0E0E0] bg-[#F9FAFB]"
                  )}>
                    <div className="flex items-center px-3 py-2 gap-2">
                      {/* Checkbox */}
                      <button
                        onClick={() => {
                          const newC = formState.cuentasList.map((item, idx) =>
                            idx === i ? { ...item, _selected: !item._selected } : item
                          );
                          updateForm('cuentasList', newC);
                          // Fix 3: cerrar acordeón al marcar/desmarcar para evitar desfase
                          if (isExpanded) setSelectedCuentaIdx(-1);
                        }}
                        title={isChecked ? "Desmarcar (no guardar)" : "Marcar para guardar"}
                        className={clsx(
                          "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                          isChecked
                            ? "bg-[#006241] border-[#006241] text-white"
                            : "bg-white border-gray-300 hover:border-[#006241]"
                        )}
                      >
                        {isChecked && (
                          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>

                      {/* Label / expand */}
                      <button
                        onClick={() => setSelectedCuentaIdx(isExpanded ? -1 : i)}
                        className="text-left flex-grow flex items-center justify-between min-w-0"
                      >
                        <div className="overflow-hidden min-w-0 flex-grow">
                          <span className={clsx("font-bold block text-xs mt-0.5 truncate", isChecked ? "text-[#006241]" : "text-[#333333]")}>
                            {c.cuenta_windows || '—'}
                          </span>
                          {c.id_cuenta && !c._new && (
                            <span className="text-[9px] text-[#006241] font-semibold">● En BD</span>
                          )}
                          {formState.usuario_pc && (c.cuenta_windows || '').toLowerCase().includes(formState.usuario_pc.toLowerCase()) && (
                            <span className="text-[9px] text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded ml-1 border border-blue-200">Cuenta en uso</span>
                          )}
                        </div>
                        <div className="mx-1 flex-shrink-0">
                          {isExpanded ? <ChevronUp className="w-3 h-3 text-[#757575]" /> : <ChevronDown className="w-3 h-3 text-[#757575]" />}
                        </div>
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="p-3 bg-white border-t border-[#E0E0E0] space-y-1.5">
                        <div>
                          <span className="text-[#757575] font-semibold block uppercase text-[9px]">Tipo</span>
                          <span className="text-[#333333] font-medium block text-[11px] truncate">{c.tipo_user || '—'}</span>
                        </div>
                        {c.correo && c._correo_detectado !== false ? (
                          <div>
                            <span className="text-[#757575] font-semibold block uppercase text-[9px]">Correo</span>
                            <span className="text-[#333333] font-medium block text-[11px] break-all">{c.correo}</span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-[#757575] font-semibold block uppercase text-[9px]">Correo</span>
                            <input
                              type="email"
                              placeholder="Ingresar correo..."
                              value={c.correo || ''}
                              onChange={(e) => {
                                const newC = formState.cuentasList.map((item, idx) =>
                                  idx === i ? { ...item, correo: e.target.value, _correo_detectado: false } : item
                                );
                                updateForm('cuentasList', newC);
                              }}
                              className="w-full text-[11px] bg-white border border-[#E0E0E0] rounded px-1.5 py-0.5 mt-0.5 focus:outline-none focus:border-[#006241] focus:ring-1 focus:ring-[#006241]"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Simbología (pushes itself and elements below to the bottom) */}
          <div className="mt-auto p-4 bg-[#F9FAFB] rounded-xl border border-[#E0E0E0]">
            <p className="text-xs text-[#333333] font-bold uppercase mb-2">Simbología</p>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div> <span className="text-xs text-[#757575]">Diferente a BD</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div> <span className="text-xs text-[#757575]">Discrepancia Física</span>
            </div>
          </div>

          <button onClick={handleSave} disabled={loadingAction} className="bg-white border-2 border-[#006241] text-[#006241] hover:bg-[#F9FAFB] py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-colors disabled:opacity-50 shadow-sm">
            <Save className="w-5 h-5" /> Guardar Cambios
          </button>

          <button onClick={handleLogout} className="border border-red-200 hover:border-red-300 bg-red-50/50 hover:bg-red-50 text-red-600 py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-colors text-sm shadow-sm">
            <LogOut className="w-4 h-4" /> Cerrar Sesión
          </button>
        </aside>

        {/* Main Form */}
        <main className="flex-1 p-6 overflow-y-auto custom-scrollbar relative">

          <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Sección 1: Generales */}
              <section className="bg-white border border-[#E0E0E0] border-t-4 border-t-[#006241] rounded-2xl p-5 shadow-sm relative">
                <div className="flex justify-between items-center mb-4 select-none">
                  <h2 className="text-lg font-bold flex items-center gap-2 text-[#333333]">
                    <HardDrive className="w-5 h-5 text-[#006241]" /> Datos Generales
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldInput label="No. Serie" val={formState.num_serie} onChange={v => updateForm('num_serie', v)} color={getBorderColor('num_serie')} readOnly={true} />
                  <FieldInput label="No. Inventario" val={formState.num_inv} onChange={v => updateForm('num_inv', v)} color={getBorderColor('num_inv')} readOnly={true} />

                  <div className="w-full sm:col-span-2">
                    <label className="text-xs font-bold text-[#757575] uppercase tracking-wider block mb-1">Estatus Operativo</label>
                    <select
                      value={formState.estatus_operativo}
                      onChange={e => updateForm('estatus_operativo', e.target.value)}
                      className={clsx("w-full bg-white text-[#333333] rounded-xl py-2 px-3 border shadow-sm focus:outline-none focus:ring-1 focus:ring-[#006241]", getBorderColor('estatus_operativo'))}
                    >
                      <option value="ACTIVO">Activo</option>
                      <option value="INACTIVO">Inactivo</option>
                      <option value="EN REPARACION">En Reparación</option>
                      <option value="PRESTAMO">Préstamo</option>
                      <option value="BAJA">Baja</option>
                    </select>
                  </div>

                  <div className="col-span-full border-t border-[#E0E0E0] my-1"></div>

                  <div className="w-full sm:col-span-2">
                    <SearchableSelect label="Unidad" options={catInmuebles} value={formState.clave_unidad_ref} onChange={v => updateForm('clave_unidad_ref', v)} />
                  </div>

                  <div className="w-full sm:col-span-2">
                    <SearchableSelect
                      label="Segmento"
                      options={filteredSegmentos}
                      value={formState.id_segmento}
                      onChange={v => {
                        updateForm('id_segmento', v);
                        updateForm('id_ubicacion', '');
                      }}
                      disabled={!formState.clave_unidad_ref}
                      placeholder={formState.clave_unidad_ref ? "Buscar segmento..." : "Seleccione unidad primero"}
                    />
                  </div>

                  <div className="w-full sm:col-span-2">
                    <SearchableSelect 
                      label="Ubicación Específica" 
                      options={catUbicaciones} 
                      value={formState.id_ubicacion} 
                      onChange={v => updateForm('id_ubicacion', v)} 
                      disabled={!formState.clave_unidad_ref} 
                      placeholder={!formState.clave_unidad_ref ? "Seleccione unidad primero" : "Buscar ubicación..."} 
                    />
                  </div>

                  <div className="w-full sm:col-span-2">
                    <SearchableSelect label="Modelo (PC)" options={catModelos} value={formState.clave_modelo} onChange={v => updateForm('clave_modelo', v)} />
                  </div>

                  <div className="col-span-full border-t border-[#E0E0E0] my-2"></div>

                  <div className="col-span-full flex justify-between items-center">
                    <h3 className="text-sm font-bold text-[#333333]">Monitores Físicos Conectados</h3>
                    {formState.tipo_equipo && (
                      <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-200">
                        Detectado: {formState.tipo_equipo}
                      </span>
                    )}
                  </div>

                  {(!formState.monitores || formState.monitores.length === 0) && (
                    <div className="col-span-full text-xs text-gray-500 italic p-3 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-center">
                      No se detectaron monitores externos.
                    </div>
                  )}

                  {formState.monitores && formState.monitores.map((mon, idx) => (
                    <div key={idx} className="col-span-full bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col gap-3">
                      <h4 className="text-xs font-bold text-[#006241] uppercase tracking-widest border-b border-gray-200 pb-1">Monitor {idx + 1}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <FieldInput label="Marca" val={mon.marca} readOnly={true} />
                        <FieldInput label="Modelo" val={mon.modelo} readOnly={true} />
                        <FieldInput label="No. Serie" val={mon.num_serie} readOnly={true} />
                      </div>
                      {mon.id_bien && (
                        <div className="mt-2 border-t border-gray-200 pt-3">
                          <NotasBienSection idBien={mon.id_bien} title={`Notas del Monitor ${mon.num_serie}`} showAlert={showAlert} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Sección 2: Especificaciones */}
              <section className="bg-white border border-[#E0E0E0] border-t-4 border-t-[#008F59] rounded-2xl p-5 shadow-sm relative">
                <div className="flex justify-between items-center mb-4 select-none">
                  <h2 className="text-lg font-bold flex items-center gap-2 text-[#333333]">
                    <Cpu className="w-5 h-5 text-[#008F59]" /> Especificaciones de Hardware & Red
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldInput label="Nombre de Host (PC)" val={formState.nombre_host} onChange={v => updateForm('nombre_host', v)} color={getBorderColor('nombre_host')} readOnly={true} />
                  <FieldInput label="Serial SO (Windows)" val={formState.windows_serial} onChange={v => updateForm('windows_serial', v)} color={getBorderColor('windows_serial')} readOnly={true} />
                  <FieldInput label="Sistema Operativo" val={formState.modelo_so} onChange={v => updateForm('modelo_so', v)} color={getBorderColor('modelo_so')} readOnly={true} />
                  <FieldInput label="Versión de Office" val={formState.version_office} onChange={v => updateForm('version_office', v)} color={getBorderColor('version_office')} readOnly={true} />

                  <div className="sm:col-span-2">
                    <FieldInput label="Procesador (CPU)" val={formState.cpu_info} onChange={v => updateForm('cpu_info', v)} color={getBorderColor('cpu_info')} readOnly={true} />
                  </div>

                  <FieldInput label="Memoria RAM (GB)" val={formState.ram_gb} onChange={v => updateForm('ram_gb', v)} color={getBorderColor('ram_gb')} type="number" readOnly={true} />
                  <FieldInput label="Almacenamiento (GB)" val={formState.almacenamiento_gb} onChange={v => updateForm('almacenamiento_gb', v)} color={getBorderColor('almacenamiento_gb')} type="number" readOnly={true} />

                  <div className="w-full sm:col-span-2 flex flex-col">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#757575] uppercase tracking-wider block">
                        Dirección IPv4 y MAC Address
                      </label>
                      {((formState.dir_ip_list?.length > 0) ? formState.dir_ip_list : [{ ip: '', mac: '' }]).length < 3 && (
                        <button
                          type="button"
                          onClick={() => {
                            const arr = ((formState.dir_ip_list?.length > 0) ? formState.dir_ip_list : [{ ip: '', mac: '' }]);
                            updateForm('dir_ip_list', [...arr, { ip: '', mac: '' }]);
                          }}
                          className="flex items-center gap-1 text-[10px] text-[#006241] font-bold hover:underline"
                        >
                          <Plus className="w-3 h-3" /> Agregar
                        </button>
                      )}
                    </div>
                    <datalist id="wmi-adapters-list">
                      {(wmiInfo?.adaptadores_red || []).map((a, i) => (
                        <option key={i} value={a.ip}>{a.descripcion}</option>
                      ))}
                    </datalist>
                    <div className="space-y-2">
                      {((formState.dir_ip_list?.length > 0) ? formState.dir_ip_list : [{ ip: '', mac: '' }]).map((item, idx, arr) => (
                        <div key={idx} className="flex items-center gap-2 w-full">
                          <div className="flex-1 min-w-0">
                            <IpInput
                              value={item.ip || ''}
                              onChange={(val) => {
                                const newList = [...((formState.dir_ip_list?.length > 0) ? formState.dir_ip_list : [{ ip: '', mac: '' }])];
                                newList[idx].ip = val;
                                updateForm('dir_ip_list', newList);
                              }}
                              className={`py-2 px-3 ${getBorderColor('dir_ip').replace('border-', 'border border-').replace('border-gray-200', 'border-gray-300')} focus-within:ring-1 focus-within:ring-[#006241] h-10`}
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <MacInput
                              value={item.mac || ''}
                              onChange={(val) => {
                                const newList = [...((formState.dir_ip_list?.length > 0) ? formState.dir_ip_list : [{ ip: '', mac: '' }])];
                                newList[idx].mac = val;
                                updateForm('dir_ip_list', newList);
                              }}
                              className={`py-2 px-3 ${getBorderColor('mac_address').replace('border-', 'border border-').replace('border-gray-200', 'border-gray-300')} focus-within:ring-1 focus-within:ring-[#006241] h-10`}
                            />
                          </div>
                          {arr.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newList = arr.filter((_, i) => i !== idx);
                                updateForm('dir_ip_list', newList);
                              }}
                              className="flex-shrink-0 w-9 h-9 flex items-center justify-center border border-red-200 rounded-xl hover:bg-red-50 text-red-500 bg-white shadow-sm transition-colors"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <FieldInput label="Puerto / Nodo Red" val={formState.puerto_red} onChange={v => updateForm('puerto_red', v)} color={getBorderColor('puerto_red')} maxLength={15} />
                  <FieldInput label="Switch Conectado" val={formState.switch_red} onChange={v => updateForm('switch_red', v)} color={getBorderColor('switch_red')} maxLength={50} />

                  <div className="col-span-full border-t border-[#E0E0E0] my-2"></div>

                  <div className="w-full sm:col-span-2">
                    <SearchableSelect
                      label="Usuario a Resguardo"
                      options={formState.id_usuario_resguardo ? [{ value: formState.id_usuario_resguardo, label: formState.nombre_usuario_resguardo || `Usuario ID: ${formState.id_usuario_resguardo}` }] : []}
                      asyncSearch={searchUsuarios}
                      value={formState.id_usuario_resguardo}
                      onChange={(v, opt) => {
                        updateForm('id_usuario_resguardo', v);
                        let nameToSave = opt?.label || '';
                        if (nameToSave.includes('(')) {
                          nameToSave = nameToSave.split(' (')[0].trim();
                        }
                        updateForm('nombre_usuario_resguardo', nameToSave);
                      }}
                    />
                  </div>
                </div>
              </section>

              {/* Sección 3: Notas de Seguimiento */}
              {formState.id_bien && (
                <section className="lg:col-span-2 bg-white border border-[#E0E0E0] border-t-4 border-t-[#006241] rounded-2xl p-5 shadow-sm">
                  <NotasBienSection idBien={formState.id_bien} title="Notas de Seguimiento del Equipo" showAlert={showAlert} />
                </section>
              )}

            </div>
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

      {/* Banner de actualizacion */}
      {updateInfo && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#006241] text-white rounded-xl shadow-2xl px-5 py-4 max-w-sm w-full border border-[#008F59]">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold">Nueva actualizacion disponible (v{updateInfo.version})</p>
              
              {updateInfo.countdown !== null ? (
                <p className="text-xs text-green-200 mt-0.5">Instalando en <span className="font-bold text-white text-base">{updateInfo.countdown}</span>s...</p>
              ) : updateInfo.downloading ? (
                <p className="text-xs text-green-200 mt-0.5">Descargando actualizacion...</p>
              ) : (
                <button
                  onClick={() => {
                    setUpdateInfo(prev => ({...prev, downloading: true}));
                    if (isElectron) {
                      window.require('electron').ipcRenderer.send('descargar-actualizacion');
                    }
                  }}
                  className="mt-2 text-xs font-semibold bg-white text-[#006241] px-3 py-1.5 rounded-full hover:bg-green-100 transition-colors"
                >
                  Descargar e Instalar
                </button>
              )}
            </div>
          </div>
          {updateInfo.countdown !== null && (
            <div className="mt-3 w-full bg-[#008F59]/40 rounded-full h-1.5">
              <div className="bg-white h-1.5 rounded-full transition-all duration-1000" style={{ width: `${(updateInfo.countdown / 5) * 100}%` }} />
            </div>
          )}
        </div>
      )}

      {alertState && (
        <div className="fixed top-14 right-4 z-50 animate-fade-in max-w-xs sm:max-w-sm w-full">
          <div
            onClick={() => alertState.type !== 'confirm' && alertState.onConfirm()}
            className={clsx(
              "bg-white rounded-xl p-4 shadow-xl border border-gray-250 relative overflow-hidden transform scale-100 transition-all animate-scale-up select-none",
              alertState.type !== 'confirm' && "cursor-pointer hover:bg-gray-50/80 active:scale-[0.99]"
            )}
          >
            <div className="flex items-start gap-3">
              <div className={clsx(
                "p-2 rounded-full flex-shrink-0",
                alertState.type === 'success' && "bg-green-50 text-green-600",
                alertState.type === 'error' && "bg-red-50 text-red-600",
                alertState.type === 'warning' && "bg-amber-50 text-amber-600",
                alertState.type === 'confirm' && "bg-emerald-50 text-emerald-600",
                alertState.type === 'info' && "bg-blue-50 text-blue-600"
              )}>
                {alertState.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
                {alertState.type === 'error' && <XCircle className="w-5 h-5" />}
                {alertState.type === 'warning' && <AlertTriangle className="w-5 h-5" />}
                {alertState.type === 'confirm' && <HelpCircle className="w-5 h-5" />}
                {alertState.type === 'info' && <HelpCircle className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-gray-900 mb-0.5">{alertState.title}</h3>
                <p className="text-[11px] text-gray-600 whitespace-pre-line leading-relaxed">{alertState.message}</p>
              </div>
            </div>
            {alertState.type === 'confirm' && (
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    alertState.onCancel();
                  }}
                  className="px-3 py-1 text-[10px] font-semibold text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    alertState.onConfirm();
                  }}
                  className="px-4 py-1 text-[10px] font-semibold text-white rounded-lg shadow-sm bg-[#006241] hover:bg-[#008F59] transition-colors cursor-pointer"
                >
                  Aceptar
                </button>
              </div>
            )}
            {alertState.type !== 'confirm' && (
              <div className={clsx(
                "absolute bottom-0 left-0 h-[3px] animate-shrink-width",
                alertState.type === 'success' && "bg-green-600",
                alertState.type === 'error' && "bg-red-600",
                alertState.type === 'warning' && "bg-amber-600",
                alertState.type === 'info' && "bg-[#006241]"
              )} />
            )}
          </div>
        </div>
      )}

    </div>
  );
}

function FieldInput({ label, val, onChange, color, type = "text", readOnly = false, maxLength }) {
  return (
    <div className="w-full">
      <label className="text-xs font-bold text-[#757575] uppercase tracking-wider block mb-1">{label}</label>
      <input
        type={type}
        value={val || ''}
        readOnly={readOnly}
        maxLength={maxLength}
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
