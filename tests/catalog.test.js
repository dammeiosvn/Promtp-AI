import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRepositoryCatalog } from '../catalog.js';

const entry = (path, sha, extra = {}) => ({ path, sha, type: 'blob', mode: '100644', ...extra });
function fixture(tree, contents) {
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    if (url.includes('/git/trees/')) return new Response(JSON.stringify(tree));
    const sha = url.split('/').pop();
    if (!(sha in contents)) return new Response('', { status: 404 });
    return new Response(JSON.stringify({ encoding: 'base64', content: Buffer.from(contents[sha]).toString('base64') }));
  };
  return { calls, fetcher };
}

test('Discover root and nested Vietnamese prompts when branch Pages has no generated JSON', async () => {
  const text = 'Giữ mặt Sếp 👑\r\n<script>code</script> & + 100%\n';
  const f = fixture({ sha: 'tree-1', tree: [
    entry('Dịch_văn-bản.txt', 'a'),
    entry('prompt tạo ảnh/Indonesia/Ảnh_cưới.TXT', 'b'),
    entry('.hidden/secret.txt', 'c'), entry('scripts/test.txt', 'd'),
    entry('linked.txt', 'e', { mode: '120000' }), entry('empty.txt', 'f'),
  ] }, { a: 'dịch', b: text, f: ' \n' });
  const result = await fetchRepositoryCatalog(null, f.fetcher);
  assert.equal(result.prompts.length, 2);
  assert.equal(result.prompts[0].title, 'Dịch văn bản');
  assert.equal(result.prompts[1].category, 'prompt tạo ảnh/Indonesia');
  assert.equal(result.prompts[1].text, text);
  assert.equal(result.prompts[1].blobSha, 'b');
  assert.equal(f.calls.length, 4, 'One tree + three eligible blobs; hidden, infra and symlink ignored');
});

test('Read only changed blobs; additions and deletions appear without configuration', async () => {
  const f = fixture({ sha: 'tree-2', tree: [entry('A.txt', 'same'), entry('Ảnh mới/B.txt', 'new')] }, { new: 'prompt mới' });
  const previous = { prompts: [{ id: 'A.txt', text: 'giữ nguyên', blobSha: 'same' }, { id: 'deleted.txt', text: 'old', blobSha: 'gone' }] };
  const result = await fetchRepositoryCatalog(previous, f.fetcher);
  assert.equal(result.prompts.length, 2);
  assert.equal(result.prompts[0].text, 'giữ nguyên');
  assert.equal(result.prompts[1].text, 'prompt mới');
  assert.equal(f.calls.length, 2);
});

test('API limit and truncated tree fail clearly instead of returning an empty or partial catalog', async () => {
  await assert.rejects(fetchRepositoryCatalog(null, async () => new Response('', { status: 403 })), error => error.code === 'GITHUB_LIMIT');
  const f = fixture({ sha: 'large', tree: [], truncated: true }, {});
  await assert.rejects(fetchRepositoryCatalog(null, f.fetcher), /toàn bộ danh mục/);
});

test('A failed prompt download does not silently omit that prompt', async () => {
  const f = fixture({ sha: 'tree', tree: [entry('a.txt', 'missing')] }, {});
  await assert.rejects(fetchRepositoryCatalog(null, f.fetcher), /HTTP 404/);
});
