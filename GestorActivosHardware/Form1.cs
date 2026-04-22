using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Management;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Guna.UI2.WinForms;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace GestorActivosHardware
{
    public partial class FormPrincipal : Form
    {
        // ─── API & State ────────────────────────────────────────────────────────
        private readonly HttpClient http = LoginView.Http;
        private string idBienActual = "";
        
        // Data Dictionaries
        private readonly Dictionary<string, Control> campos = new();
        private readonly Dictionary<string, string> dbState = new();
        private readonly Dictionary<string, string> wmiState = new();
        
        // Catalogs
        private readonly Dictionary<string, string> catUsuarios = new();
        private readonly Dictionary<string, string> catModelos = new();
        private readonly Dictionary<string, string> catMarcas = new();
        private readonly Dictionary<string, string> catInmuebles = new();
        private readonly Dictionary<string, string> catUnidades = new();
        private readonly Dictionary<string, string> catUbicaciones = new();
        private int unidadSeleccionadaId = 0;

        // UI Controls
        private FlowLayoutPanel pnlLeds = null!;
        private Guna2Button btnWmi = null!;
        private Guna2Button btnSync = null!;
        private Guna2Button btnSave = null!;

        public FormPrincipal()
        {
            InitializeComponent();
            SetupForm();
            BuildUI();
            Load += async (s, e) => {
                _ = Task.Run(LoadWMI);
                await LoadCatalogs();
            };
        }

        private void SetupForm()
        {
            Text = "Gestor Activos - IMSS";
            Size = new Size(1500, 1000);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = T.BgSurface;
            FormBorderStyle = FormBorderStyle.None;
            
            // ResizeForm = true allows the window to be dragged from edges to resize
            var borderless = new Guna2BorderlessForm { ContainerControl = this, BorderRadius = 15, ResizeForm = true };
        }

        // ═══════════════════════════════════════════════════════════════════════
        // UI BUILDER
        // ═══════════════════════════════════════════════════════════════════════
        private void BuildUI()
        {
            Controls.Clear();
            
            // Titlebar
            var titleBar = new Guna2Panel { Dock = DockStyle.Top, Height = 40, FillColor = T.BgDeep, Width = this.Width };
            var lblTitle = new Label { Text = "Gestor de Activos de Hardware", ForeColor = T.TxtPrimary, Font = T.H3, Location = new Point(20, 10), AutoSize = true };
            
            var btnClose = new Guna2ControlBox { Anchor = AnchorStyles.Top | AnchorStyles.Right, Location = new Point(this.Width - 45, 0), Size = new Size(45, 40), FillColor = Color.Transparent, IconColor = T.TxtSecondary, HoverState = { FillColor = T.LedRed, IconColor = Color.White } };
            var btnMax = new Guna2ControlBox { Anchor = AnchorStyles.Top | AnchorStyles.Right, Location = new Point(this.Width - 90, 0), Size = new Size(45, 40), ControlBoxType = Guna.UI2.WinForms.Enums.ControlBoxType.MaximizeBox, FillColor = Color.Transparent, IconColor = T.TxtSecondary };
            var btnMin = new Guna2ControlBox { Anchor = AnchorStyles.Top | AnchorStyles.Right, Location = new Point(this.Width - 135, 0), Size = new Size(45, 40), ControlBoxType = Guna.UI2.WinForms.Enums.ControlBoxType.MinimizeBox, FillColor = Color.Transparent, IconColor = T.TxtSecondary };
            
            titleBar.Controls.AddRange(new Control[] { lblTitle, btnClose, btnMax, btnMin });
            
            // Sidebar
            var sidebar = new Guna2Panel { Dock = DockStyle.Left, Width = 220, FillColor = T.BgDeep };
            var pnlMenu = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, Padding = new Padding(10, 40, 10, 10) };
            
            btnWmi = CreateMenuButton("Cargar HW (WMI)", T.Accent);
            btnWmi.Click += (_, __) => _ = Task.Run(LoadWMI);
            
            btnSync = CreateMenuButton("Buscar en BD", T.Accent);
            btnSync.Click += async (_, __) => await SyncFromDB();
            
            btnSave = CreateMenuButton("Guardar Cambios", T.Accent);
            btnSave.Click += async (_, __) => await SaveChanges();
            
            var btnTheme = CreateMenuButton("Cambiar Tema 🌗", T.BgOverlay);
            btnTheme.ForeColor = T.TxtPrimary;
            btnTheme.Click += (_, __) => { T.Toggle(); ApplyTheme(this); };
            
            pnlMenu.Controls.AddRange(new Control[] { btnWmi, btnSync, btnSave, btnTheme });
            sidebar.Controls.Add(pnlMenu);

            // Main Content Area
            var pnlMain = new Panel { Dock = DockStyle.Fill, Padding = new Padding(20) };
            
            // Leds (Top)
            pnlLeds = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 90, WrapContents = false, AutoScroll = true };
            
            // Cards (Grid)
            var grid = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1 };
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            
            var card1 = BuildGeneralCard();
            var card2 = BuildTechCard();
            
            grid.Controls.Add(card1, 0, 0);
            grid.Controls.Add(card2, 1, 0);
            
            pnlMain.Controls.Add(grid);
            pnlMain.Controls.Add(pnlLeds);

            Controls.Add(pnlMain);
            Controls.Add(sidebar);
            Controls.Add(titleBar);
            
            // Make draggable
            new Guna2DragControl { TargetControl = titleBar };
            new Guna2DragControl { TargetControl = lblTitle };
        }

        private Guna2Button CreateMenuButton(string text, Color fill)
        {
            return new Guna2Button
            {
                Text = text,
                Width = 200,
                Height = 45,
                Margin = new Padding(0, 0, 0, 15),
                FillColor = fill,
                ForeColor = Color.White,
                Font = T.H3,
                BorderRadius = 8,
                Cursor = Cursors.Hand
            };
        }

        private void ApplyTheme(Control parent)
        {
            parent.SuspendLayout();

            // Cambiar fondo del formulario principal
            if (parent == this) {
                this.BackColor = T.BgSurface;
            }

            Queue<Control> queue = new Queue<Control>();
            queue.Enqueue(parent);

            while (queue.Count > 0)
            {
                Control c = queue.Dequeue();

                if (c is Guna2Panel pnl) {
                    if (pnl.Width == 220 || pnl.Height == 40) pnl.FillColor = T.BgDeep; // Sidebar/Titlebar
                    else pnl.FillColor = T.BgCard; // Main Cards and LED Cards
                }
                else if (c is Guna2TextBox txt) {
                    txt.FillColor = T.BgInput;
                    txt.BorderColor = T.Border;
                    txt.ForeColor = T.TxtPrimary;
                }
                else if (c is Guna2ComboBox cmb) {
                    cmb.FillColor = T.BgInput;
                    cmb.BorderColor = T.Border;
                    cmb.ForeColor = T.TxtPrimary;
                }
                else if (c is ComboBox sc) {
                    sc.BackColor = T.BgInput;
                    sc.ForeColor = T.TxtPrimary;
                    if (sc.Parent is Guna2Panel scPnl) {
                        scPnl.FillColor = T.BgInput;
                        scPnl.BorderColor = T.Border;
                    }
                }
                else if (c is Guna2Button btn) {
                    if (btn.Text == "Cargar HW (WMI)" || btn.Text == "Buscar en BD" || btn.Text == "Guardar Cambios" || btn.Text == "+") {
                        btn.FillColor = T.Accent;
                        btn.ForeColor = Color.White;
                    } else if (btn.Text.Contains("Tema")) {
                        btn.FillColor = T.BgOverlay;
                        btn.ForeColor = T.TxtPrimary;
                    }
                }
                else if (c is Guna2ControlBox cbox) {
                    cbox.IconColor = T.TxtSecondary;
                }
                else if (c is Label lbl) {
                    if (lbl.Font.Size >= 12) lbl.ForeColor = T.TxtPrimary; // Títulos principales
                    else if (lbl.Font.Size == 8) lbl.ForeColor = T.TxtSecondary; // Títulos LED
                    else lbl.ForeColor = T.TxtSecondary; // Labels de input
                }

                foreach (Control child in c.Controls) queue.Enqueue(child);
            }

            // Restaurar bordes de discrepancia (o color normal)
            foreach (var key in campos.Keys) CheckDiscrepancy(key);

            parent.ResumeLayout(true);
        }

        // ─── Cards ─────────────────────────────────────────────────────────────
        private Guna2Panel BuildGeneralCard()
        {
            var pnl = new Guna2Panel { Dock = DockStyle.Fill, FillColor = T.BgCard, BorderRadius = 15, Margin = new Padding(0, 20, 10, 0), Padding = new Padding(20) };
            var lbl = new Label { Text = "DATOS GENERALES", ForeColor = T.TxtPrimary, Font = T.H2, Dock = DockStyle.Top, Height = 40 };
            
            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoScroll = true, FlowDirection = FlowDirection.TopDown, WrapContents = false };
            flow.Resize += (s, e) => { foreach (Control c in flow.Controls) c.Width = flow.Width - 25; };

            AddInput(flow, "Número de Serie", "num_serie");
            AddInput(flow, "Número de Inventario", "num_inv");
            AddCombo(flow, "Estatus Operativo", "estatus_operativo");
            AddCombo(flow, "Inmueble Físico", "clave_inmueble_ref");
            AddCombo(flow, "Unidad Operativa", "id_unidad");
            AddComboPlus(flow, "Departamento/Área", "id_ubicacion", AddUbicacion);
            AddUserSearch(flow, "Usuario a Resguardo", "id_usuario_resguardo");
            AddInput(flow, "Fecha Adquisición", "fecha_adquisicion");

            pnl.Controls.Add(flow);
            pnl.Controls.Add(lbl);
            return pnl;
        }

        private Guna2Panel BuildTechCard()
        {
            var pnl = new Guna2Panel { Dock = DockStyle.Fill, FillColor = T.BgCard, BorderRadius = 15, Margin = new Padding(10, 20, 0, 0), Padding = new Padding(20) };
            var lbl = new Label { Text = "ESPECIFICACIONES TÉCNICAS", ForeColor = T.TxtPrimary, Font = T.H2, Dock = DockStyle.Top, Height = 40 };
            
            var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoScroll = true, FlowDirection = FlowDirection.TopDown, WrapContents = false };
            flow.Resize += (s, e) => { foreach (Control c in flow.Controls) c.Width = flow.Width - 25; };

            AddComboPlus(flow, "Modelo del Equipo", "clave_modelo", AddModelo);
            AddInput(flow, "Nombre Host (PC)", "nom_pc");
            AddInput(flow, "S.O. Detectado", "modelo_so");
            AddInput(flow, "Procesador (CPU)", "cpu_info");
            AddInput(flow, "RAM (GB)", "ram_gb");
            AddInput(flow, "Almacenamiento (GB)", "almacenamiento_gb");
            AddInput(flow, "Dirección IP", "dir_ip");
            AddInput(flow, "Dirección MAC", "mac_address");
            AddInput(flow, "Puerto / Nodo Red", "puerto_red");
            AddInput(flow, "Switch Conectado", "switch_red");

            pnl.Controls.Add(flow);
            pnl.Controls.Add(lbl);
            return pnl;
        }

        // ─── Input Builders ───────────────────────────────────────────────────
        private void AddInput(Control parent, string label, string key)
        {
            var pnl = new Panel { Height = 65, Margin = new Padding(0, 0, 0, 10) };
            var lbl = new Label { Text = label, ForeColor = T.TxtSecondary, Font = T.Small, Dock = DockStyle.Top, Height = 20 };
            var txt = new Guna2TextBox { Name = key, Dock = DockStyle.Fill, FillColor = T.BgInput, BorderColor = T.Border, ForeColor = T.TxtPrimary, BorderRadius = 5 };
            
            // Badge for discrepancy
            var badge = new Guna2CirclePictureBox { Size = new Size(10, 10), FillColor = Color.Transparent, Visible = false };
            txt.IconRight = badge.Image; // Hack to use icon space, or we can use custom painting.
            
            txt.TextChanged += (_, __) => CheckDiscrepancy(key);
            
            pnl.Controls.Add(txt);
            pnl.Controls.Add(lbl);
            parent.Controls.Add(pnl);
            campos[key] = txt;
        }

        private void AddCombo(Control parent, string label, string key)
        {
            var pnl = new Panel { Height = 65, Margin = new Padding(0, 0, 0, 10) };
            var lbl = new Label { Text = label, ForeColor = T.TxtSecondary, Font = T.Small, Dock = DockStyle.Top, Height = 20 };
            var cmb = new Guna2ComboBox { Name = key, Dock = DockStyle.Fill, FillColor = T.BgInput, BorderColor = T.Border, ForeColor = T.TxtPrimary, BorderRadius = 5 };
            
            if (key == "id_unidad") cmb.SelectedIndexChanged += async (_, __) => await OnUnidadChanged();
            cmb.SelectedIndexChanged += (_, __) => CheckDiscrepancy(key);
            
            pnl.Controls.Add(cmb);
            pnl.Controls.Add(lbl);
            parent.Controls.Add(pnl);
            campos[key] = cmb;
        }

        private void AddUserSearch(Control parent, string label, string key)
        {
            var pnl = new Panel { Height = 65, Margin = new Padding(0, 0, 0, 10) };
            var lbl = new Label { Text = label, ForeColor = T.TxtSecondary, Font = T.Small, Dock = DockStyle.Top, Height = 20 };
            
            var row = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1 };
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 45f));
            
            var cmbPnl = new Guna2Panel { Dock = DockStyle.Fill, FillColor = T.BgInput, BorderColor = T.Border, BorderThickness = 1, BorderRadius = 5, Padding = new Padding(5) };
            var cmb = new ComboBox { Name = key, Dock = DockStyle.Fill, BackColor = T.BgInput, ForeColor = T.TxtPrimary, FlatStyle = FlatStyle.Flat, DropDownStyle = ComboBoxStyle.DropDownList };
            cmb.SelectedIndexChanged += (_, __) => CheckDiscrepancy(key);
            cmbPnl.Controls.Add(cmb);
            
            var btn = new Guna2Button { Text = "🔍", Dock = DockStyle.Fill, FillColor = T.BgOverlay, ForeColor = T.TxtPrimary, BorderRadius = 5, Cursor = Cursors.Hand };
            btn.Click += async (_, __) => await SearchUserDialog(cmb);
            
            row.Controls.Add(cmbPnl, 0, 0);
            row.Controls.Add(btn, 1, 0);
            
            pnl.Controls.Add(row);
            pnl.Controls.Add(lbl);
            parent.Controls.Add(pnl);
            campos[key] = cmb;
        }

        private async Task SearchUserDialog(ComboBox cmb)
        {
            string term = Microsoft.VisualBasic.Interaction.InputBox("Ingrese matrícula o nombre completo para buscar:", "Buscar Usuario", "");
            if (string.IsNullOrWhiteSpace(term)) return;
            
            var q = new { query = $@"query {{
                usuarios(pagination:{{first:50}}, filters: {{ or: [
                    {{ matricula: {{ contains: ""{term}"" }} }},
                    {{ nombre_completo: {{ contains: ""{term}"" }} }}
                ]}}) {{ edges {{ node {{ id_usuario matricula nombre_completo }} }} }}
            }}" };
            
            try {
                var r = await GQL(q);
                if (r != null) {
                    var edges = r["usuarios"]?["edges"];
                    if (edges == null || !edges.HasValues) { MessageBox.Show("No se encontraron usuarios."); return; }
                    
                    catUsuarios.Clear();
                    foreach (var e in edges) catUsuarios[e["node"]!["id_usuario"]!.ToString()] = e["node"]!["matricula"] + " - " + e["node"]!["nombre_completo"];
                    
                    FillCombo(cmb.Name, catUsuarios);
                    if (cmb.Items.Count > 0) { cmb.SelectedIndex = 0; cmb.DroppedDown = true; }
                }
            } catch (Exception ex) { MessageBox.Show("Error al buscar: " + ex.Message); }
        }

        private void AddComboPlus(Control parent, string label, string key, Func<Task> onPlus)
        {
            var pnl = new Panel { Height = 65, Margin = new Padding(0, 0, 0, 10) };
            var lbl = new Label { Text = label, ForeColor = T.TxtSecondary, Font = T.Small, Dock = DockStyle.Top, Height = 20 };
            
            var row = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1 };
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 45f));
            
            var cmb = new Guna2ComboBox { Name = key, Dock = DockStyle.Fill, FillColor = T.BgInput, BorderColor = T.Border, ForeColor = T.TxtPrimary, BorderRadius = 5 };
            var btn = new Guna2Button { Text = "+", Dock = DockStyle.Fill, FillColor = T.Accent, ForeColor = Color.White, Font = T.H2, BorderRadius = 5, Cursor = Cursors.Hand };
            
            cmb.SelectedIndexChanged += (_, __) => CheckDiscrepancy(key);
            btn.Click += async (_, __) => await onPlus();
            
            row.Controls.Add(cmb, 0, 0);
            row.Controls.Add(btn, 1, 0);
            
            pnl.Controls.Add(row);
            pnl.Controls.Add(lbl);
            parent.Controls.Add(pnl);
            campos[key] = cmb;
        }

        // ─── Logic ────────────────────────────────────────────────────────────
        private void UpdateLeds()
        {
            if (pnlLeds.InvokeRequired) { Invoke(UpdateLeds); return; }
            pnlLeds.Controls.Clear();
            
            AddLed("Serial", wmiState.GetValueOrDefault("num_serie", "No Disp"));
            AddLed("IP", wmiState.GetValueOrDefault("dir_ip", "No Disp"));
            AddLed("CPU", wmiState.GetValueOrDefault("cpu_info", "No Disp"));
            AddLed("RAM", wmiState.GetValueOrDefault("ram_gb", "0") + " GB");
        }

        private void AddLed(string title, string value)
        {
            var card = new Guna2Panel { Width = 280, Height = 70, FillColor = T.BgCard, BorderRadius = 10, Margin = new Padding(0, 0, 15, 0), Padding = new Padding(15, 10, 15, 10) };
            var lblT = new Label { Text = title, ForeColor = T.TxtSecondary, Font = T.Caption, Dock = DockStyle.Top, Height = 15 };
            var lblV = new Label { Text = value, ForeColor = T.TxtPrimary, Font = T.H3, Dock = DockStyle.Fill, AutoEllipsis = true };
            
            var dot = new Guna2CirclePictureBox { Size = new Size(10, 10), FillColor = value.Contains("No Disp") ? T.LedRed : T.LedGreen, Location = new Point(255, 15) };
            
            card.Controls.Add(dot);
            card.Controls.Add(lblV);
            card.Controls.Add(lblT);
            pnlLeds.Controls.Add(card);
        }

        private void CheckDiscrepancy(string key)
        {
            if (!campos.ContainsKey(key)) return;
            var ctrl = campos[key];
            string currentVal = GetVal(key);
            
            bool hasDb = dbState.TryGetValue(key, out var dbVal);
            bool hasWmi = wmiState.TryGetValue(key, out var wmiVal);
            
            Color edgeColor = T.Border;
            
            if (hasDb && currentVal != dbVal && !string.IsNullOrEmpty(currentVal)) {
                edgeColor = T.LedYellow; // Changed from DB
            }
            if (hasWmi && currentVal != wmiVal && !string.IsNullOrEmpty(currentVal) && key != "num_serie") {
                edgeColor = T.LedRed; // Discrepancy with physical HW
            }
            
            if (ctrl is Guna2TextBox txt) {
                txt.BorderColor = edgeColor;
                txt.BorderThickness = edgeColor == T.Border ? 1 : 2;
            } else if (ctrl is Guna2ComboBox cmb) {
                cmb.BorderColor = edgeColor;
                cmb.BorderThickness = edgeColor == T.Border ? 1 : 2;
            } else if (ctrl is ComboBox c) {
                c.Parent.BackColor = edgeColor;
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // WMI
        // ═══════════════════════════════════════════════════════════════════════
        private void LoadWMI()
        {
            try {
                wmiState["nom_pc"] = Environment.MachineName;
                
                using (var searcher = new ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BIOS"))
                foreach (ManagementObject o in searcher.Get()) wmiState["num_serie"] = o["SerialNumber"]?.ToString()?.Trim() ?? "";

                using (var searcher = new ManagementObjectSearcher("SELECT IPAddress,MACAddress FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled='TRUE'"))
                foreach (ManagementObject o in searcher.Get()) {
                    if (o["IPAddress"] is string[] ips && ips.Length > 0) wmiState["dir_ip"] = ips[0];
                    wmiState["mac_address"] = o["MACAddress"]?.ToString() ?? "";
                }

                using (var searcher = new ManagementObjectSearcher("SELECT Name FROM Win32_Processor"))
                foreach (ManagementObject o in searcher.Get()) wmiState["cpu_info"] = o["Name"]?.ToString()?.Trim() ?? "";

                long ramBytes = 0;
                using (var searcher = new ManagementObjectSearcher("SELECT Capacity FROM Win32_PhysicalMemory"))
                foreach (ManagementObject o in searcher.Get()) ramBytes += Convert.ToInt64(o["Capacity"]);
                wmiState["ram_gb"] = (ramBytes / (1024L * 1024 * 1024)).ToString();

                long diskBytes = 0;
                using (var searcher = new ManagementObjectSearcher("SELECT Size FROM Win32_DiskDrive WHERE MediaType='Fixed hard disk media'"))
                foreach (ManagementObject o in searcher.Get()) if (o["Size"] != null) diskBytes += Convert.ToInt64(o["Size"]);
                wmiState["almacenamiento_gb"] = diskBytes > 0 ? (diskBytes / (1024L * 1024 * 1024)).ToString() : "256";

                using (var searcher = new ManagementObjectSearcher("SELECT Caption FROM Win32_OperatingSystem"))
                foreach (ManagementObject o in searcher.Get()) wmiState["modelo_so"] = o["Caption"]?.ToString()?.Replace("Microsoft ", "")?.Trim() ?? "";

                Invoke(() => {
                    UpdateLeds();
                    // Auto-fill empty fields
                    foreach(var kv in wmiState) {
                        if(string.IsNullOrEmpty(GetVal(kv.Key))) SetVal(kv.Key, kv.Value);
                    }
                });
            } catch (Exception ex) { Console.WriteLine("WMI Error: " + ex.Message); }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // GraphQL
        // ═══════════════════════════════════════════════════════════════════════
        private async Task LoadCatalogs()
        {
            var q = new { query = @"query {
                catModelos { clave_modelo descrip_disp }
                marcas { clave_marca marca }
                inmuebles { clave descripcion desc_corta }
                unidades { id_unidad nombre }
            }"};
            
            try {
                var data = await GQL(q);
                if (data == null) return;

                catModelos.Clear(); foreach (var m in data["catModelos"]!) catModelos[m["clave_modelo"]!.ToString()] = m["descrip_disp"]?.ToString() ?? "";
                catMarcas.Clear(); foreach (var m in data["marcas"]!) catMarcas[m["clave_marca"]!.ToString()] = m["marca"]?.ToString() ?? "";
                catInmuebles.Clear(); foreach (var i in data["inmuebles"]!) catInmuebles[i["clave"]!.ToString()] = i["desc_corta"]?.ToString() ?? i["descripcion"]?.ToString() ?? "";
                catUnidades.Clear(); foreach (var u in data["unidades"]!) catUnidades[u["id_unidad"]!.ToString()] = u["nombre"]?.ToString() ?? "";

                FillCombo("clave_modelo", catModelos);
                FillCombo("clave_inmueble_ref", catInmuebles);
                FillCombo("id_unidad", catUnidades);
                
                var cmbEst = campos["estatus_operativo"] as Guna2ComboBox;
                if (cmbEst != null) { cmbEst.Items.Clear(); cmbEst.Items.AddRange(new object[] { "ACTIVO", "INACTIVO", "EN REPARACIÓN", "BAJA" }); }

            } catch { }
        }

        private async Task OnUnidadChanged(bool forceRefresh = false)
        {
            var idStr = GetVal("id_unidad");
            if (!int.TryParse(idStr, out int idU)) return;
            if (!forceRefresh && idU == unidadSeleccionadaId) return;
            
            unidadSeleccionadaId = idU;
            
            var q = new { query = $"query {{ ubicacionesPorUnidad(id_unidad: {idU}) {{ id_ubicacion nombre_ubicacion }} }}" };
            try {
                var data = await GQL(q);
                catUbicaciones.Clear();
                if (data != null) foreach (var u in data["ubicacionesPorUnidad"]!) catUbicaciones[u["id_ubicacion"]!.ToString()] = u["nombre_ubicacion"]!.ToString();
                FillCombo("id_ubicacion", catUbicaciones);
            } catch { }
        }

        private async Task SyncFromDB()
        {
            string ser = GetVal("num_serie");
            if (string.IsNullOrEmpty(ser)) { MessageBox.Show("Ingrese un número de serie."); return; }

            btnSync.Enabled = false;
            var q = new { query = $@"query {{
                bienByNumSerie(num_serie: ""{ser}"") {{
                    id_bien num_inv estatus_operativo clave_inmueble_ref clave_modelo id_usuario_resguardo id_unidad id_ubicacion fecha_adquisicion
                    especificacionTI {{ nom_pc cpu_info ram_gb almacenamiento_gb mac_address dir_ip puerto_red switch_red modelo_so }}
                }}
            }}"};
            
            try {
                var data = await GQL(q);
                var bien = data?["bienByNumSerie"];
                if (bien == null || bien.Type == JTokenType.Null) { MessageBox.Show("No encontrado en BD."); btnSync.Enabled = true; return; }

                idBienActual = bien["id_bien"]!.ToString();
                dbState.Clear();

                SetDBState("num_inv", bien["num_inv"]?.ToString());
                SetDBState("fecha_adquisicion", bien["fecha_adquisicion"]?.Type != JTokenType.Null ? Convert.ToDateTime(bien["fecha_adquisicion"]).ToString("dd/MM/yyyy") : "");
                SetDBState("estatus_operativo", bien["estatus_operativo"]?.ToString()?.ToUpper());
                SetDBState("clave_inmueble_ref", bien["clave_inmueble_ref"]?.ToString());
                SetDBState("clave_modelo", bien["clave_modelo"]?.ToString());
                SetDBState("id_usuario_resguardo", bien["id_usuario_resguardo"]?.ToString());
                
                string sUnidad = bien["id_unidad"]?.ToString() ?? "";
                SetDBState("id_unidad", sUnidad);
                if (int.TryParse(sUnidad, out int idu)) { 
                    SetVal("id_unidad", sUnidad);
                    await OnUnidadChanged(true); // Force fetch ubicaciones for this unit
                }
                
                SetDBState("id_ubicacion", bien["id_ubicacion"]?.ToString());
                SetVal("id_ubicacion", bien["id_ubicacion"]?.ToString() ?? "");

                // Load User data specifically if it exists to populate the dropdown
                string idUser = bien["id_usuario_resguardo"]?.ToString() ?? "";
                if (!string.IsNullOrEmpty(idUser) && idUser != "0") {
                    try {
                        var qu = new { query = $@"query {{ usuarios(filters: {{ id_usuario: {{ eq: {idUser} }} }}) {{ edges {{ node {{ matricula nombre_completo }} }} }} }}" };
                        var rU = await GQL(qu);
                        if (rU != null && rU["usuarios"]?["edges"]?.HasValues == true) {
                            var n = rU["usuarios"]!["edges"]![0]!["node"]!;
                            catUsuarios[idUser] = n["matricula"] + " - " + n["nombre_completo"];
                            FillCombo("id_usuario_resguardo", catUsuarios);
                        }
                    } catch { }
                }

                var esp = bien["especificacionTI"];
                if (esp != null && esp.Type != JTokenType.Null) {
                    SetDBState("nom_pc", esp["nom_pc"]?.ToString());
                    SetDBState("cpu_info", esp["cpu_info"]?.ToString());
                    SetDBState("ram_gb", esp["ram_gb"]?.ToString());
                    SetDBState("almacenamiento_gb", esp["almacenamiento_gb"]?.ToString());
                    SetDBState("mac_address", esp["mac_address"]?.ToString());
                    SetDBState("dir_ip", esp["dir_ip"]?.ToString());
                    SetDBState("puerto_red", esp["puerto_red"]?.ToString());
                    SetDBState("switch_red", esp["switch_red"]?.ToString());
                    SetDBState("modelo_so", esp["modelo_so"]?.ToString());
                }
                
                // Refresh UI to show db states
                foreach(var kv in dbState) SetVal(kv.Key, kv.Value);
                MessageBox.Show("Sincronizado con BD.");
            } catch (Exception ex) { MessageBox.Show("Error: " + ex.Message); }
            btnSync.Enabled = true;
        }

        private async Task SaveChanges()
        {
            int.TryParse(GetVal("ram_gb"), out int ram);
            int.TryParse(GetVal("almacenamiento_gb"), out int alm);
            int.TryParse(GetVal("id_usuario_resguardo"), out int idUser);
            int.TryParse(GetVal("id_unidad"), out int idUnidad);
            int.TryParse(GetVal("id_ubicacion"), out int idUbicacion);

            string N(string v) => string.IsNullOrEmpty(v) ? "null" : $"\"{v}\"";

            try {
                btnSave.Enabled = false;

                // Si no hay idBienActual, es un registro nuevo (CREATE)
                if (string.IsNullOrEmpty(idBienActual)) {
                    var mutCreate = new { query = $@"mutation {{ createBien(
                        id_categoria: 1 id_unidad_medida: 1 num_serie: {N(GetVal("num_serie"))} num_inv: {N(GetVal("num_inv"))} estatus_operativo: {N(GetVal("estatus_operativo"))}
                        clave_inmueble_ref: {N(GetVal("clave_inmueble_ref"))} clave_modelo: {N(GetVal("clave_modelo"))}
                        id_usuario_resguardo: {(idUser > 0 ? idUser.ToString() : "null")} id_unidad: {(idUnidad > 0 ? idUnidad.ToString() : "null")} id_ubicacion: {(idUbicacion > 0 ? idUbicacion.ToString() : "null")}
                    ) {{ id_bien }} }}" };
                    
                    var rCreate = await GQL(mutCreate);
                    if (rCreate != null) {
                        idBienActual = rCreate["createBien"]!["id_bien"]!.ToString();
                    } else {
                        throw new Exception("Fallo al crear el Bien base.");
                    }
                } 
                else {
                    // ACTUALIZAR EXISTENTE
                    var mutBien = new { query = $@"mutation {{ updateBien(
                        id_bien: ""{idBienActual}"" num_inv: {N(GetVal("num_inv"))} estatus_operativo: {N(GetVal("estatus_operativo"))}
                        clave_inmueble_ref: {N(GetVal("clave_inmueble_ref"))} clave_modelo: {N(GetVal("clave_modelo"))}
                        id_usuario_resguardo: {(idUser > 0 ? idUser.ToString() : "null")} id_unidad: {(idUnidad > 0 ? idUnidad.ToString() : "null")} id_ubicacion: {(idUbicacion > 0 ? idUbicacion.ToString() : "null")}
                    ) {{ id_bien }} }}" };
                    await GQL(mutBien);
                }

                // SIEMPRE UPSERT SPECS
                var mutSpec = new { query = $@"mutation {{ upsertEspecificacionTI(
                    id_bien: ""{idBienActual}"" nom_pc: {N(GetVal("nom_pc"))} cpu_info: {N(GetVal("cpu_info"))} ram_gb: {ram} almacenamiento_gb: {alm}
                    mac_address: {N(GetVal("mac_address"))} dir_ip: {N(GetVal("dir_ip"))} puerto_red: {N(GetVal("puerto_red"))} switch_red: {N(GetVal("switch_red"))} modelo_so: {N(GetVal("modelo_so"))}
                ) {{ id_bien }} }}" };

                var rSpec = await GQL(mutSpec);
                
                MessageBox.Show("Guardado exitoso.");
                await SyncFromDB(); // Reload state
            } catch (Exception ex) { MessageBox.Show("Error: " + ex.Message); }
            btnSave.Enabled = true;
        }

        // ─── Helpers ──────────────────────────────────────────────────────────
        private async Task<JObject?> GQL(object body) {
            var resp = await http.PostAsync("", new StringContent(JsonConvert.SerializeObject(body), Encoding.UTF8, "application/json"));
            var root = JObject.Parse(await resp.Content.ReadAsStringAsync());
            if (root["errors"] != null) { Console.WriteLine("GQL Error: " + root["errors"]); return null; }
            return root["data"] as JObject;
        }

        private void FillCombo(string key, Dictionary<string, string> dict) {
            if (!campos.ContainsKey(key)) return;
            var ctrl = campos[key];
            if (ctrl is Guna2ComboBox cmb) {
                cmb.Items.Clear(); foreach (var kv in dict) cmb.Items.Add(new KV(kv.Key, kv.Value));
                cmb.DisplayMember = "Valor"; cmb.ValueMember = "Clave";
            } else if (ctrl is ComboBox c) {
                c.Items.Clear(); foreach (var kv in dict) c.Items.Add(new KV(kv.Key, kv.Value));
                c.DisplayMember = "Valor"; c.ValueMember = "Clave";
            }
        }

        private string GetVal(string key) {
            if (!campos.ContainsKey(key)) return "";
            var c = campos[key];
            if (c is Guna2TextBox t) return t.Text.Trim();
            if (c is Guna2ComboBox cmb && cmb.SelectedItem is KV kv) return kv.Clave;
            if (c is Guna2ComboBox cmb2 && cmb2.SelectedItem is string s) return s;
            if (c is ComboBox sc && sc.SelectedItem is KV skv) return skv.Clave;
            return c.Text.Trim();
        }

        private void SetVal(string key, string val) {
            if (!campos.ContainsKey(key)) return;
            var c = campos[key];
            if (c is Guna2TextBox t) { t.Text = val; }
            else if (c is Guna2ComboBox cmb) {
                if (key == "estatus_operativo") cmb.SelectedItem = val;
                else { foreach (KV kv in cmb.Items) if (kv.Clave == val) { cmb.SelectedItem = kv; break; } }
            }
            else if (c is ComboBox sc) {
                foreach (KV kv in sc.Items) if (kv.Clave == val) { sc.SelectedItem = kv; break; }
            }
            CheckDiscrepancy(key);
        }

        private void SetDBState(string key, string? val) {
            dbState[key] = val ?? "";
        }

        // ─── Dialogs ──────────────────────────────────────────────────────────
        private async Task AddUbicacion() {
            if (unidadSeleccionadaId == 0) { MessageBox.Show("Seleccione Unidad primero."); return; }
            string input = Microsoft.VisualBasic.Interaction.InputBox("Nombre de la ubicación:", "Nueva Ubicación", "");
            if (string.IsNullOrWhiteSpace(input)) return;
            
            var mut = new { query = $"mutation {{ createUbicacion(id_unidad:{unidadSeleccionadaId}, nombre_ubicacion:\"{input.Trim()}\") {{ id_ubicacion nombre_ubicacion }} }}" };
            var r = await GQL(mut);
            if (r != null) {
                var nueva = r["createUbicacion"]!;
                catUbicaciones[nueva["id_ubicacion"]!.ToString()] = nueva["nombre_ubicacion"]!.ToString();
                FillCombo("id_ubicacion", catUbicaciones);
                SetVal("id_ubicacion", nueva["id_ubicacion"]!.ToString());
            }
        }

        private async Task AddModelo() {
            string clave = Microsoft.VisualBasic.Interaction.InputBox("Clave Modelo:", "Nuevo Modelo", "");
            if (string.IsNullOrWhiteSpace(clave)) return;
            string desc = Microsoft.VisualBasic.Interaction.InputBox("Descripción:", "Nuevo Modelo", "");
            if (string.IsNullOrWhiteSpace(desc)) return;
            
            var mut = new { query = $"mutation {{ createCatModelo(clave_modelo:\"{clave.Trim()}\", descrip_disp:\"{desc.Trim()}\") {{ clave_modelo descrip_disp }} }}" };
            var r = await GQL(mut);
            if (r != null) {
                var nuevo = r["createCatModelo"]!;
                catModelos[nuevo["clave_modelo"]!.ToString()] = nuevo["descrip_disp"]!.ToString();
                FillCombo("clave_modelo", catModelos);
                SetVal("clave_modelo", nuevo["clave_modelo"]!.ToString());
            }
        }
    }

    internal sealed class KV
    {
        public string Clave { get; }
        public string Valor { get; }
        public KV(string clave, string valor) { Clave = clave; Valor = valor; }
        public override string ToString() => Valor;
    }
}