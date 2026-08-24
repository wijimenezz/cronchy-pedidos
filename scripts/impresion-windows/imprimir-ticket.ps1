<#
    Imprime un ticket de Cronchy Pedidos en una impresora térmica de Windows.

    Lo invoca Windows cuando el navegador abre un enlace del esquema registrado:

        cronchyprinter://raw?v=1&d=<base64url>

    Es el gemelo de PrintRawActivity en la tablet: recibe los MISMOS bytes ESC/POS que arma la
    app web y los vuelca a la impresora. Un solo deep link, dos sistemas, un solo camino de
    código en la web.

    ── POR QUÉ winspool Y NO Out-Printer ────────────────────────────────────────────────
    Out-Printer (y cualquier impresión "normal" de Windows) pasa por el driver, que rasteriza
    lo que le llegue: los bytes ESC/POS acabarían impresos como texto literal, o peor, como
    tres metros de basura. El modo RAW del spooler los entrega tal cual al aparato, que es lo
    único que sirve aquí. Además, así no hace falta compartir la impresora en la red.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Url
)

# ── AJUSTA ESTO ─────────────────────────────────────────────────────────────────────────
# El nombre EXACTO de la impresora, tal como aparece en Configuración > Bluetooth y
# dispositivos > Impresoras y escáneres. Déjalo vacío para usar la predeterminada.
$NombreImpresora = ""
# ────────────────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

# Los errores se registran en un archivo porque este script corre con la ventana oculta: sin
# esto, un fallo sería un botón que no hace nada y nadie sabría por qué.
$Registro = Join-Path $env:TEMP "cronchy-impresion.log"

function Escribir($mensaje) {
    Add-Content -Path $Registro -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $mensaje" -Encoding utf8
}

function Fallar($mensaje) {
    Escribir "ERROR: $mensaje"
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($mensaje, "Cronchy - no se pudo imprimir") | Out-Null
    exit 1
}

# ── 1. Sacar el payload de la URL ───────────────────────────────────────────────────────

if ($Url -notmatch "[?&]d=([A-Za-z0-9_-]+)") {
    Fallar "El enlace no trae ningún ticket que imprimir."
}
$Payload = $Matches[1]

# base64url -> base64 estándar: el alfabeto cambia -_ por +/ y la app web no manda relleno.
$Base64 = $Payload.Replace('-', '+').Replace('_', '/')
switch ($Base64.Length % 4) {
    2 { $Base64 += '==' }
    3 { $Base64 += '=' }
    1 { Fallar "El ticket llegó incompleto." }
}

try {
    $Bytes = [System.Convert]::FromBase64String($Base64)
} catch {
    Fallar "El ticket llegó ilegible."
}

if ($Bytes.Length -eq 0) { Fallar "El ticket llegó vacío." }

# ── 2. Resolver la impresora ────────────────────────────────────────────────────────────

if ([string]::IsNullOrWhiteSpace($NombreImpresora)) {
    $Predeterminada = Get-CimInstance -ClassName Win32_Printer -Filter "Default = True"
    if (-not $Predeterminada) {
        Fallar "No hay impresora predeterminada. Abre imprimir-ticket.ps1 y escribe el nombre en `$NombreImpresora."
    }
    $NombreImpresora = $Predeterminada.Name
}

# ── 3. Mandarlos en RAW por el spooler ──────────────────────────────────────────────────

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class ImpresoraRaw
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private class DOCINFO
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    /// <summary>Entrega los bytes al aparato sin pasar por el driver.</summary>
    public static void Enviar(string impresora, byte[] datos)
    {
        IntPtr hPrinter;
        if (!OpenPrinter(impresora, out hPrinter, IntPtr.Zero))
            throw new IOException("No se pudo abrir la impresora \"" + impresora + "\".");

        IntPtr buffer = IntPtr.Zero;
        try
        {
            // "RAW" es la palabra clave: le dice al spooler que no interprete nada.
            DOCINFO di = new DOCINFO();
            di.pDocName = "Cronchy - ticket";
            di.pDataType = "RAW";

            if (!StartDocPrinter(hPrinter, 1, di))
                throw new IOException("La impresora rechazó el trabajo.");

            try
            {
                if (!StartPagePrinter(hPrinter))
                    throw new IOException("La impresora rechazó la página.");

                try
                {
                    buffer = Marshal.AllocCoTaskMem(datos.Length);
                    Marshal.Copy(datos, 0, buffer, datos.Length);

                    int escritos;
                    if (!WritePrinter(hPrinter, buffer, datos.Length, out escritos) || escritos != datos.Length)
                        throw new IOException("El ticket se envió incompleto.");
                }
                finally { EndPagePrinter(hPrinter); }
            }
            finally { EndDocPrinter(hPrinter); }
        }
        finally
        {
            if (buffer != IntPtr.Zero) Marshal.FreeCoTaskMem(buffer);
            ClosePrinter(hPrinter);
        }
    }
}
'@

try {
    [ImpresoraRaw]::Enviar($NombreImpresora, $Bytes)
    Escribir "OK  $($Bytes.Length) bytes -> $NombreImpresora"
} catch {
    Fallar "$($_.Exception.Message)"
}
