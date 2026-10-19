'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Car, Loader2 } from 'lucide-react';
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
      {/* logo sutil — canto superior direito */}
      <img
        src="/aurox-logo.png"
        alt="Aurox"
        className="pointer-events-none absolute right-5 top-5 h-14 w-14 object-contain opacity-70 md:h-16 md:w-16 md:opacity-80"
      />

      <Card className="w-full max-w-md border-border/60 shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Car className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Project Manu</CardTitle>
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
