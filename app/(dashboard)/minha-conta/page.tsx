'use client';
import { useAuth } from '@/contexts/auth-context';

export default function MinhaContaPage() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Minha conta</h1>
      <p className="text-sm text-muted-foreground">Estrutura pronta. Os campos entram depois.</p>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
        <Campo label="Nome" valor={user?.login} />
        <Campo label="Perfil" valor={user?.tipo} />
        <Campo label="Loja" valor={user?.loja} />
        <Campo label="Telefone" valor="—" />
        <Campo label="E-mail" valor="—" />
      </div>
    </div>
  );
}
function Campo({ label, valor }: { label: string; valor?: string }) {
  return (
    <div className="flex justify-between border-b border-border py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="capitalize">{valor || '—'}</span>
    </div>
  );
}
