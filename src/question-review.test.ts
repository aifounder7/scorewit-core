import assert from 'node:assert/strict';
import vm from 'node:vm';
import { QUESTION_REVIEW_JS } from './render/question-review';
class Element {
 id='';textContent='';style:any={};children:Element[]=[];events:Record<string,Function>={};open=false;focused=false;removed=false;
 appendChild(e:Element){this.children.push(e);return e;} setAttribute(){} addEventListener(n:string,f:Function){this.events[n]=f;}
 showModal(){this.open=true;} focus(){this.focused=true;} remove(){this.removed=true;} close(){this.events.close?.();}
}
function run(hash:string,questions:any[]){
 const body=new Element(),replaces:any[]=[],listeners:any={};
 const document={body,createElement:()=>new Element(),getElementById:(id:string)=>body.children.find(e=>e.id===id&&!e.removed)};
 vm.runInNewContext(QUESTION_REVIEW_JS,{document,location:{hash,pathname:'/f1/',search:''},history:{replaceState:(...v:any[])=>replaces.push(v)},BANK:{questions},URL,window:{addEventListener:(n:string,f:Function)=>listeners[n]=f}});
 return {body,replaces,listeners};
}
const q={id:'q:1',text:'<script>synthetic question</script>',revealFact:'Verified fixture fact.',citation:{urls:['https://example.invalid/source'],label:'Fixture source'}};
const {body,replaces,listeners}=run('#question=q%3A1',[q]);
assert.equal(body.children.length,1);const dialog=body.children[0];assert.ok(dialog.open);
assert.ok(dialog.children.some(el=>el.textContent===q.text));assert.ok(dialog.children.some(el=>el.textContent===q.revealFact));
assert.ok(dialog.children[dialog.children.length-1]?.focused);listeners.hashchange();assert.equal(body.children.length,1);
dialog.close();assert.ok(dialog.removed);assert.equal(replaces[0][2],'/f1/');
for(const hash of ['','#s','#question=%ZZ','#question=%3Cscript%3E'])assert.equal(run(hash,[q]).body.children.length,0);
const missing=run('#question=missing',[q]).body.children[0];assert.ok(missing.children.some(el=>el.textContent.includes('no longer')));
// No storage, scoring, network or history mutation APIs exist in this VM. Opening
// and closing a reference still succeeds, including unknown and malicious IDs.
console.log('question reference: read-only, safe text, missing IDs, close and hash navigation passed');
