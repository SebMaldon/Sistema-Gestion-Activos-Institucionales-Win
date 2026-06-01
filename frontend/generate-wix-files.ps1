# generate-wix-files.ps1
# Genera electron/files.wxs escaneando release/win-unpacked/

$srcDir = Resolve-Path "release\win-unpacked"
$outFile = "electron\files.wxs"

$idx = 0
$components = [System.Collections.Generic.List[string]]::new()
$dirRefs = [System.Collections.Generic.Dictionary[string,string]]::new()
$compIds = [System.Collections.Generic.List[string]]::new()

# Map: directorio relativo -> ID de directorio WiX
function Get-DirId($relPath) {
    if ($relPath -eq '') { return 'INSTALLDIR' }
    if ($script:dirRefs.ContainsKey($relPath)) { return $script:dirRefs[$relPath] }
    $id = "dir_" + ($relPath -replace '[^a-zA-Z0-9]', '_')
    if ($id.Length -gt 70) { $id = $id.Substring(0, 70) }
    # Asegurar unicidad
    $base = $id; $n = 1
    while ($script:dirRefs.ContainsValue($id)) { $id = "${base}_$n"; $n++ }
    $script:dirRefs[$relPath] = $id
    return $id
}

# Obtener todos los archivos
$allFiles = Get-ChildItem $srcDir -Recurse -File

foreach ($file in $allFiles) {
    $relFile = $file.FullName.Substring($srcDir.Path.Length + 1)
    $relDir  = if ($file.DirectoryName -eq $srcDir.Path) { '' } else { $file.DirectoryName.Substring($srcDir.Path.Length + 1) }
    
    $dirId  = Get-DirId $relDir
    $idx++
    $compId = "comp_{0:D5}" -f $idx
    $fileId = "file_{0:D5}" -f $idx
    $compIds.Add($compId)

    $srcPath = "release\win-unpacked\$relFile"

    $components.Add(@"
      <Component Id="$compId" Directory="$dirId" Guid="*">
        <File Id="$fileId" Source="release\win-unpacked\$relFile" KeyPath="yes" />
      </Component>
"@)
}

# Construir árbol de directorios
$dirTree = ''
$sortedDirs = $dirRefs.Keys | Where-Object { $_ -ne '' } | Sort-Object
foreach ($relPath in $sortedDirs) {
    $parts = $relPath -split '\\'
    $parentPath = ($parts | Select-Object -SkipLast 1) -join '\'
    $dirName = $parts[-1]
    $parentId = Get-DirId $parentPath
    $thisId = $dirRefs[$relPath]
    $dirTree += "    <DirectoryRef Id=`"$parentId`"><Directory Id=`"$thisId`" Name=`"$dirName`" /></DirectoryRef>`n"
}

# Generar XML
$xml = @"
<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">
  <Fragment>
$dirTree
    <ComponentGroup Id="AppFiles">
$($components -join "`n")
    </ComponentGroup>
  </Fragment>
</Wix>
"@

Set-Content -Path $outFile -Value $xml -Encoding UTF8
Write-Host "Generado $outFile con $idx archivos/componentes."
