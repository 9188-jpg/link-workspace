/** Exclude known preview clients and speculative loads before issuing measurable tokens. */
export function measurableRequest(req:Request){
 const ua=req.headers.get('user-agent')||'',purpose=[req.headers.get('purpose'),req.headers.get('sec-purpose'),req.headers.get('x-purpose')].join(' ');
 return !/bot\b|spider|crawler|slurp|preview|facebookexternalhit|facebookcatalog|whatsapp|telegrambot|slackbot|discordbot|skypeuripreview|larkurl|feishuurl/i.test(ua)&&!/prefetch|prerender|preview/i.test(purpose)&&!(req as any).cf?.botManagement?.verifiedBot;
}
/** Runs only once the document is actually visible, never during hidden/prerender loading. */
export function visibleOnceScript(callback:string){return `(()=>{let sent=false,timer;function check(){clearTimeout(timer);if(sent||document.visibilityState!=='visible'||document.prerendering)return;timer=setTimeout(()=>{if(sent||document.visibilityState!=='visible'||document.prerendering)return;sent=true;${callback}},350);}document.addEventListener('visibilitychange',check);document.addEventListener('prerenderingchange',check);check();})();`;}
