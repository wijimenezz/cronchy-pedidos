package com.pos.bluetoothprinter;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.widget.Toast;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Imprime bytes ESC/POS que llegan YA ARMADOS en la URL, sin interfaz.
 *
 *   cronchyprinter://raw?v=1&d=<base64url>
 *
 * A diferencia de MainActivity, esta pantalla no sabe qué es un ticket: recibe bytes y los
 * vuelca. El diseño lo decide quien manda el link — la app web de pedidos —, así que cambiar
 * una comanda no vuelve a requerir compilar este APK.
 *
 * Los hosts "print" y "printreceipt" de AppSheet siguen entrando por MainActivity con su
 * contrato de siempre. Esto no los toca.
 *
 * ── POR QUÉ EXTIENDE Activity Y NO AppCompatActivity ────────────────────────────────
 * AppCompatActivity exige un tema Theme.AppCompat y revienta en onCreate con el tema
 * translúcido de plataforma que declara el manifest. Aquí no se pinta ni un View, así que
 * AppCompat no aporta nada. Copiar el "extends AppCompatActivity" de MainActivity es el
 * fallo más fácil de cometer en este archivo.
 */
public class PrintRawActivity extends Activity {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        imprimir(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        imprimir(intent);
    }

    private void imprimir(Intent intent) {
        Uri uri = intent != null ? intent.getData() : null;
        String d = uri != null ? uri.getQueryParameter("d") : null;

        if (d == null || d.isEmpty()) {
            terminar("Nada que imprimir");
            return;
        }

        final byte[] datos;
        try {
            // URL_SAFE por el alfabeto -_ del base64url. decode() acepta la entrada sin el
            // relleno "=", que es como la manda la app web para no gastar URL.
            datos = Base64.decode(d, Base64.URL_SAFE | Base64.NO_WRAP);
        } catch (IllegalArgumentException e) {
            terminar("Ticket ilegible");
            return;
        }

        // Sin permiso de Bluetooth o sin impresora guardada no hay nada que esta pantalla pueda
        // arreglar: no tiene UI para pedir el permiso ni para elegir el equipo. Se le pasa el
        // testigo a MainActivity con el MISMO intent, que sí sabe hacer las dos cosas y luego
        // imprimir — para eso su printFromUri tiene que conocer el host "raw".
        if (!PrinterGateway.listo(this)) {
            Intent manual = new Intent(this, MainActivity.class);
            manual.setAction(Intent.ACTION_VIEW);
            manual.setData(uri);
            manual.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(manual);
            finish();
            return;
        }

        executor.execute(() -> {
            try {
                PrinterGateway.enviar(this, datos);
                main.post(() -> terminar("Ticket impreso"));
            } catch (Exception e) {
                main.post(() -> terminar("No imprimió: " + e.getMessage()));
            }
        });
    }

    /**
     * El Toast es el ÚNICO acuse que existe.
     *
     * Quien mandó el link es un navegador, y en cuanto entrega la URL el control se va y no
     * vuelve: la app web nunca sabrá si el papel salió. El Toast sobrevive al finish(), así que
     * se lee con el tablero ya otra vez en pantalla.
     */
    private void terminar(String mensaje) {
        Toast.makeText(getApplicationContext(), mensaje, Toast.LENGTH_SHORT).show();
        finish();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdown();
    }
}
