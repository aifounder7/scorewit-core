/** Optional first-party feedback. Disabled consumers emit no markup or code. */
export interface FeedbackConfig {
  enabled: boolean;
  serviceUrl: string;
  pack?: string;
  appVersion?: string;
}
export const FEEDBACK_COPY = {
  title: "Give feedback",
  subtitle: "Read by a person. No account needed.",
  about: "What is this about?",
  kinds: [
    "A question or answer",
    "An idea",
    "Something broke",
    "Just saying hello",
  ],
  placeholders: [
    "Which question, and what looks off?",
    "What would you add or change?",
    "What happened, and on which page?",
    "Say hi. We read everything.",
  ],
  message: "Tell us",
  email: "Your email",
  emailNote: "only if you want a reply",
  context: "What we send with this",
  sent: "Got it. Thank you.",
  receipt:
    "We read everything. If you left an email, we reply to most messages within a few days.",
  failure:
    "That didn't send. Your message is still here; try again in a moment.",
  round: "How was today's round?",
  reactions: ["Too easy", "Just right", "Too hard"],
  thanks: "Thanks.",
  more: "Tell us more",
  report: "Report",
  reasons: ["Answer looks wrong", "Question unclear", "Typo"],
  reportThanks: "Thanks. We check every report against the match record.",
};
export function feedbackScript(config?: FeedbackConfig): string {
  if (!config?.enabled) return "";
  const u = new URL(config.serviceUrl);
  if (
    u.protocol !== "https:" ||
    u.origin !== config.serviceUrl ||
    u.username ||
    u.password
  )
    throw Error("feedback: serviceUrl must be an HTTPS origin");
  if (
    !/^(hub|worldcup|f1|cricket|gridiron|baseball|superover|footyphoria)$/.test(
      config.pack ?? "hub",
    )
  )
    throw Error("feedback: invalid pack");
  return CLIENT.replace("__CSS__", () => JSON.stringify(FEEDBACK_CSS))
    .replace("__CONFIG__", () =>
      JSON.stringify({
        ...config,
        pack: config.pack ?? "hub",
        appVersion: config.appVersion ?? "1",
      }).replace(/</g, "\\u003c"),
    )
    .replace("__COPY__", () =>
      JSON.stringify(FEEDBACK_COPY).replace(/</g, "\\u003c"),
    );
}
export function feedbackPage(config?: FeedbackConfig): string {
  return config?.enabled
    ? "<script>" + feedbackScript(config) + "</script>"
    : "";
}
const FEEDBACK_CSS =
  '\n .sw-feedback-link{font:inherit;color:inherit;border:0;background:none;text-decoration:underline;text-underline-offset:3px;cursor:pointer;min-height:44px;padding:8px 0}\n .sw-feedback-btn,.sw-feedback-pill{font:inherit;color:inherit;background:transparent;border:1px solid var(--line,#b1aa98);border-radius:24px;min-height:44px;padding:10px 18px;cursor:pointer}\n .sw-feedback-pill{background:#f1ebd9;font-weight:700}.sw-feedback-header{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin:8px 0}\n #sw-feedback-dialog{box-sizing:border-box;position:fixed;inset:0;margin:auto;width:calc(100% - 32px);max-width:390px;max-height:calc(100dvh - 32px);overflow:auto;border:1px solid #9a9586;border-radius:18px;padding:18px 16px;background:#fffdf8;color:#262721;font:15px/1.5 ui-rounded,system-ui,sans-serif;text-align:left}\n #sw-feedback-dialog *{box-sizing:border-box}#sw-feedback-dialog::backdrop{background:#171b1866}#sw-feedback-dialog h2{font-size:18px;margin:0 0 8px}#sw-feedback-dialog p{font-size:13px;margin:8px 0 16px}#sw-feedback-dialog label{display:block;font-size:14px;font-weight:700;margin:12px 0 6px}#sw-feedback-dialog label small{font-weight:400}\n #sw-feedback-dialog input,#sw-feedback-dialog textarea{font:inherit;display:block;width:100%;padding:10px;border:1px solid #8f897c;border-radius:10px;background:#faf5ec;color:#262721}#sw-feedback-dialog textarea{min-height:96px;resize:vertical}#sw-feedback-dialog details{overflow-wrap:anywhere;font-size:12px;margin:16px 0}#sw-feedback-dialog summary{cursor:pointer;padding:8px 0}\n .sw-feedback-top{display:flex;justify-content:space-between;gap:12px}.sw-feedback-close{min-height:44px;min-width:44px;font-size:23px;border:0;background:none;color:inherit;cursor:pointer}.sw-feedback-choices{display:flex;gap:7px;flex-wrap:wrap}.sw-feedback-choices button{min-height:44px;border:1px solid #aaa28e;border-radius:24px;background:transparent;color:inherit;padding:8px 13px;font:inherit;font-size:13px;cursor:pointer}.sw-feedback-choices [aria-pressed=true]{background:#262721;color:#fffdf8;border-color:#262721}\n .sw-feedback-count{font-size:12px;text-align:right}.sw-feedback-actions{display:flex;gap:10px;margin-top:16px}.sw-feedback-actions button{flex:1}.sw-feedback-actions .sw-feedback-send{background:#262721;color:#fffdf8;border-color:#262721}.sw-feedback-error{font-size:13px;color:#91372e}.sw-feedback-reaction{border:1px solid #b1aa98;border-radius:15px;padding:16px;margin:20px 0;text-align:center}.sw-feedback-reaction .sw-feedback-choices{justify-content:center}.sw-feedback-tick{width:44px;height:44px;border-radius:50%;background:#2f6b4a;position:relative}.sw-feedback-tick:after{content:"";position:absolute;left:15px;top:10px;width:10px;height:18px;border:solid white;border-width:0 3px 3px 0;transform:rotate(45deg)}.sw-feedback-reaction h3{font-size:16px;margin:0 0 12px}.sw-feedback-report{margin:6px 0 6px 8px;color:#645f52;font-size:13px}.sw-feedback-report [role=status]{font-size:13px}.sw-feedback-trap{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important}.sw-feedback-link:focus-visible,.sw-feedback-btn:focus-visible,.sw-feedback-pill:focus-visible,.sw-feedback-choices button:focus-visible{outline:3px solid #245bb3;outline-offset:3px}\n ';
const CLIENT = String.raw`
(function(config,copy){
 if(window.scorewitFeedback)return;
 const style=document.createElement('style');style.textContent=__CSS__;document.head.appendChild(style);
 const dialog=document.createElement('dialog');dialog.id='sw-feedback-dialog';dialog.setAttribute('aria-labelledby','sw-feedback-title');document.body.appendChild(dialog);
 let opener=null,contextValue={},pageContext={},busy=false;
 function el(parent,tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;parent.appendChild(e);return e;}
 function button(parent,label,fn,cls='sw-feedback-btn'){const b=el(parent,'button',label);b.type='button';b.className=cls;b.onclick=fn;return b;}
 function date(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
 function context(extra={}){return {game:config.pack,page:location.pathname.slice(0,200),localDate:date(),...extra,platform:window.ScorewitNativeNotifications?'ios_app':document.referrer.startsWith('android-app://')?'android_app':(navigator.standalone||matchMedia('(display-mode: standalone)').matches)?'installed':'web',viewport:innerWidth<600?'phone':innerWidth<1000?'tablet':'desktop',appVersion:config.appVersion};}
 async function send(route,payload,signal){const r=await fetch(config.serviceUrl+'/v1/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),credentials:'omit',redirect:'error',cache:'no-store',keepalive:true,signal:signal||AbortSignal.timeout(15000)});if(!r.ok)throw Error('feedback unavailable');}
 function close(){if(busy)return;dialog.close();}
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 dialog.addEventListener('close',()=>{dialog.replaceChildren();contextValue={};if(opener?.isConnected)opener.focus();});
 function open(extra={},trigger){if(dialog.open)return;opener=trigger||document.activeElement;contextValue=context({...pageContext,...extra});busy=false;dialog.replaceChildren();
 const top=el(dialog,'div');top.className='sw-feedback-top';const title=el(top,'h2',copy.title);title.id='sw-feedback-title';button(top,'×',close,'sw-feedback-close').setAttribute('aria-label','Close');el(dialog,'p',copy.subtitle);
 const form=el(dialog,'form');el(form,'label',copy.about);const choices=el(form,'div');choices.className='sw-feedback-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label',copy.about);let kind='';
 const msgLabel=el(form,'label',copy.message+' ');el(msgLabel,'small','· 20 to 600 characters');msgLabel.htmlFor='sw-feedback-text';const textarea=el(form,'textarea');textarea.id='sw-feedback-text';textarea.minLength=20;textarea.maxLength=600;textarea.required=true;textarea.placeholder='What would make Scorewit better?';const count=el(form,'div','0 / 600');count.className='sw-feedback-count';count.id='sw-feedback-count';textarea.setAttribute('aria-describedby',count.id);textarea.oninput=()=>count.textContent=textarea.value.length+' / 600';
 const kinds=['question','idea','bug','hello'];copy.kinds.forEach((label,i)=>{const b=button(choices,label,()=>{kind=kinds[i];for(const c of choices.children)c.setAttribute('aria-pressed',String(c===b));textarea.placeholder=copy.placeholders[i];});b.setAttribute('aria-pressed','false');});
 const emailLabel=el(form,'label',copy.email+' ');el(emailLabel,'small','· optional, '+copy.emailNote);emailLabel.htmlFor='sw-feedback-email';const email=el(form,'input');email.type='email';email.placeholder='you@example.com';email.id='sw-feedback-email';email.maxLength=254;email.autocomplete='email';
 const hp=el(form,'input');hp.name='website';hp.tabIndex=-1;hp.autocomplete='off';hp.className='sw-feedback-trap';hp.setAttribute('aria-hidden','true');
 const detail=el(form,'details');el(detail,'summary',copy.context);const list=el(detail,'ul');const labels={game:'Game',page:'Page',localDate:'Local date',roundDate:'Round date',questionId:'Question reference',platform:'Platform',viewport:'Screen size',appVersion:'App version'};for(const [k,v]of Object.entries(contextValue))el(list,'li',labels[k]+': '+v);el(detail,'p','Your play history and a tracking identifier are not attached.');
 const status=el(form,'p');status.className='sw-feedback-error';status.setAttribute('role','status');const actions=el(form,'div');actions.className='sw-feedback-actions';const cancel=button(actions,'Cancel',close);const submit=button(actions,'Send',()=>{});submit.type='submit';submit.className='sw-feedback-btn sw-feedback-send';
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;if(!kind){status.textContent='Choose what this is about.';choices.querySelector('button').focus();return;}if(textarea.value.trim().length<20){status.textContent='Please use 20 to 600 characters.';textarea.focus();return;}if(!form.reportValidity())return;
 busy=true;submit.disabled=true;cancel.disabled=true;status.textContent='Sending…';const data={...contextValue,kind,message:textarea.value.trim(),...(email.value.trim()?{email:email.value.trim()}:{}),website:hp.value};
 try{await send('feedback',data);busy=false;dialog.replaceChildren();const heading=el(dialog,'h2',copy.sent);heading.id='sw-feedback-title';const tick=el(dialog,'p','');tick.className='sw-feedback-tick';tick.setAttribute('aria-hidden','true');el(dialog,'p',copy.receipt);const done=button(dialog,'Close',close);done.focus();}
 catch{busy=false;submit.disabled=false;cancel.disabled=false;status.textContent=copy.failure;}};
 dialog.showModal();choices.querySelector('button').focus();}
 function entry(root,label=copy.title,cls='sw-feedback-btn'){return button(root,label,()=>open({},document.activeElement),cls);}
 const memory=new Set();function key(day){return 'scorewit.feedback.reaction.'+config.pack+'.'+day;}function seen(day){try{return memory.has(key(day))||sessionStorage.getItem(key(day))==='1';}catch{return memory.has(key(day));}}function mark(day){memory.add(key(day));try{sessionStorage.setItem(key(day),'1');}catch{}}
 let observer=null;
 function reaction(root,roundDate,score){pageContext={roundDate};if(observer)observer.disconnect();if(seen(roundDate))return;const box=el(root,'section');box.className='sw-feedback-reaction';el(box,'h3',copy.round);const choices=el(box,'div');choices.className='sw-feedback-choices';const status=el(box,'p');status.setAttribute('role','status');let pending=false;
 copy.reactions.forEach(value=>button(choices,value,async()=>{if(pending)return;pending=true;for(const b of choices.children)b.disabled=true;try{await send('reaction',{...context({roundDate}),reaction:value,score});mark(roundDate);observer?.disconnect();box.replaceChildren();el(box,'span',copy.thanks+' ');button(box,copy.more,()=>open({roundDate},document.activeElement),'sw-feedback-link');}catch{pending=false;for(const b of choices.children)b.disabled=false;status.textContent=copy.failure;}}));
 if(typeof IntersectionObserver!=='undefined'){let visible=false;observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting)visible=true;else if(visible&&!pending&&e.boundingClientRect.bottom<0){mark(roundDate);observer.disconnect();box.remove();}}});observer.observe(box);}}
 function report(root,questionId,roundDate){pageContext={questionId,...(roundDate?{roundDate}:{})};const box=el(root,'span');box.className='sw-feedback-report';const extra={questionId,...(roundDate?{roundDate}:{})};let pending=false;const status=el(box,'span');status.setAttribute('role','status');const trigger=button(box,copy.report,()=>{trigger.hidden=true;const choices=el(box,'span');choices.className='sw-feedback-choices';copy.reasons.forEach(reason=>button(choices,reason,async()=>{if(pending)return;pending=true;for(const b of choices.children)b.disabled=true;try{await send('feedback',{...context(extra),kind:'report',reason});box.replaceChildren();el(box,'span',copy.reportThanks).setAttribute('role','status');}catch{pending=false;for(const b of choices.children)b.disabled=false;status.textContent=copy.failure;}}));choices.querySelector('button').focus();},'sw-feedback-link');}
 window.scorewitFeedback={open,entry,reaction,report,setContext(value){pageContext=value;}};
 document.querySelectorAll('.sw-footer-links').forEach(root=>{const b=entry(root,copy.title,'sw-feedback-link');const contact=root.querySelector('a[href$="#contact"]');if(contact)root.insertBefore(b,contact);});
})(__CONFIG__,__COPY__);
`;
