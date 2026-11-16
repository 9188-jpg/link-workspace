import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const pages=process.argv.includes('--pages');
const cloudflare=pages||process.argv.includes('--cloudflare');
const execute=promisify(execFile);
await mkdir(resolve(root,'outputs'),{recursive:true});
const directory=await mkdtemp(resolve(root,'outputs','test-db-'));
const setupToken=cloudflare?'LOCAL_TEST_ONLY_INITIALIZATION_TOKEN_123456':randomBytes(32).toString('hex'),password=randomBytes(24).toString('base64url');
const port=String(23000+Math.floor(Math.random()*10000)),origin='http://127.0.0.1:'+port;
let child,adminCookie='',memberCookie='';
async function start(){const args=pages?[resolve(root,'node_modules/wrangler/bin/wrangler.js'),'pages','dev','--cwd','cloudflare/pages','--ip','127.0.0.1','--port',port,'--persist-to',directory,'--binding','SETUP_TOKEN='+setupToken]:cloudflare?['node_modules/wrangler/bin/wrangler.js','dev','--local','--ip','127.0.0.1','--port',port,'--persist-to',directory,'--var','SETUP_TOKEN:'+setupToken]:['src/server.ts'];child=spawn(process.execPath,args,{cwd:root,env:{...process.env,PORT:port,HOST:'127.0.0.1',DATA_DIR:directory,SETUP_TOKEN:setupToken,PUBLIC_ORIGIN:origin,RENDER:'',CLOUDFLARE_CF_FETCH_ENABLED:'false',WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});let logs='';child.stderr.on('data',b=>{logs+=b;});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server failed to start: '+logs)),45000);child.stdout.on('data',b=>{logs+=b;if(String(b).includes(cloudflare?'Ready on':'listening')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited: '+code+' '+logs));});});}
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
 let publicPage=await req('/shared-demo'),html=await publicPage.text();assert.equal(publicPage.status,200);assert(html.includes('点击跳转'));assert(html.includes('&lt;script&gt;escaped&lt;/script&gt;'));assert(html.includes('q=1#fragment'));
 const browserCookie=cookies(publicPage);await req('/shared-demo',undefined,browserCookie);assert.equal((await json('/api/workspace')).stats.visits,1,'public visits must deduplicate');
 const directPage=await req('/direct-demo');assert((await directPage.text()).includes('location.replace('));
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
 await req('/auth/logout',undefined,newSession);assert.equal((await req('/api/workspace',undefined,newSession)).status,401);
 console.log('PASS: isolated bootstrap, secure login/session, anonymous public links, role/ownership checks, direct and page redirects, escaping, deduplication, HEAD, disable/delete, retained analytics, validation, CSRF, restart persistence and logout.');
}finally{await stop();}



