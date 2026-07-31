/**
 * Crea un usuario del panel.
 *
 *   pnpm crear-usuario <correo> "<nombre>" [admin|colaborador]
 *
 * Existe por el problema del huevo y la gallina: el CRUD de usuarios vive dentro del
 * panel, al que no se puede entrar sin un usuario. Después del primer admin, lo normal
 * es crear al resto desde la pantalla de usuarios.
 *
 * La clave se pide por teclado y no como argumento a propósito: un argumento queda en el
 * historial del shell y en la lista de procesos.
 *
 * Es .mjs y no .ts para poder ejecutarlo con node a secas, sin cargar el resolutor de
 * alias `@/` de Next. Lo único que duplica de `src/lib/auth/password.ts` es el coste de
 * bcrypt; si ese cambia, hay que cambiarlo aquí.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import postgres from "postgres";

config({ path: ".env.local" });

const COSTE = 10;
const ROLES = ["admin", "colaborador"];

const [correo, nombre, rol = "colaborador"] = process.argv.slice(2);

if (!correo || !nombre) {
  console.error('Uso: pnpm crear-usuario <correo> "<nombre>" [admin|colaborador]');
  process.exit(1);
}
if (!ROLES.includes(rol)) {
  console.error(`Rol inválido: "${rol}". Debe ser ${ROLES.join(" o ")}.`);
  process.exit(1);
}
if (!process.env.DIRECT_URL || !process.env.STORE_SLUG) {
  console.error("Faltan DIRECT_URL o STORE_SLUG en .env.local");
  process.exit(1);
}

const email = correo.trim().toLowerCase();
const consola = createInterface({ input: stdin, output: stdout });
const clave = await consola.question(`Clave para ${email}: `);
consola.close();

if (clave.length < 8) {
  console.error("La clave debe tener al menos 8 caracteres.");
  process.exit(1);
}

const sql = postgres(process.env.DIRECT_URL, { prepare: false });

try {
  const [tienda] = await sql`SELECT id, nombre FROM store WHERE slug = ${process.env.STORE_SLUG}`;
  if (!tienda) {
    console.error(`No existe tienda con slug "${process.env.STORE_SLUG}".`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(clave, COSTE);

  // Reejecutarlo con el mismo correo cambia la clave y el rol en vez de fallar: es la
  // forma de recuperar el acceso si alguien la olvida. `email` es UNIQUE en toda la tabla.
  const [usuario] = await sql`
    INSERT INTO app_user (store_id, email, nombre, password_hash, rol)
    VALUES (${tienda.id}, ${email}, ${nombre}, ${hash}, ${rol}::rol_usuario)
    ON CONFLICT (email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          nombre        = EXCLUDED.nombre,
          rol           = EXCLUDED.rol,
          activo        = true
    RETURNING id, email, nombre, rol, (xmax <> 0) AS actualizado`;

  console.log(
    `${usuario.actualizado ? "Actualizado" : "Creado"}: ${usuario.nombre} <${usuario.email}> (${usuario.rol}) en ${tienda.nombre}`,
  );
} finally {
  await sql.end();
}
