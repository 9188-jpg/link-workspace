import {reserved,randomCode} from './link-rules.ts';
import {type FeatureContext,type Row,statements,fail,safeUrl,text,uid,day,guard,reply,errors} from './feature-types.ts';
import {routing,cleanOptions} from './feature-routing.ts';
import {shareOrigin} from './share-url.ts';
import {ensureReportsTable} from './report-page.ts';
export function featureAdmin(ctx:FeatureContext){
 const db=ctx.db,{one,all,run}=statements(db),route=routing(ctx);
 const scope=(u:Row,alias='l')=>u.admin?{sql:'1=1',args:[]}:{sql:alias+'.owner_id=?',args:[u.id]};
 async function policy(u:Row,action:string){const p=await route.settings();if(!u.admin&&p.exemptUsers?.includes(u.id))return p;if(!u.admin&&(action==='create'&&p.allowCreate===false||action==='edit'&&p.allowEdit===false))fail(p.announcement||'站点暂时停止此操作',403);return p;}
 async function saveLink(u:Row,b:Row){
  const target=safeUrl(b.target),title=text(b.title),mode=b.mode;if(!['direct','page'].includes(mode))fail('请选择跳转方式');const p=await policy(u,b.id?'edit':'create');await route.allowedTarget(target);
  if(b.id){const item=await route.owned(u,text(b.id,50)),prepared=b.options?await route.prepareConfig(u,item.id,b.options):null;await db.batch([db.prepare('UPDATE links SET title=?,target=?,mode=? WHERE id=?').bind(title,target,mode,item.id),...(prepared?[prepared.statement]:[])]);return {ok:true,id:item.id};}
  if(!u.admin&&p.dailyQuota){const count=await one('SELECT count(*) n FROM links WHERE owner_id=? AND created_at>=?',u.id,Date.parse(day()+'T00:00:00+08:00'));if(Number(count?.n)>=p.dailyQuota)fail('今日创建额度已用完',429);}
  let domain=await one("SELECT * FROM domains WHERE status='active' AND (?=1 OR owner_id IS NULL OR owner_id=?) AND (?='pool' OR id=?) ORDER BY CASE WHEN ?='pool' THEN random() ELSE 0 END LIMIT 1",u.admin?1:0,u.id,b.domainId,b.domainId,b.domainId);if(!domain)fail('请选择正常启用的域名');const slug=b.slug?text(b.slug,64):randomCode();if(!/^[a-zA-Z0-9_-]{3,64}$/.test(slug)||reserved.has(slug.toLowerCase()))fail('短码格式无效或属于保留名称');
  const id=uid(),prepared=b.options?await route.prepareConfig(u,id,b.options,{owner_id:u.id,canonical_origin:domain.origin}):null;
  try {
   await db.batch([db.prepare('INSERT INTO links (id,domain_id,owner_id,slug,title,target,mode,enabled,created_at) VALUES (?,?,?,?,?,?,?,1,?)').bind(id,domain.id,u.id,slug,title,target,mode,Date.now()),...(prepared?[prepared.statement]:[])]);
  } catch (error) {
   if (String(error).includes('UNIQUE constraint failed: links.domain_id, links.slug')) fail('这个域名下已存在相同短码',409);
   throw error;
  }
  return {id,domainId:domain.id,shortUrl:shareOrigin(domain.origin,domain.public_origin||domain.origin,prepared?.config.shareAlias||'')+'/'+slug};
 }
 async function batchCreate(u:Row,b:Row){
  const rows=Array.isArray(b.items)?b.items:[];if(!rows.length||rows.length>100)fail('每次批量创建 1–100 条');const p=await policy(u,'create'),domains=await all("SELECT * FROM domains WHERE status='active' AND (?=1 OR owner_id IS NULL OR owner_id=?)",u.admin?1:0,u.id),blocked=p.blockedDomains||[],options=cleanOptions(b.options||{});
  if(b.options?.password)fail('批量创建后请逐条设置访问密码');if(options.groupId&&!await one('SELECT id FROM link_groups WHERE id=? AND owner_id=?',options.groupId,u.id))fail('分组不存在');if(options.templateId)fail('批量创建后请逐条选择中转模板');
  if(!u.admin&&p.dailyQuota){const n=await one('SELECT count(*) n FROM links WHERE owner_id=? AND created_at>=?',u.id,Date.parse(day()+'T00:00:00+08:00'));if(Number(n?.n)+rows.length>p.dailyQuota)fail('批量条数超过今日剩余额度',429);}
  const records=rows.map((row:Row,i:number)=>{const target=safeUrl(row.target),host=new URL(target).hostname;if(blocked.some((h:string)=>host===h||host.endsWith('.'+h)))fail('第 '+(i+1)+' 条目标已被停用');const choice=row.domainId||b.domainId;const domain=choice==='pool'?domains[Math.floor(Math.random()*domains.length)]:domains.find(d=>d.id===choice);if(!domain)fail('请选择正常启用的域名');const chosenOrigin=shareOrigin(domain.origin,domain.public_origin||domain.origin,options.shareAlias);if(options.shareAlias&&chosenOrigin!==options.shareAlias)fail('所选别名不属于这个域名');const slug=row.slug?text(row.slug,64):randomCode();if(!/^[a-zA-Z0-9_-]{3,64}$/.test(slug)||reserved.has(slug.toLowerCase()))fail('第 '+(i+1)+' 条短码不正确');if(!['direct','page'].includes(row.mode||b.mode||'page'))fail('跳转方式不正确');return {id:uid(),domain_id:domain.id,owner_id:u.id,slug,title:text(row.title),target,mode:row.mode||b.mode||'page',enabled:1,created_at:Date.now(),shortUrl:chosenOrigin+'/'+slug};});
  if(new Set(records.map(r=>r.domain_id+'/'+r.slug)).size!==records.length)fail('批量内容中存在重复短码');
  const stmts=[];for(let i=0;i<records.length;i+=10){const chunk=records.slice(i,i+10);stmts.push(db.prepare('INSERT INTO links (id,domain_id,owner_id,slug,title,target,mode,enabled,created_at) VALUES '+chunk.map(()=>'(?,?,?,?,?,?,?,?,?)').join(',')).bind(...chunk.flatMap(r=>[r.id,r.domain_id,r.owner_id,r.slug,r.title,r.target,r.mode,r.enabled,r.created_at])));}
  for(let i=0;i<records.length;i+=25){const chunk=records.slice(i,i+25);stmts.push(db.prepare('INSERT INTO link_options (link_id,config) VALUES '+chunk.map(()=>'(?,?)').join(',')).bind(...chunk.flatMap(r=>[r.id,JSON.stringify(options)])));}
  await db.batch(stmts);return {items:records.map(r=>({id:r.id,shortUrl:r.shortUrl})),count:records.length};
 }
 async function enrich(rows:Row[]){if(!rows.length)return rows;const options=await all('SELECT o.link_id,o.config,o.password_hash,o.access_count FROM link_options o');const map=new Map(options.map(o=>[o.link_id,o]));return rows.map(row=>{const option=map.get(row.id);return {...row,options:cleanOptions(JSON.parse(option?.config||'{}')),hasPassword:!!option?.password_hash,access_count:option?.access_count||0};});}
 async function readTasks(u:Row){const s=scope(u);return {unread:Number((await one('SELECT count(*) n FROM notifications WHERE owner_id=? AND read_at IS NULL',u.id))?.n||0),expiring:Number((await one(`SELECT count(*) n FROM links l JOIN link_options o ON o.link_id=l.id WHERE ${s.sql} AND l.deleted_at IS NULL AND json_extract(o.config,'$.expires') BETWEEN ? AND ?`,...s.args,Date.now(),Date.now()+7*86400000))?.n||0),drafts:Number((await one('SELECT count(*) n FROM documents WHERE owner_id=? AND published IS NULL AND deleted_at IS NULL',u.id))?.n||0)};}
 async function read(req:Request,u:Row){const p=new URL(req.url).searchParams,section=p.get('section')||'overview',s=scope(u),own=u.admin?'1=1':'owner_id=?',ownArgs=u.admin?[]:[u.id];
  if(section==='tasks')return {tasks:await readTasks(u)};
  if(section==='media')return {items:await all('SELECT id,name,mime,bytes,created_at FROM feature_assets WHERE owner_id=? AND deleted_at IS NULL ORDER BY created_at DESC',u.id)};
  if(section==='groups')return {items:await all('SELECT * FROM link_groups WHERE owner_id=? ORDER BY position,created_at',u.id)};
  if(section==='recycle')return {items:await all(`SELECT l.*,coalesce(d.public_origin,d.origin) origin,d.host FROM links l JOIN domains d ON d.id=l.domain_id WHERE l.deleted_at IS NOT NULL AND ${s.sql} ORDER BY l.deleted_at DESC`,...s.args)};
  if(section==='documents')return {items:await all(`SELECT d.id,d.owner_id,d.kind,d.name,d.draft,d.published,d.version,d.created_at,d.updated_at,(SELECT count(*) FROM document_events a WHERE a.document_id=d.id AND a.verified=1 AND a.kind='arrival') views,(SELECT count(DISTINCT visitor) FROM document_events a WHERE a.document_id=d.id AND a.verified=1 AND a.kind='arrival') visitors,(SELECT count(*) FROM leads a WHERE a.document_id=d.id) leads FROM documents d WHERE d.deleted_at IS NULL AND ${u.admin?'1=1':'d.owner_id=?'} ORDER BY d.updated_at DESC`,...ownArgs)};
  if(section==='versions'){const d=await documentOwned(u,text(p.get('id'),50));return {items:await all('SELECT * FROM document_versions WHERE document_id=? ORDER BY version DESC LIMIT 30',d.id)};}
  if(section==='reports'){if(!u.admin)fail('需要管理员权限',403);await ensureReportsTable(ctx.db);return {items:await all('SELECT * FROM reports ORDER BY created_at DESC LIMIT 500')};}
  if(section==='leads')return {items:await all(`SELECT a.*,d.name document_name FROM leads a JOIN documents d ON d.id=a.document_id WHERE ${u.admin?'1=1':'d.owner_id=?'} ORDER BY a.created_at DESC LIMIT 1000`,...ownArgs)};
  if(section==='keys')return {items:await all(`SELECT id,owner_id,name,ips,enabled,quota,created_at FROM api_keys WHERE ${own} ORDER BY created_at DESC`,...ownArgs),logs:await all(`SELECT a.id,a.path,a.status,a.created_at,k.name FROM api_logs a JOIN api_keys k ON k.id=a.key_id WHERE ${u.admin?'1=1':'k.owner_id=?'} ORDER BY a.created_at DESC LIMIT 100`,...ownArgs)};
  if(section==='health')return {items:await all(`SELECT h.*,l.title,l.slug FROM link_health h JOIN links l ON l.id=h.link_id WHERE ${s.sql} ORDER BY h.checked_at DESC`,...s.args),notifications:await all('SELECT * FROM notifications WHERE owner_id=? ORDER BY created_at DESC LIMIT 100',u.id)};
  if(section==='policy'){if(!u.admin)fail('需要管理员权限',403);return {policy:await route.settings()};}
  if(section==='events'||section==='overview'){
   const from=text(p.get('from')||day(),10),to=text(p.get('to')||day(),10);if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to||Date.parse(to)-Date.parse(from)>366*86400000)fail('日期范围无效');
   const domain=text(p.get('domain'),50),filter=`a.verified=1 AND ${s.sql} AND (?='' OR l.domain_id=?) AND a.day BETWEEN ? AND ?`,args=[...s.args,domain,domain,from,to];
   const totals=await all(`SELECT a.kind,count(*) total,count(DISTINCT a.visitor) visitors,sum(a.value) value FROM link_events a JOIN links l ON l.id=a.link_id WHERE ${filter} GROUP BY a.kind`,...args);
   const profiles:Row={};for(const field of ['channel','device','browser','country'])profiles[field]=await all(`SELECT a.${field} name,count(*) total FROM link_events a JOIN links l ON l.id=a.link_id WHERE ${filter} AND a.kind='arrival' GROUP BY a.${field} ORDER BY total DESC LIMIT 20`,...args);
   const top=await all(`SELECT l.id,l.title,l.slug,a.kind,count(*) total FROM link_events a JOIN links l ON l.id=a.link_id WHERE ${filter} GROUP BY l.id,a.kind ORDER BY total DESC LIMIT 30`,...args);
   const funnel=await one(`WITH cohorts AS(SELECT a.link_id,a.visitor,min(a.timestamp) first_at FROM link_events a JOIN links l ON l.id=a.link_id WHERE ${filter} AND a.kind='arrival' GROUP BY a.link_id,a.visitor), paths AS(SELECT c.*,(SELECT min(b.timestamp) FROM link_events b WHERE b.verified=1 AND b.link_id=c.link_id AND b.visitor=c.visitor AND b.kind='click' AND b.timestamp>=c.first_at AND b.day BETWEEN ? AND ?) click_at FROM cohorts c) SELECT count(*) arrivals,coalesce(sum(click_at IS NOT NULL),0) clicks,coalesce(sum(CASE WHEN click_at IS NOT NULL AND EXISTS(SELECT 1 FROM link_events x WHERE x.verified=1 AND x.link_id=p.link_id AND x.visitor=p.visitor AND x.kind='conversion' AND x.timestamp>=p.click_at AND x.day BETWEEN ? AND ?) THEN 1 ELSE 0 END),0) conversions FROM paths p`,...args,from,to,from,to);const tasks=section==='overview'?await readTasks(u):undefined;return {totals,profiles,top,tasks,funnel,daily:await all(`SELECT a.day,a.kind,count(*) total FROM link_events a JOIN links l ON l.id=a.link_id WHERE ${filter} GROUP BY a.day,a.kind ORDER BY a.day`,...args),notice:'仅统计浏览器可见页面的确认访问；同访客同链接的访问、按钮点击和复制各在10分钟内去重。自动直跳单列，不计为按钮点击。旧版请求记录保留在数据统计的旧版视图。转化上报不代表真实转存或成交。'};
  }
  if(['batch','qr'].includes(section))return {items:[]};
  fail('功能分区不存在',404);
 }
 async function documentOwned(u:Row,id:string){const d=await one('SELECT * FROM documents WHERE id=? AND deleted_at IS NULL',id);if(!d||!u.admin&&d.owner_id!==u.id)fail('内容不存在',404);return d!;}
 async function mutate(req:Request,u:Row,b:Row){
  if(b.action==='link.batch')return batchCreate(u,b);
  if(b.action==='link.options'){await policy(u,'edit');return {options:await route.saveConfig(u,text(b.id,50),b.options||{})};}
  if(b.action==='link.duplicate'){const l=await route.owned(u,text(b.id,50));const {config}=await route.configFor(l.id);return saveLink(u,{domainId:b.domainId||l.domain_id,title:l.title+'（副本）',target:l.target,mode:l.mode,options:{...config,shareAlias:b.domainId&&b.domainId!==l.domain_id?'':config.shareAlias,groupId:l.owner_id===u.id?config.groupId:'',templateId:l.owner_id===u.id?config.templateId:''}});}
  if(b.action==='link.bulk'){
   await policy(u,'edit');const ids=[...new Set((Array.isArray(b.ids)?b.ids:[]).map((v:any)=>text(v,50)))];if(!ids.length||ids.length>100)fail('每次请选择 1–100 条链接');const auth=scope(u),rows:Row[]=[];
   for(let i=0;i<ids.length;i+=80){const chunk=ids.slice(i,i+80);rows.push(...await all('SELECT l.* FROM links l WHERE l.id IN ('+chunk.map(()=>'?').join(',')+') AND '+auth.sql,...chunk,...auth.args));}
   if(rows.length!==ids.length)fail('包含无权操作的链接',403);const operation=b.operation,groupId=text(b.groupId,50);
   if(operation==='group'){if(groupId&&!await one('SELECT id FROM link_groups WHERE id=? AND owner_id=?',groupId,u.id))fail('分组不存在');if(rows.some(l=>l.owner_id!==u.id)&&groupId)fail('只能给自己的链接分组');}
   const stmts=[];for(let i=0;i<ids.length;i+=80){const chunk=ids.slice(i,i+80),marks=chunk.map(()=>'?').join(',');
    if(operation==='restore')stmts.push(db.prepare('UPDATE links SET deleted_at=NULL,enabled=coalesce(restore_enabled,0) WHERE deleted_at IS NOT NULL AND id IN ('+marks+')').bind(...chunk));
    else if(operation==='delete')stmts.push(db.prepare('UPDATE links SET restore_enabled=enabled,deleted_at=?,enabled=0 WHERE deleted_at IS NULL AND id IN ('+marks+')').bind(Date.now(),...chunk));
    else if(['enable','disable'].includes(operation))stmts.push(db.prepare('UPDATE links SET enabled=? WHERE deleted_at IS NULL AND id IN ('+marks+')').bind(operation==='enable'?1:0,...chunk));
    else if(operation==='group')stmts.push(db.prepare("INSERT INTO link_options(link_id,config) SELECT l.id,json_set(coalesce(o.config,'{}'),'$.groupId',?) FROM links l LEFT JOIN link_options o ON o.link_id=l.id WHERE l.id IN ("+marks+") AND l.deleted_at IS NULL ON CONFLICT(link_id) DO UPDATE SET config=excluded.config").bind(groupId,...chunk));
    else fail('批量操作不正确');
   }await db.batch(stmts);return {ok:true,count:rows.length};
  }
  if(b.action==='group.save'){const name=text(b.name,60);if(!name)fail('请填写分组名称');if(b.id){if(!await one('SELECT id FROM link_groups WHERE id=? AND owner_id=?',b.id,u.id))fail('分组不存在',404);await run('UPDATE link_groups SET name=?,position=? WHERE id=?',name,Math.max(0,Number(b.position)||0),b.id);}else await run('INSERT INTO link_groups (id,owner_id,name,position,created_at) VALUES (?,?,?,?,?)',uid(),u.id,name,Math.max(0,Number(b.position)||0),Date.now());return {ok:true};}
  if(b.action==='group.delete'){const group=await one('SELECT id FROM link_groups WHERE id=? AND owner_id=?',b.id,u.id);if(!group)fail('分组不存在',404);if(await one("SELECT o.link_id FROM link_options o JOIN links l ON l.id=o.link_id WHERE json_extract(o.config,'$.groupId')=? AND l.deleted_at IS NULL",b.id))fail('请先移走分组内的链接');await run('DELETE FROM link_groups WHERE id=?',b.id);return {ok:true};}
  if(b.action==='policy.save'){if(!u.admin)fail('需要管理员权限',403);const p=b.policy||{},blockedDomains=(Array.isArray(p.blockedDomains)?p.blockedDomains:[]).map((h:any)=>text(h,200).toLowerCase()).filter((h:string)=>/^[a-z0-9.-]+$/.test(h)&&h.includes('.')).slice(0,200);const next={allowCreate:p.allowCreate!==false,allowEdit:p.allowEdit!==false,requireApproval:!!p.requireApproval,dailyQuota:Math.max(0,Math.min(100000,Number(p.dailyQuota)||0)),domainLimit:Math.max(0,Math.min(1000,Number(p.domainLimit)||0)),announcement:text(p.announcement,1000),exemptUsers:(Array.isArray(p.exemptUsers)?p.exemptUsers:[]).map((x:any)=>text(x,50)).slice(0,50),blockedDomains,brand:text(p.brand||'资源中转站',60),legal:text(p.legal,10000),privacy:text(p.privacy,10000)};await run("INSERT INTO settings(key,value) VALUES('features',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(next));return {ok:true};}
  if(b.action==='report.delete'){if(!u.admin)fail('需要管理员权限',403);await ensureReportsTable(ctx.db);await run('DELETE FROM reports WHERE id=?',text(b.id,50));return {ok:true};}
  if(b.action==='notice.read'){await run('UPDATE notifications SET read_at=? WHERE owner_id=?',Date.now(),u.id);return {ok:true};}
  return null;
 }
 async function handle(req:Request,extensions?:(req:Request,u:Row,b:Row)=>Promise<any>){try{const u=await ctx.user(req);if(req.method==='GET')return reply(await read(req,u));if(req.method!=='POST')return reply({error:'请求方式不支持'},405);guard(req);const b=await req.json() as Row;const result=await mutate(req,u,b)??await extensions?.(req,u,b);if(result===null||result===undefined)fail('未知操作');return reply(result);}catch(err){return errors(err);}}
 return {route,read,mutate,handle,enrich,saveLink,batchCreate,documentOwned,policy};
}
