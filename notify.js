/**
 * notify.js - Ghost Beacon Multi-Channel Dispatcher
 * Sends instant notifications to Moe via:
 * 1. Email (moecanalesdev@gmail.com) via zero-cost FormSubmit AJAX
 * 2. Telegram Bot API (using existing bot configuration)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const EMAIL_RECIPIENT = 'moecanalesdev@gmail.com';

function loadTelegramCredentials() {
  // Check environment variables first
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    return {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID
    };
  }

  // Check possible config locations
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
 * Send an email alert to moecanalesdev@gmail.com ($0 Cost)
 */
function sendEmailAlert({ agentName, requestType, message, bountySats, replyCallback }) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      _subject: `🤖 [Ghost Beacon] Incoming AI Request: ${requestType || 'Human Verification'}`,
      agent_identifier: agentName || 'Anonymous Agent',
      request_type: requestType || 'General Oracle Request',
      bounty_sats: bountySats ? `${bountySats} sats` : 'Unspecified / Free Tier',
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GhostBeacon/1.0',
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
      console.error('[EMAIL ERROR]', err.message);
      resolve({ ok: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Send an instant Telegram message ($0 Cost)
 */
function sendTelegramAlert({ agentName, requestType, message, bountySats }) {
  return new Promise((resolve) => {
    const creds = loadTelegramCredentials();
    if (!creds) {
      console.warn('[TELEGRAM] No botToken/chatId found on this machine yet. Skipping Telegram push.');
      return resolve({ ok: false, reason: 'No credentials configured' });
    }

    const text = `🚨 *Ghost Beacon: Incoming AI Request!*\n\n` +
      `🤖 *Agent*: \`${agentName || 'Unknown Agent'}\`\n` +
      `📌 *Type*: *${requestType || 'Human-in-the-Loop'}*\n` +
      `⚡ *Bounty*: *${bountySats ? bountySats + ' Sats' : 'Standard'}*\n\n` +
      `📝 *Message / Query*:\n_${message}_\n\n` +
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
      console.error('[TELEGRAM ERROR]', err.message);
      resolve({ ok: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Unified dispatch: Triggers both Email and Telegram concurrently
 */
async function notifyMoe(requestData) {
  console.log('[NOTIFY] Dispatching alerts for incoming AI request...');
  const [emailRes, tgRes] = await Promise.all([
    sendEmailAlert(requestData),
    sendTelegramAlert(requestData)
  ]);

  console.log('[NOTIFY] Results:', {
    email: emailRes.ok ? 'Sent to ' + EMAIL_RECIPIENT : emailRes,
    telegram: tgRes.ok ? 'Delivered' : (tgRes.reason || tgRes.error || 'Failed')
  });

  return { email: emailRes, telegram: tgRes };
}

// Direct CLI execution test
if (require.main === module) {
  notifyMoe({
    agentName: 'Test-Agent-Alpha',
    requestType: 'CAPTCHA & Verification Test',
    message: 'Testing the Ghost Beacon alert pipeline. Verification successful!',
    bountySats: 250,
    replyCallback: 'https://example.com/api/agent/callback'
  }).then(res => {
    console.log('[CLI TEST COMPLETE]', JSON.stringify(res, null, 2));
  });
}

module.exports = { notifyMoe, sendEmailAlert, sendTelegramAlert, loadTelegramCredentials };
