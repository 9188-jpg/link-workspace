import {cleanOptions} from './feature-routing.ts';
import {day,fail,type Row} from './feature-types.ts';

export type WorkspaceQuery={sql:string;args:any[]};
export type WorkspaceReadBatch=(queries:WorkspaceQuery[])=>Promise<Row[][]>;

// Plan independent reads before sending one D1 batch; never cache account-scoped data.
export async function readWorkspace(req:Request,u:Row,readBatch:WorkspaceReadBatch){
 const p=new URL(req.url).searchParams,domainId=p.get('domain')||'',search=(p.get('q')||'').slice(0,200),kind=p.get('view')||'links',verified=p.get('traffic')==='legacy'?0:1;
 const scope=u.admin?{sql:'1=1',args:[] as any[]}:{sql:'l.owner_id=?',args:[u.id]},filters=`${scope.sql} AND (?='' OR l.domain_id=?)`,args=[...scope.args,domainId,domainId];
 if(['users','settings'].includes(kind)&&!u.admin)fail('需要管理员权限',403);
 const from=p.get('from')||day(),to=p.get('to')||day(),dates:string[]=[];
 if(kind==='analytics'){
  const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
  if(!valid(from)||!valid(to)||from>to||to>day()||(Date.parse(to)-Date.parse(from))/86400000>365)fail('请选择不超过 366 天的有效日期范围');
  for(let t=Date.parse(from);t<=Date.parse(to);t+=86400000)dates.push(new Date(t).toISOString().slice(0,10));
 }
 const queries:WorkspaceQuery[]=[],slots=new Map<string,number>();
 const add=(name:string,sql:string,...args:any[])=>{slots.set(name,queries.length);queries.push({sql,args});};
 add('domains',`SELECT d.*,(SELECT count(*) FROM links l WHERE l.domain_id=d.id AND l.deleted_at IS NULL AND ${scope.sql}) total,(SELECT count(*) FROM visits v JOIN links l ON l.id=v.link_id WHERE v.verified=${verified} AND l.domain_id=d.id AND ${scope.sql}) visits FROM domains d WHERE (?=1 OR d.owner_id IS NULL OR d.owner_id=?) ORDER BY d.created_at`,...scope.args,...scope.args,u.admin?1:0,u.id);
 add('stats',`SELECT count(*) total,coalesce(sum(CASE WHEN l.enabled=1 AND d.status!='disabled' AND u.enabled=1 THEN 1 ELSE 0 END),0) active FROM links l JOIN domains d ON d.id=l.domain_id JOIN users u ON u.id=l.owner_id WHERE l.deleted_at IS NULL AND ${filters}`,...args);
 add('visits',`SELECT count(*) n FROM visits v JOIN links l ON l.id=v.link_id WHERE v.verified=${verified} AND ${filters}`,...args);
 if(u.admin)add('users','SELECT count(*) n FROM users WHERE id!=?',u.id);
 if(kind==='links')add('items',`SELECT l.*,coalesce(d.public_origin,d.origin) origin,d.host,d.status domain_status,u.name owner_name,u.enabled owner_enabled,(SELECT count(*) FROM visits WHERE verified=${verified} AND link_id=l.id) visits,o.config _options_config,o.password_hash _options_password,o.access_count FROM links l JOIN domains d ON d.id=l.domain_id JOIN users u ON u.id=l.owner_id LEFT JOIN link_options o ON o.link_id=l.id WHERE l.deleted_at IS NULL AND ${filters} AND (?='' OR instr(lower(l.title||' '||l.target||' '||l.slug),lower(?))>0) ORDER BY l.created_at DESC`,...args,search,search);
 if(kind==='analytics'){
  add('daily',`SELECT v.day,count(*) visits FROM visits v JOIN links l ON l.id=v.link_id WHERE v.verified=${verified} AND ${filters} AND v.day BETWEEN ? AND ? GROUP BY v.day ORDER BY v.day`,...args,from,to);
  // Deleted links remain in historical reports, but never in the active links view.
  add('items',`SELECT l.id,l.title,l.slug,coalesce(d.public_origin,d.origin) origin,d.host,l.deleted_at,count(v.id) visits FROM links l JOIN domains d ON d.id=l.domain_id LEFT JOIN visits v ON v.link_id=l.id AND v.verified=${verified} AND v.day BETWEEN ? AND ? WHERE ${filters} AND (?='' OR instr(lower(l.title||' '||l.slug),lower(?))>0) GROUP BY l.id ORDER BY visits DESC,l.created_at DESC`,from,to,...args,search,search);
  add('linkDaily',`SELECT v.link_id,v.day date,count(*) visits FROM visits v JOIN links l ON l.id=v.link_id WHERE v.verified=${verified} AND ${filters} AND v.day BETWEEN ? AND ? AND (?='' OR instr(lower(l.title||' '||l.slug),lower(?))>0) GROUP BY v.link_id,v.day ORDER BY v.day`,...args,from,to,search,search);
  if(p.get('link'))add('detail',`SELECT l.id,v.day,count(v.id) visits FROM links l LEFT JOIN visits v ON v.link_id=l.id AND v.verified=${verified} AND v.day BETWEEN ? AND ? WHERE l.id=? AND ${filters} GROUP BY l.id,v.day`,from,to,p.get('link'),...args);
 }
 if(kind==='users')add('items','SELECT id,name,email,enabled,created_at,(SELECT count(*) FROM links WHERE owner_id=users.id AND deleted_at IS NULL) link_count FROM users ORDER BY created_at');
 if(kind==='settings')add('settings',"SELECT key,value FROM settings WHERE key IN ('registration','fallback')");
 add('sparkline',`SELECT v.day,count(*) visits FROM visits v JOIN links l ON l.id=v.link_id WHERE v.verified=${verified} AND ${filters} AND v.timestamp>=? GROUP BY v.day ORDER BY v.day`,...args,Date.now()-7*86400000);
 add('groups','SELECT * FROM link_groups WHERE owner_id=? ORDER BY position,created_at',u.id);
 add('templates',"SELECT id,name,owner_id FROM documents WHERE kind='template' AND published IS NOT NULL AND deleted_at IS NULL AND owner_id=?",u.id);
 const lists=await readBatch(queries),get=(name:string)=>slots.has(name)?lists[slots.get(name)!]:[];
 const stats=get('stats')[0];stats.visits=get('visits')[0].n;if(u.admin)stats.users=get('users')[0].n;
 const result:Row={user:{id:u.id,name:u.name,email:u.email,admin:u.admin},domains:get('domains'),stats,traffic:verified?'verified':'legacy',sparkline:get('sparkline'),groups:get('groups'),templates:get('templates')};
 if(slots.has('items'))result.items=get('items');
 if(kind==='links')result.items=result.items.map(({_options_config,_options_password,...row}:Row)=>({...row,options:cleanOptions(JSON.parse(_options_config||'{}')),hasPassword:!!_options_password,access_count:row.access_count||0}));
 if(kind==='analytics'){
  const pad=(rows:Row[])=>{const counts=new Map(rows.map(r=>[r.day,r.visits]));return dates.map(date=>({date,visits:counts.get(date)||0}));};
  result.daily=pad(get('daily'));result.linkDaily=get('linkDaily');
  if(p.get('link')){if(!get('detail').length)fail('链接不存在',404);result.detail=pad(get('detail'));}
 }
 if(kind==='settings')result.settings=Object.fromEntries(get('settings').map(x=>[x.key,x.value]));
 return result;
}
