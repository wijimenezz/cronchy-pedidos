type Tienda = { nombre: string; direccion: string | null };

export function Footer({ tienda }: { tienda: Tienda }) {
  return (
    <footer className="flex flex-col items-center gap-2 rounded-t-lg bg-cafe px-5 py-6 text-center text-crema shadow-tarjeta">
      <div className="font-titulo text-lg font-semibold">{tienda.nombre}</div>
      {tienda.direccion && <p className="text-sm text-crema/80">{tienda.direccion}</p>}
      <div className="mt-1 text-xs text-crema/60">
        © {new Date().getFullYear()} {tienda.nombre}
      </div>
    </footer>
  );
}
