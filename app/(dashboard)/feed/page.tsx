'use client';
import { useEffect,useRef,useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import { api } from '@/lib/api';
import { compressImage } from '@/lib/compress-image';
import { Button } from '@/components/ui/button';
import { Heart,MessageCircle,Eye,Plus,Trash2,X,ImagePlus,Send,PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';

type Post={id:number;autor_id:number;texto?:string;midia_url?:string;midia_tipo?:string;autor_foto?:string;autor_nome?:string;autor_login?:string;created_at:string;likes:number;views:number;comentarios:number;eu_curti:boolean};

function PostCard({post,usuarioId,refresh}:{post:Post;usuarioId:number;refresh:()=>void}){
 const ref=useRef<HTMLElement|null>(null);const videoRef=useRef<HTMLVideoElement|null>(null);
 const [comentarios,setComentarios]=useState<any[]|null>(null);const [mensagem,setMensagem]=useState('');
 useEffect(()=>{
  if(!ref.current)return;
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries){if(entry.isIntersecting && entry.intersectionRatio>.55){
      api.post(`/feed/${post.id}/view`).catch(()=>{});
      if(videoRef.current)videoRef.current.play().catch(()=>{});
     }else videoRef.current?.pause();}
  },{threshold:[0,.55,.9]});observer.observe(ref.current);return ()=>observer.disconnect();
 },[post.id]);
 async function curtir(){try{await api.post(`/feed/${post.id}/like`);refresh();}catch{toast.error('Erro ao curtir');}}
 async function comentariosAbrir(){if(comentarios!==null){setComentarios(null);return;}const r=await api.get(`/feed/${post.id}/comentarios`);setComentarios(Array.isArray(r.data)?r.data:[]);}
 async function comentar(){if(!mensagem.trim())return;try{await api.post(`/feed/${post.id}/comentarios`,{texto:mensagem.trim()});setMensagem('');const r=await api.get(`/feed/${post.id}/comentarios`);setComentarios(r.data||[]);refresh();}catch{toast.error('Não foi possível comentar');}}
 async function excluir(){if(!confirm('Excluir sua publicação e mídia permanentemente?'))return;try{await api.delete(`/feed/${post.id}`);toast.success('Publicação removida');refresh();}catch(e:any){toast.error(e?.response?.data?.error||'Falha ao excluir');}}
 return <article ref={ref} className="mx-auto w-full max-w-xl snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
  <header className="flex items-center gap-3 px-4 py-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15">{post.autor_foto?<img src={post.autor_foto} alt="" className="h-full w-full object-cover"/>:(post.autor_nome||post.autor_login||'?').slice(0,1)}</div>
   <div className="flex-1"><div className="text-sm font-semibold">{post.autor_nome||post.autor_login||'Usuário'}</div><div className="text-xs text-muted-foreground">{new Date(post.created_at).toLocaleString('pt-BR')}</div></div>
   {Number(post.autor_id)===Number(usuarioId) && <button type="button" title="Excluir meu post" onClick={excluir} className="rounded p-2 text-rose-400 hover:bg-rose-500/10"><Trash2 className="h-4 w-4"/></button>}
  </header>
  {post.midia_url && post.midia_tipo?.startsWith('image') && <img src={post.midia_url} alt="Publicação do feed" loading="lazy" className="max-h-[75vh] w-full bg-black/40 object-contain"/>}
  {post.midia_url && post.midia_tipo?.startsWith('video') && <video ref={videoRef} src={post.midia_url} controls muted playsInline loop preload="metadata" className="max-h-[75vh] w-full bg-black/50 object-contain"/>}
  {post.texto&&<p className="whitespace-pre-wrap break-words px-4 py-3 text-sm">{post.texto}</p>}
  <div className="flex gap-5 px-4 py-3 text-xs text-muted-foreground"><button type="button" onClick={curtir} className={`flex items-center gap-1 ${post.eu_curti?'text-rose-400':''}`}><Heart className={`h-5 w-5 ${post.eu_curti?'fill-current':''}`}/>{post.likes||0}</button>
   <button type="button" onClick={comentariosAbrir} className="flex items-center gap-1"><MessageCircle className="h-5 w-5"/>{post.comentarios||0}</button>
   <span className="flex items-center gap-1" title="Pessoas únicas que visualizaram"><Eye className="h-5 w-5"/>{post.views||0} pessoas</span></div>
  {comentarios!==null&&<div className="space-y-3 border-t border-border px-4 py-3">{comentarios.map(c=><p key={c.id} className="text-sm"><strong>{c.autor_nome||'Usuário'}: </strong>{c.texto}</p>)}<div className="flex gap-2"><input value={mensagem} onChange={e=>setMensagem(e.target.value)} placeholder="Escreva um comentário" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"/><Button size="sm" onClick={comentar}><Send className="h-4 w-4"/></Button></div></div>}
 </article>;
}

export default function FeedPage(){
 const {user}=useAuth();const qc=useQueryClient();const [open,setOpen]=useState(false);const [arquivo,setArquivo]=useState<File|null>(null);
 const [preview,setPreview]=useState('');const [texto,setTexto]=useState('');const [busy,setBusy]=useState(false);
 const {data=[],isLoading,error}=useQuery({queryKey:['feed'],queryFn:async()=>(await api.get('/feed')).data,refetchInterval:30000});
 const posts=Array.isArray(data)?data as Post[]:[];
 const refresh=()=>{qc.invalidateQueries({queryKey:['feed']});};
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 async function escolher(file?:File){if(!file)return;
  if(!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.type)){toast.error('Selecione uma foto ou vídeo MP4/WebM');return;}
  try{
   let next=file;
   if(file.type.startsWith('image'))next=await compressImage(file,{maxWidthOrHeight:1920,maxSizeMB:.65,quality:.82});
   if(next.size>(next.type.startsWith('video')?25:1)*1024*1024){toast.error('Vídeo acima de 25MB: comprima antes de publicar');return;}
   setArquivo(next);setPreview(URL.createObjectURL(next));
  }catch{toast.error('Não foi possível processar a imagem');}
 }
 async function publicar(){if(!arquivo)return toast.error('Selecione foto ou vídeo');setBusy(true);
  try{const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
   if(!url||!key)throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY');
   const {data:ticket}=await api.post('/feed/upload-ticket',{tipo:arquivo.type,size:arquivo.size});
   const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
   const {error}=await supabase.storage.from('manu_arquivos').uploadToSignedUrl(ticket.path,ticket.token,arquivo,{contentType:arquivo.type});
   if(error)throw new Error(error.message);
   await api.post('/feed',{path:ticket.path,texto:texto.trim()});
   setOpen(false);setArquivo(null);setPreview('');setTexto('');toast.success('Publicado!');refresh();
  }catch(e:any){toast.error(e?.response?.data?.error||e?.message||'Não foi possível publicar');}finally{setBusy(false);}}
 return <div className="mx-auto max-w-xl space-y-5 pb-32">
  <header className="flex items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">Feed</h1><p className="text-xs text-muted-foreground">Fotos e vídeos da comunidade Aurox</p></div>
   <Button onClick={()=>setOpen(true)}><Plus className="mr-1 h-4 w-4"/>Publicar</Button></header>
  {error&&<p className="text-sm text-rose-400">Falha ao carregar o feed. Confira a migration 202611020001 e o Storage.</p>}
  {isLoading&&<p className="text-muted-foreground">Carregando publicações...</p>}
  {!isLoading&&!posts.length&&<p className="text-sm text-muted-foreground">Nenhuma publicação ainda. Use Publicar para enviar sua primeira foto ou vídeo.</p>}
  <div className="space-y-5 scroll-smooth snap-y snap-mandatory">{posts.map(post=><PostCard key={post.id} post={post} usuarioId={Number(user?.id||0)} refresh={refresh}/>)}</div>
  {open&&<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-label="Nova publicação">
   <div className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-5">
    <div className="flex justify-between"><h2 className="text-xl font-semibold">Nova publicação</h2><button onClick={()=>setOpen(false)} title="Fechar"><X/></button></div>
    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 p-6 text-sm"><ImagePlus className="h-5 w-5"/>{arquivo?'Trocar mídia':'Selecionar foto ou vídeo'}<input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e=>escolher(e.target.files?.[0])}/></label>
    {arquivo && (arquivo.type.startsWith('image')?<img src={preview} alt="Prévia" className="max-h-64 w-full object-contain"/>:<video src={preview} controls className="max-h-64 w-full"/>)}
    <textarea value={texto} onChange={e=>setTexto(e.target.value)} maxLength={1000} className="min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder="Descrição (opcional)..."/>
    <p className="text-xs text-muted-foreground">Fotos compactadas automaticamente (WebP/JPG). Vídeos até 25MB, MP4/WebM: use um arquivo já otimizado. Publicações visíveis para os usuários autenticados do MANU.</p>
    <Button className="w-full" disabled={!arquivo||busy} onClick={publicar}>{busy?'Enviando...':'Publicar mídia'}</Button>
   </div></div>}
 </div>;
}
