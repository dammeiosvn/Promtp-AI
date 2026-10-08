import test from 'node:test';
import assert from 'node:assert/strict';
import { shortcutURL, normalize, validateCatalog, matches, catalogChanges } from '../core.js';

test('Shortcut receives exact raw text, including Vietnamese, CRLF, URL symbols, emoji and code', () => {
  const text = 'Tiếng Việt: Sếp & em + 100% # ?\r\n<script>alert("x")</script>\n👩🏽‍💻\thttps://example.com/?a=1&b=2';
  const url = new URL(shortcutURL(text));
  assert.equal(url.protocol, 'shortcuts:');
  assert.equal(url.hostname, 'run-shortcut');
  assert.equal(url.searchParams.get('name'), 'Prompt AI');
  assert.equal(url.searchParams.get('input'), 'text');
  assert.equal(url.searchParams.get('text'), text);
  assert.deepEqual([...url.searchParams.keys()], ['name', 'input', 'text']);
});
test('A long prompt is not truncated or converted into JSON', () => {
  const text = 'Lệnh nhiều dòng & + % 👾\n'.repeat(5000);
  assert.equal(new URL(shortcutURL(text)).searchParams.get('text'), text);
});
test('Vietnamese search ignores accents and handles đ', () => {
  assert.equal(normalize('ĐỔI ẢNH CƯỚI'), 'doi anh cuoi');
  const item = { id: 'p', category: 'Ảnh', search: normalize('Ảnh cưới hoàng gia') };
  assert.equal(matches(item, 'anh cuoi', 'Ảnh', true, new Set(['p'])), true);
  assert.equal(matches(item, '', 'Code', false, new Set()), false);
  assert.equal(matches(item, '', '', true, new Set()), false);
});
test('Reject broken catalogs instead of rendering partial text', () => {
  const item = { id: 'Ảnh/a.txt', title: 'a', category: 'Ảnh', text: 'hello' };
  assert.equal(validateCatalog({ schema: 1, version: 'v', prompts: [item] }).prompts.length, 1);
  assert.throws(() => validateCatalog({ schema: 1, version: 'v', prompts: [item, item] }));
  assert.throws(() => validateCatalog({ schema: 1, version: 'v', prompts: [{ ...item, text: null }] }));
});
test('Prompt update notice counts additions, edits and deletions, not code-only tree changes', () => {
  const a = { id: 'A.txt', title: 'A', category: 'Chung', text: 'old' };
  const b = { ...a, id: 'B.txt' };
  const current = { version: 'github-before', prompts: [a, b] };
  assert.equal(catalogChanges(current, { version: 'github-code-only', prompts: [b, a] }).total, 0);
  assert.deepEqual(catalogChanges(current, { prompts: [{ ...a, text: 'new' }, { ...b, id: 'C.txt' }] }), { added: 1, updated: 1, removed: 1, total: 3 });
  assert.equal(catalogChanges(current, { prompts: [{ ...a, title: 'Tên mới' }, b] }).updated, 1);
});
