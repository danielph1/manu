'use client';
import {useEffect,useState} from 'react';import {createPortal} from 'react-dom';import Link from 'next/link';
import {usePathname} from 'next/navigation';import {useAuth} from '@/contexts/auth-context';
import {LayoutDashboard,FileText,CheckSquare,MessageCircle,FolderHeart,Settings} from 'lucide-react';
export function BottomNav(){
 const [mounted,setMounted]=useState(false),[hidden,setHidden]=useState(false);const {user}=useAuth();const path=usePathname()||'';
 useEffect(()=>setMounted(true),[]);
 useEffect(()=>{let prev=window.scrollY;const handler=()=>{let next=window.scrollY;setHidden(next>prev+5&&next>60);prev=next};window.addEventListener('scroll',handler,{passive:true});return()=>window.removeEventListener('scroll',handler);},[]);
 if(!mounted)return null;
 const role=String(user?.tipo||'').toLowerCase();const items=[
  {href:'/painel',label:'Leads',Icon:LayoutDashboard,roles:[]},
  {href:'/follow-up',label:'Follow Up',Icon:FolderHeart,roles:['vendedor','gerente','admin','superadmin']},
  {href:'/fichas',label:'Fichas',Icon:FileText,roles:[]},
  {href:'/tarefas',label:'Tarefas',Icon:CheckSquare,roles:[]},
  {href:'/chat',label:'Chat',Icon:MessageCircle,roles:[]},
  {href:'/configuracoes',label:'Menu',Icon:Settings,roles:[]},
 ].filter(x=>!x.roles.length||x.roles.includes(role));
 return createPortal(<nav aria-label="Atalhos com nomes" className="fixed bottom-3 left-1/2 z-[90] flex max-w-[96vw] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl transition-transform duration-200"
  style={{transform:`translateX(-50%) translateY(${hidden?'120px':'0'})`}}>
  {items.map(({href,label,Icon})=>{const active=path===href||path.startsWith(href+'/');return <Link key={href} href={href} aria-current={active?'page':undefined}
   className={`flex min-w-[62px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium ${active?'bg-primary/15 text-primary':'text-foreground/75 hover:bg-muted'}`}>
   <Icon size={19} strokeWidth={active?2.3:1.8}/><span>{label}</span></Link>})}
 </nav>,document.body);
}
