import {features} from './features.ts';
import {withEnv,type WorkerEnv} from './database.ts';
import {auth} from './auth.ts';
import * as api from './routes/api.ts';
import * as redirect from './routes/redirect.ts';
export default {fetch(req:Request,env:WorkerEnv){return withEnv(env,async()=>{
 try{
  if(env.PUBLIC_ORIGIN){const canonical=new URL(env.PUBLIC_ORIGIN);if(canonical.protocol!=='https:')throw new Error('PUBLIC_ORIGIN must use HTTPS');const original=new URL(req.url);req=new Request(new URL(original.pathname+original.search,canonical),req);}
  const url=new URL(req.url),path=url.pathname;
  if(path==='/healthz')return Response.json({ok:true});
  if(['POST','PUT','PATCH'].includes(req.method)){
   const bodyLimit=path==='/api/features'||path==='/api/workspace'||path.startsWith('/api/openapi/')?786432:16384;
   if(Number(req.headers.get('content-length')||0)>bodyLimit)return Response.json({error:'请求内容过大'},{status:413});
   const text=await req.text();if(new TextEncoder().encode(text).length>bodyLimit)return Response.json({error:'请求内容过大'},{status:413});
   req=new Request(req,{body:text});
  }
  let response:Response;
  if(path.startsWith('/auth/'))response=await auth(req,path);
  else if(path==='/api/features')response=await features.handle(req);
  else if(path.startsWith('/api/public/')||path.startsWith('/api/openapi/')||path.startsWith('/p/')||path.startsWith('/partner/')||path.startsWith('/media/')||path.startsWith('/legal/'))response=await features.publicRoute(req);
  else if(path==='/api/workspace')response=req.method==='GET'?await api.GET(req):req.method==='POST'?await api.POST(req):Response.json({error:'不支持的请求方式'},{status:405});
  else if(['/','/admin','/dashboard','/setup','/register'].includes(path)){
   response=await env.ASSETS.fetch(new Request(new URL('/',url),req));
   if(response.status===404)response=await env.ASSETS.fetch(new Request(new URL('/index.html',url),req));
   response=new Response(response.body,response);response.headers.set('Cache-Control','no-store');response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  }else if(path.startsWith('/assets/'))response=await env.ASSETS.fetch(req);
  else if(/^\/[a-zA-Z0-9_-]{3,64}$/.test(path)&&['GET','HEAD'].includes(req.method))response=await redirect[req.method as 'GET'|'HEAD'](req,{params:Promise.resolve({slug:path.slice(1)})});
  else response=new Response('Not found',{status:404});
  const result=new Response(response.body,response);result.headers.set('X-Content-Type-Options','nosniff');result.headers.set('Referrer-Policy','no-referrer');return result;
 }catch(e:any){if(!e.status)console.error('Request failed:',e.message);return Response.json({error:e.status?e.message:'服务暂时不可用，请稍后重试'},{status:e.status||500,headers:{'Cache-Control':'no-store'}});}
 });}};
