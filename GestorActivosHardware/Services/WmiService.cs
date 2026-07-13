using System;
using System.Management;
using System.Threading.Tasks;

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
                                    if (p.Name.StartsWith("MicrosoftWindows.") || p.Name.StartsWith("Microsoft.UI.") || p.Name.StartsWith("Microsoft.VCLibs") || p.Name.StartsWith("Microsoft.NET")) continue;
                                    
                                    string cleanName = p.Name;
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

        // ────────────────────────────────────────────────────────────────────────
        // TAREA 1: WMI hardware puro (sin cuentas, programas ni antivirus)
        // ────────────────────────────────────────────────────────────────────────
        private static void FillHardware(HardwareInfo info)
        {
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
                            if (!name.Contains("@")) name += $" @ {ghz} GHz";
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

                // Office desde Registro (rápido)
                info.version_office = "No instalado";
                try
                {
                    string[] registryKeys = {
                        @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                        @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
                    };
                    foreach (var regKey in registryKeys)
                    {
                        using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(regKey))
                        {
                            if (key != null)
                            {
                                foreach (string subkeyName in key.GetSubKeyNames())
                                {
                                    using (var subkey = key.OpenSubKey(subkeyName))
                                    {
                                        var displayName = subkey?.GetValue("DisplayName") as string;
                                        if (!string.IsNullOrEmpty(displayName) &&
                                           (displayName.Contains("Microsoft Office") || displayName.Contains("Microsoft 365")))
                                        {
                                            string lower = displayName.ToLower();
                                            if (lower.Contains("language pack") || lower.Contains("proof") ||
                                                lower.Contains("click-to-run component") || lower.Contains("onenote") ||
                                                lower.Contains("visio") || lower.Contains("project") ||
                                                lower.Contains("runtime") || lower.Contains("web components") ||
                                                lower.Contains("compatibility") || lower.Contains("teams") ||
                                                lower.Contains("add-in") || lower.Contains("plugin") ||
                                                lower.Contains("viewer") || lower.Contains("engine") ||
                                                lower.Contains("mui") || lower.Contains("updater") ||
                                                lower.Contains("companion") || lower.Contains("copilot"))
                                                continue;

                                            string cleanName = displayName.Replace("Microsoft ", "").Trim();
                                            var match = System.Text.RegularExpressions.Regex.Match(displayName, @"(365|20[0-9]{2})");
                                            info.version_office = match.Success ? "Office " + match.Value : cleanName;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        if (info.version_office != "No instalado") break;
                    }
                }
                catch { }

                // Tipo equipo
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

                // Monitores
                try
                {
                    var monitoresInternos = new System.Collections.Generic.HashSet<string>();
                    using (var searcherCon = new ManagementObjectSearcher("root\\WMI", "SELECT InstanceName, VideoOutputTechnology FROM WmiMonitorConnectionParams"))
                    {
                        foreach (ManagementObject o in searcherCon.Get())
                        {
                            string instanceName = o["InstanceName"]?.ToString() ?? "";
                            if (o["VideoOutputTechnology"] != null)
                            {
                                uint tech = Convert.ToUInt32(o["VideoOutputTechnology"]);
                                if (tech == 2147483648) monitoresInternos.Add(instanceName);
                            }
                        }
                    }

                    using (var searcher = new ManagementObjectSearcher("root\\WMI", "SELECT * FROM WmiMonitorID"))
                    {
                        foreach (ManagementObject o in searcher.Get())
                        {
                            string instanceName = o["InstanceName"]?.ToString() ?? "";
                            if (info.tipo_equipo == "Laptop" && monitoresInternos.Contains(instanceName)) continue;

                            MonitorInfo mInfo = new MonitorInfo();
                            string rawMarca = "";
                            if (o["ManufacturerName"] != null)
                            {
                                ushort[] mfgArray = (ushort[])o["ManufacturerName"];
                                string mfg = "";
                                foreach (ushort c in mfgArray) if (c > 0 && c < 256) mfg += (char)c;
                                rawMarca = mfg.Trim();
                            }

                            var pnpMarcas = new System.Collections.Generic.Dictionary<string, string>(System.StringComparer.OrdinalIgnoreCase)
                            {
                                { "HPN", "HP" }, { "HWP", "HP" }, { "DEL", "Dell" }, { "BNQ", "BenQ" },
                                { "SAM", "Samsung" }, { "LGD", "LG" }, { "ACR", "Acer" }, { "ASU", "Asus" },
                                { "LEN", "Lenovo" }, { "APP", "Apple" }
                            };
                            mInfo.marca = pnpMarcas.TryGetValue(rawMarca, out var marcaComercial) ? marcaComercial : rawMarca;

                            if (o["UserFriendlyName"] != null)
                            {
                                ushort[] nameArray = (ushort[])o["UserFriendlyName"];
                                string name = "";
                                foreach (ushort c in nameArray) if (c > 0 && c < 256) name += (char)c;
                                string rawModelo = name.Trim();
                                string cleanedMarca = mInfo.marca ?? rawMarca;
                                if (!string.IsNullOrEmpty(cleanedMarca) && rawModelo.StartsWith(cleanedMarca, System.StringComparison.OrdinalIgnoreCase))
                                    rawModelo = rawModelo.Substring(cleanedMarca.Length).Trim();
                                else if (!string.IsNullOrEmpty(rawMarca) && rawModelo.StartsWith(rawMarca, System.StringComparison.OrdinalIgnoreCase))
                                    rawModelo = rawModelo.Substring(rawMarca.Length).Trim();
                                mInfo.modelo = rawModelo;
                            }

                            if (o["SerialNumberID"] != null)
                            {
                                ushort[] serialArray = (ushort[])o["SerialNumberID"];
                                string serial = "";
                                foreach (ushort c in serialArray) if (c > 0 && c < 256) serial += (char)c;
                                mInfo.num_serie = serial.Trim();
                            }

                            info.monitores.Add(mInfo);
                        }
                    }
                }
                catch (Exception ex) { Console.WriteLine($"Error retrieving Monitor info: {ex.Message}"); }
            }
            catch (Exception ex) { Console.WriteLine($"Error retrieving WMI info: {ex.Message}"); }
        }

        // ────────────────────────────────────────────────────────────────────────
        // TAREA 2: Fecha de actualización de antivirus
        // ────────────────────────────────────────────────────────────────────────
        private static string GetAntivirusDate()
        {
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
                            if (fileTime > 0) return DateTime.FromFileTime(fileTime).ToString("yyyy-MM-dd HH:mm:ss");
                        }
                    }
                }
            }
            catch { }

            // Fallback WMI Defender
            try
            {
                using (var searcher = new ManagementObjectSearcher(@"root\Microsoft\Windows\Defender", "SELECT AntivirusSignatureLastUpdated FROM MSFT_MpComputerStatus"))
                {
                    foreach (ManagementObject o in searcher.Get())
                    {
                        var dateStr = o["AntivirusSignatureLastUpdated"]?.ToString();
                        if (!string.IsNullOrEmpty(dateStr))
                            return ManagementDateTimeConverter.ToDateTime(dateStr).ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss");
                    }
                }
            }
            catch { }

            return "";
        }

        // ────────────────────────────────────────────────────────────────────────
        // TAREA 3: Email del usuario actual (AD → Registro)
        // ────────────────────────────────────────────────────────────────────────
        private static string GetCurrentUserEmail()
        {
            // Intento 1: PowerShell ADSI
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
                        if (!string.IsNullOrEmpty(output) && output.EndsWith("@imss.gob.mx", StringComparison.OrdinalIgnoreCase))
                            return output;
                    }
                }
            }
            catch { }

            // Intento 2: Registro
            try
            {
                using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\IdentityCRL\UserExtendedProperties"))
                {
                    if (key != null)
                        foreach (var k in key.GetSubKeyNames())
                            if (k.EndsWith("@imss.gob.mx", StringComparison.OrdinalIgnoreCase))
                                return k;
                }
            }
            catch { }

            return "";
        }

        // ────────────────────────────────────────────────────────────────────────
        // TAREA 4: Cuentas locales con roles y correos
        // ────────────────────────────────────────────────────────────────────────
        private static System.Collections.Generic.List<CuentaInfo> GetCuentas()
        {
            var result = new System.Collections.Generic.List<CuentaInfo>();

            var admins  = new System.Collections.Generic.HashSet<string>(System.StringComparer.OrdinalIgnoreCase);
            var avanzados = new System.Collections.Generic.HashSet<string>(System.StringComparer.OrdinalIgnoreCase);

            foreach (var g in new[] { "Administradores", "Administrators" })
            {
                try
                {
                    using (var group = new System.DirectoryServices.DirectoryEntry($"WinNT://{Environment.MachineName}/{g},group"))
                        foreach (object member in (System.Collections.IEnumerable)group.Invoke("Members"))
                            using (var memberEntry = new System.DirectoryServices.DirectoryEntry(member))
                                admins.Add(memberEntry.Name);
                } catch { }
            }

            foreach (var g in new[] { "Usuarios Avanzados", "Power Users" })
            {
                try
                {
                    using (var group = new System.DirectoryServices.DirectoryEntry($"WinNT://{Environment.MachineName}/{g},group"))
                        foreach (object member in (System.Collections.IEnumerable)group.Invoke("Members"))
                            using (var memberEntry = new System.DirectoryServices.DirectoryEntry(member))
                                avanzados.Add(memberEntry.Name);
                } catch { }
            }

            var validSids = new System.Collections.Generic.HashSet<string>(System.StringComparer.OrdinalIgnoreCase);
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_UserProfile WHERE Special=False"))
                    foreach (ManagementObject o in searcher.Get())
                    {
                        string sid = o["SID"]?.ToString() ?? "";
                        string localPath = o["LocalPath"]?.ToString() ?? "";
                        if (!string.IsNullOrEmpty(sid) && localPath.StartsWith(@"C:\Users\", System.StringComparison.OrdinalIgnoreCase) && System.IO.Directory.Exists(localPath))
                            validSids.Add(sid);
                    }
            } catch {}

            // Buscar correos en AD en paralelo por cada SID
            var cuentaTasks = new System.Collections.Generic.List<Task<CuentaInfo>>();
            foreach (string sid in validSids)
            {
                string capturedSid = sid;
                cuentaTasks.Add(Task.Run(() =>
                {
                    try
                    {
                        var secId = new System.Security.Principal.SecurityIdentifier(capturedSid);
                        var acc = (System.Security.Principal.NTAccount)secId.Translate(typeof(System.Security.Principal.NTAccount));
                        string fullName = acc.Value;
                        string name = fullName;
                        int slashIdx = fullName.IndexOf('\\');
                        if (slashIdx >= 0) name = fullName.Substring(slashIdx + 1);

                        string tipo = admins.Contains(name) ? "Administrador" : (avanzados.Contains(name) ? "Avanzado" : "Estándar");
                        string correo = "";

                        // AD lookup con timeout corto
                        try
                        {
                            using (var ds = new System.DirectoryServices.DirectorySearcher($"samaccountname={name}"))
                            {
                                ds.ClientTimeout = TimeSpan.FromSeconds(1);
                                ds.ServerTimeLimit = TimeSpan.FromSeconds(1);
                                ds.PropertiesToLoad.Add("mail");
                                var r = ds.FindOne();
                                if (r != null && r.Properties.Contains("mail") && r.Properties["mail"].Count > 0)
                                {
                                    var m = r.Properties["mail"][0].ToString();
                                    if (m.EndsWith("@imss.gob.mx", StringComparison.OrdinalIgnoreCase)) correo = m;
                                }
                            }
                        } catch {}

                        // Fallback Registro por SID
                        if (string.IsNullOrEmpty(correo))
                        {
                            try
                            {
                                using (var key = Microsoft.Win32.Registry.Users.OpenSubKey($@"{capturedSid}\Software\Microsoft\IdentityCRL\UserExtendedProperties"))
                                {
                                    if (key != null)
                                        foreach (var em in key.GetSubKeyNames())
                                            if (em.EndsWith("@imss.gob.mx", StringComparison.OrdinalIgnoreCase))
                                            { correo = em; break; }
                                }
                            } catch {}
                        }

                        return new CuentaInfo { cuenta_windows = fullName, tipo_user = tipo, correo = correo };
                    }
                    catch { return null; }
                }));
            }

            Task.WaitAll(cuentaTasks.ToArray());
            foreach (var t in cuentaTasks)
                if (t.Result != null) result.Add(t.Result);

            return result;
        }

        // ────────────────────────────────────────────────────────────────────────
        // TAREA 5: Programas instalados (Registro + AppX)
        // ────────────────────────────────────────────────────────────────────────
        private static System.Collections.Generic.List<ProgramaInfo> GetProgramas()
        {
            var list = new System.Collections.Generic.List<ProgramaInfo>();
            var seen = new System.Collections.Generic.HashSet<string>(System.StringComparer.OrdinalIgnoreCase);

            GetProgramsFromRegistry(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", Microsoft.Win32.Registry.LocalMachine, list, seen);
            GetProgramsFromRegistry(@"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall", Microsoft.Win32.Registry.LocalMachine, list, seen);
            GetProgramsFromRegistry(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", Microsoft.Win32.Registry.CurrentUser, list, seen);
            GetAppxPackages(list, seen);

            return list;
        }

        // ────────────────────────────────────────────────────────────────────────
        // Entry point — corre las 5 tareas en paralelo
        // ────────────────────────────────────────────────────────────────────────
        public static HardwareInfo GetHardwareInfo()
        {
            var info = new HardwareInfo
            {
                nom_pc = Environment.MachineName,
                usuario_pc = Environment.UserName
            };

            // Rol del usuario actual (instantáneo, sin red)
            try
            {
                using (var identity = System.Security.Principal.WindowsIdentity.GetCurrent())
                {
                    if (identity != null && !string.IsNullOrEmpty(identity.Name))
                        info.usuario_pc = identity.Name;
                    var principal = new System.Security.Principal.WindowsPrincipal(identity);
                    info.tipo_usuario_pc = principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator)
                        ? "Administrador"
                        : (principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.PowerUser) ? "Avanzado" : "Estándar");
                }
            }
            catch { }

            // Lanzar las 5 tareas en paralelo
            var t1 = Task.Run(() => FillHardware(info));
            var t2 = Task.Run(() => GetAntivirusDate());
            var t3 = Task.Run(() => GetCurrentUserEmail());
            var t4 = Task.Run(() => GetCuentas());
            var t5 = Task.Run(() => GetProgramas());

            Task.WaitAll(t1, t2, t3, t4, t5);

            info.fecha_act_antivirus = t2.Result;

            string email = t3.Result;
            if (!string.IsNullOrEmpty(email)) info.correos_usuario.Add(email);

            info.cuentasList = t4.Result;
            info.programas   = t5.Result;

            // Promover usuario logueado actualmente al top de la lista
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT UserName FROM Win32_ComputerSystem"))
                {
                    foreach (ManagementObject o in searcher.Get())
                    {
                        string loggedUser = o["UserName"]?.ToString();
                        if (!string.IsNullOrEmpty(loggedUser))
                        {
                            var idx = info.cuentasList.FindIndex(c =>
                                c.cuenta_windows.Equals(loggedUser, StringComparison.OrdinalIgnoreCase) ||
                                c.cuenta_windows.EndsWith("\\" + loggedUser.Split('\\')[loggedUser.Split('\\').Length - 1], StringComparison.OrdinalIgnoreCase));
                            if (idx > 0)
                            {
                                var item = info.cuentasList[idx];
                                info.cuentasList.RemoveAt(idx);
                                info.cuentasList.Insert(0, item);
                            }
                        }
                    }
                }
            } catch {}

            return info;
        }
    }
}
