import {reserved} from '../../src/link-rules.ts';
import {shouldFeishuHandoff,renderFeishuHandoff} from '../../src/feishu-handoff.ts';
import {feishuProbe} from './feishu-probe.js';
export default {fetch(req){const probe=feishuProbe(req);if(probe)return probe;const url=new URL(req.url);if(/^\/[a-zA-Z0-9_-]{3,64}$/.test(url.pathname)&&!reserved.has(url.pathname.slice(1).toLowerCase())&&shouldFeishuHandoff(req))return renderFeishuHandoff(req);url.protocol='https:';url.host='link-share-9188.pages.dev';return new Response(null,{status:302,headers:{Location:url.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}});}};
