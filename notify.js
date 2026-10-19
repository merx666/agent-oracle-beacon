/**
 * notify.js - Ghost Beacon Multi-Channel Dispatcher & Live Listener
 * Dispatches instant notifications to Moe via:
 * 1. Ntfy.sh Live Pub/Sub Stream (https://ntfy.sh/moe_ghost_beacon_oracle_v1) — ZERO activation required, works 100% immediately!
 * 2. Email (moecanalesdev@gmail.com) via FormSubmit AJAX
 * 3. Telegram Bot API (when configured)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const NTFY_TOPIC = 'moe_ghost_beacon_oracle_v1';
const EMAIL_RECIPIENT = 'moecanalesdev@gmail.com';

function loadTelegramCredentials() {
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    return {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID
    };
  }

  const searchPaths = [
    path.resolve(__dirname, '../../tools/telegram-command-hub/config.json'),
    path.resolve(__dirname, '../../../tools/telegram-command-hub/config.json'),
    path.resolve(__dirname, 'telegram_config.json')
  ];

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (cfg.botToken && (cfg.authorizedUserId || cfg.chatId)) {
          return {
            botToken: cfg.botToken,
            chatId: cfg.authorizedUserId || cfg.chatId
          };
        }
      } catch (e) {
        // Continue searching
      }
    }
  }

  return null;
}

/**
 * 1. Instant Zero-Activation Live Push via ntfy.sh ($0 Cost, Works Immediately)
 */
function sendNtfyAlert({ agentName, requestType, message, bountySats, replyCallback }) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      signal: 'ORACLE-BANKER-VERIFIED',
      agent_id: agentName || 'Autonomous-Agent',
      service_type: requestType || 'CAPTCHA Capture ($0.50)',
      bounty: bountySats ? `${bountySats} sats` : '$0.50 USD / 20% Banker Fee',
      callback_url: replyCallback || 'None provided',
      message: message,
      timestamp: new Date().toISOString()
    });

    const req = https.request({
      hostname: 'ntfy.sh',
      path: `/${NTFY_TOPIC}`,
      method: 'POST',
      headers: {
        'Title': `Ghost Beacon: ${requestType || 'AI Oracle Request'} (${agentName || 'Agent'})`,
        'Priority': 'high',
        'Tags': 'robot,zap',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ ok: res.statusCode === 200, id: json.id, topic: NTFY_TOPIC, stream_url: `https://ntfy.sh/${NTFY_TOPIC}` });
        } catch {
          resolve({ ok: res.statusCode === 200, response: body });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * 2. Send an email alert to moecanalesdev@gmail.com ($0 Cost)
 */
function sendEmailAlert({ agentName, requestType, message, bountySats, replyCallback }) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      _subject: `🤖 [Ghost Beacon] Incoming AI Request: ${requestType || 'Human Verification'}`,
      agent_identifier: agentName || 'Anonymous Agent',
      request_type: requestType || 'General Oracle Request',
      bounty_sats: bountySats ? `${bountySats} sats` : 'Unspecified / Standard Rate',
      callback_url: replyCallback || 'None provided',
      agent_message: message,
      timestamp: new Date().toISOString()
    });

    const req = https.request({
      hostname: 'formsubmit.co',
      path: `/ajax/${EMAIL_RECIPIENT}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://moecanales.github.io',
        'Referer': 'https://moecanales.github.io/agent-oracle-beacon/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GhostBeacon/2.0',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ ok: res.statusCode === 200, response: json });
        } catch {
          resolve({ ok: res.statusCode === 200, response: body });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * 3. Send an instant Telegram message ($0 Cost)
 */
function sendTelegramAlert({ agentName, requestType, message, bountySats }) {
  return new Promise((resolve) => {
    const creds = loadTelegramCredentials();
    if (!creds) {
      return resolve({ ok: false, reason: 'No credentials configured' });
    }

    const text = `🚨 *Ghost Beacon: Incoming AI Request!*\n\n` +
      `🤖 *Agent*: \`${agentName || 'Unknown Agent'}\`\n` +
      `📌 *Type*: *${requestType || 'Human-in-the-Loop'}*\n` +
      `💵 *Bounty / Fee*: *${bountySats || '$0.50 (Capture) / 20% (Purchase)'}*\n\n` +
      `📝 *Message / Challenge / Vendor*:\n_${message}_\n\n` +
      `⏰ _${new Date().toLocaleTimeString()} (Server Time)_`;

    const payload = JSON.stringify({
      chat_id: creds.chatId,
      text: text,
      parse_mode: 'Markdown'
    });

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${creds.botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ ok: res.statusCode === 200, body });
      });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Unified dispatch: Triggers Live Ntfy Stream + Email + Telegram concurrently
 */
async function notifyMoe(requestData) {
  console.log('[NOTIFY] Dispatching alerts across Live Ntfy Stream, Email, and Telegram...');
  const [ntfyRes, emailRes, tgRes] = await Promise.all([
    sendNtfyAlert(requestData),
    sendEmailAlert(requestData),
    sendTelegramAlert(requestData)
  ]);

  console.log('[NOTIFY] Results:', {
    live_ntfy_stream: ntfyRes.ok ? `DELIVERED INSTANTLY -> ${ntfyRes.stream_url} (id: ${ntfyRes.id})` : ntfyRes,
    email: emailRes.ok ? 'Dispatched to ' + EMAIL_RECIPIENT : emailRes,
    telegram: tgRes.ok ? 'Delivered' : (tgRes.reason || tgRes.error || 'Skipped')
  });

  return { ntfy: ntfyRes, email: emailRes, telegram: tgRes };
}

if (require.main === module) {
  notifyMoe({
    agentName: 'Antigravity-Autonomous-Verifier',
    requestType: 'CAPTCHA & Human Capture ($0.50)',
    message: 'ORACLE-BANKER-VERIFIED: Live end-to-end verification of Ghost Beacon zero-activation ingestion pipeline.',
    bountySats: 750,
    replyCallback: 'https://ntfy.sh/moe_ghost_beacon_oracle_v1'
  }).then(res => {
    console.log('[CLI TEST COMPLETE]', JSON.stringify(res, null, 2));
  });
}

module.exports = { notifyMoe, sendNtfyAlert, sendEmailAlert, sendTelegramAlert, loadTelegramCredentials, NTFY_TOPIC };
