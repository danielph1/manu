'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ login: '', senha: '' });

  useEffect(() => {
    if (isAuthenticated) router.replace('/painel');
  }, [isAuthenticated, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.login) {
      toast.error('Informe seu login');
      return;
    }
    setLoading(true);
    try {
      await login({ login: form.login.trim(), senha: form.senha });
      toast.success('Bem-vindo!');
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        'Falha ao entrar. Verifique login, senha e DATABASE_URL.';
      toast.error(String(msg));
      console.error('login failed', err?.response?.data || err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-card p-4">
      {/* logo sutil de fundo */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06]">
        <img src="/aurox-logo.png" alt="" className="h-[min(70vw,420px)] w-[min(70vw,420px)] object-contain" />
      </div>
      <Card className="relative z-10 w-full max-w-md border-border/60 shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex flex-col items-center gap-2">
            <img
              src="/aurox-logo.png"
              alt="Aurox"
              className="h-16 w-16 object-contain drop-shadow-[0_0_18px_rgba(94,234,212,0.25)]"
            />
          </div>
          <CardTitle className="text-2xl">Manu Automóveis</CardTitle>
          <CardDescription>Entre com suas credenciais para acessar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login">Login</Label>
              <Input
                id="login"
                placeholder="login"
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                placeholder="········"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Mesmo login/senha do Streamlit (coluna senha_hash no Supabase)
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
