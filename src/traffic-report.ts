import {day, fail, statements, text, type FeatureDB, type Row} from './feature-types.ts';
import {displayHost} from './domain-display.ts';

const millisecondsPerDay = 86400000;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** Aggregate confirmed short-link and document visits within the viewer’s scope. */
export async function trafficReport(db: FeatureDB, params: URLSearchParams, user: Row) {
 const {all,one} = statements(db);
 const today = day();
 const yesterday = day(Date.now() - millisecondsPerDay);
 const from = params.get('from') || today;
 const to = params.get('to') || today;
 const start = Date.parse(from);
 const end = Date.parse(to);
 if (!datePattern.test(from) || !datePattern.test(to) || !Number.isFinite(start) || !Number.isFinite(end) || start > end || end - start > 366 * millisecondsPerDay || new Date(start).toISOString().slice(0,10) !== from || new Date(end).toISOString().slice(0,10) !== to) fail('日期范围无效');
 const kind = params.get('kind') || 'links';
 if (!['links', 'homepages', 'documents'].includes(kind)) fail('统计类型无效');
 const domain = text(params.get('domain'), 50);
 const selection = text(params.get('id'), 50);
 const dateFilter = '(a.day BETWEEN ? AND ? OR a.day IN (?, ?))';
 const dates = [from, to, yesterday, today];
 let rows: Row[];
 let options: Row[] = [];
 const blocks: {key:string; label:string}[] = [];
 let visitors = 0;
 let lifetime: {visits:number; clicks:number; visitors:number; leads:number};
 let periodLeads = 0;

 if (kind === 'links') {
  const owner = user.admin ? '1=1' : 'l.owner_id=?';
  const scope = `${owner} AND (?='' OR l.domain_id=?) AND (?='' OR l.id=?)`;
  const bindings = [...(user.admin ? [] : [user.id]), domain, domain, selection, selection];
  if (selection && !await one(`SELECT l.id FROM links l WHERE ${scope}`, ...bindings)) fail('找不到可查看的短链', 404);
  const args = [...bindings, ...dates];
  const filter = `${scope} AND ${dateFilter}`;
  const [visits, clicks, cumulative] = await Promise.all([
   all(`SELECT a.day, 'arrival' kind, count(*) total FROM visits a JOIN links l ON l.id=a.link_id WHERE a.verified=1 AND ${filter} GROUP BY a.day`, ...args),
   all(`SELECT a.day, a.kind, l.id, l.slug, l.title, h.host, count(*) total FROM link_events a JOIN links l ON l.id=a.link_id JOIN domains h ON h.id=l.domain_id WHERE a.verified=1 AND a.kind IN ('click','copy','redirect','conversion') AND ${filter} GROUP BY a.day,a.kind,l.id`, ...args),
   all(`SELECT (SELECT count(*) FROM visits a JOIN links l ON l.id=a.link_id WHERE a.verified=1 AND ${scope}) visits,(SELECT count(*) FROM link_events a JOIN links l ON l.id=a.link_id WHERE a.verified=1 AND a.kind='click' AND ${scope}) clicks`, ...bindings, ...bindings),
  ]);
  lifetime = {visits:Number(cumulative[0].visits), clicks:Number(cumulative[0].clicks), visitors:0, leads:0};
  rows = [...visits, ...clicks];
 } else {
  const owner = user.admin ? '1=1' : 'd.owner_id=?';
  const args = user.admin ? [] : [user.id];
  const homeJoin = `JOIN settings s ON s.key LIKE 'homepage:%' AND json_extract(s.value,'$.documentId')=d.id JOIN domains h ON s.key='homepage:'||h.id`;
  const ordinary = `AND NOT EXISTS(SELECT 1 FROM settings s WHERE s.key LIKE 'homepage:%' AND json_extract(s.value,'$.documentId')=d.id)`;
  const source = kind === 'homepages'
   ? `FROM documents d ${homeJoin} WHERE ${owner} AND (?='' OR h.id=?) AND d.kind='page'`
   : `FROM documents d WHERE ${owner} AND d.kind IN ('page','qr','groupqr') ${ordinary}`;
  const body = kind === 'homepages' ? `COALESCE((SELECT t.published FROM documents t
   WHERE t.id=json_extract(s.value,'$.templateId') AND t.kind='template' AND t.deleted_at IS NULL
   AND json_extract(t.published,'$.layout')='collection'),d.published) published,h.host` : 'd.published';
  const documents = await all(`SELECT d.id,d.name,${body} ${source} AND d.deleted_at IS NULL AND d.published IS NOT NULL ORDER BY d.name,d.id`, ...args, ...(kind === 'homepages' ? [domain, domain] : []));
  options = documents.map(d => ({id:d.id, title:d.name, host:d.host ? displayHost(d.host) : ''}));
  const chosen = selection ? documents.find(d => d.id === selection) : undefined;
  if (selection && !chosen) fail('找不到可查看的页面', 404);
  const visible = chosen ? [chosen] : documents;
  const titles = new Map<string, string>();
  for (const doc of visible) {
   const body = JSON.parse(doc.published);
   for (const block of body.blocks || []) {
    if (!['profile','collection'].includes(body.layout) || block.type !== 'link') continue;
    const key = `${doc.id}:${block.id}`;
    const label = visible.length > 1 ? `${doc.name} · ${block.title}` : block.title;
    titles.set(key, label);
    if (block.enabled !== false && block.url) blocks.push({key, label});
   }
  }
  const filter = ` AND (?='' OR d.id=?) AND d.deleted_at IS NULL AND d.published IS NOT NULL`;
  const scoped = [...args, ...(kind === 'homepages' ? [domain, domain] : []), selection, selection];
  const eventSource = source.replace('FROM documents d','FROM documents d JOIN document_events a ON a.document_id=d.id');
  const [visits, leads, cumulative] = await Promise.all([
   all(`SELECT a.day,a.kind,d.id,d.name,count(*) total ${eventSource} ${filter} AND a.verified=1 AND (a.kind='arrival' OR a.kind LIKE 'click:%') AND ${dateFilter} GROUP BY a.day,a.kind,d.id`, ...scoped, ...dates),
   all(`SELECT count(*) total,count(CASE WHEN a.day BETWEEN ? AND ? THEN 1 END) period_total ${source.replace('FROM documents d','FROM documents d JOIN leads a ON a.document_id=d.id')} ${filter}`, from,to,...scoped),
   all(`SELECT count(CASE WHEN a.kind='arrival' THEN 1 END) visits,count(CASE WHEN a.kind LIKE 'click:%' THEN 1 END) clicks,count(DISTINCT CASE WHEN a.kind='arrival' THEN a.visitor END) visitors,count(DISTINCT CASE WHEN a.kind='arrival' AND a.day BETWEEN ? AND ? THEN a.visitor END) period_visitors ${eventSource} ${filter} AND a.verified=1`, from,to,...scoped),
  ]);
  lifetime = {visits:Number(cumulative[0].visits), clicks:Number(cumulative[0].clicks), visitors:Number(cumulative[0].visitors), leads:Number(leads[0].total)};
  visitors = Number(cumulative[0].period_visitors);
  periodLeads = Number(leads[0].period_total);
  rows = visits;
  for (const row of rows) {
   if (!row.kind.startsWith('click:')) continue;
   row.key = `${row.id}:${row.kind.slice(6)}`;
   row.label = titles.get(row.key) || `已移除入口 · ${row.name}`;
  }
 }

 const byDate = new Map<string, {date:string; visits:number; clicks:number}>();
 for (let date = start; date <= end; date += millisecondsPerDay) {
  const key = new Date(date).toISOString().slice(0,10);
  byDate.set(key,{date:key,visits:0,clicks:0});
 }
 const ranking = new Map(blocks.map(b => [b.key,{...b, count:0}]));
 const totals = {visits:0, clicks:0, copies:0, redirects:0, conversions:0, leads:periodLeads, yesterday:0, today:0, visitors};
 for (const row of rows) {
  const count = Number(row.total);
  const metric = byDate.get(row.day);
  if (row.kind === 'arrival') {
   if (row.day === today) totals.today += count;
   if (row.day === yesterday) totals.yesterday += count;
   if (metric) {metric.visits += count; totals.visits += count;}
  }
  if (!metric) continue;
  if (row.kind === 'click' || row.kind.startsWith('click:')) {
   metric.clicks += count;
   totals.clicks += count;
   const key = row.key || row.id;
   const label = row.label || `${row.title || row.slug} · ${displayHost(row.host)}`;
   const item = ranking.get(key) || {key,label,count:0};
   item.count += count;
   ranking.set(key,item);
  } else if (row.kind === 'copy') totals.copies += count;
  else if (row.kind === 'redirect') totals.redirects += count;
  else if (row.kind === 'conversion') totals.conversions += count;
 }
 return {options, totals, lifetime, daily:[...byDate.values()], ranking:[...ranking.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'zh-CN'))};
}
