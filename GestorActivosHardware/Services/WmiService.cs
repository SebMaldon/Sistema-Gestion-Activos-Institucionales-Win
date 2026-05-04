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
    }

    public static class WmiService
    {
        public static HardwareInfo GetHardwareInfo()
        {
            var info = new HardwareInfo
            {
                nom_pc = Environment.MachineName
            };

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

                using (var searcher = new ManagementObjectSearcher("SELECT Caption FROM Win32_OperatingSystem"))
                    foreach (ManagementObject o in searcher.Get())
                        info.modelo_so = o["Caption"]?.ToString()?.Replace("Microsoft ", "")?.Trim() ?? "";
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error retrieving WMI info: {ex.Message}");
            }

            return info;
        }
    }
}
