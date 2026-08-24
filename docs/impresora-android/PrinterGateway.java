package com.pos.bluetoothprinter;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import java.io.IOException;

/**
 * Conectar con la impresora guardada y mandarle bytes.
 *
 * Sale de MainActivity.autoConnectAndPrint, que hacía esto mismo dentro de la Activity. Ahora
 * lo necesitan dos pantallas y aquí no depende de ninguna: todos los métodos van en un hilo de
 * fondo, igual que antes.
 *
 * Trae además un reintento que MainActivity no tenía y que es EL fallo real del mostrador.
 */
public final class PrinterGateway {

    private PrinterGateway() {}

    /** ¿Se puede imprimir ya, sin preguntarle nada al usuario? */
    public static boolean listo(Context ctx) {
        if (!tienePermiso(ctx)) return false;
        if (!PrinterPreferences.hasSavedDevice(ctx)) return false;

        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        return adapter != null && adapter.isEnabled();
    }

    private static boolean tienePermiso(Context ctx) {
        // BLUETOOTH_CONNECT es de runtime desde Android 12 (API 31). Por debajo basta el
        // permiso del manifest, que ya está declarado.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;

        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.BLUETOOTH_CONNECT)
                == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressWarnings("MissingPermission")
    public static void enviar(Context ctx, byte[] datos) throws IOException {
        BluetoothPrinterManager printer = BluetoothPrinterManager.getInstance();

        String address = PrinterPreferences.getSavedAddress(ctx);
        if (address == null) throw new IOException("No hay impresora guardada");

        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) throw new IOException("Bluetooth apagado");

        // getRemoteDevice resuelve la MAC directamente. MainActivity recorría la lista de
        // emparejados, lo que la obligaba a tener esa lista ya cargada en pantalla — algo que
        // una actividad sin UI no puede garantizar.
        BluetoothDevice device = adapter.getRemoteDevice(address);

        if (!printer.isConnected()) printer.connect(device);

        try {
            printer.sendBytes(datos);
        } catch (IOException primera) {
            // isConnected() MIENTE cuando la impresora se apagó o se salió de rango: el socket
            // sigue diciendo que está conectado y es el write el que revienta con "Broken pipe".
            // Sin esto, el remedio era cerrar la app y volver a entrar.
            printer.disconnect();
            printer.connect(device);
            printer.sendBytes(datos);
        }
    }
}
