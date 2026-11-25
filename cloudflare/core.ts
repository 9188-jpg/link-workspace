import {reserved as reservedNames} from '../src/link-rules.ts';
import {database} from './database.ts';
import {workspaceUser} from './auth.ts';
export const day = (time=Date.now()) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
export function db(){ return database; }
export async function all(sql:string,...args:any[]){return (await db().prepare(sql).bind(...args).all()).results as any[];}
export async function readBatch(queries:import('../src/workspace-read.ts').WorkspaceQuery[]){return (await db().batch(queries.map(q=>db().prepare(q.sql).bind(...q.args)))).map(r=>r.results as any[]);}
export async function one(sql:string,...args:any[]){return db().prepare(sql).bind(...args).first() as any;}
export async function run(sql:string,...args:any[]){return db().prepare(sql).bind(...args).run();}
export function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
export function targetUrl(value:unknown){let u:URL;try{u=new URL(String(value));}catch{fail('请输入完整的 HTTP / HTTPS 网址');}if(!['http:','https:'].includes(u!.protocol)||u!.username||u!.password||u!.href.length>4096)fail('目标网址格式不受支持');return u!.href;}
export function domainOrigin(value:unknown){const u=new URL(targetUrl(value));if(u.pathname!=='/'||u.search||u.hash)fail('域名只需填写协议和域名，不含路径');return u.origin;}
export function mutationGuard(req:Request){if(req.headers.get('X-Requested-With')!=='link-workspace')fail('请求校验失败',403);const origin=req.headers.get('Origin');if(origin&&origin!==new URL(req.url).origin)fail('不允许跨站请求',403);}
export async function user(req:Request){ return workspaceUser(req); }
export function requireAdmin(u:any){if(!u.admin)fail('需要管理员权限',403);}
export const reserved=reservedNames;
export function slugValue(value:unknown){const s=String(value||'');if(!/^[a-zA-Z0-9_-]{3,64}$/.test(s)||reserved.has(s.toLowerCase()))fail('短码需为 3–64 位字母、数字、下划线或连字符，且不能使用保留名称');return s;}
export function randomSlug(){const a=new Uint8Array(8);crypto.getRandomValues(a);return Array.from(a,x=>'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[x%62]).join('');}
export function scope(u:any){return u.admin?{sql:'1=1',args:[] as any[]}:{sql:'l.owner_id=?',args:[u.id]};}
export function escapeHtml(value:unknown){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}

