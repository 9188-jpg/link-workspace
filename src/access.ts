/** Shared Node/D1 access boundaries. A team principal owns all team resources;
 * authentication always retains the real actor and never grants ambient admin
 * access inside a team. Membership is read on every request, without caching. */
import {type FeatureDB,type Row,statements,fail,guard,reply,errors,uid} from './feature-types.ts';

const nameValue=(v:unknown)=>{const s=String(v??'').trim();if(!s||s.length>80)fail('名称需为 1–80 个字符');return s;};
const usernameValue=(v:unknown)=>{const s=String(v??'').trim().toLowerCase();if(!/^[a-z0-9_]{3,32}$/.test(s))fail('账号需为 3–32 位字母、数字或下划线');return s;};
const passwordValue=(v:unknown)=>{if(typeof v!=='string')fail('请填写有效密码');const s=v;if(s.length<12||s.length>128)fail('密码需为 12–128 位');return s;};
const requireAdmin=(u:Row)=>{if(!u.admin)fail('需要管理员权限',403);};

export async function workspaceIdentity(db:FeatureDB,actor:Row,req:Request){
 const id=req.headers.get('X-Workspace-Team');
 if(!id)return actor;
 const {one}=statements(db);
 const team=await one(`SELECT t.*,u.enabled principal_enabled,m.role FROM teams t JOIN users u ON u.id=t.id LEFT JOIN team_members m ON m.team_id=t.id AND m.user_id=? WHERE t.id=?`,actor.id,id);
 if(!team||!team.enabled||!team.principal_enabled||!actor.admin&&team.leader_id!==actor.id&&!team.role)fail('团队已停用或你已无权访问，请切回个人空间',403);
 const role=actor.admin||team.leader_id===actor.id?'leader':team.role;
 if(role==='viewer'&&!['GET','HEAD'].includes(req.method))fail('你在此团队只有查看权限',403);
 return {...actor,id:team.id,admin:false,actor_id:actor.id,platformAdmin:actor.admin,team:{id:team.id,name:team.name,role},name:actor.name};
}

export function accessManagement(db:FeatureDB,authenticate:(req:Request)=>Row|Promise<Row>,encodePassword:(password:string)=>Promise<string>){
 const {one,all}=statements(db);
 const audit=(actor:Row,action:string,target:string,team:string|null,detail:Row)=>db.prepare('INSERT INTO access_audit(id,actor_id,action,target_id,team_id,detail,created_at) VALUES(?,?,?,?,?,?,?)').bind(uid(),actor.id,action,target,team,JSON.stringify(detail),Date.now());
 async function realUser(id:string){const u=await one('SELECT u.*,a.username FROM users u JOIN accounts a ON a.user_id=u.id WHERE u.id=?',id);if(!u)fail('用户不存在',404);return u;}
 async function protectUser(actor:Row,target:Row,newRole?:string){
  const root=(await one("SELECT value FROM settings WHERE key='owner'"))?.value;
  if(target.id===root)fail('不能在用户管理中修改站点所有者');
  if(target.id===actor.id)fail('请在账号设置中修改本人信息');
  if((target.access_role==='admin'||newRole==='admin')&&actor.id!==root)fail('只有站点所有者可管理管理员权限',403);
 }
 async function teamFor(actor:Row,id:string){const t=await one('SELECT * FROM teams WHERE id=?',id);if(!t||!actor.admin&&t.leader_id!==actor.id)fail('无权管理此团队',403);return t;}
 async function read(actor:Row,req:Request){
  const teams=await all(`SELECT t.*,u.name leader_name,a.username leader_username,CASE WHEN ?=1 OR t.leader_id=? THEN 'leader' ELSE m.role END role,(SELECT count(*) FROM team_members WHERE team_id=t.id AND user_id!=t.leader_id)+1 member_count FROM teams t JOIN users u ON u.id=t.leader_id JOIN accounts a ON a.user_id=u.id LEFT JOIN team_members m ON m.team_id=t.id AND m.user_id=? WHERE ?=1 OR t.leader_id=? OR m.user_id IS NOT NULL ORDER BY t.created_at`,actor.admin?1:0,actor.id,actor.id,actor.admin?1:0,actor.id);
  const root=(await one("SELECT value FROM settings WHERE key='owner'"))?.value;
  const result:Row={actor:{id:actor.id,name:actor.name,admin:actor.admin,owner:actor.id===root},teams};
  if(actor.admin)result.users=await all(`SELECT u.id,u.name,u.enabled,u.created_at,a.username,CASE WHEN u.id=? THEN 'owner' ELSE u.access_role END role,(SELECT count(*) FROM links WHERE owner_id=u.id AND deleted_at IS NULL) link_count FROM users u JOIN accounts a ON a.user_id=u.id ORDER BY u.created_at`,root);
  const teamId=new URL(req.url).searchParams.get('team');
  if(teamId){
   const team=teams.find(t=>t.id===teamId);if(!team)fail('无权查看此团队',403);
   result.members=await all(`SELECT u.id,u.name,a.username,u.enabled,CASE WHEN u.id=? THEN 'leader' ELSE m.role END role FROM users u JOIN accounts a ON a.user_id=u.id LEFT JOIN team_members m ON m.user_id=u.id AND m.team_id=? WHERE u.id=? OR m.user_id IS NOT NULL ORDER BY CASE WHEN u.id=? THEN 0 ELSE 1 END,u.name`,team.leader_id,teamId,team.leader_id,team.leader_id);
   if(team.role==='leader')result.audit=await all('SELECT a.action,a.detail,a.created_at,u.name actor_name FROM access_audit a JOIN users u ON u.id=a.actor_id WHERE a.team_id=? ORDER BY a.created_at DESC LIMIT 50',teamId);
  }
  return result;
 }
 async function mutate(actor:Row,b:Row){
  if(b.action==='user.create'){
   requireAdmin(actor);const username=usernameValue(b.username),name=nameValue(b.name||username),password=passwordValue(b.password),id=uid();
   await db.batch([db.prepare("INSERT INTO users(id,name,email,enabled,created_at,access_role) VALUES(?,?,?,1,?,'member')").bind(id,name,username,Date.now()),db.prepare('INSERT INTO accounts(user_id,username,password) VALUES(?,?,?)').bind(id,username,await encodePassword(password)),audit(actor,b.action,id,null,{username})]);return {ok:true,id};
  }
  if(b.action==='user.update'){
   requireAdmin(actor);const target=await realUser(String(b.id)),name=nameValue(b.name),role=String(b.role),enabled=b.enabled;
   if(!['admin','member'].includes(role)||typeof enabled!=='boolean')fail('用户角色或状态无效');await protectUser(actor,target,role);
   await db.batch([db.prepare('UPDATE users SET name=?,access_role=?,enabled=? WHERE id=?').bind(name,role,enabled?1:0,target.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id),audit(actor,b.action,target.id,null,{name,role,enabled})]);return {ok:true};
  }
  if(b.action==='user.password'){
   requireAdmin(actor);const target=await realUser(String(b.id));await protectUser(actor,target);const password=passwordValue(b.password);
   await db.batch([db.prepare('UPDATE accounts SET password=? WHERE user_id=?').bind(await encodePassword(password),target.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id),audit(actor,b.action,target.id,null,{})]);return {ok:true};
  }
  if(b.action==='team.create'){
   requireAdmin(actor);const name=nameValue(b.name),leader=await realUser(String(b.leaderId));if(!leader.enabled)fail('请选择正常启用的负责人');const id=uid();
   await db.batch([db.prepare("INSERT INTO users(id,name,email,enabled,created_at,access_role) VALUES(?,?,?,1,?,'team')").bind(id,name,'team:'+id,Date.now()),db.prepare('INSERT INTO teams(id,name,leader_id,created_at) VALUES(?,?,?,?)').bind(id,name,leader.id,Date.now()),audit(actor,b.action,id,id,{name,leaderId:leader.id})]);return {ok:true,id};
  }
  if(b.action==='team.update'){
   requireAdmin(actor);const t=await teamFor(actor,String(b.id)),name=nameValue(b.name),leader=await realUser(String(b.leaderId));if(typeof b.enabled!=='boolean')fail('团队状态无效');
   if(b.revision!==t.revision)fail('团队已被其他人修改，请刷新后重试',409);
   const result=await db.batch([db.prepare('UPDATE teams SET name=?,leader_id=?,enabled=?,revision=revision+1 WHERE id=? AND revision=?').bind(name,leader.id,b.enabled?1:0,t.id,t.revision),db.prepare('INSERT INTO access_audit(id,actor_id,action,target_id,team_id,detail,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()>0').bind(uid(),actor.id,b.action,t.id,t.id,JSON.stringify({name,leaderId:leader.id,enabled:b.enabled}),Date.now())]);
   // Revision is checked by SQL too; batch adapters expose returned rows differently.
   const changed=result[0]?.changes??result[0]?.meta?.changes;
   if(!changed)fail('团队已被其他人修改，请刷新后重试',409);
   return {ok:true};
  }
  if(b.action==='member.save'||b.action==='member.remove'){
   const t=await teamFor(actor,String(b.teamId));if(!t.enabled)fail('请先启用团队');const username=usernameValue(b.username),target=await one('SELECT u.* FROM users u JOIN accounts a ON a.user_id=u.id WHERE a.username=?',username);
   if(!target)fail('账号不存在，请管理员先创建账号',404);if(target.id===t.leader_id)fail('负责人由管理员在团队设置中调整');
   if(b.action==='member.save'&&(!target.enabled||!['editor','viewer'].includes(b.role)))fail('请选择正常账号和有效角色');
   // Recheck leader and target inside the mutation, so an in-flight request
   // cannot add members after a concurrent leader transfer or team suspension.
   const allowed='EXISTS(SELECT 1 FROM teams t JOIN users u ON u.id=? WHERE t.id=? AND t.enabled=1 AND t.leader_id!=? AND (?=1 OR t.leader_id=?) AND u.enabled=1)';
   const args=[target.id,t.id,target.id,actor.admin?1:0,actor.id];
   const write=b.action==='member.save'?db.prepare('INSERT INTO team_members(team_id,user_id,role,created_at) SELECT ?,?,?,? WHERE '+allowed+' ON CONFLICT(team_id,user_id) DO UPDATE SET role=excluded.role').bind(t.id,target.id,b.role,Date.now(),...args):db.prepare('DELETE FROM team_members WHERE team_id=? AND user_id=? AND EXISTS(SELECT 1 FROM teams t WHERE t.id=? AND t.enabled=1 AND t.leader_id!=? AND (?=1 OR t.leader_id=?))').bind(t.id,target.id,t.id,target.id,actor.admin?1:0,actor.id);
   const result=await db.batch([write,db.prepare('INSERT INTO access_audit(id,actor_id,action,target_id,team_id,detail,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()>0').bind(uid(),actor.id,b.action,target.id,t.id,JSON.stringify({username,role:b.action==='member.save'?b.role:null}),Date.now())]);
   if(!(result[0]?.changes??result[0]?.meta?.changes))fail('团队或成员状态已变化，请刷新后核对',409);
   return {ok:true};
  }
  fail('未知管理操作');
 }
 async function handle(req:Request){try{const actor=await authenticate(req);if(req.method==='GET')return reply(await read(actor,req));if(req.method!=='POST')return reply({error:'请求方式不支持'},405);guard(req);const body=await req.json().catch(()=>fail('请求 JSON 无效'));if(!body||typeof body!=='object'||Array.isArray(body))fail('请求内容必须是对象');return reply(await mutate(actor,body as Row));}catch(err:any){if(String(err.message).includes('TEAM_LEADER_REQUIRED'))return reply({error:'启用的团队必须有正常负责人；停用用户前请先转交负责人或停用团队'},409);if(String(err.message).includes('UNIQUE'))return reply({error:'账号或团队名称已存在，请换一个名称'},409);return errors(err);}}
 return {handle,mutate};
}
