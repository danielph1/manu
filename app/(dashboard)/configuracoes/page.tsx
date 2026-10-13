'use client';
import Link from 'next/link';
import { User, Heart, Palette, Info, Shield, ChevronRight } from 'lucide-react';

const Item = ({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => (
  <Link href={href} className="flex items-center justify-between border-b border-border px-4 py-4 text-sm last:border-0">
    <span className="flex items-center gap-3">
      <Icon className="h-5 w-5 text-muted-foreground" />
      {label}
    </span>
    <ChevronRight className="h-4 w-4 text-muted-foreground" />
  </Link>
);

export default function ConfiguracoesPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Minha conta</h1>

      <section>
        <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">Dados pessoais</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Item href="/minha-conta" icon={User} label="Minha conta" />
          <Item href="/favoritos" icon={Heart} label="Meus favoritos" />
          <Item href="/temas" icon={Palette} label="Tema" />
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">Institucional</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Item href="/sobre" icon={Info} label="Sobre nós" />
          <Item href="/privacidade" icon={Shield} label="Políticas de privacidade" />
        </div>
      </section>
    </div>
  );
}
