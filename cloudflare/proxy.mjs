// Optional free public ingress. All durable data stays in Cloudflare D1.
import {createServer} from 'node:http';
const backend=new URL(process.env.WORKER_ORIGIN||'https://link-workspace-check.links-9188.workers.dev');
if(backend.protocol!=='https:'||!backend.hostname.endsWith('.workers.dev')||backend.username||backend.password)throw new Error('WORKER_ORIGIN must be your HTTPS workers.dev origin');
const hop=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','host','content-length','accept-encoding']);
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/healthz'){res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');return;}
  const target=new URL(req.url||'/',backend);if(target.origin!==backend.origin){res.writeHead(400);res.end('Bad request');return;}
  const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v&&!hop.has(k))headers.set(k,Array.isArray(v)?v.join(','):v);
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
  const method=req.method||'GET';
  const upstream=await fetch(target,{method,headers,redirect:'manual',signal:AbortSignal.timeout(20000),...(['GET','HEAD'].includes(method)?{}:{body:Buffer.concat(chunks)})});
  res.statusCode=upstream.status;for(const[k,v]of upstream.headers)if(!hop.has(k)&&k!=='set-cookie'&&k!=='content-encoding')res.setHeader(k,v);
  const cookies=upstream.headers.getSetCookie();if(cookies.length)res.setHeader('set-cookie',cookies);
  const location=upstream.headers.get('location');if(location&&location.startsWith(backend.origin)){const origin=process.env.RENDER_EXTERNAL_URL||process.env.PUBLIC_ORIGIN;if(origin)res.setHeader('location',origin+location.slice(backend.origin.length));}
  if(method==='HEAD'||!upstream.body){res.end();return;}
  for await(const chunk of upstream.body){if(!res.write(chunk))await new Promise(resolve=>res.once('drain',resolve));}res.end();
 }catch{if(!res.headersSent){res.writeHead(502,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});res.end('连接服务超时，请稍后重试。');}else res.end();}
});
server.requestTimeout=30000;server.headersTimeout=15000;server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Public ingress ready'));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
