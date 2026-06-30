const API_URL = 'http://localhost:6060/api';

export const fetchHardwareInfo = async () => {
    try {
        const response = await fetch(`${API_URL}/hw-info`);
        if (!response.ok) throw new Error('Error al obtener info WMI');
        return await response.json();
    } catch (error) {
        console.error('wmiClient fetchHardwareInfo error:', error);
        throw error;
    }
};

export const forceSyncHardware = async () => {
    try {
        const response = await fetch(`${API_URL}/force-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error('Error forzando sync hardware');
        return await response.json();
    } catch (error) {
        console.error('wmiClient forceSyncHardware error:', error);
        throw error;
    }
};
