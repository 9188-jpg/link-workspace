import {features} from '../features.ts';
import { all,one,run,user,requireAdmin,mutationGuard,targetUrl,domainOrigin,fail,scope,slugValue,randomSlug,day,db } from '../core.ts';
export const dynamic='force-dynamic';
function response(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
function error(e:any){return response({error:e.message?.includes('UNIQUE constraint')?'该域名或短码已存在，请换一个':e.status?e.message:'服务暂时不可用，请稍后重试'},e.status||500);}
export async function GET(req:Request){try{
 const u=await user(req),s=scope(u),p=new URL(req.url).searchParams;
 const domainId=p.get('domain')||'',search=(p.get('q')||'').slice(0,200),kind=p.get('view')||'links';
 const verified=p.get('traffic')==='legacy'?0:1;
 const domains=await all(`SELECT d.*, (SELECT count(*) FROM links l WHERE l.domain_id=d.id AND l.deleted_at IS NULL AND ${s.sql}) total, (SELECT count(*) FROM visits v JOIN links l ON l.id=v.link_id WHERE v.verified=${verified} AND l.domain_id=d.id AND ${s.sql}) visits FROM domains d WHERE (?=1 OR d.owner_id IS NULL OR d.owner_id=?) ORDER BY d.created_at`,...s.args,...s.args,u.admin?1:0,u.id);
 const filters=`${s.sql} AND (?='' OR l.domain_id=?)`,args=[...s.args,domainId,domainId];
 const stats=await one(`SELECT count(*) total,coalesce(sum(CASE WHEN l.enabled=1 AND d.status!='disabled' AND u.enabled=1 THEN 1 ELSE 0 END),0) active FROM links l JOIN domains d ON d.id=l.domain_id JOIN users u ON u.id=l.owner_id WHERE l.deleted_at IS NULL AND ${filters}`,...args);
 stats.visits=(await one(`SELECT count(*) n FROM visits v JOIN links l ON l.id=v.link_id WHERE v.verified=${verified} AND ${filters}`,...args)).n;
 stats.users=u.admin?(await one('SELECT count(*) n FROM users WHERE id!=?',u.id)).n:undefined;
 let result:any={user:{id:u.id,name:u.name,email:u.email,admin:u.admin},domains,stats,traffic:verified?'verified':'legacy'};
 if(kind==='links'){
 const rows=await all(`SELECT l.*,coalesce(d.public_origin,d.origin) origin,d.host,d.status domain_status,u.name owner_name,u.enabled owner_enabled,(SELECT count(*) FROM visits WHERE verified=${verified} AND link_id=l.id) visits FROM links l JOIN domains d ON d.id=l.domain_id JOIN users u ON u.id=l.owner_id WHERE l.deleted_at IS NULL AND ${filters} AND (?='' OR instr(lower(l.title||' '||l.target||' '||l.slug),lower(?))>0) ORDER BY l.created_at DESC`,...args,search,search);result.items=await features.enrich(rows);
 }
 if(kind==='analytics'){
 const from=p.get('from')||day(),to=p.get('to')||day();
 const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(!valid(from)||!valid(to)||from>to||to>day()||(Date.parse(to)-Date.parse(from))/86400000>365)fail('请选择不超过 366 天的有效日期范围');
 const daily=await all(`SELECT v.day,count(*) visits FROM visits v JOIN links l ON l.id=v.link_id WHERE v.verified=${verified} AND ${filters} AND v.day BETWEEN ? AND ? GROUP BY v.day ORDER BY v.day`,...args,from,to);
 const dates=[];for(let t=Date.parse(from);t<=Date.parse(to);t+=86400000)dates.push(new Date(t).toISOString().slice(0,10));
 result.daily=dates.map(date=>({date,visits:daily.find(x=>x.day===date)?.visits||0}));
 result.items=await all(`SELECT l.id,l.title,l.slug,coalesce(d.public_origin,d.origin) origin,d.host,l.deleted_at,count(v.id) visits FROM links l JOIN domains d ON d.id=l.domain_id LEFT JOIN visits v ON v.link_id=l.id AND v.verified=${verified} AND v.day BETWEEN ? AND ? WHERE ${filters} AND (?='' OR instr(lower(l.title||' '||l.slug),lower(?))>0) GROUP BY l.id ORDER BY visits DESC,l.created_at DESC`,from,to,...args,search,search);
 if(p.get('link')){const link=await one(`SELECT l.id FROM links l WHERE l.id=? AND ${filters}`,p.get('link'),...args);if(!link)fail('链接不存在',404);const list=await all(`SELECT day,count(*) visits FROM visits WHERE verified=${verified} AND link_id=? AND day BETWEEN ? AND ? GROUP BY day`,link.id,from,to);result.detail=dates.map(date=>({date,visits:list.find(x=>x.day===date)?.visits||0}));}
 }
 if(kind==='users'){requireAdmin(u);result.items=await all('SELECT id,name,email,enabled,created_at,(SELECT count(*) FROM links WHERE owner_id=users.id AND deleted_at IS NULL) link_count FROM users ORDER BY created_at');}
 if(kind==='settings'){requireAdmin(u);result.settings=Object.fromEntries((await all("SELECT key,value FROM settings WHERE key IN ('registration','fallback')")).map(x=>[x.key,x.value]));}
 result.sparkline=await all(`SELECT v.day,count(*) visits FROM visits v JOIN links l ON l.id=v.link_id WHERE v.verified=${verified} AND ${s.sql} AND v.timestamp>=? GROUP BY v.day ORDER BY v.day`,...s.args,Date.now()-7*86400000);result.groups=(await features.read(new Request(new URL('/api/features?section=groups',req.url)),u)).items;result.templates=await all("SELECT id,name,owner_id FROM documents WHERE kind='template' AND published IS NOT NULL AND deleted_at IS NULL AND owner_id=?",u.id);return response(result);
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

