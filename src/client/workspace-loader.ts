export type WorkspaceSnapshot<T>={key:string;view:string;value:T};
export function workspaceKey(scope:Record<string,string>){return new URLSearchParams(scope).toString();}
export function currentWorkspace<T>(snapshot:WorkspaceSnapshot<T>|null,key:string){return snapshot?.key===key?snapshot.value:null;}
export function initialWorkspaceScope(){const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return {view:'links',domain:'',q:'',from:today,to:today,traffic:'verified'};}
export async function bootstrapWorkspace(fetcher:typeof fetch,signal:AbortSignal):Promise<Record<string,any>>{
 const scope=initialWorkspaceScope(),key=workspaceKey(scope),me=await fetcher('/api/workspace?'+key,{cache:'no-store',signal});
 if(me.ok)return {authorized:true,initial:{key,view:scope.view,value:await me.json()},scope};
 if(![401,403].includes(me.status))throw new Error('服务连接失败，请刷新重试');
 const status=await fetcher('/auth/status',{cache:'no-store',signal});
 if(!status.ok)throw new Error('服务连接失败，请刷新重试');
 return await status.json() as Record<string,any>;
}
export function removeWorkspaceLinks<T extends Record<string,any>>(snapshot:WorkspaceSnapshot<T>|null,ids:string[]){
 if(!snapshot||snapshot.view!=='links')return snapshot;
 const deleted=new Set(ids);
 return {...snapshot,value:{...snapshot.value,items:(snapshot.value.items||[]).filter((row:any)=>!deleted.has(row.id))}};
}

// Cancellation saves work; the generation check also handles responses already in flight.
export class WorkspaceLoader {
 private generation=0;
 private controller:AbortController|null=null;
 invalidate(){this.generation++;this.controller?.abort();this.controller=null;}
 async load<T>(read:(signal:AbortSignal)=>Promise<T>):Promise<{value:T}|{error:Error}|null>{
  this.invalidate();const generation=this.generation,controller=new AbortController();this.controller=controller;
  try{const value=await read(controller.signal);return generation===this.generation?{value}:null;}
  catch(error){return generation===this.generation?{error:error instanceof Error?error:new Error(String(error))}:null;}
  finally{if(generation===this.generation)this.controller=null;}
 }
}
