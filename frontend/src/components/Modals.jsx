import { useState } from 'react';
import { X, Loader2, Save, IdCard, User, Mail, Building2, ShieldAlert } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { createUbicacion, createModelo, createMarca, createUsuario } from '../services/graphqlClient';

function ModalWrapper({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col" style={{boxShadow: '0 25px 60px rgba(0,0,0,0.3)'}}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F0F0]">
          <div>
            <h2 className="text-lg font-bold text-[#1a1a1a] tracking-tight">{title}</h2>
            <p className="text-xs text-[#9e9e9e] mt-0.5">Completa todos los campos requeridos</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-[#9e9e9e] hover:bg-[#F5F5F5] hover:text-[#333] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export function ModalUbicacion({ unidadId, unidadNombre, onClose, onSuccess }) {
  const [nombre, setNombre] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!nombre.trim()) return alert('Ingrese un nombre');
    setLoading(true);
    try {
      const res = await createUbicacion(unidadId, nombre.trim());
      onSuccess(res?.createUbicacion);
    } catch (err) {
      alert('Error creando ubicación: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper title="Nueva Ubicación" onClose={onClose}>
      <p className="text-sm text-[#757575] mb-4">
        Esta ubicación será ligada a la unidad: <strong className="text-[#333333]">{unidadNombre}</strong>
      </p>
      
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-[#757575] uppercase tracking-wider block mb-1">Nombre Ubicación</label>
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            className="w-full bg-[#FFFFFF] border border-[#E0E0E0] text-[#333333] rounded-xl py-3 px-4 focus:outline-none focus:border-[#006241]"
            placeholder="Ej. Planta Baja - Servidores"
          />
        </div>
        
        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full bg-[#006241] hover:bg-[#008F59] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Guardar Ubicación
        </button>
      </div>
    </ModalWrapper>
  );
}

export function ModalModeloMarca({ marcas, tiposDispositivo, onClose, onSuccess }) {
  const [isNewMarca, setIsNewMarca] = useState(false);
  const [marcaId, setMarcaId] = useState('');
  const [nuevaMarcaNombre, setNuevaMarcaNombre] = useState('');
  
  const [claveModelo, setClaveModelo] = useState('');
  const [descripModelo, setDescripModelo] = useState('');
  const [loading, setLoading] = useState(false);

  const pcTipo = tiposDispositivo.find(t => t.label.toUpperCase().includes('PC') || t.label.toUpperCase().includes('COMPUTADORA'));
  const tipoId = pcTipo ? pcTipo.value : (tiposDispositivo[0]?.value || '1');

  const handleSave = async () => {
    if (!claveModelo.trim() || !descripModelo.trim()) return alert('Clave y Descripción del modelo son obligatorios');
    if (!isNewMarca && !marcaId) return alert('Seleccione una marca o cree una nueva');
    if (isNewMarca && !nuevaMarcaNombre.trim()) return alert('Ingrese el nombre de la nueva marca');

    setLoading(true);
    try {
      let finalMarcaId = marcaId;
      
      if (isNewMarca) {
        const resMarca = await createMarca(nuevaMarcaNombre.trim());
        finalMarcaId = resMarca?.createMarca?.clave_marca;
      }

      const resModelo = await createModelo(claveModelo.trim(), descripModelo.trim(), finalMarcaId, tipoId);
      onSuccess(resModelo?.createCatModelo, isNewMarca ? finalMarcaId : null);
    } catch (err) {
      alert('Error guardando modelo/marca: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper title="Añadir Modelo / Marca" onClose={onClose}>
      <div className="space-y-4">
        
        {/* Marca Section */}
        <div className="bg-[#F9FAFB] p-4 rounded-xl border border-[#E0E0E0] space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[#757575] uppercase tracking-wider block">Marca</label>
            <button 
              onClick={() => setIsNewMarca(!isNewMarca)}
              className="text-xs text-[#006241] hover:text-[#008F59] font-bold"
            >
              {isNewMarca ? "Seleccionar Existente" : "+ Nueva Marca"}
            </button>
          </div>
          
          {isNewMarca ? (
            <input
              type="text"
              value={nuevaMarcaNombre}
              onChange={e => setNuevaMarcaNombre(e.target.value)}
              className="w-full bg-white border border-[#E0E0E0] text-[#333333] rounded-lg py-2 px-3 focus:outline-none focus:border-[#006241]"
              placeholder="Nombre de nueva marca (ej. Dell)"
            />
          ) : (
            <SearchableSelect
              options={marcas}
              value={marcaId}
              onChange={setMarcaId}
              placeholder="Buscar marca..."
            />
          )}
        </div>

        {/* Modelo Section */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[#757575] uppercase tracking-wider block mb-1">Clave Modelo</label>
            <input
              type="text"
              value={claveModelo}
              onChange={e => setClaveModelo(e.target.value)}
              className="w-full bg-white border border-[#E0E0E0] text-[#333333] rounded-xl py-2 px-3 focus:outline-none focus:border-[#006241]"
              placeholder="Ej. OPTIPLEX-7090"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#757575] uppercase tracking-wider block mb-1">Descripción / Nombre Comercial</label>
            <input
              type="text"
              value={descripModelo}
              onChange={e => setDescripModelo(e.target.value)}
              className="w-full bg-white border border-[#E0E0E0] text-[#333333] rounded-xl py-2 px-3 focus:outline-none focus:border-[#006241]"
              placeholder="Ej. Dell Optiplex 7090 Tower"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full bg-[#006241] hover:bg-[#008F59] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all mt-4 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Guardar Modelo y Marca
        </button>
      </div>
    </ModalWrapper>
  );
}

export function ModalUsuario({ onClose, onSuccess, unidadesFisicas = [] }) {
  const [matricula, setMatricula] = useState('');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [claveUnidad, setClaveUnidad] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!matricula.trim()) return alert('La matrícula es obligatoria');
    if (!nombre.trim()) return alert('El nombre completo es obligatorio');
    if (!claveUnidad) return alert('La Unidad Física es obligatoria');
    setLoading(true);
    try {
      const res = await createUsuario(
        matricula.trim().toUpperCase(),
        nombre.trim(),
        correo.trim() || null,
        claveUnidad || null
      );
      onSuccess(res);
    } catch (err) {
      alert('Error creando usuario: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper title="Nuevo Usuario" onClose={onClose}>
      <div className="space-y-6">
        
        {/* Banner Informativo */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Rol por defecto: SIN ACCESO</p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
              El usuario se creará en el sistema solo para fines de resguardo. No tendrá credenciales ni acceso a la plataforma web.
            </p>
          </div>
        </div>

        {/* Formulario Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-1">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#757575] uppercase tracking-wider mb-1.5">
              <IdCard className="w-3.5 h-3.5" /> Matrícula *
            </label>
            <input
              type="text"
              value={matricula}
              onChange={e => setMatricula(e.target.value)}
              className="w-full bg-[#FAFAFA] border border-[#E0E0E0] text-[#333333] rounded-xl py-2.5 px-3.5 focus:outline-none focus:border-[#006241] focus:ring-1 focus:ring-[#006241] focus:bg-white uppercase transition-all"
              placeholder="Ej. 99012345"
              maxLength={20}
            />
          </div>

          <div className="sm:col-span-1">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#757575] uppercase tracking-wider mb-1.5">
              <User className="w-3.5 h-3.5" /> Nombre Completo *
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              className="w-full bg-[#FAFAFA] border border-[#E0E0E0] text-[#333333] rounded-xl py-2.5 px-3.5 focus:outline-none focus:border-[#006241] focus:ring-1 focus:ring-[#006241] focus:bg-white transition-all"
              placeholder="Ej. Juan Pérez"
              maxLength={150}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#757575] uppercase tracking-wider mb-1.5">
              <Building2 className="w-3.5 h-3.5" /> Unidad Física *
            </label>
            <SearchableSelect
              options={[
                { value: '', label: '— Selecciona una unidad —' },
                ...unidadesFisicas.map(u => ({ value: u.value, label: u.label }))
              ]}
              value={claveUnidad}
              onChange={val => setClaveUnidad(val || '')}
              placeholder="Buscar clínica, hospital o delegación..."
            />
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#757575] uppercase tracking-wider mb-1.5">
              <Mail className="w-3.5 h-3.5" /> Correo Electrónico <span className="text-[10px] text-gray-400 normal-case ml-1">(Opcional)</span>
            </label>
            <input
              type="email"
              value={correo}
              onChange={e => setCorreo(e.target.value)}
              className="w-full bg-[#FAFAFA] border border-[#E0E0E0] text-[#333333] rounded-xl py-2.5 px-3.5 focus:outline-none focus:border-[#006241] focus:ring-1 focus:ring-[#006241] focus:bg-white transition-all"
              placeholder="Ej. juan.perez@imss.gob.mx"
              maxLength={100}
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full bg-[#006241] hover:bg-[#008F59] text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-md hover:shadow-lg mt-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Crear Usuario de Resguardo
        </button>
      </div>
    </ModalWrapper>
  );
}
