import {e} from './feature-types.ts';
export const DEFAULT_BROWSER_GUIDE='点击下方的 ⋮ 或 … 按钮，选择「在浏览器中打开」。';
export function cleanGuideTexts(value:unknown):string[]{const items=Array.isArray(value)?value:[];const first=typeof items[0]==='string'?items[0].trim().slice(0,300):'';const second=typeof items[1]==='string'?items[1].trim().slice(0,300):'';return [first||DEFAULT_BROWSER_GUIDE,...(second?[second]:[])];}
export function renderGuideParagraphs(value:unknown){return cleanGuideTexts(value).map((text,index)=>'<p class="guide-step"><span class="step">'+(index+1)+'</span><span>'+e(text).replace(/[⋮…]/g,symbol=>'<span class="menu">'+symbol+'</span>')+'</span></p>').join('');}
