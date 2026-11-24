/** Edits isolated drafts and previews the visitor-facing homepage. */
import {useEffect, useRef, useState, type ComponentType} from 'react';
import {previewProfile, profileAppearance, profileDefaults} from '../profile-page';
import {ProfileFields, type ProfileDraft} from './profile-fields';

type Row = Record<string, any>;
type HomeMode = 'page' | 'direct';
const empty = (): ProfileDraft => ({...profileDefaults, blocks: []});
const defaultSearch = {allowIndex: false, baiduVerification: ''};

export default function HomeEditor({api, Upload}: {
 api: (params?: string, body?: Row) => Promise<Row>;
 Upload: ComponentType<{onUploaded: (url: string) => void}>;
}) {
 const [data, setData] = useState<Row>({domains: []});
 const [domainId, setDomainId] = useState('');
 const [body, setBody] = useState(empty);
 const [mode, setMode] = useState<HomeMode>('page');
 const [templateId, setTemplateId] = useState('');
 const [redirectUrl, setRedirectUrl] = useState('');
 const [searchSettings, setSearchSettings] = useState(defaultSearch);
 const [busy, setBusy] = useState(false);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState('');
 const [notice, setNotice] = useState('');
 const epoch = useRef(0);
 const query = (id: string) => '?' + new URLSearchParams({section: 'homepage', ...(id ? {domainId: id} : {})});

 useEffect(() => {
  const version = ++epoch.current;
  setLoading(true);
  setError('');
  setNotice('');
  setData(previous => ({domains: previous.domains || []}));
  setBody(empty());
  setMode('page');
  setTemplateId('');
  setRedirectUrl('');
  setSearchSettings(defaultSearch);
  api(query(domainId)).then(result => {
   if (version !== epoch.current) return;
   const draft = result.document ? JSON.parse(result.document.draft) : {};
   setData(result);
   setBody({...empty(), ...draft, ...profileAppearance(draft)});
   setMode((result.config?.draftMode ?? result.config?.mode) === 'direct' ? 'direct' : 'page');
   setTemplateId(result.config?.draftTemplateId ?? result.config?.templateId ?? '');
   setRedirectUrl(result.config?.redirectDraft ?? result.config?.redirectUrl ?? '');
   setSearchSettings(result.config?.draftSearch ?? result.config?.publishedSearch ?? defaultSearch);
  }).catch(err => {
   if (version === epoch.current) setError(err.message);
  }).finally(() => {
   if (version === epoch.current) setLoading(false);
  });
  return () => { epoch.current++; };
 }, [api, domainId]);

 const id = data.domainId;
 const domain = data.domains.find((d: Row) => d.id === id);
 const templates: Row[] = data.templates || [];
 const selectedTemplate = templates.find(template => template.id === templateId);
 const previewBody = selectedTemplate ? JSON.parse(selectedTemplate.published) : body;
 async function save(action: string) {
  setBusy(true);
  setError('');
  setNotice('');
  try {
   const settings = mode === 'direct' ? {mode, redirectUrl} : {mode, templateId, body:templateId?undefined:body, searchSettings};
   await api('', {action, domainId: id, ...settings});
   const result = await api(query(id));
   setData(result);
   setRedirectUrl(result.config?.redirectDraft ?? result.config?.redirectUrl ?? '');
   setSearchSettings(result.config?.draftSearch ?? result.config?.publishedSearch ?? defaultSearch);
   setNotice(action === 'homepage.apply' ? mode === 'direct' ? '直跳已启用，打开域名首页即可跳转。' : '首页已应用，打开域名即可查看。'
    : action === 'homepage.disable' ? '首页已停用，根地址恢复原登录入口。' : '草稿已保存，公开首页保持原版本。');
  } catch (err: any) {
   setError(err.message);
  } finally {
   setBusy(false);
  }
 }

 return <section className="home-editor">
  <h2>域名首页</h2>
  {error && <p role="alert" className="error-message">{error}</p>}
  {notice && <p role="status" className="info-note">{notice}</p>}
  <label>设置哪个域名<select disabled={busy || loading} value={domainId || id || ''} onChange={event => setDomainId(event.target.value)}>
   {data.domains.map((d: Row) => <option key={d.id} value={d.id}>{d.display_host || d.host} {d.status === 'active' ? '' : '（尚未启用）'}</option>)}
  </select></label>
  {loading && <p role="status">正在读取首页配置…</p>}
  {!loading && !domain && !error && <p>暂无可管理的域名。共享域名首页由管理员设置。</p>}
  {!loading && domain && <>
   <p className="hint">
    当前首页 · {data.config?.enabled ? data.config.mode === 'direct' ? '直接跳转' : '中转页' : '未启用'} · <a href={domain.origin + '/admin'} target="_blank" rel="noreferrer">管理后台</a>
    {data.config?.enabled && <> · <a href={domain.origin} target="_blank" rel="noreferrer">打开公开首页</a></>}
   </p>
   <div className={mode === 'page' ? 'home-editor-grid' : undefined}>
    <form onSubmit={event => { event.preventDefault(); void save('homepage.save'); }}>
     <fieldset disabled={busy}>
      <label>首页打开方式<select value={mode} onChange={event => setMode(event.target.value as HomeMode)}>
       <option value="page">显示中转页</option><option value="direct">直接跳转</option>
      </select></label>
      {mode === 'direct' ? <label>承接网址<input type="url" required maxLength={4096}
       placeholder="https://…" value={redirectUrl} onChange={event => setRedirectUrl(event.target.value)}/></label> : <>
      <h3>搜索引擎收录</h3>
      <label className="home-checkbox"><input type="checkbox" checked={searchSettings.allowIndex}
       onChange={event => setSearchSettings({...searchSettings, allowIndex: event.target.checked})}/>允许搜索引擎收录首页</label>
      <label>百度 HTML 验证标签（可选）<input type="text" maxLength={260} value={searchSettings.baiduVerification}
       onChange={event => setSearchSettings({...searchSettings, baiduVerification: event.target.value})} placeholder="粘贴百度提供的标签或验证值"/></label>
      <p className="hint">应用到域名首页后生效。百度验证和提交在百度搜索资源平台完成。</p>
       <label>首页模板<select value={templateId} onChange={event => setTemplateId(event.target.value)}>
        <option value="">自定义域名首页</option>
        {templateId && !selectedTemplate && <option value={templateId} disabled>当前模板不可用</option>}
        {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
       </select></label>
       {templateId ? <p className="hint">在「功能中心 → 内容与模板」编辑并发布这套模板，即可同时更新已使用它的页面。</p> : <>
       <ProfileFields body={body} onChange={setBody} Upload={Upload} titleLabel="首页标题"/>

       </>}
      </>}
      <div className="home-actions">
       <button className="button secondary" type="submit">保存草稿</button>
       <button className="button primary" type="button" disabled={domain.status !== 'active'}
        onClick={event => { if (event.currentTarget.form?.reportValidity()) void save('homepage.apply'); }}>应用到域名首页</button>
       {data.config?.enabled && <button className="text-button" type="button" onClick={() => void save('homepage.disable')}>停用首页</button>}
      </div>
      {domain.status !== 'active' && <p className="hint">可以先保存草稿，域名绑定并启用后即可应用。</p>}
     </fieldset>
    </form>
    {mode === 'page' && <aside className="home-preview-panel">
     <h3>首页预览</h3>
      <iframe title="首页预览" className="home-preview-frame" sandbox="" srcDoc={previewProfile(previewBody)}/>
    </aside>}
   </div>
  </>}
 </section>;
}
