import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { esPuntoValido, resolverZona, urlMapa } from "./zonas";

config({ path: ".env.local" });

/**
 * Estos tests hablan con PostGIS de verdad, no con un mock.
 *
 * Aquí el cálculo *es* la consulta: `ST_Covers`, el orden por prioridad y el filtro de
 * activas. Un mock de la query solo probaría que el mock devuelve lo que le pusimos, y
 * justo los casos que importan —el borde, el solapamiento— dependen de cómo se comporta
 * PostGIS, no de nuestro código.
 *
 * Todo ocurre dentro de una transacción que termina en ROLLBACK, así que no queda una sola
 * fila. Si no hay base configurada, la suite se salta en vez de fallar.
 *
 * **NUNCA escribas aquí el UUID de una tienda a mano.** El caso de aislamiento entre tiendas
 * preguntaba por `11111111-1111-1111-1111-111111111111` dando por hecho que no existía, y ese
 * es exactamente el id de la tienda real de Cronchy. El test pasó hasta el día en que los
 * dueños dibujaron una zona sobre el punto de prueba en `/admin/zonas`, y entonces empezó a
 * recibir "zona 2" a $6.000. Peor: mientras "pasaba", no probaba nada — con un id que no
 * existe, la consulta devuelve vacío aunque `resolverZona` ignore el `store_id` por completo.
 * Las tiendas se crean aquí dentro y su id llega por parámetro.
 *
 * Por lo mismo, las coordenadas pueden seguir estando en Fusagasugá —donde están las zonas
 * reales— sin volver a chocar: ya no queda ninguna consulta contra una tienda que no haya
 * creado el propio test.
 */

const URL_BASE = process.env.DATABASE_URL;
const cliente = URL_BASE ? postgres(URL_BASE, { prepare: false }) : null;
const base = cliente ? drizzle(cliente) : null;

afterAll(async () => {
  await cliente?.end();
});

// Un cuadrado alrededor de Fusagasugá, y dentro de él otro más pequeño: es la forma de
// "este conjunto queda dentro del Centro pero se cobra distinto" que la regla 13 resuelve
// con la prioridad.
const CENTRO = "POLYGON((-74.37 4.33, -74.35 4.33, -74.35 4.35, -74.37 4.35, -74.37 4.33))";
const CONJUNTO =
  "POLYGON((-74.365 4.335, -74.36 4.335, -74.36 4.34, -74.365 4.34, -74.365 4.335))";

const DENTRO_DE_CENTRO = { lat: 4.345, lng: -74.355 };
const DENTRO_DE_AMBAS = { lat: 4.337, lng: -74.362 };
const EN_EL_BORDE = { lat: 4.34, lng: -74.37 };
const MUY_LEJOS = { lat: 4.6, lng: -74.08 };

type Escenario = {
  /** Menor = se evalúa primero. */
  prioridad: number;
  precio: number;
  nombre: string;
  wkt: string | null;
  activa?: boolean;
};

const CENTRO_Y_CONJUNTO: Escenario[] = [
  { nombre: "Conjunto", wkt: CONJUNTO, prioridad: 0, precio: 5000 },
  { nombre: "Centro", wkt: CENTRO, prioridad: 1, precio: 3000 },
];

/**
 * Monta las zonas dadas en una tienda recién creada, corre el caso y deshace todo.
 *
 * Crea **dos** tiendas: la que recibe las zonas y una vecina que se queda vacía. La vecina es
 * lo que necesita el caso de aislamiento — para probar que el filtro por `store_id` (regla 5)
 * funciona hay que preguntarle a una tienda que existe de verdad, parados sobre un punto que
 * sí está cubierto por las zonas de la otra. Un id inventado no prueba nada.
 *
 * El tercer parámetro solo lo usa ese caso; los demás declaran dos y siguen valiendo, porque
 * en TypeScript una función con menos parámetros es asignable.
 */
async function conZonas<T>(
  zonas: Escenario[],
  caso: (
    storeId: string,
    ejecutor: Parameters<typeof resolverZona>[2],
    tiendaVecina: string,
  ) => Promise<T>,
): Promise<T> {
  if (!base) throw new Error("sin base");

  let resultado!: T;
  const marca = `test-zonas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    await base.transaction(async (tx) => {
      const [tienda] = await tx.execute<{ id: string }>(sql`
        INSERT INTO store (slug, nombre) VALUES (${marca}, ${marca}) RETURNING id
      `);

      // La vecina: existe, es de otro dueño y no tiene ni una zona. Nunca recibe polígonos.
      const vecina = `${marca}-vecina`;
      const [ajena] = await tx.execute<{ id: string }>(sql`
        INSERT INTO store (slug, nombre) VALUES (${vecina}, ${vecina}) RETURNING id
      `);

      for (const zona of zonas) {
        await tx.execute(sql`
          INSERT INTO delivery_zone (store_id, nombre, precio, prioridad, activa, poligono)
          VALUES (
            ${tienda.id}, ${zona.nombre}, ${zona.precio}, ${zona.prioridad},
            ${zona.activa ?? true},
            ${zona.wkt === null ? null : sql`ST_GeomFromText(${zona.wkt}, 4326)`}
          )
        `);
      }

      resultado = await caso(tienda.id, tx, ajena.id);

      // Nada de esto debe sobrevivir al test.
      throw new Error("ROLLBACK_INTENCIONAL");
    });
  } catch (error) {
    if ((error as Error).message !== "ROLLBACK_INTENCIONAL") throw error;
  }

  return resultado;
}

describe("esPuntoValido", () => {
  it("acepta un punto real", () => {
    expect(esPuntoValido({ lat: 4.34, lng: -74.36 })).toBe(true);
  });

  it.each([
    ["NaN", { lat: NaN, lng: -74.36 }],
    ["latitud fuera de rango", { lat: 91, lng: -74.36 }],
    ["longitud fuera de rango", { lat: 4.34, lng: -181 }],
    ["infinito", { lat: Infinity, lng: 0 }],
  ])("rechaza %s", (_caso, punto) => {
    expect(esPuntoValido(punto)).toBe(false);
  });
});

describe("urlMapa", () => {
  it("arma el link que abre el domiciliario", () => {
    expect(urlMapa({ lat: 4.337, lng: -74.362 })).toBe(
      "https://www.google.com/maps?q=4.337,-74.362",
    );
  });
});

describe.skipIf(!base)("resolverZona", () => {
  it("un punto dentro de una zona devuelve su nombre y su precio", async () => {
    const zona = await conZonas(CENTRO_Y_CONJUNTO, (storeId, tx) =>
      resolverZona(storeId, DENTRO_DE_CENTRO, tx),
    );

    expect(zona).toMatchObject({ nombre: "Centro", precio: 3000 });
  });

  it("un punto fuera de todas las zonas no resuelve nada", async () => {
    const zona = await conZonas(CENTRO_Y_CONJUNTO, (storeId, tx) =>
      resolverZona(storeId, MUY_LEJOS, tx),
    );

    expect(zona).toBeNull();
  });

  // El caso que obliga a usar ST_Covers: con ST_Contains, una casa sobre la frontera
  // quedaría sin cobertura por unos metros.
  it("un punto justo en el borde cuenta como dentro", async () => {
    const zona = await conZonas(CENTRO_Y_CONJUNTO, (storeId, tx) =>
      resolverZona(storeId, EN_EL_BORDE, tx),
    );

    expect(zona).toMatchObject({ nombre: "Centro" });
  });

  it("en un solapamiento gana la de menor prioridad, no la más barata", async () => {
    const zona = await conZonas(CENTRO_Y_CONJUNTO, (storeId, tx) =>
      resolverZona(storeId, DENTRO_DE_AMBAS, tx),
    );

    expect(zona).toMatchObject({ nombre: "Conjunto", precio: 5000 });
  });

  it("si se apaga la de arriba, el solapamiento cae en la de abajo", async () => {
    const zonas = CENTRO_Y_CONJUNTO.map((z) =>
      z.nombre === "Conjunto" ? { ...z, activa: false } : z,
    );
    const zona = await conZonas(zonas, (storeId, tx) =>
      resolverZona(storeId, DENTRO_DE_AMBAS, tx),
    );

    expect(zona).toMatchObject({ nombre: "Centro", precio: 3000 });
  });

  it("con todas las zonas apagadas no hay cobertura", async () => {
    const zonas = CENTRO_Y_CONJUNTO.map((z) => ({ ...z, activa: false }));
    const zona = await conZonas(zonas, (storeId, tx) =>
      resolverZona(storeId, DENTRO_DE_CENTRO, tx),
    );

    expect(zona).toBeNull();
  });

  // Es el estado en que quedaron las 4 zonas al migrar a polígonos: existen, tienen precio,
  // y no cubren nada hasta que alguien las dibuje.
  it("una zona sin dibujar no cubre ningún punto", async () => {
    const zona = await conZonas(
      [{ nombre: "Sin dibujar", wkt: null, prioridad: 0, precio: 4000 }],
      (storeId, tx) => resolverZona(storeId, DENTRO_DE_CENTRO, tx),
    );

    expect(zona).toBeNull();
  });

  it("no se cuela una zona de otra tienda", async () => {
    // La vecina existe de verdad y no tiene ni una zona, y el punto está dentro de las de la
    // otra: si `resolverZona` se saltara el `store_id` devolvería "Centro" y esto fallaría.
    // Ese es el único montaje que prueba el filtro — con un id inventado, la consulta sale
    // vacía haya filtro o no.
    const zona = await conZonas(CENTRO_Y_CONJUNTO, (_storeId, tx, tiendaVecina) =>
      resolverZona(tiendaVecina, DENTRO_DE_CENTRO, tx),
    );

    expect(zona).toBeNull();
  });

  it("un punto imposible no llega a la base", async () => {
    const zona = await conZonas(CENTRO_Y_CONJUNTO, (storeId, tx) =>
      resolverZona(storeId, { lat: NaN, lng: NaN }, tx),
    );

    expect(zona).toBeNull();
  });
});
