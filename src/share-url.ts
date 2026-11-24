// Feishu desktop's documented browser flag and its mobile safety page's browser flag.
// These are consumed by Feishu; the short-link target itself must remain unchanged.
export function browserShareUrl(value:string){
 const url=new URL(value);
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('不支持的分享网址');
 url.searchParams.set('lk_mobile_jump_to_browser','true');
 url.searchParams.set('lk_jump_to_browser','true');
 return url.href;
}

// The www hostname already redirects to this origin at Cloudflare, including the path and query.
export function shareAliasFor(origin:string) {
 return origin==='https://xn--gmqy7w.top' ? 'https://www.xn--gmqy7w.top' : '';
}

export function shareOrigin(canonical:string, defaultOrigin:string, alias:string) {
 return alias && alias===shareAliasFor(canonical) ? alias : defaultOrigin;
}

export function displayShortUrl(value:string, domains:readonly {origin:string;display_origin?:string;share_alias?:string;display_share_alias?:string}[]) {
 for (const domain of domains) {
  if (domain.display_origin && value.startsWith(domain.origin+'/')) return domain.display_origin+value.slice(domain.origin.length);
  if (domain.share_alias && domain.display_share_alias && value.startsWith(domain.share_alias+'/')) return domain.display_share_alias+value.slice(domain.share_alias.length);
 }
 return value;
}
