// Per-tab selection: switching a team reloads the application to discard all
// previous requests, forms and scoped snapshots. Authentication is unchanged.
const teamKey='link-workspace-team';
export function selectedTeam(){try{return sessionStorage.getItem(teamKey)||'';}catch{return '';}}
export function selectTeam(id:string){try{if(id)sessionStorage.setItem(teamKey,id);else sessionStorage.removeItem(teamKey);}catch{throw new Error('浏览器未允许保存空间选择');}location.assign('/admin');}
export const workspaceFetch:typeof fetch=(input,init)=>{
 const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 const path=new URL(url,location.origin).pathname;
 const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));
 const team=selectedTeam();
 // Account settings always belong to the signed-in human, not a team principal.
 const personal=typeof init?.body==='string'&&JSON.parse(init.body).action==='account.save';
 if(team&&!personal&&['/api/workspace','/api/features'].includes(path))headers.set('X-Workspace-Team',team);
 return fetch(input,{...init,headers});
};
export async function validateTeamSelection(){
 if(!selectedTeam())return;
 const response=await fetch('/api/access',{cache:'no-store'});
 if(response.status===401||response.status===403){sessionStorage.removeItem(teamKey);return;}
 if(!response.ok)throw new Error('无法读取团队权限');
 const data=await response.json() as any;
 if(!data.teams?.some((t:any)=>t.id===selectedTeam()&&t.enabled))sessionStorage.removeItem(teamKey);
}
