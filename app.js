import { shortcutURL, normalize, matches, catalogChanges, inCategory, buildCategoryTree, paginate, paginationNumbers } from './core.js';
import { readCatalog, readSavedCatalog, saveCatalog } from './catalog.js';

const $ = id => document.getElementById(id);
const list = $('list'), q = $('q');
const STORE_KEY = 'prompt-ai.favorites.v1';
let catalog = null, items = [], category = '', favoritesOnly = false;
let pageNumber = 1, folderTree = [];
const expandedFolders = new Map();
let refreshTask = null, searchTimer, toastTimer, registration, lastChecked = 0, firstPaint = true;
let pendingCatalog = null, pendingChanges = null, offeredVersion = null, offeredWorker = null, applyingUpdate = false;
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
function closeSheet(dialog) { if (!applyingUpdate) dialog.close(); }
function openSheet(dialog) {
  q.blur();
  dialog.showModal();
  document.body.style.overflow = 'hidden';
}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', event => { if (event.target === dialog || event.target.closest('[data-close]')) closeSheet(dialog); });
  dialog.addEventListener('cancel', event => { if (applyingUpdate) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = document.querySelector('dialog[open]') ? 'hidden' : '';
    // Đợi người dùng đóng bảng xem prompt/thư mục; không chồng hai popup.
    if (dialog.id !== 'update') showUpdateNotice();
  });
}
function waitingWorker() {
  return navigator.serviceWorker?.controller ? registration?.waiting : null;
}
function syncUpdateButton() {
  const available = Boolean(pendingCatalog || waitingWorker());
  $('refreshBtn').classList.toggle('on', available);
  $('refreshBtn').setAttribute('aria-label', available ? 'Mở popup cập nhật' : 'Kiểm tra prompt mới');
}
function showUpdateNotice(force = false) {
  const worker = waitingWorker();
  syncUpdateButton();
  if ((!pendingCatalog && !worker) || applyingUpdate || document.visibilityState !== 'visible') return;
  if (document.querySelector('dialog[open]:not(#update)')) return;
  const version = pendingCatalog?.version || null;
  if (!force && !$('update').open && version === offeredVersion && worker === offeredWorker) return;
  if (pendingCatalog) {
    $('updateTitle').textContent = pendingChanges.added ? 'Có bản prompt mới' : 'Kho prompt có cập nhật';
    const details = [];
    if (pendingChanges.added) details.push('Thêm ' + pendingChanges.added + ' prompt');
    if (pendingChanges.updated) details.push('sửa ' + pendingChanges.updated + ' prompt');
    if (pendingChanges.removed) details.push('xóa ' + pendingChanges.removed + ' prompt');
    $('updateMessage').textContent = details.join(' · ') + '. Bấm Cập nhật để dùng kho mới.';
  } else {
    $('updateTitle').textContent = 'Có phiên bản webclip mới';
    $('updateMessage').textContent = 'Bấm Cập nhật để sử dụng phiên bản mới nhất của Prompt AI.';
  }
  offeredVersion = version; offeredWorker = worker;
  if (!$('update').open) openSheet($('update'));
}
function installCatalog(next) {
  catalog = next;
  items = next.prompts.map(item => ({ ...item, search: normalize(item.title + ' ' + item.category + ' ' + item.text) }));
  folderTree = buildCategoryTree(items);
  if (category && !items.some(item => inCategory(item.category, category))) { category = ''; pageNumber = 1; }
  syncFilters(); paint();
}
async function applyUpdate() {
  if (applyingUpdate) return;
  applyingUpdate = true;
  $('updateBtn').disabled = true; $('updateLater').disabled = true;
  $('updateBtn').textContent = 'Đang cập nhật…';
  // Chờ lần kiểm tra đang chạy để nhận cùng lúc kho prompt và phiên bản webclip.
  if (refreshTask) await refreshTask;
  if (pendingCatalog) {
    const next = pendingCatalog;
    await saveCatalog(next);
    installCatalog(next);
    pendingCatalog = null; pendingChanges = null;
  }
  const worker = waitingWorker();
  if (worker) {
    worker.postMessage({ type: 'SKIP_WAITING' });
    return; // controllerchange tải lại đúng phiên bản, không cần kéo trang.
  }
  applyingUpdate = false;
  $('updateBtn').disabled = false; $('updateLater').disabled = false;
  $('updateBtn').textContent = 'Cập nhật';
  $('update').close(); syncUpdateButton();
  toast('Đã cập nhật kho prompt');
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
function paint({ resetPage = false, scroll = false } = {}) {
  if (!catalog) return;
  if (resetPage) pageNumber = 1;
  const query = normalize(q.value.trim());
  const visible = items.filter(item => matches(item, query, category, favoritesOnly, favorites));
  const page = paginate(visible, pageNumber);
  pageNumber = page.page;
  const fragment = document.createDocumentFragment();
  let group = null;
  for (const [index, item] of page.items.entries()) {
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
      reset.addEventListener('click', () => { category = ''; favoritesOnly = false; q.value = ''; syncFilters(); paint({ resetPage: true, scroll: true }); });
      empty.append(document.createElement('br'), reset);
    }
    fragment.append(empty);
  }
  list.replaceChildren(fragment); list.setAttribute('aria-busy', 'false');
  list.classList.toggle('initial', firstPaint); firstPaint = false;
  $('summary').textContent = visible.length + ' prompt' + (category ? ' · ' + category : '') + (favoritesOnly ? ' · Yêu thích' : '') + (page.pages > 1 ? ' · Trang ' + page.page + '/' + page.pages : '');
  renderPagination(page);
  if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
}
function renderPagination(page) {
  const nav = $('pagination');
  nav.hidden = page.pages <= 1;
  const fragment = document.createDocumentFragment();
  for (const number of paginationNumbers(page.page, page.pages)) {
    if (number === null) {
      const gap = document.createElement('span'); gap.className = 'page-gap'; gap.textContent = '…'; gap.setAttribute('aria-hidden', 'true');
      fragment.append(gap); continue;
    }
    const button = document.createElement('button'); button.type = 'button'; button.className = 'page-number'; button.textContent = number;
    button.setAttribute('aria-label', 'Trang ' + number);
    if (number === page.page) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', event => changePage(number, event.detail === 0));
    fragment.append(button);
  }
  $('pageNumbers').replaceChildren(fragment);
  $('previousPage').disabled = page.page <= 1;
  $('nextPage').disabled = page.page >= page.pages;
  $('pageStatus').textContent = page.start + '–' + page.end + ' / ' + page.total;
}
function changePage(number, keyboard = false) {
  if (number === pageNumber) return;
  pageNumber = number;
  paint({ scroll: true });
  if (keyboard) list.querySelector('.prompt-link')?.focus({ preventScroll: true });
}
function syncFilters() {
  $('favBtn').setAttribute('aria-pressed', String(favoritesOnly));
  $('categoryBtn').classList.toggle('on', Boolean(category));
  $('categoryBtn').setAttribute('aria-label', category ? 'Thư mục: ' + category : 'Lọc thư mục');
}
function showCategories() {
  const fragment = document.createDocumentFragment();
  function chooseButton(name, label, count) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'chip folder-choice' + (name === category ? ' on' : '');
    button.setAttribute('aria-pressed', String(name === category));
    button.setAttribute('aria-label', (name || 'Tất cả') + ': ' + count + ' prompt');
    button.dataset.category = name;
    button.append(document.createTextNode(label));
    const total = document.createElement('span'); total.textContent = count; button.append(total);
    button.addEventListener('click', () => { category = name; syncFilters(); closeSheet($('categories')); paint({ resetPage: true, scroll: true }); });
    return button;
  }
  let branchId = 0;
  function makeBranch(nodes, depth = 0) {
    const branch = document.createElement('ul'); branch.className = 'folder-tree' + (depth >= 3 ? ' folder-tree-flat' : '');
    for (const node of nodes) {
      const entry = document.createElement('li'), row = document.createElement('div'); row.className = 'folder-row';
      const choice = chooseButton(node.path, node.label, node.count);
      if (node.children.length) {
        const childBranch = makeBranch(node.children, depth + 1);
        childBranch.id = 'folder-branch-' + branchId++;
        const expanded = Boolean(category && category !== node.path && inCategory(category, node.path)) || (expandedFolders.get(node.path) ?? depth === 0);
        childBranch.hidden = !expanded;
        const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'folder-toggle'; toggle.textContent = '›';
        toggle.setAttribute('aria-label', 'Mở hoặc thu gọn ' + node.path);
        toggle.setAttribute('aria-expanded', String(expanded)); toggle.setAttribute('aria-controls', childBranch.id);
        toggle.addEventListener('click', () => {
          const open = childBranch.hidden;
          childBranch.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
          expandedFolders.set(node.path, open);
        });
        row.append(toggle, choice); entry.append(row, childBranch);
      } else {
        const spacer = document.createElement('span'); spacer.className = 'folder-spacer'; spacer.setAttribute('aria-hidden', 'true');
        row.append(spacer, choice); entry.append(row);
      }
      branch.append(entry);
    }
    return branch;
  }
  fragment.append(chooseButton('', 'Tất cả', items.length), makeBranch(folderTree));
  $('categoryGrid').replaceChildren(fragment); openSheet($('categories'));
}
async function loadCatalog(manual = false) {
  if (refreshTask) return refreshTask;
  refreshTask = (async () => {
    $('refreshBtn').disabled = true;
    try {
      const result = await readCatalog(pendingCatalog || catalog, { persist: false });
      const next = result.catalog;
      if (!catalog) {
        installCatalog(next); await saveCatalog(next);
      } else if (!result.cached && !result.unchanged) {
        const changes = catalogChanges(catalog, next);
        if (changes.total) {
          pendingCatalog = next; pendingChanges = changes;
        } else {
          // Đổi mã giao diện/tree SHA không đồng nghĩa với thêm prompt.
          catalog = next; pendingCatalog = null; pendingChanges = null;
          await saveCatalog(next);
          if ($('update').open && !waitingWorker() && !applyingUpdate) $('update').close();
        }
      }
      showUpdateNotice(manual);
      if (manual && !pendingCatalog && !waitingWorker()) toast(result.cached || !navigator.onLine ? 'Đang dùng kho prompt đã lưu' : 'Kho prompt đã cập nhật');
    } catch (failure) {
      if (catalog) { if (manual) toast('Chưa tải được bản mới. Vẫn dùng kho đã mở.'); }
      else {
        list.replaceChildren();
        const error = document.createElement('p'); error.className = 'err';
        error.textContent = failure.code === 'GITHUB_LIMIT' ? 'GitHub đang giới hạn lượt đọc. Chờ một lúc rồi nhấn làm mới, hoặc dùng workflow build của repo.' : 'Chưa tải được kho prompt. Kiểm tra kết nối hoặc bản triển khai GitHub Pages rồi thử lại.';
        list.append(error); list.setAttribute('aria-busy', 'false'); $('summary').textContent = 'Kho prompt chưa sẵn sàng';
      }
    } finally { lastChecked = Date.now(); $('refreshBtn').disabled = false; refreshTask = null; connection(); }
  })();
  return refreshTask;
}

q.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => paint({ resetPage: true }), 100); });
q.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); clearTimeout(searchTimer); paint({ resetPage: true }); q.blur(); } });
$('favBtn').addEventListener('click', () => { favoritesOnly = !favoritesOnly; syncFilters(); paint({ resetPage: true, scroll: true }); });
$('previousPage').addEventListener('click', event => changePage(pageNumber - 1, event.detail === 0));
$('nextPage').addEventListener('click', event => changePage(pageNumber + 1, event.detail === 0));
$('categoryBtn').addEventListener('click', showCategories);
$('helpBtn').addEventListener('click', () => openSheet($('help')));
$('updateBtn').addEventListener('click', applyUpdate);
$('refreshBtn').addEventListener('click', () => {
  if (pendingCatalog || waitingWorker()) showUpdateNotice(true);
  else loadCatalog(true);
  registration?.update().catch(() => {});
});
window.addEventListener('offline', connection);
window.addEventListener('online', () => { connection(); loadCatalog(); });
function checkOnReturn() {
  if (document.visibilityState !== 'visible' || !catalog) return;
  showUpdateNotice();
  if (Date.now() - lastChecked > 60000) {
    loadCatalog(); registration?.update().catch(() => {});
  }
}
window.addEventListener('pageshow', checkOnReturn);
document.addEventListener('visibilitychange', checkOnReturn);
// Khi để webclip mở lâu, vẫn nhận bản vừa triển khai; ngừng kiểm tra khi app ẩn.
setInterval(checkOnReturn, 5 * 60000);
window.addEventListener('storage', event => {
  if (event.key !== STORE_KEY) return;
  try { const next = JSON.parse(event.newValue); favorites = new Set(Array.isArray(next) ? next.filter(value => typeof value === 'string') : []); } catch { favorites = new Set(); }
  paint();
});

function registerWorker() {
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(reg => {
    registration = reg;
    const offerUpdate = async () => {
      if (!waitingWorker()) return;
      await loadCatalog();
      showUpdateNotice();
    };
    offerUpdate();
    reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', offerUpdate));
  }).catch(() => { /* Safari thường vẫn dùng được khi service worker bị chặn. */ });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applyingUpdate && !reloading) { reloading = true; location.reload(); }
    else syncUpdateButton();
  });
}
}
async function start() {
  connection();
  const saved = await readSavedCatalog();
  if (saved) installCatalog(saved);
  await loadCatalog();
  registerWorker();
}
start();
