/* Versioned, same-resolution WebP previews. Camera and atlas data remain on the original resources. */
(() => {
  'use strict';

  function mapName(key) {
    const start = key.indexOf('/');
    const end = key.lastIndexOf('/');
    let hash = 2166136261;
    for (let i = start + 1; i < end; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
    return key.slice(0, start) + '-' + (hash & 15).toString(16) + '.json';
  }

  if (typeof document === 'undefined' && typeof module !== 'undefined' && module.exports) {
    module.exports = { mapName };
    return;
  }
  const K = window.SpineKit;
  if (!K) return;
  const release = 'quality/q10-20261122/';
  const mapsURL = new URL('../' + release + 'maps/', document.currentScript.src);
  const config = window.ARTHUB_COS_CONFIG || {};
  const roots = new Map();
  for (const [game, origin] of Object.entries({
    nikki: config.root, bd2: config.bd2AssetsRoot, majsoul: config.majsoulAssetsRoot,
    'azurlane-interaction': config.gameAssetsRoot, crosscore: config.crosscoreAssetsRoot,
    'crosscore-interaction': config.crosscoreAssetsRoot, riichicity: config.riichicityAssetsRoot || config.crosscoreAssetsRoot,
  })) {
    if (!origin) continue;
    const base = new URL(origin.replace(/\/+$/, '') + '/', location.href).href;
    if (!roots.has(base)) roots.set(base, new Set());
    roots.get(base).add(game);
  }
  const indexes = new Map();

  K.texturePreviewFor = async value => {
    let original;
    try { original = new URL(window.ARTHUB_COS_RESOLVE?.(value) || value, location.href); }
    catch { return null; }
    const base = [...roots.keys()].find(root => original.href.startsWith(root));
    if (!base) return null;
    let key;
    try { key = decodeURIComponent(original.pathname.slice(new URL(base).pathname.length)); }
    catch { return null; }
    if (!roots.get(base).has(key.split('/', 1)[0])) return null;
    const name = mapName(key);
    if (!indexes.has(name)) {
      const request = K.fetchJSON(new URL(name, mapsURL).href, {timeout: 6000}).catch(() => {
        indexes.delete(name);
        return null;
      });
      indexes.set(name, request);
    }
    const row = (await indexes.get(name))?.[key];
    if (!row) return null;
    const [path, width, height, pma] = row;
    return { url: new URL(release + path, base).href, width, height, pma: Boolean(pma) };
  };
})();
