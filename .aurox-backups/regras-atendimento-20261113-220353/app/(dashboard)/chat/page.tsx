'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/contexts/i18n-context';
import { compressGallery } from '@/lib/compress-image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Camera, Info, LockKeyhole, MessageCircle, Mic, MoreVertical, Paperclip, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';


/** URL assinada é obtida via api.get, que inclui o JWT do MANU.
 * Não colocar /api/chat/media diretamente no <img>/<audio>: a autenticação
 * deste sistema usa Bearer no Axios, não cookie do navegador. */
function MidiaPrivadaAurox({ mensagemId, mime }: { mensagemId:number; mime:string }) {
  const [src,setSrc]=useState('');
  const [erro,setErro]=useState('');
  const [tentativa,setTentativa]=useState(0);
  useEffect(()=>{
    let ativa=true;
    const carregar=async()=>{
      try {
        const {data}=await api.get(`/chat/media/${mensagemId}`);
        if(ativa){setSrc(String(data.url||''));setErro('');}
      }catch{
        if(ativa){setErro('Não foi possível carregar a mídia.');setSrc('');}
      }
    };
    void carregar();
    // Não renovar durante a reprodução: mudar src reiniciaria o áudio.
    return ()=>{ativa=false;};
  },[mensagemId,tentativa]);
  if(erro)return <button type="button" className="mt-2 text-xs underline" onClick={()=>setTentativa(t=>t+1)}>{erro} Tentar novamente</button>;
  if(!src)return <div className="mt-2 text-xs opacity-70">Carregando mídia…</div>;
  if(mime.startsWith('image/'))return <img alt="Foto recebida do cliente" loading="lazy" className="mt-2 max-h-64 max-w-full rounded-lg object-contain" src={src}/>;
  if(mime.startsWith('audio/'))return <div className="mt-2 min-w-[220px] max-w-full sm:min-w-[280px]">
    <audio className="block w-full" controls preload="metadata" src={src}>Seu navegador não reproduz este áudio.</audio>
    <div className="mt-1 flex gap-3 text-[11px] opacity-70">
      <a href={src} target="_blank" rel="noopener noreferrer" className="underline">Abrir áudio</a>
      <button className="underline" type="button" onClick={()=>setTentativa(t=>t+1)}>Atualizar arquivo</button>
    </div>
  </div>;
  return null;
}

function ChatPageInner() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { user } = useAuth();
  const sp = useSearchParams();
  const router = useRouter();
  const leadId = sp.get('lead');
  const [info, setInfo] = useState(false);
  const [menuMensagem,setMenuMensagem] = useState<number|null>(null);
  const [salvandoNota,setSalvandoNota] = useState(false);
  const mensagensRef=useRef<HTMLDivElement>(null);
  const [obs, setObs] = useState('');
  const [texto, setTexto] = useState('');
    const [camOpen, setCamOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioPendente, setAudioPendente] = useState<Blob | null>(null);
  const [previewAudio,setPreviewAudio]=useState('');
  useEffect(()=>{
    if(!audioPendente){setPreviewAudio('');return;}
    const objectUrl=URL.createObjectURL(audioPendente);
    setPreviewAudio(objectUrl);
    return ()=>URL.revokeObjectURL(objectUrl);
  },[audioPendente]);
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

  useEffect(()=>{
    if(!leadId)return;
    const el=mensagensRef.current;
    if(el)el.scrollTop=el.scrollHeight;
  },[leadId,Array.isArray(data)?data.length:0]);
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
            const response = await api.post('/chat', {
              mensagem: '',
              arquivo_b64: b64,
              arquivo_nome: blob.type.includes('mp4') ? 'audio.m4a' : blob.type.includes('ogg') ? 'audio.ogg' : 'audio.webm',
              arquivo_mime: blob.type || 'audio/webm',
              lead_id: leadId ? Number(leadId) : null,
            });
            if (response?.data?.whatsapp?.ok === false) {
              toast.message(response.data.whatsapp.message || 'Arquivo salvo apenas no MANU.');
            }
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
      qc.invalidateQueries({ queryKey: ['conversas'] });
      const w = r?.data?.whatsapp;
      if (w && w.ok === false) {
        toast.message(w.message || 'Mensagem salva no MANU, mas não encaminhada ao WhatsApp. Verifique a conexão desta empresa.');
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
    if (blob.size > 4_000_000) { toast.error('Arquivo maior que 4 MB'); return; }
    if (!/^(image\/(jpeg|png|webp)|audio\/(ogg|mpeg|mp4|aac|webm))(;|$)/i.test(mime)) {
      toast.error('Selecione uma foto ou áudio. Vídeos não são permitidos.');return;
    }
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
    if(fileRef.current)fileRef.current.value='';
  }

  
  const conv = (Array.isArray(conversasAll) ? conversasAll : []).find((c:any)=>String(c.id)===String(leadId));
  const papel = String(user?.tipo||'').toLowerCase();
  const podeNota = papel==='vendedor' || papel==='superadmin';
  const podeTransferir = ['superadmin','admin','marketing','gerente'].includes(papel);
  const podeExcluir = ['superadmin','admin','marketing','gerente'].includes(papel);
  const mensagens = Array.isArray(data) ? data : [];
  const nomeConv = String(conv?.nome || 'Conversa');
  const initials = (v:unknown)=>String(v||'?').trim().slice(0,1).toUpperCase();
  const resumo = (v:unknown)=>{
    const x=String(v||'').replace(/^(?:\[(?:cliente|Aurox-WhatsApp)\]\s*)+/gi,'').trim();
    return /^\[interno\]/i.test(x) ? '🔒 Nota interna' : x || 'Inicie uma conversa';
  };
  async function salvarNota(){
    if(!leadId || !obs.trim() || !podeNota)return;
    setSalvandoNota(true);
    try {
      await api.post('/chat',{lead_id:Number(leadId),mensagem:obs.trim(),interno:true});
      setObs('');
      toast.success('Nota interna registrada. Lead mantido com o vendedor responsável.');
      await Promise.all([qc.invalidateQueries({queryKey:['chat',leadId]}),qc.invalidateQueries({queryKey:['conversas']})]);
    }catch(e:any){toast.error(e?.response?.data?.error||'Não foi possível registrar a nota.');}
    finally{setSalvandoNota(false);}
  }
  async function transferirLead(){
    if(!leadId || !podeTransferir)return;
    const fixado=Boolean(conv?.fixado);
    if(fixado && papel!=='superadmin')return toast.error('O comentário interno fixou este lead ao vendedor.');
    if(fixado && !window.confirm('Este lead está fixado por nota interna. Confirma a transferência excepcional como superadmin?'))return;
    try {
      await api.post(`/leads/${leadId}/passar`,fixado?{forcar_transferencia:true}:{});
      toast.success('Lead transferido.');router.push('/chat');qc.invalidateQueries({queryKey:['conversas']});
    }catch(e:any){toast.error(e?.response?.data?.error||'Falha ao transferir lead.');}
  }
  const telConv = String(conv?.telefone||'').replace(/\D/g,'');
  const urlTelefone = telConv ? `https://wa.me/${telConv.startsWith('55')?telConv:'55'+telConv}` : '';

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] min-h-[400px] w-full max-w-7xl overflow-hidden rounded-xl border border-border/70 bg-card shadow-xl shadow-black/10 md:h-[calc(100dvh-7rem)] md:rounded-2xl">
      {/* Duas colunas no desktop; no celular exibe a lista OU a conversa. */}
      <aside className={`${leadId?'hidden md:flex':'flex'} w-full shrink-0 flex-col border-r border-border/60 bg-background/70 md:w-[330px] lg:w-[365px]`}>
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-4">
          <div>
            <div className="text-xl font-bold tracking-tight">Conversas</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Atendimento Aurox · {conversasAll.length} contato(s)</div>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageCircle className="h-5 w-5"/></span>
        </div>
        <div className="relative mx-3 my-3">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/>
          <input aria-label="Buscar conversas" value={buscaConv} onChange={e=>setBuscaConv(e.target.value)}
            placeholder="Buscar contato ou telefone" className="w-full rounded-xl border border-border/70 bg-muted/50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"/>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversas.map((c:any)=>{
            const ativo=String(c.id)===String(leadId);
            return <button type="button" key={c.id}
              className={`flex w-full items-center gap-3 border-b border-border/40 px-3 py-3 text-left transition-colors hover:bg-primary/5 ${ativo?'bg-primary/10':''}`}
              onClick={()=>{setInfo(false);router.push(`/chat?lead=${c.id}`);}}>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/25 to-violet-500/10 font-bold text-primary">{initials(c.nome)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{c.nome||'Sem nome'}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{c.ultima_em?new Date(c.ultima_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):''}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{resumo(c.ultima)||c.telefone||'Nova conversa'}</span>
                  {c.fixado && <LockKeyhole aria-label="Lead fixado" className="h-3.5 w-3.5 shrink-0 text-amber-500"/>}
                </div>
              </div>
            </button>;
          })}
          {conversas.length===0 && <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</div>}
        </div>
      </aside>
      <section className={`${!leadId?'hidden md:flex':'flex'} min-w-0 flex-1 flex-col bg-background/30`}>
        {!leadId ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary"><MessageCircle className="h-9 w-9"/></div>
            <h2 className="text-2xl font-semibold">Atendimento em um só lugar</h2>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">Selecione um contato à esquerda para abrir as mensagens, imagens e áudios da conversa.</p>
          </div>
        ) : <>
          <header className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/90 px-2 py-2.5 shadow-sm sm:px-4">
            <button aria-label="Voltar às conversas" type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted md:hidden" onClick={()=>{setInfo(false);router.push('/chat');}}><ArrowLeft className="h-5 w-5"/></button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-fuchsia-300/20 text-sm font-bold text-primary">{initials(nomeConv)}</div>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={()=>setInfo(v=>!v)}>
              <div className="flex items-center gap-2"><span className="truncate text-sm font-bold sm:text-base">{nomeConv}</span>{conv?.fixado && <LockKeyhole className="h-3.5 w-3.5 text-amber-500"/>}</div>
              <span className="block truncate text-xs text-muted-foreground">{conv?.telefone||'Contato do MANU'} {conv?.interesse?'· '+conv.interesse:''}</span>
            </button>
            <button type="button" className={`flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted ${info?'bg-muted':''}`} title="Informações e nota interna" aria-label="Informações da conversa" onClick={()=>setInfo(v=>!v)}><Info className="h-5 w-5"/></button>
          </header>
          {info && <div className="z-10 max-h-[45vh] shrink-0 space-y-3 overflow-y-auto border-b border-border/70 bg-card p-3 text-sm shadow-lg sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="font-semibold">{nomeConv}</div><div className="text-xs text-muted-foreground">{conv?.interesse||'Sem interesse informado'}</div></div>
              {urlTelefone && <a href={urlTelefone} target="_blank" rel="noopener noreferrer" className="rounded-full border px-3 py-2 text-xs text-primary">Abrir WhatsApp</a>}
            </div>
            <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <span>Telefone: {conv?.telefone||'—'}</span><span>E-mail: {conv?.email||'—'}</span>
            </div>
            {conv?.fixado && <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-300"><LockKeyhole className="h-4 w-4"/>Lead fixado: sem rotação automática para outro vendedor.</div>}
            {podeNota && <div className="rounded-xl border border-border bg-muted/20 p-3">
              <label htmlFor="aurox-nota" className="flex items-center gap-2 text-xs font-semibold"><LockKeyhole className="h-4 w-4"/>Nota interna — não enviada ao cliente</label>
              <textarea id="aurox-nota" rows={2} maxLength={7800} className="mt-2 w-full resize-y rounded-lg border bg-background p-2 text-sm" placeholder="Ex.: cliente pediu retorno amanhã; manter com o vendedor atual" value={obs} onChange={e=>setObs(e.target.value)}/>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">Ao salvar, o lead permanece com o vendedor responsável.</span>
                <button disabled={salvandoNota||!obs.trim()} onClick={salvarNota} type="button" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{salvandoNota?'Salvando…':'Salvar nota interna'}</button></div>
            </div>}
            {(podeTransferir||podeExcluir) && <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
              {podeTransferir && <button type="button" className="rounded-lg border px-3 py-2 text-xs" onClick={transferirLead}>Transferir lead</button>}
              {podeExcluir && <button type="button" className="rounded-lg border border-destructive/50 px-3 py-2 text-xs text-destructive" onClick={async()=>{
                if(!confirm('Excluir definitivamente este lead?'))return;
                try{await api.delete(`/leads/${leadId}`);router.push('/chat');qc.invalidateQueries({queryKey:['conversas']});}
                catch(e:any){toast.error(e?.response?.data?.error||'Não foi possível excluir.');}
              }}>Excluir lead</button>}
            </div>}
          </div>}
          <div ref={mensagensRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-6"
            style={{backgroundImage:'radial-gradient(circle at 15% 20%, rgba(168,85,247,0.035) 0 2px, transparent 3px), radial-gradient(circle at 75% 50%, rgba(168,85,247,0.035) 0 1.5px, transparent 3px)',backgroundSize:'72px 72px,110px 110px'}}>
            {mensagens.length===0 && <div className="mx-auto mt-20 max-w-xs rounded-xl bg-card/90 p-4 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda. Escreva abaixo para começar o atendimento.</div>}
            {mensagens.map((m:any)=>{
              const meu=Number(m.remetente_id)===Number(user?.id);
              const interno=/^\[interno\]/i.test(String(m.mensagem||''));
              const transfer=/^Transferido de /i.test(String(m.mensagem||''));
              const textoLimpo=String(m.mensagem||'').replace(/^(?:\[(?:cliente|Aurox-WhatsApp)\]\s*)+/gi,'').replace(/^\[interno\]\s*/i,'').trim();
              const temMidia=Boolean(m.arquivo_b64||m.aurox_media_chat_id);
              const legenda=temMidia && /^\[(?:Áudio|Mensagem de voz|Foto|Imagem)(?: recebida)?\]$/i.test(textoLimpo)?'':textoLimpo;
              if(transfer)return <div key={m.id} className="mx-auto max-w-[85%] rounded-full bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">{textoLimpo}</div>;
              return <div key={m.id} className={`group flex ${interno?'justify-center':meu?'justify-end':'justify-start'}`}>
                <div className={`relative min-w-0 max-w-[88%] rounded-2xl px-3 py-2 shadow-sm sm:max-w-[72%] ${interno?'border border-amber-500/25 bg-amber-500/10':meu?'rounded-br-sm bg-primary text-primary-foreground':'rounded-bl-sm border border-border/70 bg-card'}`}>
                  {interno && <div className="mb-1 flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-300"><LockKeyhole className="h-3 w-3"/>Nota interna · {m.remetente_nome||'Equipe'}</div>}
                  {legenda && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{legenda}</p>}
                  {m.aurox_media_chat_id && m.aurox_media_mime && <MidiaPrivadaAurox mensagemId={Number(m.aurox_media_chat_id)} mime={String(m.aurox_media_mime)}/>}
                  {m.arquivo_b64 && String(m.arquivo_mime||'').startsWith('image') && <img alt="Imagem enviada" className="mt-1 max-h-72 max-w-full rounded-lg object-contain" src={`data:${m.arquivo_mime};base64,${m.arquivo_b64}`}/>}
                  {m.arquivo_b64 && String(m.arquivo_mime||'').startsWith('audio') && <audio className="mt-2 block w-full min-w-[185px] max-w-[260px]" controls preload="metadata" src={`data:${m.arquivo_mime};base64,${m.arquivo_b64}`}/>}
                  {m.arquivo_b64 && !/^(image|audio)/.test(String(m.arquivo_mime||'')) && <a className="mt-2 block underline" href={`data:${m.arquivo_mime};base64,${m.arquivo_b64}`} download={m.arquivo_nome}>{m.arquivo_nome||'Arquivo'}</a>}
                  <div className="mt-1 flex items-center justify-end gap-2 text-[10px] opacity-60">
                    <time>{m.created_at?new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):''}</time>
                    {meu && <button type="button" aria-label="Opções da mensagem" className="rounded-full px-1 hover:bg-black/10" onClick={()=>setMenuMensagem(menuMensagem===m.id?null:m.id)}><MoreVertical className="h-3.5 w-3.5"/></button>}
                  </div>
                  {meu && menuMensagem===m.id && <div className="absolute bottom-full right-0 z-10 mb-1 flex gap-1 rounded-lg border bg-card p-1 text-xs text-foreground shadow-lg">
                    <button className="rounded px-2 py-1 hover:bg-muted" onClick={()=>{setEditando({id:m.id,texto:m.mensagem||''});setMenuMensagem(null);}}>Editar no MANU</button>
                    <button className="rounded px-2 py-1 hover:bg-muted" onClick={()=>{setMenuMensagem(null);apagar(m.id);}}>Apagar do MANU</button>
                  </div>}
                  {editando?.id===m.id && <div className="mt-2 flex gap-1"><input className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs text-foreground" value={editando.texto} onChange={e=>setEditando({...editando,texto:e.target.value})}/><button onClick={salvarEdicao} className="rounded border px-2 text-xs">Salvar</button></div>}
                </div>
              </div>;
            })}
          </div>
          {camOpen && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4"><div className="space-y-3"><video ref={videoRef} autoPlay playsInline className="max-h-[70vh] max-w-full rounded-lg"/><div className="flex justify-center gap-3"><Button onClick={tirarFoto}>Tirar foto</Button><Button variant="outline" onClick={fecharCamera}>Cancelar</Button></div></div></div>}
          <div className="shrink-0 border-t border-border/50 bg-card p-2.5 sm:p-3">
            {audioPendente && <div className="mb-2 flex items-center gap-2 rounded-xl border border-border/50 p-2 text-xs">{previewAudio && <audio className="min-w-0 max-w-[230px] flex-1" controls src={previewAudio}/>}<button className="underline" onClick={()=>setAudioPendente(null)}>Descartar</button></div>}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,audio/ogg,audio/mpeg,audio/mp4,audio/aac,audio/webm" className="hidden" onChange={e=>onArquivo(e.target.files?.[0])}/>
              <button type="button" aria-label="Tirar foto" title="Tirar foto" onClick={abrirCamera} className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted sm:flex"><Camera className="h-5 w-5"/></button>
              <button type="button" aria-label="Anexar foto ou áudio" title="Anexar" onClick={()=>fileRef.current?.click()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><Paperclip className="h-5 w-5"/></button>
              <button type="button" aria-label={recording?'Parar gravação':'Gravar áudio'} onClick={gravarAudio} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${recording?'bg-destructive/15 text-destructive animate-pulse':'text-muted-foreground hover:bg-muted'}`}><Mic className="h-5 w-5"/></button>
              <Input aria-label="Escrever mensagem" className="min-w-0 flex-1 rounded-full border-border/80 bg-background text-sm" value={texto} onChange={e=>setTexto(e.target.value)} placeholder="Mensagem" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(texto.trim()||audioPendente)enviar();}}}/>
              <button type="button" aria-label="Enviar mensagem" disabled={enviando||(!texto.trim()&&!audioPendente)} onClick={()=>enviar()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"><Send className="h-5 w-5"/></button>
            </div>
            <div className="mt-1 text-center text-[10px] text-muted-foreground">Notas internas não são enviadas ao cliente. Fotos e áudios permitidos; vídeos não.</div>
          </div>
        </>}
      </section>
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
