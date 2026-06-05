import React, { useRef, useState, useEffect } from 'react';

export const IpInput = ({ value, onChange, className }) => {
  const [octets, setOctets] = useState(['', '', '', '']);
  const refs = [useRef(), useRef(), useRef(), useRef()];

  useEffect(() => {
    const parts = (value || '').split('.');
    setOctets([
      parts[0] || '',
      parts[1] || '',
      parts[2] || '',
      parts[3] || ''
    ]);
  }, [value]);

  const updateOctet = (idx, val) => {
    const newOctets = [...octets];
    newOctets[idx] = val;
    setOctets(newOctets);
    let joined = newOctets.join('.');
    while (joined.endsWith('.') && joined.length > 0) {
      joined = joined.slice(0, -1);
    }
    onChange(joined);
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === '.' && octets[idx].length > 0 && idx < 3) {
      e.preventDefault();
      refs[idx + 1].current.focus();
    } else if (e.key === 'Backspace' && octets[idx] === '' && idx > 0) {
      refs[idx - 1].current.focus();
    }
  };

  const handleChange = (e, idx) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val !== '') {
      let num = parseInt(val, 10);
      if (num > 255) val = '255';
      else val = num.toString();
    }
    updateOctet(idx, val);
    if (val.length === 3 && idx < 3) {
      refs[idx + 1].current.focus();
    }
  };

  // Fix 6: sanitizar paste completo tipo "192.168.1.100"
  const handlePaste = (e, idx) => {
    e.preventDefault();
    const raw = e.clipboardData.getData('text');
    const parts = raw.replace(/[^0-9.]/g, '').split('.').slice(0, 4);
    const newOctets = [...octets];
    parts.forEach((p, i) => {
      if (idx + i < 4) {
        let num = parseInt(p, 10);
        if (isNaN(num)) num = 0;
        if (num > 255) num = 255;
        newOctets[idx + i] = num.toString();
      }
    });
    setOctets(newOctets);
    onChange(newOctets.filter((_, i) => i < 4).join('.').replace(/\.+$/, ''));
    const focusIdx = Math.min(idx + parts.length - 1, 3);
    refs[focusIdx].current?.focus();
  };

  return (
    <div className={`flex items-center bg-white rounded-xl border shadow-sm ${className}`} style={{ padding: '0 8px' }}>
      {octets.map((oct, idx) => (
        <React.Fragment key={idx}>
          <input
            ref={refs[idx]}
            type="text"
            value={oct}
            onChange={(e) => handleChange(e, idx)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            onPaste={(e) => handlePaste(e, idx)}
            className="w-8 text-center bg-transparent focus:outline-none text-[#333333] placeholder-gray-300"
            maxLength={3}
            placeholder="0"
          />
          {idx < 3 && <span className="text-gray-400 font-bold mx-0.5">.</span>}
        </React.Fragment>
      ))}
    </div>
  );
};

export const MacInput = ({ value, onChange, className }) => {
  const [hexes, setHexes] = useState(['', '', '', '', '', '']);
  const refs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  useEffect(() => {
    const parts = (value || '').split(':');
    setHexes([
      parts[0] || '', parts[1] || '', parts[2] || '',
      parts[3] || '', parts[4] || '', parts[5] || ''
    ]);
  }, [value]);

  const updateHex = (idx, val) => {
    const newHexes = [...hexes];
    newHexes[idx] = val.toUpperCase();
    setHexes(newHexes);
    let joined = newHexes.join(':');
    while (joined.endsWith(':') && joined.length > 0) {
      joined = joined.slice(0, -1);
    }
    onChange(joined);
  };

  const handleKeyDown = (e, idx) => {
    if ((e.key === ':' || e.key === '-') && hexes[idx].length > 0 && idx < 5) {
      e.preventDefault();
      refs[idx + 1].current.focus();
    } else if (e.key === 'Backspace' && hexes[idx] === '' && idx > 0) {
      refs[idx - 1].current.focus();
    }
  };

  const handleChange = (e, idx) => {
    let val = e.target.value.replace(/[^0-9A-Fa-f]/g, '');
    if (val.length > 2) val = val.substring(0, 2);
    updateHex(idx, val);
    if (val.length === 2 && idx < 5) {
      refs[idx + 1].current.focus();
    }
  };

  // Fix 6: sanitizar paste completo tipo "AA:BB:CC:DD:EE:FF" o "AA-BB-CC-DD-EE-FF"
  const handlePaste = (e) => {
    e.preventDefault();
    const raw = e.clipboardData.getData('text');
    // normalizar separadores y filtrar solo hex
    const clean = raw.replace(/[-:.\s]/g, '').replace(/[^0-9A-Fa-f]/g, '').substring(0, 12);
    const parts = clean.match(/.{1,2}/g) || [];
    const newHexes = ['', '', '', '', '', ''];
    parts.forEach((p, i) => { if (i < 6) newHexes[i] = p.toUpperCase(); });
    setHexes(newHexes);
    onChange(newHexes.join(':').replace(/:+$/, ''));
    const focusIdx = Math.min(parts.length - 1, 5);
    refs[Math.max(0, focusIdx)].current?.focus();
  };

  return (
    <div className={`flex items-center bg-white rounded-xl border shadow-sm ${className}`} style={{ padding: '0 8px' }}>
      {hexes.map((hex, idx) => (
        <React.Fragment key={idx}>
          <input
            ref={refs[idx]}
            type="text"
            value={hex}
            onChange={(e) => handleChange(e, idx)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            onPaste={handlePaste}
            className="w-6 text-center bg-transparent focus:outline-none text-[#333333] placeholder-gray-300 uppercase"
            maxLength={2}
            placeholder="00"
          />
          {idx < 5 && <span className="text-gray-400 font-bold mx-0.5">:</span>}
        </React.Fragment>
      ))}
    </div>
  );
};
