'use client';
import { TEMAS, useTema } from '@/contexts/theme-context';
import { Check } from 'lucide-react';

export default function TemasPage() {
  const { tema, setTema } = useTema();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold">Tema</h1>
      <p className="text-muted-foreground">Escolha o visual. Fica salvo neste aparelho.</p>
      <div className="grid grid-cols-2 gap-3">
        {TEMAS.map((t) => (
          <button key={t.id} onClick={() => setTema(t.id)} className={`rounded-xl border p-4 text-left ${tema === t.id ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">{t.nome}</span>
              {tema === t.id && <Check className="h-4 w-4 text-primary" />}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
