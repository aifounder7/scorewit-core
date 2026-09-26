import vm from 'node:vm';
export interface NotificationStateConfig {
  pack: string;
  cadence: 'nightly' | 'three-a-week' | 'weekly';
  gamePaths: string[];
}
export interface NotificationState {
  pack: string; builtOn: string; readyThrough: string; cadence: NotificationStateConfig['cadence'];
}
export function notificationState(config: NotificationStateConfig, bank: any, builtOn: string, html: string): NotificationState {
  // Emit-side precondition; only the independent rendered-selector validation
  // below can certify coverage. Counts alone cannot produce a readyThrough.
  const buckets = new Map<string, number>();
  for (const q of bank.questions ?? []) buckets.set(q.difficulty+'/'+q.type,(buckets.get(q.difficulty+'/'+q.type)??0)+1);
  if (!['easy','medium','hard'].every(t=>['multiple_choice','closest_guess'].every(k=>(buckets.get(t+'/'+k)??0)>=4))) throw Error('Insufficient bank for notification readiness');
  return validateNotificationState({pack:config.pack, builtOn, cadence:config.cadence}, html);
}
/** Computes contiguous coverage using the actual emitted selector, including
 * event-week substitutions. No emit-side bucket helper is reused. Cadence sets
 * a scan budget, not the result: 2/4/8 days beyond the build date cover the
 * normal refresh gap plus an ahead-of-UTC day. Every date must pass. Failure
 * truncates the window; fewer than two dates fails the build. Trusted generated
 * code only, never externally fetched HTML. */
export function validateNotificationState(state: Omit<NotificationState, 'readyThrough'> & {readyThrough?: string}, html: string): NotificationState {
  const horizons = {nightly:2, 'three-a-week':4, weekly:8};
  if (!/^[a-z0-9-]+$/.test(state.pack) || !Object.prototype.hasOwnProperty.call(horizons,state.cadence)) throw Error('Invalid notification config');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(state.builtOn) || !Number.isFinite(Date.parse(state.builtOn)) || new Date(state.builtOn).toISOString().slice(0,10)!==state.builtOn) throw Error('Invalid notification date');
  const start=html.indexOf('const BANK = '), end=html.indexOf('// ---- ported from src/game/scoring.ts ----',start);
  if(start<0||end<start)throw Error('Cannot validate daily selector');
  let code=html.slice(start,end);
  const spotlight=html.indexOf('// ---- calendar spotlight (opt-in)');
  if(spotlight>=0){const finish=html.indexOf('\nfunction render(){',spotlight);if(finish<0)throw Error('Cannot validate spotlight selector');code+='\n'+html.slice(spotlight,finish);}
  const context=vm.createContext({});
  vm.runInContext(code,context,{timeout:1000});
  let readyThrough: string | undefined;
  for(let day=0;day<=horizons[state.cadence];day++){
    const date=new Date(Date.parse(state.builtOn)+day*86400000).toISOString().slice(0,10);
    try{
      const selected=vm.runInContext('selectDaily(BANK,'+JSON.stringify(date)+');',context,{timeout:1000});
      if(!Array.isArray(selected)||selected.length!==6||!selected.every(q=>q&&typeof q.id==='string'&&typeof q.text==='string'&&q.answer!==undefined)||new Set(selected.map(q=>q.id)).size!==6)break;
    }catch{break;}
    readyThrough=date;
  }
  const minimum=new Date(Date.parse(state.builtOn)+86400000).toISOString().slice(0,10);
  if(!readyThrough || readyThrough<minimum)throw Error('Readiness must validate the build date and at least the next day');
  if(state.readyThrough!==undefined&&state.readyThrough!==readyThrough)throw Error('Readiness window disagrees with rendered daily rounds');
  return {pack:state.pack,builtOn:state.builtOn,readyThrough,cadence:state.cadence};
}
