import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { notifyScript, notificationWorker, type NotifyConfig } from './render/notify';
import { notificationState, validateNotificationState } from './notification-state';

const config: NotifyConfig = { enabled:true,serviceUrl:'https://notify.example',vapidPublicKey:Buffer.alloc(65,4).toString('base64url'),pack:'f1',appVersion:'1.0.0',platforms:['webpush','apns'],games:[{pack:'f1',name:'Racing',path:'/f1',storagePrefix:'racing',icon:'🏎️'},{pack:'worldcup',name:'World Cup',path:'/worldcup',storagePrefix:'soccer',icon:'⚽'}] };
assert.equal(notifyScript(), '');assert.equal(notifyScript({...config,enabled:false}), '');
assert.throws(()=>notifyScript({...config,serviceUrl:'http://notify.example'}));
assert.throws(()=>notifyScript({...config,games:[{...config.games[0],path:'//evil.test'}]}));
assert.ok(!notifyScript({...config,games:[{...config.games[0],name:'</script>$&'}]}).includes('</script>'));

const privacySource=readFileSync(new URL('./legal.ts',import.meta.url),'utf8').split('<h2 id="reminders">')[1].split('<h2>Hosting')[0];
assert.ok(privacySource.replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length<=280);
assert.ok(privacySource.includes('We choose the delivery time; you choose the games.'));
assert.ok(!privacySource.includes('reminder hour'));
class Element {
 children:Element[]=[];textContent='';hidden=false;id='';name='';value='';checked=false;disabled=false;type='';className='';open=false;isConnected=true;autofocus=false;attrs:Record<string,string>={};listeners:Record<string,Function>={};onclick?:()=>Promise<void>|void;
 constructor(public tag:string){}
 appendChild(el:Element){this.children.push(el);return el;}
 replaceChildren(){this.children=[];}
 setAttribute(k:string,v:string){this.attrs[k]=v;}
 addEventListener(k:string,fn:Function){this.listeners[k]=fn;}
 showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}remove(){this.isConnected=false;}focus(){}
 querySelectorAll(selector:string):Element[]{return this.all().filter(e=>selector==='button'?e.tag==='button':false);}
 all():Element[]{return this.children.flatMap(c=>[c,...c.all()]);}
}
function harness(options:{storage?:Map<string,string>;blocked?:boolean;permission?:string;initialPermission?:string;deleteFails?:boolean;native?:boolean;capable?:boolean;zone?:string;patchFails?:boolean;patchHook?:(body:any)=>Promise<boolean>;stats?:boolean;nativeState?:unknown;ios?:boolean;standalone?:boolean;ua?:string;path?:string}={}){
 const root=new Element('section');root.id='sw-notify';root.hidden=true;
 const statsRoot=new Element('section');statsRoot.id='sw-notify-stats';
 const guide=new Element('dialog');guide.id='sw-install-guide';const help=new Element('details');help.id='sw-install-browser-help';const field=new Element('input');field.id='sw-install-page-link';guide.appendChild(help);guide.appendChild(field);
 const storage=options.storage??new Map<string,string>();let permissionCalls=0,workerCalls=0,unsubscribed=0;
 const requests:any[]=[],events:any[]=[],handlers:Record<string,Function>={};
 const native=options.native!==false;
 const bridge={...(options.nativeState?{getReminderState:async()=>options.nativeState}:{}),requestPermissionAndToken:()=>{permissionCalls++;return Promise.resolve({permission:options.permission??'granted',token:'a'.repeat(64)});}};
 const credential={toJSON:()=>({endpoint:'https://fcm.googleapis.com/test',keys:{}}),unsubscribe:async()=>{unsubscribed++;}};
 const reg={pushManager:{getSubscription:async()=>null,subscribe:async()=>credential}};
 const notification={permission:options.initialPermission??'default',requestPermission:()=>{permissionCalls++;notification.permission=options.permission??'granted';return Promise.resolve(notification.permission);}};
 const window:any={isSecureContext:true,matchMedia:()=>({matches:!!options.standalone}),PushManager:options.capable===false?undefined:{},Notification:notification,addEventListener:(key:string,fn:Function)=>handlers[key]=fn,...(native&&options.capable!==false?{ScorewitNativeNotifications:bridge}:{})};
 const all=()=>[root,...root.all(),guide,...guide.all(),...(options.stats?[statsRoot,...statsRoot.all()]:[])];
 const document={getElementById:(id:string)=>all().find(e=>e.id===id)??null,createElement:(tag:string)=>new Element(tag),createTextNode:(s:string)=>{const e=new Element('#text');e.textContent=s;return e;},querySelectorAll:(s:string)=>all().filter(e=>s==='button'&&e.tag==='button')};
 const sandbox={window,document,Notification:notification,navigator:{language:'en-US',userAgent:options.ua||(options.ios?'iPhone Version/17 Safari/605':'Android'),standalone:options.standalone,serviceWorker:{register:async()=>{workerCalls++;return reg;},ready:Promise.resolve(reg),getRegistration:async()=>reg}},localStorage:{getItem:(key:string)=>{if(options.blocked)throw Error();return storage.get(key)??null;},setItem:(key:string,value:string)=>{if(options.blocked)throw Error();storage.set(key,value);},removeItem:(key:string)=>storage.delete(key)},fetch:async(url:string,args:any)=>{requests.push({url,args});if((args.method==='DELETE'&&options.deleteFails)||(args.method==='PATCH'&&(options.patchFails||options.patchHook&&!(await options.patchHook(JSON.parse(args.body))))))return{ok:false,status:503};if(url.endsWith('/status'))return{ok:true,status:200,json:async()=>({packs:['f1','worldcup'],transports:['webpush','apns'],timing:{name:'evening',targetHour:18,hint:'Sent around 6 PM your time.'}})};return{ok:true,status:args.method==='POST'?201:204,json:async()=>({id:'i'.repeat(32),secret:'s'.repeat(43)})};},location:{origin:'https://www.scorewit.com',href:'https://www.scorewit.com'+(options.path||'/f1')+'?src=push',pathname:options.path||'/f1'},history:{state:null,replaceState:()=>{}},URL,AbortSignal,Intl:options.zone?{DateTimeFormat:()=>({resolvedOptions:()=>({timeZone:options.zone})})}:Intl,Date,Uint8Array,atob:(v:string)=>Buffer.from(v,'base64').toString('binary'),track:(...args:any[])=>events.push(args)};
 vm.runInNewContext(notifyScript(config),sandbox);
 const click=async(label:string)=>{const el=all().find(e=>e.tag==='button'&&(e.textContent===label||e.attrs['aria-label']===label));assert.ok(el,label+' exists');assert.equal(el.disabled,false,label+' enabled');await el.onclick?.();await flush();};
 return{root,statsRoot,guide,help,window,storage,requests,events,handlers,click,all,text:()=>all().map(e=>e.textContent).join(' '),permissionCalls:()=>permissionCalls,workerCalls:()=>workerCalls,unsubscribed:()=>unsubscribed};
}
const flush=()=>new Promise(r=>setImmediate(r));
const onStorage=()=>new Map([['scorewit.reminders.v1',JSON.stringify({id:'i'.repeat(32),secret:'s'.repeat(43),games:['f1'],hour:21,tz:'UTC'})]]);
async function main(){
 const h=harness({zone:'UTC'});await flush();assert.equal(h.root.hidden,true);assert.equal(h.requests.length,0);assert.equal(h.permissionCalls(),0);
 h.window.scorewitNotify.update(true,'2026-09-30');await flush();assert.equal(h.root.hidden,false);assert.equal(h.permissionCalls(),0);assert.equal(h.storage.get('scorewit.reminderOfferShown'),'1');
 await h.click('Reminders');assert.equal(h.permissionCalls(),1);assert.equal(h.workerCalls(),0);assert.ok(h.storage.has('scorewit.reminders.v1'));
 const post=JSON.parse(h.requests.find(r=>r.args.method==='POST').args.body);assert.equal(post.transport,'apns');assert.deepEqual(post.games,['f1']);assert.ok(!('hour' in post));assert.ok(h.events.some(e=>e[0]==='reminders_on'&&e[1].games===1));
 await h.click('Reminders');assert.ok(!h.storage.has('scorewit.reminders.v1'));assert.ok(h.storage.has('scorewit.reminderPreferences'));assert.ok(h.events.some(e=>e[0]==='reminders_off'));assert.ok(h.text().includes('No reminders. Your sports are saved for next time.'));
 const earlyStats=harness({native:false,stats:true});earlyStats.window.scorewitNotify.settings();await flush();assert.ok(earlyStats.all().some(e=>e.attrs.role==='switch'&&!e.disabled));assert.equal(earlyStats.permissionCalls(),0);
 const offStats=harness({native:false,stats:true,storage:new Map([['scorewit.remindersOff','1'],['scorewit.remindersDeclinedUntil',String(Date.now()+86400000)]])});offStats.window.scorewitNotify.settings();await flush();assert.ok(offStats.all().some(e=>e.attrs.role==='switch'&&!e.disabled),'old decline never blocks re-enable');
 const dismissed=harness({native:false,permission:'default'});dismissed.window.scorewitNotify.update(true,'d');await flush();await dismissed.click('Reminders');assert.ok(dismissed.text().includes('Reminders stay off until you allow notifications.'));assert.ok(!dismissed.storage.has('scorewit.remindersDeclinedUntil'));assert.equal(dismissed.requests.filter(r=>r.args.method==='POST').length,0);
 const denied=harness({native:false,permission:'denied'});denied.window.scorewitNotify.update(true,'d');await flush();await denied.click('Reminders');assert.ok(denied.text().includes('Notifications are blocked for this site. Allow them in your browser settings, then reload.'));assert.ok(denied.all().find(e=>e.attrs.role==='switch')?.disabled);
 const blocked=harness({blocked:true});blocked.window.scorewitNotify.update(true,'d');await flush();assert.ok(blocked.text().includes('Your browser must allow site storage so you can manage or turn off reminders.'));assert.ok(blocked.all().find(e=>e.attrs.role==='switch')?.disabled);assert.equal(blocked.permissionCalls(),0);
 const web=harness({native:false,zone:'UTC'});web.window.scorewitNotify.update(true,'d');await flush();await web.click('Reminders');assert.equal(web.workerCalls(),1);assert.equal(JSON.parse(web.requests.find(r=>r.args.method==='POST').args.body).transport,'webpush');
 const failedDelete=harness({zone:'UTC',stats:true,storage:web.storage,deleteFails:true});await flush();await failedDelete.click('Reminders');assert.ok(failedDelete.storage.has('scorewit.reminders.v1'));assert.ok(failedDelete.text().includes('Stopping…'));assert.ok(failedDelete.text().includes('Turning off, will retry'));assert.ok(failedDelete.all().filter(e=>e.attrs['aria-pressed']).every(e=>e.disabled));
 const retained=JSON.parse(failedDelete.storage.get('scorewit.reminders.v1')!);retained.nextAttemptAt=0;failedDelete.storage.set('scorewit.reminders.v1',JSON.stringify(retained));const retryDelete=harness({zone:'UTC',storage:failedDelete.storage});await flush();assert.ok(!retryDelete.storage.has('scorewit.reminders.v1'));assert.equal(retryDelete.requests[0].args.method,'DELETE');
 const unsupported=harness({native:false,capable:false});unsupported.window.scorewitNotify.update(true,'d');await flush();assert.equal(unsupported.root.hidden,true);assert.equal(unsupported.requests.length,0);
 const countStorage=new Map<string,string>();for(const [round,visible,count] of [['one',true,'1'],['one',true,'1'],['two',true,'2'],['three',true,'3'],['four',false,'3']] as const){const c=harness({storage:countStorage});c.window.scorewitNotify.update(true,round);await flush();assert.equal(!c.root.hidden,visible);assert.equal(countStorage.get('scorewit.reminderOfferShown'),count);}
 const changed=harness();changed.window.scorewitNotify.update(true,'one');await flush();await changed.click('Change');await changed.click('World Cup');assert.equal(changed.requests.filter(r=>r.args.method==='PATCH'||r.args.method==='POST').length,0);const afterChange=harness({storage:changed.storage});afterChange.window.scorewitNotify.update(true,'two');await flush();assert.equal(afterChange.root.hidden,true);
 for(const ua of ['iPhone Version/17 Safari/605','iPhone Instagram','iPhone CriOS/130']){const ios=harness({native:false,ios:true,capable:false,ua,stats:true});await flush();assert.ok(ios.text().includes('Reminders need Scorewit on your Home Screen. It takes a few seconds.'));await ios.click('Show me how');assert.equal(ios.guide.open,true);assert.equal(ios.help.open,!ua.includes('Version'));assert.equal(ios.requests.length,0);}
 const installed=harness({native:false,ios:true,standalone:true,stats:true});await flush();assert.ok(installed.all().some(e=>e.attrs.role==='switch'));assert.ok(!installed.text().includes('Show me how'));
 const last=harness({stats:true,zone:'UTC',storage:onStorage()});await flush();await last.click('Racing');assert.ok(last.all().some(e=>e.tag==='dialog'&&e.open));await last.click('Keep Racing');assert.ok(last.storage.has('scorewit.reminders.v1'));await last.click('Racing');await last.click('Turn off');assert.ok(!last.storage.has('scorewit.reminders.v1'));
 const badSave=harness({stats:true,zone:'UTC',storage:onStorage(),patchFails:true});await flush();await badSave.click('World Cup');assert.ok(badSave.text().includes("Couldn't save. Your last selection is back."));assert.equal(badSave.all().find(e=>e.attrs['aria-label']==='World Cup')?.attrs['aria-pressed'],'false');assert.ok(badSave.all().some(e=>e.textContent==='Retry'));
 let release:(ok:boolean)=>void=()=>{};let first=true;const serial=harness({stats:true,zone:'UTC',storage:onStorage(),patchHook:()=>first?(first=false,new Promise<boolean>(r=>release=r)):Promise.resolve(true)});await flush();await serial.click('World Cup');await serial.click('Racing');release(false);await flush();await flush();assert.deepEqual(JSON.parse(serial.storage.get('scorewit.reminders.v1')!).games,['worldcup']);assert.equal(serial.requests.filter(r=>r.args.method==='PATCH').length,2);assert.ok(serial.text().includes('All changes saved'));
 const newer={id:'n'.repeat(32),secret:'s'.repeat(43),games:['f1'],tz:'UTC'};const oldPending=harness({zone:'UTC',storage:new Map([['scorewit.reminders.v1',JSON.stringify(newer)]]),nativeState:{id:'o'.repeat(32),token:'stop1.'+(Math.floor(Date.now()/1000)+1209600)+'.'+'t'.repeat(43),pending:true}});await flush();assert.equal(JSON.parse(oldPending.storage.get('scorewit.reminders.v1')!).id,newer.id);
 const hub=harness({path:'/'});assert.ok(hub.events.some(e=>e[0]==='push_opened'&&e[1].pack==='hub'));
 assert.ok(notifyScript(config).includes('Sent around 6 PM your time.'));
 const worker=notificationWorker(['/f1','/worldcup'],'https://notify.example');assert.ok(!/caches\.|CacheStorage|addEventListener\(['"]fetch/.test(worker));
 const listeners:Record<string,Function>={};let shown=0,opened=0;
 vm.runInNewContext(worker,{self:{location:{origin:'https://www.scorewit.com'},addEventListener:(n:string,fn:Function)=>listeners[n]=fn,registration:{showNotification:async()=>shown++},clients:{matchAll:async()=>[],openWindow:async()=>opened++}},URL,Intl,Date,AbortSignal,fetch:async()=>({ok:true})});
 async function push(payload:any){let pending:Promise<any>|undefined;listeners.push({data:{json:()=>payload},waitUntil:(p:Promise<any>)=>pending=p});await pending;}
 const payload={title:'Racing',body:'A ready round',url:'https://www.scorewit.com/f1?src=push',date:new Date().toISOString().slice(0,10),tz:'UTC',stop:{id:'i'.repeat(32),token:'stop1.1791676800.'+'s'.repeat(43)}};
 await push(payload);await push({...payload,url:'https://www.scorewit.com/?src=push'});assert.equal(shown,2);await push({...payload,date:'2000-01-01'});await push({...payload,url:'https://evil.example/f1?src=push'});await push({...payload,url:'https://www.scorewit.com/privacy?src=push'});assert.equal(shown,2);
 let pending:Promise<any>|undefined;listeners.notificationclick({notification:{close:()=>{},data:{url:payload.url}},waitUntil:(p:Promise<any>)=>pending=p});await pending;assert.equal(opened,1);
 pending=undefined;listeners.notificationclick({action:'stop',notification:{close:()=>{},data:{url:payload.url,stop:payload.stop}},waitUntil:(p:Promise<any>)=>pending=p});await pending;assert.equal(opened,1,'Turn Off never opens the game');
 const stateConfig={pack:'f1',cadence:'nightly' as const,gamePaths:['/f1']};
 assert.throws(()=>notificationState(stateConfig,{questions:[]},'2026-09-26',''));
 const seed={pack:'f1',builtOn:'2026-09-26',cadence:'weekly' as const};
 // Selector changes by date: validation must catch the gap rather than trust
 // a healthy bank or merely test the first/last date.
 const sample=Array.from({length:6},(_,i)=>({id:String(i),text:'Question '+i,answer:i}));
 const html=(badDate?:string)=>'const BANK = '+JSON.stringify(sample)+';\nfunction selectDaily(bank,date){return date==='+JSON.stringify(badDate??'never')+'?bank.slice(0,5):bank;}\n// ---- ported from src/game/scoring.ts ----';
 assert.equal(validateNotificationState(seed,html()).readyThrough,'2026-10-04');
 assert.equal(validateNotificationState(seed,html('2026-09-29')).readyThrough,'2026-09-28');
 assert.throws(()=>validateNotificationState(seed,html('2026-09-27')),/at least the next day/);
 assert.throws(()=>validateNotificationState({...seed,readyThrough:'2026-10-05'},html()),/disagrees/);
 assert.throws(()=>validateNotificationState({...seed,builtOn:'2026-02-30'},html()));
 assert.throws(()=>validateNotificationState(seed,'<html>no selector</html>'));
 assert.equal(validateNotificationState({...seed,cadence:'nightly'},html()).readyThrough,'2026-09-28');
 assert.equal(validateNotificationState({...seed,cadence:'three-a-week'},html()).readyThrough,'2026-09-30');
 // The only arrival-side request for an existing subscriber is a zone-only
 // PATCH. Re-renders do not repeat it, and the next visit sees the saved zone.
 const saved={id:'i'.repeat(32),secret:'s'.repeat(43),games:['f1'],hour:9,tz:'Europe/London'};
 const zoneStorage=new Map([['scorewit.reminders.v1',JSON.stringify(saved)]]);
 const zone=harness({storage:zoneStorage,zone:'America/Los_Angeles'});await flush();
 zone.window.scorewitNotify.update(false);zone.window.scorewitNotify.update(false);await flush();
 assert.equal(zone.requests.length,1);assert.equal(zone.requests[0].args.method,'PATCH');assert.deepEqual(JSON.parse(zone.requests[0].args.body),{tz:'America/Los_Angeles'});assert.equal(zone.permissionCalls(),0);assert.equal(zone.workerCalls(),0);
 assert.equal(JSON.parse(zoneStorage.get('scorewit.reminders.v1')!).tz,'America/Los_Angeles');
 const revisited=harness({storage:zoneStorage,zone:'America/Los_Angeles'});await flush();assert.equal(revisited.requests.length,0);
 const failedZone=harness({storage:zoneStorage,zone:'Pacific/Auckland',patchFails:true});await flush();failedZone.window.scorewitNotify.update(false);await flush();assert.equal(failedZone.requests.length,1);assert.equal(JSON.parse(zoneStorage.get('scorewit.reminders.v1')!).tz,'America/Los_Angeles');
 const retryZone=harness({storage:zoneStorage,zone:'Pacific/Auckland'});await flush();assert.equal(retryZone.requests.length,1);assert.equal(JSON.parse(zoneStorage.get('scorewit.reminders.v1')!).tz,'Pacific/Auckland');
 const unsubscribedZone=harness({zone:'Europe/London'});await flush();assert.equal(unsubscribedZone.requests.length,0);
 console.log('Notification opt-in, consent, lifecycle, privacy, worker and readiness checks passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
