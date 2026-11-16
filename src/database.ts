import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const directory=resolve(process.env.DATA_DIR||'data');
if(process.env.RENDER&&!process.env.DATA_DIR)throw new Error('Render 部署必须配置持久化磁盘和 DATA_DIR');
mkdirSync(directory,{recursive:true});
export const sqlite=new DatabaseSync(resolve(directory,'workspace.sqlite'));
sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
const version=(sqlite.prepare('PRAGMA user_version').get() as any).user_version;
if(version===0){
 sqlite.exec('BEGIN IMMEDIATE');
 try{
  sqlite.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));
  sqlite.exec(`CREATE TABLE accounts (user_id TEXT PRIMARY KEY REFERENCES users(id), username TEXT NOT NULL UNIQUE, password TEXT NOT NULL);
  CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
  CREATE INDEX sessions_expiry ON sessions(expires);
  PRAGMA user_version=1;`);
  sqlite.exec('COMMIT');
 }catch(e){sqlite.exec('ROLLBACK');throw e;}
}
if(version<2){sqlite.exec('BEGIN IMMEDIATE');try{sqlite.exec(readFileSync(new URL('../cloudflare/migrations/0002_free_features.sql',import.meta.url),'utf8'));sqlite.exec('PRAGMA user_version=2; COMMIT;');}catch(e){sqlite.exec('ROLLBACK');throw e;}}
if(version<3){sqlite.exec('BEGIN IMMEDIATE');try{sqlite.exec(readFileSync(new URL('../cloudflare/migrations/0003_verified_traffic.sql',import.meta.url),'utf8'));sqlite.exec('PRAGMA user_version=3; COMMIT;');}catch(e){sqlite.exec('ROLLBACK');throw e;}}
function statement(sql:string,args:any[]=[]){return {
 sql,args,
 bind(...values:any[]){return statement(sql,values);},
 first(){return sqlite.prepare(sql).get(...args)||null;},
 all(){return {results:sqlite.prepare(sql).all(...args)};},
 run(){return sqlite.prepare(sql).run(...args);}
};}
export const database={prepare:statement,batch(stmts:ReturnType<typeof statement>[]){sqlite.exec('BEGIN IMMEDIATE');try{const result=stmts.map(s=>s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
