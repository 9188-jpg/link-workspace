import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {defaultBrowserIntent,safariTarget,middleTarget} from '../cloudflare/browser-probe/github-browser-strategies.js';
const root=new URL('../',import.meta.url),target=middleTarget;
const original=await readFile(new URL('outputs/github-inapp-escape-index.js',root),'utf8');
const minimal=await readFile(new URL('outputs/github-astro-escape.ts',root),'utf8');
const reports=[];
for(const [name,userAgent] of [['android-x','Mozilla/5.0 Android TwitterAndroid'],['iphone-x','Mozilla/5.0 iPhone Twitter']]){
 const writes=[],timers=[];let success=0,fallback=0;
 const location={replace:value=>writes.push(value)};Object.defineProperty(location,'href',{set:value=>writes.push(value)});
 const window={location,open:value=>{writes.push(value);return {closed:false};}};
 vm.runInNewContext(original.replace(/^export\s+/gm,''),{window,navigator:{userAgent},setTimeout:callback=>{timers.push(callback);return timers.length;},encodeURIComponent,console},{timeout:1000});
 const attempted=window.IAppEscape.escape(target,{onSuccess:()=>success++,onFallback:()=>fallback++});
 if(name==='android-x'){assert.equal(attempted,true);assert.equal(success,1);assert(writes[0].includes('package=com.android.chrome'));assert.equal(timers.length,1);timers[0]();assert.equal(writes[1],target);}
 else{assert.equal(attempted,false);assert.equal(fallback,1);assert.equal(success,0);assert.equal(writes.length,0);}
 reports.push({project:'marco1cc/inapp-escape',environment:name,attempted,successCallbackCalls:success,fallbackCalls:fallback,navigationRequests:writes,realDeviceSwitchVerified:false});
}
const compiled=ts.transpileModule(minimal,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exported={};vm.runInNewContext(compiled,{exports:exported,require:()=>({detectPlatform:ua=>/Android/.test(ua)?'android':/iPhone/.test(ua)?'ios':'other'}),URL},{timeout:1000});
const intent=exported.buildAndroidIntentUrl(target);assert.equal(intent,defaultBrowserIntent(target));assert(!intent.includes('package='));assert(intent.includes('/github-browser-1116#Intent;scheme=https;end'));
assert.equal(exported.decideEscape(true,'iPhone Twitter'),'banner');
assert.equal(safariTarget(target),'x-safari-https://link-share-9188.pages.dev/github-browser-1116');
assert.throws(()=>defaultBrowserIntent('javascript:alert(1)'));assert.throws(()=>safariTarget('https://user:pw@example.org/'));
reports.push({project:'vdaluz/astro-inapp-escape',androidIntent:intent,iosAction:'banner',defaultBrowserPackagePinned:false,realDeviceSwitchVerified:false});
const probeSource=(await readFile(new URL('cloudflare/browser-probe/github-browser-strategies.js',root),'utf8')).replace(/^export\s+/gm,'');
for(const [name,userAgent,run,expected] of [['android-auto','Mozilla/5.0 Android TwitterAndroid','android-auto',intent],['safari-auto','Mozilla/5.0 iPhone Twitter','safari-auto',safariTarget(target)],['desktop-reject','Mozilla/5.0 Windows Chrome','android-auto',null]]){
 const writes=[],elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{textContent:''});return elements.get(id);};
 const location={search:'?run='+run};Object.defineProperty(location,'href',{set:value=>writes.push(value)});
 vm.runInNewContext(probeSource,{URL,URLSearchParams,navigator:{userAgent,platform:'',maxTouchPoints:0},document:{getElementById:get,querySelectorAll:()=>[]},location,window:{location,open:value=>{writes.push(value);return null;}}},{timeout:1000});
 assert.deepEqual(writes,expected?[expected]:[]);assert(!get('probe-status').textContent.includes('已成功'));
 reports.push({project:'isolated-test-page',environment:name,requestCount:writes.length,destination:writes[0]||null,realDeviceSwitchVerified:false});
}
await writeFile(new URL('outputs/github-browser-code-test-results.json',root),JSON.stringify({sourceHashes:{inappEscape:createHash('sha256').update(original).digest('hex'),astroEscape:createHash('sha256').update(minimal).digest('hex')},reports},null,2));
console.log('PASS: upstream Android and iPhone/X control flow, exact minimal-default-browser URI, correct middle-page target, and no false claim of real-device success.');
console.log(JSON.stringify(reports,null,2));
