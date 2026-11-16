import {database,getEnv} from './database.ts';
// Cloudflare production rejects PBKDF2 above 100,000 iterations, unlike local workerd.
// A separate secret peppers the derived hash, so a database dump alone cannot verify guesses.
const ttl=7*86400000,iterations=100000,passwordFormat='pbkdf2-hmac';
const encoder=new TextEncoder();
const hex=(value:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(value instanceof Uint8Array?value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength):value),v=>v.toString(16).padStart(2,'0')).join('');
const random=(n:number)=>hex(crypto.getRandomValues(new Uint8Array(n)));
async function digest(value:string){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
function equal(a:string,b:string){let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;}
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
async function one(sql:string,...args:any[]):Promise<any>{return database.prepare(sql).bind(...args).first();}
async function run(sql:string,...args:any[]){return database.prepare(sql).bind(...args).run();}
async function derive(password:string,salt:string){const pepper=getEnv().AUTH_PEPPER||'';if(pepper.length<32)throw new Error('AUTH_PEPPER must be configured before password authentication');const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations},key,256);const hmac=await crypto.subtle.importKey('raw',encoder.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',hmac,bits));}
async function encodedPassword(password:string){const salt=random(16);return `${passwordFormat}$${iterations}$${salt}$${await derive(password,salt)}`;}
async function verify(password:string,stored:string){const parts=stored.split('$');if(parts.length!==4||parts[0]!==passwordFormat||Number(parts[1])!==iterations)return false;return equal(await derive(password,parts[2]),parts[3]);}
function credentials(body:any){const username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');if(!/^[a-z0-9_]{3,32}$/.test(username)||password.length<12||password.length>128)fail('账号需为 3–32 位字母、数字或下划线，密码需为 12–128 位');return {username,password};}
export async function initialized(){return !!await one("SELECT value FROM settings WHERE key='owner'");}
function guard(req:Request){if(req.headers.get('X-Requested-With')!=='link-workspace')fail('请求校验失败',403);const origin=req.headers.get('Origin');if(origin&&origin!==new URL(req.url).origin)fail('不允许跨站请求',403);}
async function rate(key:string){const now=Date.now(),bucket=Math.floor(now/900000);const opaque=await digest((getEnv().AUTH_PEPPER||getEnv().SETUP_TOKEN||'')+':'+key+':'+bucket);
 await run('INSERT INTO auth_limits (key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1',opaque,(bucket+1)*900000);
 const row=await one('SELECT attempts FROM auth_limits WHERE key=?',opaque);if(row.attempts>20)fail('尝试次数过多，请稍后重试',429);
 await run('DELETE FROM auth_limits WHERE key IN (SELECT key FROM auth_limits WHERE expires<? LIMIT 100)',now);
}
function cookie(token:string,req:Request,age=604800){return `lw_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(req.url).protocol==='https:'?'; Secure':''}`;}
async function issue(userId:string,req:Request){const token=random(32);await run('DELETE FROM sessions WHERE expires<?',Date.now());await run('INSERT INTO sessions (token_hash,user_id,expires) VALUES (?,?,?)',await digest(token),userId,Date.now()+ttl);return Response.json({ok:true},{headers:{'Set-Cookie':cookie(token,req),'Cache-Control':'no-store'}});}
export async function sessionUser(req:Request){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)lw_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)fail('请先登录',401);const current=await one('SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>?',await digest(token!),Date.now());if(!current)fail('登录已过期，请重新登录',401);if(!current.enabled)fail('账号已停用',403);const owner=await one("SELECT value FROM settings WHERE key='owner'");current.admin=owner?.value===current.id;return current;}
export async function auth(req:Request,path:string){
 if(path==='/auth/status')return Response.json({initialized:await initialized(),registrationOpen:(await one("SELECT value FROM settings WHERE key='registration'"))?.value==='1'},{headers:{'Cache-Control':'no-store'}});
 if(path==='/auth/logout'){
  const origin=req.headers.get('Origin');if((origin&&origin!==new URL(req.url).origin)||req.headers.get('sec-fetch-site')==='cross-site')fail('不允许跨站请求',403);
  const token=req.headers.get('cookie')?.match(/(?:^|;\s*)lw_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(token)await run('DELETE FROM sessions WHERE token_hash=?',await digest(token));return new Response(null,{status:303,headers:{Location:'/', 'Set-Cookie':cookie('',req,0),'Cache-Control':'no-store'}});
 }
 if(req.method!=='POST')fail('不支持的请求方式',405);guard(req);
 await rate('client:'+(req.headers.get('CF-Connecting-IP')||'local'));
 const body=await req.json() as any;
 if(path==='/auth/password'){
  const current=await sessionUser(req),account=await one('SELECT * FROM accounts WHERE user_id=?',current.id),old=String(body.currentPassword||'');if(old.length>128||!await verify(old,account.password))fail('当前密码不正确',401);
  const {password}=credentials({username:account.username,password:body.password});await database.batch([database.prepare('UPDATE accounts SET password=? WHERE user_id=?').bind(await encodedPassword(password),current.id),database.prepare('DELETE FROM sessions WHERE user_id=?').bind(current.id)]);return issue(current.id,req);
 }
 if(path==='/auth/setup'||path==='/auth/register'){
  const setup=path==='/auth/setup';
  if(setup){if(await initialized())fail('管理员已创建',409);const token=getEnv().SETUP_TOKEN||'';if(token.length<24)fail('服务尚未配置初始化密钥',503);if(!equal(await digest(token),await digest(String(body.token||''))))fail('初始化密钥不正确',403);}
  else if(!await initialized()||(await one("SELECT value FROM settings WHERE key='registration'"))?.value!=='1')fail('当前不开放注册',403);
  const {username,password}=credentials(body),id=crypto.randomUUID(),stored=await encodedPassword(password);
  const featurePolicy=JSON.parse((await one("SELECT value FROM settings WHERE key='features'"))?.value||'{}'),pending=!setup&&!!featurePolicy.requireApproval;
  const stmts=[database.prepare('INSERT INTO users (id,name,email,enabled,created_at) VALUES (?,?,?,?,?)').bind(id,String(body.name||username).slice(0,80),username,pending?0:1,Date.now()),database.prepare('INSERT INTO accounts (user_id,username,password) VALUES (?,?,?)').bind(id,username,stored)];
  if(setup){const origin=new URL(req.url).origin;stmts.push(database.prepare("INSERT INTO settings (key,value) VALUES ('owner',?)").bind(id),database.prepare("INSERT INTO domains (id,origin,host,name,status,is_default,created_at) VALUES (?,?,?,?,'active',1,?)").bind(crypto.randomUUID(),origin,new URL(origin).host,'默认域名',Date.now()));}
  try{await database.batch(stmts);}catch(e:any){if(String(e.message).includes('UNIQUE'))fail(setup&&await initialized()?'管理员已创建':'账号已存在',409);throw e;}
  if(pending)return Response.json({ok:true,pending:true},{headers:{'Cache-Control':'no-store'}});
  return issue(id,req);
 }
 if(path==='/auth/login'){
  const username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');if(username.length>32||password.length>128)fail('账号或密码不正确',401);await rate('account:'+username);
  const account=await one('SELECT a.*,u.enabled FROM accounts a JOIN users u ON a.user_id=u.id WHERE username=?',username);
  const stored=account?.password||`${passwordFormat}$${iterations}$00000000000000000000000000000000$${'0'.repeat(64)}`;
  if(!await verify(password,stored)||!account)fail('账号或密码不正确',401);if(!account.enabled)fail('账号已停用',403);return issue(account.user_id,req);
 }
 fail('页面不存在',404);
}
