/** Validates and renders the same profile for the public homepage and editor preview. */
import {type HomepageMetadata, type Row, e, fail, htmlPage, safeUrl, text, uid} from './feature-types.ts';

export const profileDefaults = {
 title: '', description: '', avatar: '', backgroundMode: 'default', background: '#f3f8fc',
 backgroundEnd: '#dff9fa', backgroundImage: '', theme: '#1687ee', buttonText: '#ffffff',
 pageText: '#132940', buttonStyle: 'rounded', buttonAlign: 'left', showArrow: true, search: false,
};
export const maxProfileBlocks = 40;
export const collectionLayout = 'collection';
export const collectionDefaults = {
 ...profileDefaults, pageText: '#292240', theme: '#6347b5', buttonText: '#30234c',
};
const color = (value: unknown, fallback: string) =>
 typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
const choice = (value: unknown, allowed: readonly string[], fallback: string) =>
 typeof value === 'string' && allowed.includes(value) ? value : fallback;

export function profileAppearance(body: Row) {
 return {
  backgroundMode: choice(body.backgroundMode, ['default', 'solid', 'gradient', 'image'],
   body.backgroundImage ? 'image' : body.background && body.background !== profileDefaults.background ? 'solid' : 'default'),
  background: color(body.background, profileDefaults.background),
  backgroundEnd: color(body.backgroundEnd, profileDefaults.backgroundEnd),
  backgroundImage: typeof body.backgroundImage === 'string' ? body.backgroundImage : '',
  theme: color(body.theme, profileDefaults.theme),
  buttonText: color(body.buttonText, profileDefaults.buttonText),
  pageText: color(body.pageText, profileDefaults.pageText),
  buttonStyle: choice(body.buttonStyle, ['rounded', 'pill', 'square'], 'rounded'),
  buttonAlign: choice(body.buttonAlign, ['left', 'center', 'right'], 'left'),
  showArrow: body.showArrow !== false,
  search: body.search === true,
 };
}

export function cleanProfile(body: Row) {
 const look = profileAppearance(body);
 const title = text(body.title, 160);
 if (!title) fail('请填写首页标题');
 const blocks = Array.isArray(body.blocks) ? body.blocks : [];
 if (blocks.length > maxProfileBlocks) fail('首页最多可添加 40 个入口和分组');
 const ids = new Set<string>();
 const cleanBlocks = blocks.map((block: Row, index: number) => {
  if (!block || !['link', 'group'].includes(block.type)) fail('首页只支持链接入口和分组');
  let id = text(block.id, 50);
  if (!id || ids.has(id)) id = uid();
  ids.add(id);
  const title = text(block.title, 160);
  if (block.type === 'group') {
   if (!title) fail(`请填写第 ${index + 1} 项的分组名称`);
   return {id, type: 'group', title};
  }
  const enabled = block.enabled !== false;
  const url = block.url ? safeUrl(block.url) : '';
  if (enabled && (!title || !url)) fail(`请填写第 ${index + 1} 项的按钮名称和完整长链接`);
  return {id, type: 'link', title, url, enabled, text: text(block.text, 4000), image: block.image ? safeUrl(block.image) : ''};
 });
 return {
  ...look, title, description: text(body.description, 2000),
  avatar: body.avatar ? safeUrl(body.avatar) : '',
  backgroundImage: look.backgroundImage ? safeUrl(look.backgroundImage) : '',
  blocks: cleanBlocks, layout: 'profile',
 };
}

function imageUrl(input: unknown) {
 if (!input) return '';
 try { return safeUrl(input); } catch { return ''; }
}

function profileContent(body: Row, preview: boolean, target = '') {
 const look = profileAppearance(body);
 const collection = body.layout === collectionLayout;
 const title = body.title || (preview ? '你的首页标题' : '资源中转站');
 const avatar = imageUrl(body.avatar);
 const backdrop = look.backgroundMode === 'image' ? imageUrl(look.backgroundImage) : '';
 let background = look.background;
 if (look.backgroundMode === 'default') {
  background = collection
   ? 'radial-gradient(ellipse at 18% 12%,#fff9ef 0,transparent 52%),linear-gradient(155deg,#fbf6ff 10%,#eae1fb 68%,#e1e5fa)'
   : 'radial-gradient(ellipse at 12% 0%,#dcefff88,transparent 55%),radial-gradient(ellipse at 98% 25%,#dff9fa99,transparent 55%),#f3f8fc';
 } else if (look.backgroundMode === 'gradient') {
  background = `linear-gradient(155deg,${look.background},${look.backgroundEnd})`;
 }
 const radius = {rounded: collection ? '22px' : '12px', pill: '40px', square: '8px'}[look.buttonStyle as 'rounded'|'pill'|'square'];
 const buttonBackground = collection ? 'color-mix(in srgb, ' + look.theme + ' 8%, white)'
  : look.theme === profileDefaults.theme ? 'linear-gradient(110deg,#388ef7,#009eec)' : look.theme;
 const groups: {title: string; entries: string[]}[] = [{title: '', entries: []}];
 for (const block of body.blocks || []) {
  if (block.type === 'group') {
   groups.push({title: block.title || '未命名分组', entries: []});
   continue;
  }
  if (block.enabled === false) continue;
  const url = preview ? '' : imageUrl(block.url);
  if (!preview && !url) continue;
  const thumbnail = imageUrl(block.image);
  const content = `${thumbnail ? `<img src="${e(thumbnail)}" alt="" loading="lazy">`
   : collection ? '<span class="collection-icon" aria-hidden="true">↗</span>' : ''}
   <span class="profile-link-label"><strong>${e(block.title || '按钮名称')}</strong>${block.text ? `<small>${e(block.text)}</small>` : ''}</span>
   ${look.showArrow ? '<span aria-hidden="true">↗</span>' : ''}`;
  groups[groups.length - 1].entries.push(preview
   ? `<div class="profile-link">${content}</div>`
    : `<a class="profile-link" data-entry="${e(block.id)}" href="${e(url)}" rel="noreferrer">${content}</a>`);
 }
 const entries = groups.filter(group => group.entries.length).map(group =>
  `<section class="profile-group">${group.title ? `<h2>${e(group.title)}</h2>` : ''}${group.entries.join('')}</section>`).join('');
 const primary = target ? (preview
  ? '<div class="profile-link collection-primary"><span class="profile-link-label"><strong>点击获取资源</strong></span><span aria-hidden="true">↗</span></div>'
  : `<a id="continue" class="profile-link collection-primary" href="${e(safeUrl(target))}" rel="noreferrer"><span class="profile-link-label"><strong>点击获取资源</strong></span><span aria-hidden="true">↗</span></a>`) : '';
 return `<style>
  body{margin:0;box-sizing:border-box;min-height:100svh;display:grid;place-items:center;padding:36px 20px;background:${background};color:${look.pageText};font:14px/1.8 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased}
  .page{box-sizing:border-box;width:100%;max-width:440px;text-align:center;background:white;border:1px solid #d6e5f1;border-radius:23px;padding:29px 25px 23px;box-shadow:0 10px 38px -22px #287bb070}
  .profile-backdrop{position:fixed;inset:0;width:100%;height:100%;max-width:none;object-fit:cover;z-index:-1;border-radius:0}
  .profile-avatar{box-sizing:content-box;width:88px;height:88px;object-fit:cover;border-radius:50%;border:4px solid white;box-shadow:0 8px 28px #17233c18}
  .profile-initial{display:grid;place-items:center;width:88px;height:88px;margin:auto;border-radius:50%;background:${look.theme};color:${look.buttonText};font-size:32px}
  h1{font-size:26px;line-height:1.45;margin:18px 0 10px;overflow-wrap:anywhere}
  .profile-description{font-size:14px;line-height:1.85;color:${look.pageText === profileDefaults.pageText ? '#586b7d' : look.pageText};margin:12px 0 22px;white-space:pre-wrap;overflow-wrap:anywhere}
  .profile-links,.profile-group{display:grid;gap:14px}
  .profile-group h2{font-size:14px;margin:6px 0 0;text-align:left;overflow-wrap:anywhere}
  .profile-link{display:flex;align-items:center;gap:12px;padding:15px 18px;border-radius:${radius};background:${buttonBackground};color:${look.buttonText};text-decoration:none;text-align:${look.buttonAlign};box-shadow:0 8px 21px -10px #007cdb99;overflow-wrap:anywhere}
  .profile-link:hover{filter:brightness(.97)}.profile-link:focus-visible{outline:3px solid #9dd7ff;outline-offset:4px}
  .profile-link-label{flex:1;min-width:0}.profile-link img{width:36px;height:36px;object-fit:cover;border-radius:9px}
  .profile-link strong{display:block;font-size:15px;font-weight:650}.profile-link small{display:block;white-space:pre-wrap;opacity:.88;margin-top:4px}
  .profile-search{box-sizing:border-box;width:100%;margin:0 0 16px;padding:10px 12px;border:1px solid #d6e5f1;border-radius:9px;font:inherit}
  .profile-group[hidden],.profile-link[hidden]{display:none}.profile-empty{color:#697c90}.footer{font-size:11px;color:#697c90;margin:28px 0 0}
  @media(max-width:400px){body{padding:16px}.page{padding:25px 19px}}
  ${collection ? `
   body {align-items:start;padding:clamp(28px,8vh,72px) 16px;}
   .page {max-width:465px;border:0;background:none;box-shadow:none;padding:0;}
   .profile-avatar,.profile-initial {width:96px;height:96px;border:3px solid #fff;box-shadow:0 5px 22px #53437829;}
   .profile-initial {margin-inline:auto;background:#eee7fb;color:#533a94;font-weight:700;}
   h1 {font-size:clamp(24px,7vw,31px);line-height:1.22;margin:16px 0 0;font-weight:750;}
   .profile-description {margin:8px 0 20px;color:inherit;opacity:.82;}
   .profile-links {margin-top:24px;gap:17px;}
   .profile-group {gap:8px;}
   .profile-group h2 {margin:0 0 0 13px;font-size:13px;font-weight:700;}
   .profile-link {box-sizing:border-box;min-height:58px;padding:10px 14px;border:1px solid #6d589a24;box-shadow:0 4px 13px #5343780d;}
   .profile-link:hover {border-color:#7056a8;}
   .profile-link:focus-visible {outline-color:#6347b5;}
   .profile-link img,.collection-icon {width:34px;height:34px;flex:none;border-radius:12px;}
   .collection-icon {display:grid;place-items:center;background:#eae1f9;color:#563b92;}
   .collection-primary {margin-top:22px;color:#fff;background:#51358b;border-color:#51358b;text-align:center;font-weight:700;}
   .profile-search {margin:20px 0 -14px;border-color:#6d589a38;background:#fff;}
   .footer {color:inherit;opacity:.76;}
  ` : ''}
 </style>
 ${backdrop ? `<img class="profile-backdrop" src="${e(backdrop)}" alt="">` : ''}
 ${avatar ? `<img class="profile-avatar" src="${e(avatar)}" alt="头像">` : `<div class="profile-initial" aria-hidden="true">${e(Array.from(title)[0])}</div>`}
 <h1>${e(title)}</h1>
 ${body.description ? `<p class="profile-description">${e(body.description)}</p>` : ''}
 ${primary}
 ${look.search && entries ? `<input class="profile-search" type="search" aria-label="搜索入口" placeholder="搜索入口"${preview ? ' disabled' : ''}>` : ''}
 <nav class="profile-links" aria-label="资源入口">${entries || (primary ? '' : '<p class="profile-empty">暂无公开入口</p>')}</nav>`;
}

const searchScript = `{
 const field=document.querySelector('.profile-search');
 field?.addEventListener('input',()=>{
  const query=field.value.trim().toLowerCase();
  for(const group of document.querySelectorAll('.profile-group')){
   let visible=false;
   for(const link of group.querySelectorAll('.profile-link')){
    link.hidden=!link.querySelector('.profile-link-label').textContent.toLowerCase().includes(query);
    visible ||= !link.hidden;
   }
   group.hidden=!visible;
  }
 });
}`;

export function renderProfile(body: Row, script = '', homepage?: HomepageMetadata, target = '') {
 return htmlPage(body.title, profileContent(body, false, target), [script, body.search === true ? searchScript : ''].filter(Boolean).join('\n'),
  undefined, homepage && {...homepage, description: body.description});
}

export function previewProfile(body: Row, target = '') {
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
 <meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">
 <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: http:">
 <title>页面预览</title></head><body><main class="page">${profileContent(body, true, target)}
 <p class="footer">资源中转站 · 请确认分享者及目标网址</p></main></body></html>`;
}
