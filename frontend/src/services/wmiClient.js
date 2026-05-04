const WMI_API_URL = 'http://localhost:6060/api/hw-info';

export const fetchHardwareInfo = async () => {
  try {
    const response = await fetch(WMI_API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching WMI Info:', error);
    throw error;
  }
};
