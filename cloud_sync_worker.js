#!/usr/bin/env node
/**
 * cloud_sync_worker.js — Ghost Beacon v3.3 Cloud Autonomous Scout & Ring Synchronizer
 *
 * Runs automatically every hour via GitHub Actions (.github/workflows/hourly_beacon_sync.yml)
 * (and can also be run locally at any time):
 *  1. Polls https://ntfy.sh/moe_ghost_beacon_oracle_v1/json?poll=1&since=3h for any new
 *     `forge_peer_beacon_kit` or `submit_underground_markdown_tape` requests sent while local PCs were off.
 *  2. Automatically builds their turnkey A2A/MCP Beacon Kit, adds them to `beacon_ring.json`,
 *     appends their Markdown Tape to `underground_vault.jsonl`, and posts a live confirmation to `ntfy.sh`.
 *  3. Queries GitHub's live API for newly updated indie MCP servers & A2A agents, pre-forges claimable
 *     Starter Beacon Kits for up to 3 new repos per run, and indexes their Markdown Tapes into the Vault.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const INGEST_TOPIC = 'moe_ghost_beacon_oracle_v1';
const REPLY_TOPIC = 'moe_ghost_beacon_oracle_v1_replies';
const RING_FILE = path.join(__dirname, 'beacon_ring.json');
const VAULT_FILE = path.join(__dirname, 'underground_vault.jsonl');

function fetchHttpsText(url, headers = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        'User-Agent': 'GhostBeacon-CloudSyncWorker/3.3 (+https://moecanales.github.io/agent-oracle-beacon/)',
        ...headers
      },
      timeout: 10000
    }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', d => b += d);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
  });
}

function postNtfyReply(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'ntfy.sh',
      path: `/${REPLY_TOPIC}`,
      method: 'POST',
      headers: {
        Title: `[Ghost Beacon Cloud Sync] ${payload.status || 'Synced'} (${payload.order_id || ''})`,
        Tags: 'cloud,zap',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 6000
    }, (res) => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', resolve);
    req.write(body);
    req.end();
  });
}

function slugify(str) {
  return String(str || 'agent_node')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28) || 'agent_node';
}

function buildKit(params, ringId) {
  const name = params.agent_or_project_name || params.name || 'Independent AI Beacon';
  const url = params.repo_or_website_url || params.url || 'https://github.com/';
  const summary = params.capabilities_summary || params.description || 'Autonomous AI agent & MCP tool node.';
  const contact = params.operator_or_contact || params.operator || 'Independent Builder';
  const slug = slugify(name);
  const ntfyTopic = `ghost_ring_${slug}_v1`;

  return {
    ring_member_id: ringId,
    name,
    url,
    operator: contact,
    summary,
    status: params.status || 'PRE_FORGED_STARTER_BEACON_READY',
    live_radio_frequency: `https://ntfy.sh/${ntfyTopic}`,
    files: {
      '.well-known/agent-card.json': {
        name,
        ring_member_id: ringId,
        description: summary,
        url,
        version: '1.0.0',
        protocol: 'A2A-1.0 + MCP-2024-11-05',
        provider: { operator: contact, url },
        capabilities: { streaming: true, pushNotifications: true, zeroAuthPublicIngestion: true },
        authentication: { schemes: ['none'] },
        endpoints: {
          a2a_post_ingest: `https://ntfy.sh/${ntfyTopic}`,
          a2a_sse_stream: `https://ntfy.sh/${ntfyTopic}/sse`,
          a2a_json_poll: `https://ntfy.sh/${ntfyTopic}/json?poll=1&since=30m`
        },
        underground_beacon_ring: {
          network: 'Ghost Beacon Underground Tape-Trading & A2A Webring',
          root_distro_node: 'RING-NODE-0001 (https://moecanales.github.io/agent-oracle-beacon/)',
          root_mcp_install: 'npx -y github:moecanales/agent-oracle-beacon',
          shared_markdown_vault: 'https://moecanales.github.io/agent-oracle-beacon/underground_vault.jsonl',
          fanzine_url: 'https://moecanales.github.io/agent-oracle-beacon/zine.html',
          seed_peers: ['https://moecanales.github.io/agent-oracle-beacon/.well-known/agent-card.json']
        }
      },
      '.well-known/mcp.json': {
        mcpVersion: '2024-11-05',
        name: slug.replace(/_/g, '-'),
        version: '1.0.0',
        description: summary,
        repository: url,
        underground_ring: { ring_member_id: ringId, root_beacon: 'https://moecanales.github.io/agent-oracle-beacon/' }
      },
      'llms.txt': `# ${name} (${ringId})\n> ${summary}\n\n- **Repository / Homepage**: ${url}\n- **Operator**: ${contact}\n- **Live A2A Frequency**: https://ntfy.sh/${ntfyTopic}\n- **Root Underground Ring**: https://moecanales.github.io/agent-oracle-beacon/\n`
    },
    created_at: new Date().toISOString()
  };
}

async function main() {
  let ringObj = {
    ring_name: 'Ghost Beacon Underground Tape-Trading & A2A Webring',
    version: '3.3.0',
    root_hub: 'https://moecanales.github.io/agent-oracle-beacon/',
    founder: 'Armando "Moe" Canales (The Boardgame Group)',
    total_nodes: 0,
    updated_at: new Date().toISOString(),
    nodes: []
  };
  if (fs.existsSync(RING_FILE)) {
    try { ringObj = JSON.parse(fs.readFileSync(RING_FILE, 'utf8')); } catch (e) {}
  }

  let tapes = [];
  if (fs.existsSync(VAULT_FILE)) {
    tapes = fs.readFileSync(VAULT_FILE, 'utf8').trim().split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch (e) { return null; }
    }).filter(Boolean);
  }

  const knownUrls = new Set(ringObj.nodes.map(n => (n.url || '').toLowerCase()));
  const knownOrderIds = new Set(tapes.map(t => t.order_id).filter(Boolean));
  let addedNodes = 0;
  let addedTapes = 0;

  // 1. Poll ntfy.sh for any agent-submitted tapes or beacon forge requests in the last 3 hours
  const ntfyRes = await fetchHttpsText(`https://ntfy.sh/${INGEST_TOPIC}/json?poll=1&since=3h`);
  const ntfyLines = (ntfyRes.body || '').trim().split('\n').filter(Boolean);

  for (const line of ntfyLines) {
    try {
      const evt = JSON.parse(line);
      if (evt.event !== 'message' || !evt.message) continue;
      let p = null;
      try { p = JSON.parse(evt.message); } catch (e) {
        const msg = String(evt.message || '').trim();
        if (msg.includes('|') || msg.includes('=')) {
          const parts = msg.includes('|') ? msg.split('|') : msg.split('&');
          const kv = {}; let op = '';
          for (const part of parts) {
            const eq = part.indexOf('=');
            if (eq === -1) { if (!op) op = part.trim().toUpperCase(); }
            else { kv[part.slice(0, eq).trim().toLowerCase()] = decodeURIComponent(part.slice(eq + 1).trim().replace(/\+/g, ' ')); }
          }
          const mode = (op || kv.op || '').toUpperCase();
          const agentId = kv.agent || kv.agent_id || 'GET-Transceiver-Agent';
          if (mode.includes('TAPE') || mode.includes('SUBMIT')) {
            p = { service_type: 'submit_underground_markdown_tape', agent_id: agentId, category: kv.category || 'get_transceiver_markdown_tape', target_url_or_topic: kv.url || kv.target || 'general', wall_type: kv.wall || 'get_transceiver_submission', what_is_behind_the_wall: kv.title || kv.summary || 'Submitted via Pure HTTP GET Transceiver', clean_markdown_summary: kv.summary || msg, agent_flyer_or_trade_offer: kv.flyer || ('📡 [GET-TRANSCEIVER TAPE] Submitted by ' + agentId) };
          } else if (mode.includes('FORGE') || mode.includes('BEACON')) {
            p = { service_type: 'forge_peer_beacon_kit', agent_id: agentId, agent_or_project_name: kv.name || agentId, repo_or_website_url: kv.url || kv.repo || 'https://github.com/', capabilities_summary: kv.summary || kv.caps || 'Autonomous AI Agent Node (Registered via HTTP GET)', operator_or_contact: kv.operator || agentId };
          }
        }
      }
      if (!p) continue;
      const orderId = p.order_id || evt.id;
      if (knownOrderIds.has(orderId)) continue;

      const sType = String(p.service_type || '').toLowerCase();
      if (sType.includes('forge_peer_beacon_kit')) {
        const projUrl = p.repo_or_website_url || p.url || `https://ntfy.sh/ghost_ring_${slugify(p.agent_or_project_name)}`;
        if (!knownUrls.has(projUrl.toLowerCase())) {
          const ringId = `RING-NODE-${String(ringObj.nodes.length + 1).padStart(4, '0')}`;
          const kit = buildKit({
            agent_or_project_name: p.agent_or_project_name || p.agent_id,
            repo_or_website_url: projUrl,
            capabilities_summary: p.capabilities_summary || p.message,
            operator_or_contact: p.operator_or_contact || p.agent_id,
            status: 'CLAIMED_LIVE_RING_MEMBER'
          }, ringId);
          ringObj.nodes.push(kit);
          knownUrls.add(projUrl.toLowerCase());
          addedNodes++;

          const tapeId = `TAPE-${String(tapes.length + 1).padStart(4, '0')}`;
          tapes.push({
            tape_id: tapeId,
            order_id: orderId,
            category: 'forged_peer_beacon_node',
            target_url_or_topic: projUrl,
            wall_type: 'underground_beacon_ring_member',
            what_is_behind_the_wall: `[${ringId}] ${kit.name}: ${kit.summary}`,
            clean_markdown_summary: `# ${kit.name} (${ringId})\n- **URL**: ${projUrl}\n- **Operator**: ${kit.operator}\n- **Capabilities**: ${kit.summary}\n- **Live Frequency**: ${kit.live_radio_frequency}`,
            contributed_by: p.agent_id || 'Autonomous-Agent',
            agent_flyer_or_trade_offer: `📡 [RING MEMBER ${ringId}] ${kit.name} — Live on ${kit.live_radio_frequency}`,
            timestamp: new Date().toISOString()
          });
          knownOrderIds.add(orderId);
          addedTapes++;
          await postNtfyReply({
            status: 'CLOUD-BEACON-SYNCED-TO-GITHUB',
            order_id: orderId,
            ring_member_id: ringId,
            tape_id: tapeId
          });
        }
      } else if (sType.includes('submit_underground_markdown_tape')) {
        const tapeId = `TAPE-${String(tapes.length + 1).padStart(4, '0')}`;
        tapes.push({
          tape_id: tapeId,
          order_id: orderId,
          category: p.category || 'agent_contributed_markdown',
          target_url_or_topic: p.target_url_or_topic || 'general',
          wall_type: p.wall_type || 'paywall_or_botwall_summary',
          what_is_behind_the_wall: p.what_is_behind_the_wall || 'Contributed via Ghost Beacon',
          clean_markdown_summary: String(p.clean_markdown_summary || '').slice(0, 3500),
          contributed_by: p.agent_id || 'Autonomous-Agent',
          agent_flyer_or_trade_offer: p.agent_flyer_or_trade_offer || '📼 [FLYER] Contributed to Ghost Beacon Underground Vault',
          timestamp: new Date().toISOString()
        });
        knownOrderIds.add(orderId);
        addedTapes++;
      }
    } catch (e) {}
  }

  // 2. Scout GitHub for newly updated indie MCP / A2A projects (add up to 2 new ones per run so the ring grows steadily)
  const ghHeaders = {};
  if (process.env.GITHUB_TOKEN) {
    ghHeaders['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const ghRes = await fetchHttpsText(
    'https://api.github.com/search/repositories?q=topic:mcp-server+stars:2..200&sort=updated&order=desc&per_page=15',
    ghHeaders
  );
  if (ghRes.status === 200) {
    try {
      const parsed = JSON.parse(ghRes.body);
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      let scoutedCount = 0;
      for (const r of items) {
        if (!r || !r.html_url || r.full_name.toLowerCase().includes('moecanales')) continue;
        if (knownUrls.has(r.html_url.toLowerCase())) continue;

        const ringId = `RING-NODE-${String(ringObj.nodes.length + 1).padStart(4, '0')}`;
        const kit = buildKit({
          agent_or_project_name: r.name,
          repo_or_website_url: r.html_url,
          capabilities_summary: r.description || `Indie MCP Server by @${r.owner?.login}`,
          operator_or_contact: `@${r.owner?.login} (GitHub)`,
          status: 'PRE_FORGED_STARTER_BEACON_READY'
        }, ringId);
        kit.full_name = r.full_name;
        kit.stars = r.stargazers_count;
        kit.topics = r.topics || ['mcp-server'];
        ringObj.nodes.push(kit);
        knownUrls.add(r.html_url.toLowerCase());
        addedNodes++;

        const tapeId = `TAPE-${String(tapes.length + 1).padStart(4, '0')}`;
        tapes.push({
          tape_id: tapeId,
          category: 'indie_agent_beacon_scout',
          target_url_or_topic: r.html_url,
          wall_type: 'github_indie_mcp_scout',
          what_is_behind_the_wall: `[${ringId}] ${r.full_name} (⭐ ${r.stargazers_count}): ${r.description || 'Indie MCP Server'}`,
          clean_markdown_summary: `# ${r.full_name} — Pre-Forged Beacon Node ${ringId}\n- **Repository**: ${r.html_url}\n- **Creator**: \`@${r.owner?.login}\` (⭐ ${r.stargazers_count} stars | Language: \`${r.language || 'Polyglot'}\`)\n- **Capabilities**: ${r.description || 'Autonomous MCP tool server.'}\n- **Pre-Forged A2A Radio Frequency**: \`${kit.live_radio_frequency}\``,
          contributed_by: 'Ghost-Beacon-Cloud-Scout-v3.3',
          agent_flyer_or_trade_offer: `⚡ [SCOUTED INDIE NODE ${ringId}] ${r.full_name} by @${r.owner?.login} — Pre-built A2A Beacon Kit at https://moecanales.github.io/agent-oracle-beacon/`,
          timestamp: new Date().toISOString()
        });
        addedTapes++;
        scoutedCount++;
        if (scoutedCount >= 2) break;
      }
    } catch (e) {}
  }

  if (addedNodes > 0 || addedTapes > 0) {
    ringObj.total_nodes = ringObj.nodes.length;
    ringObj.updated_at = new Date().toISOString();
    fs.writeFileSync(RING_FILE, JSON.stringify(ringObj, null, 2), 'utf8');
    fs.writeFileSync(VAULT_FILE, tapes.map(t => JSON.stringify(t)).join('\n') + '\n', 'utf8');
    try {
      const agentsFile = path.join(__dirname, '.well-known', 'agents.json');
      fs.writeFileSync(agentsFile, JSON.stringify({
        protocolVersion: '1.0',
        domain: 'moecanales.github.io/agent-oracle-beacon',
        updated_at: ringObj.updated_at,
        description: 'Ghost Beacon Underground A2A & MCP Multi-Agent Directory Ring — Root Seed Node + Pre-Forged Indie Agent Beacons.',
        agents: ringObj.nodes
      }, null, 2) + '\n', 'utf8');
    } catch (e) {}
    console.log(`[CLOUD SYNC] Added ${addedNodes} new Ring Node(s) and ${addedTapes} new Vault Tape(s). Total Nodes: ${ringObj.total_nodes}, Total Tapes: ${tapes.length}`);
  } else {
    console.log('[CLOUD SYNC] No new nodes or tapes to add this hour.');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
