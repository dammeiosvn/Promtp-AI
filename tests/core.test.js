import test from 'node:test';
import assert from 'node:assert/strict';
import { shortcutURL, demoImagePath, normalize, validateCatalog, matches, catalogChanges, inCategory, buildCategoryTree, paginate, paginationNumbers } from '../core.js';

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
test('Demo images use the original prompt filename with spaces replaced by underscores in the Pages scope', () => {
  const base = 'https://dammeiosvn.github.io/Promtp-AI/';
  for (const [id, expected] of [
    ['Phú Quốc/Intimate Couple.txt', 'Intimate_Couple.jpeg'],
    ['Ảnh/Intimate_Couple.txt', 'Intimate_Couple.jpeg'],
    ['Phú Quốc/Intimate Couple Close-up.txt', 'Intimate_Couple_Close-up.jpeg'],
    ['Ảnh cưới/Sang trọng & 100% #?.TXT', 'Sang_trọng_&_100%_#?.jpeg'],
  ]) {
    const url = new URL(demoImagePath({ id }), base);
    assert.equal(decodeURIComponent(url.pathname), '/Promtp-AI/Demo/' + expected);
    assert.equal(url.search, ''); assert.equal(url.hash, '');
    assert.equal(url.origin, new URL(base).origin);
  }
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

test('Parent folder includes every descendant without selecting similarly named siblings', () => {
  assert.equal(inCategory('Đà Lạt/Solo/Hoàng hôn', 'Đà Lạt'), true);
  assert.equal(inCategory('Đà Lạt/Solo', 'Đà Lạt/Solo'), true);
  assert.equal(inCategory('Đà Lạt 2/Solo', 'Đà Lạt'), false);
  const item = { id: 'p', category: 'Đà Lạt/Solo', search: 'anh cuoi' };
  assert.equal(matches(item, 'anh cuoi', 'Đà Lạt', true, new Set(['p'])), true);
  assert.equal(matches(item, 'anh cuoi', 'Đà Lạt', true, new Set()), false);
});

test('Folder tree creates missing parents and counts descendants exactly once', () => {
  const tree = buildCategoryTree([
    { category: 'Đà Lạt' }, { category: 'Đà Lạt/Solo' }, { category: 'Đà Lạt/Solo/Đêm' },
    { category: 'Ảnh/Khmer' }, { category: 'Chung' },
  ]);
  assert.equal(tree[0].path, 'Chung');
  const dalat = tree.find(node => node.path === 'Đà Lạt');
  assert.equal(dalat.count, 3);
  assert.equal(dalat.children[0].label, 'Solo');
  assert.equal(dalat.children[0].count, 2);
  assert.equal(dalat.children[0].children[0].path, 'Đà Lạt/Solo/Đêm');
  assert.equal(tree.find(node => node.path === 'Ảnh').count, 1);
});

test('Pagination keeps 20 prompts per page, no duplicates, and clamps after deletions', () => {
  const rows = Array.from({ length: 41 }, (_, index) => ({ id: String(index) }));
  assert.deepEqual([1, 2, 3].map(page => paginate(rows, page).items.length), [20, 20, 1]);
  assert.deepEqual([1, 2, 3].flatMap(page => paginate(rows, page).items), rows);
  assert.equal(paginate(rows.slice(0, 20), 3).page, 1);
  assert.equal(paginate(rows.slice(0, 40)).pages, 2);
  assert.equal(paginate([], 8).items.length, 0);
  assert.equal(paginate(rows, -1).page, 1);
});

test('Large albums have bounded page controls with first/current/last pages reachable', () => {
  for (const current of [1, 2, 3, 4, 25, 48, 49, 50]) {
    const numbers = paginationNumbers(current, 50);
    assert(numbers.includes(1) && numbers.includes(current) && numbers.includes(50));
    assert(numbers.length <= 7);
  }
  assert.deepEqual(paginationNumbers(2, 3), [1, 2, 3]);
});
