import {useEffect, useRef, type ComponentType} from 'react';
import {maxProfileBlocks, profileDefaults} from '../profile-page';

type Block = {id: string; type: 'link'|'group'; title: string; text?: string; url?: string; image?: string; enabled?: boolean};
export type ProfileDraft = typeof profileDefaults & {blocks: Block[]; layout?: string};
export function ProfileFields({body,onChange,Upload,titleLabel='页面标题'}: {
 body: ProfileDraft;
 onChange: (update: (previous: ProfileDraft) => ProfileDraft) => void;
 Upload: ComponentType<{onUploaded:(url:string)=>void}>;
 titleLabel?: string;
}) {
 const lifetime = useRef(0);
 const imageRevisions = useRef(new Map<string, number>());
 useEffect(() => () => { lifetime.current++; }, []);
 function field<Key extends keyof ProfileDraft>(key: Key, value: (ProfileDraft)[Key]) {
  onChange(previous => ({...previous, [key]: value}));
 }
 function updateBlock(id: string, patch: Partial<Block>) {
  onChange(previous => ({
   ...previous,
   blocks: previous.blocks.map(block => block.id === id ? {...block, ...patch} : block),
  }));
 }
 function uploadField(key: string, apply: (url: string) => void) {
  const version = lifetime.current;
  const revision = imageRevisions.current.get(key) ?? 0;
  return (url: string) => {
   if (version === lifetime.current && revision === (imageRevisions.current.get(key) ?? 0)) apply(url);
  };
 }
 function removeImage(key: string, clear: () => void) {
  imageRevisions.current.set(key, (imageRevisions.current.get(key) ?? 0) + 1);
  clear();
 }
 function add(type: Block['type']) {
  const block: Block = {id: crypto.randomUUID(), type, title: '', text: '', url: '', image: '', enabled: true};
  field('blocks', [...body.blocks, block]);
 }
 function move(index: number, offset: number) {
  const blocks = [...body.blocks];
  [blocks[index], blocks[index + offset]] = [blocks[index + offset], blocks[index]];
  field('blocks', blocks);
 }

 return <>
   <h3>页面资料</h3>
  <label>{titleLabel}<input required maxLength={160} value={body.title} onChange={event => field('title', event.target.value)} placeholder="例如：我的资源小站"/></label>
  <label>介绍<textarea maxLength={2000} rows={3} value={body.description} onChange={event => field('description', event.target.value)}/></label>
  <label>头像网址<input type="url" value={body.avatar} onChange={event => field('avatar', event.target.value)}/></label>
  <Upload onUploaded={uploadField('avatar', url => field('avatar', url))}/>
  {body.avatar && <button type="button" className="text-button" onClick={() => removeImage('avatar', () => field('avatar', ''))}>移除头像</button>}
  <h3>页面外观</h3>
  <label>背景类型<select value={body.backgroundMode} onChange={event => field('backgroundMode', event.target.value)}>
   <option value="default">现有中转页</option><option value="solid">纯色</option>
   <option value="gradient">渐变</option><option value="image">图片</option>
  </select></label>
  <div className="feature-grid">
   {body.backgroundMode !== 'default' && <label>背景颜色<input type="color" value={body.background} onChange={event => field('background', event.target.value)}/></label>}
   {body.backgroundMode === 'gradient' && <label>渐变结束颜色<input type="color" value={body.backgroundEnd} onChange={event => field('backgroundEnd', event.target.value)}/></label>}
   <label>页面文字颜色<input type="color" value={body.pageText} onChange={event => field('pageText', event.target.value)}/></label>
   <label>按钮颜色<input type="color" value={body.theme} onChange={event => field('theme', event.target.value)}/></label>
   <label>按钮文字颜色<input type="color" value={body.buttonText} onChange={event => field('buttonText', event.target.value)}/></label>
  </div>
  {body.backgroundMode === 'image' && <>
   <label>背景图片网址<input type="url" value={body.backgroundImage} onChange={event => field('backgroundImage', event.target.value)}/></label>
   <Upload onUploaded={uploadField('background', url => field('backgroundImage', url))}/>
  </>}
  {body.backgroundImage && <button type="button" className="text-button" onClick={() => removeImage('background', () => {
   onChange(previous => ({
    ...previous,
    backgroundImage: '',
    backgroundMode: previous.backgroundMode === 'image' ? 'default' : previous.backgroundMode,
   }));
  })}>移除背景图</button>}
  <div className="feature-grid">
   <label>按钮样式<select value={body.buttonStyle} onChange={event => field('buttonStyle', event.target.value)}>
    <option value="rounded">圆角卡片</option><option value="pill">胶囊按钮</option><option value="square">简洁方角</option>
   </select></label>
   <label>按钮文字位置<select value={body.buttonAlign} onChange={event => field('buttonAlign', event.target.value)}>
    <option value="left">居左</option><option value="center">居中</option><option value="right">居右</option>
   </select></label>
  </div>
  <label className="home-checkbox"><input type="checkbox" checked={body.showArrow} onChange={event => field('showArrow', event.target.checked)}/>显示按钮箭头</label>
  <label className="home-checkbox"><input type="checkbox" checked={body.search} onChange={event => field('search', event.target.checked)}/>允许访客搜索入口</label>
  <h3>页面入口</h3>
  <p className="hint">分组标题会显示在它下面的入口上方，可以移动标题和入口调整顺序。</p>
  {body.blocks.map((block, index) => <section className="home-link-editor" key={block.id}>
   {block.type === 'group' ?
    <label>分组名称<input required maxLength={160} value={block.title} onChange={event => updateBlock(block.id, {title: event.target.value})}/></label> :
    <>
     <label className="home-checkbox"><input type="checkbox" checked={block.enabled !== false}
      onChange={event => updateBlock(block.id, {enabled: event.target.checked})}/>显示入口 {index + 1}</label>
     <label>按钮 {index + 1} 名称<input required={block.enabled !== false} maxLength={160} value={block.title}
      onChange={event => updateBlock(block.id, {title: event.target.value})}/></label>
     <label>长链接<input type="url" required={block.enabled !== false} maxLength={4096} placeholder="https://…" value={block.url || ''}
      onChange={event => updateBlock(block.id, {url: event.target.value})}/></label>
     <label>按钮说明（可选）<input maxLength={4000} value={block.text || ''} onChange={event => updateBlock(block.id, {text: event.target.value})}/></label>
     <label>按钮图片网址（可选）<input type="url" value={block.image || ''} onChange={event => updateBlock(block.id, {image: event.target.value})}/></label>
     <Upload onUploaded={uploadField(block.id, url => updateBlock(block.id, {image: url}))}/>
     {block.image && <button type="button" className="text-button" onClick={() => removeImage(block.id, () => updateBlock(block.id, {image: ''}))}>移除按钮图片</button>}
    </>}
   <div className="feature-inline">
    <button type="button" className="text-button" disabled={!index} onClick={() => move(index, -1)}>上移</button>
    <button type="button" className="text-button" disabled={index === body.blocks.length - 1} onClick={() => move(index, 1)}>下移</button>
    <button type="button" className="text-button danger-text" onClick={() => field('blocks', body.blocks.filter(item => item.id !== block.id))}>
     {block.type === 'group' ? '移除分组标题' : '移除入口'}
    </button>
   </div>
  </section>)}
  <div className="feature-inline">
   <button type="button" className="button secondary" disabled={body.blocks.length >= maxProfileBlocks} onClick={() => add('link')}>＋ 添加入口</button>
   <button type="button" className="button secondary" disabled={body.blocks.length >= maxProfileBlocks} onClick={() => add('group')}>＋ 添加分组</button>
  </div>
 </>;
}
