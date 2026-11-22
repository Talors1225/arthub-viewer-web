// Build the public lookup tables from the four verified, same-resolution Q10 manifests.
const fs = require('node:fs');
const path = require('node:path');
const { mapName } = require('../common/texture-previews.js');
const release = 'quality/q10-20261122/';
const output = path.resolve(__dirname, '..', release, 'maps');
const manifests = process.argv[2];
if (!manifests) throw new Error('Pass the directory containing the four upload manifests.');
const homes = {
  nikke: ['nikki'], bd2: ['bd2', 'majsoul'], azurlane: ['azurlane-interaction'],
  riichicity: ['crosscore', 'crosscore-interaction', 'riichicity'],
};
const shards = new Map();
for (const game of Object.values(homes).flat()) {
  for (let shard = 0; shard < 16; shard++) shards.set(game + '-' + shard.toString(16) + '.json', new Map());
}
let count = 0;
for (const [profile, games] of Object.entries(homes)) {
  const manifest = JSON.parse(fs.readFileSync(path.join(manifests, profile + '.json'), 'utf8'));
  for (const item of manifest.objects) {
    const key = item.originalKey, game = key.split('/')[0];
    const expectedGame = game === 'crosscore-interaction' ? 'crosscore' : game;
    if (item.profile !== profile || !games.includes(game) || !item.key.startsWith(release + expectedGame + '/') ||
        decodeURIComponent(new URL(item.originalURL).pathname) !== '/' + key ||
        new URL(item.originalURL).origin !== item.publicRoot || !Number.isSafeInteger(item.width) ||
        !Number.isSafeInteger(item.height) || Math.min(item.width, item.height) <= 0 ||
        typeof item.pma !== 'boolean' || item.pma !== item.pmaWhenUploadingToGPU) {
      throw new Error('Invalid public texture mapping: ' + key);
    }
    const rows = shards.get(mapName(key));
    if (rows.has(key)) throw new Error('Duplicate texture: ' + key);
    rows.set(key, [item.key.slice(release.length), item.width, item.height, Number(item.pma)]);
    count++;
  }
}
fs.mkdirSync(output, { recursive: true });
for (const [name, rows] of shards) {
  const sorted = [...rows.keys()].sort().map(key => [key, rows.get(key)]);
  fs.writeFileSync(path.join(output, name), JSON.stringify(Object.fromEntries(sorted)) + '\n');
}
console.log(count + ' textures in ' + shards.size + ' lookup tables');
