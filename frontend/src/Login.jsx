import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from './services/graphqlClient';
import { UserCircle, KeyRound, Loader2, MonitorSmartphone, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [matricula, setMatricula] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
        <img src="/IMSS_Logosímbolo_Blanco.png" alt="IMSS" className="h-5 w-5 object-contain mr-2" />
        <span>Gestor de Activos — IMSS</span>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative">


        <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl relative z-10">
          <div className="flex flex-col items-center mb-10">
            <img src="/imssFavicon.png" alt="IMSS Logo" className="w-20 h-20 object-contain mb-4" />
            <h1 className="text-3xl font-bold text-[#333333] tracking-tight">Gestor de Activos</h1>
            <p className="text-[#757575] mt-2 text-sm uppercase tracking-widest font-medium">Hardware & Red — IMSS</p>
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

          <p className="text-center mt-8 text-xs text-[#9e9e9e] font-medium">v2.0 — IMSS</p>
        </div>
      </div>
    </div>
  );
}
