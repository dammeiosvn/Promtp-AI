import { validateCatalog } from './core.js';

// Khi Pages xuất bản thẳng main, tự quét repo public thay cho danh mục ở bước build.
const REPOSITORY = 'dammeiosvn/Promtp-AI';
const REF = 'main';
const EXCLUDED = new Set(['_site', 'node_modules', 'scripts', 'tests', 'icons', 'assets', '__pycache__']);
const CATALOG_URL = new URL('./prompts.json', import.meta.url).href;
const VERSION_URL = new URL('./version.json', import.meta.url).href;
const DATA_CACHE = 'prompt-ai-data-' + new URL('./', import.meta.url).pathname;

async function getJSON(url, fetcher) {
  const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(12000), headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) {
    const error = new Error('Không tải được dữ liệu GitHub: HTTP ' + response.status);
    if (response.status === 403 || response.status === 429) error.code = 'GITHUB_LIMIT';
    throw error;
  }
  return response.json();
}

function isPrompt(entry) {
  return entry.type === 'blob' && entry.mode !== '120000' && /\.txt$/i.test(entry.path) && !entry.path.split('/').some(part => part.startsWith('.') || EXCLUDED.has(part));
}

function decodeText(blob) {
  if (blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new Error('Nội dung prompt không hợp lệ');
  const binary = atob(blob.content.replace(/\s+/g, ''));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

export async function fetchRepositoryCatalog(previous = null, fetcher = fetch) {
  const api = 'https://api.github.com/repos/' + REPOSITORY;
  const tree = await getJSON(api + '/git/trees/' + encodeURIComponent(REF) + '?recursive=1', fetcher);
  if (!Array.isArray(tree.tree) || tree.truncated) throw new Error('Không đọc được toàn bộ danh mục. Hãy dùng workflow build của repo.');
  const entries = tree.tree.filter(isPrompt);
  const saved = new Map((previous?.prompts || []).map(item => [item.id, item]));
  const prompts = new Array(entries.length);
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const index = cursor++, entry = entries[index];
      const cached = saved.get(entry.path);
      const text = cached?.blobSha === entry.sha ? cached.text : decodeText(await getJSON(api + '/git/blobs/' + encodeURIComponent(entry.sha), fetcher));
      if (!text.trim()) continue;
      const pieces = entry.path.split('/');
      const filename = pieces.pop();
      const stem = filename.replace(/\.txt$/i, '');
      prompts[index] = {
        id: entry.path, title: stem.replace(/[_-]+/g, ' ').trim() || stem,
        category: pieces.length ? pieces.join('/') : 'Chung', text, blobSha: entry.sha,
      };
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
  const rows = prompts.filter(Boolean);
  rows.sort((a, b) => Number(a.category !== 'Chung') - Number(b.category !== 'Chung') || a.category.toLocaleLowerCase('vi').localeCompare(b.category.toLocaleLowerCase('vi'), 'vi') || a.title.toLocaleLowerCase('vi').localeCompare(b.title.toLocaleLowerCase('vi'), 'vi') || a.id.localeCompare(b.id));
  return validateCatalog({ schema: 1, version: 'github-' + tree.sha, prompts: rows });
}

export async function readSavedCatalog() {
  try {
    if (!globalThis.caches) return null;
    const cache = await caches.open(DATA_CACHE);
    const response = await cache.match(CATALOG_URL);
    return response ? validateCatalog(await response.json()) : null;
  } catch { return null; }
}

export async function saveCatalog(catalog) {
  try {
    if (!globalThis.caches) return;
    const cache = await caches.open(DATA_CACHE);
    await cache.put(CATALOG_URL, new Response(JSON.stringify(catalog), { headers: { 'Content-Type': 'application/json; charset=utf-8' } }));
  } catch { /* Đọc prompt vẫn hoạt động khi Safari không cho lưu bộ nhớ. */ }
}

export async function readCatalog(previous = null, { persist = true, fetcher = fetch } = {}) {
  const saved = previous || await readSavedCatalog();
  if (saved) {
    try {
      // Chỉ tải vài chục byte khi kho không đổi; giữ nguyên bản đã chấp nhận.
      const response = await fetcher(VERSION_URL, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (response.ok) {
        const meta = await response.json();
        if (meta.schema === 1 && typeof meta.version === 'string' && meta.version === saved.version) {
          return { catalog: saved, cached: false, unchanged: true };
        }
      }
    } catch { /* Bản cũ chưa có version.json hoặc mạng lỗi: đọc kho như trước. */ }
  }
  let catalog;
  try {
    // Ưu tiên dữ liệu đã build: không cần gọi API GitHub, dùng được cả repo private.
    const response = await fetcher(CATALOG_URL, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (response.ok) catalog = validateCatalog(await response.json());
  } catch { /* Pages main không có prompts.json; dùng bộ quét repo bên dưới. */ }
  if (!catalog) {
    try { catalog = await fetchRepositoryCatalog(saved, fetcher); }
    catch (error) { if (saved) return { catalog: saved, cached: true }; throw error; }
  }
  // Kiểm tra nền không ghi đè kho đã được người dùng chấp nhận.
  if (persist) await saveCatalog(catalog);
  return { catalog, cached: false };
}
