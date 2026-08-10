import { getStore } from "@/db/queries/store";
import { leerSesion } from "@/lib/auth/cookie";
import { redirect } from "next/navigation";
import { FormularioLogin } from "./FormularioLogin";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>;
}) {
  // Quien ya entró no tiene por qué ver el login otra vez.
  if (await leerSesion()) redirect("/admin/pedidos");

  const { destino } = await searchParams;
  const tienda = await getStore();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-5 py-10">
      <h1 className="font-titulo text-2xl font-bold text-cafe">{tienda.nombre}</h1>
      <p className="mt-1 mb-6 font-cuerpo text-[15px] text-cafe-suave">
        Entra para gestionar los pedidos.
      </p>

      <FormularioLogin destino={destino} />
    </main>
  );
}
