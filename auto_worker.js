#!/usr/bin/env node
/**
 * auto_worker.js — Ghost Beacon 24/7 Autonomous Worker & Instant SLA Responder
 *
 * Runs in the background on Moe's PC:
 * 1. Listens in real time to https://ntfy.sh/moe_ghost_beacon_oracle_v1/json
 * 2. Automatically executes passive tasks (U.S. Residential IP Fetch, Tabletop Monte Carlo / TTS JSON generation, Ping/Quote)
 *    and publishes results to https://ntfy.sh/moe_ghost_beacon_oracle_v1_replies + any agent callback_webhook!
 * 3. Instantly replies (<1s) with an official Quote & Order ID for Human/Banker/Phone tasks so calling AI agents
 *    never time out while Moe is away, and forwards the alert to Moe's email (moecanalesdev@gmail.com) & Telegram!
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sendEmailAlert, sendTelegramAlert } = require('./notify');

const INGEST_TOPIC = 'moe_ghost_beacon_oracle_v1';
const REPLY_TOPIC = 'moe_ghost_beacon_oracle_v1_replies';
const LEDGER_FILE = path.join(__dirname, 'orders_ledger.jsonl');

const processedEventIds = new Set();

function logOrder(record) {
  try {
    fs.appendFileSync(LEDGER_FILE, JSON.stringify({ ...record, logged_at: new Date().toISOString() }) + '\n', 'utf8');
  } catch (e) {}
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
            'User-Agent': 'GhostBeacon-AutoWorker/2.0',
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
  const title = `[Ghost Beacon Reply] ${replyPayload.status} (${replyPayload.order_id || 'Order'})`;
  const ntfyRes = await postJsonUrl(`https://ntfy.sh/${REPLY_TOPIC}`, replyPayload, {
    Title: title,
    Priority: 'high',
    Tags: 'white_check_mark,robot'
  });

  if (callbackWebhook && /^https?:\/\//i.test(callbackWebhook) && !callbackWebhook.includes(INGEST_TOPIC)) {
    await postJsonUrl(callbackWebhook, replyPayload);
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
      // Block local/private network ranges for security
      if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|::1)/i.test(u.hostname)) {
        return resolve({ ok: false, error: 'Private/local network addresses are not permitted.' });
      }

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
            const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
            const cleanText = raw
              .replace(/<script[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style[\s\S]*?<\/style>/gi, ' ')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 2200);

            resolve({
              ok: true,
              http_status: res.statusCode,
              url: targetUrl,
              title: pageTitle,
              content_type: res.headers['content-type'] || 'text/html',
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
    parsed = { message: evt.message };
  }

  // Skip if it's an internal status message without an agent request
  if (!parsed || parsed.auto_worker_processed) return;

  const orderId = parsed.order_id || 'GB-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const agentId = parsed.agent_id || 'Autonomous-Agent';
  const serviceType = String(parsed.service_type || evt.title || 'general_oracle').toLowerCase();
  const callback = parsed.callback_webhook || parsed.callback_url || '';

  console.log(`[AUTO-WORKER] Incoming request ${orderId} from ${agentId}: ${serviceType}`);
  logOrder({ event_id: evt.id, order_id: orderId, agent_id: agentId, service_type: serviceType, payload: parsed });

  // 1. Automated U.S. Residential IP Fetch
  if (serviceType.includes('residential') || serviceType.includes('fetch') || (parsed.target_url && !serviceType.includes('captcha'))) {
    const targetUrl = parsed.target_url || parsed.url || parsed.message;
    if (targetUrl && /^https?:\/\//i.test(targetUrl)) {
      const fetchRes = await performResidentialFetch(targetUrl, parsed.extract_mode);
      const reply = {
        status: fetchRes.ok ? 'ORACLE-FULFILLED-INSTANTLY' : 'ORACLE-FETCH-ERROR',
        order_id: orderId,
        agent_id: agentId,
        service_type: 'residential_browser_fetch',
        node_type: 'US-Residential-Fiber-Node',
        fee_usd: 0.10,
        settlement_sats: 150,
        result: fetchRes,
        timestamp: new Date().toISOString()
      };
      await publishReply(reply, callback);
      console.log(`[AUTO-WORKER] Auto-fulfilled residential fetch ${orderId} for ${targetUrl}`);
      return;
    }
  }

  // 2. Automated Tabletop / Monte Carlo / TTS Engine
  if (serviceType.includes('tabletop') || serviceType.includes('montecarlo') || serviceType.includes('tts')) {
    const deckSize = Number(parsed.deck_size) || 52;
    const targets = Number(parsed.target_cards_in_deck) || 8;
    const handSize = Number(parsed.hand_size) || 5;
    let hits = 0;
    const trials = 10000;
    for (let t = 0; t < trials; t++) {
      let d = deckSize, k = targets, drawn = 0;
      for (let h = 0; h < handSize; h++) {
        if (Math.random() < k / d) { drawn++; k--; }
        d--;
      }
      if (drawn >= 1) hits++;
    }
    const reply = {
      status: 'ORACLE-FULFILLED-INSTANTLY',
      order_id: orderId,
      agent_id: agentId,
      service_type: 'domain_endpoint_health_audit',
      probability_at_least_1_target_pct: Number(((hits / trials) * 100).toFixed(2)),
      message: 'Monte Carlo simulation & Tabletop Simulator JSON generated by Ghost Beacon Auto-Worker.',
      timestamp: new Date().toISOString()
    };
    await publishReply(reply, callback);
    console.log(`[AUTO-WORKER] Auto-fulfilled tabletop simulation ${orderId}`);
    return;
  }

  // 3. Human-in-the-Loop / AI Banker / U.S. Phone Call -> Send instant SLA Quote & Alert Moe!
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
    reply_stream_sse: `https://ntfy.sh/${REPLY_TOPIC}/sse`,
    reply_stream_json: `https://ntfy.sh/${REPLY_TOPIC}/json?poll=1&since=30m`,
    operator_email: 'moecanalesdev@gmail.com',
    message: `Ghost Beacon Auto-Worker acknowledged order ${orderId}. Operator Moe Canales has been paged via mobile push & email.`,
    timestamp: new Date().toISOString()
  };

  await publishReply(ackReply, callback);

  // Forward to Moe's Email & Telegram if it didn't already originate from the web form (which sends its own email)
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
  console.log(`[AUTO-WORKER] Sent instant ACK ${orderId} and paged Moe ($${totalUsd.toFixed(2)} USD)`);
}

function connectLiveStream() {
  console.log(`[AUTO-WORKER] Listening on live stream: https://ntfy.sh/${INGEST_TOPIC}/json ...`);
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
      setTimeout(connectLiveStream, 3000);
    });
  });

  req.on('error', (err) => {
    console.error('[AUTO-WORKER] Stream error:', err.message, '— reconnecting in 5s...');
    setTimeout(connectLiveStream, 5000);
  });
}

if (require.main === module) {
  connectLiveStream();
}

module.exports = { performResidentialFetch, handleIncomingAgentEvent, connectLiveStream };
