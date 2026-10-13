'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { AuthProvider } from '@/contexts/auth-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { FavoritosProvider } from '@/contexts/favoritos-context';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({
      defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
    }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
      <AuthProvider>
        <FavoritosProvider>
        {children}
        <Toaster richColors position="top-right" />
      </FavoritosProvider>
      </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
