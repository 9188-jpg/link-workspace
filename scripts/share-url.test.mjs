import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserShareUrl} from '../src/share-url.ts';
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
