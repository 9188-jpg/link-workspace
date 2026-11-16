import {AsyncLocalStorage} from 'node:async_hooks';
export interface WorkerEnv {DB:D1Database;ASSETS:Fetcher;SETUP_TOKEN?:string;AUTH_PEPPER?:string;PUBLIC_ORIGIN?:string;}
const context=new AsyncLocalStorage<WorkerEnv>();
export function withEnv<T>(env:WorkerEnv,fn:()=>T){return context.run(env,fn);}
export function getEnv(){const env=context.getStore();if(!env)throw new Error('Missing request context');return env;}
export const database={prepare(sql:string){return getEnv().DB.prepare(sql);},batch(stmts:D1PreparedStatement[]){return getEnv().DB.batch(stmts);}};
