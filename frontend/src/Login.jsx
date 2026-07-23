// Importamos hooks esenciales de React para manejar estado, referencias mutables y ciclo de vida.
import { useState, useRef, useEffect } from 'react';
// Importamos hook para navegar entre rutas en React Router (SPA).
import { useNavigate } from 'react-router-dom';
// Importamos función de servicio para autenticar vía GraphQL.
import { login } from './services/graphqlClient';
// Importamos iconos vectoriales ligeros de lucide-react.
import { UserCircle, KeyRound, Loader2, Eye, EyeOff, RefreshCw } from 'lucide-react';
// Importamos el package.json para leer y mostrar dinámicamente la versión del frontend.
import pkg from '../package.json';

// Detecta si la app está corriendo dentro del contenedor de Electron (app de escritorio)
// o simplemente en un navegador web normal. Útil para habilitar funciones nativas (ej. actualizaciones).
const isElectron = typeof window !== 'undefined' && !!window.process?.versions?.electron;

export default function Login() {
  // Estados principales del formulario
  const [matricula, setMatricula] = useState(''); // Guarda la matrícula (usuario)
  const [password, setPassword] = useState(''); // Guarda la contraseña
  const [showPassword, setShowPassword] = useState(false); // Alterna la visibilidad del input de contraseña
  
  // Estados para UX (Experiencia de Usuario)
  const [error, setError] = useState(''); // Guarda y muestra errores de login o de red
  const [loading, setLoading] = useState(false); // Muestra spinner en el botón mientras hace la petición HTTP
  
  // Estados para el sistema de actualizaciones OTA (Over-The-Air) de Electron Updater
  const [updateMsg, setUpdateMsg] = useState(''); // Mensajes informativos sobre el proceso de descarga
  const [updateAvailable, setUpdateAvailable] = useState(false); // Bandera para mostrar botón de descarga
  const [updateDownloaded, setUpdateDownloaded] = useState(false); // Bandera que bloquea el login si hay un parche crítico listo
  
  // Hook de react-router para redireccionar a /dashboard al loguearse con éxito
  const navigate = useNavigate();

  // Rate-limit local (Anti-Spam de clics)
  // useRef no causa re-renders, por lo que es perfecto para guardar contadores silenciosos.
  const clickTimes = useRef([]); // Arreglo que guarda los timestamps de los clics en "Buscar actualización"
  const blockedUntil = useRef(0); // Timestamp hasta el cual el botón de actualizar estará bloqueado

  // useEffect se ejecuta una vez al montar el componente (gracias al array vacío [])
  // Su propósito es registrar los 'listeners' de eventos IPC (Inter-Process Communication) con Electron.
  useEffect(() => {
    // Si estamos en web normal, no hay IPC, salimos temprano.
    if (!isElectron) return;
    
    // Extrae la librería nativa para comunicarse con el proceso principal (Main Process) de NodeJS
    const { ipcRenderer } = window.require('electron');
    
    // Callbacks para los distintos eventos que puede emitir el auto-updater de Electron
    const onAvailable = () => {
      setUpdateMsg('¡Actualización requerida! Descargando...');
      setUpdateAvailable(true); // Muestra el botón de "Descargar e Instalar"
    };
    
    const onDownloaded = () => {
      setUpdateMsg('Actualización lista. Instala para continuar.');
      setUpdateDownloaded(true); // Bloquea el uso de la app hasta que reinicien e instalen
    };
    
    // Muestra una cuenta regresiva si la app se va a auto-cerrar
    const onCountdown = (_, seconds) => setUpdateMsg(`Instalando en ${seconds}s...`);
    
    const onNotAvailable = () => {
      setUpdateMsg('Ya cuentas con la versión más reciente.');
      // Oculta el mensaje después de 4 segundos
      setTimeout(() => setUpdateMsg(''), 4000);
    };
    
    const onError = () => {
      setUpdateMsg('Error al buscar actualizaciones.');
      setTimeout(() => setUpdateMsg(''), 4000);
    };

    // Suscribe los callbacks a los eventos de IPC
    ipcRenderer.on('update-available', onAvailable);
    ipcRenderer.on('update-downloaded', onDownloaded);
    ipcRenderer.on('update-countdown', onCountdown);
    ipcRenderer.on('update-not-available', onNotAvailable);
    ipcRenderer.on('update-error', onError);

    // Función de limpieza (Cleanup): Se ejecuta cuando el componente Login se desmonta.
    // Evita fugas de memoria y listeners duplicados.
    return () => {
      ipcRenderer.removeListener('update-available', onAvailable);
      ipcRenderer.removeListener('update-downloaded', onDownloaded);
      ipcRenderer.removeListener('update-countdown', onCountdown);
      ipcRenderer.removeListener('update-not-available', onNotAvailable);
      ipcRenderer.removeListener('update-error', onError);
    };
  }, []);

  // Función manejadora para cuando el usuario hace clic en "Buscar actualización"
  const handleCheckUpdate = async () => {
    if (!isElectron) return;
    const now = Date.now();

    // 1. Revisa si estamos en periodo de penalización (cooldown)
    if (now < blockedUntil.current) {
      const restSecs = Math.ceil((blockedUntil.current - now) / 1000);
      setUpdateMsg(`Espera ${restSecs}s antes de volver a intentar.`);
      return;
    }

    // 2. Limpia clics viejos (mayores a 60 segundos)
    clickTimes.current = clickTimes.current.filter(t => now - t < 60000);
    // Registra el clic actual
    clickTimes.current.push(now);

    // 3. Aplica la regla: Máximo 3 clics por minuto. Si la rompe, penaliza 5 minutos.
    if (clickTimes.current.length > 3) {
      blockedUntil.current = now + 5 * 60000;
      clickTimes.current = []; // Resetea el historial de clics
      setUpdateMsg('Demasiados intentos. Bloqueado por 5 min.');
      return;
    }

    // Pide al Main Process de Electron que consulte el servidor de releases de GitHub
    setUpdateMsg('Buscando actualizaciones...');
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('checar-actualizaciones');
  };

  // Función asíncrona que maneja el envío del formulario (Submit)
  const handleLogin = async (e) => {
    e.preventDefault(); // Evita que la página se recargue (comportamiento default de HTML)
    
    // Bloqueo duro: Si hay una actualización bajada, el usuario no puede loguearse
    // porque el backend podría requerir la nueva versión por cambios en la BD.
    if (updateDownloaded) {
      setError('Hay una actualización lista. Instálala antes de continuar.');
      return;
    }
    setError(''); // Limpia errores anteriores
    
    let equipoInfo = null;
    // Controlador de aborto para no quedarse colgado esperando al servicio de Windows WMI
    const ctrl = new AbortController();
    // Timeout máximo de 3 segundos para el escaneo de hardware
    const wmiTimeout = setTimeout(() => ctrl.abort(), 3000);
    
    try {
      // Hace una petición GET al localhost (al servicio C# de Windows corriendo de fondo)
      // para extraer el número de serie de la computadora física donde está instalada la app.
      const wmiRes = await fetch('http://localhost:6060/api/hw-info', { signal: ctrl.signal });
      if (wmiRes.ok) {
        const data = await wmiRes.json();
        if (data.num_serie) equipoInfo = data.num_serie;
      }
    } catch (e) {
      // Si el servicio de Windows está caído o tardó más de 3 segundos, ignoramos silenciosamente
      // y procedemos a hacer el login con equipoInfo en null.
    } finally {
      // Cancela el temporizador para no dejar fugas de memoria
      clearTimeout(wmiTimeout);
    }

    setLoading(true); // Activa el spinner visual en el botón

    try {
      // Llama al servicio GraphQL pasando credenciales y número de serie (si se obtuvo)
      const success = await login(matricula, password, equipoInfo);
      if (success) {
        // Login exitoso: Redirige a la pantalla principal del Dashboard
        navigate('/dashboard');
      } else {
        setError('Credenciales incorrectas');
      }
    } catch (err) {
      setError('Error de conexión o credenciales inválidas');
    } finally {
      setLoading(false); // Apaga el spinner sea éxito o fracaso
    }
  };

  // -------------------------------------------------------------------------
  // RENDER JSX (Vista UI)
  // -------------------------------------------------------------------------
  return (
    // Contenedor principal a pantalla completa con el color verde institucional del IMSS
    <div className="min-h-screen flex flex-col bg-[#006241] relative overflow-hidden">
      
      {/* 
        Custom TitleBar para la ventana sin bordes (frameless) de Electron.
        'WebkitAppRegion: drag' permite que esta barra verde sirva para mover la ventana 
        arrastrándola con el mouse. 
      */}
      <div
        className="bg-[#006241] h-11 w-full flex items-center px-4 select-none text-white text-xs font-semibold z-20"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <img src="IMSS_Logosímbolo_Blanco.png" alt="IMSS" className="h-5 w-5 object-contain mr-2" />
        <span>SGHI</span>
      </div>

      {/* Contenedor centralizado para la tarjeta blanca del formulario */}
      <div className="flex-1 flex items-center justify-center p-4 relative">
        
        {/* Tarjeta (Card) con sombra y bordes redondeados */}
        <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl relative z-10">
          
          {/* Cabecera (Logo IMSS y Títulos) */}
          <div className="flex flex-col items-center mb-10">
            <img src="imssFavicon.png" alt="IMSS Logo" className="w-20 h-20 object-contain mb-4" />
            <h1 className="text-3xl font-bold text-[#333333] tracking-tight">SGHI</h1>
            <p className="text-[#757575] mt-2 text-sm uppercase tracking-widest font-medium">Hardware &amp; Red — IMSS</p>
          </div>

          {/* Formulario HTML gestionado por React */}
          <form onSubmit={handleLogin} className="space-y-6">
            
            {/* Input: Matrícula */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#757575] uppercase tracking-wider ml-1">Matrícula</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <UserCircle className="h-5 w-5 text-[#757575]" />
                </div>
                {/* Input controlado por estado (matricula) */}
                <input
                  type="text"
                  value={matricula}
                  onChange={(e) => setMatricula(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-[#E0E0E0] text-[#333333] rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-[#006241] focus:border-transparent transition-all shadow-sm"
                  placeholder="Ej. 12345678"
                  required
                />
              </div>
            </div>

            {/* Input: Contraseña con botón Ojo mágico */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#757575] uppercase tracking-wider ml-1">Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <KeyRound className="h-5 w-5 text-[#757575]" />
                </div>
                <input
                  // Cambia dinámicamente entre texto plano o viñetas según 'showPassword'
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-[#E0E0E0] text-[#333333] rounded-xl py-3 pl-12 pr-12 focus:outline-none focus:ring-2 focus:ring-[#006241] focus:border-transparent transition-all shadow-sm"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-[#757575] hover:text-[#333333] focus:outline-none"
                >
                  {/* Ícono dinámico del Ojo abierto/cerrado */}
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Caja de alerta roja si existe un error guardado en el estado */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm text-center font-medium">
                {error}
              </div>
            )}

            {/* Botón Principal Submit */}
            <button
              type="submit"
              disabled={loading || updateAvailable}
              className="w-full bg-[#006241] hover:bg-[#008F59] text-white font-bold py-4 px-4 rounded-xl transition-all flex items-center justify-center shadow-lg shadow-[#006241]/20 hover:shadow-[#006241]/40 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {/* Si 'loading' es true, renderiza un SVG que gira. Si no, dice 'INICIAR SESIÓN' */}
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'INICIAR SESIÓN'}
            </button>
          </form>

          {/* Footer de la tarjeta con opciones de actualización y versión */}
          <div className="mt-6 flex flex-col items-center gap-2">
            
            {/* Si es app nativa (Electron) y NO hay update bajándose, mostrar botón para checar manual */}
            {isElectron && !updateAvailable && (
              <button
                type="button"
                onClick={handleCheckUpdate}
                className="flex items-center gap-1.5 text-xs text-[#006241] hover:text-[#008F59] font-medium transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Buscar actualización
              </button>
            )}
            
            {/* Si SÍ hay update lista en los servidores, mostrar botón verde intenso para forzar descarga */}
            {isElectron && updateAvailable && (
              <button
                type="button"
                onClick={() => {
                  setUpdateAvailable(false);
                  setUpdateMsg('Descargando...');
                  // Dispara el evento al backend de NodeJS para comenzar la bajada
                  window.require('electron').ipcRenderer.send('descargar-actualizacion');
                }}
                className="flex items-center gap-1.5 text-xs text-white bg-[#006241] hover:bg-[#008F59] px-3 py-1.5 rounded-full font-medium transition-colors shadow-sm"
              >
                Descargar e Instalar
              </button>
            )}
            
            {/* Si hay un mensaje temporal del updater, mostrarlo parpadeando (animate-pulse) */}
            {updateMsg && (
              <p className="text-xs text-[#757575] font-medium animate-pulse">{updateMsg}</p>
            )}
            
            {/* Lee del package.json la versión del programa automáticamente */}
            <p className="text-xs text-[#9e9e9e] font-medium">v{pkg.version} — IMSS</p>
          </div>
        </div>
      </div>
    </div>
  );
}
