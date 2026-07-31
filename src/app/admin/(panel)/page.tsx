import { redirect } from "next/navigation";

/** El panel es, ante todo, la pantalla de pedidos. */
export default function AdminPage() {
  redirect("/admin/pedidos");
}
