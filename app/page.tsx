'use client';
import { CarLoader } from '@/components/car-loader';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  useEffect(() => {
    if (isLoading) return;
    router.replace(isAuthenticated ? '/painel' : '/login');
  }, [isAuthenticated, isLoading, router]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <CarLoader />
    </div>
  );
}
