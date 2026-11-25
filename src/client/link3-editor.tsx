/** Shared editor for Link3-style pages: 域名首页 and 短链中转模板 use the same fields. */
import {useEffect, useRef, useState, type ComponentType, type CSSProperties, type PointerEvent as ReactPointerEvent} from 'react';
import {link3Defaults,maxLink3Blocks,previewLink3} from '../link3-page';

type Row = Record<string, any>;
type Upload = ComponentType<{onUploaded: (url: string) => void}>;
const uid = () => crypto.randomUUID();
const clone = (value: Row) => JSON.parse(JSON.stringify(value));

export type Link3BlockType = 'text' | 'group' | 'button' | 'image' | 'card' | 'target';
export const link3BlockNames: Record<string, string> = {
 text: '粗体文案', group: '分组标题', button: '圆角按钮', image: '整宽图片', card: '图片卡片', target: '目标按钮（短链页自动填充）',
};

function normalBlock(block: Row): Row {
 const type: Link3BlockType = ['text', 'group', 'button', 'image', 'card', 'target'].includes(block?.type) ? block.type : 'text';
 return {
  id: String(block?.id || uid()), type,
  title: String(block?.title ?? ''), text: String(block?.text ?? ''),
  url: String(block?.url ?? ''), image: String(block?.image ?? ''), link: String(block?.link ?? ''),
  enabled: block?.enabled !== false,
 };
}

/** Leniently turn any saved draft (legacy profile body or Link3 body) into editable Link3 fields. */
export function toLink3Draft(input: Row | undefined): Row {
 const base: Row = clone(link3Defaults);
 if (!input || typeof input !== 'object') return base;
 const mapped: Row = {...base};
 for (const key of ['title', 'description', 'avatar', 'backgroundMode', 'background', 'backgroundEnd', 'backgroundImage', 'pageText', 'accent', 'accentText', 'linkLabel']) {
  if (input[key] !== undefined) mapped[key] = input[key];
 }
 mapped.showTopIcons = input.showTopIcons !== false;
 mapped.showSharePill = input.showSharePill !== false;
 mapped.socials = (Array.isArray(input.socials) ? input.socials : []).slice(0, 8).map((item: Row) => ({
  id: String(item?.id || uid()), image: String(item?.image ?? ''), url: String(item?.url ?? ''), enabled: item?.enabled !== false,
 }));
 mapped.footer = {...base.footer, ...(input.footer || {})};
 mapped.float = {...base.float, ...(input.float || {})};
 const legacy = input.layout !== 'link3';
 mapped.blocks = (Array.isArray(input.blocks) ? input.blocks : []).slice(0, maxLink3Blocks).map((block: Row) => {
  if (!legacy) return normalBlock(block);
  if (block?.type === 'group') return normalBlock({...block, type: 'group'});
  return normalBlock({...block, type: 'button'});
 });
 mapped.layout = 'link3';
 return mapped;
}

export function emptyLink3Body(): Row {
 return toLink3Draft(undefined);
}

export function Link3Preview({body, className}: {body: Row; className?: string}) {
 const frame = useRef<HTMLIFrameElement>(null);
 const scroll = useRef(0);
 const attach = () => {
  const win = frame.current?.contentWindow;
  if (!win) return;
  try {
   win.scrollTo(0, scroll.current);
   win.addEventListener('scroll', () => { scroll.current = win.scrollY; }, {passive: true});
  } catch { /* 预览不可访问时忽略 */ }
 };
 return <iframe ref={frame} title="Link3 风格页面预览" className={className || 'home-preview-frame'} sandbox="allow-scripts allow-same-origin" srcDoc={previewLink3(body)} onLoad={attach}/>;
}

function FocusBox({block, onChange}: {block: Row; onChange: (patch: Row) => void}) {
 const [local, setLocal] = useState(() => ({x: Number(block.focusX ?? 50), y: Number(block.focusY ?? 50)}));
 const localRef = useRef(local);
 const drag = useRef<{x: number; y: number; fx: number; fy: number; w: number; h: number} | null>(null);
 const clamp = (value: number) => Math.round(Math.max(0, Math.min(100, value)));
 const write = (next: {x: number; y: number}) => { localRef.current = next; setLocal(next); };
 // 外部值变化（切换图片/撤销）时同步；拖动过程中不打断
 useEffect(() => {
  if (drag.current) return;
  const next = {x: Number(block.focusX ?? 50), y: Number(block.focusY ?? 50)};
  localRef.current = next;
  setLocal(next);
 }, [block.focusX, block.focusY]);
 function begin(event: ReactPointerEvent<HTMLDivElement>) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  drag.current = {x: event.clientX, y: event.clientY, fx: localRef.current.x, fy: localRef.current.y, w: rect.width || 1, h: rect.height || 1};
  document.body.classList.add('is-dragging-image');
  const move = (moveEvent: PointerEvent) => {
   const state = drag.current;
   if (!state) return;
   moveEvent.preventDefault();
   // 拖动中只更新左侧预览框，不触发父级重渲染：右侧首页预览保持不动
   write({x: clamp(state.fx - (moveEvent.clientX - state.x) / state.w * 100), y: clamp(state.fy - (moveEvent.clientY - state.y) / state.h * 100)});
  };
  const finish = () => {
   drag.current = null;
   document.body.classList.remove('is-dragging-image');
   window.removeEventListener('pointermove', move);
   window.removeEventListener('pointerup', finish);
   window.removeEventListener('pointercancel', finish);
   onChange({focusX: localRef.current.x, focusY: localRef.current.y});
  };
  window.addEventListener('pointermove', move, {passive: false});
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
 }
 const commit = () => onChange({focusX: localRef.current.x, focusY: localRef.current.y});
 const boxStyle: CSSProperties = {position: 'relative', width: '100%', maxWidth: 340, aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: 12, border: '1px solid #dde5f0', background: '#f3f6fb', cursor: 'grab', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none'};
 const imgStyle: CSSProperties = {display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${local.x}% ${local.y}%`, pointerEvents: 'none', userSelect: 'none', WebkitUserSelect: 'none'};
 return <div style={{margin: '14px 0'}}>
  <div style={boxStyle} onPointerDown={begin} onDragStart={event => event.preventDefault()} title="按住拖动，选择显示区域">
   {block.url
    ? <img src={block.url} alt="" draggable={false} style={imgStyle}/>
    : <span className="hint" style={{display: 'grid', placeItems: 'center', height: '100%', margin: 0}}>填写图片网址后可拖动选择显示区域</span>}
  </div>
  <div className="feature-grid" style={{marginTop: 10}}>
   <label>水平位置 {local.x}%<input type="range" min={0} max={100} value={local.x}
    onChange={event => write({...localRef.current, x: Number(event.target.value)})}
    onPointerUp={commit} onKeyUp={commit} onBlur={commit}/></label>
   <label>垂直位置 {local.y}%<input type="range" min={0} max={100} value={local.y}
    onChange={event => write({...localRef.current, y: Number(event.target.value)})}
    onPointerUp={commit} onKeyUp={commit} onBlur={commit}/></label>
  </div>
  <p className="hint">按住图片拖动，或用滑杆调整显示区域；松手后右侧预览才更新（拖动过程中预览不会刷新）。图片卡片固定按 16:9 裁切。</p>
 </div>;
}

export default function Link3Editor({body, onChange, Upload}: {
 body: Row;
 onChange: (body: Row) => void;
 Upload: Upload;
}) {
 function field(key: string, value: any) {
  onChange({...body, [key]: value});
 }
 function blockField(id: string, patch: Row) {
  onChange({...body, blocks: body.blocks.map((block: Row) => block.id === id ? {...block, ...patch} : block)});
 }
 function addBlock(type: Link3BlockType) {
  if (body.blocks.length >= maxLink3Blocks) return;
  onChange({...body, blocks: [...body.blocks, normalBlock({type})]});
 }
 function moveBlock(index: number, offset: number) {
  const blocks = [...body.blocks];
  const target = index + offset;
  if (target < 0 || target >= blocks.length) return;
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  onChange({...body, blocks});
 }
 function removeBlock(id: string) {
  onChange({...body, blocks: body.blocks.filter((block: Row) => block.id !== id)});
 }
 function addSocial() {
  if (body.socials.length >= 8) return;
  onChange({...body, socials: [...body.socials, {id: uid(), image: '', url: '', enabled: true}]});
 }
 function socialField(id: string, patch: Row) {
  onChange({...body, socials: body.socials.map((item: Row) => item.id === id ? {...item, ...patch} : item)});
 }

 return <div className="link3-editor">
  <h3>页面资料</h3>
  <label>首页标题<input required maxLength={160} value={body.title || ''} onChange={event => field('title', event.target.value)} placeholder="例如：我的资源小站"/></label>
  <label>介绍<textarea maxLength={2000} rows={3} value={body.description || ''} onChange={event => field('description', event.target.value)} placeholder="头像下方的灰色简介，可换行"/></label>
  <label>头像网址<input type="url" value={body.avatar || ''} onChange={event => field('avatar', event.target.value)} placeholder="https://…"/></label>
  <Upload onUploaded={url => field('avatar', url)}/>
  {body.avatar ? <button type="button" className="text-button" onClick={() => field('avatar', '')}>移除头像</button> : null}

  <h3>页面外观</h3>
  <label>背景类型<select value={body.backgroundMode || 'default'} onChange={event => field('backgroundMode', event.target.value)}>
   <option value="default">Link3 默认浅色</option><option value="solid">纯色</option><option value="gradient">渐变</option><option value="image">图片</option>
  </select></label>
  <div className="feature-grid">
   {body.backgroundMode !== 'default' && <label>背景颜色<input type="color" value={body.background || '#fffdfe'} onChange={event => field('background', event.target.value)}/></label>}
   {body.backgroundMode === 'gradient' && <label>渐变结束颜色<input type="color" value={body.backgroundEnd || '#ffffff'} onChange={event => field('backgroundEnd', event.target.value)}/></label>}
   <label>正文颜色<input type="color" value={body.pageText || '#1a1a1a'} onChange={event => field('pageText', event.target.value)}/></label>
   <label>按钮底色<input type="color" value={body.accent || '#fbe0e0'} onChange={event => field('accent', event.target.value)}/></label>
   <label>按钮文字颜色<input type="color" value={body.accentText || '#5e5e5e'} onChange={event => field('accentText', event.target.value)}/></label>
  </div>
  <div className="feature-grid">
   <label>配色模式<select value={body.colorMode || 'auto'} onChange={event => field('colorMode', event.target.value)}>
    <option value="auto">跟随系统（自动深色）</option><option value="light">始终浅色</option><option value="dark">始终深色</option>
   </select></label>
   <label>页面字号<select value={body.fontScale || 'normal'} onChange={event => field('fontScale', event.target.value)}>
    <option value="small">小</option><option value="normal">标准</option><option value="large">大</option>
   </select></label>
  </div>
  {body.backgroundMode === 'image' && <>
   <label>背景图片网址<input type="url" value={body.backgroundImage || ''} onChange={event => field('backgroundImage', event.target.value)}/></label>
   <Upload onUploaded={url => field('backgroundImage', url)}/>
   {body.backgroundImage ? <button type="button" className="text-button" onClick={() => field('backgroundImage', '')}>移除背景图</button> : null}
  </>}

  <div className="feature-grid">
   <label>短链地址显示<input maxLength={160} value={body.linkLabel || ''} onChange={event => field('linkLabel', event.target.value)} placeholder="留空：短链页显示自己的短链，首页显示域名"/></label>
   <label className="check-row"><input type="checkbox" checked={body.showSharePill !== false} onChange={event => field('showSharePill', event.target.checked)}/>显示短链地址胶囊</label>
   <label className="check-row"><input type="checkbox" checked={body.showTopIcons !== false} onChange={event => field('showTopIcons', event.target.checked)}/>显示顶栏图标（主页/收藏/分享）</label>
  </div>

  <h3>社交图标</h3>
  <p className="hint">头像下方的小圆标，最多 8 个。</p>
  {body.socials.map((item: Row, index: number) => <section className="home-link-editor" key={item.id}>
   <label className="check-row"><input type="checkbox" checked={item.enabled !== false} onChange={event => socialField(item.id, {enabled: event.target.checked})}/>显示图标 {index + 1}</label>
   <label>图标图片网址<input type="url" value={item.image || ''} onChange={event => socialField(item.id, {image: event.target.value})}/></label>
   <Upload onUploaded={url => socialField(item.id, {image: url})}/>
   <label>点击后打开<input type="url" value={item.url || ''} onChange={event => socialField(item.id, {url: event.target.value})} placeholder="https://…（可留空）"/></label>
   <button type="button" className="text-button danger-text" onClick={() => onChange({...body, socials: body.socials.filter((social: Row) => social.id !== item.id)})}>移除图标</button>
  </section>)}
  <button type="button" className="button secondary" disabled={body.socials.length >= 8} onClick={addSocial}>＋ 添加社交图标</button>

  <h3>内容块</h3>
  <p className="hint">按顺序显示；拖动或上下移动调顺序。短链页会自动把「目标按钮」放在第一个内容块前面。</p>
  {body.blocks.map((block: Row, index: number) => <fieldset className="feature-rule" key={block.id} draggable
   onDragStart={event => event.dataTransfer.setData('application/x-link3-block', String(index))}
   onDragOver={event => event.preventDefault()}
   onDrop={event => {
    event.preventDefault();
    const from = Number(event.dataTransfer.getData('application/x-link3-block'));
    if (!Number.isInteger(from) || from < 0 || from >= body.blocks.length || from === index) return;
    const blocks = [...body.blocks];
    const [moving] = blocks.splice(from, 1);
    blocks.splice(index, 0, moving);
    onChange({...body, blocks});
   }}>
   <legend title="可拖动调整顺序">{index + 1}. {link3BlockNames[block.type] || block.type}</legend>
   {block.type === 'text' && <label>正文<textarea maxLength={4000} rows={5} value={block.text || ''} onChange={event => blockField(block.id, {text: event.target.value})} placeholder="支持换行，页面里显示为粗体段落"/></label>}
   {block.type === 'group' && <label>分组标题<input maxLength={160} value={block.title || ''} onChange={event => blockField(block.id, {title: event.target.value})}/></label>}
   {block.type === 'button' && <>
    <label className="check-row"><input type="checkbox" checked={block.enabled !== false} onChange={event => blockField(block.id, {enabled: event.target.checked})}/>显示这个按钮</label>
    <label>按钮文字<input maxLength={160} value={block.title || ''} onChange={event => blockField(block.id, {title: event.target.value})}/></label>
    <label>长链接<input type="url" value={block.url || ''} onChange={event => blockField(block.id, {url: event.target.value})} placeholder="https://…"/></label>
    <label>小字说明（可选）<input maxLength={2000} value={block.text || ''} onChange={event => blockField(block.id, {text: event.target.value})}/></label>
    <label>左侧图标网址（可选）<input type="url" value={block.image || ''} onChange={event => blockField(block.id, {image: event.target.value})}/></label>
    <Upload onUploaded={url => blockField(block.id, {image: url})}/>
   </>}
   {block.type === 'image' && <>
    <p className="hint">整宽图片：宽度满屏、高度固定 320px（比原来矮），适合横幅/跑马灯，不带标题和点击。</p>
    <label>图片网址<input type="url" value={block.url || ''} onChange={event => blockField(block.id, {url: event.target.value})}/></label>
    <Upload onUploaded={url => blockField(block.id, {url})}/>
    <FocusBox block={block} onChange={patch => blockField(block.id, patch)}/>
   </>}
   {block.type === 'card' && <>
    <p className="hint">图片卡片：统一 16:9 裁切（不管上传多大的图，卡片大小都一样），可加底部标题、点击跳转。</p>
    <label>图片网址<input type="url" value={block.url || ''} onChange={event => blockField(block.id, {url: event.target.value})}/></label>
    <Upload onUploaded={url => blockField(block.id, {url})}/>
    <FocusBox block={block} onChange={patch => blockField(block.id, patch)}/>
    <label>底部标题<input maxLength={160} value={block.title || ''} onChange={event => blockField(block.id, {title: event.target.value})}/></label>
    <label>点击后打开（可选）<input type="url" value={block.link || ''} onChange={event => blockField(block.id, {link: event.target.value})} placeholder="https://…"/></label>
   </>}
   {block.type === 'target' && <>
    <p className="hint">短链页把这条短链的目标网址渲染成一个粉红圆角按钮（和上面的按钮块同款，只有一个按钮、没有链接文字和复制行）；在域名首页里这一块不显示。</p>
    <label>按钮文字<input maxLength={160} value={block.title || ''} onChange={event => blockField(block.id, {title: event.target.value})} placeholder="点击获取资源"/></label>
    <label>左侧图标网址（可选）<input type="url" value={block.image || ''} onChange={event => blockField(block.id, {image: event.target.value})}/></label>
    <Upload onUploaded={url => blockField(block.id, {image: url})}/>
   </>}
   <div className="feature-inline">
    <button type="button" className="text-button" disabled={!index} onClick={() => moveBlock(index, -1)}>上移</button>
    <button type="button" className="text-button" disabled={index === body.blocks.length - 1} onClick={() => moveBlock(index, 1)}>下移</button>
    <button type="button" className="text-button danger-text" onClick={() => removeBlock(block.id)}>移除</button>
   </div>
  </fieldset>)}
  <div className="feature-inline">
   {(['text', 'group', 'button', 'image', 'card', 'target'] as Link3BlockType[]).map(type =>
    <button type="button" className="button secondary" key={type} disabled={body.blocks.length >= maxLink3Blocks} onClick={() => addBlock(type)}>＋ {link3BlockNames[type]}</button>)}
  </div>

  <h3>页脚与悬浮按钮</h3>
  <div className="feature-grid">
   <label>页脚品牌文字<input maxLength={80} value={body.footer?.brand || ''} onChange={event => field('footer', {...body.footer, brand: event.target.value})}/></label>
   <label className="check-row"><input type="checkbox" checked={body.footer?.report !== false} onChange={event => field('footer', {...body.footer, report: event.target.checked})}/>显示「举报」入口</label>
  </div>
  <label>页脚小图标网址（可选）<input type="url" value={body.footer?.brandImage || ''} onChange={event => field('footer', {...body.footer, brandImage: event.target.value})}/></label>
  <Upload onUploaded={url => field('footer', {...body.footer, brandImage: url})}/>
  <label className="check-row"><input type="checkbox" checked={body.float?.enabled === true} onChange={event => field('float', {...body.float, enabled: event.target.checked})}/>显示底部悬浮按钮</label>
  {body.float?.enabled && <div className="feature-grid">
   <label>悬浮按钮文字<input maxLength={60} value={body.float?.text || ''} onChange={event => field('float', {...body.float, text: event.target.value})}/></label>
   <label>悬浮按钮链接<input type="url" value={body.float?.url || ''} onChange={event => field('float', {...body.float, url: event.target.value})}/></label>
  </div>}
 </div>;
}
