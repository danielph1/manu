'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/i18n-context';
import { useAuth } from '@/contexts/auth-context';

export default function FeedPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  if (String(user?.tipo || '').toLowerCase() !== 'superadmin') {
    return (
      <div className="mx-auto max-w-lg p-6">
        <h1 className="text-2xl font-bold">Feed</h1>
        <p className="mt-2 text-sm text-muted-foreground">Área em testes — disponível apenas para superadmin.</p>
      </div>
    );
  }
  const qc = useQueryClient();
  const [texto, setTexto] = useState('');
  const [openComments, setOpenComments] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<any[]>([]);

  const { data = [], isLoading } = useQuery({
    queryKey: ['feed'],
    queryFn: async () => (await api.get('/feed')).data,
    refetchInterval: 15000,
  });

  useEffect(() => {
    // registra view nos 5 primeiros ao abrir
    const list = Array.isArray(data) ? data.slice(0, 5) : [];
    list.forEach((p: any) => {
      api.post(`/feed/${p.id}/view`).catch(() => {});
    });
  }, [Array.isArray(data) ? data.map((p: any) => p.id).join(',') : '']);

  async function publicar() {
    if (!texto.trim()) return;
    try {
      await api.post('/feed', { texto: texto.trim() });
      setTexto('');
      qc.invalidateQueries({ queryKey: ['feed'] });
      toast.success(t('feed.publish'));
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro');
    }
  }

  async function like(id: number) {
    try {
      await api.post(`/feed/${id}/like`);
      qc.invalidateQueries({ queryKey: ['feed'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro');
    }
  }

  async function loadComments(id: number) {
    setOpenComments(id);
    try {
      const { data } = await api.get(`/feed/${id}/comentarios`);
      setComments(Array.isArray(data) ? data : []);
    } catch {
      setComments([]);
    }
  }

  async function sendComment() {
    if (!openComments || !comment.trim()) return;
    try {
      await api.post(`/feed/${openComments}/comentarios`, { texto: comment.trim() });
      setComment('');
      loadComments(openComments);
      qc.invalidateQueries({ queryKey: ['feed'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro');
    }
  }

  const posts = Array.isArray(data) ? data : [];

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-28">
      <header>
        <h1 className="text-2xl font-bold">{t('feed.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('feed.subtitle')}</p>
      </header>

      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <textarea
          className="min-h-[72px] w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder={t('feed.placeholder')}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={500}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={publicar} disabled={!texto.trim()}>
            {t('feed.publish')}
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && posts.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('feed.empty')}</p>
      )}

      {posts.map((p: any) => (
        <article key={p.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary/20 text-sm font-semibold">
              {p.autor_foto ? (
                <img src={p.autor_foto} alt="" className="h-full w-full object-cover" />
              ) : (
                String(p.autor_nome || p.autor_login || '?').charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <div className="text-sm font-medium">{p.autor_nome || p.autor_login || '—'}</div>
              <div className="text-[11px] text-muted-foreground">
                {p.created_at ? new Date(p.created_at).toLocaleString('pt-BR') : ''}
              </div>
            </div>
          </div>
          {p.texto && <p className="whitespace-pre-wrap text-sm">{p.texto}</p>}
          {p.midia_url && p.midia_tipo?.startsWith('image') && (
            <img src={p.midia_url} alt="" className="max-h-80 w-full rounded-lg object-cover" />
          )}
          {p.midia_url && p.midia_tipo?.startsWith('video') && (
            <video src={p.midia_url} controls className="max-h-80 w-full rounded-lg" />
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => like(p.id)}
              className={`flex items-center gap-1 ${p.eu_curti ? 'text-rose-400' : ''}`}
            >
              <Heart className={`h-4 w-4 ${p.eu_curti ? 'fill-current' : ''}`} />
              {p.likes || 0}
            </button>
            <button type="button" onClick={() => loadComments(p.id)} className="flex items-center gap-1">
              <MessageCircle className="h-4 w-4" />
              {p.comentarios || 0}
            </button>
            <span className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              {p.views || 0} {t('feed.views')}
            </span>
          </div>
          {openComments === p.id && (
            <div className="space-y-2 border-t border-border pt-2">
              {comments.map((c) => (
                <div key={c.id} className="text-sm">
                  <span className="font-medium">{c.autor_nome || '—'}: </span>
                  {c.texto}
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t('feed.comment')}
                />
                <Button size="sm" onClick={sendComment}>
                  {t('common.send')}
                </Button>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
