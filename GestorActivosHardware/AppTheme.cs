using System;
using System.Drawing;

namespace GestorActivosHardware
{
    internal static class T
    {
        public static bool IsDark = true;

        // ── Fondos ──────────────────────────────────────────────────────────
        public static Color BgDeep    => IsDark ? Color.FromArgb(13,  17,  23)   : Color.FromArgb(255, 255, 255); // Sidebar/Header
        public static Color BgSurface => IsDark ? Color.FromArgb(22,  27,  34)   : Color.FromArgb(240, 242, 245); // Background main
        public static Color BgCard    => IsDark ? Color.FromArgb(30,  38,  50)   : Color.FromArgb(255, 255, 255); // Cards
        public static Color BgInput   => IsDark ? Color.FromArgb(39,  49,  64)   : Color.FromArgb(246, 248, 250); // Inputs
        public static Color BgHover   => IsDark ? Color.FromArgb(48,  60,  78)   : Color.FromArgb(225, 228, 232);
        public static Color BgOverlay => IsDark ? Color.FromArgb(48,  54,  61)   : Color.FromArgb(209, 213, 218);

        // ── Acento ──────────────────────────────────────────────────────────
        public static Color Accent        = Color.FromArgb(0,  166,  81);   // Verde IMSS
        public static Color AccentHover   = Color.FromArgb(0,  190,  95);
        public static Color AccentPressed = Color.FromArgb(0,  130,  60);

        // ── Texto ────────────────────────────────────────────────────────────
        public static Color TxtPrimary   => IsDark ? Color.FromArgb(240, 246, 252) : Color.FromArgb(36,  41,  46);
        public static Color TxtSecondary => IsDark ? Color.FromArgb(139, 148, 158) : Color.FromArgb(88,  96, 105);
        public static Color TxtMuted     => IsDark ? Color.FromArgb(88,  96, 105)  : Color.FromArgb(106, 115, 125);

        // ── Bordes ───────────────────────────────────────────────────────────
        public static Color Border       => IsDark ? Color.FromArgb(48, 54, 61)    : Color.FromArgb(225, 228, 232);
        public static Color BorderFocus  = Color.FromArgb(0, 166, 81);

        // ── LEDs de estado ───────────────────────────────────────────────────
        public static Color LedGreen  = Color.FromArgb(63, 185, 80);
        public static Color LedYellow = Color.FromArgb(210, 153, 34);
        public static Color LedRed    = Color.FromArgb(248, 81, 73);

        // ── Tipografía ───────────────────────────────────────────────────────
        public static Font H1      = new("Segoe UI", 18, FontStyle.Bold);
        public static Font H2      = new("Segoe UI", 13, FontStyle.Bold);
        public static Font H3      = new("Segoe UI", 10, FontStyle.Bold);
        public static Font Body    = new("Segoe UI", 10);
        public static Font Small   = new("Segoe UI",  9);
        public static Font Caption = new("Segoe UI",  8);

        public static void Toggle() => IsDark = !IsDark;
    }
}
