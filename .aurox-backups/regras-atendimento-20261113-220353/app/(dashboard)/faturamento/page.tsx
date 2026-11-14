'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { compressGallery } from '@/lib/compress-image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Loader2, Download, Printer, Plus, Settings2, FileText, Building2 } from 'lucide-react';
import { toast } from 'sonner';

type Empresa = {id:number;nome:string;lojas:{codigo:string;nome:string}[]};
type Config = Record<string,string>;

// O backend pode devolver erros JSON como texto quando a resposta é HTML.
// Exibir a causa real em vez de uma mensagem genérica ao tentar imprimir.
async function mensagemErroDocumento(e: any, fallback: string): Promise<string> {
  let payload = e?.response?.data;
  if (payload instanceof Blob) {
    try { payload = await payload.text(); } catch { return fallback; }
  }
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { return fallback; }
  }
  return (typeof payload?.error === 'string' && payload.error) || fallback;
}

const perfilCampos = [
  ['nome_fantasia','Nome comercial no documento'],['razao_social','Razão social'],['cnpj','CNPJ'],
  ['endereco','Endereço'],['bairro','Bairro'],['cidade','Cidade'],['cep','CEP'],['telefone','Telefone'],
  ['logo_url','Logo (URL HTTPS, opcional)'],['local_assinatura','Local de assinatura'],
] as const;
const dados = [
  ['nome','Nome completo'],['cpf_cnpj','CPF / CNPJ'],['telefone','Telefone'],['email','E-mail'],
  ['endereco','Endereço'],['bairro','Bairro'],['cidade','Cidade'],['cep','CEP'],
  ['marca','Marca'],['modelo','Modelo'],['ano_modelo','Ano / modelo'],['placa','Placa'],
  ['cor','Cor'],['kilometragem','Quilometragem'],['vendedor_nome','Vendedor'],['gerente_nome','Gerente'],
] as const;
const entradas = [
  ['entrada_dinheiro','Dinheiro'],['entrada_debito','Cartão de débito'],['entrada_credito','Cartão de crédito'],
  ['entrada_transferencia','Transferência / PIX / depósito'],['entrada_boleto','Boleto'],['entrada_total','Total da entrada'],
] as const;
const troca = [
  ['troca_marca','Marca'],['troca_modelo','Modelo'],['troca_ano_modelo','Ano / modelo'],
  ['troca_placa','Placa'],['troca_cor','Cor'],['troca_km','KM'],
] as const;

function Campo({form,onChange,field,label,kind}:{form:any;onChange:(key:string,value:string)=>void;field:string;label:string;kind?:string}) {
  return <div className="space-y-1"><Label htmlFor={`fat-${field}`} className="text-xs">{label}</Label>
    <Input id={`fat-${field}`} type={kind||'text'} value={form?.[field]??''} onChange={e=>onChange(field,e.target.value)}/></div>;
}

export default function FaturamentoPage() {
  const qc=useQueryClient();
  const {user}=useAuth();
  const superadmin=user?.tipo==='superadmin';
  const podeConfig=!!user && ['admin','superadmin'].includes(user.tipo);
  const [empresaSuper,setEmpresaSuper]=useState(0);
  const empresaId=superadmin?empresaSuper:Number(user?.empresa_id||0);
  const [busca,setBusca]=useState('');
  const [q,setQ]=useState('');
  const [aberto,setAberto]=useState<any>(null);
  const [docHtml,setDocHtml]=useState('');
  const [erroDoc,setErroDoc]=useState('');
  const [carregandoDoc,setCarregandoDoc]=useState(false);
  const [form,setForm]=useState<any>(null);
  const [salvando,setSalvando]=useState(false);
  const [configAberta,setConfigAberta]=useState(false);
  const [configForm,setConfigForm]=useState<Config>({});

  const {data:empresas=[]}=useQuery<Empresa[]>({
    queryKey:['faturamento-empresas'],enabled:!!user,
    queryFn:async()=> (await api.get('/faturamento/empresas')).data,
  });
  useEffect(()=>{
    if(superadmin && empresas.length && !empresas.some(e=>e.id===empresaSuper))setEmpresaSuper(empresas[0].id);
  },[superadmin,empresaSuper,empresas]);
  const empresaAtual=useMemo(()=>empresas.find(e=>e.id===empresaId),[empresas,empresaId]);
  const lojas=empresaAtual?.lojas||[];
  const {data:rows=[],isLoading,error:erroLista}=useQuery<any[]>({
    queryKey:['faturamento',q,empresaId],enabled:empresaId>0,
    queryFn:async()=> (await api.get('/faturamento',{params:{busca:q||undefined,empresa_id:empresaId}})).data,
  });
  const {data:configEmissor}=useQuery<any>({
    queryKey:['faturamento-config',empresaId],enabled:empresaId>0,
    queryFn:async()=> (await api.get('/faturamento/config',{params:{empresa_id:empresaId}})).data,
  });
  useEffect(()=>{
    if(configEmissor){
      const keys=[...perfilCampos.map(([k])=>k),'texto_observacoes','texto_contrato'];
      const c:Config={};for(const k of keys)c[k]=String(configEmissor[k]??'');
      if(!c.nome_fantasia)c.nome_fantasia=configEmissor.empresa_nome||'';
      setConfigForm(c);
    }
  },[configEmissor]);

  function novo(){
    if(!empresaId){toast.error('Selecione uma empresa');return;}
    const primeiraLoja = (user?.tipo==='gerente'||user?.tipo==='vendedor') ? user?.loja : lojas[0]?.codigo;
    setForm({empresa_id:empresaId,loja:primeiraLoja||'',data_assinatura:new Date().toISOString().slice(0,10)});
  }
  async function abrir(id:number){
    setCarregandoDoc(true);setDocHtml('');setErroDoc('');
    try {
      const r=await api.get(`/faturamento/${id}`);
      setAberto(r.data);
      try {
        const d=await api.get(`/faturamento/${id}/html`,{responseType:'text'});
        setDocHtml(String(d.data||''));
      }catch(e:any){setErroDoc(await mensagemErroDocumento(e,'Não foi possível preparar o documento. Confira os dados da empresa.'));}
    }catch(e:any){toast.error(e?.response?.data?.error||'Faturamento indisponível nesta empresa');}
    finally{setCarregandoDoc(false);}
  }
  async function baixar(id:number,placa:string){
    try{
      const r=await api.get(`/faturamento/${id}/html`,{responseType:'blob'});
      const url=URL.createObjectURL(r.data),a=document.createElement('a');
      a.href=url;a.download=`faturamento-${placa||id}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
    }catch(e:any){toast.error(e?.response?.data?.error||'Falha ao baixar');}
  }
  async function imprimir(id:number){
    // Abrir a aba durante o clique evita bloqueio de pop-up após o await.
    const w=window.open('','_blank');
    if(!w){toast.error('Permita janelas pop-up para imprimir');return;}
    w.document.write('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Preparando documento</title><body style="font:16px Arial;padding:30px">Preparando documento para impressão…</body></html>');
    w.document.close();
    try{
      const r=await api.get(`/faturamento/${id}/html`,{responseType:'text'});
      w.document.open();w.document.write(String(r.data));w.document.close();w.focus();
      setTimeout(()=>{ if(!w.closed) w.print(); },650);
    }catch(e:any){
      w.close();
      toast.error(await mensagemErroDocumento(e,'Falha ao imprimir. Confira os dados do emissor.'));
    }
  }
  async function salvar(e:FormEvent){
    e.preventDefault();
    if(!form?.nome?.trim()||!form?.placa?.trim()){toast.error('Nome e placa são obrigatórios');return;}
    if(!form?.id&&!form?.loja){toast.error('Selecione a loja');return;}
    setSalvando(true);
    try{
      if(form.id)await api.patch('/faturamento',form);
      else await api.post('/faturamento',{...form,empresa_id:empresaId});
      toast.success('Faturamento salvo');setForm(null);
      qc.invalidateQueries({queryKey:['faturamento']});
    }catch(e:any){toast.error(e?.response?.data?.error||'Erro ao salvar');}
    finally{setSalvando(false);}
  }
  async function salvarEmissor(e:FormEvent){
    e.preventDefault();
    try{
      await api.patch('/faturamento/config',{...configForm,empresa_id:empresaId});
      toast.success('Dados de faturamento atualizados para esta empresa');
      qc.invalidateQueries({queryKey:['faturamento-config',empresaId]});setConfigAberta(false);
    }catch(e:any){toast.error(e?.response?.data?.error||'Erro ao salvar dados da empresa');}
  }
  function set(k:string,v:string){setForm((prev:any)=>({...prev,[k]:v}));}
  return <div className="mx-auto max-w-6xl space-y-6 pb-24">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-3xl font-semibold tracking-tight">Faturamento</h1><p className="mt-1 text-sm text-muted-foreground">Autorizações por empresa · visualização e impressão em A4.</p></div>
      <div className="flex flex-wrap gap-2">
        {podeConfig&&<Button variant="outline" onClick={()=>setConfigAberta(true)} disabled={!empresaId}><Settings2 size={16} className="mr-2"/> Dados do emissor</Button>}
        <Button onClick={novo} disabled={!empresaId}><Plus size={16} className="mr-2"/> Novo faturamento</Button>
      </div>
    </header>
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end">
      <div className="min-w-[190px] flex-1 space-y-1"><Label className="text-xs">Empresa responsável pelo documento</Label>
      {superadmin?<select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={empresaId||''} onChange={e=>setEmpresaSuper(Number(e.target.value))}>
        {empresas.map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}
      </select>:<div className="flex h-10 items-center gap-2 font-medium"><Building2 size={16}/>{empresaAtual?.nome||'Empresa não vinculada'}</div>}</div>
      <div className="flex-[2] space-y-1"><Label className="text-xs">Buscar faturamento</Label><div className="flex gap-2"><Input placeholder="Nome, placa, CPF, vendedor..." value={busca} onChange={e=>setBusca(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')setQ(busca.trim());}}/><Button variant="outline" onClick={()=>setQ(busca.trim())}><Search size={16}/><span className="sr-only">Buscar</span></Button></div></div>
    </div>
    {empresaId>0&&(!String(configEmissor?.razao_social||'').trim()||!String(configEmissor?.cnpj||'').trim()||!String(configEmissor?.texto_contrato||'').trim())&&<p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-500">O documento desta empresa ainda não está pronto para impressão: faltam razão social, CNPJ ou cláusulas. {podeConfig?'Abra “Dados do emissor” para preencher e salvar.':'Solicite ao administrador a configuração dos dados legais.'}</p>}
    {erroLista&&<p className="text-sm text-red-400">Não foi possível carregar os faturamentos. Confira a migration do banco.</p>}
    {isLoading&&<p className="text-sm text-muted-foreground">Carregando faturamentos…</p>}
    <div className="grid gap-3 md:grid-cols-2">
      {(Array.isArray(rows)?rows:[]).map((f:any)=><Card key={f.id} className="cursor-pointer transition hover:border-primary/50" onClick={()=>abrir(f.id)}><CardContent className="flex items-center justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0"><div className="truncate font-semibold">{f.nome}</div><p className="mt-1 text-sm text-muted-foreground">{f.marca} {f.modelo} · {f.placa}</p><p className="mt-2 text-xs text-muted-foreground">{f.vendedor_nome||'—'} · {f.created_at?new Date(f.created_at).toLocaleDateString('pt-BR'):'—'}</p></div>
        <div className="shrink-0 text-right"><FileText className="ml-auto mb-2 h-5 w-5 text-primary"/><p className="text-xs text-muted-foreground">Valor financiado</p><p className="text-sm font-medium">{f.valor_financiado != null && Number.isFinite(Number(f.valor_financiado)) ? `R$ ${Number(f.valor_financiado).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}` : 'Não informado'}</p><p className="mt-1 text-xs text-muted-foreground">{f.status||'emitido'}</p></div>
      </CardContent></Card>)}
    </div>
    {!isLoading&&!erroLista&&(!Array.isArray(rows)||!rows.length)&&<p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Nenhum faturamento encontrado para esta empresa.</p>}

    <Dialog open={!!aberto} onOpenChange={o=>{if(!o){setAberto(null);setDocHtml('');}}}>
      <DialogContent className="max-h-[96vh] w-[96vw] max-w-6xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader><DialogTitle>Autorização de faturamento · {aberto?.placa}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-2 border-b pb-3">
          {aberto&&<>
            <Button onClick={()=>imprimir(aberto.id)}><Printer size={16} className="mr-2"/> Imprimir</Button>
            <Button variant="outline" onClick={()=>baixar(aberto.id,aberto.placa)}><Download size={16} className="mr-2"/> Baixar HTML</Button>
            <Button variant="outline" onClick={()=>{setForm({...aberto});setAberto(null);}}>Editar</Button>
            {!aberto.liberado&&<Button variant="outline" onClick={async()=>{
              try {await api.post('/faturamento/liberar',{placa:aberto.placa,marca:aberto.marca,modelo:aberto.modelo,ano:aberto.ano_modelo,ficha_id:aberto.ficha_id,lead_id:aberto.lead_id,nome:aberto.nome,empresa_id:aberto.empresa_id});toast.success('Carro liberado');setAberto({...aberto,liberado:true});}
              catch(e:any){toast.error(e?.response?.data?.error||'Erro ao liberar');}
            }}>Liberar carro</Button>}
            {['superadmin','admin','gerente'].includes(user?.tipo||'')&&<Button variant="outline" className="text-red-400" onClick={async()=>{
              if(!confirm('Excluir este faturamento?'))return;
              try{await api.post('/faturamento/excluir',{id:aberto.id});setAberto(null);qc.invalidateQueries({queryKey:['faturamento']});toast.success('Excluído');}
              catch(e:any){toast.error(e?.response?.data?.error||'Erro ao excluir');}
            }}>Excluir</Button>}
          </>}
        </div>
        {carregandoDoc?<p className="py-10 text-center text-sm text-muted-foreground">Preparando documento…</p>:
          erroDoc?<div className="rounded-lg border border-amber-500/30 p-4 text-sm text-amber-500">{erroDoc}</div>:
          <div className="max-h-[72vh] overflow-auto rounded-lg border bg-[#ededed] p-1 sm:p-3"><iframe title="Documento A4 de faturamento" srcDoc={docHtml} className="h-[72vh] w-full min-w-[340px] rounded border-0 bg-white" sandbox="allow-same-origin"/></div>}
        {aberto&&<div className="space-y-1 border-t pt-3"><Label className="text-xs">Anexar comprovante ao registro</Label><input className="block w-full text-xs" type="file" accept="image/*,.pdf" onChange={async e=>{
          let f=e.target.files?.[0];if(!f)return;
          try{if(f.type.startsWith('image/'))f=await compressGallery(f);}catch{}
          const reader=new FileReader();reader.onload=async()=>{const data=String(reader.result||''),b64=data.includes(',')?data.split(',')[1]:data;
            try{await api.post(`/faturamento/${aberto.id}/anexos`,{nome:f!.name,mime:f!.type,arquivo_b64:b64});toast.success('Comprovante salvo');}
            catch(err:any){toast.error(err?.response?.data?.error||'Erro no anexo');}};reader.readAsDataURL(f);
        }}/></div>}
      </DialogContent>
    </Dialog>

    <Dialog open={!!form} onOpenChange={o=>!o&&setForm(null)}>
      <DialogContent className="max-h-[94vh] w-[95vw] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{form?.id?'Editar':'Novo'} faturamento · {empresaAtual?.nome||''}</DialogTitle></DialogHeader>
      {form&&<form onSubmit={salvar} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Loja</Label>
          {['gerente','vendedor'].includes(user?.tipo||'')?<div className="rounded-md border px-3 py-2 text-sm">{form.loja||'—'}</div>:
          <select value={form.loja||''} onChange={e=>set('loja',e.target.value)} disabled={!!form.id} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Selecione…</option>{lojas.map(l=><option key={l.codigo} value={l.codigo}>{l.codigo} — {l.nome}</option>)}</select>}
        </div><div className="space-y-1"><Label>Data do documento</Label><Input type="date" value={form.data_assinatura||''} onChange={e=>set('data_assinatura',e.target.value)}/></div></div>
        <div><h3 className="mb-3 border-b pb-2 text-sm font-semibold">Comprador e veículo</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{dados.map(([key,label])=><Campo key={key} form={form} onChange={set} field={key} label={label}/>)}</div></div>
        <div><h3 className="mb-3 border-b pb-2 text-sm font-semibold">Negociação — entrada</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{entradas.map(([key,label])=><Campo key={key} form={form} onChange={set} field={key} label={`R$ ${label}`} kind="number"/>)}</div></div>
        <div><h3 className="mb-3 border-b pb-2 text-sm font-semibold">Financiamento</h3><div className="grid gap-3 sm:grid-cols-3"><Campo form={form} onChange={set} field="fin_banco" label="Banco"/><Campo form={form} onChange={set} field="fin_parcelas" label="Quantidade de parcelas"/><Campo form={form} onChange={set} field="fin_valor_parcela" label="Valor da parcela (R$)" kind="number"/></div></div>
        <div><h3 className="mb-3 border-b pb-2 text-sm font-semibold">Veículo na troca</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{troca.map(([key,label])=><Campo key={key} form={form} onChange={set} field={key} label={label}/>)}</div></div>
        <div className="grid gap-3 sm:grid-cols-2"><Campo form={form} onChange={set} field="desconto_valor" label="Desconto concedido (R$)" kind="number"/><div className="space-y-1"><Label>Observações adicionais</Label><Textarea value={form.observacoes||''} onChange={e=>set('observacoes',e.target.value)}/></div></div>
        <Button type="submit" disabled={salvando}>{salvando&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Salvar faturamento</Button>
      </form>}
      </DialogContent>
    </Dialog>

    <Dialog open={configAberta} onOpenChange={setConfigAberta}>
      <DialogContent className="max-h-[94vh] w-[95vw] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Dados legais · {empresaAtual?.nome}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Estas informações e cláusulas serão usadas somente nos faturamentos desta empresa. Revise o conteúdo jurídico antes do uso comercial.</p>
        <form onSubmit={salvarEmissor} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2">{perfilCampos.map(([key,label])=><div key={key} className="space-y-1"><Label>{label}</Label><Input value={configForm[key]||''} onChange={e=>setConfigForm(prev=>({...prev,[key]:e.target.value}))}/></div>)}</div>
          <div className="space-y-1"><Label>Linhas fixas de observação no documento</Label><Textarea rows={5} value={configForm.texto_observacoes||''} onChange={e=>setConfigForm(prev=>({...prev,texto_observacoes:e.target.value}))}/></div>
          <div className="space-y-1"><Label>Cláusulas e condições da empresa</Label><Textarea rows={12} value={configForm.texto_contrato||''} onChange={e=>setConfigForm(prev=>({...prev,texto_contrato:e.target.value}))}/></div>
          <Button type="submit">Salvar dados do emissor</Button>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
