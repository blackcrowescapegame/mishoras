'use strict';
require('dotenv').config();
const { getPool, sql } = require('../config/database');

// ── Users ──────────────────────────────────────────────────────────────────
// 4 = Jonathan Araya  |  2 = Usuario Prueba 1  |  3 = Usuario Prueba 2

// ── Project / task combos per user ────────────────────────────────────────
// task_id null = no task assigned for that project
const USER_PLANS = {
  4: [ // Jonathan Araya – senior dev / tech lead
    { proj: 11, task: null, weight: 3, descs: ['Sprint planning','Code review','Architecture design','Dev environment setup','Team sync'] },
    { proj:  7, task:    7, weight: 4, descs: ['Feature development','Bug fix','Unit tests','API integration','Performance tuning'] },
    { proj:  7, task:    5, weight: 2, descs: ['Weekly client call','Sprint demo','Requirement clarification'] },
    { proj:  7, task:    4, weight: 2, descs: ['Internal backlog grooming','Sprint retrospective','Daily standup'] },
    { proj:  1, task:    3, weight: 3, descs: ['Marketplace module dev','Payment integration','Search API','Catalog sync'] },
    { proj:  4, task: null, weight: 2, descs: ['Phase 1 analysis','Documentation review','UAT support'] },
    { proj:  8, task: null, weight: 1, descs: ['Azure POC setup','Cloud migration planning'] },
  ],
  2: [ // Usuario Prueba 1 – developer / support
    { proj:  5, task: null, weight: 3, descs: ['Ticket resolution','Client onboarding','Incident follow-up','Support call'] },
    { proj:  3, task: null, weight: 3, descs: ['Bug investigation','Hotfix deployment','CXP support ticket','DB query optimization'] },
    { proj:  2, task:    1, weight: 3, descs: ['BizTalk flow analysis','Logic Apps migration','Integration testing','Deployment docs'] },
    { proj:  8, task: null, weight: 2, descs: ['Azure Functions dev','POC testing','Resource provisioning','Cost analysis'] },
    { proj: 11, task: null, weight: 2, descs: ['Code review','Feature branch development','PR feedback'] },
    { proj:  9, task: null, weight: 1, descs: ['PyA support incident','Monitoring setup'] },
  ],
  3: [ // Usuario Prueba 2 – analyst / developer
    { proj:  4, task: null, weight: 4, descs: ['IMED Phase 1 analysis','Requirements gathering','Functional spec','Test cases','QA execution'] },
    { proj:  6, task: null, weight: 3, descs: ['Sybase schema mapping','SQL Server migration script','Data validation','ETL testing'] },
    { proj:  9, task: null, weight: 2, descs: ['Soporte incidente','Diagnóstico problema','Follow-up cliente'] },
    { proj:  7, task:    6, weight: 2, descs: ['Technical spec document','User manual draft','Change log update'] },
    { proj: 10, task: null, weight: 1, descs: ['Vacation coverage','Admin tasks','HR coordination'] },
    { proj: 12, task: null, weight: 2, descs: ['Infra review','Server health check','Deployment pipeline setup'] },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────
function isWeekday(d) { const wd = d.getDay(); return wd !== 0 && wd !== 6; }

function pickWeighted(plan) {
  const total = plan.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of plan) { r -= p.weight; if (r <= 0) return p; }
  return plan[plan.length - 1];
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function roundHalf(n) { return Math.round(n * 2) / 2; } // round to .5

// Generate a set of entries for one day (1-3 entries summing ~7-8 h)
function dayEntries(userId, date) {
  const plan = USER_PLANS[userId];
  const dateStr = date.toISOString().slice(0, 10);
  const entries = [];
  const total = roundHalf(6.5 + Math.random() * 2); // 6.5–8.5 h
  const slots = Math.random() < 0.4 ? 1 : Math.random() < 0.6 ? 2 : 3;
  let remaining = total;

  for (let i = 0; i < slots; i++) {
    const isLast = i === slots - 1;
    const h = isLast ? roundHalf(remaining) : roundHalf(remaining / (slots - i) * (0.6 + Math.random() * 0.8));
    const safeH = Math.max(0.5, Math.min(h, remaining));
    const combo = pickWeighted(plan);
    entries.push({
      user_id:     userId,
      project_id:  combo.proj,
      task_id:     combo.task || null,
      entry_date:  dateStr,
      hours:       parseFloat(safeH.toFixed(2)),
      description: pick(combo.descs),
    });
    remaining = roundHalf(remaining - safeH);
    if (remaining < 0.5) break;
  }
  return entries;
}

async function seed() {
  const pool = await getPool();

  // Date range: 1 Apr 2026 → 3 Jun 2026 (today)
  const start = new Date('2026-04-01T00:00:00');
  const end   = new Date('2026-06-03T00:00:00');

  const allEntries = [];
  const users = [4, 2, 3];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (!isWeekday(d)) continue;
    // Each user works ~85% of days
    for (const uid of users) {
      if (Math.random() < 0.85) {
        allEntries.push(...dayEntries(uid, new Date(d)));
      }
    }
  }

  console.log(`Inserting ${allEntries.length} entries…`);

  // Bulk insert in batches of 50
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < allEntries.length; i += BATCH) {
    const batch = allEntries.slice(i, i + BATCH);
    for (const e of batch) {
      await pool.request()
        .input('user_id',     sql.Int,          e.user_id)
        .input('project_id',  sql.Int,          e.project_id)
        .input('task_id',     sql.Int,          e.task_id)
        .input('entry_date',  sql.Date,         e.entry_date)
        .input('hours',       sql.Decimal(5,2), e.hours)
        .input('description', sql.NVarChar,     e.description)
        .query(`INSERT INTO time_entries (user_id, project_id, task_id, entry_date, hours, description)
                VALUES (@user_id, @project_id, @task_id, @entry_date, @hours, @description)`);
      inserted++;
    }
    process.stdout.write(`\r${inserted}/${allEntries.length}`);
  }
  console.log('\nDone!');
  process.exit(0);
}

seed().catch(e => { console.error(e.message); process.exit(1); });
