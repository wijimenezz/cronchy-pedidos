<#
    Registra el esquema cronchyprinter:// en este equipo, apuntando a imprimir-ticket.ps1.

    Se instala en HKEY_CURRENT_USER y NO en HKEY_LOCAL_MACHINE: así no hace falta ser
    administrador, y la impresión queda ligada al usuario que opera el panel.

    Uso:
        Clic derecho sobre este archivo > "Ejecutar con PowerShell"

    O desde una terminal, en esta carpeta:
        powershell -ExecutionPolicy Bypass -File .\instalar.ps1
        powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Desinstalar
#>

param(
    [switch]$Desinstalar
)

$ErrorActionPreference = "Stop"

$Clave = "HKCU:\Software\Classes\cronchyprinter"

if ($Desinstalar) {
    if (Test-Path $Clave) {
        Remove-Item -Path $Clave -Recurse -Force
        Write-Host "Listo: cronchyprinter:// ya no está registrado en este equipo."
    } else {
        Write-Host "No estaba registrado; no hay nada que quitar."
    }
    return
}

# La ruta se resuelve sola desde donde esté este archivo: nadie tiene que editar un .reg a mano,
# que es de donde salen las rutas equivocadas.
$Script = Join-Path $PSScriptRoot "imprimir-ticket.ps1"
if (-not (Test-Path $Script)) {
    throw "No encuentro imprimir-ticket.ps1 junto a este instalador."
}

# La ruta canónica de Windows PowerShell, NO $PSHOME.
#
# $PSHOME apunta al intérprete que está corriendo AHORA: desde una consola PowerShell 7 sería
# "C:\Program Files\PowerShell\7", donde no hay ningún powershell.exe. Se registraría una ruta
# muerta y el fallo sería el peor posible — tocar imprimir y que no pase NADA: ni papel, ni
# cuadro de error, ni línea en el log, porque el script nunca llegaría a arrancar.
$PowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not (Test-Path $PowerShell)) {
    throw "No encuentro powershell.exe en $PowerShell. Este instalador necesita Windows PowerShell."
}

$Comando = "`"$PowerShell`" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Script`" `"%1`""

New-Item -Path "$Clave\shell\open\command" -Force | Out-Null

# "URL Protocol" tiene que existir aunque esté vacío: es la marca por la que Windows reconoce
# la clave como un esquema de URL y no como una extensión de archivo.
Set-ItemProperty -Path $Clave -Name "(Default)" -Value "URL:Cronchy Printer"
Set-ItemProperty -Path $Clave -Name "URL Protocol" -Value ""
Set-ItemProperty -Path "$Clave\shell\open\command" -Name "(Default)" -Value $Comando

Write-Host "Listo. cronchyprinter:// abre ahora:"
Write-Host "  $Comando"
Write-Host ""
Write-Host "Falta una cosa: abre imprimir-ticket.ps1 y escribe el nombre de la impresora en"
Write-Host "`$NombreImpresora, o deja la térmica como predeterminada de Windows."
