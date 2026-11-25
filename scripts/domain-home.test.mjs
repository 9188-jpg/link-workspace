import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {domainHomes} from '../src/domain-home.ts';
import {renderProfile} from '../src/profile-page.ts';

test('Chinese and Punycode requests share one homepage; other domains and drafts remain isolated',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE users(id PRIMARY KEY,enabled);CREATE TABLE domains(id,origin,host,status,owner_id,created_at);CREATE TABLE settings(key PRIMARY KEY,value);CREATE TABLE documents(id PRIMARY KEY,owner_id,kind,name,draft,published,version DEFAULT 0,created_at,updated_at,deleted_at);CREATE TABLE document_versions(id,document_id,version,body,created_at);');
 const db={prepare(sql){return {bind(...args){const stmt=sqlite.prepare(sql);return {first:()=>stmt.get(...args),all:()=>({results:stmt.all(...args)}),run:()=>stmt.run(...args)};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const origin=new URL('https://我的小站.cn').origin;
 sqlite.prepare('INSERT INTO domains VALUES (?,?,?,?,?,?)').run('chinese',origin,new URL(origin).host,'active',null,0);
 const admin={id:'owner',admin:true};
 const homes=domainHomes({db,user:()=>admin,pepper:()=>''},async(_req,id)=>new Response(sqlite.prepare('SELECT published FROM documents WHERE id=?').get(id).published),async()=>({}));
 const body={title:'中文站点',blocks:[{type:'link',title:'资料',url:'https://example.org/长链接?密码=123#内容'}]};
 try{
  await homes.mutate(new Request(origin),admin,{action:'homepage.save',domainId:'chinese',body});assert.equal(await homes.homepage(new Request(origin)),null);
  await homes.mutate(new Request(origin),admin,{action:'homepage.apply',domainId:'chinese',body});
  const savedDraft=await homes.mutate(new Request(origin),admin,{action:'homepage.save',domainId:'chinese',body:{...body,title:'Link3 草稿'}});
   const stored=JSON.parse(sqlite.prepare('SELECT draft FROM documents WHERE id=?').get(savedDraft.id).draft);
   assert.equal(stored.layout,'link3','homepages now save as Link3 pages');
   assert.equal(stored.blocks[0].type,'button','legacy link entries map to Link3 buttons');
   assert.equal(stored.blocks[0].title,'资料');
   assert.equal(await (await homes.homepage(new Request('https://我的小站.cn'))).text(),await (await homes.homepage(new Request(origin))).text());
  assert.equal(await homes.homepage(new Request('https://another.example')),null);
  const before=await (await homes.homepage(new Request(origin))).text();await homes.mutate(new Request(origin),admin,{action:'homepage.save',domainId:'chinese',body:{...body,title:'新草稿'}});assert.equal(await (await homes.homepage(new Request(origin))).text(),before);
  await assert.rejects(homes.mutate(new Request(origin),{id:'member'},{action:'homepage.apply',domainId:'chinese',body}),/无权/);
  await assert.rejects(homes.mutate(new Request(origin),admin,{action:'homepage.apply',domainId:'chinese',body:{...body,blocks:[{type:'link',title:'坏网址',url:'javascript:alert(1)'}]}}));assert.equal(await (await homes.homepage(new Request(origin))).text(),before);
  sqlite.prepare("INSERT INTO users VALUES ('team',0)").run();sqlite.prepare("UPDATE domains SET owner_id='team'").run();assert.equal((await homes.homepage(new Request(origin))).status,404,'disabled team cannot expose its homepage');sqlite.prepare("UPDATE users SET enabled=1").run();assert.equal((await homes.homepage(new Request(origin))).status,200);
  sqlite.prepare("UPDATE domains SET status='disabled'").run();assert.equal((await homes.homepage(new Request(origin))).status,404);
 }finally{sqlite.close();}
});

test('profile rendering escapes titles, button labels and image attributes',async()=>{
 const html=await renderProfile({title:'<img src=x onerror=alert(1)>',description:'<script>bad</script>',avatar:'https://example.org/" onerror="bad',theme:'red;}</style><script>bad</script>',background:'bad',blocks:[{title:'<script>bad</script>',url:'https://example.org/?a=1&b=2',text:'<b>说明</b>'}]}).text();
 assert(!html.includes('<script>bad</script>'));assert(html.includes('&lt;script&gt;bad&lt;/script&gt;'));assert(html.includes('a=1&amp;b=2'));assert(!html.includes('src="https://example.org/" onerror='));
});
