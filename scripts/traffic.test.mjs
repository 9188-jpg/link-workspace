import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {measurableRequest,visibleOnceScript} from '../src/traffic.ts';
import {documentFeatures} from '../src/feature-documents.ts';
import {randomCode} from '../src/link-rules.ts';

test('known preview clients, bots and speculative loads cannot be measured',()=>{
 for(const agent of ['Twitterbot/1.0','facebookexternalhit/1.1','TelegramBot','WhatsApp/2','Slackbot-LinkExpanding','Googlebot','FeishuUrlPreview'])assert.equal(measurableRequest(new Request('https://a.test',{headers:{'User-Agent':agent}})),false,agent);
 for(const purpose of ['prefetch','prefetch;prerender','preview'])assert.equal(measurableRequest(new Request('https://a.test',{headers:{'Sec-Purpose':purpose}})),false);
 assert(measurableRequest(new Request('https://a.test',{headers:{'User-Agent':'Mozilla/5.0 Android TwitterAndroid'}})));
});
test('hidden and prerendered documents wait for visibility and emit at most once',()=>{
 const handlers={},timers=new Map();let measured=0,sequence=0;
 const document={visibilityState:'hidden',prerendering:false,addEventListener:(key,fn)=>handlers[key]=fn};
 vm.runInNewContext(visibleOnceScript('measure();'),{document,measure:()=>measured++,setTimeout:fn=>{timers.set(++sequence,fn);return sequence;},clearTimeout:id=>timers.delete(id)});
 assert.equal(timers.size,0);document.visibilityState='visible';document.prerendering=true;handlers.visibilitychange();assert.equal(timers.size,0);
 document.prerendering=false;handlers.prerenderingchange();assert.equal(timers.size,1);for(const f of timers.values())f();assert.equal(measured,1);
 handlers.visibilitychange();assert.equal(measured,1);
});
test('migration preserves old records as legacy rather than silently treating them as verified',()=>{
 const db=new DatabaseSync(':memory:');for(const p of ['0001_initial.sql','0002_free_features.sql'])db.exec(readFileSync(new URL('../cloudflare/migrations/'+p,import.meta.url),'utf8'));
 db.exec("INSERT INTO users(id,name,email,enabled,created_at) VALUES('u','Test','u',1,0); INSERT INTO domains(id,origin,host,name,status,is_default,created_at) VALUES('d','https://example.test','example.test','Test','active',1,0); INSERT INTO links(id,domain_id,owner_id,slug,title,target,mode,enabled,created_at) VALUES('old','d','u','old','Old','https://example.org/','page',1,0)");
 db.exec("INSERT INTO visits(id,link_id,browser,day,timestamp) VALUES('legacy','old','browser','2026-11-16',1)");
 db.exec(readFileSync(new URL('../cloudflare/migrations/0003_verified_traffic.sql',import.meta.url),'utf8'));
 assert.equal(db.prepare('SELECT verified FROM visits').get().verified,0);assert.equal(db.prepare('SELECT count(*) n FROM visits').get().n,1);db.close();
});
test('new default codes use six URL-safe characters',()=>{for(let i=0;i<100;i++)assert.match(randomCode(),/^[a-zA-Z0-9]{6}$/);});

test('short alias preserves path and source parameters without creating another measured visit',async()=>{const alias=(await import('../cloudflare/short-alias/_worker.js')).default;const r=alias.fetch(new Request('https://lk9188.pages.dev/Ab3x9Q?lk_mobile_jump_to_browser=true&utm_source=x'));assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://link-share-9188.pages.dev/Ab3x9Q?lk_mobile_jump_to_browser=true&utm_source=x');assert.equal(r.headers.get('referrer-policy'),'no-referrer');});

test('a template countdown neither redirects nor reports actions while hidden',async()=>{
 const database=new DatabaseSync(':memory:');for(const p of ['0001_initial.sql','0002_free_features.sql','0003_verified_traffic.sql'])database.exec(readFileSync(new URL('../cloudflare/migrations/'+p,import.meta.url),'utf8'));
 database.exec("INSERT INTO users(id,name,email,enabled,created_at) VALUES('u','User','u',1,0)");const published=JSON.stringify({title:'Timer',blocks:[],delay:1});database.prepare("INSERT INTO documents(id,owner_id,kind,name,draft,published,created_at,updated_at) VALUES('t','u','template','Timer',?,?,0,0)").run(published,published);
 function statement(sql,args=[]){return {bind(...values){return statement(sql,values);},first(){return database.prepare(sql).get(...args)||null;},all(){return {results:database.prepare(sql).all(...args)};},run(){return database.prepare(sql).run(...args);}};}
 const service=documentFeatures({db:{prepare:statement,batch:stmts=>stmts.map(s=>s.run())},user:()=>({id:'u'}),pepper:()=>''});
 const response=await service.template(new Request('https://short.test/t'),'t','https://example.org/share','test-token'),html=await response.text(),script=html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1],timers=[],requests=[],destinations=[];
 const elements={'continue':{addEventListener(){}},copy:{addEventListener(){}},'delay-status':{textContent:''}};
 const document={visibilityState:'hidden',prerendering:false,addEventListener(){},getElementById:id=>elements[id]||null,querySelectorAll:()=>[]};
 vm.runInNewContext(script,{document,fetch:(_url,init)=>{requests.push(JSON.parse(init.body).kind);return Promise.resolve({});},setInterval:fn=>{timers.push(fn);return timers.length;},clearInterval(){},setTimeout(){},clearTimeout(){},location:{replace:url=>destinations.push(url)}});
 for(let i=0;i<5;i++)timers[0]();assert.equal(requests.length,0);assert.equal(destinations.length,0);
 document.visibilityState='visible';timers[0]();timers[0]();assert.deepEqual(requests,['redirect']);assert.deepEqual(destinations,['https://example.org/share']);database.close();
});
