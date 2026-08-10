import { Star, ChevronRight } from "lucide-react";

export function SectionTitle({
  children,
  verTodosHref,
}: {
  children: React.ReactNode;
  verTodosHref?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="relative flex items-center gap-2 font-titulo text-xl font-semibold text-cafe">
        <Star className="size-5 shrink-0 fill-naranja text-naranja" />
        <span className="relative pb-1.5">
          {children}
          {/* Subrayado ondulado decorativo: SVG inline, sin asset nuevo. */}
          <svg
            aria-hidden
            className="absolute -bottom-0.5 left-0 h-1.5 w-full text-naranja"
            viewBox="0 0 100 6"
            preserveAspectRatio="none"
          >
            <path
              d="M0 3 Q 8 0, 16 3 T 32 3 T 48 3 T 64 3 T 80 3 T 100 3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </h2>

      {verTodosHref && (
        <a
          href={verTodosHref}
          className="flex shrink-0 items-center text-sm font-semibold text-naranja hover:underline"
        >
          Ver todos
          <ChevronRight className="size-4" />
        </a>
      )}
    </div>
  );
}
