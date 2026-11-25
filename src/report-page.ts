/** Public report form and storage. The table is created on first use so no remote migration is required. */
import {type FeatureDB, type Row, day, e, fail, statements, text, uid} from './feature-types.ts';

export const reportReasons: {id: string; label: string}[] = [
 {id: 'broken', label: '链接失效或打不开'},
 {id: 'illegal', label: '内容违规 / 违法'},
 {id: 'fraud', label: '诈骗或风险内容'},
 {id: 'other', label: '其他问题'},
];

const reasonIds = new Set(reportReasons.map((item) => item.id));

export function ensureReportsTable(db: FeatureDB) {
 return db.prepare(`CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, host TEXT, url TEXT, reason TEXT, contact TEXT, message TEXT, created_at INTEGER, day TEXT)`).run();
}

export function cleanReport(input: Row) {
 const raw = text(input.url, 2000);
 if (!raw) fail('缺少要举报的网址');
 let url: URL;
 try {
  url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
 } catch {
  fail('要举报的网址格式不正确');
 }
 if (!['http:', 'https:'].includes(url!.protocol)) fail('要举报的网址格式不正确');
 const reason = reasonIds.has(String(input.reason)) ? String(input.reason) : 'other';
 const message = text(input.message, 2000);
 if (message.length < 4) fail('请填写举报说明（至少 4 个字）');
 const contact = text(input.contact, 160);
 return {url: url!.href.slice(0, 2000), host: url!.host.slice(0, 200), reason, contact, message};
}

export async function saveReport(db: FeatureDB, input: Row) {
 await ensureReportsTable(db);
 const clean = cleanReport(input);
 const {run} = statements(db);
 const id = uid();
 await run('INSERT INTO reports(id,host,url,reason,contact,message,created_at,day) VALUES (?,?,?,?,?,?,?,?)', id, clean.host, clean.url, clean.reason, clean.contact, clean.message, Date.now(), day());
 return {ok: true, id};
}

const labelOf = (id: string) => reportReasons.find((item) => item.id === id)?.label || id;

export function reportPage(options: {url?: string; done?: boolean; id?: string; error?: string}) {
 const target = options.url ? text(options.url, 2000) : '';
 const nonce = uid();
 const shell = (inner: string, script = '') => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><title>举报 · 资源中转站</title><style>
 :root{color-scheme:light;--ink:#1f2b3d;--muted:#6b7a90;--brand:#5269d8;--line:#e4eaf3;--bg:#f4f7fb;--ok:#0f9d58}
 *{box-sizing:border-box}
 body{margin:0;min-height:100svh;padding:28px 16px 40px;background:var(--bg);color:var(--ink);font:14px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased}
 .shell{max-width:460px;margin:0 auto}
 h1{margin:0 0 6px;font-size:22px;line-height:1.3}
 .intro{margin:0 0 22px;color:var(--muted);font-size:13px;line-height:1.8}
 .card{border:1px solid var(--line);border-radius:18px;padding:20px;background:#fff;box-shadow:0 12px 40px -30px #26406b66}
 label{display:block;margin:14px 0 6px;font-size:13px;font-weight:600}
 input[type=text],input[type=url],textarea{width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:#fbfdff;color:var(--ink);font:inherit;font-size:14px}
 input:focus,textarea:focus{outline:2px solid #c3cffa;outline-offset:1px}
 fieldset{margin:16px 0 0;padding:0;border:0}
 legend{padding:0;font-size:13px;font-weight:600;margin-bottom:8px}
 .choice{display:flex;align-items:center;gap:10px;margin:8px 0;padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:#fbfdff;font-weight:500;cursor:pointer}
 .choice input{width:18px;height:18px;min-height:auto;margin:0;flex:none;accent-color:var(--brand)}
 .choice:has(input:checked){border-color:#a9b8f0;background:#f2f5ff}
 textarea{min-height:110px;resize:vertical}
 button,.button{display:block;width:100%;margin-top:18px;padding:13px 16px;border:0;border-radius:11px;background:var(--brand);color:#fff;font:inherit;font-size:15px;font-weight:600;text-align:center;text-decoration:none;cursor:pointer}
 button[disabled]{opacity:.6}
 #report-status{margin:12px 0 0;font-size:13px;color:var(--muted);text-align:center;min-height:20px}
 #report-status.is-error{color:#b23a48;font-weight:600}
 .error{margin:0 0 16px;padding:11px 13px;border:1px solid #f2c8cf;border-radius:10px;background:#fff2f4;color:#b23a48;font-size:13px}
 .success{text-align:center;padding:14px 6px 6px}
 .success .mark{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:#e8f7ef;color:var(--ok);font-size:34px;line-height:1}
 .success h2{margin:0 0 8px;font-size:20px}
 .success p{margin:0 0 6px;color:var(--muted);font-size:13px}
 .success .code{margin:14px 0 0;padding:10px 12px;border:1px dashed var(--line);border-radius:10px;background:#fbfdff;font-size:12px;color:var(--muted);overflow-wrap:anywhere}
 .success .button{margin-top:22px;background:var(--brand)}
 .success .link{display:block;margin-top:12px;color:var(--muted);font-size:13px;text-decoration:underline}
 .foot{margin:18px 0 0;text-align:center;color:var(--muted);font-size:12px}
 </style></head><body><main class="shell">${inner}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`;
 const foot = '<p class="foot">资源中转站 · 请确认分享者及目标网址</p>';

 if (options.done) {
  const code = options.id ? `<p class="code">举报编号：${e(options.id)}</p>` : '';
  return pageResponse(shell(`<h1>举报已提交</h1>
   <div class="card success"><div class="mark" aria-hidden="true">✓</div><h2>已收到你的举报</h2><p>我们会在后台统一处理，涉及违法或诈骗内容会优先核实。</p>${code}<a class="button" href="/report">再提交一条</a><a class="link" href="/">返回首页</a></div>${foot}`), nonce);
 }

 const banner = options.error ? `<p class="error">${e(options.error)}</p>` : '';
 const body = `<h1>举报</h1><p class="intro">请填写下面的信息，我们会在后台统一处理。涉及违法或诈骗内容，请尽量说明具体位置。</p>
 <form id="report-form" method="post" action="/api/public/report" class="card" novalidate>${banner}<label for="report-url">被举报的网址</label><input id="report-url" type="url" name="url" required maxlength="2000" value="${e(target)}" placeholder="https://…">
 <fieldset><legend>问题类型</legend>${reportReasons.map((item, index) => `<label class="choice"><input type="radio" name="reason" value="${item.id}"${index === 0 ? ' checked' : ''}><span>${item.label}</span></label>`).join('')}</fieldset>
 <label for="report-message">说明</label><textarea id="report-message" name="message" required maxlength="2000" placeholder="例如：这条短链打不开、跳转到无关页面"></textarea>
 <label for="report-contact">联系方式（可选）</label><input id="report-contact" type="text" name="contact" maxlength="160" placeholder="微信 / 邮箱，方便我们回复">
 <button type="submit">提交举报</button><p id="report-status" role="status"></p></form>${foot}`;
 const script = `(()=>{
  const form=document.getElementById('report-form');
  const status=document.getElementById('report-status');
  const urlField=form.querySelector('[name=url]');
  if(!urlField.value&&document.referrer)urlField.value=document.referrer;
  const say=(message,error)=>{status.textContent=message;status.classList.toggle('is-error',!!error);};
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   const button=form.querySelector('button');
   const data=Object.fromEntries(new FormData(form));
   if(!data.url){say('请填写被举报的网址',true);urlField.focus();return;}
   const rawUrl=String(data.url).trim();if(!(rawUrl.slice(0,7).toLowerCase()==='http://'||rawUrl.slice(0,8).toLowerCase()==='https://')){say('被举报网址请以 http:// 或 https:// 开头',true);urlField.focus();return;}
   if(!data.message||String(data.message).trim().length<4){say('请填写举报说明（至少 4 个字）',true);form.querySelector('[name=message]').focus();return;}
   button.disabled=true;say('正在提交…',false);
   try{
    const response=await fetch('/api/public/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const result=await response.json();
    if(!response.ok){const message=response.status===429?'提交太频繁了：每 10 分钟最多 10 次，请约 10 分钟后再试':(result.error||'提交失败，请稍后重试');say(message,true);button.disabled=false;return;}
    location.replace('/report?done=1'+(result.id?'&id='+encodeURIComponent(result.id):''));
   }catch{say('提交失败，请检查网络后重试',true);button.disabled=false;}
  });
 })();`;
 return pageResponse(shell(body, script), nonce);
}

function pageResponse(html: string, nonce: string) {
 return new Response(html, {headers: {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex,nofollow',
  'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src 'self' https: data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
 }});
}

export {labelOf};
