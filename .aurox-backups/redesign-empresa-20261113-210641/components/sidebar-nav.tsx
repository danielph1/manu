'use client';
import Link from 'next/link';import {usePathname} from 'next/navigation';
import {useAuth} from '@/contexts/auth-context';import {useI18n} from '@/contexts/i18n-context';
import {useState} from 'react';
import {cn} from '@/lib/utils';
import {LayoutDashboard,Inbox,Clock3,MessageCircle,FileText,Target,CheckSquare,BarChart3,
  Users,UserRoundPlus,ArrowRightLeft,Wrench,Car,Receipt,Settings,PlugZap,Megaphone,
  LogOut,History,Building2,ChevronDown,PlusCircle,FolderHeart,ChartNoAxesCombined,Star,PanelsTopLeft} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
type LinkDef={href:string;label:string;icon:LucideIcon;roles?:string[]};
const ALL=['vendedor','gerente','admin','superadmin','marketing','documentista','documento','elfenai','mecanico','guariba'];
const MGR=['gerente','admin','superadmin'];
const ADMIN=['admin','marketing','superadmin'];
const METRIC=['admin','marketing','gerente','superadmin'];
const sections:{id:string;title:string;links:LinkDef[]}[]=[
 {id:'leads',title:'Leads e atendimento',links:[
  {href:'/triagem',label:'Triagem',icon:Inbox,roles:METRIC},
  {href:'/painel',label:'Painel de Leads',icon:LayoutDashboard,roles:ALL},
  {href:'/follow-up',label:'Follow Up',icon:FolderHeart,roles:['vendedor',...MGR]},
  {href:'/atendimento',label:'Gestão de Atendimento',icon:Clock3,roles:METRIC},
  {href:'/chat',label:'Conversas',icon:MessageCircle,roles:ALL},
  {href:'/novo-lead',label:'Cadastrar Lead',icon:PlusCircle,roles:ALL},
 ]},
 {id:'comercial',title:'Comercial e resultados',links:[
  {href:'/fichas',label:'Fichas',icon:FileText,roles:ALL},
  {href:'/tarefas',label:'Tarefas',icon:CheckSquare,roles:ALL},
  {href:'/metas',label:'Metas',icon:Target,roles:ALL},
  {href:'/metricas',label:'Métricas',icon:BarChart3,roles:METRIC},
  {href:'/desempenho',label:'Desempenho da Equipe',icon:ChartNoAxesCombined,roles:METRIC},
  {href:'/ranking',label:'Ranking',icon:Star,roles:ALL},
 ]},
 {id:'operacao',title:'Operação',links:[
  {href:'/estoque',label:'Estoque',icon:Car,roles:ALL},
  {href:'/anuncios',label:'Anúncios',icon:Megaphone,roles:METRIC},
  {href:'/anuncio-coletivo',label:'Anúncio coletivo',icon:Megaphone,roles:METRIC},
  {href:'/processos',label:'Transferências',icon:ArrowRightLeft,roles:ALL},
  {href:'/oficina',label:'Oficina',icon:Wrench,roles:ALL},
  {href:'/faturamento',label:'Faturamento',icon:Receipt,roles:ALL},
 ]},
 {id:'admin',title:'Administração',links:[
  {href:'/equipe',label:'Equipe',icon:Users,roles:MGR},
  {href:'/gestao-usuarios',label:'Usuários e cadastros',icon:UserRoundPlus,roles:ADMIN},
  {href:'/historico',label:'Histórico e Auditoria',icon:History,roles:METRIC},
  {href:'/integracoes',label:'Integrações',icon:PlugZap,roles:ADMIN},
  {href:'/aurox',label:'Gestão Aurox',icon:Building2,roles:['superadmin']},
  {href:'/configuracoes',label:'Configurações',icon:Settings,roles:ALL},
 ]},
];
export function SidebarNav({onNavigate}:{onNavigate?:()=>void}){
 const path=usePathname()||'';const {user,logout}=useAuth();const {t}=useI18n();
 const role=String(user?.tipo||'').toLowerCase();const [expanded,setExpanded]=useState<Record<string,boolean>>({leads:true});
 const match=(href:string)=>path===href||path.startsWith(href+'/');
 return <aside className="sticky top-0 flex h-screen w-72 flex-col overflow-y-auto border-r border-border/60 bg-background/95 px-3 pb-5 pt-16">
  <Link href="/minha-conta" onClick={onNavigate} className="mb-5 flex items-center gap-3 rounded-xl border bg-card/70 p-3 hover:bg-muted/40">
   <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-lg font-semibold text-primary-foreground">{(user as any)?.foto_url?<img alt="" src={(user as any).foto_url} className="h-full w-full object-cover"/>:String(user?.nome||user?.login||'?')[0]?.toUpperCase()}</span>
   <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{user?.nome||user?.login||'Minha conta'}</strong><span className="block truncate text-xs capitalize text-muted-foreground">{role}{user?.loja?` · Loja ${user.loja}`:''}</span></span>
  </Link>
  <div className="space-y-2" aria-label="Navegação principal">{sections.map(section=>{
   const links=section.links.filter(link=>!link.roles||link.roles.includes(role));if(!links.length)return null;
   const active=links.some(link=>match(link.href));const isOpen=expanded[section.id]??active;
   return <section key={section.id} className="rounded-xl border border-transparent bg-card/20">
    <button type="button" aria-expanded={isOpen} onClick={()=>setExpanded(s=>({...s,[section.id]:!isOpen}))}
      className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/40">
      <span>{section.title}</span><ChevronDown size={15} className={cn('transition-transform',isOpen&&'rotate-180')}/>
    </button>
    {isOpen&&<nav className="space-y-0.5 px-1 pb-2">{links.map(link=>{
     const Icon=link.icon,selected=match(link.href);
     return <Link key={link.href} href={link.href} onClick={onNavigate} aria-current={selected?'page':undefined}
       className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted/60',selected?'bg-primary/10 font-semibold text-primary':'text-foreground/85')}>
       <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8}/><span>{link.href==='/configuracoes'?t('nav.config'):link.label}</span>
      </Link>;
    })}</nav>}
   </section>;
  })}</div>
  <div className="mt-auto space-y-3 pt-5"><Link href="/configuracoes" onClick={onNavigate} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted/40"><PanelsTopLeft size={16}/>Personalização e conta</Link>
   <button onClick={()=>void logout()} className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"><LogOut size={16}/>Sair</button>
  </div>
 </aside>;
}
