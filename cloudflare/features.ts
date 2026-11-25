import {createFeatures} from '../src/features.ts';
import {database,getEnv} from './database.ts';
import {workspaceUser} from './auth.ts';
export const features=createFeatures({db:database,user:workspaceUser,pepper:()=>getEnv().AUTH_PEPPER||'',ip:req=>req.headers.get('CF-Connecting-IP')||'unknown'});
