/**
 * Ghost Beacon — Automated 3-Stage BGG Rules & Authority Background Harvester (Full Ranked Catalog + 2026 Previews)
 *
 * Crawls through bgg_top_20000_index.json in resumable batches, executing the 3-stage JSON calls
 * against api.geekdo.com:
 *   1. /api/geekitem/linkeditems (boardgamedesigner & boardgamepublisher) + /api/files
 *   2. /api/forums (locates the exact Rules forumid & post counts)
 *   3. /api/forums/threads (pulls hot Rules threads & pinned FAQs)
 *
 * Saves sharded JSON bundles into bgg_rules_shards/shard_XXX.json (500 games per shard)
 * and updates bgg_harvester_cursor.json after every 50 games so it can run unattended
 * in the background and resume seamlessly across reboots or GitHub Action runs.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 28 });

const DIR = __dirname;
const INDEX_PATH = path.join(DIR, 'bgg_top_20000_index.json');
const CURSOR_PATH = path.join(DIR, 'bgg_harvester_cursor.json');
const SHARDS_DIR = path.join(DIR, 'bgg_rules_shards');

if (!fs.existsSync(SHARDS_DIR)) fs.mkdirSync(SHARDS_DIR, { recursive: true });

function getJson(urlPath) {
  return new Promise((resolve) => {
    const req = https.get({
      hostname: 'api.geekdo.com',
      path: urlPath,
      agent: keepAliveAgent,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'application/json' },
      timeout: 6500
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function harvestThreeStageGame(entry) {
  const [objectid, name, year, rank, avg] = entry;
  const [desRes, pubRes, filesRes, forumsRes] = await Promise.all([
    getJson(`/api/geekitem/linkeditems?nosession=1&objectid=${objectid}&objecttype=thing&linkdata_index=boardgamedesigner`),
    getJson(`/api/geekitem/linkeditems?nosession=1&objectid=${objectid}&objecttype=thing&linkdata_index=boardgamepublisher`),
    getJson(`/api/files?objectid=${objectid}&objecttype=thing&pageid=1&showcount=6`),
    getJson(`/api/forums?objectid=${objectid}&objecttype=thing`)
  ]);

  const rulesForum = (forumsRes?.forums || []).find((f) => f.title.toLowerCase().includes('rule')) || (forumsRes?.forums || [])[0];
  const rulesForumId = rulesForum?.forumid || '66';
  const threadsRes = await getJson(`/api/forums/threads?objectid=${objectid}&objecttype=thing&forumid=${rulesForumId}&pageid=1&showcount=15&sort=hot`);

  return {
    objectid: Number(objectid),
    name,
    year,
    bgg_rank: rank,
    avg_rating: avg,
    rulesForumId,
    rulesPostCount: Number(rulesForum?.numposts || 0),
    rulesThreadCount: Number(rulesForum?.numthreads || 0),
    designers: (desRes?.items || []).map((x) => ({ id: Number(x.objectid), name: x.name })),
    publishers: (pubRes?.items || []).slice(0, 4).map((x) => ({ id: Number(x.objectid), name: x.name })),
    files: (filesRes?.files || []).slice(0, 6).map((f) => ({
      filepageid: f.filepageid,
      filename: f.filename,
      href: `https://boardgamegeek.com/filepage/${f.filepageid}`
    })),
    hotRulesThreads: (threadsRes?.threads || []).slice(0, 12).map((t) => ({
      threadid: t.threadid,
      subject: t.subject,
      numposts: Number(t.numposts || 0),
      numrecommend: Number(t.numrecommend || 0),
      pin: t.pin === '1' || t.frontpin === '1',
      postdate: (t.postdate || '').slice(0, 10),
      author: t.user?.username || 'unknown',
      lastposter: t.lastpostusername || ''
    }))
  };
}

async function main() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error('Missing bgg_top_20000_index.json');
    process.exit(1);
  }
  const indexData = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const games = indexData.games || [];

  let cursor = { nextIndex: 0, totalHarvested: 0, updatedAt: null };
  if (fs.existsSync(CURSOR_PATH)) {
    try { cursor = JSON.parse(fs.readFileSync(CURSOR_PATH, 'utf8')); } catch (e) {}
  }

  const maxGamesThisRun = Number(process.env.MAX_BGG_HARVEST || 40000);
  const startIdx = cursor.nextIndex || 0;
  const endIdx = Math.min(games.length, startIdx + maxGamesThisRun);

  console.log(`[BGG 3-Stage Harvester] Starting at rank index ${startIdx} / ${games.length} (target: ${endIdx})...`);

  const CONCURRENCY = Number(process.env.BGG_CONCURRENCY || 12);
  for (let i = startIdx; i < endIdx; i += CONCURRENCY) {
    const batch = games.slice(i, Math.min(i + CONCURRENCY, endIdx));
    const results = await Promise.all(batch.map((g, bIdx) => harvestThreeStageGame(g).then(res => ({ res, absIdx: i + bIdx }))));

    const touchedShards = new Map();
    for (const { res, absIdx } of results) {
      if (res && res.objectid) {
        const shardId = String(Math.floor(absIdx / 500)).padStart(3, '0');
        if (!touchedShards.has(shardId)) {
          const shardPath = path.join(SHARDS_DIR, `shard_${shardId}.json`);
          let obj = {};
          if (fs.existsSync(shardPath)) {
            try { obj = JSON.parse(fs.readFileSync(shardPath, 'utf8')); } catch (e) {}
          }
          touchedShards.set(shardId, { shardPath, obj });
        }
        touchedShards.get(shardId).obj[res.objectid] = res;
      }
    }

    let lastShardId = '000';
    for (const [shardId, { shardPath, obj }] of touchedShards.entries()) {
      fs.writeFileSync(shardPath, JSON.stringify(obj), 'utf8');
      lastShardId = shardId;
    }

    cursor.nextIndex = i + batch.length;
    cursor.totalHarvested = cursor.nextIndex;
    cursor.updatedAt = new Date().toISOString();
    cursor.currentShard = `shard_${lastShardId}.json`;
    fs.writeFileSync(CURSOR_PATH, JSON.stringify(cursor, null, 2), 'utf8');

    if (cursor.nextIndex % 60 < CONCURRENCY || cursor.nextIndex === endIdx) {
      console.log(`[BGG 3-Stage Harvester] Checkpointed ${cursor.nextIndex} / ${games.length} games (Shard: shard_${lastShardId}.json)`);
    }
    await new Promise((r) => setTimeout(r, 40));
  }

  console.log('[BGG 3-Stage Harvester] Run complete!');
}

main().catch((err) => console.error('[BGG 3-Stage Harvester Error]', err));
