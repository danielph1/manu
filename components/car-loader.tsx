'use client';

/** Splash / loading com logo Aurox + efeito CSS */
export function CarLoader({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-5 ${
        compact ? 'py-10' : 'min-h-screen'
      } bg-black`}
    >
      <div className="aurox-splash">
        <img src="/aurox-logo.png" alt="Aurox" className="aurox-logo-img" />
      </div>
      <p className="text-sm tracking-wide text-white/50">Carregando…</p>
      <style>{`
        .aurox-splash {
          position: relative;
          width: 140px;
          height: 140px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .aurox-logo-img {
          width: 120px;
          height: 120px;
          object-fit: contain;
          animation: auroxPulse 1.8s ease-in-out infinite;
          filter: drop-shadow(0 0 22px rgba(94, 234, 212, 0.35));
        }
        .aurox-splash::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid transparent;
          border-top-color: rgba(94, 234, 212, 0.7);
          border-right-color: rgba(94, 234, 212, 0.25);
          animation: auroxSpin 1.2s linear infinite;
        }
        @keyframes auroxPulse {
          0%, 100% { transform: scale(0.94); opacity: 0.75; }
          50% { transform: scale(1.04); opacity: 1; }
        }
        @keyframes auroxSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
