// Feishu desktop's documented browser flag and its mobile safety page's browser flag.
// These are consumed by Feishu; the short-link target itself must remain unchanged.
export function browserShareUrl(value:string){
 const url=new URL(value);
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('不支持的分享网址');
 url.searchParams.set('lk_mobile_jump_to_browser','true');
 url.searchParams.set('lk_jump_to_browser','true');
 return url.href;
}
