export type Row=Record<string,any>;
export type HomepageMetadata={canonical:string;allowIndex:boolean;baiduVerification:string;description?:string};
export type FeatureDB={prepare:(sql:string)=>any;batch:(stmts:any[])=>any};
export type FeatureContext={db:FeatureDB;user:(req:Request)=>Promise<Row>|Row;pepper:()=>string;ip?:(req:Request)=>string};
export function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
export const e=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const js=(value:unknown)=>JSON.stringify(value).replace(/</g,'\\u003c');
export const day=(time=Date.now())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
export const uid=()=>crypto.randomUUID();
export const text=(v:unknown,max=160)=>String(v??'').trim().slice(0,max);
export function safeUrl(v:unknown){let u:URL;try{u=new URL(String(v));}catch{fail('请输入完整 HTTP(S) 网址');}if(!['https:','http:'].includes(u!.protocol)||u!.username||u!.password||u!.href.length>4096)fail('网址格式不受支持');return u!.href;}
export function statements(db:FeatureDB){return {one:async(sql:string,...a:any[])=>await db.prepare(sql).bind(...a).first() as Row|null,all:async(sql:string,...a:any[])=>(await db.prepare(sql).bind(...a).all()).results as Row[],run:async(sql:string,...a:any[])=>await db.prepare(sql).bind(...a).run()};}
export function guard(req:Request){if(req.headers.get('X-Requested-With')!=='link-workspace'||(req.headers.get('Origin')&&req.headers.get('Origin')!==new URL(req.url).origin))fail('请求校验失败',403);}
export const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export const errors=(err:any)=>reply({error:err.status?err.message:String(err.message).includes('UNIQUE')?'短码或名称已存在':'操作失败，请稍后重试'},err.status||500);
export function htmlPage(title:string,body:string,script='',nonce=uid(),homepage?:HomepageMetadata){
 const metadata=homepage?[
  '<link rel="canonical" href="'+e(homepage.canonical)+'">',
  homepage.description?'<meta name="description" content="'+e(homepage.description)+'">':'',
  homepage.baiduVerification?'<meta name="baidu-site-verification" content="'+e(homepage.baiduVerification)+'">':'',
 ].join(''):'';
 return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${e(title)}</title>${metadata}<style>body{margin:0;background:#f3f7fc;color:#26324a;font:14px/1.8 system-ui;min-height:100svh;display:grid;place-items:center;padding:24px;box-sizing:border-box}.page{width:100%;max-width:650px;background:#fff;border:1px solid #e2eaf4;border-radius:20px;padding:30px;box-sizing:border-box}h1{font-size:26px;line-height:1.5;overflow-wrap:anywhere}h2{font-size:19px}p{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#5269d8}input,textarea,select,button{font:inherit;box-sizing:border-box;max-width:100%;border:1px solid #dce5f1;border-radius:9px;padding:11px}input,textarea{width:100%;margin:8px 0}button,.button{cursor:pointer;display:inline-block;background:#5269d8;color:#fff;text-decoration:none;padding:11px 17px;border:0;border-radius:9px}img,video,audio,iframe{max-width:100%;border-radius:12px}iframe{width:100%;height:280px;border:0}.muted{color:#8994a7;font-size:12px}.block{padding:18px 0;border-bottom:1px solid #edf1f7}.error{color:#b13e59}.choice{display:block;margin:9px 0;background:#eff3ff;color:#5269d8}.footer{font-size:11px;color:#8994a7;margin-top:25px}</style></head><body><main class="page">${body}<p class="footer">资源中转站 · 请确认分享者及目标网址</p></main>${script?`<script nonce="${nonce}">${script}</script>`:''}</body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':homepage?.allowIndex?'index,nofollow':'noindex,nofollow','Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src 'self' https: data:; media-src https:; frame-src https://www.youtube.com https://player.bilibili.com https://v.qq.com; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`}});}
