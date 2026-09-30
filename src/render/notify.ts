export interface NotifyGame { pack: string; name: string; path: string; storagePrefix: string; icon?: string }
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
export const NOTIFY_CSS = ".sw-notify-landing{padding:12px 18px;border-bottom:1px solid var(--line,#aaa);display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.sw-notify-landing[hidden],.sw-notify[hidden]{display:none}.sw-notify-landing button{border:1px solid currentColor;border-radius:24px;padding:8px 20px;min-height:44px;color:inherit;background:transparent;cursor:pointer}#sw-notify-dialog,.sw-notify-confirm{box-sizing:border-box;max-width:390px;width:calc(100% - 32px);border:1px solid #d9d2c2;border-radius:20px;padding:20px;background:#faf6eb;color:#25261f}.sw-notify-confirm::backdrop{background:#25261faa}.sw-notify{box-sizing:border-box;margin:20px 0;padding:18px 16px;border:1px solid #d9d2c2;border-radius:19px;background:#fffdf7;color:#25261f;text-align:left}.sw-notify *{box-sizing:border-box}.sw-notify-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.sw-notify .sw-notify-head h2{font-size:19px;letter-spacing:-.4px;margin:0}.sw-notify p{font-size:13px;line-height:1.55;color:#706b5e;margin:12px 0 0}.sw-notify button,.sw-notify-confirm button{font:inherit;min-height:44px;padding:10px 16px;border-radius:24px;border:1px solid #c8c0af;background:#faf6eb;color:#25261f;cursor:pointer;touch-action:manipulation}.sw-notify button:disabled{cursor:default;opacity:.6}.sw-notify-control{display:flex;align-items:center;gap:9px}.sw-notify-control>span{font-size:10px;letter-spacing:.7px;font-weight:800;color:#6e7164}.sw-notify .sw-notify-switch{position:relative;flex-shrink:0;width:48px;min-width:48px;height:44px;border:0;border-radius:30px;padding:0;background:transparent}.sw-notify-switch::after{content:'';position:absolute;inset:7px 0 8px;border-radius:30px;background:#d2ccbe}.sw-notify-switch::before{content:'';position:absolute;top:10px;left:3px;width:23px;height:23px;z-index:1;border-radius:50%;background:#fffef9;box-shadow:0 1px 4px #0002;transition:transform .18s}.sw-notify-switch[aria-checked=true]::after{background:#276b4b}.sw-notify-switch[aria-checked=true]::before{transform:translateX(19px)}.sw-notify-sports{border-top:1px solid #e8e1d4;margin-top:17px;padding-top:15px}.sw-notify-eyebrow{font-size:11px;font-weight:800;letter-spacing:.7px;color:#7b7567;margin-bottom:11px}.sw-notify-chips{display:flex;gap:8px;flex-wrap:wrap}.sw-notify .sw-notify-chip{display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:9px 11px;border:1px solid #dbd4c6;border-radius:30px;background:#fbf8ef;font-size:12px;color:#777263;max-width:100%;overflow-wrap:anywhere}.sw-notify-chip[aria-pressed=true]{border-color:#6a9479;background:#eaf1e5;color:#224f38}.sw-notify-summary{display:flex;align-items:center;gap:6px;margin-top:16px;font-size:12px;flex-wrap:wrap}.sw-notify-summary strong{font-weight:600}.sw-notify .sw-notify-link{margin-left:auto;border:0;background:none;padding:0 5px;font-size:12px;text-decoration:underline;text-underline-offset:3px}.sw-notify [role=status]{font-size:11px;color:#706b5e;min-height:0}.sw-notify [role=status]:empty{display:none}.sw-notify-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:9px;font-size:11px;color:#81786a}.sw-notify-footer a{font-size:11px;min-height:44px;display:inline-flex;align-items:center;color:inherit;text-decoration:underline;text-underline-offset:3px}.sw-notify :focus-visible,.sw-notify-confirm :focus-visible{outline:2px solid #327a98;outline-offset:3px}.sw-notify-confirm h2{font-size:21px}.sw-notify-confirm p{font-size:14px;line-height:1.6}.sw-notify-confirm button{margin:8px 8px 0 0}@media(prefers-reduced-motion:reduce){.sw-notify-switch::before{transition:none}}\n";
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
const key='scorewit.reminders.v1';
let visible=false,busy=false,capabilities=null,loading=null,fromPush=false,recovered=null,confirmedOff=false,memoryPending=null;
let notice='',expanded=false,starting=false,nativeDenied=false,desired=null,retryGames=null,saving=false,revision=0,offerAllowed=false,lastRound=null;
const bridge=window.ScorewitNativeNotifications;
const native=!!(bridge&&typeof bridge.requestPermissionAndToken==='function'&&config.platforms.includes('apns'));
const web=!!(!native&&config.platforms.includes('webpush')&&window.isSecureContext&&navigator.serviceWorker&&window.PushManager&&window.Notification);
const ua=navigator.userAgent||'';
const ios=/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const standalone=navigator.standalone===true||!!(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches);
const iosGuide=!native&&ios&&!standalone;
function read(){try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&/^[A-Za-z0-9_-]{32}$/.test(v.id)&&/^[A-Za-z0-9_-]{43}$/.test(v.secret)?v:null;}catch{return null;}}
function canStore(){try{localStorage.setItem('scorewit.notifyProbe','1');localStorage.removeItem('scorewit.notifyProbe');return true;}catch{return false;}}
function text(parent,tag,value){const el=document.createElement(tag);el.textContent=value;parent.appendChild(el);return el;}
function button(parent,label,fn){const el=text(parent,'button',label);el.type='button';el.onclick=fn;el.disabled=busy;return el;}
function activeRoot(){return document.getElementById('sw-notify-stats')||document.getElementById('sw-notify');}
function status(value){notice=value;const el=document.getElementById('sw-notify-status');if(el)el.textContent=value;}
async function api(path,method,body,handle){const r=await fetch(config.serviceUrl.replace(/\/$/,'')+'/v1/'+path,{method,credentials:'omit',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json',...(handle?{Authorization:'Bearer '+handle.secret}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(r.status===404?'gone':r.status===409?'duplicate':'request');return r.status===204?null:r.json();}
function available(){return capabilities?config.games.filter(g=>capabilities.packs.includes(g.pack)):config.games;}
function timezone(){return Intl.DateTimeFormat().resolvedOptions().timeZone;}
function localPrefs(){try{const v=JSON.parse(localStorage.getItem('scorewit.reminderPreferences')||'null');return v&&Array.isArray(v.games)&&v.games.length?v:null;}catch{return null;}}
function choices(){const stored=read()||localPrefs();const selected=desired||stored&&stored.games||[config.pack];return available().filter(g=>selected.includes(g.pack)).map(g=>g.pack);}
function keepPrefs(games){localStorage.setItem('scorewit.reminderPreferences',JSON.stringify({games}));}
function endOffer(){try{localStorage.setItem('scorewit.reminderOfferEnded','1');}catch{}}
function roundOffer(round){
 if(!canStore())return true;
 try{
  if(localStorage.getItem('scorewit.reminderOfferEnded')==='1')return false;
  const seen=JSON.parse(localStorage.getItem('scorewit.reminderOfferRounds')||'[]');
  if(seen.includes(round))return true;
  const count=Number(localStorage.getItem('scorewit.reminderOfferShown')||0);
  if(count>=3)return false;
  localStorage.setItem('scorewit.reminderOfferRounds',JSON.stringify([...seen,round].slice(-3)));
  localStorage.setItem('scorewit.reminderOfferShown',String(count+1));return true;
 }catch{return true;}
}
function analytics(name,games){if(typeof track==='function')track(name,{pack:location.pathname==='/'?'hub':config.pack,games:games.length});}
async function syncTimezone(){
 const saved=read();if(!saved||saved.pendingDelete)return;
 let tz;try{tz=timezone();}catch{return;}if(saved.tz===tz)return;
 busy=true;
 try{await api('subscriptions/'+saved.id,'PATCH',{tz},saved);const latest=read();if(latest&&latest.id===saved.id&&latest.secret===saved.secret)localStorage.setItem(key,JSON.stringify({...latest,tz}));}
 catch{}finally{busy=false;draw();}
}
function openGuide(trigger){
 const dialog=document.getElementById('sw-install-guide');if(!dialog)return;
 const help=document.getElementById('sw-install-browser-help');if(help)help.open=!/Version\/.*Safari\//.test(ua)||/CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo|FBAN|FBAV|Instagram|Line\//i.test(ua);
 const field=document.getElementById('sw-install-page-link');if(field)field.value=location.origin+location.pathname;
 const copy=document.getElementById('sw-install-copy-status');if(copy)copy.textContent='';
 dialog.addEventListener('close',()=>{if(trigger.isConnected)trigger.focus();},{once:true});dialog.showModal();
}
function removeLast(game){
 const root=activeRoot(),dialog=document.createElement('dialog');dialog.className='sw-notify-confirm';dialog.setAttribute('aria-labelledby','sw-notify-confirm-title');
 const h=text(dialog,'h2','Turn reminders off?');h.id='sw-notify-confirm-title';text(dialog,'p','You are removing your last sport.');
 const keep=button(dialog,'Keep '+game.name.replace(/^Scorewit /,''),()=>dialog.close());keep.autofocus=true;
 button(dialog,'Turn off',async()=>{dialog.close();if(read()||recovered)await unsubscribe(true);else{confirmedOff=true;endOffer();draw();}});
 dialog.addEventListener('close',()=>{dialog.remove();document.getElementById('sw-notify-chip-'+game.pack)?.focus();},{once:true});root.appendChild(dialog);dialog.showModal();
}
function chip(game){
 if(busy||memoryPending||read()?.pendingDelete)return;
 const old=choices();if(old.includes(game.pack)&&old.length===1){removeLast(game);return;}
 desired=old.includes(game.pack)?old.filter(g=>g!==game.pack):[...old,game.pack];revision++;notice='';retryGames=null;
 if(!read()){try{keepPrefs(desired);status('All changes saved');}catch{desired=old;status("Couldn't save. Your last selection is back.");}draw();return;}
 void saveChips();
}
async function saveChips(){
 if(saving)return;saving=true;
 try{
  while(desired){
   const saved=read();if(!saved||saved.pendingDelete||memoryPending)break;
   const games=[...desired],atRevision=revision;status('Saving…');draw();
   try{
    await api('subscriptions/'+saved.id,'PATCH',{games},saved);
    const latest=read();if(!latest||latest.id!==saved.id||latest.pendingDelete)break;
    const {hour,...rest}=latest;localStorage.setItem(key,JSON.stringify({...rest,games}));try{keepPrefs(games);}catch{}
    if(atRevision===revision){desired=null;status('All changes saved');break;}
   }catch{
    if(atRevision!==revision)continue;
    retryGames=games;desired=null;status("Couldn't save. Your last selection is back.");break;
   }
  }
 }finally{saving=false;draw();}
}
function privacy(root,on){const row=document.createElement('div');row.className='sw-notify-footer';text(row,'span',on?'Sent around 6 PM your time.':'Always optional.');const link=text(row,'a','Privacy');link.href='https://www.scorewit.com/privacy#reminders';root.appendChild(row);}
function draw(){
 const root=activeRoot();if(!root)return;const focused=document.activeElement?.id;
 const saved=read(),handle=saved||recovered||memoryPending,settings=root.id==='sw-notify-stats';
 const pending=!!(memoryPending||saved&&saved.pendingDelete||recovered&&recovered.pending);
 const resultRoot=document.getElementById('sw-notify');if(settings&&resultRoot&&resultRoot!==root){resultRoot.hidden=true;resultRoot.replaceChildren();}
 root.hidden=!(settings||visible&&offerAllowed&&(native||web||iosGuide));root.replaceChildren();
 if(!root.hidden){
  const header=document.createElement('div');header.className='sw-notify-head';text(header,'h2','Reminders');root.appendChild(header);
  if(iosGuide&&!handle){text(root,'p','Reminders need Scorewit on your Home Screen. It takes a few seconds.');const how=button(root,'Show me how',()=>openGuide(how));privacy(root,false);}
  else{
   const on=!!handle&&!pending,storageOk=canStore(),denied=web&&Notification.permission==='denied'||nativeDenied;
   const state=document.createElement('div');state.className='sw-notify-control';text(state,'span',pending?'Stopping…':starting?'Starting…':on?'ON':'OFF');header.appendChild(state);
   const toggle=button(state,'',()=>on?unsubscribe(true):subscribe());toggle.id='sw-notify-toggle';toggle.className='sw-notify-switch';toggle.setAttribute('role','switch');toggle.setAttribute('aria-label','Reminders');toggle.setAttribute('aria-checked',String(on));toggle.setAttribute('aria-busy',String(busy||pending));
   toggle.disabled=busy||pending||saving||(!on&&(!storageOk||denied||!(native||web)||!capabilities||!available().length||!capabilities.transports.includes(native?'apns':'webpush')));
   text(root,'p',on?"One reminder a day. We'll take care of the timing.":confirmedOff?'No reminders. Your sports are saved for next time.':'A little nudge when your next daily round is ready.');
   const selected=choices(),showChips=expanded||settings&&on;
   if(showChips){
    const group=document.createElement('div');group.className='sw-notify-sports';text(group,'div','YOUR SPORTS').className='sw-notify-eyebrow';const chips=document.createElement('div');chips.className='sw-notify-chips';chips.setAttribute('role','group');chips.setAttribute('aria-label','Sports for reminders');group.appendChild(chips);root.appendChild(group);
    for(const game of available()){
     const chosen=selected.includes(game.pack),b=button(chips,'',()=>chip(game));b.id='sw-notify-chip-'+game.pack;b.className='sw-notify-chip';b.setAttribute('aria-pressed',String(chosen));b.setAttribute('aria-label',game.name.replace(/^Scorewit /,''));b.disabled=busy||pending||!storageOk;
     if(game.icon)text(b,'span',game.icon).setAttribute('aria-hidden','true');text(b,'span',game.name.replace(/^Scorewit /,''));text(b,'span',chosen?'✓':'+').setAttribute('aria-hidden','true');
    }
   }else if(!on){
    const summary=document.createElement('div');summary.className='sw-notify-summary';text(summary,'span',confirmedOff?'Saved':'For');text(summary,'strong',available().filter(g=>selected.includes(g.pack)).map(g=>g.name.replace(/^Scorewit /,'')).join(' · '));const change=button(summary,'Change',()=>{expanded=true;endOffer();draw();document.getElementById('sw-notify-chip-'+selected[0])?.focus();});change.className='sw-notify-link';change.disabled=busy||pending;root.appendChild(summary);
   }
   const value=pending?'Turning off, will retry':!storageOk?'Your browser must allow site storage so you can manage or turn off reminders.':denied?'Notifications are blocked for this site. Allow them in your browser settings, then reload.':notice||(!capabilities&&!iosGuide?'Loading reminder options…':'');
   const statusNode=text(root,'p',value);statusNode.id='sw-notify-status';statusNode.setAttribute('role','status');statusNode.setAttribute('aria-live','polite');
   if(pending)button(root,'Retry',()=>unsubscribe(true));
   else if(retryGames)button(root,'Retry',()=>{desired=retryGames;retryGames=null;revision++;void saveChips();});
   else if(!capabilities&&!busy&&!iosGuide)button(root,'Retry',()=>load());
   privacy(root,on);
  }
 }
 const bar=document.getElementById('sw-notify-landing');
 if(bar){bar.hidden=!fromPush;bar.replaceChildren();if(fromPush){text(bar,'span',pending?'Turning off, will retry':confirmedOff?'Reminders are off.':handle?'Reminders are on.':'Manage your reminders.');if(handle&&!confirmedOff)button(bar,'Turn Off',()=>unsubscribe(true));else if(!confirmedOff)text(bar,'span','Use Turn Off on the notification, or your device notification settings.');}}
 const entry=document.getElementById('sw-notify-entry');if(entry)entry.hidden=!(native||web||iosGuide||handle||fromPush);
 if(focused)document.getElementById(focused)?.focus();
}
async function load(){if(!loading)loading=api('status','GET').then(v=>{if(!v||!Array.isArray(v.packs)||!Array.isArray(v.transports)||v.timing?.name!=='evening'||v.timing?.targetHour!==18||v.timing?.hint!=='Sent around 6 PM your time.')throw Error();capabilities=v;notice='';draw();}).catch(()=>{loading=null;status('Could not load reminders. Please try again.');draw();});return loading;}
async function subscribe(){
 if(busy||saving)return;const preferencesValue={games:choices(),tz:timezone()};if(!preferencesValue.games.length){status('Choose at least one game.');return;}
 if(!canStore()){status('Your browser must allow site storage so you can manage or turn off reminders.');return;}
 busy=true;starting=true;notice='';endOffer();draw();let credential,registration,handle;
 try{
   // Permission request is invoked directly from the click, before other awaits.
   const permission=native?bridge.requestPermissionAndToken():Notification.requestPermission();
   const result=await permission;
   if(native){if(!result||result.permission!=='granted'||!/^[a-fA-F0-9]{64}$/.test(result.token||'')){nativeDenied=result&&result.permission==='denied';status(nativeDenied?'Notifications are blocked for this site. Allow them in your browser settings, then reload.':'Reminders stay off until you allow notifications.');return;}credential=result.token;}
   else{if(result!=='granted'){status(result==='denied'?'Notifications are blocked for this site. Allow them in your browser settings, then reload.':'Reminders stay off until you allow notifications.');return;}registration=await navigator.serviceWorker.register('/notify-sw.js',{scope:'/'});await navigator.serviceWorker.ready;const bytes=Uint8Array.from(atob(config.vapidPublicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));credential=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});}
   handle=await api('subscriptions','POST',{transport:native?'apns':'webpush',credential:native?credential:credential.toJSON(),...preferencesValue,app:{platform:native?'ios':/Android/i.test(navigator.userAgent)?'android':'web',version:config.appVersion}});
   try{localStorage.setItem(key,JSON.stringify({...handle,...preferencesValue}));}catch(error){await api('subscriptions/'+handle.id,'DELETE',null,handle);throw error;}
   try{keepPrefs(preferencesValue.games);}catch{}desired=null;analytics('reminders_on',preferencesValue.games);expanded=false;confirmedOff=false;recovered=null;try{localStorage.removeItem('scorewit.remindersOff');}catch{}draw();status('Reminders are on.');
 }catch(error){if(credential&&!native&&!handle){try{await credential.unsubscribe();}catch{}}status(error.message==='duplicate'?'This browser already has a reminder subscription. Use its existing reminder settings.':'Could not turn on reminders. Please try again.');}
 finally{busy=false;starting=false;draw();}
}
async function unsubscribe(force=false){
 if(busy||saving)return;const saved=read(),handle=saved||recovered||memoryPending;if(!handle)return;
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
  if(saved){try{keepPrefs(saved.games);}catch{}localStorage.removeItem(key);}
  if(native&&typeof bridge.confirmRemindersOff==='function')await bridge.confirmRemindersOff(handle.id);
  recovered=null;memoryPending=null;confirmedOff=true;
  try{localStorage.setItem('scorewit.remindersOff','1');}catch{}
  if(web){try{const reg=await navigator.serviceWorker.getRegistration('/');const sub=reg&&await reg.pushManager.getSubscription();if(sub)await sub.unsubscribe();}catch{}}
  analytics('reminders_off',saved?.games||choices());notice='';desired=null;retryGames=null;expanded=false;endOffer();
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
 if(activeRoot()?.id==='sw-notify-stats'&&(native||web)&&!capabilities)void load();
 draw();
}
window.scorewitNotify={
 update:function(completed,round){visible=!!completed;if(visible&&lastRound!==(round||config.pack)){lastRound=round||config.pack;offerAllowed=roundOffer(config.pack+':'+lastRound);}if(visible&&offerAllowed&&(native||web)&&!capabilities&&!iosGuide)void load();draw();},
 settings:function(){draw();if((native||web)&&!capabilities&&!iosGuide)void load();},
};
if(web&&navigator.serviceWorker.addEventListener)navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.type==='scorewit-reminders-changed')void restoreStops();});
if(native)window.addEventListener('scorewit-native-reminders-changed',()=>void restoreStops());
window.addEventListener('storage',e=>{if(e.key===key||e.key==='scorewit.reminderPreferences')draw();});
try{const url=new URL(location.href);if(url.searchParams.get('src')==='push'){fromPush=true;if((url.pathname==='/'||config.games.some(g=>g.path===url.pathname))&&typeof track==='function')track('push_opened',{pack:url.pathname==='/'?'hub':config.pack});url.searchParams.delete('src');history.replaceState(history.state,'',url.pathname+url.search+url.hash);}}catch{}
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
function destination(value){try{const u=new URL(value);return u.origin===self.location.origin&&__DESTINATION_CHECK__&&u.search==='?src=push'&&!u.hash?u.href:null;}catch{return null;}}
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
 await self.registration.showNotification(p.title,{body:p.body,tag:'scorewit-daily',icon:__ICON_PATH__+'/icon-192.png',badge:'/notification-badge.png',actions:[{action:'stop',title:'Turn Off'},{action:'play',title:'Play'}],data:{url,stop:p.stop}});
})());});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 if(event.action==='stop'){await stopReminder(event.notification.data&&event.notification.data.stop,true);return;}
 if(event.action&&event.action!=='play')return;
 const url=destination(event.notification.data&&event.notification.data.url);if(!url)return;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const client of windows){if(client.url===url){await client.focus();return;}}
 await self.clients.openWindow(url);
})());});
`.replace('__DESTINATION_CHECK__',()=>serviceUrl?"(u.pathname==='/'||paths.includes(u.pathname))":'paths.includes(u.pathname)').replace('__ICON_PATH__',()=>serviceUrl?"(path==='/'?'':path)":'path').replace('__PATHS__',()=>json(gamePaths)).replace('__SERVICE__',()=>json(serviceUrl.replace(/\/$/,''))).replace('__OUTBOX__',()=>OUTBOX);
}
