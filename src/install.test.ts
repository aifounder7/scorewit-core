import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installHead, installedHubHead, renderInstallCard, type InstallPromoConfig } from './render/install';
import { assertPublishedManifestIdentity, PUBLISHED_MANIFEST_IDS } from './manifest';

const config: InstallPromoConfig = { appName: 'Example', markUrl: 'data:image/svg+xml;base64,PHN2Zy8+', eyebrow: 'TRY IT', title: 'One tap', body: 'All games', gamePath: '/example' };
const unwrap = (s: string) => s.replace(/^<script>\n|\n<\/script>$/g, '');
function harness(storage = new Map<string,string>(), standalone = false, blocked = false) {
  const handlers: Record<string, Array<(e?: any) => void>> = {};
  const on = (name: string, fn: (e?: any) => void) => (handlers[name] ??= []).push(fn);
  const fire = (name: string, event?: any) => handlers[name]?.forEach(fn => fn(event));
  const elements = ['arrival', 'result', 'hub'].map(placement => ({ dataset: { installPlacement: placement }, hidden: true }));
  const add = { dataset: { installAction: 'add' }, disabled: false };
  const mode = { matches: standalone, addEventListener: on };
  const window: any = { addEventListener: on, matchMedia: () => mode };
  const sandbox: any = { window, navigator: {}, document: { addEventListener: on,
    querySelectorAll: (s: string) => s === '[data-install-placement]' ? elements : [add] },
    localStorage: { getItem: (k: string) => { if(blocked)throw Error('blocked');return storage.get(k) ?? null; },
      setItem: (k: string,v: string) => { if(blocked)throw Error('blocked');storage.set(k,v); } } };
  vm.runInNewContext(unwrap(installHead(config)), sandbox);
  const click = (action: string) => fire('click', { target: { closest: () => ({ dataset: { installAction: action } }) } });
  function offer(outcome = 'dismissed', fail = false) {
    let prompts = 0, prevented = 0;
    fire('beforeinstallprompt', { preventDefault: () => prevented++, prompt: () => { prompts++;if(fail)throw Error('expired');return Promise.resolve(); }, userChoice: Promise.resolve({ outcome }) });
    return { prompts: () => prompts, prevented: () => prevented };
  }
  return { fire, elements, click, offer, mode, storage, api: window.scorewitInstall };
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
  console.log('install: native eligibility, cooldown, lifecycle, local state, installed navigation and all eight identity locks pass');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
