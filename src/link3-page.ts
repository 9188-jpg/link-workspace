/** Link3-style public page: a mobile-first 1:1 visual clone assembled from plain HTML/CSS.
 *  Server-rendered strings only: no third-party code, no remote CSS/JS. All user text goes
 *  through e()/safeUrl(); inline scripts are nonce-gated and never embed page text. */
import {type HomepageMetadata,type Row,e,fail,js,safeUrl,text,uid} from './feature-types.ts';
import {visibleOnceScript} from './traffic.ts';

export type Link3RenderOptions = {
 target?: string;
 linkUrl?: string;
 pageUrl?: string;
 eventToken?: string;
 documentToken?: string;
 guideTexts?: string[];
 homepage?: HomepageMetadata;
 preview?: boolean;
 nonce?: string;
 title?: string;
};

export const maxLink3Blocks = 40;

/** Empty Link3 page used by the built-in 「Link3 资源页」 option and as a template seed. */
export function builtinLink3Body(title = ''): Row {
 return {
  layout: 'link3', title: title || '资源分享', description: '', avatar: '',
  backgroundMode: 'default', background: '#fffdfe', backgroundEnd: '#ffffff', backgroundImage: '',
  colorMode: 'auto', fontScale: 'normal',
  pageText: '#1a1a1a', accent: '#fbe0e0', accentText: '#5e5e5e',
  linkLabel: '', showTopIcons: true, showSharePill: true,
  socials: [], blocks: [{id: 'target', type: 'target', title: '点击获取资源', image: ''}],
  footer: {brand: '资源中转站', brandImage: '', report: true},
  float: {enabled: false, text: '', url: ''},
 };
}

export const link3Defaults: Row = {
 layout: 'link3', title: '', description: '', avatar: '',
 backgroundMode: 'default', background: '#fffdfe', backgroundEnd: '#ffffff', backgroundImage: '',
 colorMode: 'auto', fontScale: 'normal',
 pageText: '#1a1a1a', accent: '#fbe0e0', accentText: '#5e5e5e',
 linkLabel: '', showTopIcons: true, showSharePill: true,
 socials: [], blocks: [],
 footer: {brand: '资源中转站', brandImage: '', report: true},
 float: {enabled: false, text: '', url: ''},
};

const BACKGROUND_MODES = ['default','solid','gradient','image'] as const;
const BLOCK_TYPES = ['text','group','button','image','card','target'] as const;

const colorOf = (value: unknown, fallback: string) =>
 typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
const choiceOf = (value: unknown, allowed: readonly string[], fallback: string) =>
 typeof value === 'string' && allowed.includes(value) ? value : fallback;
const focusOf = (value: unknown) => {
 const n = Number(value);
 return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50;
};
const linkOf = (value: unknown, strict = false) => {
 if (!value) return '';
 if (strict) return safeUrl(value);
 try { return safeUrl(value); } catch { return ''; }
};
const nonceOf = (value: unknown) => String(value ?? '').replace(/[^A-Za-z0-9+/=_-]/g, '') || uid();

/** Normalise a page body. strict=true is the persistence validator used by cleanLink3;
 *  strict=false is tolerant and used only for rendering (drafts must not throw). */
function normaliseLinks(rawInput: Row, strict: boolean): Row {
 const input: Row = rawInput && typeof rawInput === 'object' ? rawInput : {};
 const title = text(input.title, 160);
 if (strict && !title) fail('请填写首页标题');
 const backgroundImage = linkOf(input.backgroundImage, strict);
 const background = colorOf(input.background, link3Defaults.background);
 const backgroundMode = choiceOf(input.backgroundMode, BACKGROUND_MODES,
  backgroundImage ? 'image' : (input.background && background !== link3Defaults.background ? 'solid' : 'default'));

 const source = Array.isArray(input.blocks) ? input.blocks : [];
 if (strict && source.length > maxLink3Blocks) fail('页面最多可添加 40 个内容块');
 const ids = new Set<string>();
 const blocks: Row[] = [];
 for (const [index, raw] of source.slice(0, maxLink3Blocks).entries()) {
  const item: Row = raw && typeof raw === 'object' ? raw : {};
  // Compatibility with the old profile body: link entries become buttons, groups stay groups.
  let type = String(item.type || 'text');
  if (type === 'link') type = 'button';
  if (!(BLOCK_TYPES as readonly string[]).includes(type)) {
   if (strict) fail(`第 ${index + 1} 项的内容块类型不受支持`);
   continue;
  }
  let id = text(item.id, 50);
  if (!id || ids.has(id)) id = uid();
  ids.add(id);
  if (type === 'text') { blocks.push({id, type, text: text(item.text, 4000)}); continue; }
  if (type === 'group') {
   const groupTitle = text(item.title, 160);
   if (strict && !groupTitle) fail(`请填写第 ${index + 1} 项的分组标题`);
   blocks.push({id, type, title: groupTitle});
   continue;
  }
  if (type === 'image') { blocks.push({id, type, url: linkOf(item.url, strict), focusX: focusOf(item.focusX), focusY: focusOf(item.focusY)}); continue; }
  if (type === 'target') { blocks.push({id, type, title: text(item.title, 160), image: linkOf(item.image, strict)}); continue; }
  if (type === 'card') {
   blocks.push({id, type, url: linkOf(item.url, strict), title: text(item.title, 160), text: text(item.text, 4000), link: linkOf(item.link, strict), focusX: focusOf(item.focusX), focusY: focusOf(item.focusY)});
   continue;
  }
  const enabled = item.enabled !== false;
  const buttonUrl = linkOf(item.url, strict);
  const buttonTitle = text(item.title, 160);
  if (strict && enabled && (!buttonTitle || !buttonUrl)) fail(`请填写第 ${index + 1} 项的按钮名称和完整长链接`);
  blocks.push({id, type: 'button', title: buttonTitle, url: buttonUrl, image: linkOf(item.image, strict), text: text(item.text, 4000), enabled});
 }

 const socials = (Array.isArray(input.socials) ? input.socials : []).slice(0, 8).map((raw: Row, index: number) => {
  const item: Row = raw && typeof raw === 'object' ? raw : {};
  return {id: text(item.id, 50) || 'social-' + (index + 1), image: linkOf(item.image, strict), url: linkOf(item.url, strict), enabled: item.enabled !== false};
 });

 const footerInput: Row = input.footer && typeof input.footer === 'object' ? input.footer : {};
 const floatInput: Row = input.float && typeof input.float === 'object' ? input.float : {};

 return {
  layout: 'link3',
  title,
  description: text(input.description, 2000),
  avatar: linkOf(input.avatar, strict),
  colorMode: choiceOf(input.colorMode, ['auto','light','dark'], 'auto'),
  fontScale: choiceOf(input.fontScale, ['small','normal','large'], 'normal'),
  backgroundMode, background,
  backgroundEnd: colorOf(input.backgroundEnd, link3Defaults.backgroundEnd),
  backgroundImage,
  pageText: colorOf(input.pageText, link3Defaults.pageText),
  accent: colorOf(input.accent, link3Defaults.accent),
  accentText: colorOf(input.accentText, link3Defaults.accentText),
  linkLabel: text(input.linkLabel, 160),
  showTopIcons: input.showTopIcons !== false,
  showSharePill: input.showSharePill !== false,
  socials, blocks,
  footer: {brand: text(footerInput.brand, 60) || '资源中转站', brandImage: linkOf(footerInput.brandImage, strict), report: footerInput.report !== false},
  float: {enabled: floatInput.enabled === true, text: text(floatInput.text, 60), url: linkOf(floatInput.url, strict)},
 };
}

/** Validate and normalise a persisted page body (old profile bodies are mapped in place). */
export function cleanLink3(input: Row): Row { return normaliseLinks(input, true); }

const HOME_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h13.5V9.5"/><path d="M10 21v-6h4v6"/></svg>';
const STAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.9 5.9 6.5.94-4.7 4.58 1.11 6.48L12 17.82 6.19 20.9 7.3 14.42 2.6 9.84l6.5-.94z"/></svg>';
const SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M5 13.5V21h14v-7.5"/></svg>';
const SHARE_ARROW_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 4.5 5 4.5-5 4.5"/><path d="M19.5 9h-6.8a8 8 0 0 0-8 8v2.5"/></svg>';
const ARROW_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';

function backgroundCss(body: Row) {
 if (body.backgroundMode === 'image' && body.backgroundImage) return `${body.background} url("${body.backgroundImage}") center / cover no-repeat`;
 if (body.backgroundMode === 'gradient') return `linear-gradient(180deg,${body.background},${body.backgroundEnd})`;
 return body.background;
}

const THEME_CSS = `a,img{-webkit-user-drag:none;user-drag:none}.l3-title,.l3-desc,.l3-text,.l3-group,.l3-short,.l3-btn,.l3-card,.l3-social,.l3-report,.l3-caption,.l3-brand{-webkit-user-select:text;user-select:text}body{-webkit-user-select:text;user-select:text}button.l3-short{-webkit-appearance:none;appearance:none}body[data-mode="dark"] .l3-top-circle{background:var(--l3-top);color:var(--l3-top-ink)}`;
const EXTRA_CSS = `body{-webkit-user-select:text;user-select:text}img{-webkit-user-drag:none}
.l3-btn{will-change:transform}
.l3-btn.is-bounce{animation:l3-bounce .3s ease-out}
@keyframes l3-bounce{0%{transform:scale(1)}28%{transform:scale(.955)}64%{transform:scale(1.025)}100%{transform:scale(1)}}
.l3-short{transition:background .2s,transform .15s}
.l3-short:active{transform:scale(.985)}
.l3-top-circle{cursor:pointer;transition:transform .15s}
.l3-top-circle:active{transform:scale(.92)}
.l3-tip{position:fixed;left:50%;bottom:88px;z-index:30;max-width:80%;padding:9px 16px;border-radius:20px;background:rgba(0,0,0,.78);color:#fff;font-size:13px;line-height:1.4;text-align:center;opacity:0;transform:translateX(-50%) translateY(8px);pointer-events:none;transition:opacity .18s,transform .18s}
.l3-tip.is-on{opacity:1;transform:translateX(-50%) translateY(0)}`;
const DARK_VARS = '--l3-bg:#15171c;--l3-ink:#eceef2;--l3-muted:#9aa3b2;--l3-chip:rgba(255,255,255,.09);--l3-chip-h:rgba(255,255,255,.17);--l3-top:#232733;--l3-top-ink:#d9dee7;--l3-cardbg:rgba(255,255,255,.07)';
function pageCss(body: Row) {
 const scale = body.fontScale === 'small' ? '0.9' : body.fontScale === 'large' ? '1.16' : '1';
 const customBg = body.backgroundMode !== 'default' || !!body.backgroundImage;
 const customInk = body.pageText !== '#1a1a1a';
 return `:root{--l3-accent:${body.accent};--l3-accent-text:${body.accentText};--l3-scale:${scale};--l3-bg:#fffdfe;--l3-ink:#1a1a1a;--l3-muted:#666;--l3-chip:rgba(237,237,237,.2);--l3-chip-h:hsla(0,0%,93%,.35);--l3-top:#ffffff;--l3-top-ink:#5e5e5e;--l3-cardbg:rgba(255,255,255,.35)}
body[data-mode="dark"]{${DARK_VARS}}
@media(prefers-color-scheme:dark){body[data-mode="auto"]{${DARK_VARS}}}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{min-height:100svh;background:${customBg ? backgroundCss(body) : 'var(--l3-bg)'};color:${customInk ? body.pageText : 'var(--l3-ink)'};font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,"Segoe UI",Arial,Roboto,"PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:normal;-webkit-text-size-adjust:100%;-webkit-font-smoothing:antialiased}
img{max-width:100%}
a{color:inherit}
.l3-stage{display:flex;justify-content:center;min-height:100svh}
.l3-page{display:flex;flex-direction:column;align-items:center;width:100%;max-width:480px;min-height:100svh;padding:0 20px 100px}
.l3-top{display:flex;align-items:center;justify-content:space-between;width:100%;margin:23px 0 8px}
.l3-top-circle{position:relative;display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:20px;background:var(--l3-top);color:var(--l3-top-ink);text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.l3-top-circle svg{display:block;width:18px;height:18px}
.l3-top-actions{display:flex;align-items:center;height:36px;border-radius:20px;background:#fff;overflow:hidden}
.l3-top-actions .l3-top-circle{border-radius:0}
.l3-top-actions .l3-top-circle+.l3-top-circle::before{content:"";position:absolute;left:0;top:50%;width:1px;height:10px;margin-top:-5px;background:rgba(0,0,0,.3)}
.l3-avatar-wrap{display:grid;place-items:center;width:96px;height:96px;margin-bottom:8px;flex-shrink:0}
.l3-avatar{display:block;width:96px;height:96px;box-sizing:content-box;border:1px solid #e8e9ed;border-radius:50%;object-fit:contain;background:#fff}
.l3-avatar.is-initial{box-sizing:border-box;display:grid;place-items:center;font-size:34px;font-weight:700;line-height:1;color:#b5b5b5;object-fit:initial}
.l3-title{width:100%;margin:8px 0 0;font-size:calc(16px*var(--l3-scale));font-weight:900;line-height:1.5;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere}
.l3-desc{width:100%;margin:4px 0 0;font-size:calc(14px*var(--l3-scale));line-height:1.5;color:var(--l3-muted);text-align:center;white-space:pre-wrap;overflow-wrap:anywhere}
.l3-short{display:flex;align-items:center;justify-content:center;gap:4px;max-width:100%;margin-top:12px;padding:10px 12px;border:0;font:inherit;border-radius:23px;background:var(--l3-chip);box-shadow:inset 0 -1px 2px rgba(0,0,0,.04);color:var(--l3-muted);cursor:pointer;transition:background .2s;font-size:calc(14px*var(--l3-scale));line-height:1.35;text-align:center}
.l3-short span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.l3-short svg{display:block;flex-shrink:0;width:14px;height:14px}
.l3-short:hover{background:var(--l3-chip-h)}
.l3-socials{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:14px;width:100%;margin-top:14px}
.l3-social{display:block;flex-shrink:0;width:26px;height:26px;border-radius:50%;background:#fff;overflow:hidden;text-decoration:none}
.l3-social img{display:block;width:26px;height:26px;object-fit:contain;border-radius:50%}
.l3-blocks{display:flex;flex-direction:column;width:100%;margin-top:14px}
.l3-text,.l3-group{width:100%;margin-top:35px;padding:0 7px;box-sizing:border-box;font-size:calc(16px*var(--l3-scale));font-weight:700;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere}
.l3-image{display:block;width:100%;height:auto;max-height:320px;object-fit:cover;margin-top:20px;border-radius:24px}
.l3-btn{display:flex;align-items:center;width:100%;min-height:56px;margin-top:20px;padding:7px 7px 7px 6px;border:0;border-radius:30px;background:var(--l3-accent);color:var(--l3-accent-text);text-decoration:none;text-align:left;-webkit-tap-highlight-color:transparent;transition:transform .15s cubic-bezier(0,.2,.5,3)}
a.l3-btn{cursor:pointer}
@media(hover:hover){a.l3-btn:hover{transform:scale(1.02)}}
a.l3-btn:active{transform:scale(.99)}
.l3-btn.is-preview{cursor:default}
.l3-btn-icon{flex-shrink:0;width:42px;height:42px;border-radius:50%;overflow:hidden}
.l3-btn-icon img{display:block;width:42px;height:42px;object-fit:contain}
.l3-btn-body{flex:1;min-width:0;padding:7px 0 7px 14px}
.l3-btn-title{display:block;font-size:calc(16px*var(--l3-scale));font-weight:700;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
.l3-btn-sub{display:block;margin-top:3px;font-size:calc(14px*var(--l3-scale));font-weight:400;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;opacity:.75}
.l3-btn-arrow{flex-shrink:0;display:grid;place-items:center;width:42px;height:30px;opacity:.6}
.l3-btn-arrow svg{display:block;width:14px;height:14px}
.l3-card{position:relative;display:block;width:100%;aspect-ratio:16/9;margin-top:20px;border-radius:24px;overflow:hidden;background:var(--l3-cardbg);color:#fff;text-decoration:none}
.l3-card img{display:block;width:100%;height:100%;object-fit:cover;border-radius:24px}
.l3-caption{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;height:48px;padding-left:12px;font-size:calc(16px*var(--l3-scale));font-weight:400;line-height:1.3;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.55)}
.l3-caption span{min-width:0;padding-right:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.l3-target{width:100%;margin-top:20px}
.l3-target .l3-btn{margin-top:0}
.l3-footer{display:flex;flex-direction:column;align-items:center;width:100%;margin-top:72px;padding:30px 0 44px;text-align:center}
.l3-brand{display:flex;align-items:center;justify-content:center;gap:4px;padding-bottom:12px;font-size:14px;font-weight:900;line-height:1.3;color:inherit}
.l3-brand img{display:block;width:18px;height:18px;border-radius:4px}
.l3-brand-mark{display:grid;place-items:center;width:18px;height:18px;border-radius:4px;background:var(--l3-accent);color:var(--l3-accent-text);font-size:11px;font-weight:900;line-height:1}
.l3-report{margin-top:12px;font-size:12px;line-height:1.4;color:#aaa;text-decoration:none;cursor:pointer}
.l3-report:hover{color:#888;text-decoration:underline}
.l3-float{position:fixed;left:50%;bottom:28px;z-index:10;display:flex;align-items:center;height:40px;padding:3px;border-radius:50px;background:linear-gradient(249deg,#7c3bed 0%,#dba9cf 100%);box-shadow:0 0 15px rgba(0,0,0,.1);color:#fff;text-decoration:none;transform:translateX(-50%);cursor:pointer}
.l3-float span{display:block;padding:0 20px;color:#fff;font-size:calc(14px*var(--l3-scale));font-weight:700;line-height:1;white-space:nowrap}
.l3-float.is-preview{cursor:default}
@media (min-width:520px){.l3-page{max-width:480px}}`;
}

function topBar(preview: boolean, pageUrl: string) {
 const home = preview
  ? `<span class="l3-top-circle" aria-hidden="true">${HOME_ICON}</span>`
  : `<a class="l3-top-circle" href="/" aria-label="返回首页" draggable="false">${HOME_ICON}</a>`;
 const copyable = Boolean(pageUrl) || preview;
 const star = copyable
  ? `<button type="button" class="l3-top-circle" data-copy-url="${e(pageUrl)}" aria-label="复制本页链接" title="复制本页链接">${STAR_ICON}</button>`
  : `<span class="l3-top-circle" role="img" aria-label="收藏">${STAR_ICON}</span>`;
 const share = copyable
  ? `<button type="button" class="l3-top-circle" data-copy-url="${e(pageUrl)}" aria-label="分享：复制本页链接" title="分享：复制本页链接">${SHARE_ICON}</button>`
  : `<span class="l3-top-circle" role="img" aria-label="分享">${SHARE_ICON}</span>`;
 return `<header class="l3-top">${home}<div class="l3-top-actions">${star}${share}</div></header>`;
}

function socialsHtml(body: Row, preview: boolean) {
 const socials: Row[] = (body.socials || []).filter((item: Row) => item && item.enabled !== false && item.image);
 if (!socials.length) return '';
 return `<div class="l3-socials">${socials.map(item => {
  const img = `<img src="${e(item.image)}" alt="" referrerpolicy="no-referrer" draggable="false">`;
  if (preview || !item.url) return `<span class="l3-social">${img}</span>`;
  return `<a class="l3-social" href="${e(item.url)}" rel="noreferrer" draggable="false">${img}</a>`;
 }).join('')}</div>`;
}

function buttonHtml(block: Row, preview: boolean) {
 const icon = block.image ? `<span class="l3-btn-icon"><img src="${e(block.image)}" alt="" referrerpolicy="no-referrer" draggable="false"></span>` : '';
 const bodyHtml = `<span class="l3-btn-body"><span class="l3-btn-title">${e(block.title)}</span>${block.text ? `<span class="l3-btn-sub">${e(block.text)}</span>` : ''}</span>`;
 const arrow = `<span class="l3-btn-arrow">${ARROW_ICON}</span>`;
 if (preview || !block.url) return `<div class="l3-btn is-preview" role="button" aria-disabled="true">${icon}${bodyHtml}${arrow}</div>`;
 return `<a class="l3-btn" href="${e(block.url)}" data-entry="${e(block.id)}" rel="noreferrer" draggable="false">${icon}${bodyHtml}${arrow}</a>`;
}

function cardHtml(block: Row, preview: boolean) {
  const media = `<img src="${e(block.url)}" alt="${e(block.title || '')}" referrerpolicy="no-referrer" draggable="false" style="object-position:${focusOf(block.focusX)}% ${focusOf(block.focusY)}%">${block.title ? `<div class="l3-caption"><span>${e(block.title)}</span></div>` : ''}`;
 if (preview || !block.link) return `<div class="l3-card">${media}</div>`;
 return `<a class="l3-card" href="${e(block.link)}" data-entry="${e(block.id)}" rel="noreferrer" draggable="false">${media}</a>`;
}

function targetHtml(block: Row, target: string, _options: Link3RenderOptions, preview: boolean) {
 const title = String(block.title || '').trim() || '点击获取资源';
 const icon = block.image ? `<span class="l3-btn-icon"><img src="${e(block.image)}" alt="" referrerpolicy="no-referrer" draggable="false"></span>` : '';
 const bodyHtml = `<span class="l3-btn-body"><span class="l3-btn-title">${e(title)}</span></span><span class="l3-btn-arrow">${ARROW_ICON}</span>`;
 const open = preview
  ? `<div class="l3-btn is-preview" role="button" aria-disabled="true">${icon}${bodyHtml}</div>`
  : `<a class="l3-btn" href="${e(target)}" data-entry="${e(block.id)}" rel="noreferrer" referrerpolicy="no-referrer" draggable="false">${icon}${bodyHtml}</a>`;
 return `<section class="l3-target">${open}</section>`;
}

function blocksHtml(body: Row, options: Link3RenderOptions, preview: boolean, target: string) {
 const blocks: Row[] = (body.blocks || []).map((block: Row) => ({...block}));
 if (target && !blocks.some(block => block.type === 'target')) blocks.unshift({id: 'target', type: 'target'});
 const parts: string[] = [];
 for (const block of blocks) {
  if (block.enabled === false && !preview && block.type !== 'target') continue;
  if (block.type === 'target') { if (target) parts.push(targetHtml(block, target, options, preview)); continue; }
  if (block.type === 'text') { if (block.text) parts.push(`<div class="l3-text">${e(block.text)}</div>`); continue; }
  if (block.type === 'group') { if (block.title) parts.push(`<div class="l3-group">${e(block.title)}</div>`); continue; }
  if (block.type === 'image') { if (block.url) parts.push(`<img class="l3-image" src="${e(block.url)}" alt="" referrerpolicy="no-referrer" draggable="false" style="object-position:${focusOf(block.focusX)}% ${focusOf(block.focusY)}%">`); continue; }
  if (block.type === 'card') { if (block.url) parts.push(cardHtml(block, preview)); continue; }
  if (block.type === 'button') { if (block.title || block.url) parts.push(buttonHtml(block, preview)); }
 }
 return parts.join('');
}

function footerHtml(body: Row, pageUrl: string) {
 const footer: Row = body.footer || {};
 const brand = text(footer.brand, 60) || '资源中转站';
 const mark = footer.brandImage
  ? `<img src="${e(footer.brandImage)}" alt="" referrerpolicy="no-referrer" draggable="false">`
  : `<span class="l3-brand-mark" aria-hidden="true">${e(Array.from(brand)[0] || '')}</span>`;
 const report = footer.report
  ? (pageUrl ? `<a class="l3-report" href="/report?url=${encodeURIComponent(pageUrl)}">举报</a>` : '<div class="l3-report">举报</div>')
  : '';
 return `<footer class="l3-footer"><div class="l3-brand">${mark}<span>${e(brand)}</span></div>${report}</footer>`;
}

function floatHtml(float: Row, preview: boolean) {
 const label = `<span>${e(float.text)}</span>`;
 if (preview || !float.url) return `<div class="l3-float is-preview" role="button" aria-disabled="true">${label}</div>`;
 return `<a class="l3-float" href="${e(float.url)}" rel="noreferrer">${label}</a>`;
}

function contentHtml(body: Row, options: Link3RenderOptions, preview: boolean) {
 const target = linkOf(options.target);
 const pageUrl = text(options.pageUrl, 2000) || (options.homepage ? options.homepage.canonical : '') || '';
 const parts: string[] = [];
 if (body.showTopIcons) parts.push(topBar(preview, pageUrl));
 if (body.avatar) {
  parts.push(`<div class="l3-avatar-wrap"><img class="l3-avatar" src="${e(body.avatar)}" alt="${e(body.title || '头像')}" referrerpolicy="no-referrer" draggable="false"></div>`);
 } else {
  parts.push(`<div class="l3-avatar-wrap"><div class="l3-avatar is-initial" aria-hidden="true">${e(Array.from(String(body.title || ''))[0] || '')}</div></div>`);
 }
 const title = body.title || (preview ? '你的页面标题' : '');
 if (title) parts.push(`<h1 class="l3-title">${e(title)}</h1>`);
 if (body.description) parts.push(`<p class="l3-desc">${e(body.description)}</p>`);
 const homepageHost = (() => { try { return options.homepage ? new URL(options.homepage.canonical).host : ''; } catch { return ''; } })();
 const label = text(body.linkLabel, 160) || text(options.linkUrl, 160).replace(/^https?:\/\//, '') || homepageHost;
 if (body.showSharePill && label) parts.push(`<div class="l3-short" role="button" tabindex="0"${pageUrl ? ` data-copy-url="${e(pageUrl)}"` : ''} title="点击复制本页链接"><span>${e(label)}</span>${SHARE_ARROW_ICON}</div>`);
 parts.push(socialsHtml(body, preview));
 const blocks = blocksHtml(body, options, preview, target);
 if (blocks) parts.push(`<div class="l3-blocks">${blocks}</div>`);
 parts.push(footerHtml(body, pageUrl));
 if (body.float && body.float.enabled && body.float.text) parts.push(floatHtml(body.float, preview));
 return parts.join('');
}

function interactionScript() {
 return `function tip(message){let node=document.querySelector('.l3-tip');if(!node){node=document.createElement('div');node.className='l3-tip';document.body.appendChild(node);}node.textContent=message;node.classList.add('is-on');clearTimeout(node._t);node._t=setTimeout(()=>node.classList.remove('is-on'),1600);}` +
  `async function copyText(value){try{await navigator.clipboard.writeText(value);return true;}catch{try{const field=document.createElement('textarea');field.value=value;field.setAttribute('readonly','');field.style.position='fixed';field.style.left='-9999px';document.body.appendChild(field);field.select();field.setSelectionRange(0,value.length);const ok=document.execCommand('copy');field.remove();return ok;}catch{return false;}}}` +
  `document.querySelectorAll('[data-copy-url]').forEach(node=>{node.addEventListener('keydown',keyEvent=>{if(keyEvent.key==='Enter'||keyEvent.key===' '){keyEvent.preventDefault();node.click();}});});` +
  `let downPoint=null;document.addEventListener('pointerdown',event=>{downPoint={x:event.clientX,y:event.clientY};},true);document.addEventListener('click',event=>{if(!downPoint)return;const moved=Math.abs(event.clientX-downPoint.x)>6||Math.abs(event.clientY-downPoint.y)>6;downPoint=null;if(moved){event.preventDefault();event.stopPropagation();}},true);` +
  `document.querySelectorAll('[data-copy-url]').forEach(node=>node.addEventListener('click',async()=>{const selected=window.getSelection?String(window.getSelection()).trim():'';if(selected)return;const url=node.dataset.copyUrl||location.href;const ok=await copyText(url);tip(ok?'链接已复制':'复制失败，请长按选择后复制');}));` +
  `document.addEventListener('click',event=>{const button=event.target.closest?event.target.closest('.l3-btn'):null;if(!button)return;button.classList.remove('is-bounce');void button.offsetWidth;button.classList.add('is-bounce');});`;
}

function pageScript(options: Link3RenderOptions) {
 const documentToken = js(options.documentToken || '');
 const eventToken = js(options.eventToken || '');
 const view = options.documentToken ? visibleOnceScript('record();') : '';
 return `(()=>{const documentToken=${documentToken},eventToken=${eventToken};` +
  `function record(entry){if(!documentToken)return;fetch('/api/public/document-event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry?{token:documentToken,entry}:{token:documentToken}),keepalive:true}).catch(()=>{});}` +
  `function emit(kind){if(!eventToken)return;fetch('/api/public/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:eventToken,kind}),keepalive:true}).catch(()=>{});}` +
  `${view}` +
  `document.addEventListener('click',event=>{const node=event.target;const hit=node&&node.closest?node.closest('[data-entry]'):null;if(!hit)return;record(hit.dataset.entry);emit('click');},true);` +
  interactionScript() +
  `})();`;
}

function documentHtml(rawBody: Row, options: Link3RenderOptions, preview: boolean, cspMeta: boolean) {
 const body = normaliseLinks(rawBody, false);
 const nonce = nonceOf(options.nonce);
 const title = text(options.title ?? body.title, 160) || (preview ? '页面预览' : '资源中转站');
 const description = options.homepage?.description || body.description;
 const metadata = [
  options.homepage?.canonical ? `<link rel="canonical" href="${e(options.homepage.canonical)}">` : '',
  description ? `<meta name="description" content="${e(description)}">` : '',
  options.homepage?.baiduVerification ? `<meta name="baidu-site-verification" content="${e(options.homepage.baiduVerification)}">` : '',
 ].join('');
 const csp = cspMeta ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src https: http: data:; connect-src 'self'">` : '';
 const script = preview ? `(()=>{${interactionScript()}})();` : pageScript(options);
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer">${csp}<title>${e(title)}</title>${metadata}<style>${pageCss(body)}${EXTRA_CSS}${THEME_CSS}</style></head><body data-mode="${e(body.colorMode)}" data-scale="${e(body.fontScale)}"><div class="l3-stage"><main class="l3-page">${contentHtml(body, options, preview)}</main></div>${script ? `<script nonce="${e(nonce)}">${script}</script>` : ''}</body></html>`;
}

/** Full HTML document for a link3 page. options.preview renders a non-navigating draft. */
export function link3Document(body: Row, options: Link3RenderOptions) {
 return documentHtml(body, options, options.preview === true, false);
}

/** HTML response with the public-page security headers (mirrors htmlPage in feature-types). */
export function link3Response(body: Row, options: Link3RenderOptions) {
 const nonce = nonceOf(options.nonce);
 const html = documentHtml(body, {...options, nonce}, options.preview === true, false);
 return new Response(html, {headers: {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': options.homepage?.allowIndex ? 'index,nofollow' : 'noindex,nofollow',
  'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src 'self' https: data:; media-src https:; frame-src https://www.youtube.com https://player.bilibili.com https://v.qq.com; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
 }});
}

/** iframe srcdoc preview: no tracking, no external navigation, no scripts. */
export function previewLink3(body: Row) {
 return documentHtml(body, {preview: true, nonce: uid()}, true, true);
}
