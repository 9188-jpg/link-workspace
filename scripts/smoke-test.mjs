import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {browserShareUrl} from '../src/share-url.ts';
const root=resolve(import.meta.dirname,'..');
const pages=process.argv.includes('--pages');
const cloudflare=pages||process.argv.includes('--cloudflare');
const execute=promisify(execFile);
await mkdir(resolve(root,'outputs'),{recursive:true});
const directory=await mkdtemp(resolve(root,'outputs','test-db-'));
const setupToken=cloudflare?'LOCAL_TEST_ONLY_INITIALIZATION_TOKEN_123456':randomBytes(32).toString('hex'),password=randomBytes(24).toString('base64url');
const authPepper=randomBytes(32).toString('hex');
const port=String(23000+Math.floor(Math.random()*10000)),origin='http://127.0.0.1:'+port;
let child,adminCookie='',memberCookie='';
async function start(){const args=pages?[resolve(root,'node_modules/wrangler/bin/wrangler.js'),'pages','dev','--cwd','cloudflare/pages','--ip','127.0.0.1','--port',port,'--persist-to',directory,'--binding','SETUP_TOKEN='+setupToken,'--binding','AUTH_PEPPER='+authPepper]:cloudflare?['node_modules/wrangler/bin/wrangler.js','dev','--local','--ip','127.0.0.1','--port',port,'--persist-to',directory,'--var','SETUP_TOKEN:'+setupToken,'--var','AUTH_PEPPER:'+authPepper]:['src/server.ts'];child=spawn(process.execPath,args,{cwd:root,env:{...process.env,PORT:port,HOST:'127.0.0.1',DATA_DIR:directory,SETUP_TOKEN:setupToken,PUBLIC_ORIGIN:origin,RENDER:'',CLOUDFLARE_CF_FETCH_ENABLED:'false',WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});let logs='';child.stderr.on('data',b=>{logs+=b;});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server failed to start: '+logs)),45000);child.stdout.on('data',b=>{logs+=b;if(String(b).includes(cloudflare?'Ready on':'listening')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited: '+code+' '+logs));});});}
async function stop(){if(!child||child.exitCode!==null)return;const exited=new Promise(resolve=>child.once('exit',resolve));if(cloudflare&&process.platform==='win32')await execute('taskkill',['/PID',String(child.pid),'/T','/F']).catch(()=>{});else child.kill();await exited;}
async function req(path,body,cookie='',extra={}){return fetch(origin+path,{redirect:'manual',...extra,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json','X-Requested-With':'link-workspace',Origin:origin}:{}),...extra.headers},...(body?{method:'POST',body:JSON.stringify(body)}:{})});}
async function json(path,body,cookie=adminCookie){const r=await req(path,body,cookie);const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
const cookies=r=>r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
try{
 if(cloudflare)await execute(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','link-workspace-db','--local','--persist-to',directory],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'},timeout:45000});
 await start();assert.equal((await req('/healthz')).status,200);assert.equal((await req('/')).status,200);
 assert.equal((await req('/api/workspace')).status,401);
 assert.equal((await req('/api/workspace',undefined,'',{headers:{'oai-authenticated-user-id':'forged','oai-authenticated-user-email':'forged@example.com'}})).status,401,'platform headers must not authenticate on Render');
 assert.equal((await req('/auth/setup',{token:'wrong',username:'admin',password})).status,403);
 const setup=await req('/auth/setup',{token:setupToken,username:'admin',password});assert.equal(setup.status,200,await setup.clone().text());adminCookie=cookies(setup);assert(adminCookie);
 assert.equal((await req('/auth/setup',{token:setupToken,username:'other',password})).status,409);
 let workspace=await json('/api/workspace');assert(workspace.user.admin);const domainId=workspace.domains[0].id;
 const link=await json('/api/workspace',{action:'link.save',domainId,slug:'shared-demo',title:'<script>escaped</script>',target:'https://example.com/path?q=1#fragment',mode:'page'});
 const direct=await json('/api/workspace',{action:'link.save',domainId,slug:'direct-demo',target:'https://example.org/',mode:'direct'});
 await req('/shared-demo',undefined,'',{method:'HEAD'});assert.equal((await json('/api/workspace')).stats.visits,0);
 const feishuAgent='Mozilla/5.0 Android Lark/7.20.5';
 for(const slug of ['shared-demo','direct-demo']){const gate=await req('/'+slug,undefined,'',{headers:{'User-Agent':feishuAgent}}),body=await gate.text();assert.equal(gate.status,200);assert(body.includes('id="open-browser"'));assert(body.includes("window.open(target,'NO_INTERCEPT')"));assert(!body.includes('const eventToken='));const marked=await req('/'+slug+'?lk_mobile_jump_to_browser=true&lk_jump_to_browser=true',undefined,'',{headers:{'User-Agent':feishuAgent}}),content=await marked.text();assert(!content.includes('id="open-browser"'),'marked arrival must not loop');assert(slug==='direct-demo'?content.includes('location.replace("https://example.org/")'):content.includes('id="resource-title"'),'handoff must retain direct/page behavior');}
 assert.equal((await json('/api/workspace')).stats.visits,0,'handoff requests must not record visits');
 const previewGate=await (await req('/shared-demo',undefined,'',{headers:{'User-Agent':'LarkUrlPreviewBot'}})).text();assert(!previewGate.includes('id="open-browser"'));
 const publicShare=new URL(browserShareUrl(origin+'/shared-demo'));
 let publicPage=await req(publicShare.pathname+publicShare.search),html=await publicPage.text();assert.equal(publicPage.status,200);assert(html.includes('点击跳转'));assert(html.includes('&lt;script&gt;escaped&lt;/script&gt;'));assert(html.includes('q=1#fragment'));assert(!html.includes('lk_jump_to_browser'),'share flags must not alter the target');
 assert.equal((await json('/api/workspace')).stats.visits,0,'HTTP loading alone is not a confirmed visit');
 const token=html.match(/const eventToken="([^"]+)"/)[1],browserCookie=cookies(publicPage);
 const arrivals=await Promise.all(Array.from({length:8},()=>req('/api/public/event',{token,kind:'arrival'})));assert(arrivals.every(r=>r.status===200));
 await req('/shared-demo',undefined,browserCookie);const noCookie=await (await req('/shared-demo')).text();await req('/api/public/event',{token:noCookie.match(/const eventToken="([^"]+)"/)[1],kind:'arrival'});
 assert.equal((await json('/api/workspace')).stats.visits,1,'refreshes, concurrent reports and missing cookies must deduplicate');
 const preview=await (await req('/shared-demo',undefined,'',{headers:{'User-Agent':'Twitterbot/1.0'}})).text();await req('/api/public/event',{token:preview.match(/const eventToken="([^"]+)"/)[1],kind:'arrival'});assert.equal((await json('/api/workspace')).stats.visits,1,'platform previews cannot produce measured visits');
 await req('/api/public/event',{token,kind:'click'});await req('/api/public/event',{token,kind:'click'});assert.equal((await json('/api/features?section=overview')).totals.find(r=>r.kind==='click').total,1);
 assert.equal((await json('/api/workspace?traffic=legacy')).stats.visits,0);
 const directShare=new URL(browserShareUrl(origin+'/direct-demo'));
 const directPage=await req(directShare.pathname+directShare.search);assert.equal(directPage.status,200);const directHtml=await directPage.text();assert(directHtml.includes('location.replace("https://example.org/")'));assert(!directHtml.includes('lk_jump_to_browser'),'share flags must not alter the target');const directToken=directHtml.match(/token:"([^"]+)"/)[1];await req('/api/public/event',{token:directToken,kind:'redirect'});const directStats=await json('/api/features?section=overview');assert.equal(directStats.totals.find(r=>r.kind==='click').total,1,'automatic redirects are not button clicks');assert.equal(directStats.totals.find(r=>r.kind==='redirect').total,1);
 await json('/api/workspace',{action:'settings.save',registration:true,fallback:''});
 const member=await req('/auth/register',{username:'member',password});assert.equal(member.status,200,await member.clone().text());memberCookie=cookies(member);
 const memberData=await json('/api/workspace',undefined,memberCookie);assert(!memberData.user.admin);assert.equal(memberData.items.length,0);
 assert.equal((await req('/api/workspace?view=users',undefined,memberCookie)).status,403);
 assert.equal((await req('/api/workspace',{action:'link.save',id:link.id,target:'https://example.net/',mode:'direct'},memberCookie)).status,404);
 assert.equal((await req('/api/workspace',{action:'settings.save',registration:true},memberCookie)).status,403);
 await json('/api/workspace',{action:'link.toggle',id:direct.id});assert.equal((await req('/direct-demo')).status,404);
 await json('/api/workspace',{action:'link.delete',id:link.id});assert.equal((await req('/shared-demo')).status,404);assert.equal((await json('/api/workspace')).stats.visits,2);
 assert((await json('/api/workspace?view=analytics')).items.some(l=>l.id===link.id&&l.deleted_at));
 assert.equal((await req('/api/workspace',{action:'link.save',domainId,target:'javascript:alert(1)',mode:'direct'},adminCookie)).status,400);
 assert.equal((await req('/api/workspace',{action:'account.save',name:'bad'},adminCookie,{headers:{Origin:'https://evil.example'}})).status,403);
 await stop();await start();workspace=await json('/api/workspace');assert(workspace.user.admin);assert.equal(workspace.stats.visits,2);assert.equal(workspace.items.length,1,'data and sessions must survive restart');
 const badLogin=await req('/auth/login',{username:'admin',password:'wrong-password'});assert.equal(badLogin.status,401);
 const login=await req('/auth/login',{username:'admin',password});assert.equal(login.status,200);const session=cookies(login);assert((await json('/api/workspace',undefined,session)).user.admin);
 const newPassword=randomBytes(24).toString('base64url');
 assert.equal((await req('/auth/password',{currentPassword:'incorrect',password:newPassword},session)).status,401);
 const change=await req('/auth/password',{currentPassword:password,password:newPassword},session);assert.equal(change.status,200);assert.equal((await req('/api/workspace',undefined,session)).status,401,'password changes must revoke old sessions');
 const newSession=cookies(change);assert((await json('/api/workspace',undefined,newSession)).user.admin);
 assert.equal((await req('/auth/login',{username:'admin',password})).status,401);assert.equal((await req('/auth/login',{username:'admin',password:newPassword})).status,200);
 // Seed only this isolated test database with distinct visitors on separate Beijing dates.
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10),emptyDay=new Date(Date.parse(today)-2*86400000).toISOString().slice(0,10);
 const seedRows=[];for(const [id,n,verified] of [[link.id,2,1],[direct.id,3,1],[link.id,4,0]])for(let i=0;i<n;i++)seedRows.push([randomBytes(16).toString('hex'),id,'daily-test-'+verified+'-'+i,yesterday,Date.parse(yesterday+'T12:00:00+08:00')+i,verified]);
 if(cloudflare){const quote=v=>typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'",command=seedRows.map(row=>'INSERT INTO visits(id,link_id,browser,day,timestamp,verified) VALUES('+row.map(quote).join(',')+')').join(';');await execute(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','link-workspace-db','--local','--persist-to',directory,'--command',command],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'},timeout:45000});}
 else{const testDb=new DatabaseSync(resolve(directory,'workspace.sqlite'));for(const row of seedRows)testDb.prepare('INSERT INTO visits(id,link_id,browser,day,timestamp,verified) VALUES(?,?,?,?,?,?)').run(...row);testDb.close();}
 const dailyParams='?'+new URLSearchParams({view:'analytics',from:emptyDay,to:today});
 const dailyResult=await json('/api/workspace'+dailyParams,undefined,newSession);assert.deepEqual(dailyResult.daily.map(d=>d.visits),[0,5,2]);assert.equal(dailyResult.items.find(x=>x.id===link.id).visits,3);assert.equal(dailyResult.items.find(x=>x.id===direct.id).visits,4);
 assert.deepEqual(dailyResult.linkDaily.filter(x=>x.link_id===link.id).map(x=>[x.date,x.visits]),[[yesterday,2],[today,1]]);assert.equal(dailyResult.linkDaily.reduce((n,x)=>n+x.visits,0),7);
 const linkDetail=await json('/api/workspace'+dailyParams+'&link='+link.id,undefined,newSession);assert.deepEqual(linkDetail.detail.map(x=>x.visits),[0,2,1]);assert(linkDetail.items.some(x=>x.id===link.id&&x.deleted_at),'deleted link daily history must remain visible');
 const reports='/api/features?'+new URLSearchParams({section:'trafficReport',kind:'links',from:emptyDay,to:today});
 const aggregateReport=await json(reports+'&domain='+domainId,undefined,newSession);
 const singleReport=await json(reports+'&domain='+domainId+'&id='+link.id,undefined,newSession);
 assert.deepEqual(aggregateReport.daily.map(x=>x.visits),[0,5,2]);
 assert.deepEqual(singleReport.daily.map(x=>[x.visits,x.clicks]),[[0,0],[2,0],[1,1]]);
 assert.equal(singleReport.lifetime.visits,3);assert.equal(singleReport.lifetime.clicks,1);
 assert(singleReport.ranking.every(item=>item.key===link.id),'single-link report stays isolated after deletion');
 assert.equal((await req(reports+'&id='+link.id+'&domain=unrelated',undefined,newSession)).status,404);
 assert.equal((await req(reports+'&id='+link.id,undefined,memberCookie)).status,404);
 const searched=await json('/api/workspace'+dailyParams+'&q=shared-demo',undefined,newSession);assert(searched.linkDaily.every(x=>x.link_id===link.id));assert.equal(searched.items.length,1);
 const legacyDaily=await json('/api/workspace'+dailyParams+'&traffic=legacy',undefined,newSession);assert.equal(legacyDaily.linkDaily.reduce((n,x)=>n+x.visits,0),4);
 const isolatedDaily=await json('/api/workspace'+dailyParams,undefined,memberCookie);assert.equal(isolatedDaily.linkDaily.length,0);assert.equal((await req('/api/workspace'+dailyParams+'&link='+link.id,undefined,memberCookie)).status,404);
 const emptyDomainDaily=await json('/api/workspace'+dailyParams+'&domain=no-such-domain',undefined,newSession);assert.equal(emptyDomainDaily.linkDaily.length,0);assert.equal(emptyDomainDaily.items.length,0);
 await req('/auth/logout',undefined,newSession);assert.equal((await req('/api/workspace',undefined,newSession)).status,401);
 console.log('PASS: isolated bootstrap, secure login/session, anonymous public links, role/ownership checks, direct and page redirects, escaping, deduplication, HEAD, disable/delete, per-link multi-day analytics with zero days, domain/search/owner isolation, legacy separation, retained analytics, validation, CSRF, restart persistence and logout.');
}finally{await stop();}



