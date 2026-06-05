using System;
using System.Management;

namespace GestorActivosHardware.Services
{
    public class MonitorInfo
    {
        public string marca { get; set; } = "";
        public string modelo { get; set; } = "";
        public string num_serie { get; set; } = "";
    }

    public class NetworkAdapterInfo
    {
        public string descripcion { get; set; } = "";
        public string ip { get; set; } = "";
        public string mac { get; set; } = "";
    }

    public class ProgramaInfo
    {
        public string nombre_programa { get; set; } = "";
        public string version { get; set; } = "";
        public string fecha_instalacion { get; set; } = "";
    }

    public class CuentaInfo
    {
        public string cuenta_windows { get; set; } = "";
        public string tipo_user { get; set; } = "";
        public string correo { get; set; } = "";
    }

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
        public string version_office { get; set; } = "";
        
        public string fecha_act_antivirus { get; set; } = "";
        public System.Collections.Generic.List<string> correos_usuario { get; set; } = new System.Collections.Generic.List<string>();
        public string usuario_pc { get; set; } = "";
        public string tipo_usuario_pc { get; set; } = "";
        public string windows_serial { get; set; } = "";
        
        public string tipo_equipo { get; set; } = "";
        public System.Collections.Generic.List<MonitorInfo> monitores { get; set; } = new System.Collections.Generic.List<MonitorInfo>();
        public System.Collections.Generic.List<NetworkAdapterInfo> adaptadores_red { get; set; } = new System.Collections.Generic.List<NetworkAdapterInfo>();
        public System.Collections.Generic.List<CuentaInfo> cuentasList { get; set; } = new System.Collections.Generic.List<CuentaInfo>();
        public System.Collections.Generic.List<ProgramaInfo> programas { get; set; } = new System.Collections.Generic.List<ProgramaInfo>();
    }

    public static class WmiService
    {
        private static void GetProgramsFromRegistry(string registryKeyPath, Microsoft.Win32.RegistryKey rootKey, System.Collections.Generic.List<ProgramaInfo> list, System.Collections.Generic.HashSet<string> seen)
        {
            try
            {
                using (var key = rootKey.OpenSubKey(registryKeyPath))
                {
                    if (key != null)
                    {
                        foreach (var subKeyName in key.GetSubKeyNames())
                        {
                            using (var subKey = key.OpenSubKey(subKeyName))
                            {
                                if (subKey != null)
                                {
                                    var name = subKey.GetValue("DisplayName") as string;
                                    if (!string.IsNullOrEmpty(name))
                                    {
                                        if (name.Contains("KB") && name.Contains("Update")) continue;

                                        string lowerName = name.ToLower();
                                        if (lowerName.Contains("microsoft .net") ||
                                            lowerName.Contains("microsoft visual c++") ||
                                            lowerName.Contains("redistributable") ||
                                            lowerName.Contains(" sdk ") || lowerName.EndsWith(" sdk") ||
                                            lowerName.Contains("runtime") ||
                                            lowerName.Contains("language pack") ||
                                            lowerName.Contains("paquete de idioma") ||
                                            lowerName.Contains("paquete de compatibilidad") ||
                                            lowerName.Contains("paquete de controladores") ||
                                            lowerName.StartsWith("windows driver package") ||
                                            lowerName.StartsWith("windows driver kit") ||
                                            lowerName.StartsWith("windows app certification kit") ||
                                            lowerName.Contains("developer tools") ||
                                            lowerName.Contains("update for ") ||
                                            lowerName.Contains("security update")) continue;

                                        if (!seen.Add(name)) continue;

                                        list.Add(new ProgramaInfo
                                        {
                                            nombre_programa = name,
                                            version = subKey.GetValue("DisplayVersion") as string ?? "",
                                            fecha_instalacion = subKey.GetValue("InstallDate") as string ?? ""
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch { }
        }

        private class AppxPackageInfo 
        {
            public string Name { get; set; }
            public string Version { get; set; }
            public string Publisher { get; set; }
        }

        private static void GetAppxPackages(System.Collections.Generic.List<ProgramaInfo> list, System.Collections.Generic.HashSet<string> seen)
        {
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -Command \"Get-AppxPackage -AllUsers | Select-Object Name, Version, Publisher | ConvertTo-Json -Compress\"",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (var process = System.Diagnostics.Process.Start(psi))
                {
                    if (process != null)
                    {
                        string output = process.StandardOutput.ReadToEnd().Trim();
                        if (!string.IsNullOrEmpty(output) && output.StartsWith("["))
                        {
                            var options = new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                            var packages = System.Text.Json.JsonSerializer.Deserialize<System.Collections.Generic.List<AppxPackageInfo>>(output, options);
                            if (packages != null)
                            {
                                foreach (var p in packages)
                                {
                                    if (string.IsNullOrEmpty(p.Name)) continue;
                                    // Ignorar paquetes puramente internos del sistema para no hacer spam, pero dejar apps
                                    if (p.Name.StartsWith("MicrosoftWindows.") || p.Name.StartsWith("Microsoft.UI.") || p.Name.StartsWith("Microsoft.VCLibs") || p.Name.StartsWith("Microsoft.NET")) continue;
                                    
                                    string cleanName = p.Name;
                                    // Mejorar nombres de algunas apps comunes
                                    if (cleanName == "Microsoft.WindowsNotepad") cleanName = "Bloc de notas";
                                    else if (cleanName == "Microsoft.Paint") cleanName = "Paint";
                                    else if (cleanName == "Microsoft.BingWeather") cleanName = "El Tiempo";
                                    else if (cleanName == "Microsoft.WindowsCalculator") cleanName = "Calculadora";
                                    else if (cleanName.StartsWith("Microsoft.")) cleanName = cleanName.Substring(10);
                                    
                                    if (!seen.Add(cleanName)) continue;

                                    list.Add(new ProgramaInfo
                                    {
                                        nombre_programa = cleanName,
                                        version = p.Version ?? "",
                                        fecha_instalacion = ""
                                    });
                                }
                            }
                        }
                    }
                }
            }
            catch { }
        }

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
                    if (identity != null && !string.IsNullOrEmpty(identity.Name))
                    {
                        info.usuario_pc = identity.Name;
                    }
                    var principal = new System.Security.Principal.WindowsPrincipal(identity);
                    info.tipo_usuario_pc = principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator) 
                        ? "Administrador" 
                        : "Avanzado";
                }
            }
            catch { }

            // 1. Intentar obtener correo desde Active Directory usando COM ADSystemInfo y ADSI
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -Command \"$s = New-Object -ComObject ADSystemInfo; $u = $s.GetType().InvokeMember('UserName', 'GetProperty', $null, $s, $null); ([ADSI]('LDAP://' + $u)).mail\"",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (var process = System.Diagnostics.Process.Start(psi))
                {
                    if (process != null)
                    {
                        string output = process.StandardOutput.ReadToEnd().Trim();
                        if (!string.IsNullOrEmpty(output) && output.Contains("@"))
                        {
                            info.correos_usuario.Add(output);
                        }
                    }
                }
            }
            catch { }

            // 2. Si no se obtuvo correo de AD, intentar desde el Registro
            if (info.correos_usuario.Count == 0)
            {
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
            }

            try
            {
                using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows Defender\Signature Updates"))
                {
                    if (key != null)
                    {
                        var binaryData = key.GetValue("SignaturesLastUpdated") as byte[];
                        if (binaryData != null && binaryData.Length >= 8)
                        {
                            long fileTime = BitConverter.ToInt64(binaryData, 0);
                            if (fileTime > 0)
                            {
                                info.fecha_act_antivirus = DateTime.FromFileTime(fileTime).ToString("yyyy-MM-dd HH:mm:ss");
                            }
                        }
                    }
                }
            }
            catch { }

            if (string.IsNullOrEmpty(info.fecha_act_antivirus))
            {
                try
                {
                    using (var searcher = new ManagementObjectSearcher(@"root\Microsoft\Windows\Defender", "SELECT AntivirusSignatureLastUpdated FROM MSFT_MpComputerStatus"))
                    {
                        foreach (ManagementObject o in searcher.Get())
                        {
                            var dateStr = o["AntivirusSignatureLastUpdated"]?.ToString();
                            if (!string.IsNullOrEmpty(dateStr))
                            {
                                info.fecha_act_antivirus = ManagementDateTimeConverter.ToDateTime(dateStr).ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss");
                            }
                        }
                    }
                }
                catch { }
            }

            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BIOS"))
                    foreach (ManagementObject o in searcher.Get())
                        info.num_serie = o["SerialNumber"]?.ToString()?.Trim() ?? "";

                using (var searcher = new ManagementObjectSearcher("SELECT Description, IPAddress, MACAddress FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled='TRUE'"))
                    foreach (ManagementObject o in searcher.Get())
                    {
                        if (o["IPAddress"] is string[] ips && ips.Length > 0)
                        {
                            string desc = o["Description"]?.ToString() ?? "";
                            string macAddr = o["MACAddress"]?.ToString() ?? "";
                            foreach (var ip in ips)
                            {
                                if (System.Net.IPAddress.TryParse(ip, out var parsedIp) && parsedIp.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                                {
                                    info.adaptadores_red.Add(new NetworkAdapterInfo { descripcion = desc, ip = ip, mac = macAddr });
                                }
                            }
                            if (string.IsNullOrEmpty(info.dir_ip))
                                info.dir_ip = ips[0];
                        }
                        if (string.IsNullOrEmpty(info.mac_address))
                            info.mac_address = o["MACAddress"]?.ToString() ?? "";
                    }

                using (var searcher = new ManagementObjectSearcher("SELECT Name, MaxClockSpeed FROM Win32_Processor"))
                    foreach (ManagementObject o in searcher.Get())
                    {
                        string name = o["Name"]?.ToString()?.Trim() ?? "";
                        string speedRaw = o["MaxClockSpeed"]?.ToString() ?? "";
                        if (!string.IsNullOrEmpty(speedRaw) && double.TryParse(speedRaw, out double mhz))
                        {
                            double ghz = Math.Round(mhz / 1000.0, 2);
                            if (!name.Contains("@"))
                            {
                                name += $" @ {ghz} GHz";
                            }
                        }
                        info.cpu_info = name;
                    }

                long ramBytes = 0;
                using (var searcher = new ManagementObjectSearcher("SELECT Capacity FROM Win32_PhysicalMemory"))
                    foreach (ManagementObject o in searcher.Get())
                        ramBytes += Convert.ToInt64(o["Capacity"]);
                
                info.ram_gb = ramBytes > 0 ? (ramBytes / (1024L * 1024 * 1024)).ToString() : "0";

                long diskBytes = 0;
                try 
                {
                    using (var searcher = new ManagementObjectSearcher("ASSOCIATORS OF {Win32_LogicalDisk.DeviceID='C:'} WHERE AssocClass=Win32_LogicalDiskToPartition"))
                    {
                        foreach (ManagementObject partition in searcher.Get())
                        {
                            using (var searcher2 = new ManagementObjectSearcher("ASSOCIATORS OF {" + partition["__RELPATH"] + "} WHERE AssocClass=Win32_DiskDriveToDiskPartition"))
                            {
                                foreach (ManagementObject drive in searcher2.Get())
                                {
                                    if (drive["Size"] != null)
                                    {
                                        diskBytes = Convert.ToInt64(drive["Size"]);
                                        break;
                                    }
                                }
                            }
                            if (diskBytes > 0) break;
                        }
                    }
                } 
                catch 
                {
                    // Fallback
                    using (var searcher = new ManagementObjectSearcher("SELECT Size FROM Win32_DiskDrive WHERE Index=0"))
                        foreach (ManagementObject o in searcher.Get())
                            if (o["Size"] != null)
                                diskBytes = Convert.ToInt64(o["Size"]);
                }
                             
                info.almacenamiento_gb = diskBytes > 0 ? (diskBytes / (1024L * 1024 * 1024)).ToString() : "256";

                using (var searcher = new ManagementObjectSearcher("SELECT Caption, SerialNumber, OSArchitecture FROM Win32_OperatingSystem"))
                    foreach (ManagementObject o in searcher.Get())
                    {
                        string osName = o["Caption"]?.ToString()?.Replace("Microsoft ", "")?.Trim() ?? "";
                        string osArch = o["OSArchitecture"]?.ToString()?.Trim() ?? "";
                        info.modelo_so = string.IsNullOrEmpty(osArch) ? osName : $"{osName} ({osArch})";
                        info.windows_serial = o["SerialNumber"]?.ToString()?.Trim() ?? "";
                    }

                // Detectar versión de Microsoft Office
                info.version_office = "No instalado";
                try
                {
                    // Intentar obtener de Click-To-Run (Office 365, 2016, 2019, 2021 modernos)
                    using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Office\ClickToRun\Configuration"))
                    {
                        if (key != null)
                        {
                            var prodIds = key.GetValue("ProductReleaseIds")?.ToString() ?? "";
                            if (!string.IsNullOrEmpty(prodIds))
                            {
                                string name = "";
                                string[] priority = { "O365", "ProPlus", "Standard", "Professional", "Business", "Enterprise", "Home", "Personal" };
                                foreach (var id in prodIds.Split(','))
                                {
                                    bool matched = false;
                                    foreach(var p in priority) {
                                        if (id.IndexOf(p, StringComparison.OrdinalIgnoreCase) >= 0) {
                                            matched = true;
                                            break;
                                        }
                                    }
                                    if (matched)
                                    {
                                        name = id.Replace("Retail", "").Replace("Volume", "");
                                        break;
                                    }
                                }
                                // 2. Fallback si no hay prioridad (pero ignorar OneNoteFree)
                                if (string.IsNullOrEmpty(name))
                                {
                                    foreach (var id in prodIds.Split(','))
                                    {
                                        if (id.IndexOf("OneNoteFree", StringComparison.OrdinalIgnoreCase) >= 0 || id.IndexOf("Proof", StringComparison.OrdinalIgnoreCase) >= 0) continue;
                                        name = id.Replace("Retail", "").Replace("Volume", "");
                                        break;
                                    }
                                }
                                // 3. Último caso si de plano solo había OneNoteFree
                                if (string.IsNullOrEmpty(name)) 
                                {
                                    name = prodIds.Split(',')[0].Replace("Retail", "").Replace("Volume", "");
                                }
                                info.version_office = $"Office {name}";
                            }
                        }
                    }

                    // Fallback a instalaciones tradicionales MSI
                    if (info.version_office == "No instalado")
                    {
                        string[] versions = { "16.0", "15.0", "14.0", "12.0", "11.0" };
                        foreach (var v in versions)
                        {
                            using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey($@"SOFTWARE\Microsoft\Office\{v}\Word\InstallRoot"))
                            {
                                if (key != null && !string.IsNullOrEmpty(key.GetValue("Path")?.ToString()))
                                {
                                    info.version_office = v switch {
                                        "16.0" => "Office 2016/2019/365",
                                        "15.0" => "Office 2013",
                                        "14.0" => "Office 2010",
                                        "12.0" => "Office 2007",
                                        "11.0" => "Office 2003",
                                        _ => $"Office {v}"
                                    };
                                    break;
                                }
                            }
                        }
                    }
                }
                catch { }

                // Determinar si es PC o Laptop usando Win32_SystemEnclosure
                info.tipo_equipo = "Desktop";
                try
                {
                    using (var searcher = new ManagementObjectSearcher("SELECT ChassisTypes FROM Win32_SystemEnclosure"))
                    {
                        foreach (ManagementObject o in searcher.Get())
                        {
                            if (o["ChassisTypes"] != null)
                            {
                                ushort[] types = (ushort[])o["ChassisTypes"];
                                foreach (ushort type in types)
                                {
                                    // 8=Portable, 9=Laptop, 10=Notebook, 14=Sub Notebook, 31=Convertible
                                    if (type == 8 || type == 9 || type == 10 || type == 14 || type == 31)
                                    {
                                        info.tipo_equipo = "Laptop";
                                        break;
                                    }
                                }
                            }
                        }
                    }
                } catch { }

                // Intentar extraer información de monitores conectados
                try
                {
                    // Primero, mapeamos qué monitores son internos vs externos usando WmiMonitorConnectionParams
                    System.Collections.Generic.HashSet<string> monitoresInternos = new System.Collections.Generic.HashSet<string>();
                    using (var searcherCon = new ManagementObjectSearcher("root\\WMI", "SELECT InstanceName, VideoOutputTechnology FROM WmiMonitorConnectionParams"))
                    {
                        foreach (ManagementObject o in searcherCon.Get())
                        {
                            string instanceName = o["InstanceName"]?.ToString() ?? "";
                            // VideoOutputTechnology: 0x80000000 = 2147483648 (Internal)
                            if (o["VideoOutputTechnology"] != null)
                            {
                                uint tech = Convert.ToUInt32(o["VideoOutputTechnology"]);
                                if (tech == 2147483648) 
                                {
                                    monitoresInternos.Add(instanceName);
                                }
                            }
                        }
                    }

                    using (var searcher = new ManagementObjectSearcher("root\\WMI", "SELECT * FROM WmiMonitorID"))
                    {
                        foreach (ManagementObject o in searcher.Get())
                        {
                            string instanceName = o["InstanceName"]?.ToString() ?? "";
                            
                            // Si es laptop y el monitor es interno, lo saltamos
                            if (info.tipo_equipo == "Laptop" && monitoresInternos.Contains(instanceName))
                            {
                                continue;
                            }

                            MonitorInfo mInfo = new MonitorInfo();

                            // Extraer la marca del monitor (Fabricante)
                            string rawMarca = "";
                            if (o["ManufacturerName"] != null)
                            {
                                ushort[] mfgArray = (ushort[])o["ManufacturerName"];
                                string mfg = "";
                                foreach (ushort c in mfgArray)
                                    if (c > 0 && c < 256) mfg += (char)c;
                                rawMarca = mfg.Trim();
                            }

                            // Traducir marca PNP a Comercial
                            var pnpMarcas = new System.Collections.Generic.Dictionary<string, string>(System.StringComparer.OrdinalIgnoreCase)
                            {
                                { "HPN", "HP" },
                                { "HWP", "HP" },
                                { "DEL", "Dell" },
                                { "BNQ", "BenQ" },
                                { "SAM", "Samsung" },
                                { "LGD", "LG" },
                                { "ACR", "Acer" },
                                { "ASU", "Asus" },
                                { "LEN", "Lenovo" },
                                { "APP", "Apple" }
                            };

                            mInfo.marca = pnpMarcas.TryGetValue(rawMarca, out var marcaComercial) ? marcaComercial : rawMarca;

                            // Extraer el modelo del monitor
                            if (o["UserFriendlyName"] != null)
                            {
                                ushort[] nameArray = (ushort[])o["UserFriendlyName"];
                                string name = "";
                                foreach (ushort c in nameArray)
                                    if (c > 0 && c < 256) name += (char)c;
                                string rawModelo = name.Trim();

                                // Limpiar prefijo PNP o comercial en modelo
                                string cleanedMarca = mInfo.marca ?? rawMarca;
                                if (!string.IsNullOrEmpty(cleanedMarca) && rawModelo.StartsWith(cleanedMarca, System.StringComparison.OrdinalIgnoreCase))
                                {
                                    rawModelo = rawModelo.Substring(cleanedMarca.Length).Trim();
                                }
                                else if (!string.IsNullOrEmpty(rawMarca) && rawModelo.StartsWith(rawMarca, System.StringComparison.OrdinalIgnoreCase))
                                {
                                    rawModelo = rawModelo.Substring(rawMarca.Length).Trim();
                                }
                                mInfo.modelo = rawModelo;
                            }

                            // Extraer el número de serie del monitor
                            if (o["SerialNumberID"] != null)
                            {
                                ushort[] serialArray = (ushort[])o["SerialNumberID"];
                                string serial = "";
                                foreach (ushort c in serialArray)
                                    if (c > 0 && c < 256) serial += (char)c;
                                mInfo.num_serie = serial.Trim();
                            }

                            info.monitores.Add(mInfo);
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error retrieving Monitor info: {ex.Message}");
                }

                // Obtener todas las cuentas locales
                System.Collections.Generic.HashSet<string> admins = new System.Collections.Generic.HashSet<string>(System.StringComparer.OrdinalIgnoreCase);
                try {
                    using (var searcher = new ManagementObjectSearcher("SELECT PartComponent FROM Win32_GroupUser WHERE GroupComponent = \"Win32_Group.Domain='" + Environment.MachineName + "',Name='Administradores'\" OR GroupComponent = \"Win32_Group.Domain='" + Environment.MachineName + "',Name='Administrators'\""))
                    {
                        foreach (ManagementObject o in searcher.Get())
                        {
                            string part = o["PartComponent"]?.ToString() ?? "";
                            int nameIndex = part.IndexOf("Name=\"");
                            if (nameIndex >= 0)
                            {
                                int endIndex = part.IndexOf("\"", nameIndex + 6);
                                if (endIndex >= 0)
                                {
                                    string name = part.Substring(nameIndex + 6, endIndex - nameIndex - 6);
                                    admins.Add(name);
                                }
                            }
                        }
                    }
                } catch {}

                // Obtener perfiles reales (con carpeta en C:\Users)
                System.Collections.Generic.HashSet<string> validSids = new System.Collections.Generic.HashSet<string>(System.StringComparer.OrdinalIgnoreCase);
                try {
                    using (var searcher = new ManagementObjectSearcher("SELECT SID FROM Win32_UserProfile WHERE Special=False"))
                    {
                        foreach (ManagementObject o in searcher.Get())
                        {
                            string sid = o["SID"]?.ToString() ?? "";
                            if (!string.IsNullOrEmpty(sid)) validSids.Add(sid);
                        }
                    }
                } catch {}

                try {
                    foreach (string sid in validSids)
                    {
                        try {
                            var secId = new System.Security.Principal.SecurityIdentifier(sid);
                            var acc = (System.Security.Principal.NTAccount)secId.Translate(typeof(System.Security.Principal.NTAccount));
                            string fullName = acc.Value; // DOMINIO\Nombre
                            string name = fullName;
                            
                            int slashIdx = fullName.IndexOf('\\');
                            if (slashIdx >= 0) {
                                name = fullName.Substring(slashIdx + 1);
                                fullName = fullName.Replace("\\", "\\\\");
                            }

                            string tipo = admins.Contains(name) ? "Administrador" : "Avanzado";
                            
                            string correo = "";
                            if (name.Equals(Environment.UserName, StringComparison.OrdinalIgnoreCase) && info.correos_usuario.Count > 0)
                            {
                                correo = info.correos_usuario[0];
                            }

                            info.cuentasList.Add(new CuentaInfo {
                                cuenta_windows = fullName,
                                tipo_user = tipo,
                                correo = correo
                            });
                        } catch {}
                    }
                } catch {}

                // Extraer programas instalados
                System.Collections.Generic.HashSet<string> seenProgs = new System.Collections.Generic.HashSet<string>(System.StringComparer.OrdinalIgnoreCase);
                GetProgramsFromRegistry(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", Microsoft.Win32.Registry.LocalMachine, info.programas, seenProgs);
                GetProgramsFromRegistry(@"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall", Microsoft.Win32.Registry.LocalMachine, info.programas, seenProgs);
                GetProgramsFromRegistry(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", Microsoft.Win32.Registry.CurrentUser, info.programas, seenProgs);

                // Obtener aplicaciones modernas (AppX/UWP)
                GetAppxPackages(info.programas, seenProgs);

            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error retrieving WMI info: {ex.Message}");
            }

            return info;
        }
    }
}
