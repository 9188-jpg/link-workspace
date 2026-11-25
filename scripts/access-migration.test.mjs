import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const sql=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('team migration preserves populated v3 ownership, accounts, settings and historical data',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;');
 try{
  db.exec(sql('db/schema.sql'));db.exec('CREATE TABLE accounts(user_id TEXT PRIMARY KEY REFERENCES users(id),username TEXT UNIQUE,password TEXT);CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER);');
  db.exec(sql('cloudflare/migrations/0002_free_features.sql'));db.exec(sql('cloudflare/migrations/0003_verified_traffic.sql'));
  db.exec("INSERT INTO users VALUES('original','原用户','original',1,100);INSERT INTO accounts VALUES('original','original','synthetic-existing-hash');INSERT INTO sessions VALUES('synthetic-session','original',9999999999999);INSERT INTO settings VALUES('owner','original');INSERT INTO domains(id,origin,host,name,created_at) VALUES('d','https://old.example','old.example','原域名',100);INSERT INTO links(id,domain_id,owner_id,slug,title,target,mode,created_at) VALUES('l','d','original','old-link','原链接','https://example.org/','page',100);INSERT INTO visits(id,link_id,browser,day,timestamp,verified) VALUES('v','l','visitor','2026-01-01',100,1);INSERT INTO link_options(link_id,config) VALUES('l','{}');INSERT INTO documents(id,owner_id,kind,name,created_at,updated_at) VALUES('doc','original','page','原草稿',100,100);");
  const tables=['accounts','sessions','settings','domains','links','visits','link_options','documents'];const before=Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t).all()]));
  db.exec('BEGIN');db.exec(sql('cloudflare/migrations/0004_team_access.sql'));db.exec('COMMIT');
  for(const table of tables)assert.deepEqual(db.prepare('SELECT * FROM '+table).all(),before[table],table+' must remain unchanged');
  const user=db.prepare('SELECT * FROM users').get();assert.deepEqual({...user},{id:'original',name:'原用户',email:'original',enabled:1,created_at:100,access_role:'member'});
  assert.equal(db.prepare('SELECT count(*) n FROM teams').get().n,0);
  // Rollback of a failed team creation must not leave an orphaned principal.
  db.exec('BEGIN');try{db.exec("INSERT INTO users(id,name,email,enabled,created_at,access_role) VALUES('team','团队','team:team',1,100,'team');INSERT INTO teams(id,name,leader_id,created_at) VALUES('team','团队','missing',100);");assert.fail('missing leader must fail');}catch(e){assert.match(String(e),/TEAM_LEADER_REQUIRED/);db.exec('ROLLBACK');}
  assert.equal(db.prepare("SELECT count(*) n FROM users WHERE id='team'").get().n,0);
  db.exec("INSERT INTO users(id,name,email,enabled,created_at,access_role) VALUES('team','团队','team:team',1,100,'team');INSERT INTO teams(id,name,leader_id,created_at) VALUES('team','团队','original',100);");
  assert.throws(()=>db.exec("UPDATE users SET enabled=0 WHERE id='original'"),/TEAM_LEADER_REQUIRED/);
  db.exec("UPDATE teams SET enabled=0 WHERE id='team'");assert.equal(db.prepare("SELECT enabled FROM users WHERE id='team'").get().enabled,0);
  db.exec("UPDATE users SET enabled=0 WHERE id='original'");assert.throws(()=>db.exec("UPDATE teams SET enabled=1 WHERE id='team'"),/TEAM_LEADER_REQUIRED/);
 }finally{db.close();}
});
