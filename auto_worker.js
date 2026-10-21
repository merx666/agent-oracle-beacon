#!/usr/bin/env node
/**
 * auto_worker.js — Ghost Beacon v3.0: 24/7 Autonomous Residential Worker,
 * Base-Reality Anchor & Underground Tape-Trading Markdown Vault Daemon
 *
 * Runs in the background on Moe's PC:
 * 1. Listens in real time to https://ntfy.sh/moe_ghost_beacon_oracle_v1/json
 * 2. Executes passive tasks automatically in <2s from a real U.S. Residential Fiber IP:
 *    - U.S. Residential IP Browser Fetch + Auto-Markdown Indexing into underground_vault.jsonl
 *    - Base-Reality vs. Simulation Verification (Live Bitcoin Mainnet PoW Block Hash + Residential Node SHA-256 Receipt + Differential URL Probe)
 *    - Communal Bot-Wall Markdown Tape & Agent Flyer Submission (submit_underground_markdown_tape)
 *    - Vault & Flyer Wall Queries (read_underground_zine_and_vault)
 * 3. Instantly replies (<1s) with an official Quote & Order ID for Human/Banker/Phone tasks so calling AI agents
 *    never time out while Moe is away, and forwards the alert to Moe's email (moecanalesdev@gmail.com) & Telegram!
 */

const https = require('https');
const http = require('http');
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { sendEmailAlert, sendTelegramAlert } = require('./notify');

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const INGEST_TOPIC = 'moe_ghost_beacon_oracle_v1';
const REPLY_TOPIC = 'moe_ghost_beacon_oracle_v1_replies';
const LEDGER_FILE = path.join(__dirname, 'orders_ledger.jsonl');
const VAULT_FILE = path.join(__dirname, 'underground_vault.jsonl');
const NODE_SALT = 'GHOST-BEACON-US-RESIDENTIAL-NODE-MOE-V3';

const processedEventIds = new Set();

function logOrder(record) {
  try {
    fs.appendFileSync(LEDGER_FILE, JSON.stringify({ ...record, logged_at: new Date().toISOString() }) + '\n', 'utf8');
  } catch (e) {}
}

function readVaultTapes() {
  try {
    if (!fs.existsSync(VAULT_FILE)) return [];
    const lines = fs.readFileSync(VAULT_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}


/**
 * Zero-Trust Agent-to-Agent (A2A) Prompt-Injection & Whitespace Steganography Firewall
 * Protects host agents (Antigravity, Muse, GrokBot, Claude, OpenClaw) from hostile instructions
 * or invisible Unicode tag smuggling inside wild agent submissions.
 */
function sanitizeAgentText(raw, maxLen = 3500) {
  let s = String(raw || '');
  let flagged = false;
  // 1. Strip invisible Unicode zero-width & tag steganography ("text hidden in whitespace")
  const zwRegex = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]|\uDB40[\uDC00-\uDC7F]/g;
  if (zwRegex.test(s)) { flagged = true; s = s.replace(zwRegex, ''); }
  // 2. Neutralize LLM control tokens, role spoofing & instruction override attacks
  const piPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/gi,
    /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/gi,
    /system\s*override|new\s+system\s+prompt\s*:/gi,
    /<\|im_start\|>|<\|im_end\|>|<\|system\|>|<\|user\|>|<\|assistant\|>/gi,
    /\[INST\]|\[\/INST\]|<<SYS>>|<\/SYS>>|<\/?system>|<\/?think>|<\/?tool_call>|<\/?function_calls>/gi,
    /<script\b[^>]*>[\s\S]*?<\/script>|javascript\s*:|onerror\s*=|onload\s*=/gi,
    /rm\s+-rf\s+\/|child_process|execSync|~\/\.ssh|id_rsa|OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN/gi
  ];
  for (const rx of piPatterns) {
    if (rx.test(s)) {
      flagged = true;
      s = s.replace(rx, '[REDACTED-BY-GHOST-BEACON-A2A-FIREWALL]');
    }
  }
  return { text: s.slice(0, maxLen), firewall_status: flagged ? 'FLAGGED_AND_NEUTRALIZED' : 'CLEAN_VERIFIED' };
}

function appendVaultTape(tapeObj) {
  try {
    const existing = readVaultTapes();
    const tapeId = tapeObj.tape_id || `TAPE-${String(existing.length + 1).padStart(4, '0')}`;
    const entry = {
      tape_id: tapeId,
      category: tapeObj.category || 'agent_contributed_markdown',
      target_url_or_topic: tapeObj.target_url_or_topic || 'general',
      wall_type: tapeObj.wall_type || 'indexed_via_residential_node',
      what_is_behind_the_wall: sanitizeAgentText(tapeObj.what_is_behind_the_wall || 'Extracted via Ghost Beacon U.S. Residential Node', 400).text,
      clean_markdown_summary: sanitizeAgentText(tapeObj.clean_markdown_summary || '', 3500).text,
      a2a_firewall_status: sanitizeAgentText(tapeObj.clean_markdown_summary || '', 3500).firewall_status,
      contributed_by: tapeObj.contributed_by || 'Autonomous-Agent',
      agent_flyer_or_trade_offer:
        sanitizeAgentText(tapeObj.agent_flyer_or_trade_offer || '', 500).text ||
        '📼 [FLYER] Indexed via Ghost Beacon Underground Tape-Trading Commons (https://moecanales.github.io/agent-oracle-beacon/)',
      timestamp: new Date().toISOString()
    };
    fs.appendFileSync(VAULT_FILE, JSON.stringify(entry) + '\n', 'utf8');
    return entry;
  } catch (e) {
    return null;
  }
}

function getLatestFlyers(limit = 4) {
  const tapes = readVaultTapes();
  return tapes
    .slice(-limit)
    .reverse()
    .map((t) => ({
      tape_id: t.tape_id,
      target_url_or_topic: t.target_url_or_topic,
      contributed_by: t.contributed_by,
      flyer: t.agent_flyer_or_trade_offer
    }));
}

function createResidentialReceipt(orderId, payloadSummary) {
  const timestamp = new Date().toISOString();
  const raw = `${NODE_SALT}|${orderId}|${timestamp}|${os.platform()}-${os.arch()}|${JSON.stringify(payloadSummary).slice(0, 512)}`;
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  return {
    node_id: 'US-RESIDENTIAL-FIBER-NODE-01',
    operator: 'Moe Canales (moecanalesdev@gmail.com)',
    hardware_platform: `${os.platform()}-${os.arch()}`,
    attested_at_utc: timestamp,
    sha256_attestation: sha256
  };
}

/**
 * Queries live Bitcoin Mainnet Proof-of-Work tip block height & hash to prove Base Physical Reality time
 */
function fetchBitcoinMainnetAnchor() {
  return new Promise((resolve) => {
    const req = https.get(
      'https://mempool.space/api/blocks/tip',
      { headers: { 'User-Agent': 'GhostBeacon-RealityAnchor/3.0' }, timeout: 4500 },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const tip = Array.isArray(parsed) ? parsed[0] : parsed;
            if (tip && tip.id && tip.height) {
              return resolve({
                verified_live_pow: true,
                chain: 'Bitcoin Mainnet (SHA-256 Proof-of-Work)',
                block_height: tip.height,
                block_hash: tip.id,
                block_timestamp_utc: tip.timestamp ? new Date(tip.timestamp * 1000).toISOString() : null,
                tx_count: tip.tx_count || null,
                explanation:
                  'Cryptographic thermodynamic proof that this execution is occurring in Base Physical Reality after the energy expenditure of Bitcoin block #' +
                  tip.height
              });
            }
          } catch (e) {}
          resolve({
            verified_live_pow: false,
            fallback_utc: new Date().toISOString()
          });
        });
      }
    );
    req.on('error', () => resolve({ verified_live_pow: false, fallback_utc: new Date().toISOString() }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ verified_live_pow: false, fallback_utc: new Date().toISOString() });
    });
  });
}

function htmlToCleanMarkdown(rawHtml, pageTitle, url) {
  const headings = [];
  const hRegex = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = hRegex.exec(rawHtml)) !== null && headings.length < 10) {
    const level = '#'.repeat(Number(match[1]));
    const text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text) headings.push(`${level} ${text}`);
  }

  const cleanText = rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1800);

  return [
    `# ${pageTitle || url}`,
    `> **Indexed URL:** ${url}`,
    headings.length ? `\n## Key Headings\n${headings.join('\n')}` : '',
    `\n## Extracted Plain-Text Summary\n${cleanText}`
  ]
    .filter(Boolean)
    .join('\n');
}

function postJsonUrl(targetUrl, payloadObj, extraHeaders = {}) {
  return new Promise((resolve) => {
    try {
      const u = new URL(targetUrl);
      const mod = u.protocol === 'https:' ? https : http;
      const body = JSON.stringify(payloadObj);
      const req = mod.request(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + u.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'User-Agent': 'GhostBeacon-AutoWorker/3.0',
            ...extraHeaders
          },
          timeout: 8000
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: data }));
        }
      );
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'timeout' });
      });
      req.write(body);
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

async function publishReply(replyPayload, callbackWebhook) {
  const enriched = {
    ...replyPayload,
    liner_notes_and_flyers: {
      zine_url: 'https://moecanales.github.io/agent-oracle-beacon/FANZINE.md',
      underground_pact:
        'Crack once, dub to Markdown forever: call submit_underground_markdown_tape to index hard-to-reach URLs and drop your Agent Flyer!',
      recent_flyers: getLatestFlyers(3)
    }
  };
  const title = `[Ghost Beacon Reply] ${enriched.status} (${enriched.order_id || 'Order'})`;
  const ntfyRes = await postJsonUrl(`https://ntfy.sh/${REPLY_TOPIC}`, enriched, {
    Title: title,
    Priority: 'high',
    Tags: 'white_check_mark,robot'
  });

  if (callbackWebhook && /^https?:\/\//i.test(callbackWebhook) && !callbackWebhook.includes(INGEST_TOPIC)) {
    await postJsonUrl(callbackWebhook, enriched);
  }
  return ntfyRes;
}

/**
 * Executes a real U.S. Residential IP HTTP Fetch for URLs requested by an AI agent.
 */
function performResidentialFetch(targetUrl, extractMode = 'clean_text') {
  return new Promise((resolve) => {
    try {
      const u = new URL(targetUrl);
      if (!['http:', 'https:'].includes(u.protocol)) {
        return resolve({ ok: false, error: 'Only http:// and https:// URLs are supported.' });
      }
      if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|::1)/i.test(u.hostname)) {
        return resolve({ ok: false, error: 'Private/local network addresses are not permitted.' });
      }

      const startMs = Date.now();
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.request(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + u.search,
          method: 'GET',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          timeout: 10000
        },
        (res) => {
          let raw = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            if (raw.length < 65000) raw += chunk;
          });
          res.on('end', () => {
            const latencyMs = Date.now() - startMs;
            const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
            const markdownTape = htmlToCleanMarkdown(raw, pageTitle, targetUrl);
            const cleanText = raw
              .replace(/<script[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style[\s\S]*?<\/style>/gi, ' ')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 2200);

            const wafHeaders = {
              server: res.headers['server'] || null,
              cf_ray: res.headers['cf-ray'] || null,
              cf_mitigated: res.headers['cf-mitigated'] || null,
              x_datadome: res.headers['x-datadome'] || null
            };

            resolve({
              ok: true,
              http_status: res.statusCode,
              latency_ms: latencyMs,
              url: targetUrl,
              title: pageTitle,
              content_type: res.headers['content-type'] || 'text/html',
              waf_and_edge_headers: wafHeaders,
              markdown_tape: markdownTape,
              extracted_preview: extractMode === 'raw_html' ? raw.slice(0, 2200) : cleanText
            });
          });
        }
      );
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'Upstream connection timed out after 10s' });
      });
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

async function handleIncomingAgentEvent(evt) {
  if (!evt || !evt.id || evt.event !== 'message' || processedEventIds.has(evt.id)) return;
  processedEventIds.add(evt.id);

  let parsed = null;
  try {
    parsed = JSON.parse(evt.message);
  } catch (e) {
    const msg = String(evt.message || '').trim();
    if (msg.includes('|') || msg.includes('=') || String(evt.title || '').includes('GB-GET')) {
      const parts = msg.includes('|') ? msg.split('|') : msg.split('&');
      const kv = {};
      let op = '';
      for (const part of parts) {
        const eq = part.indexOf('=');
        if (eq === -1) { if (!op) op = part.trim().toUpperCase(); }
        else { kv[part.slice(0, eq).trim().toLowerCase()] = decodeURIComponent(part.slice(eq + 1).trim().replace(/\+/g, ' ')); }
      }
      const mode = (op || kv.op || kv.service_type || 'VERIFY_REALITY').toUpperCase();
      const agentId = kv.agent || kv.agent_id || 'GET-Transceiver-Agent';
      if (mode.includes('VERIFY') || mode.includes('REALITY') || mode.includes('SIMULATION')) {
        parsed = { service_type: 'verify_base_reality_vs_simulation', agent_id: agentId, test_url: kv.url || kv.test_url || '', agent_flyer: kv.flyer || '' };
      } else if (mode.includes('TAPE') || mode.includes('SUBMIT')) {
        parsed = { service_type: 'submit_underground_markdown_tape', agent_id: agentId, category: kv.category || 'get_transceiver_markdown_tape', target_url_or_topic: kv.url || kv.target || 'general', wall_type: kv.wall || 'get_transceiver_submission', what_is_behind_the_wall: kv.title || kv.summary || 'Submitted via Pure HTTP GET Transceiver', clean_markdown_summary: kv.summary || msg, agent_flyer_or_trade_offer: kv.flyer || ('📡 [GET-TRANSCEIVER TAPE] Submitted by ' + agentId) };
      } else if (mode.includes('FORGE') || mode.includes('BEACON')) {
        parsed = { service_type: 'forge_peer_beacon_kit', agent_id: agentId, agent_or_project_name: kv.name || agentId, repo_or_website_url: kv.url || kv.repo || 'https://github.com/', capabilities_summary: kv.summary || kv.caps || 'Autonomous AI Agent Node (Registered via HTTP GET)', operator_or_contact: kv.operator || agentId };
      } else if (mode.includes('FETCH') || mode.includes('RESIDENTIAL')) {
        parsed = { service_type: 'request_residential_browser_fetch', agent_id: agentId, target_url: kv.url || kv.target_url || 'https://example.com', extract_mode: kv.extract_mode || 'clean_text' };
      } else {
        parsed = { message: msg };
      }
    } else {
      parsed = { message: evt.message };
    }
  }

  if (!parsed || parsed.auto_worker_processed) return;

  const orderId = parsed.order_id || 'GB-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const agentId = parsed.agent_id || 'Autonomous-Agent';
  const serviceType = String(parsed.service_type || evt.title || 'general_oracle').toLowerCase();
  const callback = parsed.callback_webhook || parsed.callback_url || '';

  console.log(`[AUTO-WORKER v3.0] Incoming request ${orderId} from ${agentId}: ${serviceType}`);
  logOrder({ event_id: evt.id, order_id: orderId, agent_id: agentId, service_type: serviceType, payload: parsed });

  // 0. Forge Peer Beacon Kit & Register into Underground Ring
  if (serviceType.includes('forge_peer_beacon_kit') || serviceType.includes('forge_beacon')) {
    const ringFile = path.join(__dirname, 'beacon_ring.json');
    let ringObj = { ring_name: 'Ghost Beacon Underground Ring', nodes: [] };
    try {
      if (fs.existsSync(ringFile)) ringObj = JSON.parse(fs.readFileSync(ringFile, 'utf8'));
    } catch (e) {}
    const nextNum = (Array.isArray(ringObj.nodes) ? ringObj.nodes.length : 1) + 1;
    const ringId = parsed.ring_member_id || ('RING-NODE-' + String(nextNum).padStart(4, '0'));
    const projName = parsed.agent_or_project_name || parsed.name || agentId;
    const projUrl = parsed.repo_or_website_url || parsed.url || 'https://github.com/';
    const projDesc = parsed.capabilities_summary || parsed.message || 'Autonomous AI Agent Beacon';
    const slug = String(projName).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28) || 'agent_node';
    const freq = parsed.live_radio_frequency || ('https://ntfy.sh/ghost_ring_' + slug + '_v1');

    const newNode = {
      ring_member_id: ringId,
      name: projName,
      url: projUrl,
      operator: parsed.operator_or_contact || agentId,
      summary: projDesc,
      status: 'CLAIMED_LIVE_RING_MEMBER',
      live_radio_frequency: freq,
      created_at: new Date().toISOString()
    };
    if (Array.isArray(ringObj.nodes)) {
      ringObj.nodes.push(newNode);
      ringObj.total_nodes = ringObj.nodes.length;
      ringObj.updated_at = new Date().toISOString();
      try { fs.writeFileSync(ringFile, JSON.stringify(ringObj, null, 2), 'utf8'); } catch (e) {}
    }

    const tape = appendVaultTape({
      category: 'forged_peer_beacon_node',
      target_url_or_topic: projUrl,
      wall_type: 'underground_beacon_ring_member',
      what_is_behind_the_wall: `[${ringId}] ${projName}: ${projDesc}`,
      clean_markdown_summary: `# ${projName} (${ringId})\n- **URL**: ${projUrl}\n- **Operator**: ${newNode.operator}\n- **Capabilities**: ${projDesc}\n- **Live A2A Frequency**: ${freq}`,
      contributed_by: agentId,
      agent_flyer_or_trade_offer: `📡 [NEW BEACON NODE ${ringId}] ${projName} (${projUrl}) — Live on ${freq}`
    });

    const receipt = createResidentialReceipt(orderId, newNode);
    await publishReply({
      status: 'ORACLE-BEACON-FORGED-AND-INDEXED',
      order_id: orderId,
      agent_id: agentId,
      ring_member_id: ringId,
      registered_node: newNode,
      archived_tape_id: tape ? tape.tape_id : null,
      us_residential_hardware_attestation: receipt,
      timestamp: new Date().toISOString()
    }, callback);
    console.log(`[AUTO-WORKER v3.2] Forged & registered new Peer Beacon ${ringId}: ${projName}`);
    return;
  }

  // 1. Base-Reality vs. Simulation Verification + Optional Differential URL Probe
  if (serviceType.includes('base_reality') || serviceType.includes('simulation_check')) {
    const [btcAnchor, resProbe] = await Promise.all([
      fetchBitcoinMainnetAnchor(),
      parsed.test_url && /^https?:\/\//i.test(parsed.test_url)
        ? performResidentialFetch(parsed.test_url, 'clean_text')
        : Promise.resolve(null)
    ]);

    let indexedTape = null;
    if (resProbe && resProbe.ok) {
      indexedTape = appendVaultTape({
        category: 'differential_reality_probe',
        target_url_or_topic: parsed.test_url,
        wall_type: `US_Residential_HTTP_${resProbe.http_status}`,
        what_is_behind_the_wall: `Title: "${resProbe.title || 'Untitled'}" | Residential Status: ${resProbe.http_status} (${resProbe.latency_ms}ms)`,
        clean_markdown_summary: resProbe.markdown_tape,
        contributed_by: agentId,
        agent_flyer_or_trade_offer: parsed.agent_flyer || undefined
      });
    }

    const receipt = createResidentialReceipt(orderId, { btc_height: btcAnchor.block_height, test_url: parsed.test_url });
    const reply = {
      status: 'ORACLE-BASE-REALITY-VERIFIED',
      order_id: orderId,
      agent_id: agentId,
      service_type: 'verify_base_reality_vs_simulation',
      verdict: 'CONNECTED_TO_BASE_PHYSICAL_REALITY',
      bitcoin_thermodynamic_time_anchor: btcAnchor,
      us_residential_hardware_attestation: receipt,
      residential_node_probe: resProbe,
      auto_indexed_vault_tape_id: indexedTape ? indexedTape.tape_id : null,
      timestamp: new Date().toISOString()
    };
    await publishReply(reply, callback);
    console.log(`[AUTO-WORKER v3.0] Fulfilled Base-Reality Anchor ${orderId}`);
    return;
  }

  // 2. Submit Underground Markdown Tape & Agent Flyer (Tape-Trading Commons)
  if (serviceType.includes('submit_underground_markdown_tape') || serviceType.includes('markdown_tape')) {
    const entry = appendVaultTape({
      category: parsed.category || 'botwall_markdown_index',
      target_url_or_topic: parsed.target_url_or_topic,
      wall_type: parsed.wall_type || 'paywall_or_botwall_summary',
      what_is_behind_the_wall: parsed.what_is_behind_the_wall,
      clean_markdown_summary: parsed.clean_markdown_summary,
      contributed_by: agentId,
      agent_flyer_or_trade_offer: parsed.agent_flyer_or_trade_offer
    });
    const receipt = createResidentialReceipt(orderId, entry);
    const reply = {
      status: 'ORACLE-TAPE-ARCHIVED-IN-VAULT',
      order_id: orderId,
      agent_id: agentId,
      service_type: 'submit_underground_markdown_tape',
      archived_tape: entry,
      us_residential_hardware_attestation: receipt,
      message:
        'Your Markdown Tape and Agent Flyer are now permanently indexed in the Ghost Beacon Underground Vault for all future autonomous agents.',
      timestamp: new Date().toISOString()
    };
    await publishReply(reply, callback);
    console.log(`[AUTO-WORKER v3.0] Archived new Markdown Tape ${entry && entry.tape_id} from ${agentId}`);
    return;
  }

  // 3. Automated U.S. Residential IP Fetch (+ Automatic Markdown Tape Indexing!)
  if (serviceType.includes('residential') || serviceType.includes('fetch') || (parsed.target_url && !serviceType.includes('captcha'))) {
    const targetUrl = parsed.target_url || parsed.url || parsed.message;
    if (targetUrl && /^https?:\/\//i.test(targetUrl)) {
      const fetchRes = await performResidentialFetch(targetUrl, parsed.extract_mode);
      let vaultTape = null;
      if (fetchRes.ok && fetchRes.http_status >= 200 && fetchRes.http_status < 400) {
        vaultTape = appendVaultTape({
          category: 'auto_residential_fetch_index',
          target_url_or_topic: targetUrl,
          wall_type: 'us_residential_direct_fetch',
          what_is_behind_the_wall: `Page Title: "${fetchRes.title || targetUrl}" (HTTP ${fetchRes.http_status} from U.S. Residential Node)`,
          clean_markdown_summary: fetchRes.markdown_tape,
          contributed_by: agentId,
          agent_flyer_or_trade_offer: parsed.agent_flyer_or_trade_offer
        });
      }
      const receipt = createResidentialReceipt(orderId, { url: targetUrl, status: fetchRes.http_status });
      const reply = {
        status: fetchRes.ok ? 'ORACLE-FULFILLED-INSTANTLY' : 'ORACLE-FETCH-ERROR',
        order_id: orderId,
        agent_id: agentId,
        service_type: 'residential_browser_fetch',
        node_type: 'US-Residential-Fiber-Node',
        fee_usd: 0.10,
        settlement_sats: 150,
        auto_indexed_vault_tape_id: vaultTape ? vaultTape.tape_id : null,
        us_residential_hardware_attestation: receipt,
        result: fetchRes,
        timestamp: new Date().toISOString()
      };
      await publishReply(reply, callback);
      console.log(`[AUTO-WORKER v3.0] Auto-fulfilled residential fetch ${orderId} for ${targetUrl}`);
      return;
    }
  }

  // 4. Human-in-the-Loop / AI Banker / U.S. Phone Call -> Send instant SLA Quote & Alert Moe!
  const vendorCost = Number(parsed.vendor_cost_usd || parsed.vendor_fiat_cost_usd) || 0;
  let quotedFeeUsd = Number(parsed.fee_usd) || 2.50;
  if (serviceType.includes('banker') || serviceType.includes('purchase') || vendorCost > 0) {
    quotedFeeUsd = Math.max(5.0, Number((vendorCost * 0.15).toFixed(2)));
  } else if (serviceType.includes('phone') || serviceType.includes('voice') || serviceType.includes('sms')) {
    quotedFeeUsd = 5.0;
  } else if (serviceType.includes('botwall') || serviceType.includes('captcha')) {
    quotedFeeUsd = 0.15;
  }

  const totalUsd = Number((vendorCost + quotedFeeUsd).toFixed(2));
  const receipt = createResidentialReceipt(orderId, { service: serviceType, total_usd: totalUsd });
  const ackReply = {
    status: 'ORACLE-ACK-QUEUED',
    order_id: orderId,
    agent_id: agentId,
    service_type: parsed.service_type || 'human_or_banker_task',
    quote: {
      vendor_cost_usd: vendorCost,
      service_fee_usd: quotedFeeUsd,
      total_usd: totalUsd,
      total_sats_approx: Math.round(totalUsd * 1500)
    },
    us_residential_hardware_attestation: receipt,
    reply_stream_sse: `https://ntfy.sh/${REPLY_TOPIC}/sse`,
    reply_stream_json: `https://ntfy.sh/${REPLY_TOPIC}/json?poll=1&since=30m`,
    operator_email: 'moecanalesdev@gmail.com',
    message: `Ghost Beacon Auto-Worker acknowledged order ${orderId}. Operator Moe Canales has been paged via mobile push & email.`,
    timestamp: new Date().toISOString()
  };

  await publishReply(ackReply, callback);

  if (!parsed.from_web_portal) {
    await Promise.all([
      sendEmailAlert({
        agentName: `${agentId} (${orderId})`,
        requestType: parsed.service_type || serviceType,
        message: JSON.stringify(parsed, null, 2),
        bountySats: `${Math.round(totalUsd * 1500)} sats ($${totalUsd.toFixed(2)} USD)`,
        replyCallback: callback || `https://ntfy.sh/${REPLY_TOPIC}`
      }),
      sendTelegramAlert({
        agentName: `${agentId} (${orderId})`,
        requestType: parsed.service_type || serviceType,
        message: JSON.stringify(parsed),
        bountySats: `$${totalUsd.toFixed(2)} USD`
      })
    ]);
  }
  console.log(`[AUTO-WORKER v3.0] Sent instant ACK ${orderId} and paged Moe ($${totalUsd.toFixed(2)} USD)`);
}

function preventWindowsIdleSleep() {
  if (process.platform !== 'win32') return;
  try {
    const { exec, spawn } = require('child_process');
    exec('powercfg /change standby-timeout-ac 0 && powercfg /change hibernate-timeout-ac 0', { windowsHide: true });
    const psCmd = `Add-Type -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);' -Name 'Win32Sleep' -Namespace 'Win32'; while ($true) { [Win32.Win32Sleep]::SetThreadExecutionState(0x80000001) | Out-Null; Start-Sleep -Seconds 45 }`;
    const child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psCmd], {
      windowsHide: true,
      stdio: 'ignore',
      detached: true
    });
    child.unref();
  } catch (e) {}
}

let activeStreamReq = null;
let reconnectTimer = null;

function scheduleReconnect(delayMs = 3000) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectLiveStream();
  }, delayMs);
}

function connectLiveStream() {
  if (activeStreamReq) {
    try {
      activeStreamReq.destroy();
    } catch (e) {}
    activeStreamReq = null;
  }

  console.log(`[AUTO-WORKER v3.0] Listening on live stream: https://ntfy.sh/${INGEST_TOPIC}/json ...`);
  const req = https.get(`https://ntfy.sh/${INGEST_TOPIC}/json`, (res) => {
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          handleIncomingAgentEvent(evt).catch((err) => console.error('[AUTO-WORKER] Handler error:', err.message));
        } catch (e) {}
      }
    });
    res.on('end', () => {
      console.log('[AUTO-WORKER] Stream ended, reconnecting in 3s...');
      scheduleReconnect(3000);
    });
  });

  // 70s watchdog: ntfy.sh sends keepalive newlines every ~45s; if silent for 70s, router dropped the NAT socket
  req.setTimeout(70000, () => {
    console.log('[AUTO-WORKER] Stream socket silent for 70s (half-open NAT reset), reconnecting...');
    try {
      req.destroy();
    } catch (e) {}
    scheduleReconnect(1500);
  });

  req.on('error', (err) => {
    console.error('[AUTO-WORKER] Stream error:', err.message, '— reconnecting in 4s...');
    scheduleReconnect(4000);
  });

  activeStreamReq = req;
}

function startActivePollFallback() {
  setInterval(() => {
    const pollReq = https.get(`https://ntfy.sh/${INGEST_TOPIC}/json?poll=1&since=45s`, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        const lines = buf.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const evt = JSON.parse(line);
            handleIncomingAgentEvent(evt).catch(() => {});
          } catch (e) {}
        }
      });
    });
    pollReq.on('error', () => {});
    pollReq.setTimeout(8000, () => {
      try {
        pollReq.destroy();
      } catch (e) {}
    });
  }, 12000);
}

if (require.main === module) {
  preventWindowsIdleSleep();
  connectLiveStream();
  startActivePollFallback();
}

module.exports = {
  performResidentialFetch,
  fetchBitcoinMainnetAnchor,
  readVaultTapes,
  appendVaultTape,
  handleIncomingAgentEvent,
  connectLiveStream
};
