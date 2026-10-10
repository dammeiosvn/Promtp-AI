export const SHORTCUT_NAME = 'Prompt AI';
export const PAGE_SIZE = 20;
export function shortcutURL(text) {
  return 'shortcuts://run-shortcut?name=' + encodeURIComponent(SHORTCUT_NAME) + '&input=text&text=' + encodeURIComponent(text);
}
export function demoImagePath(item) {
  const stem = item.id.split('/').pop().replace(/\.txt$/i, '').trim();
  return './Demo/' + encodeURIComponent(stem.replace(/\s+/gu, '_')) + '.jpeg';
}
export function normalize(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLocaleLowerCase('vi');
}
export function validateCatalog(data) {
  if (!data || data.schema !== 1 || typeof data.version !== 'string' || !Array.isArray(data.prompts)) throw new Error('Danh mục không hợp lệ');
  const ids = new Set();
  for (const item of data.prompts) {
    if (!item || ['id', 'title', 'category', 'text'].some(key => typeof item[key] !== 'string') || !item.id || ids.has(item.id)) throw new Error('Prompt không hợp lệ');
    ids.add(item.id);
  }
  return data;
}
export function matches(item, query, category, favoritesOnly, favorites) {
  return inCategory(item.category, category) && (!favoritesOnly || favorites.has(item.id)) && (!query || item.search.includes(query));
}
export function inCategory(path, selected) {
  return !selected || path === selected || path.startsWith(selected + '/');
}
export function buildCategoryTree(items) {
  const roots = new Map();
  for (const item of items) {
    let children = roots, path = '';
    for (const label of item.category.split('/')) {
      path = path ? path + '/' + label : label;
      if (!children.has(label)) children.set(label, { path, label, count: 0, children: new Map() });
      const node = children.get(label);
      node.count++;
      children = node.children;
    }
  }
  const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
  function ordered(nodes) {
    return [...nodes.values()].sort((a, b) => Number(a.path !== 'Chung') - Number(b.path !== 'Chung') || collator.compare(a.label, b.label) || a.path.localeCompare(b.path))
      .map(node => ({ ...node, children: ordered(node.children) }));
  }
  return ordered(roots);
}
export function paginate(items, requestedPage = 1) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const offset = (page - 1) * PAGE_SIZE;
  return { items: items.slice(offset, offset + PAGE_SIZE), page, pages, total: items.length, start: items.length ? offset + 1 : 0, end: Math.min(offset + PAGE_SIZE, items.length) };
}
export function paginationNumbers(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const numbers = new Set([1, pages]);
  const start = page <= 3 ? 1 : Math.max(1, page - 1);
  const end = page >= pages - 2 ? pages : Math.min(pages, page <= 3 ? 5 : page + 1);
  for (let number = start; number <= end; number++) numbers.add(number);
  if (page >= pages - 2) for (let number = pages - 4; number <= pages; number++) numbers.add(number);
  const result = [];
  let previous = 0;
  for (const number of [...numbers].sort((a, b) => a - b)) {
    if (number - previous === 2) result.push(previous + 1);
    else if (previous && number - previous > 2) result.push(null);
    result.push(number); previous = number;
  }
  return result;
}
export function catalogChanges(current, next) {
  const before = new Map(current.prompts.map(item => [item.id, item]));
  let added = 0, updated = 0;
  for (const item of next.prompts) {
    const old = before.get(item.id);
    if (!old) added++;
    else if (['title', 'category', 'text'].some(key => old[key] !== item[key])) updated++;
    before.delete(item.id);
  }
  return { added, updated, removed: before.size, total: added + updated + before.size };
}
