export function CarLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background">
      <div className="flex items-end gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="car-front" style={{ animationDelay: `${i * 0.2}s` }}>
            <span className="faro esq" />
            <span className="grade" />
            <span className="faro dir" />
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Carregando…</p>
      <style>{`
        .car-front {
          width: 72px; height: 36px; border-radius: 18px 18px 8px 8px;
          background: hsl(var(--primary)); opacity: 0.85;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 8px; position: relative;
          animation: pulseCar 1.4s ease-in-out infinite;
        }
        .car-front .grade {
          width: 28px; height: 14px; border-radius: 3px;
          background: repeating-linear-gradient(90deg, #111 0 2px, transparent 2px 5px);
        }
        .car-front .faro {
          width: 10px; height: 8px; border-radius: 4px;
          background: #fff; box-shadow: 0 0 8px #fff;
        }
        @keyframes pulseCar {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
