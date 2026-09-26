export interface NotifyGame { pack: string; name: string; path: string; storagePrefix: string }
export interface NotifyConfig {
  enabled: boolean;
  serviceUrl: string;
  vapidPublicKey: string;
  pack: string;
  games: NotifyGame[];
  platforms: Array<'webpush' | 'apns'>;
  appVersion: string;
}
const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
export const NOTIFY_HTML = '<section id="sw-notify" class="sw-notify" aria-label="Daily reminders" hidden></section>';
export const NOTIFY_CSS = '\n.sw-notify{margin:20px 0;padding:18px;border:1px solid var(--line,var(--text3));border-radius:14px}.sw-notify h2{font-size:18px}.sw-notify p{font-size:14px;line-height:1.5}.sw-notify button{min-height:44px;margin:8px 12px 0 0;padding:10px 16px;border-radius:24px;border:1px solid var(--text3);background:var(--bg);color:var(--text);cursor:pointer}.sw-notify label{display:block;margin:12px 0}.sw-notify select{font:inherit;padding:8px}.sw-notify input{margin-right:8px}.sw-notify [role=status]{font-size:13px}';
export function notifyScript(config?: NotifyConfig): string {
  if (!config?.enabled) return '';
  const url = new URL(config.serviceUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('notify serviceUrl must be an HTTPS origin');
  if (!config.games.length || !config.games.some(g=>g.pack===config.pack) || new Set(config.games.map(g=>g.pack)).size!==config.games.length) throw Error('notify games invalid');
  for (const g of config.games) if (!/^[a-z0-9-]+$/.test(g.pack) || !/^\/[a-z0-9-]+$/.test(g.path) || !g.name || !g.storagePrefix) throw Error('notify game invalid');
  if (!config.platforms.length || config.platforms.some(p=>p!=='webpush'&&p!=='apns')) throw Error('notify platform invalid');
  if(config.platforms.includes('webpush') && !/^[A-Za-z0-9_-]{87}=?$/.test(config.vapidPublicKey))throw Error('notify VAPID public key invalid');
  return CLIENT.replace('__CONFIG__', () => json(config));
}
const CLIENT = String.raw`
// ---- Optional reminders. No subscription, worker or permission on arrival. ----
(function(config){
const key='scorewit.reminders.v1', declineKey='scorewit.remindersDeclinedUntil';
let visible=false,busy=false,memoryDecline=0,capabilities=null,loading=null;
const bridge=window.ScorewitNativeNotifications;
const native=!!(bridge&&typeof bridge.requestPermissionAndToken==='function'&&config.platforms.includes('apns'));
const web=!!(!native&&config.platforms.includes('webpush')&&window.isSecureContext&&navigator.serviceWorker&&window.PushManager&&window.Notification);
function read(){try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&/^[A-Za-z0-9_-]{32}$/.test(v.id)&&/^[A-Za-z0-9_-]{43}$/.test(v.secret)?v:null;}catch{return null;}}
function canStore(){try{localStorage.setItem('scorewit.notifyProbe','1');localStorage.removeItem('scorewit.notifyProbe');return true;}catch{return false;}}
function declined(){try{return Math.max(memoryDecline,Number(localStorage.getItem(declineKey)||0))>Date.now();}catch{return memoryDecline>Date.now();}}
function decline(){memoryDecline=Date.now()+30*86400000;try{localStorage.setItem(declineKey,String(memoryDecline));}catch{}draw();}
function text(parent,tag,value){const el=document.createElement(tag);el.textContent=value;parent.appendChild(el);return el;}
function button(parent,label,fn){const el=text(parent,'button',label);el.type='button';el.onclick=fn;el.disabled=busy;return el;}
function status(value){const el=document.getElementById('sw-notify-status');if(el)el.textContent=value;}
async function api(path,method,body,handle){const r=await fetch(config.serviceUrl.replace(/\/$/,'')+'/v1/'+path,{method,credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',...(handle?{Authorization:'Bearer '+handle.secret}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(r.status===404?'gone':r.status===409?'duplicate':'request');return r.status===204?null:r.json();}
function available(){return config.games.filter(g=>capabilities&&capabilities.packs.includes(g.pack));}
function played(){return config.games.filter(g=>{if(g.pack===config.pack)return true;try{return Object.keys(JSON.parse(localStorage.getItem(g.storagePrefix+'.history')||'{}')).length>0;}catch{return false;}}).map(g=>g.pack);}
function choices(saved){const selected=saved?saved.games:played();return available().filter(g=>selected.includes(g.pack)).map(g=>g.pack);}
function timezone(){return Intl.DateTimeFormat().resolvedOptions().timeZone;}
function fields(root,saved){
 const label=text(root,'label','Reminder hour (your local time) ');const select=document.createElement('select');select.id='sw-notify-hour';
 for(let h=0;h<24;h++){const o=document.createElement('option');o.value=String(h);o.textContent=String(h).padStart(2,'0')+':00';select.appendChild(o);}select.value=String(saved?saved.hour:new Date().getHours());label.appendChild(select);
 const group=document.createElement('fieldset');text(group,'legend','Games to include');root.appendChild(group);const selected=choices(saved);
 for(const g of available()){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=g.pack;input.name='sw-notify-game';input.checked=selected.includes(g.pack);label.appendChild(input);label.appendChild(document.createTextNode(g.name));group.appendChild(label);}
 text(root,'p','At most one reminder a day, when a selected round is confirmed ready. Timing is approximate.');
 const p=document.createElement('p'),link=document.createElement('a');link.href='https://www.scorewit.com/privacy';link.textContent='How reminder data is used';p.appendChild(link);root.appendChild(p);
}
function preferences(){const games=Array.from(document.querySelectorAll('input[name="sw-notify-game"]:checked')).map(e=>e.value);if(!games.length)throw Error('games');return{games,hour:Number(document.getElementById('sw-notify-hour').value),tz:timezone()};}
function draw(){
 const root=document.getElementById('sw-notify');if(!root)return;const saved=read();
 root.hidden=!visible||(!native&&!web)||(!saved&&(declined()||!capabilities||!available().length||!capabilities.transports.includes(native?'apns':'webpush')||(web&&Notification.permission==='denied')));
 if(root.hidden)return;root.replaceChildren();text(root,'h2',saved?'Reminder settings':'Remind me tomorrow');fields(root,saved);
 button(root,saved?'Save preferences':'Turn on reminders',saved?save:subscribe);
 button(root,saved?'Turn off reminders':'Not now',saved?unsubscribe:decline);
 const s=text(root,'p','');s.id='sw-notify-status';s.setAttribute('role','status');
}
async function load(){if(!loading)loading=api('status','GET').then(v=>{if(!v||!Array.isArray(v.packs)||!Array.isArray(v.transports))throw Error();capabilities=v;draw();}).catch(()=>{loading=null;});return loading;}
async function subscribe(){
 if(busy)return;let preferencesValue;try{preferencesValue=preferences();}catch{status('Choose at least one game.');return;}
 if(!canStore()){status('Your browser must allow local storage so you can manage or turn off reminders.');return;}
 busy=true;let credential,registration,handle;
 try{
   // Permission request is invoked directly from the click, before other awaits.
   const permission=native?bridge.requestPermissionAndToken():Notification.requestPermission();
   const result=await permission;
   if(native){if(!result||result.permission!=='granted'||!/^[a-fA-F0-9]{64}$/.test(result.token||'')){decline();return;}credential=result.token;}
   else{if(result!=='granted'){decline();return;}registration=await navigator.serviceWorker.register('/notify-sw.js',{scope:'/'});await navigator.serviceWorker.ready;const bytes=Uint8Array.from(atob(config.vapidPublicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));credential=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});}
   handle=await api('subscriptions','POST',{transport:native?'apns':'webpush',credential:native?credential:credential.toJSON(),...preferencesValue,locale:navigator.language||'en',app:{platform:native?'ios':/Android/i.test(navigator.userAgent)?'android':'web',version:config.appVersion}});
   try{localStorage.setItem(key,JSON.stringify({...handle,...preferencesValue}));}catch(error){await api('subscriptions/'+handle.id,'DELETE',null,handle);throw error;}
   draw();status('Reminders are on.');
 }catch(error){if(credential&&!native&&!handle){try{await credential.unsubscribe();}catch{}}status(error.message==='duplicate'?'This browser already has a reminder subscription. Use its existing reminder settings.':'Could not turn on reminders. Please try again.');}
 finally{busy=false;const root=document.getElementById('sw-notify');if(root)root.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
async function save(){if(busy)return;const handle=read();if(!handle)return;let p;try{p=preferences();}catch{status('Choose at least one game.');return;}busy=true;try{await api('subscriptions/'+handle.id,'PATCH',p,handle);localStorage.setItem(key,JSON.stringify({...handle,...p}));status('Preferences saved.');}catch{status('Could not save preferences. Please try again.');}finally{busy=false;}}
async function unsubscribe(){if(busy)return;const handle=read();if(!handle)return;busy=true;try{await api('subscriptions/'+handle.id,'DELETE',null,handle);if(web){try{const reg=await navigator.serviceWorker.getRegistration('/');const sub=reg&&await reg.pushManager.getSubscription();if(sub)await sub.unsubscribe();}catch{}}localStorage.removeItem(key);decline();}catch{status('Could not turn off reminders. Please retry; your settings are kept.');}finally{busy=false;}}
window.scorewitNotify={update:function(completed){visible=!!completed;if(visible&&(native||web)){if(!capabilities)void load();}draw();}};
window.addEventListener('storage',e=>{if(e.key===key||e.key===declineKey)draw();});
try{const url=new URL(location.href);if(url.searchParams.get('src')==='push'){if(config.games.some(g=>g.path===url.pathname))track('push_opened',{pack:config.pack});url.searchParams.delete('src');history.replaceState(history.state,'',url.pathname+url.search+url.hash);}}catch{}
})(__CONFIG__);
`;

/** Push only: a cached game could show yesterday's round. No fetch handler,
 * Cache API, offline fallback, precaching or automatic registration. */
export function notificationWorker(gamePaths: string[]): string {
  if (!gamePaths.length || gamePaths.some(p=>!/^\/[a-z0-9-]+$/.test(p))) throw Error('worker paths invalid');
  return String.raw`// Scorewit push-only worker. Caching a game page can serve yesterday's round.
const paths=__PATHS__;
function destination(value){try{const u=new URL(value);return u.origin===self.location.origin&&paths.includes(u.pathname)&&u.search==='?src=push'&&!u.hash?u.href:null;}catch{return null;}}
self.addEventListener('push',event=>{event.waitUntil((async()=>{
 let p;try{p=event.data.json();}catch{return;}
 const url=destination(p.url);if(!url||typeof p.title!=='string'||typeof p.body!=='string'||p.title.length>80||p.body.length>200)return;
 let date;try{date=new Intl.DateTimeFormat('en-CA',{timeZone:p.tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}catch{return;}
 if(p.date!==date)return;
 await self.registration.showNotification(p.title,{body:p.body,tag:'scorewit-daily',icon:'/icon-192.png',data:{url}});
})());});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 const url=destination(event.notification.data&&event.notification.data.url);if(!url)return;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const client of windows){if(client.url===url){await client.focus();return;}}
 await self.clients.openWindow(url);
})());});
`.replace('__PATHS__',()=>json(gamePaths));
}
