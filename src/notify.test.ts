import assert from 'node:assert/strict';
import vm from 'node:vm';
import { notifyScript, notificationWorker, type NotifyConfig } from './render/notify';
import { notificationState, validateNotificationState } from './notification-state';

const config: NotifyConfig = { enabled:true,serviceUrl:'https://notify.example',vapidPublicKey:Buffer.alloc(65,4).toString('base64url'),pack:'f1',appVersion:'1.0.0',platforms:['webpush','apns'],games:[{pack:'f1',name:'Racing',path:'/f1',storagePrefix:'racing'},{pack:'worldcup',name:'World Cup',path:'/worldcup',storagePrefix:'soccer'}] };
assert.equal(notifyScript(), '');assert.equal(notifyScript({...config,enabled:false}), '');
assert.throws(()=>notifyScript({...config,serviceUrl:'http://notify.example'}));
assert.throws(()=>notifyScript({...config,games:[{...config.games[0],path:'//evil.test'}]}));
assert.ok(!notifyScript({...config,games:[{...config.games[0],name:'</script>$&'}]}).includes('</script>'));

class Element {
 children:Element[]=[];textContent='';hidden=false;id='';name='';value='';checked=false;disabled=false;type='';onclick?:()=>Promise<void>|void;
 constructor(public tag:string){}
 appendChild(el:Element){this.children.push(el);return el;}
 replaceChildren(){this.children=[];}
 setAttribute(){}
 querySelectorAll(selector:string):Element[]{return this.all().filter(e=>selector==='button'?e.tag==='button':e.tag==='input'&&e.name==='sw-notify-game'&&e.checked);}
 all():Element[]{return this.children.flatMap(c=>[c,...c.all()]);}
}
function harness(options:{storage?:Map<string,string>;blocked?:boolean;permission?:string;deleteFails?:boolean;native?:boolean;capable?:boolean;zone?:string;patchFails?:boolean;stats?:boolean;nativeState?:unknown}={}){
 const root=new Element('section');root.id='sw-notify';root.hidden=true;
 const statsRoot=new Element('section');statsRoot.id='sw-notify-stats';
 const storage=options.storage??new Map<string,string>();let permissionCalls=0,workerCalls=0,unsubscribed=0;
 const requests:any[]=[],events:any[]=[],handlers:Record<string,Function>={};
 const native=options.native!==false;
 const bridge={...(options.nativeState?{getReminderState:async()=>options.nativeState}:{}),requestPermissionAndToken:()=>{permissionCalls++;return Promise.resolve({permission:options.permission??'granted',token:'a'.repeat(64)});}};
 const credential={toJSON:()=>({endpoint:'https://fcm.googleapis.com/test',keys:{}}),unsubscribe:async()=>{unsubscribed++;}};
 const reg={pushManager:{getSubscription:async()=>null,subscribe:async()=>credential}};
 const notification={permission:'default',requestPermission:()=>{permissionCalls++;return Promise.resolve(options.permission??'granted');}};
 const window:any={isSecureContext:true,PushManager:options.capable===false?undefined:{},Notification:notification,addEventListener:(key:string,fn:Function)=>handlers[key]=fn,...(native&&options.capable!==false?{ScorewitNativeNotifications:bridge}:{})};
 const document={getElementById:(id:string)=>[root,...root.all(),...(options.stats?[statsRoot,...statsRoot.all()]:[])].find(e=>e.id===id)??null,createElement:(tag:string)=>new Element(tag),createTextNode:(s:string)=>{const e=new Element('#text');e.textContent=s;return e;},querySelectorAll:(s:string)=>root.querySelectorAll(s)};
 const sandbox={window,document,Notification:notification,navigator:{language:'en-US',userAgent:'Android',serviceWorker:{register:async()=>{workerCalls++;return reg;},ready:Promise.resolve(reg),getRegistration:async()=>reg}},localStorage:{getItem:(key:string)=>{if(options.blocked)throw Error();return storage.get(key)??null;},setItem:(key:string,value:string)=>{if(options.blocked)throw Error();storage.set(key,value);},removeItem:(key:string)=>storage.delete(key)},fetch:async(url:string,args:any)=>{requests.push({url,args});if((args.method==='DELETE'&&options.deleteFails)||(args.method==='PATCH'&&options.patchFails))return{ok:false,status:503};if(url.endsWith('/status'))return{ok:true,status:200,json:async()=>({packs:['f1','worldcup'],transports:['webpush','apns']})};return{ok:true,status:args.method==='POST'?201:204,json:async()=>({id:'i'.repeat(32),secret:'s'.repeat(43)})};},location:{href:'https://www.scorewit.com/f1?src=push',pathname:'/f1'},history:{state:null,replaceState:()=>{}},URL,AbortSignal,Intl:options.zone?{DateTimeFormat:()=>({resolvedOptions:()=>({timeZone:options.zone})})}:Intl,Date,Uint8Array,atob:(v:string)=>Buffer.from(v,'base64').toString('binary'),track:(...args:any[])=>events.push(args)};
 vm.runInNewContext(notifyScript(config),sandbox);
 const click=async(label:string)=>{const el=root.all().find(e=>e.tag==='button'&&e.textContent===label);assert.ok(el,label+' exists');await el.onclick?.();};
 return{root,statsRoot,window,storage,requests,events,click,permissionCalls:()=>permissionCalls,workerCalls:()=>workerCalls,unsubscribed:()=>unsubscribed};
}
const flush=()=>new Promise(r=>setImmediate(r));
async function main(){
 const earlyStats=harness({stats:true});earlyStats.window.scorewitNotify.settings();await flush();assert.equal(earlyStats.root.hidden,true);assert.equal(earlyStats.statsRoot.all().some(e=>e.textContent==='Turn on reminders'),false,'Stats must never ask for arrival consent');
 const onStats=harness({stats:true,zone:'UTC',storage:new Map([['scorewit.reminders.v1',JSON.stringify({id:'i'.repeat(32),secret:'s'.repeat(43),games:['f1'],hour:9,tz:'UTC'})]])});onStats.window.scorewitNotify.settings();await flush();assert.equal(onStats.statsRoot.all().find(e=>e.tag==='button')?.textContent,'Turn off reminders','off comes before preferences without playing');assert.equal(onStats.root.hidden,true,'result controls do not duplicate Stats');
 const newer={id:'n'.repeat(32),secret:'s'.repeat(43),games:['f1'],hour:9,tz:'UTC'};
 const oldPending=harness({zone:'UTC',storage:new Map([['scorewit.reminders.v1',JSON.stringify(newer)]]),nativeState:{id:'o'.repeat(32),token:'stop1.'+(Math.floor(Date.now()/1000)+1209600)+'.'+'t'.repeat(43),pending:true}});await flush();
 assert.ok(oldPending.storage.has('scorewit.reminders.v1'),'old pending off cannot delete a new subscription');
 assert.equal(JSON.parse(oldPending.storage.get('scorewit.reminders.v1')!).id,newer.id,'old pending off cannot delete a new subscription');
 assert.equal(oldPending.requests[0].url,'https://notify.example/v1/subscriptions/'+'o'.repeat(32));assert.match(oldPending.requests[0].args.headers.Authorization,/Bearer stop1/);
 const h=harness();assert.equal(h.root.hidden,true);assert.equal(h.requests.length,0);assert.equal(h.permissionCalls(),0);assert.equal(h.events[0][0],'push_opened');assert.deepEqual(JSON.parse(JSON.stringify(h.events[0][1])),{pack:'f1'});
 h.window.scorewitNotify.update(false);await flush();assert.equal(h.requests.length,0,'no status request on arrival');
 h.window.scorewitNotify.update(true);await flush();assert.equal(h.root.hidden,false);assert.equal(h.permissionCalls(),0,'offer is not consent');
 await h.click('Turn on reminders');assert.equal(h.permissionCalls(),1);assert.equal(h.workerCalls(),0,'native bridge does not register a web worker');assert.ok(h.storage.has('scorewit.reminders.v1'));
 const post=h.requests.find(r=>r.args.method==='POST');assert.equal(JSON.parse(post.args.body).transport,'apns');assert.ok(!('locale' in JSON.parse(post.args.body)));assert.deepEqual(JSON.parse(post.args.body).games,['f1']);
 await h.click('Save preferences');assert.ok(h.requests.some(r=>r.args.method==='PATCH'&&r.args.headers.Authorization.startsWith('Bearer ')));
 await h.click('Turn off reminders');assert.ok(!h.storage.has('scorewit.reminders.v1'));assert.equal(h.root.hidden,true);
 const declined=harness({storage:h.storage});declined.window.scorewitNotify.update(true);await flush();assert.equal(declined.root.hidden,true,'decline is shared across games');
 const denied=harness({permission:'denied'});denied.window.scorewitNotify.update(true);await flush();await denied.click('Turn on reminders');assert.equal(denied.requests.filter(r=>r.args.method==='POST').length,0);assert.ok(denied.storage.has('scorewit.remindersDeclinedUntil'));
 const blocked=harness({blocked:true});blocked.window.scorewitNotify.update(true);await flush();await blocked.click('Turn on reminders');assert.equal(blocked.permissionCalls(),0,'must retain unsubscribe handle before requesting permission');
 const web=harness({native:false});web.window.scorewitNotify.update(true);await flush();await web.click('Turn on reminders');assert.equal(web.workerCalls(),1);assert.equal(JSON.parse(web.requests.find(r=>r.args.method==='POST').args.body).transport,'webpush');
 const failedDelete=harness({storage:web.storage,deleteFails:true});failedDelete.window.scorewitNotify.update(true);await flush();await failedDelete.click('Turn off reminders');assert.ok(failedDelete.storage.has('scorewit.reminders.v1'),'failed DELETE never discards management credentials');
 const retryDelete=harness({storage:failedDelete.storage});await flush();assert.ok(retryDelete.storage.has('scorewit.reminders.v1'),'backoff survives reload');
 const retained=JSON.parse(retryDelete.storage.get('scorewit.reminders.v1')!);retained.nextAttemptAt=0;retryDelete.storage.set('scorewit.reminders.v1',JSON.stringify(retained));
 const successfulRetry=harness({storage:retryDelete.storage});await flush();assert.ok(!successfulRetry.storage.has('scorewit.reminders.v1'),'reload retries pending off before any zone PATCH');assert.equal(successfulRetry.requests[0].args.method,'DELETE');
 const unsupported=harness({capable:false});unsupported.window.scorewitNotify.update(true);await flush();assert.equal(unsupported.root.hidden,true);assert.equal(unsupported.requests.length,0);
 h.window.scorewitNotify.update(false);assert.equal(h.root.hidden,true,'leaving results hides consent');
 const worker=notificationWorker(['/f1','/worldcup'],'https://notify.example');assert.ok(!/caches\.|CacheStorage|addEventListener\(['"]fetch/.test(worker));
 const listeners:Record<string,Function>={};let shown=0,opened=0;
 vm.runInNewContext(worker,{self:{location:{origin:'https://www.scorewit.com'},addEventListener:(n:string,fn:Function)=>listeners[n]=fn,registration:{showNotification:async()=>shown++},clients:{matchAll:async()=>[],openWindow:async()=>opened++}},URL,Intl,Date,AbortSignal,fetch:async()=>({ok:true})});
 async function push(payload:any){let pending:Promise<any>|undefined;listeners.push({data:{json:()=>payload},waitUntil:(p:Promise<any>)=>pending=p});await pending;}
 const payload={title:'Racing',body:'A ready round',url:'https://www.scorewit.com/f1?src=push',date:new Date().toISOString().slice(0,10),tz:'UTC',stop:{id:'i'.repeat(32),token:'stop1.1791676800.'+'s'.repeat(43)}};
 await push(payload);assert.equal(shown,1);await push({...payload,date:'2000-01-01'});await push({...payload,url:'https://evil.example/f1?src=push'});await push({...payload,url:'https://www.scorewit.com/privacy?src=push'});assert.equal(shown,1);
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
