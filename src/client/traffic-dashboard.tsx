import {useEffect, useState} from 'react';
import {BarChart3, MousePointer2, Users} from 'lucide-react';
import {featureApi} from './feature-console';

export type ReportKind = 'links' | 'homepages' | 'documents';
type Day = {date:string; visits:number; clicks:number};
type Totals = {visits:number; clicks:number; copies:number; redirects:number; conversions:number; leads:number; yesterday:number; today:number; visitors:number};
type Entry = {key:string; label:string; count:number};
type Report = {options:{id:string; title:string; host:string}[]; totals:Totals; lifetime:Pick<Totals,'visits'|'clicks'|'visitors'|'leads'>; daily:Day[]; ranking:Entry[]};

const count = (n: number) => n.toLocaleString('zh-CN');
const percentage = (n: number, total: number) => (total ? n / total : 0).toLocaleString('zh-CN', {style:'percent', maximumFractionDigits:1});
const series = [
 {key:'visits', label:'确认访问', color:'#3776e7'},
 {key:'clicks', label:'点击', color:'#0b8d83'},
 {key:'rate', label:'点击率', color:'#835ac8'},
] as const;
const bars = [series[0],series[1]] as const;

function TrafficChart({days}: {days:Day[]}) {
 const [selected, setSelected] = useState<number | null>(null);
 const peak = Math.max(0,...days.map(d=>Math.max(d.visits,d.clicks)));
 const topCount = Math.max(4,Math.ceil(peak/4)*4);
 const topRate = Math.max(1,...days.map(d=>d.visits ? d.clicks/d.visits : 0));
 const plotLeft=56, plotWidth=668, baseline=184, plotHeight=154;
 const slot=plotWidth/Math.max(1,days.length), groupWidth=Math.min(42,slot*.78);
 const gap=Math.min(3,groupWidth/6), barWidth=(groupWidth-gap)/2;
 const x = (i:number) => plotLeft+(i+.5)*slot;
 const barHeight = (value:number) => value/topCount*plotHeight;
 const rateY = (d:Day) => baseline-(d.visits?d.clicks/d.visits:0)/topRate*plotHeight;
 const active = selected === null ? days.at(-1) : days[selected];
 const labelStep = Math.max(1,Math.ceil(days.length/7));
 return <section className="report-section" aria-label="每日趋势">
  <div className="report-section-header"><h3>每日趋势</h3><span>北京时间</span></div>
  <div className="report-legend">{series.map(s=><span key={s.key}><i className={s.key==='rate'?'report-legend-line':'report-legend-bar'} style={{background:s.color}}/>{s.label}</span>)}</div>
  <svg className="report-chart" viewBox="0 0 780 221" role="img" aria-label="每日确认访问、点击柱状图与点击率折线图" tabIndex={0} onPointerLeave={event=>{if(event.pointerType==='mouse')setSelected(null);}} onKeyDown={event=>{if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();setSelected(index=>Math.max(0,Math.min(days.length-1,(index??days.length-1)+(event.key==='ArrowLeft'?-1:1))));}}>
   {[0,1,2,3,4].map(t=><g key={t}><line x1={56} x2={724} y1={184-t*38.5} y2={184-t*38.5}/><text x={48} y={188-t*38.5} textAnchor="end">{Number((topCount*t/4).toFixed(1))}</text><text x={733} y={188-t*38.5}>{percentage(topRate*t/4,1)}</text></g>)}
   {selected!==null&&days[selected]&&<rect x={x(selected)-slot/2} y={baseline-plotHeight} width={slot} height={plotHeight} fill="#eaf2fe" opacity=".72"/>}
   {days.map((d,i)=><g key={d.date}>{bars.map((metric,column)=><rect key={metric.key} className="report-bar" x={x(i)-groupWidth/2+column*(barWidth+gap)} y={baseline-barHeight(d[metric.key])} width={barWidth} height={barHeight(d[metric.key])} rx={Math.min(2,barWidth/2)} fill={metric.color}/>)}</g>)}
   <polyline points={days.map((d,i)=>`${x(i)},${rateY(d)}`).join(' ')} fill="none" stroke={series[2].color} strokeWidth={2.5} strokeLinejoin="round"/>
   {days.map((d,i)=><g key={d.date}>
    {(days.length<=14||selected===i)&&<circle cx={x(i)} cy={rateY(d)} r={selected===i?4.5:3} fill="white" stroke={series[2].color} strokeWidth={2}/>}
    {(i%labelStep===0||i===days.length-1)&&<text x={x(i)} y={210} textAnchor="middle">{d.date.slice(5).replace('-','/')}</text>}
    <rect x={x(i)-slot/2} width={slot} y={27} height={161} fill="transparent" onPointerEnter={()=>setSelected(i)} onPointerDown={()=>setSelected(i)}><title>{d.date} · 访问 {d.visits} · 点击 {d.clicks} · 点击率 {percentage(d.clicks,d.visits)}</title></rect>
   </g>)}
  </svg>
  {active&&<div className="report-day" aria-live="polite"><strong>{active.date}</strong><span>访问 {count(active.visits)}</span><span>点击 {count(active.clicks)}</span><span>点击率 {percentage(active.clicks,active.visits)}</span></div>}
 </section>;
}

export default function TrafficDashboard({kind, domain, from, to, refresh, linkId='', initialLifetime=kind!=='links'}: {kind:ReportKind; domain:string; from:string; to:string; refresh:number; linkId?:string; initialLifetime?:boolean}) {
 const visitLabel = kind==='links' ? '去重访问' : '确认访问';
 const [selection, setSelection] = useState('');
 const [lifetime, setLifetime] = useState(initialLifetime);
 const [state,setState] = useState<{key:string; report?:Report; error?:string}>();
 const query = new URLSearchParams({section:'trafficReport',kind,domain,from,to,id:linkId||selection}).toString();
 useEffect(()=>{
  let current=true;
  featureApi('?'+query).then(report=>{if(current)setState({key:query,report:report as Report});}, error=>{if(current)setState({key:query,error:error.message});});
  return ()=>{current=false;};
 },[query,refresh]);
 const options = state?.report?.options || [];
 const report = state?.key===query ? state.report : undefined;
 const t = report?.totals;
 const overview = lifetime ? report?.lifetime : t;
 return <div className="traffic-dashboard">
  {kind!=='links'&&<label className="report-select">{kind==='homepages'?'域名首页':'内容页'}<select value={selection} onChange={event=>setSelection(event.target.value)}><option value="">全部</option>{options.map(item=><option key={item.id} value={item.id}>{item.host?`${item.host} · `:''}{item.title}</option>)}</select></label>}
  {state?.key===query&&state.error?<p className="error-message" role="alert">{state.error}</p>:!t||!report||!overview?<p className="hint" role="status">正在加载统计…</p>:<>
   <div className="report-metrics">
    <article className="report-today"><div><BarChart3 size={17}/><h3>{visitLabel}</h3></div><dl><div><dt>昨日</dt><dd>{count(t.yesterday)}</dd></div><div><dt>今日</dt><dd>{count(t.today)}</dd></div></dl></article>
    <article><div><MousePointer2 size={16}/><h3>访问概览</h3><select className="report-scope" aria-label="概览时段" value={lifetime?'all':'period'} onChange={event=>setLifetime(event.target.value==='all')}><option value="all">累计</option><option value="period">所选时段</option></select></div><dl><div><dt>{visitLabel}</dt><dd>{count(overview.visits)}</dd></div><div><dt>点击</dt><dd>{count(overview.clicks)}</dd></div><div><dt>点击率</dt><dd>{percentage(overview.clicks,overview.visits)}</dd></div>{kind!=='links'&&<div><dt><Users size={13}/>访客</dt><dd>{count(overview.visitors)}</dd></div>}</dl></article>
   </div>
   <TrafficChart key={query} days={report.daily}/>
   {linkId&&<details><summary>每日数据表</summary><div className="table-scroll"><table className="data-table report-table"><thead><tr><th scope="col">日期</th><th scope="col">{visitLabel}</th><th scope="col">点击</th><th scope="col">点击率</th></tr></thead><tbody>{report.daily.map(d=><tr key={d.date}><td><time dateTime={d.date}>{d.date}</time></td><td>{count(d.visits)}</td><td>{count(d.clicks)}</td><td>{percentage(d.clicks,d.visits)}</td></tr>)}</tbody></table></div></details>}
   <section className="report-section" aria-label={linkId?'短链操作':'点击排行'}><div className="report-section-header"><h3>{linkId?'短链操作':'点击排行'}</h3><span>所选时段</span></div>
    {!linkId&&(report.ranking.length?<div className="table-scroll"><table className="data-table report-table"><thead><tr><th scope="col">排名</th><th scope="col">{kind==='links'?'短链':'入口'}</th><th scope="col">点击</th><th scope="col">占比</th></tr></thead><tbody>{report.ranking.map((item,index)=><tr key={item.key}><td>{index+1}</td><td>{item.label}</td><td>{count(item.count)}</td><td><span className="report-share"><i style={{width:percentage(item.count,t.clicks)}}/>{percentage(item.count,t.clicks)}</span></td></tr>)}</tbody></table></div>:<p className="hint">这个时段暂无点击数据。</p>)}
    {kind==='links'?<p className="hint">自动跳转 {count(t.redirects)} · 复制 {count(t.copies)} · 转化上报 {count(t.conversions)}</p>:<p className="hint">{kind==='documents'&&<>所选时段线索 {count(t.leads)} · 累计线索 {count(report.lifetime.leads)} · </>}入口点击从启用统计起记录。</p>}
   </section>
  </>}
 </div>;
}
