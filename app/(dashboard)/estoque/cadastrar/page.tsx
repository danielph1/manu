'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { compressGallery } from '@/lib/compress-image';
import { toast } from 'sonner';
import { ArrowLeft, Camera, CarFront, ChevronDown, ChevronUp, CheckCircle2, CircleHelp, Save, Trash2, Images } from 'lucide-react';

type Empresa = { id: number; nome: string };
type Loja = { codigo: string; nome: string };
const INICIAL: Record<string,string> = {
  placa:'', tipo_veiculo:'carro', condicao:'usado', marca:'', modelo:'', ano:'', ano_modelo:'',
  versao:'', preco:'', cor:'', combustivel:'', cambio:'', portas:'', km:'', carroceria:'',
  chassi:'', renavam:'', numero_motor:'', consignado:'', patio:'', observacoes:'',
};
const CARACTERISTICAS = [
  '7 lugares','Adaptado para pessoa com deficiência','Blindado','Chave reserva',
  'Garantia de fábrica','IPVA pago','Licenciado','Manual do proprietário',
  'Passagem por leilão','Revisado em concessionária','Único dono','Ar-condicionado',
  'Direção elétrica','Multimídia','Câmera de ré','Sensor de estacionamento','Airbags',
  'Freios ABS','Bancos em couro','Controle de estabilidade',
];
const selectCls='mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm';
const inputCls='mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary';
function Grupo({titulo,sub,children}:{titulo:string;sub?:string;children:React.ReactNode}){
  return <section className="rounded-2xl border bg-card p-4 sm:p-6">
    <h2 className="text-base font-semibold">{titulo}</h2>{sub&&<p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    <div className="mt-5">{children}</div>
  </section>;
}
function Campo({label,obrigatorio=false,children}:{label:string;obrigatorio?:boolean;children:React.ReactNode}){
  return <label className="block text-sm"><span className="text-muted-foreground">{label} {obrigatorio&&<span className="text-rose-500">*</span>}</span>{children}</label>;
}
export default function CadastroVeiculoPage(){
  const router=useRouter();const {user,isLoading}=useAuth();
  const papel=String(user?.tipo||'').toLowerCase();const superadmin=papel==='superadmin';
  const autorizado=['superadmin','admin','gerente','marketing'].includes(papel);
  const [dados,setDados]=useState<Record<string,string>>(INICIAL);
  const [empresa,setEmpresa]=useState('');const [fotos,setFotos]=useState<File[]>([]);
  const [caracteristicas,setCaracteristicas]=useState<string[]>([]);
  const [salvando,setSalvando]=useState(false);const [aberto,setAberto]=useState({fotos:true,dados:true,caracteristicas:true});
  const empresas=useQuery({queryKey:['cadastro-estoque-empresas'],enabled:superadmin,
    queryFn:async()=>((await api.get('/integracoes/empresas')).data||[]) as Empresa[]});
  const lojas=useQuery({queryKey:['cadastro-estoque-lojas',empresa,user?.empresa_id],enabled:autorizado && (!!empresa||!superadmin),
    queryFn:async()=>((await api.get('/lojas-opcoes',{params:superadmin?{empresa_id:empresa}:{}})).data||[]) as Loja[]});
  useEffect(()=>{if(user?.loja&&!superadmin)setDados(d=>({...d,patio:d.patio||String(user.loja)}));},[user?.loja,superadmin]);
  useEffect(()=>{if(superadmin){setDados(d=>({...d,patio:''}));}},[empresa,superadmin]);
  const visualizacoes=useMemo(()=>fotos.map(f=>URL.createObjectURL(f)),[fotos]);
  useEffect(()=>()=>{visualizacoes.forEach(url=>URL.revokeObjectURL(url));},[visualizacoes]);
  function atualizar(campo:string,valor:string){setDados(v=>({...v,[campo]:valor}));}
  function juntarFotos(list:FileList|null){if(!list)return;
    const escolhidas=Array.from(list).filter(f=>['image/jpeg','image/png','image/webp'].includes(f.type));
    if(escolhidas.length!==list.length)toast.error('Apenas fotos JPG, PNG e WebP são aceitas.');
    if(fotos.length+escolhidas.length>20){toast.error('Máximo de 20 fotos.');return;}
    setFotos(p=>[...p,...escolhidas]);
  }
  function moverFoto(i:number,dir:-1|1){const j=i+dir;if(j<0||j>=fotos.length)return;
    setFotos(p=>{const n=[...p];[n[i],n[j]]=[n[j],n[i]];return n;});}
  function alternarCaracteristica(c:string){setCaracteristicas(p=>p.includes(c)?p.filter(x=>x!==c):[...p,c]);}
  async function cadastrar(e:FormEvent){e.preventDefault();if(salvando)return;
    if(superadmin&&!empresa){toast.error('Escolha uma empresa.');return;}
    if(!dados.patio){toast.error('Escolha a loja responsável.');return;}
    const preco=Number(dados.preco.replace(',','.'));
    if(!dados.marca.trim()||!dados.modelo.trim()||!Number.isInteger(Number(dados.ano))||!Number.isFinite(preco)||preco<=0){
      toast.error('Preencha marca, modelo, ano e preço de venda válido.');return;
    }
    setSalvando(true);
    try{
      const {data}=await api.post('/estoque',{
        ...dados,preco,empresa_id:superadmin?Number(empresa):undefined,
        caracteristicas, // Guardadas nos detalhes opcionais, sem exigir preenchimento.
      });
      const id=Number(data?.id);if(!id){toast.error('Cadastro salvo, mas não foi possível identificar o veículo para anexar fotos.');router.push('/estoque');return;}
      let carregadas=0;const falhas:string[]=[];
      for(const f of fotos){try{
        const compactada=await compressGallery(f);const fd=new FormData();fd.append('carro_id',String(id));fd.append('foto',compactada);
        await api.post('/estoque/fotos',fd);carregadas++;
      }catch{falhas.push(f.name);}}
      if(falhas.length)toast.error(`Veículo salvo. ${falhas.length} foto(s) falharam. Abra-o no estoque para reenviar.`);
      else toast.success(`Veículo cadastrado${carregadas?` com ${carregadas} foto(s)`:''}.`);
      router.push('/estoque');
    }catch(err:any){toast.error(err?.response?.data?.error||'Não foi possível cadastrar o veículo.');}
    finally{setSalvando(false);}
  }
  if(isLoading)return <p className="p-8">Carregando...</p>;
  if(!autorizado)return <p className="rounded-xl border p-6">Sem permissão para cadastrar veículos.</p>;
  const field=(key:string,label:string,opts?:{required?:boolean;type?:string;placeholder?:string})=><Campo label={label} obrigatorio={opts?.required}>
    <input className={inputCls} type={opts?.type||'text'} step={opts?.type==='number'?(key==='preco'?'0.01':'1'):undefined} placeholder={opts?.placeholder||''} required={opts?.required}
      value={dados[key]||''} onChange={e=>atualizar(key,e.target.value)} maxLength={key==='observacoes'?2000:160}/>
  </Campo>;
  const choice=(key:string,label:string,opcoes:string[])=><Campo label={label}>
    <select className={selectCls} value={dados[key]||''} onChange={e=>atualizar(key,e.target.value)}>
      <option value="">Não informado</option>{opcoes.map(o=><option value={o} key={o}>{o}</option>)}
    </select>
  </Campo>;
  return <div className="mx-auto max-w-6xl space-y-5 pb-28">
    <header className="flex flex-wrap items-center justify-between gap-3"><div>
      <Link href="/estoque" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft size={15}/>Voltar ao estoque</Link>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold"><CarFront className="text-primary"/>Cadastrar veículo</h1>
      <p className="text-sm text-muted-foreground">Como no cadastro de estoque: fotos, dados e características. Só o essencial é obrigatório.</p>
    </div><span className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">* campo obrigatório</span></header>
    <form onSubmit={cadastrar} className="space-y-5">
      {superadmin&&<Grupo titulo="Empresa proprietária"><Campo label="Empresa" obrigatorio>
        <select required className={selectCls} value={empresa} onChange={e=>setEmpresa(e.target.value)}><option value="">Selecione a empresa</option>
          {(empresas.data||[]).map(x=><option value={x.id} key={x.id}>{x.nome}</option>)}
        </select></Campo></Grupo>}
      <Grupo titulo="Fotos do veículo" sub="Fotos não são obrigatórias para salvar o cadastro. Cada portal pode exigir quantidade e formatos específicos para publicar.">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <Camera size={18}/>Adicionar fotos<input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e=>{juntarFotos(e.target.files);e.target.value='';}}/>
        </label>
        {fotos.length>0?<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {fotos.map((f,i)=><div className="overflow-hidden rounded-xl border" key={`${f.name}-${i}`}>
            <div className="relative aspect-[4/3]"><img src={visualizacoes[i]} alt={`Foto ${i+1}`} className="h-full w-full object-cover"/>
              {i===0&&<span className="absolute left-1 top-1 rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">Capa</span>}</div>
            <div className="flex items-center justify-between p-1.5"><button type="button" aria-label="Mover foto para esquerda" disabled={i===0} onClick={()=>moverFoto(i,-1)} className="rounded px-2 disabled:opacity-30">←</button>
              <span className="text-xs tabular-nums">{i+1}</span><button type="button" aria-label="Mover foto para direita" disabled={i===fotos.length-1} onClick={()=>moverFoto(i,1)} className="rounded px-2 disabled:opacity-30">→</button>
              <button type="button" aria-label="Remover foto" onClick={()=>setFotos(p=>p.filter((_,j)=>j!==i))}><Trash2 size={14}/></button></div>
          </div>)}</div>:<div className="mt-4 flex h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"><Images className="mr-2"/>Fotos opcionais · até 20 arquivos</div>}
      </Grupo>
      <Grupo titulo="Dados do veículo" sub="Cadastro com campos equivalentes aos da referência, sem exigir placa, KM, documentos ou acessórios.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Loja / pátio" obrigatorio><select className={selectCls} value={dados.patio} required onChange={e=>atualizar('patio',e.target.value)}>
            <option value="">Selecione a loja</option>{(lojas.data||[]).map(l=><option key={l.codigo} value={l.codigo}>{l.nome} ({l.codigo})</option>)}
          </select></Campo>
          {field('marca','Marca',{required:true,placeholder:'Ex.: Volkswagen'})}
          {field('modelo','Modelo',{required:true,placeholder:'Ex.: Polo'})}
          {field('ano','Ano de fabricação',{type:'number',required:true,placeholder:'2022'})}
          {field('preco','Valor de venda (R$)',{required:true,type:'number',placeholder:'65000'})}
          {field('placa','Placa (opcional)',{placeholder:'ABC1D23'})}
          {choice('tipo_veiculo','Tipo de veículo',['carro','moto','caminhao','utilitario'])}
          {choice('condicao','Condição',['novo','usado','seminovo'])}
          {field('ano_modelo','Ano do modelo',{type:'number'})}
          {field('versao','Versão')}
          {choice('combustivel','Combustível',['Flex','Gasolina','Etanol','Diesel','Elétrico','Híbrido','GNV'])}
          {choice('cambio','Câmbio',['Manual','Automático','CVT','Automatizado'])}
          {field('cor','Cor')}
          {field('km','Quilometragem',{type:'number',placeholder:'Não informado'})}
          {choice('portas','Portas',['2','3','4','5'])}
          {choice('carroceria','Carroceria',['Hatch','Sedan','SUV','Picape','Perua','Cupê','Conversível','Van','Outro'])}
          {choice('consignado','Consignado',['Sim','Não'])}
          {field('chassi','Chassi')}
          {field('renavam','Renavam')}
          {field('numero_motor','Número do motor')}
        </div>
        <label className="mt-4 block text-sm text-muted-foreground">Observações opcionais<textarea className={`${inputCls} min-h-24 py-3`} rows={3} maxLength={2000} value={dados.observacoes} onChange={e=>atualizar('observacoes',e.target.value)} placeholder="Detalhes adicionais e observações comerciais"/></label>
      </Grupo>
      <Grupo titulo="Características e opcionais" sub="Selecione somente o que o veículo realmente possui.">
        <label className="mb-3 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={caracteristicas.length===CARACTERISTICAS.length} onChange={e=>setCaracteristicas(e.target.checked?[...CARACTERISTICAS]:[])}/>Selecionar todos</label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{CARACTERISTICAS.map(c=><label key={c} className="flex items-start gap-2 rounded-lg border p-2 text-xs sm:text-sm"><input type="checkbox" className="mt-0.5" checked={caracteristicas.includes(c)} onChange={()=>alternarCaracteristica(c)}/>{c}</label>)}</div>
      </Grupo>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <p className="max-w-lg text-xs text-muted-foreground"><CircleHelp className="mr-1 inline" size={14}/>Salvar no estoque não publica automaticamente em OLX, Meta ou outros portais. A Central de Integrações validará requisitos particulares de cada canal.</p>
        <button disabled={salvando} type="submit" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"><Save size={17}/>{salvando?'Salvando e enviando fotos…':'Salvar veículo no estoque'}</button>
      </div>
    </form>
  </div>;
}
