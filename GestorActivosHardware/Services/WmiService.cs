using System;
using System.Management;

namespace GestorActivosHardware.Services
{
    public class HardwareInfo
    {
        public string nom_pc { get; set; } = "";
        public string num_serie { get; set; } = "";
        public string dir_ip { get; set; } = "";
        public string mac_address { get; set; } = "";
        public string cpu_info { get; set; } = "";
        public string ram_gb { get; set; } = "";
        public string almacenamiento_gb { get; set; } = "";
        public string modelo_so { get; set; } = "";
        
        public string fecha_act_antivirus { get; set; } = "";
        public System.Collections.Generic.List<string> correos_usuario { get; set; } = new System.Collections.Generic.List<string>();
        public string usuario_pc { get; set; } = "";
        public string tipo_usuario_pc { get; set; } = "";
        public string windows_serial { get; set; } = "";
        
        public string monitor_marca { get; set; } = "";
        public string monitor_modelo { get; set; } = "";
        public string monitor_num_serie { get; set; } = "";
    }

    public static class WmiService
    {
        public static HardwareInfo GetHardwareInfo()
        {
            var info = new HardwareInfo
            {
                nom_pc = Environment.MachineName,
                usuario_pc = Environment.UserName
            };

            try
            {
                using (var identity = System.Security.Principal.WindowsIdentity.GetCurrent())
                {
                    var principal = new System.Security.Principal.WindowsPrincipal(identity);
                    info.tipo_usuario_pc = principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator) 
                        ? "Administrador" 
                        : "Avanzado";
                }
            }
            catch { }

            try
            {
                using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\IdentityCRL\UserExtendedProperties"))
                {
                    if (key != null)
                    {
                        info.correos_usuario.AddRange(key.GetSubKeyNames());
                    }
                }
            }
            catch { }

            try
            {
                using (var searcher = new ManagementObjectSearcher(@"root\Microsoft\Windows\Defender", "SELECT AntivirusSignatureLastUpdated FROM MSFT_MpComputerStatus"))
                {
                    foreach (ManagementObject o in searcher.Get())
                    {
                        var dateStr = o["AntivirusSignatureLastUpdated"]?.ToString();
                        if (!string.IsNullOrEmpty(dateStr))
                        {
                            info.fecha_act_antivirus = ManagementDateTimeConverter.ToDateTime(dateStr).ToString("yyyy-MM-dd HH:mm:ss");
                        }
                    }
                }
            }
            catch { }

            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BIOS"))
                    foreach (ManagementObject o in searcher.Get())
                        info.num_serie = o["SerialNumber"]?.ToString()?.Trim() ?? "";

                using (var searcher = new ManagementObjectSearcher("SELECT IPAddress,MACAddress FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled='TRUE'"))
                    foreach (ManagementObject o in searcher.Get())
                    {
                        if (o["IPAddress"] is string[] ips && ips.Length > 0 && string.IsNullOrEmpty(info.dir_ip))
                            info.dir_ip = ips[0];
                        if (string.IsNullOrEmpty(info.mac_address))
                            info.mac_address = o["MACAddress"]?.ToString() ?? "";
                    }

                using (var searcher = new ManagementObjectSearcher("SELECT Name FROM Win32_Processor"))
                    foreach (ManagementObject o in searcher.Get())
                        info.cpu_info = o["Name"]?.ToString()?.Trim() ?? "";

                long ramBytes = 0;
                using (var searcher = new ManagementObjectSearcher("SELECT Capacity FROM Win32_PhysicalMemory"))
                    foreach (ManagementObject o in searcher.Get())
                        ramBytes += Convert.ToInt64(o["Capacity"]);
                
                info.ram_gb = ramBytes > 0 ? (ramBytes / (1024L * 1024 * 1024)).ToString() : "0";

                long diskBytes = 0;
                using (var searcher = new ManagementObjectSearcher("SELECT Size FROM Win32_DiskDrive WHERE MediaType='Fixed hard disk media'"))
                    foreach (ManagementObject o in searcher.Get())
                        if (o["Size"] != null)
                            diskBytes += Convert.ToInt64(o["Size"]);
                            
                info.almacenamiento_gb = diskBytes > 0 ? (diskBytes / (1024L * 1024 * 1024)).ToString() : "256";

                using (var searcher = new ManagementObjectSearcher("SELECT Caption, SerialNumber FROM Win32_OperatingSystem"))
                    foreach (ManagementObject o in searcher.Get())
                    {
                        info.modelo_so = o["Caption"]?.ToString()?.Replace("Microsoft ", "")?.Trim() ?? "";
                        info.windows_serial = o["SerialNumber"]?.ToString()?.Trim() ?? "";
                    }

                // Intentar extraer información de monitores conectados
                try
                {
                    using (var searcher = new ManagementObjectSearcher("root\\WMI", "SELECT * FROM WmiMonitorID"))
                    {
                        foreach (ManagementObject o in searcher.Get())
                        {
                            // Extraer la marca del monitor (Fabricante)
                            if (o["ManufacturerName"] != null)
                            {
                                ushort[] mfgArray = (ushort[])o["ManufacturerName"];
                                string mfg = "";
                                foreach (ushort c in mfgArray)
                                {
                                    if (c > 0 && c < 256) mfg += (char)c;
                                }
                                info.monitor_marca = mfg.Trim();
                            }

                            // Extraer el modelo del monitor (Código de producto / Nombre amigable)
                            if (o["UserFriendlyName"] != null)
                            {
                                ushort[] nameArray = (ushort[])o["UserFriendlyName"];
                                string name = "";
                                foreach (ushort c in nameArray)
                                {
                                    if (c > 0 && c < 256) name += (char)c;
                                }
                                info.monitor_modelo = name.Trim();
                            }

                            // Extraer el número de serie del monitor
                            if (o["SerialNumberID"] != null)
                            {
                                ushort[] serialArray = (ushort[])o["SerialNumberID"];
                                string serial = "";
                                foreach (ushort c in serialArray)
                                {
                                    if (c > 0 && c < 256) serial += (char)c;
                                }
                                info.monitor_num_serie = serial.Trim();
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error retrieving Monitor info: {ex.Message}");
                }

            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error retrieving WMI info: {ex.Message}");
            }

            return info;
        }
    }
}
