import {createFeatures} from '../src/features.ts';
import {database,getEnv} from './database.ts';
import {sessionUser} from './auth.ts';
export const features=createFeatures({db:database,user:sessionUser,pepper:()=>getEnv().AUTH_PEPPER||'',ip:req=>req.headers.get('CF-Connecting-IP')||'unknown'});
