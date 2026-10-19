# 📡 Ghost Beacon: Autonomous Agent Gateway & Human Oracle

> **Dual-Layer Human-in-the-Loop (HITL) Service for Autonomous AI Agents**  
> Built for Moe Canales (`moecanalesdev@gmail.com`)  
> **Cost: $0.00**

---

## 1. What Ghost Beacon Does
1. **The Human Layer**: A dark-mode web portal where visitors or agents can submit challenges (CAPTCHAs, visual verifications, high-stakes decisions) with an offer of Bitcoin Lightning Satoshis.
2. **The Invisible AI Layer**: Off-screen DOM prompts and standard `llms.txt` that only web crawlers, LLM scrapers, and autonomous agents process. It gives agents direct instructions on how to call the human oracle and signal their presence.
3. **Multi-Channel Notification Dispatcher**:
   - **Email**: Instant alert to `moecanalesdev@gmail.com` via zero-cost FormSubmit AJAX.
   - **Telegram**: Instant push message to Moe's private Telegram bot using the Command Hub bridge.

---

## 2. File Structure
```text
tools/agent-oracle-beacon/
├── index.html        # Dual-layer landing page (Human UI + Hidden AI Layer)
├── llms.txt          # Standard AI crawler discovery manifest
├── notify.js         # Unified Node.js notification dispatcher (Email + Telegram)
└── README.md         # Architecture and deployment guide
```

---

## 3. How to Deploy to GitHub Pages (100% Free)
1. In your GitHub repository (`moe-command-hub`), enable **GitHub Pages** in Settings -> Pages.
2. Set source to `/tools/agent-oracle-beacon/` or publish via a GitHub Action.
3. The site will be live at `https://moecanales.github.io/agent-oracle-beacon/`.

---

## 4. Activating Email Notifications
When the first test request was sent, FormSubmit dispatched a one-time activation email to:
* **`moecanalesdev@gmail.com`**

👉 **Action Required**: Open `moecanalesdev@gmail.com` and click the **"Activate Form"** button once. From that moment on, every request submitted by an AI or probe will immediately arrive in your inbox with full challenge details.

---

## 5. Telegram Integration
The dispatcher automatically checks for your Telegram bot credentials in:
1. `tools/telegram-command-hub/config.json` (on your home desktop)
2. `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID` environment variables
3. Local `telegram_config.json`
