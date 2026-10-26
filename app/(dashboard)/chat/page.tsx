'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/contexts/i18n-context';
import { compressGallery } from '@/lib/compress-image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, Mic, Paperclip, Smile } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';


function ChatPageInner() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { user } = useAuth();
  const sp = useSearchParams();
  const router = useRouter();
  const leadId = sp.get('lead');
  const [info, setInfo] = useState(false);
  const [obs, setObs] = useState('');
  const [texto, setTexto] = useState('');
    const [camOpen, setCamOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioPendente, setAudioPendente] = useState<Blob | null>(null);
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);
  const [buscaConv, setBuscaConv] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const { data = [] } = useQuery({
    queryKey: ['chat', leadId],
    queryFn: async () => (await api.get('/chat', { params: leadId ? { lead_id: leadId } : {} })).data,
    refetchInterval: 4000,
    enabled: !!leadId,
  });
  const { data: conversasRaw = [] } = useQuery({
    queryKey: ['conversas', buscaConv],
    queryFn: async () => {
      try {
        const r = await api.get('/chat/conversas', {
          params: buscaConv.trim() ? { busca: buscaConv.trim() } : {},
        });
        return Array.isArray(r.data) ? r.data : [];
      } catch {
        return [];
      }
    },
    refetchInterval: 4000,
  });
  const conversasAll = Array.isArray(conversasRaw) ? conversasRaw : [];
  // filtro local de reforço (se API não filtrar por algum motivo)
  const conversas = !buscaConv.trim()
    ? conversasAll
    : conversasAll.filter((c: any) => {
        const q = buscaConv.trim().toLowerCase();
        const blob = [
          c.nome, c.telefone, c.email, c.interesse, c.ultima, c.cpf, c.cpf_cnpj, c.placa,
        ].map((x) => String(x || '').toLowerCase()).join(' ');
        return blob.includes(q);
      });
  useEffect(() => {
    if (!leadId || !Array.isArray(data) || !data.length) return;
    const lidos = JSON.parse(localStorage.getItem('manu.lidos') || '{}');
    lidos[leadId] = data.length;
    localStorage.setItem('manu.lidos', JSON.stringify(lidos));
  }, [leadId, Array.isArray(data) ? data.length : 0]);

  const enviandoRef = useRef(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(extra?: { arquivo_b64: string; arquivo_nome: string; arquivo_mime: string }) {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    try {
      if (audioPendente && !extra) {
        const blob = audioPendente;
        const reader = new FileReader();
        const done = () => {
          enviandoRef.current = false;
          setEnviando(false);
        };
        reader.onload = async () => {
          try {
            const data = String(reader.result || '');
            const b64 = data.includes(',') ? data.split(',')[1] : data;
            await api.post('/chat', {
              mensagem: texto || 'Áudio',
              arquivo_b64: b64,
              arquivo_nome: 'audio.webm',
              arquivo_mime: 'audio/webm',
              lead_id: leadId ? Number(leadId) : null,
            });
            setTexto('');
            setAudioPendente(null);
            qc.invalidateQueries({ queryKey: ['chat'] });
          } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Erro ao enviar áudio');
          } finally {
            done();
          }
        };
        reader.onerror = done;
        reader.readAsDataURL(blob);
        return;
      }
      const r = await api.post('/chat', {
        mensagem: texto,
        lead_id: leadId ? Number(leadId) : null,
        ...extra,
      });
      setTexto('');
      qc.invalidateQueries({ queryKey: ['chat'] });
      const w = r?.data?.whatsapp;
      if (w && w.ok === false) {
        toast.error(w.skipped || w.error || 'WhatsApp não enviou (confira token/telefone)');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao enviar');
    } finally {
      // áudio libera no onload; texto libera aqui
      if (!(audioPendente && !extra)) {
        enviandoRef.current = false;
        setEnviando(false);
      }
    }
  }

  async function apagar(id: number) {
    if (!confirm('Apagar mensagem?')) return;
    try {
      await api.delete(`/chat/${id}`);
      qc.invalidateQueries({ queryKey: ['chat'] });
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Não pode apagar'); }
  }
  async function salvarEdicao() {
    if (!editando) return;
    try {
      await api.patch(`/chat/${editando.id}`, { mensagem: editando.texto });
      setEditando(null);
      qc.invalidateQueries({ queryKey: ['chat'] });
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Não pode editar'); }
  }

  function sendBlob(blob: Blob, nome: string, mime: string) {
    if (blob.size > 4_000_000) { toast.error('Arquivo maior que 4MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || '');
      const b64 = data.includes(',') ? data.split(',')[1] : data;
      enviar({ arquivo_b64: b64, arquivo_nome: nome, arquivo_mime: mime });
    };
    reader.readAsDataURL(blob);
  }

  async function abrirCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      setCamOpen(true);
    } catch {
      toast.error('Câmera bloqueada. Autorize no navegador.');
    }
  }

  useEffect(() => {
    if (camOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [camOpen]);

  function fecharCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOpen(false);
  }

  function tirarFoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) sendBlob(blob, 'foto.jpg', 'image/jpeg');
      fecharCamera();
    }, 'image/jpeg', 0.85);
  }

  async function gravarAudio() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) || '';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        const tipo = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunks.current, { type: tipo });
        setAudioPendente(blob);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      rec.start(200);
      recRef.current = rec;
      setRecording(true);
    } catch (e: any) {
      toast.error(e?.name === 'NotAllowedError' ? 'Microfone bloqueado. Autorize no navegador.' : 'Não foi possível gravar o áudio.');
    }
  }

  async function onArquivo(f: File | undefined) {
    if (!f) return;
    try {
      if (f.type.startsWith('image/')) {
        const { compressGallery } = await import('@/lib/compress-image');
        f = await compressGallery(f);
      }
    } catch { /* mantém original */ }
    sendBlob(f, f.name, f.type || 'application/octet-stream');
  }

  
  if (!leadId) {
    const lidos = (() => { try { return JSON.parse(localStorage.getItem('manu.lidos') || '{}'); } catch { return {}; } })();
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-2xl font-bold">{t('page.chat.title')}</h1>
        <input
          className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder="Buscar nome, telefone, e-mail, CPF, carro..."
          value={buscaConv}
          onChange={(e) => setBuscaConv(e.target.value)}
        />
        {(Array.isArray(conversas) ? conversas : []).map((c: any) => {
          const nao = Math.max(0, Number(c.total || 0) - Number(lidos[c.id] || 0));
          return (
            <button key={c.id} onClick={() => router.push(`/chat?lead=${c.id}`)} className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left">
              <div>
                <div className="font-medium">{c.nome || 'Sem nome'}</div>
                <div className="text-xs text-muted-foreground">{c.ultima || c.telefone || 'nova conversa'}</div>
              </div>
              {nao > 0 && <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{nao}</span>}
            </button>
          );
        })}
      </div>
    );
  }

  const conv = (Array.isArray(conversas) ? conversas : []).find((c: any) => String(c.id) === String(leadId));

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-2xl flex-col">
      <div className="mb-2 flex items-center gap-2">
        <button onClick={() => router.push('/chat')} className="text-sm text-muted-foreground">← voltar</button>
        <button className="text-lg font-semibold" onClick={() => setInfo((v) => !v)}>{conv?.nome || 'Conversa'}</button>
      </div>
      {info && (
        <div className="mb-2 space-y-2 rounded-xl border border-border bg-card p-3 text-sm" onClick={(e) => e.stopPropagation()}>
          <div>Nome: {conv?.nome || '—'}</div>
          <div>Telefone: {conv?.telefone ? <a className="text-primary underline" href={`https://wa.me/55${String(conv.telefone).replace(/\D/g,'')}`} target="_blank">{conv.telefone}</a> : '—'}</div>
          <div>E-mail: {conv?.email || '—'}</div>
          <div>Interesse: {conv?.interesse || '—'}</div>
          <div className="flex gap-2">
            <input className="flex-1 rounded border bg-background px-2 py-1" placeholder="Observação interna" value={obs} onChange={(e) => setObs(e.target.value)} />
            <button className="rounded border px-2 py-1" onClick={async () => { if (!obs.trim()) return; await api.post('/chat', { mensagem: '[interno] ' + obs.trim(), lead_id: leadId }); setObs(''); qc.invalidateQueries({ queryKey: ['chat'] }); }}>Enviar</button>
          </div>
          <div className="max-h-28 overflow-y-auto rounded border border-border/50 p-2 text-xs">
            <div className="mb-1 font-medium text-muted-foreground">Histórico de transferências</div>
            {(Array.isArray(data) ? data : [])
              .filter((m: any) => String(m.mensagem || '').startsWith('Transferido de'))
              .map((m: any) => (
                <div key={m.id} className="py-0.5">{m.mensagem}</div>
              ))}
            {(Array.isArray(data) ? data : []).filter((m: any) => String(m.mensagem || '').startsWith('Transferido de')).length === 0 && (
              <div className="text-muted-foreground">Nenhuma transferência registrada neste chat.</div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button className="rounded border px-2 py-1" onClick={async () => { await api.post(`/leads/${leadId}/passar`); router.push('/chat'); }}>Passar</button>
            <button className="rounded border border-red-500 px-2 py-1 text-red-400" onClick={async () => { await api.delete(`/leads/${leadId}`); router.push('/chat'); }}>Apagar lead</button>
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card/30 p-3">
        {(Array.isArray(data) ? data : []).map((m: any) => {
          const meu = Number(m.remetente_id) === Number(user?.id);
          const inicial = String(m.remetente_nome || '?').trim().charAt(0).toUpperCase();
          return (
          <div key={m.id} className={`group flex items-end gap-2 ${meu ? 'flex-row-reverse' : ''}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">{inicial}</div>
            <div
              className={`relative max-w-[78%] rounded-2xl px-3 py-2 ${meu ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted'}`}
              onContextMenu={(e) => { e.preventDefault();  }}
              onTouchStart={() => { (window as any).__hold = setTimeout(() => , 400); }}
              onTouchEnd={() => clearTimeout((window as any).__hold)}
            >
            {!meu && <div className="text-xs font-medium opacity-70">{m.remetente_nome || 'alguém'}</div>}
            {m.mensagem && <div className="mt-0.5">{m.mensagem}</div>}
            {m.arquivo_b64 && String(m.arquivo_mime || '').startsWith('image') && (
              <img alt="" className="mt-2 max-h-52 rounded-lg" src={`data:${m.arquivo_mime};base64,${m.arquivo_b64}`} />
            )}
            {m.arquivo_b64 && String(m.arquivo_mime || '').startsWith('audio') && (
              <audio className="mt-2 w-full" controls src={`data:${m.arquivo_mime};base64,${m.arquivo_b64}`} />
            )}
            {m.arquivo_b64 && !String(m.arquivo_mime || '').startsWith('image') && !String(m.arquivo_mime || '').startsWith('audio') && (
              <a className="mt-2 block text-sm text-primary underline" href={`data:${m.arquivo_mime};base64,${m.arquivo_b64}`} download={m.arquivo_nome}>
                {m.arquivo_nome || 'arquivo'}
              </a>
            )}
            {
            <div className={`absolute -top-2 hidden gap-1 group-hover:flex ${meu ? 'right-0' : 'left-0'}`}>
              <button className="rounded-full border bg-card px-1 text-xs" onClick={() => setEditando({ id: m.id, texto: m.mensagem || '' })}>editar</button>
              <button className="rounded-full border bg-card px-1 text-xs" onClick={() => apagar(m.id)}>apagar</button>
            </div>
            {editando?.id === m.id && (
              <div className="mt-1 flex gap-1">
                <input className="flex-1 rounded border bg-background px-2 text-sm" value={editando.texto} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} />
                <button className="text-xs underline" onClick={salvarEdicao}>ok</button>
              </div>
            )}
            </div>
          </div>
          );
        })}
      </div>

      {camOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="space-y-3">
            <video ref={videoRef} autoPlay playsInline className="max-h-[70vh] rounded-lg" />
            <div className="flex justify-center gap-3">
              <Button onClick={() => tirarFoto()}>Tirar foto</Button>
              <Button variant="outline" onClick={() => fecharCamera()}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {audioPendente && (
        <div className="mt-2 flex items-center gap-2 text-sm">
          <audio controls src={URL.createObjectURL(audioPendente)} />
          <button className="text-xs underline" onClick={() => setAudioPendente(null)}>descartar</button>
          <span className="text-muted-foreground">clique em Enviar para mandar</span>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => onArquivo(e.target.files?.[0])} />
        <Button type="button" size="icon" variant="ghost" onClick={abrirCamera} title="Foto"><Camera className="h-5 w-5" /></Button>
        <Button type="button" size="icon" variant={recording ? 'default' : 'ghost'} onClick={gravarAudio} title={recording ? 'Parar' : 'Gravar áudio'}>
          <Mic className={`h-5 w-5 ${recording ? 'animate-pulse' : ''}`} />
        </Button>
        <Button type="button" size="icon" variant="ghost" onClick={() => fileRef.current?.click()} title="Arquivo"><Paperclip className="h-5 w-5" /></Button>
        <Input className="flex-1 rounded-full" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensagem" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
        <Button className="rounded-full" disabled={enviando} onClick={() => enviar()}>{enviando ? "…" : "Enviar"}</Button>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}
