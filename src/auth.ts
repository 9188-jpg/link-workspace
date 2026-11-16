import {createHash,randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {sqlite,database} from './database.ts';
const scrypt=promisify(scryptCallback);
const ttl=7*86400000;
export function authError(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
function hash(value:string){return createHash('sha256').update(value).digest('hex');}
function constantEqual(a:string,b:string){return timingSafeEqual(Buffer.from(hash(a),'hex'),Buffer.from(hash(b),'hex'));}
function credential(value:any){const username=String(value.username||'').trim().toLowerCase(),password=String(value.password||'');if(!/^[a-z0-9_]{3,32}$/.test(username)||password.length<12||password.length>128)authError('账号需为 3–32 位字母、数字或下划线，密码需为 12–128 位');return {username,password};}
export function initialized(){return !!sqlite.prepare("SELECT value FROM settings WHERE key='owner'").get();}
export function guard(req:Request){if(req.headers.get('X-Requested-With')!=='link-workspace')authError('请求校验失败',403);const origin=req.headers.get('Origin');if(origin&&origin!==new URL(req.url).origin)authError('不允许跨站请求',403);}
const limits=new Map<string,{n:number,end:number}>();
function rate(key:string){const now=Date.now();for(const [k,v] of limits)if(v.end<now)limits.delete(k);const state=limits.get(key)||{n:0,end:now+900000};state.n++;limits.set(key,state);if(state.n>20)authError('尝试次数过多，请 15 分钟后重试',429);}
function cookie(token:string,req:Request,age=604800){return `lw_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(req.url).protocol==='https:'?'; Secure':''}`;}
function issue(userId:string,req:Request){sqlite.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());const token=randomBytes(32).toString('hex');sqlite.prepare('INSERT INTO sessions (token_hash,user_id,expires) VALUES (?,?,?)').run(hash(token),userId,Date.now()+ttl);return Response.json({ok:true},{headers:{'Set-Cookie':cookie(token,req),'Cache-Control':'no-store'}});}
export function sessionUser(req:Request){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)lw_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)authError('请先登录',401);const current=sqlite.prepare('SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>?').get(hash(token!),Date.now()) as any;if(!current)authError('登录已过期，请重新登录',401);if(!current.enabled)authError('账号已停用',403);const owner=sqlite.prepare("SELECT value FROM settings WHERE key='owner'").get() as any;current.admin=owner?.value===current.id;return current;}
export async function auth(req:Request,path:string,clientKey:string){
 if(path==='/auth/status')return Response.json({initialized:initialized(),registrationOpen:(sqlite.prepare("SELECT value FROM settings WHERE key='registration'").get() as any)?.value==='1'},{headers:{'Cache-Control':'no-store'}});
 if(path==='/auth/logout'){
  const origin=req.headers.get('Origin');if((origin&&origin!==new URL(req.url).origin)||req.headers.get('sec-fetch-site')==='cross-site')authError('不允许跨站请求',403);
  const token=req.headers.get('cookie')?.match(/(?:^|;\s*)lw_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(token)sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));return new Response(null,{status:303,headers:{Location:'/', 'Set-Cookie':cookie('',req,0),'Cache-Control':'no-store'}});
 }
 if(req.method!=='POST')authError('不支持的请求方式',405);
 guard(req);rate('ip:'+clientKey);
 const body=await req.json() as any;
 if(path==='/auth/password'){
  const current=sessionUser(req),account=sqlite.prepare('SELECT * FROM accounts WHERE user_id=?').get(current.id) as any;
  const oldPassword=String(body.currentPassword||'');if(oldPassword.length>128)authError('当前密码不正确',401);
  const [oldSalt,stored]=account.password.split(':');const oldHash=await scrypt(oldPassword,oldSalt,64) as Buffer;if(!timingSafeEqual(oldHash,Buffer.from(stored,'hex')))authError('当前密码不正确',401);
  const {password}=credential({username:account.username,password:body.password});const salt=randomBytes(16).toString('hex'),derived=await scrypt(password,salt,64) as Buffer;
  database.batch([database.prepare('UPDATE accounts SET password=? WHERE user_id=?').bind(salt+':'+derived.toString('hex'),current.id),database.prepare('DELETE FROM sessions WHERE user_id=?').bind(current.id)]);
  return issue(current.id,req);
 }
 if(path==='/auth/setup'||path==='/auth/register'){
  const setup=path==='/auth/setup';
  if(setup){if(initialized())authError('管理员已创建',409);const token=process.env.SETUP_TOKEN||'';if(token.length<24)authError('服务尚未配置初始化密钥',503);if(!constantEqual(token,String(body.token||'')))authError('初始化密钥不正确',403);}
  else if(!initialized()||(sqlite.prepare("SELECT value FROM settings WHERE key='registration'").get() as any)?.value!=='1')authError('当前不开放注册',403);
  const {username,password}=credential(body);const salt=randomBytes(16).toString('hex');const derived=await scrypt(password,salt,64) as Buffer;const id=crypto.randomUUID();
  const stmts=[database.prepare('INSERT INTO users (id,name,email,enabled,created_at) VALUES (?,?,?,1,?)').bind(id,String(body.name||username).slice(0,80),username,Date.now()),database.prepare('INSERT INTO accounts (user_id,username,password) VALUES (?,?,?)').bind(id,username,salt+':'+derived.toString('hex'))];
  if(setup){const origin=new URL(req.url).origin;stmts.push(database.prepare("INSERT INTO settings (key,value) VALUES ('owner',?)").bind(id),database.prepare("INSERT INTO domains (id,origin,host,name,status,is_default,created_at) VALUES (?,?,?,?,'active',1,?)").bind(crypto.randomUUID(),origin,new URL(origin).host,'默认域名',Date.now()));}
  try{database.batch(stmts);}catch(e:any){if(String(e.message).includes('UNIQUE'))authError(setup&&initialized()?'管理员已创建':'账号已存在',409);throw e;}
  return issue(id,req);
 }
 if(path==='/auth/login'){
  const username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');if(username.length>32||password.length>128)authError('账号或密码不正确',401);rate('account:'+username);
  const account=sqlite.prepare('SELECT a.*,u.enabled FROM accounts a JOIN users u ON a.user_id=u.id WHERE username=?').get(username) as any;
  const [salt,stored]=(account?.password||'00000000000000000000000000000000:'+''.padEnd(128,'0')).split(':');const derived=await scrypt(password,salt,64) as Buffer;
  if(!account||!timingSafeEqual(derived,Buffer.from(stored,'hex')))authError('账号或密码不正确',401);if(!account.enabled)authError('账号已停用',403);limits.delete('account:'+username);return issue(account.user_id,req);
 }
 authError('页面不存在',404);
}
