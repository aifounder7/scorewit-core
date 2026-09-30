/** Read-only question reference for feedback emails. The fragment stays out of
 * server requests/analytics. This viewer never calls scoring or history code. */
export const QUESTION_REVIEW_JS = String.raw`
(function(){
 function openReference(){
  const match=/^#question=([A-Za-z0-9_.:%-]{1,600})$/.exec(location.hash);
  if(!match)return;
  let id;try{id=decodeURIComponent(match[1]);}catch{return;}
  if(!/^[A-Za-z0-9_.:-]{1,200}$/.test(id))return;
  if(document.getElementById('sw-question-review'))return;
  const q=BANK.questions.find(q=>q.id===id);
  const dialog=document.createElement('dialog');dialog.id='sw-question-review';
  dialog.setAttribute('aria-labelledby','sw-question-review-title');
  dialog.style.cssText='width:calc(100% - 32px);max-width:480px;max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;border:1px solid var(--surface);border-radius:18px;padding:24px;background:var(--elev);color:var(--text)';
  function line(tag,text){const el=document.createElement(tag);el.textContent=text;dialog.appendChild(el);return el;}
  line('h2','Question reference').id='sw-question-review-title';
  if(q){
   line('p',q.text);
   if(q.options&&q.options.length)line('p','Choices: '+q.options.join(' · '));
   line('p','Answer: '+q.answer+(q.unit?' '+q.unit:''));line('p',q.revealFact);
   const source=q.citation&&q.citation.urls&&q.citation.urls[0];
   try{const u=new URL(source);if(u.protocol==='https:'){const a=line('a',q.citation.label||'Source');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';}}catch{}
  }else line('p','This question is no longer in the current question bank. Its reference is preserved below for review.');
  line('p','Question: '+id).style.overflowWrap='anywhere';
  line('p','Read-only reference. Your score and round progress are unchanged.');
  const close=line('button','Close');close.type='button';close.className='sw-feedback-btn';close.onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.remove();if(location.hash===match[0])history.replaceState(null,'',location.pathname+location.search);});
  document.body.appendChild(dialog);dialog.showModal();close.focus();
 }
 openReference();window.addEventListener('hashchange',openReference);
})();`;
