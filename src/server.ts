import {features} from './feature-instance.ts';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {auth} from './auth.ts';
import * as api from './routes/api.ts';
import * as redirect from './routes/redirect.ts';
const port=Number(process.env.PORT||3000),host=process.env.HOST||'0.0.0.0';
const publicOrigin=process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL||'';
if(process.env.RENDER&&!publicOrigin)throw new Error('Render 部署缺少公开网址配置');
if(publicOrigin&&new URL(publicOrigin).protocol!=='https:'&&!['localhost','127.0.0.1'].includes(new URL(publicOrigin).hostname))throw new Error('公开网址必须使用 HTTPS');
const staticRoot=resolve('dist');
const types:Record<string,string>={'.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(incoming,outgoing)=>{
 try{
  if(incoming.url==='/healthz'){outgoing.writeHead(200,{'Content-Type':'application/json'});outgoing.end('{"ok":true}');return;}
  const origin=publicOrigin||`http://127.0.0.1:${port}`;
  const url=new URL(incoming.url||'/',origin);
  if(url.origin!==new URL(origin).origin)throw Object.assign(new Error('无效的请求地址'),{status:400});
  const headers=new Headers();for(const [k,v] of Object.entries(incoming.headers)){if(v)headers.set(k,Array.isArray(v)?v.join(','):v);}
  headers.set('x-internal-client-ip',incoming.socket.remoteAddress||'local');
  const bodyLimit=url.pathname==='/api/features'||url.pathname==='/api/workspace'||url.pathname.startsWith('/api/openapi/')?786432:16384;const chunks:Buffer[]=[];let size=0;for await(const chunk of incoming){size+=chunk.length;if(size>bodyLimit)throw Object.assign(new Error('请求内容过大'),{status:413});chunks.push(chunk);}
  const method=incoming.method||'GET';
  const req=new Request(url,{method,headers,...(['GET','HEAD'].includes(method)?{}:{body:Buffer.concat(chunks)})});
  let result:Response;
  if(url.pathname.startsWith('/auth/'))result=await auth(req,url.pathname,incoming.socket.remoteAddress||'unknown');
  else if(url.pathname==='/api/features')result=await features.handle(req);
  else if(url.pathname.startsWith('/api/public/')||url.pathname.startsWith('/api/openapi/')||url.pathname.startsWith('/p/')||url.pathname.startsWith('/partner/')||url.pathname.startsWith('/media/')||url.pathname.startsWith('/legal/'))result=await features.publicRoute(req);
  else if(url.pathname==='/api/workspace'){
   if(method==='GET')result=await api.GET(req);else if(method==='POST')result=await api.POST(req);else result=Response.json({error:'不支持的请求方式'},{status:405});
  }else if(url.pathname.startsWith('/assets/')){
   const path=resolve(staticRoot,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(staticRoot+'/')&&!path.startsWith(staticRoot+'\\'))throw Object.assign(new Error('页面不存在'),{status:404});
   const file=await readFile(path);result=new Response(file,{headers:{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'public,max-age=31536000,immutable'}});
  }else if(['/','/admin','/dashboard','/setup','/register'].includes(url.pathname)){
   result=new Response(await readFile(resolve(staticRoot,'index.html')),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"}});
  }else if(/^\/[a-zA-Z0-9_-]{3,64}$/.test(url.pathname)&&['GET','HEAD'].includes(method)){
   result=await redirect[method as 'GET'|'HEAD'](req,{params:Promise.resolve({slug:url.pathname.slice(1)})});
  }else result=Response.json({error:'页面不存在'},{status:404});
  outgoing.statusCode=result.status;for(const[k,v]of result.headers)if(k!=='set-cookie')outgoing.setHeader(k,v);const cookies=result.headers.getSetCookie();if(cookies.length)outgoing.setHeader('Set-Cookie',cookies);outgoing.setHeader('X-Content-Type-Options','nosniff');outgoing.setHeader('Referrer-Policy','no-referrer');outgoing.end(method==='HEAD'?undefined:Buffer.from(await result.arrayBuffer()));
 }catch(e:any){const status=e.status||(e.code==='ENOENT'?404:500);if(status===500)console.error('request failed:',e.message);outgoing.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});outgoing.end(JSON.stringify({error:status===500?'服务暂时不可用，请稍后重试':e.message}));}
});
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(port,host,()=>console.log(`Link workspace listening at http://${host}:${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
