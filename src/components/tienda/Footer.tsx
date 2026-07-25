type Tienda = { nombre: string; direccion: string | null };

export function Footer({ tienda }: { tienda: Tienda }) {
  return (
    <footer className="flex flex-col items-center gap-2 rounded-t-lg bg-tarjeta px-5 py-6 text-center shadow-tarjeta">
      <div className="font-titulo text-lg font-semibold text-cafe">{tienda.nombre}</div>
      {tienda.direccion && <p className="text-sm text-cafe-suave">{tienda.direccion}</p>}
      <div className="mt-1 text-xs text-cafe-tenue">
        © {new Date().getFullYear()} {tienda.nombre}
      </div>
    </footer>
  );
}
