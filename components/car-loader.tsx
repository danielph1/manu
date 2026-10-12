export function CarLoader({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${compact ? 'py-10' : 'min-h-screen'} bg-background`}>
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
          background: hsl(var(--primary)); opacity: 0.9;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 8px;
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
          0%, 100% { transform: translateY(0); opacity: 0.45; }
          50% { transform: translateY(-8px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
