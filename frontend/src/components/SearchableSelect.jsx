import React, { useState, useEffect, useRef, useMemo } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, Loader2, X } from 'lucide-react';

const normalizeStr = (str) => {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

export default function SearchableSelect({ 
  options = [], 
  value, 
  onChange, 
  placeholder = "Buscar...",
  label = "",
  hasError = false,
  disabled = false,
  asyncSearch = null
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [asyncOptions, setAsyncOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);

  const allOptions = useMemo(() => {
    const map = new Map();
    [...options, ...asyncOptions].forEach(o => map.set(o.value, o));
    return Array.from(map.values());
  }, [options, asyncOptions]);

  const selectedOption = allOptions.find(o => o.value === value);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm(selectedOption ? selectedOption.label : '');
    } else {
      setSearchTerm('');
      if (asyncSearch && value) {
        setAsyncOptions([]);
      }
    }
  }, [isOpen, selectedOption, value, asyncSearch]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!asyncSearch || !isOpen) return;
    
    const delayDebounceFn = setTimeout(async () => {
      if (searchTerm.trim().length >= 2) {
        setLoading(true);
        try {
          const results = await asyncSearch(searchTerm.trim());
          setAsyncOptions(results);
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      } else {
        setAsyncOptions([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, asyncSearch, isOpen]);

  const filteredOptions = useMemo(() => {
    if (asyncSearch) return asyncOptions;
    
    const searchTokens = normalizeStr(searchTerm).split(' ').filter(Boolean);
    if (searchTokens.length === 0) return options;
    
    return options.filter(option => {
      const labelStr = normalizeStr(option.label);
      return searchTokens.every(token => labelStr.includes(token));
    });
  }, [options, asyncOptions, searchTerm, asyncSearch]);

  const handleSelect = (optValue) => {
    onChange(optValue);
    setIsOpen(false);
  };

  const clearSelection = (e) => {
    e.stopPropagation();
    onChange(null);
    setSearchTerm('');
    setIsOpen(true);
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {label && <label className="text-xs font-semibold text-[#757575] uppercase tracking-wider block mb-1">{label}</label>}
      
      <div 
        onClick={() => {
          if (!disabled && !isOpen) setIsOpen(true);
        }}
        className={clsx(
          "relative flex items-center justify-between w-full bg-white border rounded-xl py-2 px-3 transition-colors shadow-sm",
          hasError ? "border-red-500" : "border-[#E0E0E0] focus-within:border-[#006241]",
          disabled ? "opacity-50 cursor-not-allowed bg-[#F5F5F5]" : "cursor-text"
        )}
      >
        <input
          type="text"
          disabled={disabled}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={selectedOption && !isOpen ? selectedOption.label : placeholder}
          className="w-full bg-transparent border-none text-[#333333] text-sm focus:outline-none placeholder:text-[#9e9e9e] truncate"
        />

        <div className="flex items-center gap-1 pl-2">
          {loading && <Loader2 className="w-4 h-4 text-[#006241] animate-spin" />}
          
          {selectedOption && !disabled && !isOpen && (
            <button 
              type="button"
              onClick={clearSelection}
              className="text-[#9e9e9e] hover:text-red-500 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          
          <ChevronDown className={clsx("w-4 h-4 text-[#9e9e9e] transition-transform", isOpen && "rotate-180")} />
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-[#E0E0E0] rounded-xl shadow-xl overflow-hidden max-h-60 flex flex-col">
          <ul className="overflow-y-auto p-1 custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <li 
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  className={clsx(
                    "px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors",
                    opt.value === value ? "bg-[#006241] text-white" : "text-[#333333] hover:bg-[#F5F5F5] hover:text-[#006241]"
                  )}
                >
                  {opt.label}
                </li>
              ))
            ) : (
              <li className="px-3 py-4 text-center text-sm text-[#757575]">
                {asyncSearch && searchTerm.length < 2 ? 'Escribe al menos 2 letras...' : (loading ? 'Buscando...' : 'No se encontraron resultados')}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
