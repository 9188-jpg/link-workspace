import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {WorkspaceLoader,workspaceKey,currentWorkspace,removeWorkspaceLinks,bootstrapWorkspace} from '../src/client/workspace-loader.ts';
import {readWorkspace} from '../src/workspace-read.ts';
import {day} from '../src/feature-types.ts';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const scope={view:'links',domain:'',q:'',from:day(),to:day(),traffic:'verified'};

test('switching views, domains, dates or traffic hides the previous snapshot before a response arrives',()=>{
 const historical={key:workspaceKey({...scope,view:'analytics'}),view:'analytics',value:{items:[{id:'deleted',deleted_at:1}]}};
 assert.equal(currentWorkspace(historical,workspaceKey(scope)),null);
 const active={key:workspaceKey(scope),view:'links',value:{items:[{id:'live'}]}};
 assert.equal(currentWorkspace(active,workspaceKey(scope)),active.value,'same-scope refresh can retain current rows');
 for(const change of [{domain:'other'},{q:'new'},{from:'2026-01-01'},{to:'2026-01-02'},{traffic:'legacy'}])assert.equal(currentWorkspace(active,workspaceKey({...scope,...change})),null);
});

test('slow requests cannot replace a newer response, even when the transport ignores cancellation',async()=>{
 const loader=new WorkspaceLoader(),old=deferred(),fresh=deferred();let oldSignal;
 const a=loader.load(signal=>{oldSignal=signal;return old.promise;});
 const b=loader.load(()=>fresh.promise);assert(oldSignal.aborted);
 fresh.resolve({items:[{id:'current'}]});assert.deepEqual(await b,{value:{items:[{id:'current'}]}});
 old.resolve({items:[{id:'obsolete'}]});assert.equal(await a,null);
});

test('a successful deletion removes active rows immediately and prevents older reads resurrecting them',async()=>{
 const loader=new WorkspaceLoader(),pending=deferred();const read=loader.load(()=>pending.promise);
 const snapshot={key:workspaceKey(scope),view:'links',value:{items:[{id:'gone'},{id:'keep'}]}};
 loader.invalidate();const updated=removeWorkspaceLinks(snapshot,['gone']);
 assert.deepEqual(updated.value.items,[{id:'keep'}]);assert.equal(snapshot.value.items.length,2);
 pending.resolve(snapshot.value);assert.equal(await read,null);
 const history={...snapshot,view:'analytics'};assert.equal(removeWorkspaceLinks(history,['gone']),history,'historical analytics must be retained');
});

test('stale errors stay silent; current errors can be retried; unmount cancels pending work',async()=>{
 const loader=new WorkspaceLoader(),old=deferred();const a=loader.load(()=>old.promise);
 const failure=await loader.load(async()=>{throw new Error('offline');});assert.equal(failure.error.message,'offline');
 old.reject(new Error('stale failure'));assert.equal(await a,null);
 assert.deepEqual(await loader.load(async()=>({ok:true})),{value:{ok:true}});
 const pending=deferred(),read=loader.load(()=>pending.promise);loader.invalidate();pending.resolve('late');assert.equal(await read,null);
});

test('logged-in startup needs one workspace request and reuses its response; guests still see setup/login',async()=>{
 const paths=[],value={user:{id:'u'},items:[]};
 const state=await bootstrapWorkspace(async(path,options)=>{paths.push(path);assert.equal(options.cache,'no-store');return Response.json(value);},new AbortController().signal);
 assert.equal(paths.length,1);assert(paths[0].startsWith('/api/workspace?'));
 assert.deepEqual(currentWorkspace(state.initial,workspaceKey(state.scope)),value);
 const guestPaths=[];const guest=await bootstrapWorkspace(async path=>{guestPaths.push(path);return path==='/auth/status'?Response.json({initialized:false}):new Response('',{status:401});},new AbortController().signal);
 assert.equal(guest.initialized,false);assert.equal(guestPaths.length,2);
 await assert.rejects(bootstrapWorkspace(async()=>new Response('',{status:500}),new AbortController().signal),/服务连接失败/);
});

test('batched workspace reads preserve ownership, soft-delete history, daily data and private option boundaries',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  for(const name of ['0001_initial.sql','0002_free_features.sql','0003_verified_traffic.sql'])db.exec(readFileSync(new URL('../cloudflare/migrations/'+name,import.meta.url),'utf8'));
  db.exec("INSERT INTO users VALUES('u','Owner','owner',1,0),('m','Member','member',1,0); INSERT INTO domains(id,origin,host,name,status,is_default,created_at) VALUES('d','https://short.test','short.test','Test','active',1,0),('other','https://other.test','other.test','Other','active',0,0)");
  const link=db.prepare('INSERT INTO links(id,domain_id,owner_id,slug,title,target,mode,enabled,created_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
  link.run('live','d','u','live','Live','https://example.org/','page',1,1,null);
  link.run('deleted','d','u','deleted','Deleted','https://example.org/','page',0,0,1);
  link.run('member','other','m','member','Member','https://example.net/','direct',1,0,null);
  db.prepare('INSERT INTO link_options(link_id,config,password_hash,access_count) VALUES(?,?,?,?)').run('live',JSON.stringify({guideText:'Custom guide'}),'PRIVATE_PASSWORD_HASH',9);
  const visit=db.prepare('INSERT INTO visits(id,link_id,browser,day,timestamp,verified) VALUES(?,?,?,?,?,?)');
  visit.run('a','live','v1',day(),Date.now(),1);visit.run('b','deleted','v2',day(),Date.now(),1);visit.run('c','member','v3',day(),Date.now(),1);visit.run('old','live','v4',day(),Date.now(),0);
  let batches=0;
  const read=queries=>{batches++;assert(queries.length<15);return Promise.resolve(queries.map(q=>db.prepare(q.sql).all(...q.args)));};
  const u={id:'u',name:'Owner',email:'owner',admin:false},request=params=>new Request('https://short.test/api/workspace?'+new URLSearchParams(params));
  const list=await readWorkspace(request({view:'links'}),u,read);assert.equal(batches,1);assert.deepEqual(list.items.map(r=>r.id),['live']);assert(list.items[0].hasPassword);assert.equal(list.items[0].access_count,9);assert(!JSON.stringify(list).includes('PRIVATE_PASSWORD_HASH'));assert(!('_options_config' in list.items[0]));
  const report=await readWorkspace(request({view:'analytics',from:day(),to:day(),link:'deleted'}),u,read);assert.equal(batches,2);assert.equal(report.daily[0].visits,2);assert.equal(report.detail[0].visits,1);assert(report.items.some(r=>r.id==='deleted'));assert(!report.items.some(r=>r.id==='member'));
  const other=await readWorkspace(request({view:'analytics',domain:'other'}),u,read);assert.equal(other.items.length,0);assert.equal(other.sparkline.length,0);
  await assert.rejects(readWorkspace(request({view:'analytics',link:'member'}),u,read),{status:404});
  const before=batches;await assert.rejects(readWorkspace(request({view:'users'}),u,read),{status:403});await assert.rejects(readWorkspace(request({view:'analytics',from:'bad'}),u,read),{status:400});assert.equal(batches,before,'invalid requests must fail before any batch');
 }finally{db.close();}
});
