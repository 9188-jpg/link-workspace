/**
 * Dev-only preview + screenshot tool for src/link3-page.ts.
 *
 *   node scripts/link3-preview.mjs              # render HTML + take screenshots
 *   node scripts/link3-preview.mjs --no-shot    # render HTML only
 *   node scripts/link3-preview.mjs --no-cache   # screenshot with the original CDN URLs
 *
 * Samples mirror the Link3 reference page (%TEMP%\lwref) so the output can be compared
 * with its section screenshots. Reference CDN files need a link3.cc referer, so for the
 * screenshots the remote images are inlined as data URIs into a *.local.html copy;
 * the plain clone-home.html / clone-target.html keep the real URLs.
 *
 * Screenshots land in link3-redesign/preview (override with LINK3_PREVIEW_DIR).
 */
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {link3Document} from '../src/link3-page.ts';

const REF_DIR = join(tmpdir(), 'lwref');
const PREVIEW_DIR = process.env.LINK3_PREVIEW_DIR || 'C:\\Users\\Administrator\\Documents\\deepseek-harness\\default-workspace\\link3-redesign\\preview';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDN = 'https://tencentcdna.production.link3.cc';
const flags = new Set(process.argv.slice(2));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sampleBody = {
 layout: 'link3',
 title: '电鸽APP【免费网盘资源大放送】活动开始啦',
 description: '考研、考公、教辅、出国、知识分享、新科技、新技术、新软件、最新电影、美剧、综艺、短剧、网剧、日漫、小说各种网盘资源应有尽有',
 avatar: `${CDN}/profile_images/1732693889573`,
 backgroundMode: 'default',
 background: '#f0f0f0',
 backgroundEnd: '#ffffff',
 backgroundImage: '',
 pageText: '#1a1a1a',
 accent: '#fbe0e0',
 accentText: '#1a1a1a',
 linkLabel: 'link3.cc/good_resources',
 showTopIcons: true,
 showSharePill: true,
 socials: [
  {id: 'weixin', image: `${CDN}/social_icons/weixin.png`, url: '', enabled: true},
  {id: 'diange', image: `${CDN}/social_icons/diange.png`, url: '', enabled: true},
 ],
 blocks: [
  {type: 'text', text: '1、link3官方最新大群社交产品，可放心下载使用\n\n2、你想搜的资源电鸽APP里都有，没搜到找资源群主要，他帮你找\n\n3、资源全免费，网盘有补贴，白看不花钱'},
  {type: 'button', title: '电鸽App下载点此处', url: 'https://example.com/download', image: `${CDN}/user_create_images/link3_1731482063380/module_urls/icon_1732693380380`, text: '', enabled: true},
  {type: 'image', url: `${CDN}/user_create_images/link3_1731482063380/picsingle/1732613804072`},
  {type: 'text', text: '点击下方图片进入不同资源分享群（各群资源各有偏重）\n想上推荐的群主，请联系电鸽APP内管理员600011或微信link3service'},
  {type: 'group', title: '电影类分享群'},
  {type: 'card', url: `${CDN}/user_create_images/link3_1731482063380/picsingle/1731491579306`, title: '毒液3资源链接', link: 'https://example.com/movie/venom3'},
  {type: 'card', url: `${CDN}/user_create_images/link3_1731482063380/picsingle/1732613355087`, title: '惊天大营救 (2024) 4K', link: 'https://example.com/movie/2024'},
  {type: 'card', url: `${CDN}/user_create_images/link3_1731482063380/picsingle/1732676924319`, title: '逆鳞', link: 'https://example.com/movie/nilin'},
  {type: 'card', url: `${CDN}/user_create_images/link3_1731482063380/picsingle/1731489892479`, title: '志愿军资源链接', link: 'https://example.com/movie/2024b'},
 ],
 footer: {brand: '资源中转站', brandImage: '', report: true},
 float: {enabled: true, text: '免费制作聚合页', url: 'https://example.com/'},
};

const baseOptions = {
 nonce: 'link3-preview-nonce',
 eventToken: 'preview-event-token',
 documentToken: 'preview-document-token',
};

function writePreview(name, html) {
 const file = join(REF_DIR, name);
 writeFileSync(file, html);
 console.log(`[html] ${file} (${html.length} bytes)`);
 return file;
}

const ASSET_RE = /https:\/\/tencentcdna\.production\.link3\.cc\/[^"'\s<>()]+/g;

async function inlineAssets(html, tag) {
 const urls = [...new Set(html.match(ASSET_RE) || [])];
 let output = html;
 for (const url of urls) {
  try {
   const response = await fetch(url, {headers: {'Referer': 'https://link3.cc/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'}});
   if (!response.ok) throw new Error(`HTTP ${response.status}`);
   const type = response.headers.get('content-type') || 'image/png';
   const data = Buffer.from(await response.arrayBuffer()).toString('base64');
   output = output.split(url).join(`data:${type};base64,${data}`);
  } catch (error) {
   console.warn(`[asset] ${tag} keep remote (${error.message}): ${url}`);
  }
 }
 // Only rewrite if every image resolved, otherwise Chrome would request the CDN without a referer.
 if ((output.match(ASSET_RE) || []).length) console.warn(`[asset] ${tag} some images still remote; screenshot may miss them`);
 return output;
}

async function waitForTargets(port, timeout = 20000) {
 const deadline = Date.now() + timeout;
 while (Date.now() < deadline) {
  try {
   const response = await fetch(`http://127.0.0.1:${port}/json/list`);
   if (response.ok) {
    const targets = await response.json();
    const page = targets.find((target) => target.type === 'page');
    if (page) return page;
   }
  } catch { /* browser not up yet */ }
  await sleep(250);
 }
 throw new Error('Chrome debugging port did not open');
}

async function openCdp() {
 if (!existsSync(CHROME)) throw new Error(`Chrome not found: ${CHROME}`);
 const profile = join(tmpdir(), `lwchrome-link3-${Date.now()}`);
 const port = 9300 + Math.floor(Math.random() * 500);
 const child = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank',
 ], {stdio: 'ignore'});
 const page = await waitForTargets(port);
 const socket = new WebSocket(page.webSocketDebuggerUrl);
 let id = 0;
 const pending = new Map();
 socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const resolve = message.id && pending.get(message.id);
  if (resolve) { pending.delete(message.id); resolve(message); }
 });
 await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve);
  socket.addEventListener('error', reject);
 });
 const send = (method, params = {}) => new Promise((resolve, reject) => {
  const messageId = ++id;
  pending.set(messageId, (message) => message.error ? reject(new Error(method + ' ' + JSON.stringify(message.error))) : resolve(message.result));
  socket.send(JSON.stringify({id: messageId, method, params}));
 });
 const close = async () => {
  try { socket.close(); } catch { /* already closed */ }
  child.kill();
  await sleep(400);
  try { rmSync(profile, {recursive: true, force: true, maxRetries: 2}); } catch { /* temp dir */ }
 };
 return {send, close};
}

const MEASURE_JS = `(() => {
 const pick = (selector) => {
  const element = document.querySelector(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height),
   fs: style.fontSize, fw: style.fontWeight, lh: style.lineHeight, br: style.borderRadius, pad: style.padding, mt: style.marginTop};
 };
 return {docHeight: document.documentElement.scrollHeight, viewport: innerWidth + 'x' + innerHeight,
  top: pick('.l3-top'), avatar: pick('.l3-avatar'), title: pick('.l3-title'), desc: pick('.l3-desc'),
  short: pick('.l3-short'), socials: pick('.l3-socials'), text: pick('.l3-text'), button: pick('.l3-btn'),
  image: pick('.l3-image'), card: pick('.l3-card'), caption: pick('.l3-caption'), footer: pick('.l3-footer'), float: pick('.l3-float')};
})()`;

async function pageMeasurements(send, url) {
 await send('Page.navigate', {url});
 await sleep(1200);
 const result = await send('Runtime.evaluate', {returnByValue: true, expression: MEASURE_JS});
 return result.result.value;
}

async function shoot(send, url, viewportFile, fullFile) {
 await send('Page.navigate', {url});
 await sleep(1200);
 if (viewportFile) {
  const shot = await send('Page.captureScreenshot', {format: 'png'});
  writeFileSync(viewportFile, Buffer.from(shot.data, 'base64'));
  console.log(`[shot] ${viewportFile}`);
 }
 if (fullFile) {
  const metrics = await send('Page.getLayoutMetrics');
  const size = metrics.cssContentSize || metrics.contentSize;
  const height = Math.ceil(size.height);
  const shot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true, clip: {x: 0, y: 0, width: 400, height, scale: 2}});
  writeFileSync(fullFile, Buffer.from(shot.data, 'base64'));
  console.log(`[shot] ${fullFile} (${height} css px)`);
 }
}

async function main() {
 mkdirSync(REF_DIR, {recursive: true});
 mkdirSync(PREVIEW_DIR, {recursive: true});

 const homepage = {canonical: 'https://example.com/good_resources', allowIndex: true, baiduVerification: '', description: sampleBody.description};
 const homeHtml = link3Document(sampleBody, {...baseOptions, linkUrl: sampleBody.linkLabel, homepage});
 const targetHtml = link3Document(sampleBody, {
  ...baseOptions,
  title: '毒液3资源链接',
  target: 'https://pan.quark.cn/s/8f2b1c4d5e6a',
  linkLabel: 'example.com/venom3',
  linkUrl: 'example.com/venom3',
  guideTexts: ['点击下方按钮，选择「在浏览器中打开」。', '如果页面没有反应，请复制链接到浏览器中打开。'],
 });
 const homeFile = writePreview('clone-home.html', homeHtml);
 const targetFile = writePreview('clone-target.html', targetHtml);

 const useCache = !flags.has('--no-cache');
 let homeShotFile = homeFile;
 let targetShotFile = targetFile;
 if (useCache) {
  const [homeLocal, targetLocal] = await Promise.all([inlineAssets(homeHtml, 'home'), inlineAssets(targetHtml, 'target')]);
  homeShotFile = writePreview('clone-home.local.html', homeLocal);
  targetShotFile = writePreview('clone-target.local.html', targetLocal);
 }

 if (flags.has('--no-shot')) {
  console.log('[shot] skipped (--no-shot)');
  return;
 }

 const {send, close} = await openCdp();
 try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: 400, height: 932, deviceScaleFactor: 2, mobile: true});
  await send('Emulation.setUserAgentOverride', {userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});

  const homeUrl = pathToFileURL(homeShotFile).href;
  const targetUrl = pathToFileURL(targetShotFile).href;

  console.log('[measure] home (CSS px, viewport 400)');
  const measured = await pageMeasurements(send, homeUrl);
  console.log(JSON.stringify(measured, null, 1));
  await shoot(send, homeUrl, join(PREVIEW_DIR, 'clone-mobile.png'), join(PREVIEW_DIR, 'clone-full.png'));
  await shoot(send, targetUrl, join(PREVIEW_DIR, 'clone-target-mobile.png'), join(PREVIEW_DIR, 'clone-target-full.png'));

  // Desktop: the column stays 480px wide and centred, background fills the viewport.
  await send('Emulation.setDeviceMetricsOverride', {width: 1200, height: 900, deviceScaleFactor: 1, mobile: false});
  await send('Page.navigate', {url: homeUrl});
  await sleep(1000);
  const desktop = await send('Page.captureScreenshot', {format: 'png'});
  writeFileSync(join(PREVIEW_DIR, 'clone-desktop.png'), Buffer.from(desktop.data, 'base64'));
  console.log(`[shot] ${join(PREVIEW_DIR, 'clone-desktop.png')}`);
  console.log('[measure] target viewport 400x932 captured');
 } finally {
  await close();
 }
}

main().catch((error) => {
 console.error('[link3-preview] ' + error.message);
 process.exitCode = 1;
});
