import { shortcutURL, normalize, matches } from './core.js';
import { readCatalog } from './catalog.js';

const $ = id => document.getElementById(id);
const list = $('list'), q = $('q');
const STORE_KEY = 'prompt-ai.favorites.v1';
let catalog = null, items = [], category = '', favoritesOnly = false;
let refreshTask = null, searchTimer, toastTimer, registration, lastChecked = 0, firstPaint = true;
let favorites = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY));
  if (Array.isArray(saved)) favorites = new Set(saved.filter(value => typeof value === 'string'));
} catch { /* Thiết bị vẫn sử dụng được khi không cho lưu tùy chọn. */ }

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('on');
  toastTimer = setTimeout(() => $('toast').classList.remove('on'), 2400);
}
function connection() {
  $('connection').textContent = navigator.onLine ? '' : 'Đang dùng ngoại tuyến';
}
function closeSheet(dialog) { dialog.close(); document.body.style.overflow = ''; }
function openSheet(dialog) {
  q.blur();
  dialog.showModal();
  document.body.style.overflow = 'hidden';
}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', event => { if (event.target === dialog || event.target.closest('[data-close]')) closeSheet(dialog); });
  dialog.addEventListener('close', () => { document.body.style.overflow = ''; });
}
function openPreview(item) {
  $('previewTitle').textContent = item.title;
  $('previewCategory').textContent = item.category;
  $('previewText').textContent = item.text;
  $('previewText').scrollTop = 0;
  $('previewRun').href = shortcutURL(item.text);
  $('previewRun').setAttribute('aria-label', 'Gửi ' + item.title + ' sang Prompt AI');
  openSheet($('preview'));
}
function toggleFavorite(item, button) {
  const added = !favorites.has(item.id);
  if (added) favorites.add(item.id); else favorites.delete(item.id);
  button.classList.toggle('on', added);
  button.setAttribute('aria-pressed', String(added));
  let saved = true;
  try { localStorage.setItem(STORE_KEY, JSON.stringify([...favorites])); } catch { saved = false; }
  toast((added ? 'Đã ghim: ' : 'Đã bỏ ghim: ') + item.title + (saved ? '' : ' (chỉ trong phiên này)'));
  if (favoritesOnly) paint();
}
function makeCard(item, index) {
  const card = document.createElement('article');
  card.className = 'card';
  card.style.setProperty('--i', Math.min(index, 7));
  const link = document.createElement('a');
  link.className = 'prompt-link';
  // URL được chuẩn bị trước để iOS nhận thao tác chạm trực tiếp, không chờ fetch/clipboard.
  link.href = shortcutURL(item.text);
  link.setAttribute('aria-label', 'Chạy ' + item.title + ' bằng Prompt AI');
  const title = document.createElement('span');
  title.className = 'name'; title.textContent = item.title;
  const excerpt = document.createElement('p');
  excerpt.className = 'excerpt'; excerpt.textContent = item.text.replace(/\s+/g, ' ').trim();
  link.append(title, excerpt);
  const actions = document.createElement('div'); actions.className = 'acts';
  const pin = document.createElement('button');
  pin.type = 'button'; pin.className = 'pin' + (favorites.has(item.id) ? ' on' : ''); pin.textContent = '★';
  pin.setAttribute('aria-label', 'Ghim ' + item.title);
  pin.setAttribute('aria-pressed', String(favorites.has(item.id)));
  pin.addEventListener('click', () => toggleFavorite(item, pin));
  const preview = document.createElement('button');
  preview.type = 'button'; preview.className = 'sc'; preview.textContent = '≡';
  preview.setAttribute('aria-label', 'Xem toàn văn ' + item.title);
  preview.addEventListener('click', () => openPreview(item));
  actions.append(pin, preview); card.append(link, actions);
  return card;
}
function paint() {
  if (!catalog) return;
  const query = normalize(q.value.trim());
  const visible = items.filter(item => matches(item, query, category, favoritesOnly, favorites));
  const fragment = document.createDocumentFragment();
  let group = null;
  for (const [index, item] of visible.entries()) {
    if (group !== item.category) {
      group = item.category;
      const heading = document.createElement('h2'); heading.className = 'sec'; heading.textContent = group;
      fragment.append(heading);
    }
    fragment.append(makeCard(item, index));
  }
  if (!visible.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    empty.textContent = !items.length ? 'Chưa có prompt. Thêm tệp .txt vào repo để bắt đầu.' : favoritesOnly ? 'Chưa có prompt yêu thích phù hợp.' : 'Không tìm thấy prompt phù hợp.';
    if (items.length && (category || query || favoritesOnly)) {
      const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'x'; reset.textContent = 'Hiện tất cả';
      reset.addEventListener('click', () => { category = ''; favoritesOnly = false; q.value = ''; syncFilters(); paint(); });
      empty.append(document.createElement('br'), reset);
    }
    fragment.append(empty);
  }
  list.replaceChildren(fragment); list.setAttribute('aria-busy', 'false');
  list.classList.toggle('initial', firstPaint); firstPaint = false;
  $('summary').textContent = visible.length + ' prompt' + (category ? ' · ' + category : '') + (favoritesOnly ? ' · Yêu thích' : '');
}
function syncFilters() {
  $('favBtn').setAttribute('aria-pressed', String(favoritesOnly));
  $('categoryBtn').classList.toggle('on', Boolean(category));
  $('categoryBtn').setAttribute('aria-label', category ? 'Thư mục: ' + category : 'Lọc thư mục');
}
function showCategories() {
  const counts = new Map();
  for (const item of items) counts.set(item.category, (counts.get(item.category) || 0) + 1);
  const fragment = document.createDocumentFragment();
  for (const [name, count] of [['', items.length], ...counts]) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'chip' + (name === category ? ' on' : '');
    button.setAttribute('aria-pressed', String(name === category));
    button.append(document.createTextNode(name || 'Tất cả'));
    const total = document.createElement('span'); total.textContent = count; button.append(total);
    button.addEventListener('click', () => { category = name; syncFilters(); closeSheet($('categories')); paint(); });
    fragment.append(button);
  }
  $('categoryGrid').replaceChildren(fragment); openSheet($('categories'));
}
async function loadCatalog(manual = false) {
  if (refreshTask) return refreshTask;
  refreshTask = (async () => {
    $('refreshBtn').disabled = true;
    try {
      const result = await readCatalog(catalog);
      const next = result.catalog;
      const changed = catalog && catalog.version !== next.version;
      catalog = next;
      items = next.prompts.map(item => ({ ...item, search: normalize(item.title + ' ' + item.category + ' ' + item.text) }));
      if (category && !items.some(item => item.category === category)) category = '';
      syncFilters(); paint(); lastChecked = Date.now();
      if (manual) toast(result.cached || !navigator.onLine ? 'Đang dùng kho prompt đã lưu' : changed ? 'Đã nhận prompt mới' : 'Kho prompt đã cập nhật');
    } catch (failure) {
      if (catalog) { if (manual) toast('Chưa tải được bản mới. Vẫn dùng kho đã mở.'); }
      else {
        list.replaceChildren();
        const error = document.createElement('p'); error.className = 'err';
        error.textContent = failure.code === 'GITHUB_LIMIT' ? 'GitHub đang giới hạn lượt đọc. Chờ một lúc rồi nhấn làm mới, hoặc dùng workflow build của repo.' : 'Chưa tải được kho prompt. Kiểm tra kết nối hoặc bản triển khai GitHub Pages rồi thử lại.';
        list.append(error); list.setAttribute('aria-busy', 'false'); $('summary').textContent = 'Kho prompt chưa sẵn sàng';
      }
    } finally { $('refreshBtn').disabled = false; refreshTask = null; connection(); }
  })();
  return refreshTask;
}

q.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(paint, 100); });
q.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); clearTimeout(searchTimer); paint(); q.blur(); } });
$('favBtn').addEventListener('click', () => { favoritesOnly = !favoritesOnly; syncFilters(); paint(); });
$('categoryBtn').addEventListener('click', showCategories);
$('helpBtn').addEventListener('click', () => openSheet($('help')));
$('refreshBtn').addEventListener('click', () => { loadCatalog(true); registration?.update().catch(() => {}); });
window.addEventListener('offline', connection);
window.addEventListener('online', () => { connection(); loadCatalog(); });
window.addEventListener('pageshow', () => { if (catalog && Date.now() - lastChecked > 60000) loadCatalog(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && catalog && Date.now() - lastChecked > 60000) loadCatalog(); });
window.addEventListener('storage', event => {
  if (event.key !== STORE_KEY) return;
  try { const next = JSON.parse(event.newValue); favorites = new Set(Array.isArray(next) ? next.filter(value => typeof value === 'string') : []); } catch { favorites = new Set(); }
  paint();
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(reg => {
    registration = reg;
    const offerUpdate = () => { if (reg.waiting && navigator.serviceWorker.controller) $('update').hidden = false; };
    offerUpdate();
    reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', offerUpdate));
  }).catch(() => { /* Safari thường vẫn dùng được khi service worker bị chặn. */ });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !$('update').hidden) { reloading = true; location.reload(); }
  });
  $('updateBtn').addEventListener('click', () => {
    if (registration?.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    else location.reload();
  });
}
connection(); loadCatalog();
