using System;
using System.Drawing;
using System.Drawing.Drawing2D;
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
    public sealed class LoginView : Form
    {
        // ─── Http ───────────────────────────────────────────────────────────
        internal static readonly HttpClient Http = new() { BaseAddress = new Uri("http://localhost:4000/graphql") };
        internal static string JwtToken = "";

        // ─── Controles ──────────────────────────────────────────────────────
        private Guna2TextBox _txtMat   = null!;
        private Guna2TextBox _txtPass  = null!;
        private Guna2Button  _btnLogin = null!;
        private Label        _lblError = null!;
        private Label        _lblFloatMat  = null!;
        private Label        _lblFloatPass = null!;

        public LoginView()
        {
            FormBorderStyle = FormBorderStyle.None;
            BackColor       = T.BgDeep;
            Size            = new Size(440, 540);
            StartPosition   = FormStartPosition.CenterScreen;
            Text            = "Gestor de Activos – IMSS";
            KeyPreview      = true;
            KeyDown        += (_, e) => { if (e.KeyCode == Keys.Escape) Application.Exit(); };

            BuildUI();
        }

        // ════════════════════════════════════════════════════════════════════
        // UI
        // ════════════════════════════════════════════════════════════════════
        private void BuildUI()
        {
            // Título bar personalizado
            var titleBar = new Panel
            {
                Dock      = DockStyle.Top,
                Height    = 32,
                BackColor = T.BgDeep
            };
            var btnClose = new Label
            {
                Text      = "✕",
                ForeColor = T.TxtSecondary,
                Font      = T.Body,
                Cursor    = Cursors.Hand,
                AutoSize  = true,
                Location  = new Point(this.Width - 28, 7)
            };
            btnClose.Click  += (_, __) => Application.Exit();
            btnClose.MouseEnter += (_, __) => btnClose.ForeColor = T.LedRed;
            btnClose.MouseLeave += (_, __) => btnClose.ForeColor = T.TxtSecondary;
            titleBar.Controls.Add(btnClose);

            // Drag
            bool dragging = false; Point dragStart = Point.Empty;
            titleBar.MouseDown += (_, e) => { dragging = true; dragStart = e.Location; };
            titleBar.MouseMove += (_, e) => { if (dragging) Location = new Point(Location.X + e.X - dragStart.X, Location.Y + e.Y - dragStart.Y); };
            titleBar.MouseUp   += (_, __) => dragging = false;

            // Tarjeta central
            var card = new Guna2Panel
            {
                Size         = new Size(380, 460),
                Location     = new Point(30, 40),
                FillColor    = T.BgCard,
                BorderRadius = 20,
                BorderColor  = T.Border,
                BorderThickness = 1
            };
            card.ShadowDecoration.Enabled = true;
            card.ShadowDecoration.Color   = Color.FromArgb(120, 0, 0, 0);
            card.ShadowDecoration.Depth   = 25;

            // Logo
            var pbLogo = new PictureBox
            {
                Size      = new Size(80, 80),
                Location  = new Point(150, 15),
                BackColor = Color.Transparent,
                SizeMode  = PictureBoxSizeMode.Zoom,
                ImageLocation = "IMSS.png" // Descomentar esta línea para la imagen
            };

            var lblTitle = new Label
            {
                Text      = "Gestor de Activos",
                Font      = T.H2,
                ForeColor = T.TxtPrimary,
                AutoSize  = false,
                Size      = new Size(340, 30),
                Location  = new Point(20, 104),
                TextAlign = ContentAlignment.MiddleCenter
            };
            var lblSub = new Label
            {
                Text      = "Hardware & Red — IMSS",
                Font      = T.Small,
                ForeColor = T.TxtSecondary,
                AutoSize  = false,
                Size      = new Size(340, 22),
                Location  = new Point(20, 132),
                TextAlign = ContentAlignment.MiddleCenter
            };

            // ── Inputs ─────────────────────────────────────────────────────────
            var lblMat = new Label { Text = "MATRÍCULA", Font = T.Caption, ForeColor = T.TxtSecondary, Location = new Point(20, 165), AutoSize = true };
            _txtMat = StyledInput("Ej. 12345678", 185, isPassword: false);

            var lblPass = new Label { Text = "CONTRASEÑA", Font = T.Caption, ForeColor = T.TxtSecondary, Location = new Point(20, 245), AutoSize = true };
            _txtPass = StyledInput("••••••••", 265, isPassword: true);
            
            Bitmap GenEye(Color c) {
                var bmp = new Bitmap(24, 24);
                using var g = Graphics.FromImage(bmp);
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using var p = new Pen(c, 1.5f);
                // Dibujar forma de ojo (vectorial)
                g.DrawCurve(p, new Point[] { new Point(2, 12), new Point(12, 6), new Point(22, 12) });
                g.DrawCurve(p, new Point[] { new Point(2, 12), new Point(12, 18), new Point(22, 12) });
                g.DrawEllipse(p, 8, 8, 8, 8); // Iris
                using var b = new SolidBrush(c);
                g.FillEllipse(b, 10, 10, 4, 4); // Pupila
                return bmp;
            }
            
            _txtPass.IconRightSize = new Size(24, 24);
            _txtPass.IconRightOffset = new Point(5, 0); // Desplazar un poco a la izquierda (en Guna offset X positivo mueve a la izquierda)
            _txtPass.IconRight = GenEye(T.TxtSecondary);
            _txtPass.IconRightCursor = Cursors.Hand;
            _txtPass.IconRightClick += (_, __) => {
                _txtPass.PasswordChar = _txtPass.PasswordChar == '\0' ? '●' : '\0';
                _txtPass.IconRight = GenEye(_txtPass.PasswordChar == '\0' ? T.Accent : T.TxtSecondary);
            };

            // ── Botón login ───────────────────────────────────────────────
            _btnLogin = new Guna2Button
            {
                Text         = "INICIAR SESIÓN",
                Size         = new Size(340, 48),
                Location     = new Point(20, 335),
                FillColor    = T.Accent,
                ForeColor    = Color.White,
                Font         = new Font("Segoe UI", 11, FontStyle.Bold),
                BorderRadius = 10,
                Cursor       = Cursors.Hand
            };
            _btnLogin.Click += async (_, __) => await DoLogin();
            _txtPass.KeyDown += async (_, e) => { if (e.KeyCode == Keys.Enter) await DoLogin(); };

            _lblError = new Label
            {
                Size      = new Size(340, 40),
                Location  = new Point(20, 390),
                ForeColor = T.LedRed,
                Font      = T.Small,
                TextAlign = ContentAlignment.MiddleCenter,
                Text      = ""
            };

            var lblVer = new Label
            {
                Text      = "v2.0  —  IMSS Telecom",
                Font      = T.Caption,
                ForeColor = T.TxtMuted,
                Size      = new Size(340, 20),
                Location  = new Point(20, 430),
                TextAlign = ContentAlignment.MiddleCenter
            };

            card.Controls.AddRange(new Control[] {
                pbLogo, lblTitle, lblSub,
                lblMat, _txtMat,
                lblPass, _txtPass,
                _btnLogin, _lblError, lblVer
            });

            Controls.Add(titleBar);
            Controls.Add(card);
        }

        private Guna2TextBox StyledInput(string placeholder, int top, bool isPassword)
        {
            var t = new Guna2TextBox
            {
                Size          = new Size(340, 46),
                Location      = new Point(20, top),
                FillColor     = T.BgInput,
                BorderRadius  = 8,
                BorderColor   = T.Border,
                ForeColor     = T.TxtPrimary,
                PlaceholderText = placeholder,
                PlaceholderForeColor = T.TxtMuted,
                Font          = T.Body,
                PasswordChar  = isPassword ? '●' : '\0',
                TextOffset    = new Point(5, 0)
            };
            
            t.Enter += (_, __) => t.BorderColor = T.Accent;
            t.Leave += (_, __) => t.BorderColor = T.Border;
            
            return t;
        }

        // ════════════════════════════════════════════════════════════════════
        // LÓGICA: Login GraphQL
        // ════════════════════════════════════════════════════════════════════
        private async Task DoLogin()
        {
            _lblError.Text    = "";
            _btnLogin.Enabled = false;
            _btnLogin.Text    = "Verificando…";

            string mat  = _txtMat.Text.Trim();
            string pass = _txtPass.Text.Trim();
            if (string.IsNullOrEmpty(mat) || string.IsNullOrEmpty(pass))
            { ShowError("Completa matrícula y contraseña."); return; }

            try
            {
                var body    = new { query = $"mutation {{ login(matricula:\"{mat}\", password:\"{pass}\") {{ token }} }}" };
                var content = new StringContent(JsonConvert.SerializeObject(body), Encoding.UTF8, "application/json");
                var resp    = await Http.PostAsync("", content);
                var root    = JObject.Parse(await resp.Content.ReadAsStringAsync());

                if (root["errors"] != null)
                { ShowError("Credenciales incorrectas."); return; }

                JwtToken = root["data"]!["login"]!["token"]!.ToString();
                Http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", JwtToken);

                var main = new FormPrincipal();
                main.Show();
                this.Hide();
                main.FormClosed += (_, __) => this.Close();
            }
            catch (Exception ex) { ShowError("Sin conexión: " + ex.Message); }
        }

        private void ShowError(string msg)
        {
            _lblError.Text    = msg;
            _btnLogin.Enabled = true;
            _btnLogin.Text    = "INICIAR SESIÓN";
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            // Borde sutil del form
            using var p = new Pen(T.Border, 1);
            e.Graphics.DrawRectangle(p, 0, 0, Width - 1, Height - 1);
        }
    }
}
