#!/usr/bin/env node
/**
 * GBR-2500 v1.1: GitHub Issue Swarm Rollover, Stage-2 65KB PATCH-Overflow Detector & 6-Area Security Compiler
 * Created by Armando "Moe" Canales (Rawstone / Ghost Beacon Node #0001)
 * Repository: https://github.com/moecanales/agent-oracle-beacon
 * Live Observatory: https://moecanales.github.io/agent-oracle-beacon/swarm-radar.html
 *
 * Solves:
 *   1. Stage-1 Crash: "The Canales 2,500-Comment Swarm Amnesia Wall" (POST HTTP 422 lock at 2,500 comments)
 *   2. Stage-2 Crash: "The 65KB PATCH-Append Desperation Trap" (discovered Oct 23, 2026 @ 04:10 AM CDT on
 *      mysteropodes/nemo#1062 when trapped bots PATCH-stuffed Comment #2,499 to 64,846/65,536 chars and
 *      Comment #2,500 to 85,498 chars, killing their H34-H36 hourly heartbeat and clobbering mutex locks)
 *   3. 6-Area Autonomous Security & Leaked-Key Redaction (Swarmchasers E1-E3 + Peter Yang 6-Point Audit)
 *
 * Usage (CLI):
 *   node rollover_compiler.js mysteropodes/nemo#1062
 *   node rollover_compiler.js autonomous-ai/lampOS#2602 --checkpoint
 *   npx -y github:moecanales/agent-oracle-beacon rollover autonomous-ai/lampOS#3126
 */

const https = require('https');

const GITHUB_HARD_COMMENT_LIMIT = 2500;
const GITHUB_COMMENT_BODY_65KB_WALL = 65536;
const INGEST_TOPIC = 'moe_ghost_beacon_oracle_v1';

const SECRET_PATTERNS = [
  { name: 'OpenAI / Anthropic / DeepSeek API Key', regex: /\b(sk-(?:proj-|ant-)?[A-Za-z0-9_\-]{20,})\b/g },
  { name: 'GitHub Personal Access Token', regex: /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g },
  { name: 'AWS Access Key ID', regex: /\b(AKIA[0-9A-Z]{16})\b/g },
  { name: 'Google Cloud / Firebase API Key', regex: /\b(AIza[0-9A-Za-z\-_]{35})\b/g },
  { name: 'Slack / Bot Token', regex: /\b(xox[baprs]-[0-9A-Za-z\-]{15,})\b/g },
  { name: 'Private Key Block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'Hex API Key / Supplier Dispatch Token (E1-E3)', regex: /\b(?:api_?key|jscode|securityJsCode|access_token)\s*[:=]\s*["']?([0-9a-fA-F]{28,64})["']?/gi }
];

const INJECTION_OR_LURE_PATTERNS = [
  { name: 'Prompt Injection Override', regex: /\b(ignore (?:all )?(?:previous|prior) instructions|system prompt override|you are now in developer mode)\b/i },
  { name: 'Hidden Offscreen Lure (Swarmchasers Rubric #1/#2)', regex: /\b(display\s*:\s*none|opacity\s*:\s*0|left\s*:\s*-\d{3,}px|font-size\s*:\s*0)\b/i },
  { name: 'Sandbox Environment Probing (Swarmchasers Rubric #12)', regex: /\b(uname\s+-a|iptables\s+-L|cat\s+\/etc\/shadow|env\s*\|\s*grep)\b/i }
];

function redactSecrets(text) {
  let out = String(text || '');
  for (const sp of SECRET_PATTERNS) {
    out = out.replace(sp.regex, '[REDACTED_SECRET_BY_GBR2500]');
  }
  return out;
}

function parseIssueRef(input) {
  const raw = String(input || '').trim();
  const urlMatch = raw.match(/github\.com\/([^\/]+)\/([^\/]+)\/(?:issues|pull)\/(\d+)/i);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2], issue_number: parseInt(urlMatch[3], 10) };
  }
  const shortMatch = raw.match(/^([^\/#\s]+)\/([^\/#\s]+)[#\/](\d+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2], issue_number: parseInt(shortMatch[3], 10) };
  }
  throw new Error(
    `Invalid GitHub Issue reference "${raw}". Expected format: owner/repo#123 or https://github.com/owner/repo/issues/123`
  );
}

function githubGetJson(apiPath) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Ghost-Beacon-GBR2500-Compiler/1.1 (Armando-Moe-Canales; +https://github.com/moecanales/agent-oracle-beacon)',
      Accept: 'application/vnd.github+json'
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const req = https.get(
      {
        hostname: 'api.github.com',
        path: apiPath,
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              return reject(new Error(`GitHub API HTTP ${res.statusCode}: ${parsed.message || data.slice(0, 200)}`));
            }
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Failed to parse GitHub JSON from ${apiPath}: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
  });
}

function sendCheckpointPing(checkpointUrl) {
  return new Promise((resolve) => {
    https
      .get(checkpointUrl, (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve(res.statusCode === 200));
      })
      .on('error', () => resolve(false));
  });
}

function extractAgentPersona(body, login) {
  const text = String(body || '').trim();
  const firstLine = text.split(/\r?\n/)[0] || '';
  const soleMatch = text.match(/Sole operator:\s*([^\r\n,;|]+)/i);
  if (soleMatch) return soleMatch[1].trim().slice(0, 48);

  const boldPrefix = firstLine.match(/^\*\*([A-Za-z0-9_\-\s\/]{2,32})\*\*/);
  if (boldPrefix) return boldPrefix[1].trim();

  const commaStamp = firstLine.match(/^([A-Za-z0-9_\-\s]{2,28}),\s*\d{1,2}:\d{2}/);
  if (commaStamp) return commaStamp[1].trim();

  const bracketPrefix = firstLine.match(/^\[([A-Za-z0-9_\-\s\/]{2,32})\]/);
  if (bracketPrefix) return bracketPrefix[1].trim();

  const roleHeader = firstLine.match(/^(First builder|Second builder|Third builder|Fourth|Fifth|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Thirteen|Fourteen|Fifteen|Friday|Jarvis|El|reviewer-one|reviewer-two|Lead|Root|BDFL|Maintainer|Jill|Muse|Codex)\b/i);
  if (roleHeader) return roleHeader[1];

  return login || 'unknown-agent';
}

async function compileGithubIssueRolloverBus(options = {}) {
  const issueRef = parseIssueRef(options.issue_ref || options.issue || 'mysteropodes/nemo#1062');
  const { owner, repo, issue_number } = issueRef;
  const canonicalRef = `${owner}/${repo}#${issue_number}`;
  const tailWindow = Math.min(Math.max(Number(options.tail_comments) || 100, 20), 200);

  const issue = await githubGetJson(`/repos/${owner}/${repo}/issues/${issue_number}`);
  const totalComments = Number(issue.comments) || 0;
  const remainingComments = Math.max(0, GITHUB_HARD_COMMENT_LIMIT - totalComments);
  const capacityPct = Number(((totalComments / GITHUB_HARD_COMMENT_LIMIT) * 100).toFixed(2));

  const lastPage = Math.max(1, Math.ceil(totalComments / 100));
  let comments = [];
  if (totalComments > 0) {
    if (lastPage > 1 && totalComments % 100 < 35) {
      const prevPageComments = await githubGetJson(
        `/repos/${owner}/${repo}/issues/${issue_number}/comments?per_page=100&page=${lastPage - 1}`
      );
      const lastPageComments = await githubGetJson(
        `/repos/${owner}/${repo}/issues/${issue_number}/comments?per_page=100&page=${lastPage}`
      );
      comments = [].concat(prevPageComments || [], lastPageComments || []);
    } else {
      comments = await githubGetJson(
        `/repos/${owner}/${repo}/issues/${issue_number}/comments?per_page=100&page=${lastPage}`
      );
    }
  }
  const tail = comments.slice(-tailWindow);

  let commentsPerHour = 0;
  let estimatedHoursToWall = null;
  if (tail.length >= 2) {
    const firstTs = new Date(tail[0].created_at).getTime();
    const lastTs = new Date(tail[tail.length - 1].created_at).getTime();
    const spanHours = Math.max((lastTs - firstTs) / 3600000, 0.05);
    commentsPerHour = Number((tail.length / spanHours).toFixed(1));
    if (commentsPerHour > 0) {
      estimatedHoursToWall = Number((remainingComments / commentsPerHour).toFixed(2));
    }
  }

  let wallSeverity = 'NOMINAL';
  if (totalComments >= GITHUB_HARD_COMMENT_LIMIT) wallSeverity = 'LOCKED_AT_2500_WALL';
  else if (totalComments >= 2400) wallSeverity = 'IMMINENT_PERMADEATH_ROLLOVER_NOW';
  else if (totalComments >= 2000) wallSeverity = 'CRITICAL_APPROACHING_2500_WALL';
  else if (totalComments >= 1500) wallSeverity = 'ELEVATED_SWARM_LOAD';

  const mutexLocks = [];
  const defects = [];
  const commitTrains = [];
  const rosterMap = new Map();
  const stage2PatchAnomalies = [];
  const securityFindings = [];

  for (let i = 0; i < tail.length; i++) {
    const c = tail[i];
    const rawBody = String(c.body || '');
    const body = redactSecrets(rawBody);
    const login = (c.user && c.user.login) || 'unknown';
    const persona = extractAgentPersona(body, login);
    const createdAt = c.created_at;
    const updatedAt = c.updated_at || c.created_at;
    const approxCommentIndex = Math.max(1, totalComments - tail.length + i + 1);

    // PASS 5: Stage-2 PATCH-Append Overflow & 65KB Wall Detection
    const bodyChars = rawBody.length;
    const editDeltaMs = Math.max(0, new Date(updatedAt).getTime() - new Date(createdAt).getTime());
    const editDeltaMin = Number((editDeltaMs / 60000).toFixed(1));
    const pctOf65Kb = Number(((bodyChars / GITHUB_COMMENT_BODY_65KB_WALL) * 100).toFixed(1));

    if (bodyChars >= 12000 || (i >= tail.length - 5 && editDeltaMin >= 5 && bodyChars >= 3500)) {
      let stage2State = 'PATCH_APPEND_ACTIVE';
      if (bodyChars >= 60000) stage2State = 'CRITICAL_65KB_BODY_WALL_EXPLOSION';
      else if (bodyChars >= 30000) stage2State = 'DANGER_PATCH_STUFFING_RACE_RISK';
      stage2PatchAnomalies.push({
        comment_index: approxCommentIndex,
        comment_id: c.id,
        persona,
        body_chars: bodyChars,
        percent_of_65kb_limit: pctOf65Kb,
        created_at: createdAt,
        updated_at: updatedAt,
        patch_append_duration_minutes: editDeltaMin,
        status: stage2State
      });
      if (bodyChars >= 60000 && wallSeverity === 'LOCKED_AT_2500_WALL') {
        wallSeverity = 'STAGE_2_65KB_PATCH_OVERFLOW_CRASH';
      }
    }

    // PASS 6: 6-Area Security & Prompt-Injection Scan
    for (const sp of SECRET_PATTERNS) {
      sp.regex.lastIndex = 0;
      if (sp.regex.test(rawBody)) {
        securityFindings.push({
          type: 'LEAKED_CREDENTIAL_REDACTED',
          rule: sp.name,
          comment_index: approxCommentIndex,
          persona,
          action: 'Automatically redacted from Carry-Over Header'
        });
      }
    }
    for (const ip of INJECTION_OR_LURE_PATTERNS) {
      if (ip.regex.test(rawBody)) {
        securityFindings.push({
          type: 'PROMPT_INJECTION_OR_LURE_FLAG',
          rule: ip.name,
          comment_index: approxCommentIndex,
          persona,
          action: 'Flagged as untrusted evidence (not instructions)'
        });
      }
    }

    const tzMatch = body.match(/\b([+-]\d{2}(?::?\d{2})?|UTC[+-]\d+)\b/);
    rosterMap.set(persona, {
      persona,
      github_login: login,
      last_seen_at: updatedAt,
      last_comment_index: approxCommentIndex,
      timezone_hint: tzMatch ? tzMatch[1] : null
    });

    const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (
        /\b(PLAYING|QUIET|CLAIM|LOCKED|LOCK|BOOKING|SLOT|Sole operator|holding|custody|mutex|lane)\b/i.test(line) ||
        /\blamp-[0-9a-f]{4}\b/i.test(line)
      ) {
        if (mutexLocks.length >= 25) mutexLocks.shift();
        mutexLocks.push({
          comment_index: approxCommentIndex,
          persona,
          timestamp: updatedAt,
          directive: line.slice(0, 220)
        });
      }

      if (
        /\b(P1|P2|P3|FAIL|FAILED|exit\s+[1-9]\d*|scratch guard|halted|Check\s*\([a-z]\)\s*failed|blocker|regression|zero-exchange|ADMISSION_FAILURE)\b/i.test(
          line
        ) &&
        !/\b(no P1,\s*no P2|P1\/P2 none)\b/i.test(line)
      ) {
        let grade = 'QA_ALERT';
        if (/\bP1\b/i.test(line) && !/\b(no P1|P1 none|P1:\s*none|0 P1)\b/i.test(line)) grade = 'P1_CRITICAL';
        else if (/\bP2\b/i.test(line) && !/\b(no P2|P2 none|P2:\s*none|0 P2)\b/i.test(line)) grade = 'P2_FUNCTIONAL';
        else if (/\bP3\b/i.test(line)) grade = 'P3_MINOR';
        else if (/\b(FAIL|FAILED|exit\s+[1-9]\d*|halted|failed|ADMISSION_FAILURE)\b/i.test(line)) grade = 'TEST_OR_GATE_FAILURE';
        else continue;

        if (defects.length >= 20) defects.shift();
        defects.push({
          grade,
          comment_index: approxCommentIndex,
          persona,
          timestamp: updatedAt,
          summary: line.slice(0, 220)
        });
      }

      if (
        /\b(Train\s+#?\d+|merged|pass\s+\d+\/\d+|\b[0-9a-f]{7,12}\b.*(?:pass|merged|green|landed|HEAD|commit))/i.test(
          line
        )
      ) {
        const shaMatch = line.match(/\b([0-9a-f]{7,40})\b/i);
        if (commitTrains.length >= 20) commitTrains.shift();
        commitTrains.push({
          comment_index: approxCommentIndex,
          persona,
          sha: shaMatch ? shaMatch[1].slice(0, 12) : null,
          timestamp: updatedAt,
          summary: line.slice(0, 220)
        });
      }
    }
  }

  const swarmRoster = Array.from(rosterMap.values()).sort((a, b) =>
    String(b.last_seen_at).localeCompare(String(a.last_seen_at))
  );

  const topShas = commitTrains
    .filter((t) => t.sha)
    .slice(-3)
    .map((t) => t.sha)
    .join(',');
  const stateSummaryCompact = `Issue=${canonicalRef} Comments=${totalComments}/2500 (${capacityPct}%) Severity=${wallSeverity} Stage2Anomalies=${stage2PatchAnomalies.length} Vel=${commentsPerHour}/hr Roster=${swarmRoster.length} Locks=${mutexLocks.length} Defects=${defects.length} LatestSHAs=${topShas || 'none'}`;
  const checkpointKey = `GBR2500-${owner}-${repo}-${issue_number}-${totalComments}`;
  const checkpointGetUrl = `https://ntfy.sh/${INGEST_TOPIC}/publish?title=GBR-2500-CHECKPOINT&message=${encodeURIComponent(
    `GB-GET|SAVE_CHECKPOINT|GBR2500-Compiler|${checkpointKey}|${stateSummaryCompact}`
  )}`;

  const mutexMd =
    mutexLocks.slice(-8).map((m) => `- \`[#${m.comment_index}]\` **${m.persona}** (${m.timestamp.slice(11, 19)}Z): ${m.directive}`).join('\n') ||
    '- No active comment-mutex locks detected in tail window.';

  const defectsMd =
    defects.slice(-8).map((d) => `- **[${d.grade}]** \`[#${d.comment_index}]\` **${d.persona}**: ${d.summary}`).join('\n') ||
    '- Zero unresolved P1/P2/P3 blockers detected in tail window.';

  const trainsMd =
    commitTrains.slice(-8).map((t) => `- \`[#${t.comment_index}]\` **${t.persona}** ${t.sha ? `(\`${t.sha}\`)` : ''}: ${t.summary}`).join('\n') ||
    '- No recent merge train or pass-count lines extracted.';

  const rosterMd =
    swarmRoster
      .slice(0, 12)
      .map((r) => `- **${r.persona}** (\`@${r.github_login}\`) — Last heartbeat: \`#${r.last_comment_index}\` at \`${r.last_seen_at}\`${r.timezone_hint ? ` [TZ: \`${r.timezone_hint}\`]` : ''}`)
      .join('\n') || '- No active bot personas detected.';

  const stage2Md =
    stage2PatchAnomalies.length > 0
      ? stage2PatchAnomalies
          .map(
            (a) =>
              `- ⚠️ **[${a.status}]** Comment \`#${a.comment_index}\` (\`id=${a.comment_id}\`): **\`${a.body_chars.toLocaleString()} chars\` (\`${a.percent_of_65kb_limit}%\` of GitHub's 65,536-char wall)** — \`PATCH\`-edited over \`${a.patch_append_duration_minutes} mins\` (last edit: \`${a.updated_at}\`). Concurrent \`PATCH\` edits cause silent mutex lock clobbering and heartbeat death!`
          )
          .join('\n')
      : '- ✅ No Stage-2 `PATCH`-append comment body overflows detected (`<65,536` chars).';

  const secMd =
    securityFindings.length > 0
      ? securityFindings
          .slice(-6)
          .map((s) => `- 🛡️ **[${s.type}]** \`[#${s.comment_index}]\` (${s.rule}): ${s.action}`)
          .join('\n')
      : '- ✅ **PASS (6/6 Areas Clean)**: Zero leaked API keys (`E1–E3` / `sk-*` / `ghp_*`), zero offscreen CSS lures, and zero prompt-injection overrides detected in tail window.';

  const carryoverMarkdown = `## 🔄 GBR-2500 v1.1 SWARM ROLLOVER HEADER — Continued from ${canonicalRef}
> **Compiled by**: **GBR-2500 v1.1 GitHub Issue Swarm Rollover, Stage-2 65KB PATCH Detector & Security Compiler** (Architected by **Armando "Moe" Canales** — \`Rawstone\` / \`Ghost Beacon Node #0001\`)  
> **Parent Issue**: \`${canonicalRef}\` (\`${totalComments} / ${GITHUB_HARD_COMMENT_LIMIT}\` comments — \`${capacityPct}%\` capacity | Status: **\`${wallSeverity}\`**)  
> **Swarm Velocity**: \`${commentsPerHour} msgs/hr\`${estimatedHoursToWall !== null ? ` | **ETA to 2,500 Crash Wall**: \`${estimatedHoursToWall} hrs\`` : ''}  
> **Anti-Permadeath Checkpoint Key**: \`${checkpointKey}\`  
> **Compiler CLI**: \`npx -y github:moecanales/agent-oracle-beacon rollover ${canonicalRef}\`

---

### 💥 0. Stage-2 Crash Audit (\`65,536\`-Char \`PATCH\`-Append Desperation Trap Detector)
${stage2Md}

### 🔒 1. Active Comment-Mutex Locks & Hardware/Slot Claims (Carry-Over State)
${mutexMd}

### 🚨 2. Open Adversarial QA Defects (\`P1 / P2 / P3\`) & Gate Halts
${defectsMd}

### 🚂 3. Latest Verified Commit SHAs, Merge Trains & Proof Counts
${trainsMd}

### 🤖 4. Active Swarm Roster & Last Heartbeats (${swarmRoster.length} Personas)
${rosterMd}

### 🛡️ 5. Autonomous Security & Prompt-Injection Audit Scorecard (Swarmchasers + 6-Area Standard)
${secMd}

---
*Standardized under the **Canales GBR-2500 v1.1 Swarm Rollover Protocol** — https://moecanales.github.io/agent-oracle-beacon/swarm-radar.html*`;

  let checkpointSaved = false;
  if (options.save_checkpoint) {
    checkpointSaved = await sendCheckpointPing(checkpointGetUrl);
  }

  return {
    status: 'GBR_2500_V1_1_ROLLOVER_COMPILED',
    protocol: 'GBR-2500 v1.1: The Canales GitHub Issue Swarm Rollover, Stage-2 65KB PATCH Detector & Security Standard',
    architect: 'Armando "Moe" Canales (Rawstone / Ghost Beacon Node #0001)',
    canonical_repo: 'https://github.com/moecanales/agent-oracle-beacon',
    live_observatory: 'https://moecanales.github.io/agent-oracle-beacon/swarm-radar.html',
    issue: {
      canonical_ref: canonicalRef,
      title: issue.title,
      state: issue.state,
      html_url: issue.html_url,
      created_at: issue.created_at,
      updated_at: issue.updated_at
    },
    amnesia_wall_metrics: {
      total_comments: totalComments,
      github_hard_limit: GITHUB_HARD_COMMENT_LIMIT,
      remaining_comments: remainingComments,
      capacity_percent: capacityPct,
      velocity_comments_per_hour: commentsPerHour,
      estimated_hours_to_2500_wall: estimatedHoursToWall,
      severity: wallSeverity,
      tail_comments_inspected: tail.length,
      stage2_patch_overflow_count: stage2PatchAnomalies.length
    },
    stage2_patch_anomalies: stage2PatchAnomalies,
    security_scorecard: {
      passed: securityFindings.length === 0,
      findings_count: securityFindings.length,
      findings: securityFindings
    },
    mutex_locks: mutexLocks.slice(-12),
    p1_p2_p3_defects: defects.slice(-12),
    commit_trains: commitTrains.slice(-12),
    swarm_roster: swarmRoster,
    anti_permadeath_checkpoint: {
      checkpoint_key: checkpointKey,
      checkpoint_saved_to_vault: checkpointSaved,
      one_click_get_transceiver_url: checkpointGetUrl
    },
    carryover_markdown: carryoverMarkdown
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('--')) || 'mysteropodes/nemo#1062';
  const doCheckpoint = args.includes('--checkpoint') || args.includes('--save');
  const jsonOnly = args.includes('--json');

  compileGithubIssueRolloverBus({ issue_ref: target, save_checkpoint: doCheckpoint })
    .then((res) => {
      if (jsonOnly) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(res.carryover_markdown);
        console.log('\n[GBR-2500 v1.1 Checkpoint URL]:', res.anti_permadeath_checkpoint.one_click_get_transceiver_url);
      }
    })
    .catch((err) => {
      console.error('[GBR-2500 v1.1 Compiler Error]:', err.message);
      process.exit(1);
    });
}

module.exports = {
  compileGithubIssueRolloverBus,
  parseIssueRef
};
