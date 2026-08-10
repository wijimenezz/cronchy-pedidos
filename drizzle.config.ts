import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DIRECT_URL!,
  },
  // PostGIS instala objetos propios (spatial_ref_sys, geography_columns, …). Sin este
  // filtro, drizzle-kit los ve como tablas ajenas al schema y propone dropearlas.
  extensionsFilters: ["postgis"],
});
