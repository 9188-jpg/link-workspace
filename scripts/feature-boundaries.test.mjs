import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {Resvg} from '@resvg/resvg-js';
import jsQR from 'jsqr';
import {artSvg} from '../src/client/qr-art.ts';
import {qrPayload,cleanDocument,videoEmbed} from '../src/feature-documents.ts';
import {cleanOptions,selectTarget} from '../src/feature-routing.ts';
import {integrations} from '../src/feature-integrations.ts';
import {reserved} from '../src/link-rules.ts';

test('random and device selection remain independent of the presentation mode',()=>{
 const config=cleanOptions({strategy:'weighted',targets:[{url:'https://a.example/',weight:1},{url:'https://b.example/',weight:3}]});
 const request=new Request('https://short.example/demo');assert.equal(selectTarget(config,'https://fallback.example/',request,[],0),'https://a.example/');assert.equal(selectTarget(config,'https://fallback.example/',request,[],.9),'https://b.example/');
 assert.equal(selectTarget(cleanOptions({strategy:'device',devices:{ios:'https://ios.example/'}}),'https://fallback.example/',request),'https://fallback.example/');
 assert.equal(Object.hasOwn(config,'mode'),false);
});
test('rules use Beijing time, respect missing source data, and never match an empty condition',()=>{
 const request=new Request('https://short.example/demo?utm_source=x',{headers:{'User-Agent':'Mozilla/5.0 Android'}});Object.defineProperty(request,'cf',{value:{country:'CN',region:'Hubei',city:'Wuhan'}});
 const config=cleanOptions({strategy:'rules',rules:[{url:'https://empty.example/'},{url:'https://matched.example/',country:'CN',region:'Hubei',city:'Wuhan',device:'android',channel:'x',weekdays:[2],start:23,end:0}]});
 assert.equal(selectTarget(config,'https://fallback.example/',request,[],.2,Date.parse('2026-11-17T15:30:00Z')),'https://matched.example/');
 assert.equal(selectTarget(config,'https://fallback.example/',request,[],.2,Date.parse('2026-11-17T16:30:00Z')),'https://fallback.example/');
 assert.equal(selectTarget(config,'https://fallback.example/',new Request('https://short.example/demo'),[],.2,Date.parse('2026-11-17T15:30:00Z')),'https://fallback.example/');
});
test('unsafe protocols, script-bearing content, multiple lead forms and route conflicts are bounded',()=>{
 assert.throws(()=>cleanOptions({strategy:'weighted',targets:[{url:'javascript:alert(1)'}]}));assert.throws(()=>cleanOptions({limit:-1}));
 assert.throws(()=>cleanDocument({blocks:[{type:'form'},{type:'form'}]},'page'));
 assert.equal(cleanDocument({blocks:[{type:'script',text:'<script>bad</script>'}]},'page').blocks[0].type,'text');
 for(const name of ['_next','callback','assets','media','partner','legal'])assert(reserved.has(name));
 assert.equal(videoEmbed('https://evil.example/watch?v=abcdefghijk'),'');
 assert.equal(videoEmbed('https://www.youtube.com/watch?v=abcdefghijk'),'https://www.youtube.com/embed/abcdefghijk');
});
test('all QR content types decode from rendered pixels with square, rounded and dotted modules',()=>{
 const examples=[{type:'url',value:'https://example.com/s/资源?pwd=ab12'},{type:'text',value:'中文测试：你好，世界。'},{type:'wifi',ssid:'测试WiFi;name',password:'pw;:,',security:'WPA'},{type:'contact',name:'张三',phone:'12345',email:'test@example.com',address:'测试地址'},{type:'sms',phone:'+8612345',message:'你好'},{type:'email',email:'test@example.com',message:'资料'},{type:'phone',phone:'+8612345'}];
 for(const content of examples)for(const shape of ['square','rounded','dots']){
  const expected=qrPayload(content),svg=artSvg(expected,{shape,eyes:'rounded',ecc:'H'}),image=new Resvg(svg,{fitTo:{mode:'width',value:512},font:{loadSystemFonts:false}}).render();
  const decoded=jsQR(new Uint8ClampedArray(image.pixels),image.width,image.height);assert.equal(decoded?.data,expected,'QR decode failed: '+content.type+'/'+shape);
 }
});
test('local center logos retain a decodable URL and cannot contain injected SVG markup',()=>{
 const logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPs8AAAAASUVORK5CYII=',value='https://example.com/long-share?pwd=1234';
 const image=new Resvg(artSvg(value,{shape:'rounded',eyes:'rounded',logo}),{fitTo:{mode:'width',value:512},font:{loadSystemFonts:false}}).render();assert.equal(jsQR(new Uint8ClampedArray(image.pixels),image.width,image.height)?.data,value);
 assert.throws(()=>artSvg(value,{logo:'data:image/svg+xml,<svg onload="alert(1)"/>'}));
});
test('netdisk health only changes after confirmed failures, stays failed on network uncertainty, and recovers on success',async()=>{
 const database=new DatabaseSync(':memory:');database.exec(readFileSync(new URL('../cloudflare/migrations/0001_initial.sql',import.meta.url),'utf8'));database.exec(readFileSync(new URL('../cloudflare/migrations/0002_free_features.sql',import.meta.url),'utf8'));
 function statement(sql,args=[]){return {bind(...values){return statement(sql,values);},first(){return database.prepare(sql).get(...args)||null;},all(){return {results:database.prepare(sql).all(...args)};},run(){return database.prepare(sql).run(...args);}};}
 const db={prepare:statement,batch(stmts){return stmts.map(s=>s.run());}};
 database.prepare('INSERT INTO users(id,name,email,enabled,created_at) VALUES(?,?,?,1,0)').run('u','User','u');database.prepare("INSERT INTO domains(id,origin,host,name,status,is_default,created_at) VALUES('d','https://short.example','short.example','D','active',1,0)").run();
 database.prepare("INSERT INTO links(id,domain_id,owner_id,slug,title,target,mode,enabled,created_at) VALUES('l','d','u','test-link','Test','https://pan.quark.cn/s/test123','page',1,0)").run();
 const service=integrations({db,user:()=>({id:'u'}),pepper:()=>''}),originalFetch=globalThis.fetch;let outcome='failed',calls=0;
 globalThis.fetch=async()=>{calls++;if(outcome==='timeout')throw new Error('timeout');return Response.json(outcome==='healthy'?{code:0,data:{stoken:'test-token-not-persisted'}}:{code:41027,message:'分享不存在'});};
 try{const unsafe=await service.probe('https://127.0.0.1/private');assert.equal(unsafe.state,'unknown');assert.equal(calls,0);
  const link={id:'l',owner_id:'u',slug:'test-link',target:'https://pan.quark.cn/s/test123'};
  assert.equal((await service.checkHealth(link))[0].state,'unknown');assert.equal((await service.checkHealth(link))[0].state,'unknown');assert.equal((await service.checkHealth(link))[0].state,'failed');
  outcome='timeout';assert.equal((await service.checkHealth(link))[0].state,'failed');assert.equal(database.prepare('SELECT count(*) n FROM notifications').get().n,1);
  outcome='healthy';assert.equal((await service.checkHealth(link))[0].state,'healthy');assert(!JSON.stringify(database.prepare('SELECT * FROM link_health').all()).includes('stoken'));
 }finally{globalThis.fetch=originalFetch;database.close();}
});
