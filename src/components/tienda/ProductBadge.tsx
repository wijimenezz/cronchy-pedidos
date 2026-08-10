import { cva, type VariantProps } from "class-variance-authority";
import { Badge } from "@/components/ui/badge";

const productBadge = cva("rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase", {
  variants: {
    variant: {
      recomendado: "bg-badge-recomendado text-crema",
      nuevo: "bg-badge-nuevo text-crema",
      vendido: "bg-badge-vendido text-crema",
      agotado: "bg-badge-agotado text-crema",
    },
  },
});

// Solo "recomendado" y "agotado" se usan hoy: son los únicos flags reales en
// ProductoDeMenu. "nuevo"/"vendido" quedan listos para cuando exista el dato
// (no hay columna en product para derivarlos sin tocar el schema).
export function ProductBadge({
  variant,
  children,
}: VariantProps<typeof productBadge> & { children: React.ReactNode }) {
  return <Badge className={productBadge({ variant })}>{children}</Badge>;
}
