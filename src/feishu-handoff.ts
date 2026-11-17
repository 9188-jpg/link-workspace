import {browserShareUrl} from './share-url.ts';
import {htmlPage,js} from './feature-types.ts';
import {measurableRequest} from './traffic.ts';

/** The actual phone-verified method, shared by the probe and real short links. */
export function feishuHandoffScript(destination:string){
 const target=js(browserShareUrl(destination));
 return `(()=>{const target=${target};const button=document.getElementById('open-browser'),status=document.getElementById('open-status');let attempted=false;function open(){try{window.open(target,'NO_INTERCEPT');status.textContent='已发出打开请求。请检查是否切到独立浏览器；若仍在飞书内，请点按钮再试。';}catch{status.textContent='客户端未接受打开请求，请使用飞书菜单中的“在浏览器中打开”。';}}function auto(){if(attempted||document.visibilityState!=='visible'||document.prerendering||!/Lark|Feishu/i.test(navigator.userAgent)||/bot|preview|spider/i.test(navigator.userAgent))return;attempted=true;open();}button.addEventListener('click',open);document.addEventListener('visibilitychange',auto);document.addEventListener('prerenderingchange',auto);auto();})();`;
}

export function shouldFeishuHandoff(req:Request){
 if(req.method!=='GET'||!/Lark|Feishu/i.test(req.headers.get('user-agent')||'')||!measurableRequest(req))return false;
 const params=new URL(req.url).searchParams;
 // The opened browser may retain the app UA. Never send it around a launch loop.
 return !['lk_mobile_jump_to_browser','lk_jump_to_browser'].some(key=>['true','1'].includes(params.get(key)||''));
}

export function renderFeishuHandoff(req:Request){
 const response=htmlPage('在系统浏览器中继续',
  '<h1>在系统浏览器中继续</h1><p>正在尝试打开此短链。若没有自动切换，请点击下方按钮。</p><button id="open-browser" type="button">在系统浏览器中继续</button><p id="open-status" role="status">进入浏览器后继续访问。</p>',
  feishuHandoffScript(req.url));
 response.headers.set('Vary','User-Agent');response.headers.set('X-Content-Type-Options','nosniff');return response;
}
