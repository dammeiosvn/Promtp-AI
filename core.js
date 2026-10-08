export const SHORTCUT_NAME = 'Prompt AI';
export function shortcutURL(text) {
  return 'shortcuts://run-shortcut?name=' + encodeURIComponent(SHORTCUT_NAME) + '&input=text&text=' + encodeURIComponent(text);
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
  return (!category || item.category === category) && (!favoritesOnly || favorites.has(item.id)) && (!query || item.search.includes(query));
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
