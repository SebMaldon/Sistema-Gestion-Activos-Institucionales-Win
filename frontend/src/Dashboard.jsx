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
  createNotaBien
} from './services/graphqlClient';
import { LogOut, RefreshCcw, Save, Server, Monitor, HardDrive, Cpu, MapPin, Network, Activity, Plus, ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertTriangle, HelpCircle, Search, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import SearchableSelect from './components/SearchableSelect';
import { ModalUbicacion, ModalModeloMarca } from './components/Modals';

const initialFormState = {
  num_serie: '', num_inv: '', estatus_operativo: 'ACTIVO',
  clave_unidad_ref: '', clave_modelo: '', id_usuario_resguardo: '',
  id_segmento: '', id_ubicacion: '', fecha_adquisicion: '',
  nombre_host: '', windows_serial: '', cpu_info: '', ram_gb: '', almacenamiento_gb: '',
  mac_address: '', dir_ip: '', dir_ip_list: [], puerto_red: '', switch_red: '', modelo_so: '',
  fecha_act_antivirus: '', fecha_actualizacion: '',
  tipo_equipo: '', monitores: [], cuentasList: []
};

export default function Dashboard() {
  const navigate = useNavigate();
  const isElectron = typeof window !== 'undefined' && !!window.process?.versions?.electron;

  const [alertState, setAlertState] = useState(null); // { type, title, message, onConfirm, onCancel }

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

  // Notes state
  const [notas, setNotas] = useState([]);
  const [nuevaNota, setNuevaNota] = useState('');
  const [loadingNotas, setLoadingNotas] = useState(false);

  // Load Catalogs on Mount
  useEffect(() => {
    loadAllCatalogs();

    // Fetch local serial quietly on startup to populate search bar
    fetchHardwareInfo()
      .then(data => {
        if (data && data.num_serie) {
          setSearchSerial(prev => prev || data.num_serie);
        }
      })
      .catch(err => console.log('Silent WMI fetch failed on startup', err));
  }, []);

  const loadAllCatalogs = async () => {
    try {
      const data = await getCatalogs();
      if (data) {
        if (data.segmentos) {
          setCatUnidades(data.segmentos.map(s => ({ value: String(s.id_segmento), label: s.nombre, clave: s.clave })));
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
        setNotas([]);
      } else if (scannedSerial && !searchSerial) {
        setSearchSerial(scannedSerial);
      }

      // Merge WMI data into formState
      setFormState(prev => {
        const baseState = isDifferentMachine ? initialFormState : prev;
        const newData = { ...baseState, ...data };

        if (data.windows_serial || data.serial_number) {
          newData.windows_serial = data.windows_serial || data.serial_number;
        }

        if (data.nom_pc) {
          newData.nombre_host = data.nom_pc;
        }

        // Cuentas PC desde WMI
        if (data.usuario_pc || data.tipo_usuario_pc || (data.correos_usuario && data.correos_usuario.length > 0)) {
          // Checar si ya hay una cuenta para no duplicarla
          const isExisting = (newData.cuentasList || []).find(c => c.cuenta_windows === data.usuario_pc);
          if (!isExisting) {
            newData.cuentasList = [...(newData.cuentasList || []), {
              _new: true, _editing: false,
              cuenta_windows: data.usuario_pc || '',
              correo: (data.correos_usuario && data.correos_usuario.length > 0) ? data.correos_usuario[0] : '',
              tipo_user: data.tipo_usuario_pc || ''
            }];
          }
        }

        if (data.adaptadores_red && data.adaptadores_red.length > 0) {
          newData.dir_ip_list = data.adaptadores_red.slice(0, 3).map(a => ({ ip: a.ip, adapter: a.descripcion }));
          newData.dir_ip = newData.dir_ip_list.map(a => a.ip).join('/');
        } else if (data.dir_ip) {
          newData.dir_ip_list = [{ ip: data.dir_ip, adapter: 'WMI' }];
        }

        return newData;
      });



    } catch (err) {
      showAlert('Error obteniendo WMI del backend C#. Asegúrate de que el backend C# esté corriendo.', 'error');
    } finally {
      setLoadingAction(false);
    }
  };

  const fetchNotas = async (idBien) => {
    try {
      setLoadingNotas(true);
      const data = await getNotasBien(idBien);
      setNotas(data);
    } catch (err) {
      console.error('Error al cargar notas:', err);
    } finally {
      setLoadingNotas(false);
    }
  };

  const handleAddNota = async () => {
    if (!nuevaNota.trim()) return;
    if (!formState.id_bien) {
      showAlert('Guarde o busque el bien primero para poder agregar notas.', 'warning');
      return;
    }
    try {
      setLoadingAction(true);
      await createNotaBien(formState.id_bien, nuevaNota.trim());
      setNuevaNota('');
      await fetchNotas(formState.id_bien);
      showAlert('Nota agregada correctamente.', 'success');
    } catch (err) {
      showAlert('Error al agregar nota: ' + err.message, 'error');
    } finally {
      setLoadingAction(false);
    }
  };

  // Sync DB
  const syncDB = async () => {
    if (!searchSerial) return showAlert('Ingresa un número de serie para buscar en la BD.', 'warning');

    setLoadingAction(true);
    try {
      const query = `
        query {
          bienByTermino(termino: "${searchSerial}") {
            id_bien num_serie num_inv estatus_operativo clave_unidad_ref clave_modelo 
            id_usuario_resguardo id_segmento id_ubicacion fecha_adquisicion fecha_actualizacion
            usuarioResguardo {
              matricula
              nombre_completo
            }
            especificacionTI {
              nombre_host windows_serial cpu_info ram_gb almacenamiento_gb mac_address dir_ip puerto_red switch_red modelo_so
              last_scan
            }
            cuentasPC {
              id_cuenta cuenta_windows correo tipo_user
            }
            monitores {
              monitor {
                num_serie
                modelo {
                  descrip_disp
                  marca {
                    marca
                  }
                }
              }
            }
          }
        }
      `;
      const data = await queryGraphQL(query);
      if (data && data.bienByTermino) {
        const bien = data.bienByTermino;
        const esp = bien.especificacionTI || {};

        const mergedObj = {
          id_bien: bien.id_bien,
          num_serie: bien.num_serie || searchSerial,
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
          dir_ip_list: (esp.dir_ip || '').split('/').filter(Boolean).map(ip => ({ ip, adapter: 'BD' })),
          puerto_red: esp.puerto_red || '',
          switch_red: esp.switch_red || '',
          modelo_so: esp.modelo_so || '',
          cuentasList: (bien.cuentasPC || []).map(c => ({
            id_cuenta: c.id_cuenta,
            cuenta_windows: c.cuenta_windows || '',
            correo: c.correo || '',
            tipo_user: c.tipo_user || '',
            _editing: false
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
              num_serie: bm.monitor?.num_serie || '',
              marca: marca,
              modelo: cleanMod
            };
          })
        };

        setDbInfo(mergedObj);
        setLastSubmitted(null);
        fetchNotas(bien.id_bien);

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
        showAlert('Activo no encontrado en la BD. Rellene los campos para registrar uno nuevo.', 'info', 'No Encontrado');
        setDbInfo(null);
        setNotas([]);
        setFormState(prev => ({ ...prev, id_bien: undefined }));
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
      const isNew = !dbInfo || !dbInfo.id_bien;
      const userRole = getUserRole();

      // Helper: llama procesarMonitoresEquipo con confirm dialog si hay conflictos
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
          }
        }
      };

      // Roles Admin(1) y Maestro(2) → guardado directo sin solicitud
      if (userRole === 1 || userRole === 2) {
        // Si isNew pero el num_serie ya existe en BD, forzar update
        let effectiveIsNew = isNew;
        let effectiveDbInfo = dbInfo;
        if (isNew && formState.num_serie) {
          const chk = await queryGraphQL(`query { bienByNumSerie(num_serie: "${formState.num_serie}") { id_bien } }`);
          if (chk?.bienByNumSerie?.id_bien) {
            effectiveIsNew = false;
            effectiveDbInfo = { id_bien: chk.bienByNumSerie.id_bien };
          }
        }

        const dirIpString = (formState.dir_ip_list || []).map(x => (x.ip || '').trim()).filter(Boolean).join('/');
        const dataToSave = { ...formState, id_bien: effectiveDbInfo?.id_bien, dir_ip: dirIpString, especificacionTI: { ...formState, dir_ip: dirIpString } };
        const finalIdBien = await saveAsset(effectiveIsNew, dataToSave);
        const idBien = typeof finalIdBien === 'string' ? finalIdBien : effectiveDbInfo?.id_bien;

        // Procesar monitores WMI
        const monitores = formState.monitores || [];
        if (monitores.length > 0 && idBien) {
          await _procesarMonitoresFrontend(idBien, monitores, false);
        }

        await showAlert('El activo y sus componentes han sido guardados exitosamente.', 'success', 'Guardado Exitoso');
        setSearchSerial(formState.num_serie);
        await syncDB();
      } else {

        // Roles 2, 3, 4 → solicitud de cambio
        const datosNuevos = {};

        if (isNew) {
          // Creación: enviar todos los campos con valor
          Object.keys(formState).forEach(key => {
            if (['correos_usuario', 'tipo_equipo', 'nombre_usuario_resguardo'].includes(key)) return;
            if (formState[key] !== '' && formState[key] !== undefined && formState[key] !== null) {
              datosNuevos[key] = formState[key];
            }
          });
          datosNuevos._esCreacion = true;
        } else {
          // Actualización: solo campos que cambiaron vs dbInfo
          Object.keys(formState).forEach(key => {
            if (['id_bien', 'correos_usuario', 'tipo_equipo', 'nombre_usuario_resguardo'].includes(key)) return;
            const current = String(formState[key] ?? '');
            const original = String(dbInfo[key] ?? '');
            if (current !== original) {
              datosNuevos[key] = formState[key];
            }
          });
          // Incluir monitores en actualización solo si realmente cambiaron
          if (monitorsChanged) {
            datosNuevos.monitores = formState.monitores;
          }
        }

        if (datosNuevos.dir_ip_list) {
            datosNuevos.dir_ip = (formState.dir_ip_list || []).map(x => (x.ip || '').trim()).filter(Boolean).join('/');
            delete datosNuevos.dir_ip_list;
        }

        if (Object.keys(datosNuevos).filter(k => k !== '_esCreacion').length === 0) {
          await showAlert('No se detectaron cambios en el formulario para enviar a revisión.', 'info', 'Sin Cambios');
          return;
        }

        const idBien = isNew ? crypto.randomUUID() : dbInfo.id_bien;
        await solicitarActualizacionBien(idBien, JSON.stringify(datosNuevos));
        setLastSubmitted(JSON.stringify(datosNuevos));
        await showAlert('Tus cambios han sido enviados a revisión y están pendientes de aprobación por parte de un administrador.', 'success', 'Enviado a revisión');
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

  const monitorsChanged = (() => {
    const dbMons = dbInfo?.monitores || [];
    const formMons = formState.monitores || [];
    if (dbMons.length !== formMons.length) return true;
    return formMons.some((fm, idx) => {
      const dbm = dbMons[idx];
      if (!dbm) return true;
      return fm.num_serie !== dbm.num_serie ||
        fm.marca !== dbm.marca ||
        fm.modelo !== dbm.modelo;
    });
  })();

  const hasDbChanges = Object.keys(currentDatosNuevos).filter(k => k !== '_esCreacion').length > 0;
  const hasPendingChanges = lastSubmitted !== JSON.stringify(currentDatosNuevos);
  const canSave = (hasDbChanges || monitorsChanged) && hasPendingChanges;

  return (
    <div className="h-screen bg-[#F5F5F5] text-[#333333] flex flex-col overflow-hidden">
      {/* Unified TitleBar/Navbar for Electron Window Control Overlay */}
      <header
        className="bg-[#006241] h-11 w-full flex items-center justify-between px-6 select-none text-white shadow-md z-20"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <div className="flex items-center gap-4">
          <img src="IMSS_Logosímbolo_Blanco.png" alt="IMSS" className="h-5 w-5 object-contain" />
          <span className="text-xs font-semibold tracking-wide">Gestor de Activos — IMSS</span>
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

          {/* Cuentas PC (Tarjetas) */}
          {formState.cuentasList && formState.cuentasList.length > 0 && (
            <div className="space-y-2">
              {formState.cuentasList.map((c, i) => {
                const isExpanded = selectedCuentaIdx === i;
                return (
                  <div key={i} className="border border-[#E0E0E0] rounded-xl overflow-hidden bg-[#F9FAFB] shadow-sm">
                    <button 
                      onClick={() => setSelectedCuentaIdx(isExpanded ? -1 : i)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center justify-between"
                    >
                      <div className="overflow-hidden">
                        <span className="text-[#006241] font-bold block uppercase text-[9px] leading-tight">Cuenta de Usuario PC {i > 0 ? i+1 : ''}</span>
                        <span className="text-[#333333] font-bold block truncate text-xs mt-0.5">{c.cuenta_windows || '—'}</span>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-[#757575] flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-[#757575] flex-shrink-0" />}
                    </button>
                    {isExpanded && (
                      <div className="p-3 bg-white border-t border-[#E0E0E0] space-y-2.5">
                        <div>
                          <span className="text-[#757575] font-semibold block uppercase text-[9px] leading-tight">Tipo Usuario</span>
                          <span className="text-[#333333] font-medium block truncate text-[11px] mt-0.5" title={c.tipo_user}>{c.tipo_user || '—'}</span>
                        </div>
                        {c.correo && (
                          <div>
                            <span className="text-[#757575] font-semibold block uppercase text-[9px] leading-tight">Correo</span>
                            <span className="text-[#333333] font-medium block text-[11px] mt-0.5 break-all" title={c.correo}>{c.correo}</span>
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

          <button onClick={handleSave} disabled={loadingAction || !canSave} className="bg-white border-2 border-[#006241] text-[#006241] hover:bg-[#F9FAFB] py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-colors disabled:opacity-50 shadow-sm">
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
                      onChange={v => updateForm('id_segmento', v)} 
                      disabled={!formState.clave_unidad_ref}
                      placeholder={formState.clave_unidad_ref ? "Buscar segmento..." : "Seleccione unidad primero"}
                    />
                  </div>

                  <div className="w-full sm:col-span-2">
                    <SearchableSelect label="Ubicación Específica" options={catUbicaciones} value={formState.id_ubicacion} onChange={v => updateForm('id_ubicacion', v)} disabled={!formState.clave_unidad_ref} placeholder={formState.clave_unidad_ref ? "Buscar ubicación..." : "Seleccione unidad primero"} />
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

                  <div className="sm:col-span-2">
                    <FieldInput label="Procesador (CPU)" val={formState.cpu_info} onChange={v => updateForm('cpu_info', v)} color={getBorderColor('cpu_info')} readOnly={true} />
                  </div>

                  <FieldInput label="Memoria RAM (GB)" val={formState.ram_gb} onChange={v => updateForm('ram_gb', v)} color={getBorderColor('ram_gb')} type="number" readOnly={true} />
                  <FieldInput label="Almacenamiento (GB)" val={formState.almacenamiento_gb} onChange={v => updateForm('almacenamiento_gb', v)} color={getBorderColor('almacenamiento_gb')} type="number" readOnly={true} />
                  
                  <div className="w-full flex flex-col">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#757575] uppercase tracking-wider block">
                        Dirección IPv4
                      </label>
                      {((formState.dir_ip_list?.length > 0) ? formState.dir_ip_list : [{ ip: '' }]).length < 3 && (
                        <button
                          type="button"
                          onClick={() => {
                            const arr = ((formState.dir_ip_list?.length > 0) ? formState.dir_ip_list : [{ ip: '' }]);
                            updateForm('dir_ip_list', [...arr, { ip: '' }]);
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
                      {((formState.dir_ip_list?.length > 0) ? formState.dir_ip_list : [{ ip: '' }]).map((item, idx, arr) => (
                        <div key={idx} className="flex items-center gap-2 w-full">
                          <input
                            type="text"
                            list="wmi-adapters-list"
                            value={item.ip}
                            onChange={(e) => {
                              const newList = [...((formState.dir_ip_list?.length > 0) ? formState.dir_ip_list : [{ ip: '' }])];
                              newList[idx].ip = e.target.value;
                              updateForm('dir_ip_list', newList);
                            }}
                            className={clsx("flex-1 min-w-0 bg-white text-[#333333] rounded-xl py-2 px-3 border shadow-sm focus:outline-none focus:ring-1 focus:ring-[#006241]", getBorderColor('dir_ip'))}
                            placeholder="Ej. 192.168.1.5"
                          />
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
                  
                  <FieldInput label="Dirección MAC" val={formState.mac_address} onChange={v => updateForm('mac_address', v)} color={getBorderColor('mac_address')} readOnly={true} />
                  <FieldInput label="Puerto / Nodo Red" val={formState.puerto_red} onChange={v => updateForm('puerto_red', v)} color={getBorderColor('puerto_red')} />
                  <FieldInput label="Switch Conectado" val={formState.switch_red} onChange={v => updateForm('switch_red', v)} color={getBorderColor('switch_red')} />

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
                  <h2 className="text-lg font-bold flex items-center gap-2 text-[#333333] mb-4">
                    <MessageSquare className="w-5 h-5 text-[#006241]" /> Notas de Seguimiento
                  </h2>
                  
                  {/* Formulario para nueva nota */}
                  <div className="flex flex-col sm:flex-row gap-3 mb-5">
                    <input
                      type="text"
                      value={nuevaNota}
                      onChange={e => setNuevaNota(e.target.value)}
                      placeholder="Escribe una nueva nota sobre este bien..."
                      className="flex-1 bg-white text-[#333333] rounded-xl py-2 px-3 border border-[#E0E0E0] shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-600 text-sm"
                      onKeyDown={e => e.key === 'Enter' && handleAddNota()}
                    />
                    <button
                      onClick={handleAddNota}
                      disabled={loadingAction || !nuevaNota.trim()}
                      className="bg-[#006241] hover:bg-[#008F59] text-white font-bold py-2.5 px-5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm shadow-sm"
                    >
                      <Plus className="w-4 h-4" /> Agregar Nota
                    </button>
                  </div>

                  {/* Lista de notas */}
                  {loadingNotas ? (
                    <div className="text-center py-4 text-sm text-gray-500 animate-pulse">Cargando notas...</div>
                  ) : notas.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-500 italic bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      No hay notas registradas para este bien.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                      {notas.map(nota => (
                        <div key={nota.id_nota} className="bg-gray-50 border border-gray-200 p-3 rounded-xl flex flex-col gap-1.5 hover:bg-gray-100/50 transition-colors">
                          <div className="flex justify-between items-center text-[10px] text-gray-500 font-semibold">
                            <span className="text-[#006241]">{nota.usuarioAutor ? `${nota.usuarioAutor.matricula} - ${nota.usuarioAutor.nombre_completo}` : 'Usuario desconocido'}</span>
                            <span>{new Date(isNaN(Number(nota.fecha_creacion)) ? nota.fecha_creacion : Number(nota.fecha_creacion)).toLocaleString()}</span>
                          </div>
                          <p className="text-xs text-gray-800 whitespace-pre-line font-medium">{nota.contenido_nota}</p>
                        </div>
                      ))}
                    </div>
                  )}
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
