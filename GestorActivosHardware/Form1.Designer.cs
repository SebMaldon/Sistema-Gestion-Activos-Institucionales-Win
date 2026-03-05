namespace GestorActivosHardware
{
    partial class FormPrincipal
    {
        /// <summary>
        ///  Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        ///  Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        ///  Required method for Designer support - do not modify
        ///  the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            flowLayoutPanel1 = new FlowLayoutPanel();
            btnObtenerDatos = new Button();
            btnEnviar = new Button();
            btnEditar = new Button();
            panelAcciones = new Panel();
            panelAcciones.SuspendLayout();
            SuspendLayout();
            // 
            // flowLayoutPanel1
            // 
            flowLayoutPanel1.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            flowLayoutPanel1.AutoScroll = true;
            flowLayoutPanel1.Location = new Point(0, 0);
            flowLayoutPanel1.Name = "flowLayoutPanel1";
            flowLayoutPanel1.Size = new Size(1220, 1039);
            flowLayoutPanel1.TabIndex = 0;
            // 
            // btnObtenerDatos
            // 
            btnObtenerDatos.Font = new Font("Segoe UI", 10F);
            btnObtenerDatos.Location = new Point(7, 12);
            btnObtenerDatos.Name = "btnObtenerDatos";
            btnObtenerDatos.Size = new Size(181, 47);
            btnObtenerDatos.TabIndex = 6;
            btnObtenerDatos.Text = "Obtener Datos";
            btnObtenerDatos.UseVisualStyleBackColor = true;
            btnObtenerDatos.Click += btnObtenerDatos_Click_1;
            // 
            // btnEnviar
            // 
            btnEnviar.Font = new Font("Segoe UI", 10F);
            btnEnviar.Location = new Point(194, 12);
            btnEnviar.Name = "btnEnviar";
            btnEnviar.Size = new Size(181, 47);
            btnEnviar.TabIndex = 7;
            btnEnviar.Text = "Enviar Datos";
            btnEnviar.UseVisualStyleBackColor = true;
            btnEnviar.Click += btnEnviar_Click;
            // 
            // btnEditar
            // 
            btnEditar.Font = new Font("Segoe UI", 10F);
            btnEditar.Location = new Point(381, 12);
            btnEditar.Name = "btnEditar";
            btnEditar.Size = new Size(181, 47);
            btnEditar.TabIndex = 8;
            btnEditar.Text = "Editar";
            btnEditar.UseVisualStyleBackColor = true;
            btnEditar.Click += btnEditar_Click;
            // 
            // panelAcciones
            // 
            panelAcciones.Controls.Add(btnEditar);
            panelAcciones.Controls.Add(btnEnviar);
            panelAcciones.Controls.Add(btnObtenerDatos);
            panelAcciones.Dock = DockStyle.Top;
            panelAcciones.Location = new Point(0, 0);
            panelAcciones.Name = "panelAcciones";
            panelAcciones.Size = new Size(1220, 70);
            panelAcciones.TabIndex = 9;
            // 
            // FormPrincipal
            // 
            AutoScaleDimensions = new SizeF(10F, 25F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1220, 1039);
            Controls.Add(panelAcciones);
            Controls.Add(flowLayoutPanel1);
            Name = "FormPrincipal";
            Text = "Gestor de Activos";
            panelAcciones.ResumeLayout(false);
            ResumeLayout(false);
        }

        #endregion

        private FlowLayoutPanel flowLayoutPanel1;
        private Button btnObtenerDatos;
        private Button btnEnviar;
        private Button btnEditar;
        private Panel panelAcciones;
    }
}
