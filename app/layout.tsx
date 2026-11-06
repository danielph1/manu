import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Aurox — Gestão Automotiva',
  description: 'Gestão de leads, estoque, atendimento e vendas por empresa',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Aurox' },
  robots: { index: false, follow: false },
  icons: { icon: '/aurox.jpeg', apple: '/aurox.jpeg' },
};

export const viewport: Viewport = {
  themeColor: '#24172f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
