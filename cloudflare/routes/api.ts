import {readWorkspace} from '../../src/workspace-read.ts';
import {features} from '../features.ts';
import { all,one,run,user,requireAdmin,mutationGuard,targetUrl,domainOrigin,fail,scope,slugValue,randomSlug,day,db,readBatch } from '../core.ts';
export const dynamic='force-dynamic';
function response(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
function error(e:any){return response({error:e.message?.includes('UNIQUE constraint')?'该域名或短码已存在，请换一个':e.status?e.message:'服务暂时不可用，请稍后重试'},e.status||500);}
export async function GET(req:Request){try{
 const started=performance.now(),u=await user(req),authenticated=performance.now();
 const result=await readWorkspace(req,u,readBatch);
 return Response.json(result,{headers:{'Cache-Control':'private, no-store','Vary':'Cookie','Server-Timing':`auth;dur=${(authenticated-started).toFixed(1)}, workspace;dur=${(performance.now()-authenticated).toFixed(1)}`}});
 }catch(e){return error(e);}}
export async function POST(req:Request){try{
 mutationGuard(req);const u=await user(req);if(Number(req.headers.get('content-length')||0)>131072)fail('请求内容过大');const b=await req.json() as any;
 if(b.action==='link.save')return response(await features.saveLink(u,b));
 else if(['link.toggle','link.delete'].includes(b.action)){
 await features.policy(u,'edit');const item=await one('SELECT * FROM links WHERE id=? AND deleted_at IS NULL',b.id);if(!item||(!u.admin&&item.owner_id!==u.id))fail('链接不存在',404);
 if(b.action==='link.delete')await run('UPDATE links SET restore_enabled=enabled,deleted_at=?,enabled=0 WHERE id=?',Date.now(),item.id);else await run('UPDATE links SET enabled=? WHERE id=?',item.enabled?0:1,item.id);
 }else if(b.action==='domain.save'){
 if(!u.admin&&b.isDefault)fail('只有管理员可以设置全站默认域名',403);const name=String(b.name||'').trim().slice(0,80),status=b.status||'active';if(!['active','paused','disabled'].includes(status))fail('域名状态无效');if(b.isDefault&&status!=='active')fail('默认域名必须处于正常状态');
 if(b.id){const old=await one('SELECT * FROM domains WHERE id=?',b.id);if(!old)fail('域名不存在',404);if(!u.admin&&old.owner_id!==u.id)fail('无权修改此域名',403);if(old.is_default&&status!=='active')fail('请先将其他正常域名设为默认');const stmts=[];if(b.isDefault)stmts.push(db().prepare('UPDATE domains SET is_default=0'));stmts.push(db().prepare('UPDATE domains SET name=?,status=?,is_default=? WHERE id=?').bind(name,status,b.isDefault||old.is_default?1:0,b.id));await db().batch(stmts);}
 else{if(b.isDefault)fail('请先完成域名绑定，再编辑设为默认');if(!u.admin){const policy=await features.route.settings();const count=await one('SELECT count(*) n FROM domains WHERE owner_id=?',u.id);if(policy.domainLimit&&Number(count?.n)>=policy.domainLimit)fail('自有域名数量已达上限');}const origin=domainOrigin(b.origin),host=new URL(origin).host,id=crypto.randomUUID(),stmts=[];if(b.isDefault)stmts.push(db().prepare('UPDATE domains SET is_default=0'));stmts.push(db().prepare("INSERT INTO domains (id,origin,host,name,status,is_default,created_at,owner_id) VALUES (?,?,?,?,'paused',?,?,?)").bind(id,origin,host,name,0,Date.now(),u.admin?null:u.id));await db().batch(stmts);}
 }else if(b.action==='user.toggle'){requireAdmin(u);if(b.id===u.id)fail('不能停用管理员本人');await run('UPDATE users SET enabled=CASE WHEN enabled=1 THEN 0 ELSE 1 END WHERE id=?',b.id);
 }else if(b.action==='settings.save'){requireAdmin(u);const fallback=b.fallback?targetUrl(b.fallback):'';await db().batch([db().prepare("INSERT INTO settings (key,value) VALUES ('registration',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(b.registration?'1':'0'),db().prepare("INSERT INTO settings (key,value) VALUES ('fallback',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(fallback)]);
 }else if(b.action==='account.save'){const name=String(b.name||'').trim();if(name.length<1||name.length>80)fail('昵称需为 1–80 个字符');await run('UPDATE users SET name=? WHERE id=?',name,u.id);
 }else fail('未知操作');return response({ok:true});
 }catch(e){return error(e);}}

