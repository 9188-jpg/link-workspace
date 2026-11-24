/** Per-domain homepages reuse content drafts/versions; enabling a homepage never changes shortlinks. */
import {type FeatureContext,type HomepageMetadata,type Row,statements,fail,safeUrl,text,uid} from './feature-types.ts';
import {cleanProfile,collectionLayout} from './profile-page.ts';
import {displayHost} from './domain-display.ts';
import {shareAliasFor} from './share-url.ts';

function cleanSearchSettings(input:Row){
 const raw=String(input?.baiduVerification??'').trim();
 const tag=raw.match(/^<meta\s+name\s*=\s*(["'])baidu-site-verification\1\s+content\s*=\s*(["'])([\w-]{1,160})\2\s*\/?>$/i);
 const baiduVerification=tag?.[3]??raw;
 if(baiduVerification&&!/^[\w-]{1,160}$/.test(baiduVerification))fail('请填写百度生成的 HTML 验证标签或验证值');
 return {allowIndex:input?.allowIndex===true,baiduVerification};
}

export function domainHomes(ctx:FeatureContext,publicPage:(req:Request,id:string,metadata:HomepageMetadata,templateId?:string)=>Promise<Response>,policy:(u:Row,action:string)=>Promise<Row>){
 const {one,all}=statements(ctx.db),db=ctx.db;
 const key=(id:string)=>'homepage:'+id;
 async function config(id:string){return JSON.parse((await one('SELECT value FROM settings WHERE key=?',key(id)))?.value||'{}');}
 function updateConfig(id:string,patch:Row){
  const setting=key(id);
  return db.prepare(`INSERT INTO settings(key,value)
   VALUES(?,json_patch(COALESCE((SELECT value FROM settings WHERE key=?),'{"enabled":false}'),?))
   ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(setting,setting,JSON.stringify(patch));
 }
 async function owned(u:Row,id:string){const d=await one('SELECT * FROM domains WHERE id=?',id);if(!d||!u.admin&&d.owner_id!==u.id)fail('无权设置此域名的首页',403);return d;}
 async function read(req:Request,u:Row){
  const domains:Row[]=(await all('SELECT id,host,origin,status FROM domains WHERE (?=1 OR owner_id=?) ORDER BY created_at',u.admin?1:0,u.id)).map(d=>({...d,display_host:displayHost(d.host)}));
  const id=new URL(req.url).searchParams.get('domainId')||domains[0]?.id;if(!id)return {domains,config:{},document:null};
  await owned(u,id);const saved=await config(id),document=saved.documentId?await one('SELECT id,name,draft,published,version FROM documents WHERE id=? AND deleted_at IS NULL',saved.documentId):null;
  const templates=await all(`SELECT d.id,d.name,d.published FROM documents d JOIN users a ON a.id=d.owner_id
   WHERE d.kind='template' AND d.published IS NOT NULL AND d.deleted_at IS NULL AND a.enabled=1
   AND json_extract(d.published,'$.layout')=? AND (d.owner_id=? OR d.id IN (?,?)) ORDER BY d.name`,
   collectionLayout,u.id,saved.templateId||'',saved.draftTemplateId||'');
  return {domains,domainId:id,config:saved,document,templates};
 }
 async function mutate(_req:Request,u:Row,b:Row){
  if(!String(b.action).startsWith('homepage.'))return null;
  const domain=await owned(u,text(b.domainId,50)),saved=await config(domain.id),now=Date.now();
  await policy(u,saved.documentId||saved.redirectDraft||saved.redirectUrl||saved.draftTemplateId?'edit':'create');
  if(b.action==='homepage.disable'){
   await updateConfig(domain.id,{enabled:false}).run();return {ok:true};
  }
  if(!['homepage.save','homepage.apply'].includes(b.action))fail('未知首页操作');
  const applying=b.action==='homepage.apply';
  if(applying&&domain.status!=='active')fail('请先完成域名绑定并启用域名');
  if(b.mode==='direct'){
   const target=new URL(safeUrl(b.redirectUrl));
   const alias=shareAliasFor(domain.origin);
   if(target.pathname==='/'&&(target.host===domain.host||(alias&&target.host===new URL(alias).host)))fail('承接网址不能指回当前域名的首页');
   const patch:Row={draftMode:'direct',redirectDraft:target.href};
   if(applying)Object.assign(patch,{enabled:true,mode:'direct',redirectUrl:target.href});
   await updateConfig(domain.id,patch).run();
   return {ok:true,enabled:applying||!!saved.enabled,origin:domain.origin};
  }
  if(b.mode!==undefined&&b.mode!=='page')fail('请选择首页打开方式');
  const draftSearch=b.searchSettings===undefined?undefined:cleanSearchSettings(b.searchSettings);
  const templateId=text(b.templateId,50);
  const patch:Row={draftMode:'page',draftTemplateId:templateId};
  if(applying)Object.assign(patch,{enabled:true,mode:'page',templateId});
  if(draftSearch){
   patch.draftSearch=draftSearch;
   if(applying)patch.publishedSearch=draftSearch;
  }
  const current=saved.documentId?await one('SELECT * FROM documents WHERE id=? AND deleted_at IS NULL',saved.documentId):null;
  if(templateId){
   const template=await one(`SELECT d.id,d.name FROM documents d JOIN users a ON a.id=d.owner_id
    WHERE d.id=? AND d.kind='template' AND d.published IS NOT NULL AND d.deleted_at IS NULL AND a.enabled=1
    AND json_extract(d.published,'$.layout')=? AND (d.owner_id=? OR d.id IN (?,?))`,
    templateId,collectionLayout,u.id,saved.templateId||'',saved.draftTemplateId||'');
   if(!template)fail('请选择可用的已发布资源聚合模板');
   if(!applying){await updateConfig(domain.id,patch).run();return {ok:true,enabled:!!saved.enabled,origin:domain.origin};}

   // Each domain keeps its own document ID for visit and entry statistics.
   const id=current?.id||uid(),statements=[];
   if(!current){
    if(Number((await one('SELECT count(*) n FROM documents WHERE owner_id=? AND deleted_at IS NULL',u.id))?.n)>=200)fail('当前免费内容数量上限为 200 条');
    const empty=JSON.stringify({title:'',description:'',layout:'profile',blocks:[]});
    statements.push(db.prepare(`INSERT INTO documents(id,owner_id,kind,name,draft,published,created_at,updated_at)
     VALUES (?,?,'page',?,?,?,?,?)`).bind(id,u.id,displayHost(domain.host),empty,empty,now,now));
   }else if(!current.published){
    statements.push(db.prepare('UPDATE documents SET published=? WHERE id=? AND published IS NULL')
     .bind(JSON.stringify({layout:'profile',blocks:[]}),id));
   }
   statements.push(updateConfig(domain.id,{...patch,documentId:id}));
   await db.batch(statements);
   return {ok:true,id,enabled:true,origin:domain.origin};
  }
  const body=cleanProfile(b.body||{});
  if(!current&&Number((await one('SELECT count(*) n FROM documents WHERE owner_id=? AND deleted_at IS NULL',u.id))?.n)>=200)fail('当前免费内容数量上限为 200 条');
  const id=current?.id||uid(),version=(current?.version||0)+1,content=JSON.stringify(body),enabled=applying||!!saved.enabled;
  const statements=[current?db.prepare('UPDATE documents SET name=?,draft=?,updated_at=? WHERE id=?').bind(body.title,content,now,id):db.prepare('INSERT INTO documents(id,owner_id,kind,name,draft,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind(id,u.id,'page',body.title,content,now,now)];
  if(applying)statements.push(db.prepare('INSERT INTO document_versions(id,document_id,version,body,created_at) VALUES (?,?,?,?,?)').bind(uid(),id,version,content,now),db.prepare('UPDATE documents SET published=?,version=? WHERE id=?').bind(content,version,id));
  statements.push(updateConfig(domain.id,{...patch,documentId:id}));
  await db.batch(statements);return {ok:true,id,enabled,origin:domain.origin};
 }
 async function homepage(req:Request){
  const domain=await one('SELECT * FROM domains WHERE origin=?',new URL(req.url).origin);if(!domain)return null;
  const saved=await config(domain.id);if(!saved.enabled)return null;
  if(domain.status==='disabled')return new Response('首页已停用',{status:404,headers:{'Cache-Control':'no-store'}});
  if(saved.mode==='direct'&&saved.redirectUrl){
   const headers={'Cache-Control':'no-store'};
   if(req.method!=='GET'&&req.method!=='HEAD')return new Response(null,{status:405,headers:{...headers,Allow:'GET, HEAD'}});
   return new Response(null,{status:302,headers:{...headers,Location:saved.redirectUrl}});
  }
  if(!saved.documentId)return null;
  return publicPage(req,saved.documentId,{
   canonical:domain.origin+'/',
   allowIndex:saved.publishedSearch?.allowIndex===true,
   baiduVerification:saved.publishedSearch?.baiduVerification||'',
  },saved.templateId||undefined);
 }
 return {read,mutate,homepage};
}
