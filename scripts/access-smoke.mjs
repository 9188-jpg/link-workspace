// End-to-end authorization checks against a disposable local Node or Pages DB.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),pages=process.argv.includes('--pages'),execute=promisify(execFile);
await mkdir(resolve(root,'outputs'),{recursive:true});
const directory=await mkdtemp(resolve(root,'outputs','access-test-')),port=String(33000+Math.floor(Math.random()*7000)),origin='http://127.0.0.1:'+port;
const password=randomBytes(24).toString('base64url'),setupToken='LOCAL_TEST_ONLY_INITIALIZATION_TOKEN_123456',pepper=randomBytes(32).toString('hex');
let child,logs='',admin='';const passed=[];
async function start(){
 const args=pages?['node_modules/wrangler/bin/wrangler.js','pages','dev','--cwd','cloudflare/pages','--ip','127.0.0.1','--port',port,'--persist-to',directory,'--binding','SETUP_TOKEN='+setupToken,'--binding','AUTH_PEPPER='+pepper]:['src/server.ts'];
 child=spawn(process.execPath,args,{cwd:root,env:{...process.env,PORT:port,HOST:'127.0.0.1',DATA_DIR:directory,SETUP_TOKEN:setupToken,AUTH_PEPPER:pepper,PUBLIC_ORIGIN:origin,RENDER:'',WRANGLER_SEND_METRICS:'false',CLOUDFLARE_CF_FETCH_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout: '+logs)),45000);child.stderr.on('data',b=>logs+=b);child.stdout.on('data',b=>{logs+=b;if(String(b).includes(pages?'Ready on':'listening')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code+': '+logs));});});
}
async function stop(){if(!child||child.exitCode!==null)return;const exit=new Promise(resolve=>child.once('exit',resolve));if(pages&&process.platform==='win32')await execute('taskkill',['/PID',String(child.pid),'/T','/F']).catch(()=>{});else child.kill();await exit;}
async function req(path,body,cookie=admin,team='',extra={}){return fetch(origin+path,{redirect:'manual',...extra,headers:{...(cookie?{Cookie:cookie}:{}),...(team?{'X-Workspace-Team':team}:{}),...(body?{'Content-Type':'application/json','X-Requested-With':'link-workspace',Origin:origin}:{}),...extra.headers},...(body?{method:'POST',body:JSON.stringify(body)}:{})});}
async function ok(path,body,cookie=admin,team=''){const r=await req(path,body,cookie,team),data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
async function denied(status,path,body,cookie=admin,team='',extra={}){const r=await req(path,body,cookie,team,extra);assert.equal(r.status,status,await r.text());}
const cookies=r=>r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
async function login(username,p=password){const r=await req('/auth/login',{username,password:p},'');assert.equal(r.status,200,await r.clone().text());return cookies(r);}
async function create(username){return (await ok('/api/access',{action:'user.create',username,password,name:username})).id;}
async function member(teamId,username,role,cookie=admin){return ok('/api/access',{action:'member.save',teamId,username,role},cookie);}
try{
 if(pages)await execute(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','link-workspace-db','--local','--persist-to',directory],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'},timeout:45000});
 await start();
 await denied(401,'/api/access',undefined,'');
 const setup=await req('/auth/setup',{token:setupToken,username:'admin',password},'');assert.equal(setup.status,200,await setup.clone().text());admin=cookies(setup);
 for(const body of ['null','{bad json'])await denied(400,'/api/access',undefined,admin,'',{method:'POST',body,headers:{'Content-Type':'application/json','X-Requested-With':'link-workspace',Origin:origin}});
 const leaderId=await create('leader'),editorId=await create('editor'),viewerId=await create('viewer'),outsiderId=await create('outsider');
 const leader=await login('leader'),editor=await login('editor'),viewer=await login('viewer'),outsider=await login('outsider');
 await denied(409,'/api/access',{action:'user.create',username:'editor',name:'duplicate',password});
 await denied(403,'/api/access',{action:'user.create',username:'illegal',password},editor);
 await denied(403,'/api/access',{action:'team.create',name:'illegal',leaderId},leader);
 await denied(403,'/api/access',{action:'team.create',name:'csrf',leaderId},admin,'',{headers:{Origin:'https://evil.example'}});
 const a=(await ok('/api/access',{action:'team.create',name:'运营一组',leaderId})).id;
 const b=(await ok('/api/access',{action:'team.create',name:'运营二组',leaderId:outsiderId})).id;
 await denied(409,'/api/access',{action:'team.create',name:'运营一组',leaderId});
 await member(a,'editor','editor',leader);await member(a,'viewer','viewer',leader);
 const listing=await ok('/api/access?team='+a,undefined,leader);assert(!('users' in listing));assert.equal(listing.members.length,3);assert.equal(listing.teams.length,1);
 assert.equal((await ok('/api/access')).users.length,5,'team principals are not login users');
 await denied(403,'/api/access?team='+b,undefined,editor);
 await denied(403,'/api/access',{action:'member.save',teamId:a,username:'outsider',role:'editor'},editor);
 await denied(400,'/api/access',{action:'member.save',teamId:a,username:'leader',role:'viewer'},leader);
 await denied(403,'/api/workspace',undefined,outsider,a);
 await denied(403,'/api/workspace',undefined,editor,b);
 await denied(403,'/api/workspace',undefined,editor,'forged-team');
 passed.push('users, membership management, exact team authorization and CSRF');
 const workspace=await ok('/api/workspace',undefined,editor,a),domainId=workspace.domains[0].id;
 assert.equal(workspace.user.id,a);assert.equal(workspace.user.actorId,editorId);assert.equal(workspace.user.admin,false);
 const link=await ok('/api/workspace',{action:'link.save',domainId,slug:'team-one',title:'团队资源',target:'https://example.com/',mode:'page'},editor,a);
 const link2=await ok('/api/workspace',{action:'link.save',domainId,slug:'team-two',target:'https://example.org/',mode:'page'},outsider,b);
 const personal=await ok('/api/workspace',{action:'link.save',domainId,slug:'personal-link',target:'https://example.net/',mode:'page'},editor);
 assert.deepEqual((await ok('/api/workspace',undefined,viewer,a)).items.map(x=>x.id),[link.id]);
 assert.deepEqual((await ok('/api/workspace',undefined,editor)).items.map(x=>x.id),[personal.id]);
 for(const body of [{action:'link.save',id:link.id,target:'https://example.net/',mode:'direct'},{action:'link.delete',id:link.id},{action:'domain.save',origin:'https://read-only.example'}])await denied(403,'/api/workspace',body,viewer,a);
 await denied(403,'/api/features',{action:'group.save',name:'forbidden'},viewer,a);
 await denied(404,'/api/workspace',{action:'link.delete',id:link2.id},editor,a);
 await denied(404,'/api/workspace',{action:'link.delete',id:personal.id},editor,a);
 await denied(403,'/api/workspace',{action:'settings.save',registration:true},admin,a,'team context must not inherit global admin');
 const doc=await ok('/api/features',{action:'document.save',kind:'page',name:'团队内容',body:{title:'团队内容',blocks:[{id:'t',type:'text',text:'团队内容'}]}},editor,a);
 assert((await ok('/api/features?section=documents',undefined,viewer,a)).items.some(x=>x.id===doc.id));
 assert(!(await ok('/api/features?section=documents',undefined,outsider,b)).items.some(x=>x.id===doc.id));
 await denied(404,'/api/features',{action:'document.delete',id:doc.id},outsider,b);
 await ok('/api/features',{action:'document.publish',id:doc.id},editor,a);
 assert.equal((await req('/p/'+doc.id,undefined,'')).status,200);
 passed.push('personal/team resource, document and readonly write isolation');
 await member(a,'editor','viewer',leader);
 await denied(403,'/api/workspace',{action:'link.delete',id:link.id},editor,a);
 await ok('/api/access',{action:'member.remove',teamId:a,username:'editor'},leader);
 await denied(403,'/api/workspace',undefined,editor,a);
 assert((await ok('/api/workspace',undefined,leader,a)).items.some(x=>x.id===link.id),'removing creator retains team assets');
 await member(a,'editor','editor',leader);
 await denied(403,'/api/features',{action:'key.create',name:'forbidden'},editor,a);
 await denied(403,'/api/features',{action:'partner.create',id:link.id},editor,a);
 const key=await ok('/api/features',{action:'key.create',name:'团队接口'},leader,a);
 const partner=await ok('/api/features',{action:'partner.create',id:link.id},leader,a);
 await denied(409,'/api/access',{action:'user.update',id:leaderId,name:'leader',role:'member',enabled:false});
 let team=(await ok('/api/access')).teams.find(x=>x.id===a);
 await ok('/api/access',{action:'team.update',id:a,name:team.name,leaderId:editorId,enabled:true,revision:team.revision});
 await denied(409,'/api/access',{action:'team.update',id:a,name:'stale',leaderId,enabled:true,revision:team.revision});
 const current=(await ok('/api/access')).teams.find(x=>x.id===a);
 const edits=await Promise.all(['并发一组','并发二组'].map(name=>req('/api/access',{action:'team.update',id:a,name,leaderId:editorId,enabled:true,revision:current.revision})));
 assert.deepEqual(edits.map(r=>r.status).sort(),[200,409],'only one concurrent team edit may commit');
 await denied(403,'/api/workspace',undefined,leader,a);
 const teamKeys=await ok('/api/features?section=keys',undefined,editor,a);assert.equal(teamKeys.items.find(x=>x.id===key.id).enabled,0);
 assert.equal((await req(new URL(partner.url).pathname,undefined,'')).status,404);
 await ok('/api/access',{action:'user.update',id:leaderId,name:'停用成员',role:'member',enabled:false});
 await denied(401,'/api/workspace',undefined,leader);
 await denied(403,'/auth/login',{username:'leader',password},'');
 passed.push('immediate revocation, retained ownership, leader transfer and credential invalidation');
 team=(await ok('/api/access')).teams.find(x=>x.id===a);
 await ok('/api/access',{action:'team.update',id:a,name:team.name,leaderId:editorId,enabled:false,revision:team.revision});
 await denied(403,'/api/workspace',undefined,viewer,a);
 assert.equal((await req('/team-one',undefined,'')).status,404);assert.equal((await req('/p/'+doc.id,undefined,'')).status,404);
 team=(await ok('/api/access')).teams.find(x=>x.id===a);
 await ok('/api/access',{action:'team.update',id:a,name:team.name,leaderId:editorId,enabled:true,revision:team.revision});
 assert.equal((await req('/team-one',undefined,'')).status,200);assert.equal((await req('/p/'+doc.id,undefined,'')).status,200);
 assert.equal((await ok('/api/features?section=keys',undefined,editor,a)).items.find(x=>x.id===key.id).enabled,0,'reenabling must not resurrect revoked keys');
 await ok('/api/access',{action:'user.update',id:outsiderId,name:'delegated',role:'admin',enabled:true});
 await denied(401,'/api/access',undefined,outsider);
 const delegated=await login('outsider'),rootId=(await ok('/api/access')).actor.id;
 await denied(403,'/api/access',{action:'user.update',id:viewerId,name:'viewer',role:'admin',enabled:true},delegated);
 await denied(400,'/api/access',{action:'user.update',id:rootId,name:'owner',role:'member',enabled:false},delegated);
 await denied(400,'/api/workspace',{action:'user.toggle',id:rootId},delegated);
 await ok('/api/access',{action:'user.update',id:outsiderId,name:'outsider',role:'member',enabled:true});
 await denied(401,'/api/access',undefined,delegated);
 const newPassword=randomBytes(24).toString('base64url');
 await ok('/api/access',{action:'user.password',id:viewerId,password:newPassword});
 await denied(401,'/api/workspace',undefined,viewer);
 await denied(401,'/auth/login',{username:'viewer',password},'');
 const newViewer=await login('viewer',newPassword);
 assert((await ok('/api/workspace',undefined,newViewer,a)).items.some(x=>x.id===link.id));
 await stop();await start();
 assert((await ok('/api/workspace',undefined,newViewer,a)).items.some(x=>x.id===link.id));
 assert((await ok('/api/access?team='+a)).audit.length>=8);
 passed.push('team suspension/restoration, administrator protection, reset and restart persistence');
 await writeFile(resolve(directory,'receipt.json'),JSON.stringify({runtime:pages?'Pages':'Node',passed,date:new Date().toISOString()},null,2));
 console.log('PASS '+(pages?'Pages':'Node')+': '+passed.join('; '));console.log('Evidence: '+resolve(directory,'receipt.json'));
}finally{await stop();}
