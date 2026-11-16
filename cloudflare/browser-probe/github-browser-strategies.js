// Isolated compatibility probes; not installed in the production short-link handler.
// Android URI structure: vdaluz/astro-inapp-escape, src/lib/escape.ts (MIT).
// Safari scheme candidate: shalanah/inapp-debugger compatibility tests.
export const middleTarget='https://link-share-9188.pages.dev/github-browser-1116';
export function defaultBrowserIntent(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password)throw new Error('仅支持无账号信息的 HTTPS 目标');
 return 'intent://'+url.host+url.pathname+url.search+'#Intent;scheme=https;end';
}
export function safariTarget(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password)throw new Error('仅支持无账号信息的 HTTPS 目标');
 return 'x-safari-https:'+url.href.slice('https:'.length);
}
if(typeof document!=='undefined'){
 const ua=navigator.userAgent,isAndroid=/Android/i.test(ua),isIOS=/iPhone|iPad|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const status=document.getElementById('probe-status');
 document.getElementById('probe-platform').textContent=isAndroid?'检测到安卓':isIOS?'检测到 iPhone / iPad':'电脑端：只能检查页面，不能验证手机应用切换';
 function attempt(method){
  if(method==='android'&&!isAndroid||method.startsWith('safari')&&!isIOS){status.textContent='请在对应手机的 X 客户端里执行这项测试。';return;}
  status.textContent='已发起 '+method+' 请求。请确认是否真正切到独立浏览器，并看到“浏览器中转页验收”；这条提示本身不代表成功。';
  try{if(method==='android')window.location.href=defaultBrowserIntent(middleTarget);else if(method==='safari-window')window.open(safariTarget(middleTarget),'_blank','noopener,noreferrer');else window.location.href=safariTarget(middleTarget);}catch(error){status.textContent='客户端拒绝或未能处理请求：'+error.message;}
 }
 document.querySelectorAll('[data-probe]').forEach(button=>button.addEventListener('click',()=>attempt(button.dataset.probe)));
 const run=new URLSearchParams(location.search).get('run');
 if(run==='android-auto')attempt('android');
 else if(run==='safari-auto')attempt('safari-current');
}
