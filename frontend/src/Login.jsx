import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from './services/graphqlClient';
import { UserCircle, KeyRound, Loader2, Eye, EyeOff, RefreshCw } from 'lucide-react';
import pkg from '../package.json';

const isElectron = typeof window !== 'undefined' && !!window.process?.versions?.electron;

export default function Login() {
  const [matricula, setMatricula] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const navigate = useNavigate();

  // Rate-limit: máx 3 clics en 60s
  const clickTimes = useRef([]);
  const blockedUntil = useRef(0);

  useEffect(() => {
    if (!isElectron) return;
    const { ipcRenderer } = window.require('electron');
    
    const onAvailable = () => {
      setUpdateMsg('¡Actualización encontrada!');
      setUpdateAvailable(true);
    };
    const onCountdown = (_, seconds) => setUpdateMsg(`Instalando en ${seconds}s...`);
    const onNotAvailable = () => {
      setUpdateMsg('Ya cuentas con la versión más reciente.');
      setTimeout(() => setUpdateMsg(''), 4000);
    };
    const onError = () => {
      setUpdateMsg('Error al buscar actualizaciones.');
      setTimeout(() => setUpdateMsg(''), 4000);
    };

    ipcRenderer.on('update-available', onAvailable);
    ipcRenderer.on('update-countdown', onCountdown);
    ipcRenderer.on('update-not-available', onNotAvailable);
    ipcRenderer.on('update-error', onError);

    return () => {
      ipcRenderer.removeListener('update-available', onAvailable);
      ipcRenderer.removeListener('update-countdown', onCountdown);
      ipcRenderer.removeListener('update-not-available', onNotAvailable);
      ipcRenderer.removeListener('update-error', onError);
    };
  }, []);

  const handleCheckUpdate = () => {
    if (!isElectron) return;
    const now = Date.now();

    // Si está bloqueado
    if (now < blockedUntil.current) {
      const restSecs = Math.ceil((blockedUntil.current - now) / 1000);
      setUpdateMsg(`Espera ${restSecs}s antes de volver a intentar.`);
      return;
    }

    // Limpiar clicks viejos (> 60s)
    clickTimes.current = clickTimes.current.filter(t => now - t < 60000);
    clickTimes.current.push(now);

    if (clickTimes.current.length > 3) {
      blockedUntil.current = now + 5 * 60000; // bloquear 5 min
      clickTimes.current = [];
      setUpdateMsg('Demasiados intentos. Bloqueado por 5 min.');
      return;
    }

    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('checar-actualizaciones');
      setUpdateMsg('Buscando actualización...');
      // Ya no lo borramos con timeout, esperamos los eventos
    } catch (e) {
      setUpdateMsg('No disponible en este entorno.');
      setTimeout(() => setUpdateMsg(''), 3000);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const success = await login(matricula, password);
      if (success) {
        navigate('/dashboard');
      } else {
        setError('Credenciales incorrectas');
      }
    } catch (err) {
      setError('Error de conexión o credenciales inválidas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#006241] relative overflow-hidden">
      {/* Custom TitleBar for Electron Window Control Overlay */}
      <div
        className="bg-[#006241] h-11 w-full flex items-center px-4 select-none text-white text-xs font-semibold z-20"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <img src="IMSS_Logosímbolo_Blanco.png" alt="IMSS" className="h-5 w-5 object-contain mr-2" />
        <span>Gestor de Activos — IMSS</span>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative">


        <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl relative z-10">
          <div className="flex flex-col items-center mb-10">
            <img src="imssFavicon.png" alt="IMSS Logo" className="w-20 h-20 object-contain mb-4" />
            <h1 className="text-3xl font-bold text-[#333333] tracking-tight">Gestor de Activos</h1>
            <p className="text-[#757575] mt-2 text-sm uppercase tracking-widest font-medium">Hardware &amp; Red — IMSS</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#757575] uppercase tracking-wider ml-1">Matrícula</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <UserCircle className="h-5 w-5 text-[#757575]" />
                </div>
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

            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#757575] uppercase tracking-wider ml-1">Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <KeyRound className="h-5 w-5 text-[#757575]" />
                </div>
                <input
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
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm text-center font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#006241] hover:bg-[#008F59] text-white font-bold py-4 px-4 rounded-xl transition-all flex items-center justify-center shadow-lg shadow-[#006241]/20 hover:shadow-[#006241]/40 active:scale-[0.98]"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'INICIAR SESIÓN'}
            </button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-2">
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
            {isElectron && updateAvailable && (
              <button
                type="button"
                onClick={() => {
                  setUpdateAvailable(false);
                  setUpdateMsg('Descargando...');
                  window.require('electron').ipcRenderer.send('descargar-actualizacion');
                }}
                className="flex items-center gap-1.5 text-xs text-white bg-[#006241] hover:bg-[#008F59] px-3 py-1.5 rounded-full font-medium transition-colors shadow-sm"
              >
                Descargar e Instalar
              </button>
            )}
            {updateMsg && (
              <p className="text-xs text-[#757575] font-medium animate-pulse">{updateMsg}</p>
            )}
            <p className="text-xs text-[#9e9e9e] font-medium">v{pkg.version} — IMSS</p>
          </div>
        </div>
      </div>
    </div>
  );
}

