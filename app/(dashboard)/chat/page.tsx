'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, Mic, Paperclip, Smile } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏'];

export default function ChatPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [texto, setTexto] = useState('');
  const [picker, setPicker] = useState<number | null>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioPendente, setAudioPendente] = useState<Blob | null>(null);
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const { data = [] } = useQuery({
    queryKey: ['chat'],
    queryFn: async () => (await api.get('/chat')).data,
    refetchInterval: 8000,
  });

  async function enviar(extra?: { arquivo_b64: string; arquivo_nome: string; arquivo_mime: string }) {
    try {
      if (audioPendente && !extra) {
        const blob = audioPendente;
        const reader = new FileReader();
        reader.onload = async () => {
          const data = String(reader.result || '');
          const b64 = data.includes(',') ? data.split(',')[1] : data;
          await api.post('/chat', { mensagem: texto || 'Áudio', arquivo_b64: b64, arquivo_nome: 'audio.webm', arquivo_mime: 'audio/webm' });
          setTexto('');
          setAudioPendente(null);
          qc.invalidateQueries({ queryKey: ['chat'] });
        };
        reader.readAsDataURL(blob);
        return;
      }
      await api.post('/chat', { mensagem: texto, ...extra });
      setTexto('');
      qc.invalidateQueries({ queryKey: ['chat'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Erro ao enviar');
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

  function onArquivo(f: File | undefined) {
    if (!f) return;
    sendBlob(f, f.name, f.type || 'application/octet-stream');
  }

  async function reagir(id: number, emoji: string) {
    setPicker(null);
    try {
      await api.post('/chat/reacao', { mensagem_id: id, emoji });
      qc.invalidateQueries({ queryKey: ['chat'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Reação indisponível');
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-2xl flex-col">
      <h1 className="mb-3 text-3xl font-bold">Chat</h1>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card/30 p-3">
        {(Array.isArray(data) ? data : []).map((m: any) => {
          const meu = Number(m.remetente_id) === Number(user?.id);
          const inicial = String(m.remetente_nome || '?').trim().charAt(0).toUpperCase();
          return (
          <div key={m.id} className={`group flex items-end gap-2 ${meu ? 'flex-row-reverse' : ''}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">{inicial}</div>
            <div className={`relative max-w-[78%] rounded-2xl px-3 py-2 ${meu ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted'}`}>
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
            {(m.reacoes || []).length > 0 && (
              <div className="mt-1 flex gap-1">
                {(m.reacoes || []).map((r: any) => (
                  <span key={r.emoji} className="rounded-full bg-background px-1.5 text-xs">{r.emoji} {r.n}</span>
                ))}
              </div>
            )}
            <div className="absolute -right-2 -top-2 hidden gap-1 group-hover:flex">
              <button className="rounded-full border bg-card p-1" onClick={() => setPicker(picker === m.id ? null : m.id)}><Smile className="h-4 w-4" /></button>
              <button className="rounded-full border bg-card px-1 text-xs" onClick={() => setEditando({ id: m.id, texto: m.mensagem || '' })}>editar</button>
              <button className="rounded-full border bg-card px-1 text-xs" onClick={() => apagar(m.id)}>apagar</button>
            </div>
            {editando?.id === m.id && (
              <div className="mt-1 flex gap-1">
                <input className="flex-1 rounded border bg-background px-2 text-sm" value={editando.texto} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} />
                <button className="text-xs underline" onClick={salvarEdicao}>ok</button>
              </div>
            )}
            {picker === m.id && (
              <div className="absolute -top-10 left-0 z-10 flex gap-1 rounded-full border bg-card px-2 py-1 shadow-lg">
                {EMOJIS.map((e) => (
                  <button key={e} className="text-lg hover:scale-125" onClick={() => reagir(m.id, e)}>{e}</button>
                ))}
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
        <Input className="flex-1 rounded-full" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensagem" onKeyDown={(e) => e.key === 'Enter' && enviar()} />
        <Button className="rounded-full" onClick={() => enviar()}>Enviar</Button>
      </div>
    </div>
  );
}
