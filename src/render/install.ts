export type NativeInstallDestination = { kind: 'native'; label: string; body?: string };
export type ManualInstallDestination = { kind: 'manual'; label: string; body?: string };
/** Configure only after a real listing exists. A store-specific body is required. */
export type StoreInstallDestination = { kind: 'store'; label: string; body: string; url: string };
export interface InstallDestinations {
  android: NativeInstallDestination | StoreInstallDestination;
  ios: ManualInstallDestination | StoreInstallDestination;
  desktop: NativeInstallDestination;
}
/** Optional install promotion. Copy and artwork belong to the consumer. */
export interface InstallPromoConfig {
  appName: string;
  markUrl: string;
  eyebrow: string;
  title: string;
  body: string;
  /** Canonical local game path. Omit for the hub. */
  gamePath?: string;
  /** Unset retains native-prompt-only behavior. One component, platform data. */
  destinations?: InstallDestinations;
}
export interface InstalledHubGame { path: string; prefix: string }
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function localPath(s: string) {
  if (!/^\/[a-z0-9-]+$/.test(s)) throw new Error('install: expected a local game root');
  return s;
}
export function renderInstallCard(config: InstallPromoConfig, placement: 'result' | 'hub'): string {
  if (!/^(data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*|https:\/\/[^\s"<>]+)$/.test(config.markUrl)) {
    throw new Error('install: expected an HTTPS or embedded SVG image');
  }
  return `<aside class="sw-install" data-install-placement="${placement}" aria-label="Install ${esc(config.appName)}" hidden><div class="sw-install-brand"><img src="${esc(config.markUrl)}" width="40" height="40" alt=""><span>${esc(config.eyebrow)}</span></div><h2>${esc(config.title)}</h2><p data-install-copy>${esc(config.body)}</p><div class="sw-install-actions"><button type="button" class="sw-install-add" data-install-action="add"><span data-install-label>Add to home screen</span></button><button type="button" class="sw-install-later" data-install-action="dismiss">Not now</button></div></aside>${config.destinations?.ios.kind === 'manual' ? renderInstallHelp(config.appName) : ''}`;
}

/** Plain Safari instructions; no install-success claim or automatic navigation. */
function renderInstallHelp(appName: string): string {
  return `<dialog id="sw-install-guide" class="sw-install-guide" aria-labelledby="sw-install-guide-title"><button type="button" class="sw-install-guide-close" data-install-action="close-guide" aria-label="Close instructions" autofocus>×</button><h2 id="sw-install-guide-title">Add ${esc(appName)} to your Home Screen</h2><ol><li>In Safari, tap Share (the square with an upward arrow). If Share is tucked away, open Safari’s page menu first.</li><li>Choose Add to Home Screen (under View More if shown). If it is missing, use Edit Actions to add it.</li><li>If you see Open as Web App, turn it on, then tap Add.</li></ol><details id="sw-install-browser-help"><summary>Using another browser or app?</summary><p>Open this page in Safari first. Copy the link below and paste it into Safari’s address bar.</p><div id="sw-install-copy-wrap"><label for="sw-install-page-link">Page link</label><input id="sw-install-page-link" type="url" readonly><button type="button" class="sw-install-copy" data-install-action="copy-link">Copy link</button></div><p id="sw-install-copy-status" role="status" aria-live="polite"></p></details><button type="button" class="sw-install-add" data-install-action="done-guide">Done</button></dialog>`;
}

export const INSTALL_ARRIVAL = '<button type="button" class="sw-install-quiet" data-install-placement="arrival" data-install-action="add" hidden><svg viewBox="0 0 16 20" width="13" height="17" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="1" width="10" height="18" rx="2"/><path d="M6 15h4M8 5v6M5 8h6"/></svg><span data-install-label>Add to home screen</span></button>';
export const INSTALL_CSS = `
[data-install-placement][hidden]{display:none!important}
.sw-install{box-sizing:border-box;margin:28px 0 12px;padding:22px;border:1px solid #ddd3ba;border-radius:15px;background:#f3eddf;text-align:left;color:#26251f}
.sw-install-brand{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.sw-install-brand img{flex:none;border-radius:9px}
.sw-install-brand span{font-size:11px;line-height:1.4;font-weight:750;letter-spacing:.09em;color:#645f52}
.sw-install h2{font-family:inherit;font-size:23px;line-height:1.2;letter-spacing:-.025em;margin:0 0 9px;font-weight:750}
.sw-install p{font-size:14px;line-height:1.55;color:#645f52;margin:0 0 18px;max-width:46ch}
.sw-install-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.sw-install button,.sw-install-quiet{font-family:inherit;cursor:pointer;touch-action:manipulation}
.sw-install-add{border:0;border-radius:999px;min-height:44px;padding:11px 19px;background:var(--accent,#26251f);color:#fff;font-size:14px;font-weight:750}
.sw-install-later{border:0;background:transparent;color:#645f52;min-height:44px;padding:10px 8px;font-size:13px;text-decoration:underline;text-underline-offset:3px}
.sw-install-quiet{display:inline-flex;align-items:center;gap:7px;padding:6px 0;min-height:44px;border:0;background:none;color:var(--accent,#26251f);font-size:12px;font-weight:650;text-align:left}
.sw-install button:focus-visible,.sw-install-quiet:focus-visible{outline:2px solid currentColor;outline-offset:4px}
.sw-install button:disabled,.sw-install-quiet:disabled{cursor:wait;opacity:.65}
.sw-install-streak{display:flex;align-items:center;gap:8px 16px;flex-wrap:wrap}
.sw-install[data-install-placement="hub"]{max-width:540px;margin:32px auto 0;--accent:#26251f}
.sw-install-guide{box-sizing:border-box;width:calc(100% - 32px);max-width:430px;max-height:calc(100dvh - 40px);overflow:auto;overscroll-behavior:contain;border:1px solid #ddd3ba;border-radius:18px;padding:28px 24px;background:#faf5ec;color:#26251f;font-family:ui-rounded,"SF Pro Rounded",-apple-system,system-ui,"Segoe UI",sans-serif;text-align:left;box-shadow:0 16px 60px #0003}
.sw-install-guide::backdrop{background:#26251f88}
.sw-install-guide h2{font-size:23px;line-height:1.2;letter-spacing:-.025em;margin:8px 28px 18px 0}
.sw-install-guide p,.sw-install-guide li{font-size:14px;line-height:1.6;color:#645f52}
.sw-install-guide ol{padding-left:22px;margin:18px 0}.sw-install-guide li{padding-left:4px;margin:10px 0}
.sw-install-guide button{font-family:inherit;cursor:pointer;touch-action:manipulation}
.sw-install-guide-close{position:absolute;right:10px;top:10px;width:44px;height:44px;border:0;border-radius:50%;background:transparent;color:#645f52;font-size:28px}
.sw-install-guide details{margin:18px 0}.sw-install-guide summary{font-size:14px;cursor:pointer;color:#26251f;min-height:28px}
.sw-install-guide label{display:block;font-size:12px;font-weight:700;margin-bottom:5px}
.sw-install-guide input{box-sizing:border-box;width:100%;padding:10px;border:1px solid #ddd3ba;border-radius:8px;background:#fffdf8;color:#26251f;font:16px system-ui}
.sw-install-copy{margin-top:8px;min-height:44px;border:1px solid #ddd3ba;border-radius:99px;padding:8px 16px;background:transparent;color:#26251f}
.sw-install-guide :focus-visible{outline:2px solid #26251f;outline-offset:3px}
.sw-install-guide .sw-install-add{background:#26251f}
.sw-install-guide [hidden]{display:none!important}
@media(max-width:360px){.sw-install{padding:18px}.sw-install h2{font-size:21px}}
`;

/** Runs in the head so the one-shot browser event cannot be missed. No network,
 * cookies, analytics, sport facts, or install claims. Unsupported browsers get
 * no dead button. Cards share a 30-day cooldown; the quiet action stays available
 * for a deliberate retry. Blocked storage degrades to this page's memory. */
export function installHead(config: InstallPromoConfig): string {
  if (config.gamePath) localPath(config.gamePath);
  validateDestinations(config.destinations);
  return '<script>\n' + INSTALL_CLIENT.replace('__INSTALLCONFIG__', () => json({
    gamePath: config.gamePath ?? null, appName: config.appName, body: config.body,
    destinations: config.destinations ?? null,
  })) + '\n</script>';
}

function validateDestinations(destinations?: InstallDestinations): void {
  if (!destinations) return;
  for (const platform of ['android', 'ios', 'desktop'] as const) {
    const d = destinations[platform];
    if (!d || !d.label?.trim()) throw new Error('install: every platform needs an action label');
    if (platform === 'desktop' && d.kind !== 'native') throw new Error('install: desktop uses web installation');
    if (d.kind === 'native' && platform !== 'ios') continue;
    if (d.kind === 'manual' && platform === 'ios') continue;
    if (d.kind !== 'store' || !d.body?.trim()) throw new Error('install: invalid platform action or missing store copy');
    const u = new URL(d.url);
    const valid = platform === 'android'
      ? u.hostname === 'play.google.com' && u.pathname === '/store/apps/details' && !!u.searchParams.get('id')
      : platform === 'ios' && u.hostname === 'apps.apple.com' && /\/id[0-9]+$/.test(u.pathname);
    if (!valid || u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) {
      throw new Error('install: expected a real HTTPS listing URL for this platform');
    }
  }
}

export const INSTALL_CLIENT = String.raw`(function(){
'use strict';
const config=__INSTALLCONFIG__,gamePath=config.gamePath,dismissKey='scorewit.installDismissedUntil',installedKey='scorewit.installAccepted';
const mode=window.matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui), (display-mode: window-controls-overlay)');
const ua=navigator.userAgent||'';
const ios=/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const platform=ios?'ios':/Android/i.test(ua)?'android':'desktop';
const destination=config.destinations?config.destinations[platform]:{kind:'native',label:'Add to home screen'};
const safari=ios&&/Version\/.*Safari\//.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo|FBAN|FBAV|Instagram|Line\//i.test(ua);
let pending=null,busy=false,accepted=false,context={arrival:false,result:false},dismissedUntil=0,guideTrigger=null;
function guide(){return document.getElementById('sw-install-guide');}
function eligible(){return !accepted&&!standalone()&&(destination.kind!=='native'||!!pending);}
function read(key){try{return localStorage.getItem(key);}catch(e){return null;}}
function write(key,value){try{localStorage.setItem(key,value);}catch(e){}}
function standalone(){return mode.matches||navigator.standalone===true;}
function cooldown(){const stored=Number(read(dismissKey));return Math.max(dismissedUntil,Number.isFinite(stored)?stored:0)>Date.now();}
function refresh(){
  if(standalone()&&destination.kind==='manual')write('scorewit.installManualSeen','1');
  const available=eligible();
  document.querySelectorAll('[data-install-label]').forEach(function(el){el.textContent=destination.label;});
  document.querySelectorAll('[data-install-copy]').forEach(function(el){el.textContent=destination.body||config.body;});
  document.querySelectorAll('[data-install-placement]').forEach(function(el){
    const placement=el.dataset.installPlacement;
    el.hidden=!(available&&(placement==='arrival'?context.arrival:!cooldown()&&!(destination.kind==='manual'&&read('scorewit.installManualSeen')==='1')&&(placement==='hub'||context.result)));
  });
  document.querySelectorAll('[data-install-action="add"]').forEach(function(el){el.disabled=busy;});
  if(!available)closeGuide();
}
function dismiss(){dismissedUntil=Date.now()+30*86400000;write(dismissKey,String(dismissedUntil));refresh();}
function closeGuide(){const dialog=guide();if(dialog&&dialog.open)dialog.close();}
function openGuide(trigger){
  const dialog=guide();if(!dialog||dialog.open)return;
  guideTrigger=trigger;
  document.getElementById('sw-install-browser-help').open=!safari;
  document.getElementById('sw-install-page-link').value=location.origin+(gamePath||'/');
  document.getElementById('sw-install-copy-status').textContent='';
  dialog.showModal();
}
async function copyLink(){
  const field=document.getElementById('sw-install-page-link');
  const status=document.getElementById('sw-install-copy-status');
  try{await navigator.clipboard.writeText(field.value);status.textContent='Link copied. Paste it into Safari.';}
  catch(e){field.focus();field.select();status.textContent='Touch and hold the selected link, then choose Copy.';}
}
async function install(trigger){
  if(!eligible()||busy)return;
  if(destination.kind==='manual'){openGuide(trigger);return;}
  if(destination.kind==='store'){dismiss();location.assign(destination.url);return;}
  const event=pending;pending=null;busy=true;refresh();
  try{
    // prompt() must run synchronously in the original user-click turn.
    const promptResult=event.prompt();
    await promptResult;
    const choice=await event.userChoice;
    if(choice&&choice.outcome==='accepted'){accepted=true;write(installedKey,String(Date.now()));}
    else dismiss();
  }catch(e){/* A consumed/expired native event cannot be retried. */}
  finally{busy=false;refresh();}
}
window.addEventListener('beforeinstallprompt',function(event){
  if(destination.kind!=='native'||typeof event.prompt!=='function')return;
  event.preventDefault();
  // A fresh eligibility event is stronger evidence than a previous acceptance.
  pending=event;accepted=false;refresh();
});
window.addEventListener('appinstalled',function(){accepted=true;pending=null;write(installedKey,String(Date.now()));refresh();});
window.addEventListener('storage',function(event){
  if(event.key===installedKey&&event.newValue){accepted=true;pending=null;}
  if(event.key===dismissKey||event.key===installedKey||event.key==='scorewit.installManualSeen'||event.key===null)refresh();
});
window.addEventListener('pageshow',refresh);
if(mode.addEventListener)mode.addEventListener('change',refresh);
document.addEventListener('DOMContentLoaded',function(){
  const dialog=guide();
  if(dialog)dialog.addEventListener('close',function(){
    if(guideTrigger&&guideTrigger.isConnected&&guideTrigger.getClientRects().length)guideTrigger.focus({preventScroll:true});
    else{const heading=document.querySelector('main h2,h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}
    guideTrigger=null;
  });
  refresh();
});
document.addEventListener('click',function(event){
  const button=event.target.closest&&event.target.closest('[data-install-action]');
  if(!button)return;
  if(button.dataset.installAction==='add')install(button);
  else if(button.dataset.installAction==='dismiss')dismiss();
  else if(button.dataset.installAction==='close-guide')closeGuide();
  else if(button.dataset.installAction==='done-guide'){closeGuide();dismiss();}
  else if(button.dataset.installAction==='copy-link')copyLink();
});
window.scorewitInstall={
  update:function(next){context=next;refresh();},
  played:function(){context.arrival=false;refresh();if(gamePath)write('scorewit.lastPlayed',JSON.stringify({path:gamePath,at:Date.now()}));}
};
})();`;

/** A cold installed hub launch may resume an actual game, never a page view.
 * Old saves only have dates: ties deliberately stay on the chooser. */
export function installedHubHead(games: InstalledHubGame[]): string {
  for (const game of games) {
    localPath(game.path);
    if (!/^[a-zA-Z0-9_-]+$/.test(game.prefix)) throw new Error('install: invalid storage prefix');
  }
  return '<script>\n' + HUB_LAUNCH_CLIENT.replace('__GAMES__', json(games)) + '\n</script>';
}
export const HUB_LAUNCH_CLIENT = String.raw`(function(){
'use strict';
const games=__GAMES__;
const standalone=window.matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui), (display-mode: window-controls-overlay)').matches||navigator.standalone===true;
if(!standalone||new URLSearchParams(location.search).has('games')||location.hash)return;
try{if(document.referrer&&new URL(document.referrer).origin===location.origin)return;}catch(e){}
function read(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch(e){return null;}}
const last=read('scorewit.lastPlayed');
let target=last&&Number.isFinite(last.at)&&last.at>0&&last.at<=Date.now()&&games.some(g=>g.path===last.path)?last.path:null;
if(!target){
  const days=games.map(function(game){
    const history=read(game.prefix+'.history'),progress=read(game.prefix+'.progress');
    const dates=history&&typeof history==='object'?Object.keys(history).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)&&history[k]&&Array.isArray(history[k].grid)):[];
    if(progress&&/^\d{4}-\d{2}-\d{2}$/.test(progress.date)&&Array.isArray(progress.results)&&progress.results.length)dates.push(progress.date);
    return {path:game.path,date:dates.sort().pop()||''};
  }).sort((a,b)=>b.date.localeCompare(a.date));
  if(days[0]&&days[0].date&&(!days[1]||days[0].date!==days[1].date))target=days[0].path;
}
if(target)location.replace(target);
})();`;
