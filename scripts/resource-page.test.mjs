import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {renderResourcePage,resourceDestination} from '../src/resource-page.ts';

const target='https://pan.quark.cn/s/d2191782c35e?pwd=ab12#list';
const android='Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 TwitterAndroid';
const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Twitter for iPhone';
const safari='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1';
const render=(ua=android,title='测试分享',url=target)=>renderResourcePage({title,target:url,nonce:'test-nonce',userAgent:ua});

test('normal browsers keep the exact web destination and never request a native app',()=>{
 for(const ua of ['',safari,'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36']){
  const d=resourceDestination(target,ua);assert.equal(d.launch,target);assert.equal(d.appLaunch,false);assert.equal(d.inApp,false);
  const page=render(ua);assert(page.includes('class="browser"'));assert(!page.includes('href="quark:'));assert(!page.includes('href="https://unet.ucweb.com/'));
 }
});

test('Android in-app handoff contains the exact share, including extraction code and fragment',()=>{
 const d=resourceDestination(target,android);assert.equal(d.launch,'quark://open?url='+encodeURIComponent(target));assert.equal(d.appLaunch,true);
 assert(!render().includes('不打开应用，访问网页版'));assert(!render().includes('id="web-resource"'));assert(!render().includes('如果没有这个选项'));assert(render().includes('在浏览器中打开'));assert(render().includes('referrerpolicy="no-referrer"'));assert(!render().includes('lk_jump_to_browser'));
});

test('iOS handoff preserves the share ID, extraction code, and exact web fallback',()=>{
 const d=resourceDestination(target,iphone),outer=new URL(d.launch);
 assert.equal(outer.origin,'https://unet.ucweb.com');assert.equal(outer.pathname,'/quarkcloud/ulcall');
 const app=new URL(outer.searchParams.get('ucLink')),destination=new URL(app.searchParams.get('url'));
 const params=JSON.parse(destination.searchParams.get('qk_params'));
 assert.equal(params.params.query.pwd_id,'d2191782c35e');assert.equal(params.params.query.passcode,'ab12');
 const fallback=new URL(outer.searchParams.get('downLink'));assert.equal(fallback.searchParams.get('downLink'),target);
 assert(!d.launch.includes('download.quark.cn'));
});

test('unrelated or spoofed targets never receive a Quark handoff',()=>{
 for(const url of ['https://pan.quark.cn.evil.example/s/abc','https://evil.example/s/abc','http://pan.quark.cn/s/abc','https://pan.quark.cn/not-a-share']){
  const d=resourceDestination(url,android);assert.equal(d.quark,false);assert.equal(d.launch,url);
 }
 for(const url of ['javascript:alert(1)','data:text/html,hello','https://user:pass@example.com/'])assert.throws(()=>resourceDestination(url,android));
});

test('untrusted titles, target URLs, and nonces cannot inject markup or a second script',()=>{
 const page=renderResourcePage({title:'<img src=x onerror=alert(1)>',target:'https://example.com/?q=</script><script>alert(2)</script>',nonce:'x" onload="alert(3)',userAgent:android});
 assert(!page.includes('<img src=x'));assert(page.includes('&lt;img'));assert.equal((page.match(/<script\b/g)||[]).length,1);
 assert(page.includes('nonce="x&quot; onload=&quot;alert(3)"'));assert(page.includes('\\u003c/script>'));
});

function runtime({ua=android,clipboard=true,copySuccess=true}={}){
 const ids=['resource-url','copy-resource','copy-label','resource-status','open-resource','copy-browser-link'];
 const elements=Object.fromEntries(ids.map(id=>[id,{value:target,textContent:'',events:{},focus(){},select(){},setSelectionRange(){},addEventListener(type,handler){this.events[type]=handler;}}]));
 const writes=[],timers=[];let syncCopies=0;
 const context={document:{activeElement:null,visibilityState:'visible',getElementById:id=>elements[id],execCommand(){syncCopies++;return copySuccess;},addEventListener(){}},navigator:clipboard?{clipboard:{writeText:async value=>{writes.push(value);}}}:{},setTimeout:callback=>{timers.push(callback);return timers.length;},clearTimeout(){}};
 const script=render(ua).match(/<script nonce="test-nonce">([\s\S]*?)<\/script>/)[1];
 vm.runInNewContext(script,context);
 return {elements,writes,timers,syncCopies:()=>syncCopies};
}

test('loading the page performs no clipboard write, clipboard action or automatic navigation',()=>{
 const r=runtime();assert.equal(r.writes.length,0);assert.equal(r.syncCopies(),0);assert.equal(r.timers.length,1);
 assert.equal(typeof r.elements['open-resource'].events.click,'function');
 const normal=runtime({ua:safari});normal.elements['open-resource'].events.click();assert.equal(normal.timers.length,1);assert.equal(normal.syncCopies(),0);
});

test('the copy button copies the target, not the short link or app handoff',async()=>{
 const r=runtime();await r.elements['copy-resource'].events.click();
 assert.deepEqual(r.writes,[target]);assert.equal(r.elements['copy-label'].textContent,'已复制');
});

test('clipboard denial falls back to selection and never reports false success',async()=>{
 const r=runtime({clipboard:false,copySuccess:false});await r.elements['copy-resource'].events.click();
 assert.equal(r.syncCopies(),1);assert(r.elements['resource-status'].textContent.includes('手动复制'));assert.equal(r.elements['copy-label'].textContent,'复制');
});

test('native handoff makes one click request and does not claim it succeeded',()=>{
 const r=runtime();r.elements['open-resource'].events.click();assert.equal(r.syncCopies(),1);assert.equal(r.timers.length,2);
 assert(r.elements['resource-status'].textContent.includes('尝试'));r.timers.at(-1)();assert(r.elements['resource-status'].textContent.includes('如未打开'));
});

test('resource header uses the link title and the requested concise fallback wording',()=>{const page=render(android,'我的链接标题');assert(page.includes('<strong id="resource-title">我的链接标题</strong>'));assert(!page.includes('<h1 id="resource-title">'));assert(page.includes('若未自动打开，请复制链接在浏览器中打开。'));assert(!page.includes('也可以复制网盘链接，稍后访问。'));});

test('all browser contexts show the three requested reference areas consistently',()=>{for(const ua of ['',android,iphone,safari]){const page=render(ua);assert(page.includes('<span class="dot"></span>点击获取资源</div>'));assert(page.includes('点击下方按钮获取资源；若未自动打开，请复制链接在浏览器中打开。'));assert(!page.includes('你的资源，已准备就绪'));assert(!page.includes('确认下方链接，点击按钮继续访问。'));assert(page.includes('点击下方的 <span class="menu">⋮</span> 或 <span class="menu">…</span>'));assert(page.includes('按钮，选择「在浏览器中打开」。'));assert(page.includes('<section class="guide"'));assert(!page.includes('<details class="guide"'));assert(!page.includes('id="copy-browser-link"'));}});
