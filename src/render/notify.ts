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
export const NOTIFY_LANDING = '<aside id="sw-notify-landing" class="sw-notify-landing" aria-label="Reminder status" hidden></aside>';
export function reminderPage(config?: NotifyConfig): string {
 if(!config?.enabled)return '';
 return '<style>'+NOTIFY_CSS+'</style>'+NOTIFY_LANDING+'<button type="button" id="sw-notify-entry" hidden>Stats</button><dialog id="sw-notify-dialog" aria-label="Stats"><h2>Stats</h2><section id="sw-notify-stats" class="sw-notify"></section><form method="dialog"><button>Close</button></form></dialog><script>'+notifyScript(config)+`;document.getElementById('sw-notify-entry').onclick=function(){document.getElementById('sw-notify-dialog').showModal();window.scorewitNotify.settings();};</script>`;
}
export const NOTIFY_CSS = '\n.sw-notify-landing{padding:12px 18px;border-bottom:1px solid var(--line,#aaa);display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.sw-notify-landing[hidden]{display:none}.sw-notify-landing button{border:1px solid currentColor;border-radius:24px;padding:8px 20px;min-height:44px;color:inherit;background:transparent;cursor:pointer}#sw-notify-dialog{max-width:390px;width:calc(100% - 32px);border-radius:20px;padding:20px;background:var(--bg,#faf5ec);color:var(--text,#262721)}.sw-notify{margin:20px 0;padding:18px;border:1px solid var(--line,var(--text3));border-radius:14px}.sw-notify h2{font-size:18px}.sw-notify p{font-size:14px;line-height:1.5}.sw-notify button{min-height:44px;margin:8px 12px 0 0;padding:10px 16px;border-radius:24px;border:1px solid var(--text3);background:var(--bg);color:var(--text);cursor:pointer}.sw-notify label{display:block;margin:12px 0}.sw-notify select{font:inherit;padding:8px}.sw-notify input{margin-right:8px}.sw-notify [role=status]{font-size:13px}';
export function notifyScript(config?: NotifyConfig): string {
  if (!config?.enabled) return '';
  const url = new URL(config.serviceUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('notify serviceUrl must be an HTTPS origin');
  if (!config.games.length || !config.games.some(g=>g.pack===config.pack) || new Set(config.games.map(g=>g.pack)).size!==config.games.length) throw Error('notify games invalid');
  for (const g of config.games) if (!/^[a-z0-9-]+$/.test(g.pack) || !/^\/[a-z0-9-]+$/.test(g.path) || !g.name || !g.storagePrefix) throw Error('notify game invalid');
  if (!config.platforms.length || config.platforms.some(p=>p!=='webpush'&&p!=='apns')) throw Error('notify platform invalid');
  if(config.platforms.includes('webpush') && !/^[A-Za-z0-9_-]{87}=?$/.test(config.vapidPublicKey))throw Error('notify VAPID public key invalid');
  return CLIENT.replace('__CONFIG__', () => json(config)).replace('__OUTBOX__',()=>OUTBOX);
}
// Shared page/worker outbox: only reminder capabilities, never game data.
const OUTBOX = String.raw`
async function stopStore(method,value){
 if(typeof indexedDB==='undefined')return method==='read'?[]:null;
 return new Promise((resolve,reject)=>{
  const open=indexedDB.open('scorewit-reminders',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('stops',{keyPath:'id'});
  open.onerror=()=>reject(Error('storage'));
  open.onsuccess=()=>{const db=open.result,tx=db.transaction('stops',method==='read'?'readonly':'readwrite'),store=tx.objectStore('stops');
   const req=method==='read'?store.getAll():method==='remove'?store.delete(value):store.put(value);
   tx.oncomplete=()=>{db.close();resolve(req.result);};tx.onerror=()=>{db.close();reject(Error('storage'));};
  };
 });
}
function validStop(s){return !!s&&/^[A-Za-z0-9_-]{32}$/.test(s.id)&&/^stop1\.\d{10}\.[A-Za-z0-9_-]{43}$/.test(s.token);}
function nextRetry(attempts){return Date.now()+Math.min(3600000,1000*2**Math.min(attempts,12));}
`;
const CLIENT = String.raw`
// ---- Optional reminders. No subscription, worker or permission on arrival. ----
(function(config){
__OUTBOX__
const key='scorewit.reminders.v1', declineKey='scorewit.remindersDeclinedUntil';
let visible=false,busy=false,memoryDecline=0,capabilities=null,loading=null,fromPush=false,recovered=null,confirmedOff=false,memoryPending=null;
const bridge=window.ScorewitNativeNotifications;
const native=!!(bridge&&typeof bridge.requestPermissionAndToken==='function'&&config.platforms.includes('apns'));
const web=!!(!native&&config.platforms.includes('webpush')&&window.isSecureContext&&navigator.serviceWorker&&window.PushManager&&window.Notification);
function read(){try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&/^[A-Za-z0-9_-]{32}$/.test(v.id)&&/^[A-Za-z0-9_-]{43}$/.test(v.secret)?v:null;}catch{return null;}}
function canStore(){try{localStorage.setItem('scorewit.notifyProbe','1');localStorage.removeItem('scorewit.notifyProbe');return true;}catch{return false;}}
function declined(){try{return Math.max(memoryDecline,Number(localStorage.getItem(declineKey)||0))>Date.now();}catch{return memoryDecline>Date.now();}}
function decline(){memoryDecline=Date.now()+30*86400000;try{localStorage.setItem(declineKey,String(memoryDecline));}catch{}draw();}
function text(parent,tag,value){const el=document.createElement(tag);el.textContent=value;parent.appendChild(el);return el;}
function button(parent,label,fn){const el=text(parent,'button',label);el.type='button';el.onclick=fn;el.disabled=busy;return el;}
function activeRoot(){return document.getElementById('sw-notify-stats')||document.getElementById('sw-notify');}
function status(value){const el=document.getElementById('sw-notify-status');if(el)el.textContent=value;}
async function api(path,method,body,handle){const r=await fetch(config.serviceUrl.replace(/\/$/,'')+'/v1/'+path,{method,credentials:'omit',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json',...(handle?{Authorization:'Bearer '+handle.secret}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(r.status===404?'gone':r.status===409?'duplicate':'request');return r.status===204?null:r.json();}
function available(){return config.games.filter(g=>capabilities&&capabilities.packs.includes(g.pack));}
function played(){return config.games.filter(g=>{if(g.pack===config.pack)return true;try{return Object.keys(JSON.parse(localStorage.getItem(g.storagePrefix+'.history')||'{}')).length>0;}catch{return false;}}).map(g=>g.pack);}
function choices(saved){const selected=saved?saved.games:played();return available().filter(g=>selected.includes(g.pack)).map(g=>g.pack);}
function timezone(){return Intl.DateTimeFormat().resolvedOptions().timeZone;}
// One zone-only update on a later visit. No consent, token refresh or other
// preference update is automatic. A failed request keeps the old zone for retry
// on the next visit, rather than repeating on every render.
async function syncTimezone(){
 const saved=read();if(!saved||saved.pendingDelete)return;
 let tz;try{tz=timezone();}catch{return;}if(saved.tz===tz)return;
 busy=true;
 try{await api('subscriptions/'+saved.id,'PATCH',{tz},saved);
   const latest=read();if(latest&&latest.id===saved.id&&latest.secret===saved.secret)localStorage.setItem(key,JSON.stringify({...latest,tz}));
 }catch{}finally{busy=false;draw();}
}
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
 const root=activeRoot();if(!root)return;const saved=read(),handle=saved||recovered||memoryPending,settings=root.id==='sw-notify-stats';
 const resultRoot=document.getElementById('sw-notify');if(settings&&resultRoot&&resultRoot!==root){resultRoot.hidden=true;resultRoot.replaceChildren();}
 const pending=!!(memoryPending||saved&&saved.pendingDelete||recovered&&recovered.pending);
 const offer=visible&&!settings&&!handle&&!confirmedOff&&(native||web)&&!declined()&&capabilities&&available().length&&capabilities.transports.includes(native?'apns':'webpush')&&!(web&&Notification.permission==='denied');
 root.hidden=!(settings||visible&&handle||offer);root.replaceChildren();
 if(!root.hidden){
 text(root,'h2',settings?'Daily reminders':handle?'Reminders are on':'Remind me tomorrow');
 if(pending){text(root,'p','Turning off, will retry');button(root,'Retry now',()=>unsubscribe(true));}
 else if(handle){button(root,'Turn off reminders',()=>unsubscribe(true));text(root,'p','Reminders are on.');if(saved&&!saved.pendingDelete){fields(root,saved);button(root,'Save preferences',save);}}
 else if(offer){fields(root,null);button(root,'Turn on reminders',subscribe);button(root,'Not now',decline);}
 else text(root,'p',confirmedOff?'Reminders are off.':'No reminder subscription is saved here. If reminders still arrive, use Turn Off on the notification or your device notification settings.');
 const state=text(root,'p','');state.id='sw-notify-status';state.setAttribute('role','status');
 }
 const bar=document.getElementById('sw-notify-landing');
 if(bar){bar.hidden=!fromPush;bar.replaceChildren();if(fromPush){text(bar,'span',pending?'Turning off, will retry':confirmedOff?'Reminders are off.':handle?'Reminders are on.':'Manage your reminders.');if(handle&&!confirmedOff)button(bar,'Turn Off',()=>unsubscribe(true));else if(!confirmedOff)text(bar,'span','Use Turn Off on the notification, or your device notification settings.');}}
 const entry=document.getElementById('sw-notify-entry');if(entry)entry.hidden=!handle&&!confirmedOff&&!fromPush;
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
   handle=await api('subscriptions','POST',{transport:native?'apns':'webpush',credential:native?credential:credential.toJSON(),...preferencesValue,app:{platform:native?'ios':/Android/i.test(navigator.userAgent)?'android':'web',version:config.appVersion}});
   try{localStorage.setItem(key,JSON.stringify({...handle,...preferencesValue}));}catch(error){await api('subscriptions/'+handle.id,'DELETE',null,handle);throw error;}
   confirmedOff=false;recovered=null;try{localStorage.removeItem('scorewit.remindersOff');}catch{}draw();status('Reminders are on.');
 }catch(error){if(credential&&!native&&!handle){try{await credential.unsubscribe();}catch{}}status(error.message==='duplicate'?'This browser already has a reminder subscription. Use its existing reminder settings.':'Could not turn on reminders. Please try again.');}
 finally{busy=false;const root=activeRoot();if(root)root.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
async function save(){if(busy)return;const handle=read();if(!handle||handle.pendingDelete||recovered&&recovered.pending)return;let p;try{p=preferences();}catch{status('Choose at least one game.');return;}busy=true;try{await api('subscriptions/'+handle.id,'PATCH',p,handle);localStorage.setItem(key,JSON.stringify({...handle,...p}));status('Preferences saved.');}catch{status('Could not save preferences. Please try again.');}finally{busy=false;}}
async function unsubscribe(force=false){
 if(busy)return;const saved=read(),handle=saved||recovered||memoryPending;if(!handle)return;
 if(!force&&handle.nextAttemptAt>Date.now())return;
 busy=true;let pending={...handle,pending:true,pendingDelete:true};
 try{
  memoryPending=pending;
  try{if(saved)localStorage.setItem(key,JSON.stringify(pending));else{recovered=pending;await stopStore('put',pending);}}catch{}
  draw();
  await api('subscriptions/'+handle.id,'DELETE',null,{secret:saved?handle.secret:handle.token});
  // Record confirmation only after the server acknowledges. Retain the outbox
  // if persistence fails, making a repeated DELETE safe rather than pretending.
  if(validStop(recovered)&&recovered.id===handle.id)await stopStore('put',{...recovered,pending:false,confirmedOff:true});
  if(saved)localStorage.removeItem(key);
  if(native&&typeof bridge.confirmRemindersOff==='function')await bridge.confirmRemindersOff(handle.id);
  recovered=null;memoryPending=null;confirmedOff=true;
  try{localStorage.setItem('scorewit.remindersOff','1');}catch{}
  if(web){try{const reg=await navigator.serviceWorker.getRegistration('/');const sub=reg&&await reg.pushManager.getSubscription();if(sub)await sub.unsubscribe();}catch{}}
  decline();
 }catch{
  pending={...pending,attempts:(pending.attempts||0)+1};pending.nextAttemptAt=nextRetry(pending.attempts);
  try{if(saved)localStorage.setItem(key,JSON.stringify(pending));else{recovered=pending;await stopStore('put',pending);}}catch{}
 }finally{busy=false;draw();}
}
async function retryRecovered(record){
 if(!record.pending||record.nextAttemptAt>Date.now())return record;
 try{
  await api('subscriptions/'+record.id,'DELETE',null,{secret:record.token});
  const confirmed={...record,pending:false,confirmedOff:true};await stopStore('put',confirmed);
  if(native&&typeof bridge.confirmRemindersOff==='function')await bridge.confirmRemindersOff(record.id);
  return confirmed;
 }catch{
  const attempts=(record.attempts||0)+1,next={...record,attempts,nextAttemptAt:nextRetry(attempts)};
  try{await stopStore('put',next);}catch{}return next;
 }
}
async function restoreStops(){
 try{
  recovered=null;
  const records=await stopStore('read');
  const nativeState=native&&typeof bridge.getReminderState==='function'?await bridge.getReminderState():null;
  if(nativeState&&validStop(nativeState)){
   const existing=records.find(r=>r.id===nativeState.id);
   if(!existing)records.push(nativeState);
   else if(!existing.confirmedOff){existing.pending=existing.pending||nativeState.pending;existing.nextAttemptAt=Math.max(existing.nextAttemptAt||0,nativeState.nextAttemptAt||0);if(Number(nativeState.token.split('.')[1])>Number(existing.token.split('.')[1]))existing.token=nativeState.token;}
  }
  // Retry each capability by its own id. An older pending notification must
  // never delete a newer subscription created after explicit re-consent.
  for(let record of records){
   if(!validStop(record))continue;
   if(!record.pending&&Number(record.token.split('.')[1])*1000<=Date.now()){await stopStore('remove',record.id);continue;}
   record=await retryRecovered(record);
   const saved=read();
   if(record.confirmedOff){
    if(saved&&saved.id===record.id)localStorage.removeItem(key);
    if(memoryPending&&memoryPending.id===record.id)memoryPending=null;
    if(!read())confirmedOff=true;
    continue;
   }
   if((!saved||saved.id===record.id)&&(!recovered||record.pending))recovered=record;
  }
  if(read()||recovered&&!recovered.pending)confirmedOff=false;
  if(read()&&read().pendingDelete)await unsubscribe();
  else await syncTimezone();
 }catch{await syncTimezone();}
 draw();
}
window.scorewitNotify={
 update:function(completed){visible=!!completed;if(visible&&(native||web)&&!capabilities)void load();draw();},
 settings:function(){draw();if(read()&&!capabilities)void load();},
};
if(web&&navigator.serviceWorker.addEventListener)navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.type==='scorewit-reminders-changed')void restoreStops();});
window.addEventListener('storage',e=>{if(e.key===key||e.key===declineKey)draw();});
try{const url=new URL(location.href);if(url.searchParams.get('src')==='push'){fromPush=true;if(config.games.some(g=>g.path===url.pathname)&&typeof track==='function')track('push_opened',{pack:config.pack});url.searchParams.delete('src');history.replaceState(history.state,'',url.pathname+url.search+url.hash);}}catch{}
try{confirmedOff=localStorage.getItem('scorewit.remindersOff')==='1';}catch{}
void restoreStops();
})(__CONFIG__);
`;

/** Push only: a cached game could show yesterday's round. No fetch handler,
 * Cache API, offline fallback, precaching or automatic registration. */
export function notificationWorker(gamePaths: string[], serviceUrl = ''): string {
  if (!gamePaths.length || gamePaths.some(p=>!/^\/[a-z0-9-]+$/.test(p))) throw Error('worker paths invalid');
  if(serviceUrl){const u=new URL(serviceUrl);if(u.protocol!=='https:'||u.origin!==serviceUrl.replace(/\/$/,''))throw Error('worker service origin invalid');}
  return String.raw`// Scorewit push-only worker. Caching a game page can serve yesterday's round.
const paths=__PATHS__,service=__SERVICE__;
__OUTBOX__
function destination(value){try{const u=new URL(value);return u.origin===self.location.origin&&paths.includes(u.pathname)&&u.search==='?src=push'&&!u.hash?u.href:null;}catch{return null;}}
async function stopReminder(stop,force=false){
 if(!service||!validStop(stop))return false;
 if(!force&&stop.nextAttemptAt>Date.now())return false;
 let pending={...stop,pending:true};
 try{
  try{await stopStore('put',pending);}catch{}
  const response=await fetch(service+'/v1/subscriptions/'+stop.id,{method:'DELETE',credentials:'omit',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+stop.token},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('request');
  await stopStore('put',{...stop,pending:false,confirmedOff:true});
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows)client.postMessage({type:'scorewit-reminders-changed'});
  return true;
 }catch{pending.attempts=(pending.attempts||0)+1;pending.nextAttemptAt=nextRetry(pending.attempts);try{await stopStore('put',pending);}catch{}return false;}
}
self.addEventListener('push',event=>{event.waitUntil((async()=>{
 let p;try{p=event.data.json();}catch{return;}
 const url=destination(p.url);if(!url||!service||!validStop(p.stop)||typeof p.title!=='string'||typeof p.body!=='string'||p.title.length>80||p.body.length>200)return;
 let date;try{date=new Intl.DateTimeFormat('en-CA',{timeZone:p.tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}catch{return;}
 if(p.date!==date)return;
 let old;try{old=(await stopStore('read')).find(s=>s.id===p.stop.id);}catch{}
 if(old&&(old.pending||old.confirmedOff)){await stopReminder({...old,...p.stop},true);return;}
 try{await stopStore('put',p.stop);}catch{}
 const path=new URL(url).pathname;
 await self.registration.showNotification(p.title,{body:p.body,tag:'scorewit-daily',icon:path+'/icon-192.png',badge:'/notification-badge.png',actions:[{action:'stop',title:'Turn Off'},{action:'play',title:'Play'}],data:{url,stop:p.stop}});
})());});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 if(event.action==='stop'){await stopReminder(event.notification.data&&event.notification.data.stop,true);return;}
 if(event.action&&event.action!=='play')return;
 const url=destination(event.notification.data&&event.notification.data.url);if(!url)return;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const client of windows){if(client.url===url){await client.focus();return;}}
 await self.clients.openWindow(url);
})());});
`.replace('__PATHS__',()=>json(gamePaths)).replace('__SERVICE__',()=>json(serviceUrl.replace(/\/$/,''))).replace('__OUTBOX__',()=>OUTBOX);
}
