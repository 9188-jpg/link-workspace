import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserShareUrl,displayShortUrl,shareAliasFor,shareOrigin} from '../src/share-url.ts';
test('browser sharing preserves origin, short code, query values and fragment',()=>{
 const original='https://links.example/a_B-123?code=a%26b&next=https%3A%2F%2Fexample.org%2F%3Fx%3D1#section';
 const result=new URL(browserShareUrl(original)),before=new URL(original);
 assert.equal(result.origin,before.origin);assert.equal(result.pathname,before.pathname);assert.equal(result.hash,before.hash);
 for(const name of ['code','next'])assert.equal(result.searchParams.get(name),before.searchParams.get(name));
 assert.equal(result.searchParams.get('lk_mobile_jump_to_browser'),'true');assert.equal(result.searchParams.get('lk_jump_to_browser'),'true');
 assert.equal(browserShareUrl(result.href),result.href);
 assert.equal(result.searchParams.getAll('lk_jump_to_browser').length,1);
});
test('browser sharing cannot turn an unsafe URL into a shareable link',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,test','https://user:password@example.org/abc'])assert.throws(()=>browserShareUrl(value));
});

test('Chinese short links display their registered name and preserve the exact short code',()=>{
 const origin=new URL('https://大人.top').origin;
 const domains=[{origin,display_origin:'https://大人.top'}];
 const suffix='/4gDqOv?key=a%26b#section';
 assert.equal(displayShortUrl(origin+suffix,domains),'https://大人.top'+suffix);
 assert.equal(displayShortUrl(origin+'.example'+suffix,domains),origin+'.example'+suffix);
 assert.equal(new URL(displayShortUrl(origin+suffix,domains)).href,origin+suffix);
});

test('the www display alias is scoped to the verified parent domain',()=>{
 const origin=new URL('https://大人.top').origin;
 const alias=shareAliasFor(origin);
 const domains=[{origin,display_origin:'https://大人.top',share_alias:alias,display_share_alias:'https://www.大人.top'}];
 assert.equal(shareOrigin(origin,origin,alias),alias);
 assert.equal(shareOrigin('https://example.org','https://example.org',alias),'https://example.org');
 assert.equal(displayShortUrl(alias+'/4gDqOv?a=%26',domains),'https://www.大人.top/4gDqOv?a=%26');
});
