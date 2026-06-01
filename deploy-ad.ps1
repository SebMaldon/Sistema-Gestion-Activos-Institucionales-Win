# ============================================================
#  deploy-ad.ps1  —  Despliegue masivo via PowerShell / AD
#  Uso: ejecutar desde el servidor AD con credenciales de admin
# ============================================================

param(
    [string]$InstallerPath = "\\SERVIDOR-IMSS\apps\GestorActivosHW-Setup-x64.msi",
    [string]$ComputersFile = "pcs.txt",   # lista de hostnames, uno por línea
    [switch]$UseWMI                        # alternativa si WinRM no está habilitado
)

$computers = Get-Content $ComputersFile | Where-Object { $_.Trim() -ne '' }
$ok = @(); $fail = @()

foreach ($pc in $computers) {
    Write-Host "-> $pc" -NoNewline
    try {
        if ($UseWMI) {
            # Opción WMI (más compatible con redes restrictivas)
            $wmi = [wmiclass]"\\$pc\root\cimv2:Win32_Process"
            $result = $wmi.Create("msiexec.exe /i `"$InstallerPath`" /qn /norestart")
            if ($result.ReturnValue -eq 0) { $ok += $pc; Write-Host " OK" -ForegroundColor Green }
            else { $fail += $pc; Write-Host " FAIL (WMI $($result.ReturnValue))" -ForegroundColor Red }
        } else {
            # Opción WinRM (más limpia)
            Invoke-Command -ComputerName $pc -ErrorAction Stop -ScriptBlock {
                param($ins)
                Start-Process msiexec.exe -ArgumentList "/i `"$ins`" /qn /norestart" -Wait -Verb RunAs
            } -ArgumentList $InstallerPath
            $ok += $pc; Write-Host " OK" -ForegroundColor Green
        }
    } catch {
        $fail += $pc
        Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=== Resumen ==="
Write-Host "OK:   $($ok.Count)"
Write-Host "FAIL: $($fail.Count)"
if ($fail.Count -gt 0) {
    $fail | Out-File "deploy_failed.txt"
    Write-Host "PCs con fallo guardadas en deploy_failed.txt"
}
