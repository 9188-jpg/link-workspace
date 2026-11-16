import {spawnSync} from 'node:child_process';
import {copyFileSync,cpSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
for(const args of [['node_modules/vite/bin/vite.js','build','--outDir','dist-pages'],['node_modules/wrangler/bin/wrangler.js','deploy','--dry-run','--outdir','outputs/pages-worker']]){
 const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});if(result.status!==0)process.exit(result.status||1);
}
copyFileSync(resolve(root,'outputs/pages-worker/worker.js'),resolve(root,'dist-pages/_worker.js'));
cpSync(resolve(root,'cloudflare/browser-probe'),resolve(root,'dist-pages/assets'),{recursive:true});
writeFileSync(resolve(root,'dist-pages/_routes.json'),JSON.stringify({version:1,include:['/*'],exclude:['/assets/*']}));
writeFileSync(resolve(root,'dist-pages/_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Robots-Tag: noindex, nofollow\n');
console.log('Pages build ready: dist-pages');
