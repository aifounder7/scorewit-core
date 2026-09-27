import assert from 'node:assert/strict';
import vm from 'node:vm';
import { nativeWidgetUpdate, widgetState } from './widget-state';
const code=nativeWidgetUpdate('f1');
const calls:any[]=[];
const sandbox={window:{ScorewitNativeWidget:{update:(state:any)=>{calls.push(state);return Promise.resolve();}}},currentDailyKey:()=> '2026-09-27',loadHistory:()=>({'2026-09-26':{score:600}})};
vm.runInNewContext(code,sandbox);assert.equal(calls[0].completed,false);
sandbox.loadHistory=()=>({'2026-09-27':{score:200}} as any);
vm.runInNewContext(code,sandbox);assert.equal(calls[1].completed,true);
assert.deepEqual(Object.keys(calls[1]).sort(),['completed','date','pack']);
vm.runInNewContext(code,{window:{}}); // ordinary browser: no reads or writes
vm.runInNewContext(code,{...sandbox,window:{ScorewitNativeWidget:{update:()=>{throw Error('storage unavailable');}}}});
assert.throws(()=>nativeWidgetUpdate('</script>'));
const result=widgetState({pack:'f1',builtOn:'2026-09-27',readyThrough:'2026-09-29',cadence:'nightly'},'Scorewit Racing');
assert.equal(result.date,'2026-09-27');assert.equal(result.readyThrough,'2026-09-29');assert.equal(result.roundReady,true);
console.log('Widget bridge and validated-window presentation checks passed');
