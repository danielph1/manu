import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { PWAProvider } from '@/components/pwa-provider';

export const metadata: Metadata = {
  title: 'Project Manu  Gestao de Leads',
  description: 'Sistema de gestao de leads, estoque e vendas',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Manu' },
  robots: { index: false, follow: false },
  icons: { icon: '/aurox.jpeg', apple: '/aurox.jpeg' },
};

export const viewport: Viewport = {
  themeColor: '#dc2626',
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
        <PWAProvider />
      </body>
    </html>
  );
}
