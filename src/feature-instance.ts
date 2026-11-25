import {createFeatures} from './features.ts';
import {database} from './database.ts';
import {workspaceUser} from './auth.ts';
export const features=createFeatures({db:database,user:workspaceUser,pepper:()=>process.env.AUTH_PEPPER||process.env.SETUP_TOKEN||'',ip:req=>req.headers.get('x-internal-client-ip')||'local'});
