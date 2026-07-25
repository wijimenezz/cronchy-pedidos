export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/textura-happy-cronchy.png')] bg-[length:280px_auto] bg-repeat opacity-[0.12]"
      />
      <div className="relative flex flex-1 flex-col">{children}</div>
    </div>
  );
}
