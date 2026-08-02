/**
 * Deja en Vault los secretos que necesita la purga de comprobantes.
 *
 *   pnpm configurar-purga
 *
 * La migración 0012 crea el job de `pg_cron` que borra los comprobantes de más de 60 días,
 * pero para llamar a la API de Storage hace falta la URL y la service key. Esas NO pueden
 * ir escritas en la migración —ese archivo va al repositorio— así que viven en
 * `vault.secrets`, cifradas, y la función las lee en tiempo de ejecución.
 *
 * Se ejecuta una vez tras aplicar la migración, y otra vez cada vez que se rote la llave.
 * Es idempotente: reejecutarlo actualiza los valores en vez de duplicarlos.
 *
 * Usa DIRECT_URL (session pooler) y no DATABASE_URL: `vault.create_secret` es una función
 * de administración y esto es una tarea de mantenimiento, no tráfico de la app.
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const faltan = ["DIRECT_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(
  (v) => !process.env[v],
);
if (faltan.length > 0) {
  console.error(`Faltan en .env.local: ${faltan.join(", ")}`);
  process.exit(1);
}

const SECRETOS = [
  {
    nombre: "supabase_url",
    valor: process.env.SUPABASE_URL.replace(/\/$/, ""),
    descripcion: "Base de la API de Supabase, para la purga de comprobantes",
  },
  {
    nombre: "supabase_service_key",
    valor: process.env.SUPABASE_SERVICE_ROLE_KEY,
    descripcion: "Llave de servicio para borrar objetos del bucket comprobantes",
  },
];

const sql = postgres(process.env.DIRECT_URL, { prepare: false });

try {
  for (const { nombre, valor, descripcion } of SECRETOS) {
    const [previo] = await sql`SELECT id FROM vault.secrets WHERE name = ${nombre}`;

    if (previo) {
      await sql`SELECT vault.update_secret(${previo.id}, ${valor}, ${nombre}, ${descripcion})`;
      console.log(`Actualizado: ${nombre}`);
    } else {
      await sql`SELECT vault.create_secret(${valor}, ${nombre}, ${descripcion})`;
      console.log(`Creado: ${nombre}`);
    }
  }

  // Comprobación de extremo a extremo sin borrar nada: con un umbral de 100 años no hay
  // ningún comprobante que califique, pero la función igual lee Vault y falla si no están.
  const [prueba] = await sql`SELECT public.purgar_comprobantes(36500) AS borrados`;
  console.log(`Vault OK — la purga corre y encontró ${prueba.borrados} objetos a 100 años.`);

  const [job] = await sql`SELECT jobname, schedule FROM cron.job WHERE jobname = 'purgar-comprobantes'`;
  console.log(
    job
      ? `Job programado: ${job.jobname} @ ${job.schedule} (UTC — 02:30 en Bogotá)`
      : "AVISO: el job no existe. ¿Se aplicó la migración 0012? (pnpm db:migrate)",
  );
} finally {
  await sql.end();
}
