import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installHead, installedHubHead, renderInstallCard, type InstallDestinations, type InstallPromoConfig } from './render/install';
import { assertPublishedManifestIdentity, PUBLISHED_MANIFEST_IDS } from './manifest';

const config: InstallPromoConfig = { appName: 'Example', markUrl: 'data:image/svg+xml;base64,PHN2Zy8+', eyebrow: 'TRY IT', title: 'One tap', body: 'All games', gamePath: '/example' };
const unwrap = (s: string) => s.replace(/^<script>\n|\n<\/script>$/g, '');
const destinations: InstallDestinations = {
  android: {kind:'native',label:'Install'},
  ios: {kind:'manual',label:'Add to Home Screen'},
  desktop: {kind:'native',label:'Install',body:'Install for quick access.'},
};
const safariUA='Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1';
function harness(storage = new Map<string,string>(), standalone = false, blocked = false,
  options: { config?: InstallPromoConfig; navigator?: Record<string,unknown>; copyFails?: boolean; native?: boolean } = {}) {
  const handlers: Record<string, Array<(e?: any) => void>> = {};
  const on = (name: string, fn: (e?: any) => void) => (handlers[name] ??= []).push(fn);
  const fire = (name: string, event?: any) => handlers[name]?.forEach(fn => fn(event));
  const elements = ['arrival', 'result', 'hub'].map(placement => ({ dataset: { installPlacement: placement }, hidden: true }));
  const add = { dataset: { installAction: 'add' }, disabled: false };
  const mode = { matches: standalone, addEventListener: on };
  let navigated: string|null=null, copied: string|null=null,focused=false,selected=false;
  const nodes: Record<string,any> = {};
  for(const id of ['sw-install-browser-help','sw-install-page-link','sw-install-copy-status']) nodes[id]={open:false,value:'',textContent:'',focus:()=>focused=true,select:()=>selected=true};
  const dialog={open:false,showModal:()=>{dialog.open=true;},close:()=>{dialog.open=false;fire('guide-close');},addEventListener:(_name:string,fn:()=>void)=>on('guide-close',fn)};
  nodes['sw-install-guide']=dialog;
  const label={textContent:''},copy={textContent:''};
  const window: any = { addEventListener: on, matchMedia: () => mode, ...(options.native?{Capacitor:{isNativePlatform:()=>true}}:{}) };
  const sandbox: any = { window, navigator: {clipboard:{writeText:async(s:string)=>{if(options.copyFails)throw Error('denied');copied=s;}},...options.navigator},
    location:{origin:'https://example.test',assign:(s:string)=>navigated=s},
    document: { addEventListener: on, getElementById:(id:string)=>nodes[id]??null,querySelector:()=>null,
    querySelectorAll: (s: string) => s === '[data-install-placement]' ? elements : s==='[data-install-label]'?[label]:s==='[data-install-copy]'?[copy]:[add] },
    localStorage: { getItem: (k: string) => { if(blocked)throw Error('blocked');return storage.get(k) ?? null; },
      setItem: (k: string,v: string) => { if(blocked)throw Error('blocked');storage.set(k,v); } } };
  vm.runInNewContext(unwrap(installHead(options.config??config)), sandbox);
  const click = (action: string) => fire('click', { target: { closest: () => ({ dataset: { installAction: action } }) } });
  function offer(outcome = 'dismissed', fail = false) {
    let prompts = 0, prevented = 0;
    fire('beforeinstallprompt', { preventDefault: () => prevented++, prompt: () => { prompts++;if(fail)throw Error('expired');return Promise.resolve(); }, userChoice: Promise.resolve({ outcome }) });
    return { prompts: () => prompts, prevented: () => prevented };
  }
  fire('DOMContentLoaded');
  return { fire, elements, click, offer, mode, storage, dialog, nodes, label, copy,
    navigated:()=>navigated,copied:()=>copied,selected:()=>selected&&focused,api: window.scorewitInstall };
}
async function main() {
  const h = harness();
  h.api.update({arrival:true,result:false});
  assert.ok(h.elements.every(el=>el.hidden), 'unsupported/ineligible browser gets no button');
  const event = h.offer();
  assert.equal(event.prevented(),1);assert.equal(event.prompts(),0, 'no automatic native prompt');
  assert.equal(h.elements[0].hidden,false);assert.equal(h.elements[1].hidden,true);
  h.api.update({arrival:false,result:false});assert.ok(h.elements.slice(0,2).every(el=>el.hidden), 'never inside a question');
  h.api.update({arrival:false,result:true});assert.equal(h.elements[1].hidden,false);
  h.click('dismiss');assert.equal(h.elements[1].hidden,true);assert.equal(h.elements[2].hidden,true);
  const sibling=harness(h.storage);sibling.offer();sibling.api.update({arrival:false,result:true});
  assert.equal(sibling.elements[1].hidden,true, 'cooldown survives navigation between games');
  sibling.api.update({arrival:true,result:false});assert.equal(sibling.elements[0].hidden,false, 'quiet voluntary retry');
  sibling.api.played();assert.equal(sibling.elements[0].hidden,true, 'first answer hides arrival action immediately');
  h.click('add');h.click('add');assert.equal(event.prompts(),1,'one prompt per event, double taps safe');
  await new Promise(resolve=>setImmediate(resolve));assert.ok(h.elements.every(el=>el.hidden));
  h.api.played();assert.equal(JSON.parse(h.storage.get('scorewit.lastPlayed')!).path,'/example');
  const success=harness();success.api.update({arrival:true,result:false});const accepted=success.offer('accepted');
  success.click('add');await new Promise(resolve=>setImmediate(resolve));assert.equal(accepted.prompts(),1);
  assert.ok(success.elements.every(el=>el.hidden));assert.ok(success.storage.has('scorewit.installAccepted'));
  const fresh=success.offer();assert.equal(success.elements[0].hidden,false, 'new native eligibility allows a reinstall');
  success.fire('appinstalled');assert.ok(success.elements.every(el=>el.hidden));success.click('add');assert.equal(fresh.prompts(),0);
  const failed=harness();failed.api.update({arrival:true,result:false});const expired=failed.offer('dismissed',true);failed.click('add');
  await new Promise(resolve=>setImmediate(resolve));assert.equal(expired.prompts(),1);assert.ok(failed.elements.every(el=>el.hidden));
  failed.offer();assert.equal(failed.elements[0].hidden,false,'new event recovers after prompt failure');
  failed.fire('storage',{key:'scorewit.installAccepted',newValue:'1'});assert.ok(failed.elements.every(el=>el.hidden));
  const installed=harness(new Map(),true);installed.offer();installed.api.update({arrival:true,result:true});installed.click('add');assert.ok(installed.elements.every(el=>el.hidden));
  installed.mode.matches=false;installed.fire('change');assert.equal(installed.elements[0].hidden,false);
  installed.mode.matches=true;installed.fire('pageshow');assert.ok(installed.elements.every(el=>el.hidden));
  const denied=harness(new Map(),false,true);denied.offer();denied.api.update({arrival:false,result:true});denied.click('dismiss');denied.api.played();assert.ok(denied.elements.every(el=>el.hidden),'storage denial is nonfatal');
  const old=harness(new Map([['scorewit.installDismissedUntil','1']]));old.offer();assert.equal(old.elements[2].hidden,false,'expired cooldown is eligible');
  assert.ok(renderInstallCard({...config,title:'A < B',body:'"quoted"'},'hub').includes('A &lt; B'));
  assert.throws(()=>renderInstallCard({...config,markUrl:'javascript:alert(1)'},'hub'));
  assert.throws(()=>installHead({...config,gamePath:'//evil.test'}));

  const literalCopy=harness(new Map(),false,false,{config:{...config,body:'Keep $& literal </script>'}});literalCopy.offer();assert.equal(literalCopy.copy.textContent,'Keep $& literal </script>');
  const platformConfig={...config,destinations};
  const nativeApp=harness(new Map(),false,false,{config:platformConfig,navigator:{userAgent:safariUA},native:true});nativeApp.api.update({arrival:true,result:true});assert.ok(nativeApp.elements.every(el=>el.hidden),'native app must not offer web installation');
  const iphone=harness(new Map(),false,false,{config:platformConfig,navigator:{userAgent:safariUA}});
  iphone.api.update({arrival:true,result:false});assert.equal(iphone.elements[0].hidden,false,'iOS requires no fake native event');
  assert.equal(iphone.label.textContent,'Add to Home Screen');
  iphone.click('add');assert.equal(iphone.dialog.open,true);assert.equal(iphone.nodes['sw-install-browser-help'].open,false);
  assert.equal(iphone.nodes['sw-install-page-link'].value,'https://example.test/example','copies game root, no query or tracking data');
  iphone.click('close-guide');assert.equal(iphone.dialog.open,false);assert.ok(!iphone.storage.has('scorewit.installDismissedUntil'));
  iphone.click('add');iphone.click('done-guide');assert.equal(iphone.dialog.open,false);assert.equal(iphone.elements[2].hidden,true);
  assert.ok(!iphone.storage.has('scorewit.installAccepted'),'reading instructions never claims installation');
  const otherGame=harness(iphone.storage,false,false,{config:platformConfig,navigator:{userAgent:safariUA}});
  assert.equal(otherGame.elements[2].hidden,true,'manual dismissal also applies to the next game');
  const iosChrome=harness(new Map(),false,false,{config:platformConfig,navigator:{userAgent:safariUA.replace('Version/26.0','CriOS/140.0')}});
  iosChrome.click('add');assert.equal(iosChrome.nodes['sw-install-browser-help'].open,true);
  iosChrome.click('copy-link');await new Promise(resolve=>setImmediate(resolve));assert.equal(iosChrome.copied(),'https://example.test/example');
  const clipboardDenied=harness(new Map(),false,false,{config:platformConfig,navigator:{userAgent:safariUA.replace('Version/26.0','Instagram')},copyFails:true});
  clipboardDenied.click('add');clipboardDenied.click('copy-link');await new Promise(resolve=>setImmediate(resolve));
  assert.ok(clipboardDenied.selected());assert.match(clipboardDenied.nodes['sw-install-copy-status'].textContent,/Touch and hold/);
  const ipad=harness(new Map(),false,false,{config:platformConfig,navigator:{userAgent:'Mozilla/5.0 (Macintosh) Version/26.0 Safari/605.1.15',platform:'MacIntel',maxTouchPoints:5}});
  assert.equal(ipad.elements[2].hidden,false);assert.equal(ipad.label.textContent,'Add to Home Screen');
  ipad.mode.matches=true;ipad.fire('change');assert.ok(ipad.elements.every(el=>el.hidden));
  ipad.mode.matches=false;ipad.fire('change');assert.equal(ipad.elements[2].hidden,true,'observed standalone use suppresses manual cards later');
  ipad.api.update({arrival:true,result:false});assert.equal(ipad.elements[0].hidden,false,'voluntary retry remains available');
  const manualDenied=harness(new Map(),false,true,{config:platformConfig,navigator:{userAgent:safariUA}});
  manualDenied.click('add');manualDenied.click('done-guide');assert.equal(manualDenied.elements[2].hidden,true);
  const android=harness(new Map(),false,false,{config:platformConfig,navigator:{userAgent:'Mozilla/5.0 (Linux; Android 16) Chrome/140'}});
  assert.equal(android.elements[2].hidden,true);android.offer();assert.equal(android.elements[2].hidden,false);assert.equal(android.label.textContent,'Install');
  const desktop=harness(new Map(),false,false,{config:platformConfig,navigator:{userAgent:'Mozilla/5.0 Macintosh Version/26.0 Safari/605.1.15',platform:'MacIntel',maxTouchPoints:0}});
  assert.equal(desktop.elements[2].hidden,true);desktop.offer();assert.equal(desktop.copy.textContent,'Install for quick access.');
  const play={kind:'store' as const,label:'View on Google Play',body:'Find Example on Google Play.',url:'https://play.google.com/store/apps/details?id=test.example'};
  const apple={kind:'store' as const,label:'View in App Store',body:'Find Example in the App Store.',url:'https://apps.apple.com/us/app/example/id123456789'};
  for(const [ua,platform,listing] of [['Android','android',play],[safariUA,'ios',apple]] as const){
    const store=harness(new Map(),false,false,{config:{...platformConfig,destinations:{...destinations,[platform]:listing}},navigator:{userAgent:ua}});
    assert.equal(store.elements[2].hidden,false);assert.equal(store.label.textContent,listing.label);assert.equal(store.copy.textContent,listing.body);
    const ignored=store.offer();assert.equal(ignored.prevented(),0,'future store route does not hijack native store banner');
    assert.equal(store.navigated(),null,'no automatic store navigation');store.click('add');assert.equal(store.navigated(),listing.url);
    assert.ok(!store.storage.has('scorewit.installAccepted'),'store click is not an installation');
  }
  for(const url of ['http://play.google.com/store/apps/details?id=x','https://evil.test/store/apps/details?id=x','https://play.google.com/store/apps/details','https://user:pw@play.google.com/store/apps/details?id=x']) {
    assert.throws(()=>installHead({...platformConfig,destinations:{...destinations,android:{...play,url}}}));
  }
  assert.throws(()=>installHead({...platformConfig,destinations:{...destinations,ios:play}}));
  assert.throws(()=>installHead({...platformConfig,destinations:{...destinations,android:{...play,body:''}}}));
  assert.ok(renderInstallCard(platformConfig,'hub').includes('<dialog'));
  assert.ok(!renderInstallCard(config,'hub').includes('<dialog'),'native-only consumers do not get the manual sheet');
  assert.ok(!installHead(platformConfig).includes('test.example'),'test listings never enter real config');

  const hubCode=unwrap(installedHubHead([{path:'/one',prefix:'one'},{path:'/two',prefix:'two'}]));
  function launch(values: Record<string,unknown>, opts: { standalone?: boolean;search?: string;hash?:string;referrer?:string;blocked?:boolean }={}) {
    let destination: string|null=null;
    vm.runInNewContext(hubCode,{window:{matchMedia:()=>({matches:opts.standalone??true})},navigator:{},URL,URLSearchParams,
      document:{referrer:opts.referrer??''},location:{origin:'https://example.test',search:opts.search??'',hash:opts.hash??'',replace:(s:string)=>destination=s},
      localStorage:{getItem:(k:string)=>{if(opts.blocked)throw Error('blocked');return JSON.stringify(values[k]??null);}}});
    return destination;
  }
  const pointer={'scorewit.lastPlayed':{path:'/two',at:Date.now()-1000}};
  assert.equal(launch(pointer),'/two');assert.equal(launch(pointer,{standalone:false}),null);
  assert.equal(launch(pointer,{search:'?games=1'}),null);assert.equal(launch(pointer,{hash:'#grid'}),null);
  assert.equal(launch(pointer,{referrer:'https://example.test/one'}),null);
  assert.equal(launch(pointer,{blocked:true}),null);
  assert.equal(launch({'scorewit.lastPlayed':{path:'https://evil.test',at:1}}),null,'stored path is allowlisted');
  assert.equal(launch({'one.history':{'2026-09-25':{grid:[1]}}}),'/one');
  assert.equal(launch({'one.history':{'2026-09-25':{grid:[1]}},'two.progress':{date:'2026-09-26',results:[1]}}),'/two');
  assert.equal(launch({'one.history':{'2026-09-25':{grid:[1]}},'two.history':{'2026-09-25':{grid:[1]}}}),null,'ambiguous old saves stay at hub');
  assert.equal(launch({'one.progress':{date:'2026-09-26',results:[]}}),null,'opening a game is not playing');
  for (const [path,id] of Object.entries(PUBLISHED_MANIFEST_IDS)) {
    assert.doesNotThrow(()=>assertPublishedManifestIdentity(path,{id}));
    assert.throws(()=>assertPublishedManifestIdentity(path,{}),/locked/);
    assert.throws(()=>assertPublishedManifestIdentity(path,{id:id==='/'?'/new':id.endsWith('/')?id.slice(0,-1):id+'/'}),/locked/);
  }
  assert.throws(()=>assertPublishedManifestIdentity('/unknown/manifest.webmanifest',{id:'/'}),/Unregistered/);
  console.log('install: platform routing, Safari guidance, store URL validation, native eligibility, cooldown, lifecycle, local state, installed navigation and all eight identity locks pass');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
