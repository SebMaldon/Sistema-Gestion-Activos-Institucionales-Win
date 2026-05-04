import React, { useState } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { createUbicacion, createModelo, createMarca } from '../services/graphqlClient';

function ModalWrapper({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white border border-[#E0E0E0] rounded-3xl w-full max-w-md shadow-2xl flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-5 border-b border-[#E0E0E0]">
          <h2 className="text-xl font-bold text-[#333333]">{title}</h2>
          <button onClick={onClose} className="text-[#757575] hover:text-red-500 transition-colors">
            <X className="w-6 h-6" />
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
