import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { PWAProvider } from '@/components/pwa-provider';

export const metadata: Metadata = {
  title: 'Manu Automóveis',
  description: 'Sistema de gestão de leads, estoque e vendas — Aurox',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Manu' },
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/aurox-logo.png', type: 'image/png' }],
    apple: [{ url: '/aurox-logo.png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body { background: #0a0a0a; margin: 0; }
              #aurox-boot {
                position: fixed; inset: 0; z-index: 99999;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                background: #0a0a0a;
                transition: opacity .35s ease, visibility .35s ease;
              }
              #aurox-boot.hide { opacity: 0; visibility: hidden; pointer-events: none; }
              #aurox-boot img {
                width: 112px; height: 112px; object-fit: contain;
                animation: bootPulse 1.8s ease-in-out infinite;
                filter: drop-shadow(0 0 20px rgba(94,234,212,.35));
              }
              #aurox-boot .ring {
                position: absolute; width: 132px; height: 132px; border-radius: 50%;
                border: 2px solid transparent;
                border-top-color: rgba(94,234,212,.7);
                border-right-color: rgba(94,234,212,.2);
                animation: bootSpin 1.1s linear infinite;
              }
              @keyframes bootPulse {
                0%,100% { transform: scale(.94); opacity:.75 }
                50% { transform: scale(1.05); opacity:1 }
              }
              @keyframes bootSpin { to { transform: rotate(360deg) } }
            `,
          }}
        />
      </head>
      <body className="bg-background text-foreground antialiased" suppressHydrationWarning>
        <div id="aurox-boot" aria-hidden="true">
          <div style={{ position: 'relative', width: 132, height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="ring" />
            <img src="/aurox-logo.png" alt="Aurox" />
          </div>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                function hide(){
                  var el = document.getElementById('aurox-boot');
                  if (el) el.classList.add('hide');
                }
                if (document.readyState === 'complete') setTimeout(hide, 400);
                else window.addEventListener('load', function(){ setTimeout(hide, 400); });
                setTimeout(hide, 2500);
              })();
            `,
          }}
        />
        <Providers>{children}</Providers>
        <PWAProvider />
      </body>
    </html>
  );
}
