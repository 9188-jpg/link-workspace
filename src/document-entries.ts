/** Which page blocks are clickable entries for homepage/document statistics. */
import {type Row} from './feature-types.ts';

/** True when the block is a visible entry that leads somewhere (profile and link3 layouts). */
export function entryClickable(body: Row, block: Row) {
 if (!block) return false;
 if (body.layout === 'link3') {
  if (block.type === 'button') return block.enabled !== false && !!block.url;
  if (block.type === 'card') return !!block.link;
  return false;
 }
 return block.type === 'link' && block.enabled !== false && !!block.url;
}

/** Clickable blocks in document order, used for entry ranking and click validation. */
export function entryBlocks(body: Row) {
 return (Array.isArray(body.blocks) ? body.blocks : []).filter((block: Row) => entryClickable(body, block));
}
