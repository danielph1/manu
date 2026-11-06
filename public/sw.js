// AUROX v18: somente push; nunca colocar páginas autenticadas ou /api/ em cache.
const CACHE_ANTIGO=/^(manu-|aurox-)/;
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  for(const k of await caches.keys())if(CACHE_ANTIGO.test(k))await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('push',event=>{
  let payload={title:'Aurox',body:'Você tem uma nova notificação.',url:'/painel',tag:undefined};
  try {if(event.data)payload={...payload,...event.data.json()};}catch{}
  const raw=String(payload.url||'/painel');
  const url=raw.startsWith('/')&&!raw.startsWith('//')?raw:'/painel';
  event.waitUntil(self.registration.showNotification(String(payload.title||'Aurox'),{
    body:String(payload.body||'Você tem uma nova notificação.'),
    icon:'/icon-192.png',badge:'/icon-192.png',
    tag:payload.tag||undefined,data:{url},
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const path=String(event.notification.data?.url||'/painel');
  const target=new URL(path.startsWith('/')&&!path.startsWith('//')?path:'/painel',self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const w of windows){if(new URL(w.url).origin===self.location.origin){await w.navigate(target);return w.focus();}}
    return self.clients.openWindow(target);
  })());
});
