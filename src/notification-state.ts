import vm from 'node:vm';
export interface NotificationStateConfig {
  pack: string;
  cadence: 'nightly' | 'three-a-week' | 'weekly';
  gamePaths: string[];
}
export interface NotificationState { pack: string; date: string; roundReady: boolean; cadence: NotificationStateConfig['cadence'] }
export function notificationState(config: NotificationStateConfig, bank: any, date: string): NotificationState {
  if (!/^[a-z0-9-]+$/.test(config.pack) || !['nightly','three-a-week','weekly'].includes(config.cadence)) throw Error('Invalid notification state config');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0,10)!==date) throw Error('Invalid notification date');
  const buckets = new Map<string, number>();
  for (const q of bank.questions ?? []) buckets.set(q.difficulty+'/'+q.type,(buckets.get(q.difficulty+'/'+q.type)??0)+1);
  const ready = ['easy','medium','hard'].every(t=>['multiple_choice','closest_guess'].every(k=>(buckets.get(t+'/'+k)??0)>=4));
  return { pack: config.pack, date, roundReady: ready, cadence: config.cadence };
}
/** Independent readiness validation against the actual emitted game selector,
 * including event-week substitutions. No emit-side bucket helper is reused.
 * This evaluates trusted generated build code, never externally fetched HTML. */
export function validateNotificationState(state: NotificationState, html: string): void {
  const start=html.indexOf('const BANK = '), end=html.indexOf('// ---- ported from src/game/scoring.ts ----',start);
  if(start<0||end<start)throw Error('Cannot validate daily selector');
  let code=html.slice(start,end);
  const spotlight=html.indexOf('// ---- calendar spotlight (opt-in)');
  if(spotlight>=0){const finish=html.indexOf('\nfunction render(){',spotlight);if(finish<0)throw Error('Cannot validate spotlight selector');code+='\n'+html.slice(spotlight,finish);}
  let selected:any[]=[];
  try{selected=vm.runInNewContext(code+'\nselectDaily(BANK,'+JSON.stringify(state.date)+');',{}, {timeout:1000});}catch(error){if(state.roundReady)throw error;return;}
  const actual=selected.length===6&&selected.every(q=>q&&typeof q.id==='string'&&typeof q.text==='string'&&q.answer!==undefined)&&new Set(selected.map(q=>q.id)).size===6;
  if(state.roundReady!==actual)throw Error('Notification readiness disagrees with the rendered daily round');
}
