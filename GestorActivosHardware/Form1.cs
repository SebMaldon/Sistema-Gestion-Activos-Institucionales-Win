using Microsoft.Data.SqlClient;
using Microsoft.Win32;
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Management;
using System.Windows.Forms;
using System.DirectoryServices.AccountManagement;

namespace GestorActivosHardware
{
    public partial class FormPrincipal : Form
    {
        // Diccionario para acceder fácilmente a los campos por su nombre en la base de datos
        private Dictionary<string, TextBox> camposSql = new Dictionary<string, TextBox>();
        // Guarda los valores exactos que vienen de la base de datos
        private Dictionary<string, string> valoresOriginales = new Dictionary<string, string>();
        // Color para resaltar cambios (puedes usar Gold, LightYellow o PeachPuff)
        private Color colorCambio = Color.LemonChiffon;
        // Cadena de conexión
        private string connectionString = @"Server=localhost;Database=inventario;User ID=sa;Password=Basedatos1!;TrustServerCertificate=True";

        public FormPrincipal()
        {
            InitializeComponent();
            this.Load += (s, e) =>
            {
                ConfigurarInterfaz();
                GenerarTarjetas();
                CargarDatosDesdeBD();
            };
        }

        #region Diseño y UI Responsiva

        private void ConfigurarInterfaz()
        {
            flowLayoutPanel1.Padding = new Padding(20, 80, 20, 20);
        }

        private void GenerarTarjetas()
        {
            camposSql.Clear();
            flowLayoutPanel1.Controls.Clear();

            // Card 1: IDENTIDAD DEL ACTIVO
            CrearCard("IDENTIDAD DEL ACTIVO", new[] {
        ("Número de Serie (PK)", "num_serie"), ("Nombre de la PC", "nom_pc"),
        ("ID de Bienes", "IDBienes"), ("Número de Inventario", "num_inv")
      });

            // Card 2: DETALLES DE HARDWARE
            CrearCard("DETALLES DE HARDWARE", new[] {
        ("Modelo del Dispositivo", "clave_modelo"), ("Monitor", "monitor"),
        ("Puerto", "puerto"), ("Switch", "switch")
      });

            // Card 3: CONECTIVIDAD DE RED
            CrearCard("CONECTIVIDAD DE RED", new[] {
        ("Dirección IP", "dir_ip"), ("Dirección MAC", "mac_address")
      });

            // Card 4: SISTEMA OPERATIVO
            CrearCard("SISTEMA OPERATIVO", new[] {
        ("Sistema Operativo", "clave_so"), ("Antivirus", "Antivirus")
      });

            // Card 5: ASIGNACIÓN Y UBICACIÓN
            CrearCard("ASIGNACIÓN Y UBICACIÓN", new[] {
        ("Ubicación Física", "ubicacion"), ("Nombre del Usuario", "N_user"),
        ("Matrícula/ID Usuario", "m_User"), ("Correo Electrónico", "correo"),
        ("Extensión Telefónica", "extension")
      });

            // Card 6: ESTATUS Y CONTROL
            CrearCard("ESTATUS Y CONTROL", new[] {
        ("Estatus del Activo", "status"), ("Clave de Inmueble", "clave"),
        ("Clave de Proyecto", "clave_proy"), ("Fecha Adquisición", "fecha_adq"),
        ("Observaciones", "observaciones")
      });
        }

        private void CrearCard(string titulo, (string label, string sqlField)[] campos)
        {
            // 1. Panel principal de la tarjeta (El contenedor)
            Panel card = new Panel
            {
                BackColor = Color.White,
                Margin = new Padding(15),
                Padding = new Padding(10), // Espacio de seguridad interno
                Size = new Size(350, 150 + (campos.Length * 65))
            };
            card.Paint += OnCardPaint;

            // 2. Título de la tarjeta - Usamos un Label con margen inferior
            Label lblTitulo = new Label
            {
                Text = titulo.ToUpper(),
                Font = new Font("Segoe UI Variable Display", 11, FontStyle.Bold),
                ForeColor = Color.FromArgb(0, 120, 215),
                Dock = DockStyle.Top,
                Height = 45,
                TextAlign = ContentAlignment.BottomLeft, // Texto pegado abajo para dar aire arriba
                Padding = new Padding(10, 0, 0, 5)
            };

            // 3. Panel de Contenido - Este contendrá los inputs y tendrá un margen superior
            Panel contenedorInterno = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(10, 10, 10, 10) // Aquí damos el espacio para que no toque el título
            };

            TableLayoutPanel cuerpo = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = campos.Length * 2,
                AutoSize = true
            };
            cuerpo.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

            foreach (var campo in campos)
            {
                // Etiqueta del campo
                cuerpo.Controls.Add(new Label
                {
                    Text = campo.label,
                    Font = new Font("Segoe UI", 9, FontStyle.Bold),
                    ForeColor = Color.Gray,
                    AutoSize = true,
                    Margin = new Padding(0, 10, 0, 0)
                });

                // TextBox del campo
                TextBox txt = new TextBox
                {
                    Name = campo.sqlField,
                    Dock = DockStyle.Top,
                    BorderStyle = BorderStyle.FixedSingle,
                    ReadOnly = true,
                    BackColor = Color.FromArgb(248, 249, 250),
                    Font = new Font("Segoe UI", 10),
                    Height = 32
                };

                // CREAR MENÚ CONTEXTUAL PARA EL TEXTBOX
                ContextMenuStrip menu = new ContextMenuStrip();
                ToolStripMenuItem itemCancelar = new ToolStripMenuItem("Cancelar Cambio");
                itemCancelar.Click += (s, e) => {
                    if (valoresOriginales.ContainsKey(txt.Name))
                    {
                        txt.Text = valoresOriginales[txt.Name];
                        ResaltarSiCambio(txt); // Quitará el resaltado al ser iguales
                    }
                };
                menu.Items.Add(itemCancelar);
                txt.ContextMenuStrip = menu;

                // Evento para resaltar si el usuario escribe manualmente (si habilitas edición)
                txt.TextChanged += (s, e) => ResaltarSiCambio(txt);

                cuerpo.Controls.Add(txt);
                if (!camposSql.ContainsKey(campo.sqlField)) camposSql.Add(campo.sqlField, txt);
            }

            // ENSAMBLAJE: El orden importa mucho
            contenedorInterno.Controls.Add(cuerpo);
            card.Controls.Add(contenedorInterno); // Se agrega el contenido
            card.Controls.Add(lblTitulo);        // Se agrega el título al final para que quede arriba

            flowLayoutPanel1.Controls.Add(card);
        }

        private void ResaltarSiCambio(TextBox txt)
        {
            if (valoresOriginales.ContainsKey(txt.Name))
            {
                string valorBD = valoresOriginales[txt.Name];

                if (txt.Text != valorBD)
                {
                    // Si hay cambio, el color de resaltado manda siempre
                    txt.BackColor = colorCambio;
                    txt.Font = new Font(txt.Font, FontStyle.Bold);
                }
                else
                {
                    // Si NO hay cambio, el color depende de si es editable o no
                    // Blanco si es editable, Gris claro si está bloqueado
                    txt.BackColor = txt.ReadOnly ? Color.FromArgb(248, 249, 250) : Color.White;
                    txt.Font = new Font(txt.Font, FontStyle.Regular);
                }
            }
        }
        private void OnCardPaint(object sender, PaintEventArgs e)
        {
            Panel p = (Panel)sender;
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            GraphicsPath path = new GraphicsPath();
            int r = 25; // Radio del redondeo
            path.AddArc(0, 0, r, r, 180, 90);
            path.AddArc(p.Width - r, 0, r, r, 270, 90);
            path.AddArc(p.Width - r, p.Height - r, r, r, 0, 90);
            path.AddArc(0, p.Height - r, r, r, 90, 90);
            p.Region = new Region(path);
        }

        private void FormPrincipal_Resize(object sender, EventArgs e)
        {
            int margin = 15;
            foreach (Control card in flowLayoutPanel1.Controls)
            {
                // Ajuste para 3, 2 o 1 columna según el ancho
                int col = flowLayoutPanel1.Width > 1100 ? 3 : (flowLayoutPanel1.Width > 750 ? 2 : 1);
                card.Width = (flowLayoutPanel1.Width / col) - (margin * 2);
            }
        }

        // Método para sincronizar el diccionario de respaldo después de guardar
        private void ActualizarRespaldosLocales()
        {
            foreach (var item in camposSql)
            {
                if (valoresOriginales.ContainsKey(item.Key))
                    valoresOriginales[item.Key] = item.Value.Text;
                else
                    valoresOriginales.Add(item.Key, item.Value.Text);

                // Quitamos el resaltado amarillo ya que ahora los datos son iguales a la BD
                item.Value.BackColor = Color.FromArgb(248, 249, 250);
                item.Value.Font = new Font(item.Value.Font, FontStyle.Regular);
            }
        }

        // Función auxiliar para que el resumen no use nombres de columnas SQL
        private string ObtenerNombreAmigable(string campoSql)
        {
            switch (campoSql)
            {
                case "num_serie": return "Número de Serie";
                case "clave_modelo": return "Modelo del Dispositivo";
                case "nom_pc": return "Nombre de la PC";
                case "monitor": return "Monitor";
                case "dir_ip": return "Dirección IP";
                case "N_user": return "Nombre del Usuario";
                case "correo": return "Correo Electrónico";
                default: return campoSql; // Si no está en la lista, devuelve el original
            }
        }

        #endregion

        #region Lógica de Negocio (WMI y SQL)

        private void CargarDatosDesdeBD()
        {
            string serialPC = "";

            // 1. Obtenemos el Serial de la PC actual mediante WMI
            try
            {
                ManagementObjectSearcher searcher = new ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BIOS");
                foreach (ManagementObject obj in searcher.Get())
                {
                    serialPC = obj["SerialNumber"]?.ToString();
                }
            }
            catch { return; }

            if (string.IsNullOrEmpty(serialPC)) return;

            // 2. Buscamos en la Base de Datos
            string query = "SELECT * FROM inventario1 WHERE num_serie = @serial";

            using (SqlConnection conn = new SqlConnection(connectionString))
            {
                try
                {
                    conn.Open();
                    SqlCommand cmd = new SqlCommand(query, conn);
                    cmd.Parameters.AddWithValue("@serial", serialPC);

                    using (SqlDataReader reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            valoresOriginales.Clear(); // Limpiamos respaldos anteriores

                            for (int i = 0; i < reader.FieldCount; i++)
                            {
                                string columna = reader.GetName(i);
                                string valor = reader[i]?.ToString() ?? "";

                                if (camposSql.ContainsKey(columna))
                                {
                                    camposSql[columna].Text = valor;
                                    // GUARDAMOS EL RESPALDO
                                    if (!valoresOriginales.ContainsKey(columna))
                                        valoresOriginales.Add(columna, valor);
                                    else
                                        valoresOriginales[columna] = valor;

                                    // Quitamos cualquier resaltado previo
                                    camposSql[columna].BackColor = Color.FromArgb(248, 249, 250);
                                    camposSql[columna].Font = new Font(camposSql[columna].Font, FontStyle.Regular);
                                }
                            }
                        }
                    }
                }
                catch (Exception ex) { Console.WriteLine(ex.Message); }
            }
        }

        // Método auxiliar para refrescar datos que cambian (IP, Usuario) sin borrar lo de la BD
        private void ActualizarDatosLocalesSoloLectura()
        {
            camposSql["nom_pc"].Text = Environment.MachineName;
            camposSql["N_user"].Text = Environment.UserName;

            // Red
            var net = new ManagementObjectSearcher("SELECT IPAddress FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled = 'TRUE'");
            foreach (ManagementObject obj in net.Get())
            {
                string[] ips = (string[])obj["IPAddress"];
                if (ips != null) camposSql["dir_ip"].Text = ips[0];
            }
        }

        private void btnObtenerDatos_Click_1(object sender, EventArgs e)
        {
            try
            {
                // 1. Obtener Serial (PK)
                ManagementObjectSearcher bios = new ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BIOS");
                foreach (ManagementObject obj in bios.Get())
                    camposSql["num_serie"].Text = obj["SerialNumber"]?.ToString();

                // 2. Obtener Red (IP y MAC)
                ManagementObjectSearcher net = new ManagementObjectSearcher("SELECT IPAddress, MACAddress FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled = 'TRUE'");
                foreach (ManagementObject obj in net.Get())
                {
                    string[] ips = (string[])obj["IPAddress"];
                    if (ips != null && ips.Length > 0) camposSql["dir_ip"].Text = ips[0];
                    camposSql["mac_address"].Text = obj["MACAddress"]?.ToString();
                }

                // 3. Obtener Información del Monitor (NUEVO)
                ManagementObjectSearcher monitorSearcher = new ManagementObjectSearcher("SELECT Caption FROM Win32_DesktopMonitor");
                List<string> listaMonitores = new List<string>();
                foreach (ManagementObject obj in monitorSearcher.Get())
                {
                    string name = obj["Caption"]?.ToString();
                    if (!string.IsNullOrEmpty(name)) listaMonitores.Add(name);
                }
                // Unimos los nombres si hay más de uno (ej. "Monitor1, Monitor2")
                string monitoresDetectados = string.Join(", ", listaMonitores);
                camposSql["monitor"].Text = monitoresDetectados.Length > 70 ? monitoresDetectados.Substring(0, 70) : monitoresDetectados;

                // 4. Obtener Sistema Operativo Detallado
                /*ManagementObjectSearcher os = new ManagementObjectSearcher("SELECT Caption FROM Win32_OperatingSystem");
                foreach (ManagementObject obj in os.Get())
                {
                    string fullOS = obj["Caption"]?.ToString() ?? "";
                    camposSql["clave_so"].Text = fullOS.Replace("Microsoft ", "").Trim();
                }*/

                // 4. Obtener clave de producto de Windows
                ManagementObjectSearcher searcherKey = new ManagementObjectSearcher("SELECT OA3xOriginalProductKey FROM SoftwareLicensingService");
                foreach (ManagementObject obj in searcherKey.Get())
                {
                    string productKey = obj["OA3xOriginalProductKey"]?.ToString();
                    if (!string.IsNullOrEmpty(productKey))
                    {
                        // Asignamos al campo clave_so
                        camposSql["clave_so"].Text = productKey;
                    }
                }

                // 5. Nombre de PC y Usuario Actual
                camposSql["nom_pc"].Text = Environment.MachineName;
                camposSql["N_user"].Text = Environment.UserName;

                //6. Obtener el Modelo del dispostitivo
                ManagementObjectSearcher modelSearcher = new ManagementObjectSearcher("SELECT Name FROM Win32_ComputerSystemProduct");
                foreach (ManagementObject obj in modelSearcher.Get())
                {
                    // Asigna el nombre comercial (ej. "HP ProBook 440 G8") al campo clave_modelo
                    camposSql["clave_modelo"].Text = obj["Name"]?.ToString();
                }

                // 6. Obtener Correo Electrónico (Versión Mejorada)
                try
                {
                    string email = null;

                    // Intento 1: Cuenta de Dominio / Institucional (Active Directory)
                    try
                    {
                        UserPrincipal user = UserPrincipal.Current;
                        email = user.EmailAddress;
                    }
                    catch { /* Omitir si no hay contexto de dominio */ }

                    // Intento 2: Si falla, buscamos en el Registro (Cuentas Microsoft Modernas)
                    if (string.IsNullOrEmpty(email))
                    {
                        // Ruta 1: Identidades de inicio de sesión
                        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\IdentityCRL\LogonIdentities"))
                        {
                            if (key != null && key.GetSubKeyNames().Length > 0)
                            {
                                email = key.GetSubKeyNames()[0];
                            }
                        }
                    }

                    if (string.IsNullOrEmpty(email))
                    {
                        // Ruta 2: Propiedades extendidas de usuario (Suele contener el email en el nombre de la subllave)
                        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\IdentityCRL\UserExtendedProperties"))
                        {
                            if (key != null && key.GetSubKeyNames().Length > 0)
                            {
                                email = key.GetSubKeyNames()[0];
                            }
                        }
                    }

                    // Resultado final
                    camposSql["correo"].Text = !string.IsNullOrEmpty(email) ? email : "Cuenta Local / No vinculado";
                }
                catch
                {
                    camposSql["correo"].Text = "Error al detectar";
                }

                foreach (var txt in camposSql.Values)
                {
                    ResaltarSiCambio(txt);
                }

                MessageBox.Show("Datos de hardware, monitor y usuario cargados correctamente.");
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error al recuperar información: " + ex.Message);
            }
        }
        private void btnEnviar_Click(object sender, EventArgs e)
        {
            if (string.IsNullOrEmpty(camposSql["num_serie"].Text))
            {
                MessageBox.Show("El Número de Serie es obligatorio.");
                return;
            }

            // 1. Generar resumen de cambios para confirmación
            List<string> listaCambios = new List<string>();
            foreach (var item in camposSql)
            {
                string valorActual = item.Value.Text.Trim();
                string valorOriginal = valoresOriginales.ContainsKey(item.Key) ? valoresOriginales[item.Key].Trim() : "";

                if (valorActual != valorOriginal)
                {
                    string mostrarOriginal = string.IsNullOrEmpty(valorOriginal) ? "[Vacío]" : $"'{valorOriginal}'";
                    string mostrarActual = string.IsNullOrEmpty(valorActual) ? "[Vacío]" : $"'{valorActual}'";
                    listaCambios.Add($"• {item.Key}: de {mostrarOriginal} a {mostrarActual}");
                }
            }

            if (listaCambios.Count == 0)
            {
                MessageBox.Show("No hay cambios nuevos que guardar.");
                return;
            }

            if (MessageBox.Show("¿Confirmar cambios?\n\n" + string.Join("\n", listaCambios), "Auditoría",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.No) return;

            // 2. QUERY EXPANDIDA: Ahora incluye TODOS los campos de las tarjetas
            string query = @"
        IF EXISTS (SELECT 1 FROM inventario1 WHERE num_serie = @num_serie)
        BEGIN
            UPDATE inventario1 SET 
                nom_pc = @nom_pc, IDBienes = @IDBienes, num_inv = @num_inv,
                clave_modelo = @clave_modelo, monitor = @monitor, puerto = @puerto, switch = @switch,
                dir_ip = @dir_ip, mac_address = @mac_address, clave_so = @clave_so, Antivirus = @Antivirus,
                ubicacion = @ubicacion, N_user = @N_user, m_User = @m_User, correo = @correo, extension = @extension,
                status = @status, clave = @clave, clave_proy = @clave_proy, fecha_adq = @fecha_adq,
                observaciones = @observaciones, Actualizacion = GETDATE()
            WHERE num_serie = @num_serie
        END
        ELSE
        BEGIN
            INSERT INTO inventario1 (
                num_serie, nom_pc, IDBienes, num_inv, clave_modelo, monitor, puerto, switch,
                dir_ip, mac_address, clave_so, Antivirus, ubicacion, N_user, m_User, correo, extension,
                status, clave, clave_proy, fecha_adq, observaciones, Actualizacion)
            VALUES (
                @num_serie, @nom_pc, @IDBienes, @num_inv, @clave_modelo, @monitor, @puerto, @switch,
                @dir_ip, @mac_address, @clave_so, @Antivirus, @ubicacion, @N_user, @m_User, @correo, @extension,
                @status, @clave, @clave_proy, @fecha_adq, @observaciones, GETDATE())
        END";

            using (SqlConnection conn = new SqlConnection(connectionString))
            {
                try
                {
                    conn.Open();
                    SqlCommand cmd = new SqlCommand(query, conn);

                    // Mapeo automático de parámetros desde el diccionario
                    foreach (var campo in camposSql)
                    {
                        // Agregamos @ al nombre del campo para que coincida con la query
                        cmd.Parameters.AddWithValue("@" + campo.Key, campo.Value.Text.Trim());
                    }

                    cmd.ExecuteNonQuery();

                    // Sincronizar UI: poner fondos grises y actualizar respaldos
                    ActualizarRespaldosLocales();

                    MessageBox.Show("Base de Datos actualizada con éxito.");
                }
                catch (Exception ex) { MessageBox.Show("Error SQL: " + ex.Message); }
            }
        }
        private void btnEditar_Click(object sender, EventArgs e)
        {
            // 1. Detectamos el modo actual basado en el primer campo
            bool estabaBloqueado = camposSql["num_serie"].ReadOnly;

            // 2. Cambiamos el texto del botón
            btnEditar.Text = estabaBloqueado ? "Bloquear Edición" : "Permitir Edición";

            // 3. Aplicamos el cambio de estado y refrescamos colores
            foreach (var txt in camposSql.Values)
            {
                // Si estaba bloqueado, ahora permitimos edición (!ReadOnly)
                txt.ReadOnly = !estabaBloqueado;

                // Llamamos a nuestra función inteligente para que decida el color correcto
                ResaltarSiCambio(txt);
            }
        }

        private void btnObtenerDatosBD_Click(object sender, EventArgs e)
        {
            CargarDatosDesdeBD();
        }

        #endregion
    }
}