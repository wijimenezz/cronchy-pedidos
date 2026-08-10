import { ArrowLeft } from "lucide-react";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 py-4">
      <header className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full text-cafe">
          <ArrowLeft className="size-5" />
        </span>
        <h1 className="font-titulo text-xl font-semibold text-cafe">Confirmar pedido</h1>
      </header>
      <div className="flex flex-col gap-4" aria-hidden>
        <div className="h-40 animate-pulse rounded-md bg-crema-oscura/40" />
        <div className="h-52 animate-pulse rounded-md bg-crema-oscura/40" />
        <div className="h-32 animate-pulse rounded-md bg-crema-oscura/40" />
        <div className="h-11 animate-pulse rounded-full bg-crema-oscura/40" />
      </div>
    </main>
  );
}
