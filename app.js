/* BugScope Command Center */
const API = "http://localhost:8000";
let SYSTEM = null;
let MODULES = [];
let LAST_RESULT = null;
let SELECTED_MODULE = null;
let LAST_BATCH = [];
const HISTORY_KEY = "bugscope_prediction_history";
const ALERT_STATE_KEY = "bugscope_alert_state";

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50)));
}
function loadAlertState() {
  try { return JSON.parse(localStorage.getItem(ALERT_STATE_KEY) || "{}"); } catch { return {}; }
}
function saveAlertState(st) {
  localStorage.setItem(ALERT_STATE_KEY, JSON.stringify(st));
}

const DEFAULTS = {
  loc: 800, loc_executable: 600, loc_comment: 80, loc_blank: 50, num_lines: 930,
  cyclomatic_complexity: 14, essential_complexity: 7, design_complexity: 6,
  branch_count: 18, decision_count: 14, edge_count: 45, node_count: 28,
  num_operators: 1400, num_operands: 1000, num_unique_operators: 28, num_unique_operands: 70,
  halstead_volume: 6000, halstead_effort: 8000, halstead_difficulty: 14,
  call_pairs: 10, condition_count: 12, parameter_count: 3, path_count: 45,
  percent_comments: 10, avg_block_length: 12, code_churn: 20,
  review_coverage: 0.55, test_coverage: 0.5, team_experience: 0.5,
  language: "Java", module_type: "Core",
};

const PRESETS = {
  risky: {
    loc: 4800, cyclomatic_complexity: 42, code_churn: 75, branch_count: 48,
    halstead_effort: 22000, path_count: 120, review_coverage: 0.32, test_coverage: 0.28,
    team_experience: 0.4, language: "Java", module_type: "Core",
  },
  healthy: {
    loc: 320, cyclomatic_complexity: 5, code_churn: 4, branch_count: 6,
    halstead_effort: 1200, path_count: 8, review_coverage: 0.94, test_coverage: 0.91,
    team_experience: 0.85, language: "Python", module_type: "Utility",
  },
  medium: {
    loc: 1400, cyclomatic_complexity: 16, code_churn: 28, branch_count: 20,
    halstead_effort: 9000, path_count: 40, review_coverage: 0.62, test_coverage: 0.58,
    team_experience: 0.55, language: "JavaScript", module_type: "API",
  },
};

function $(id) { return document.getElementById(id); }

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(a => a.classList.remove("active"));
  const page = $("page-" + name);
  if (page) page.classList.add("active");
  document.querySelectorAll('.nav-btn[data-page="' + name + '"]').forEach(a => a.classList.add("active"));
  history.replaceState(null, "", "#" + name);
}

document.querySelectorAll("[data-page]").forEach(el => {
  el.addEventListener("click", (e) => {
    const page = el.getAttribute("data-page");
    if (page) { e.preventDefault(); showPage(page); }
  });
});


async function loadSystemData() {
  try {
    const r = await fetch("data/system_data.json");
    if (!r.ok) throw new Error();
    return await r.json();
  } catch {
    return { system: { version: "1.0.0", predictions_24h: 1847, high_risk_open: 23, modules_scored_total: 10000, uptime_hours: 720 }, projects: [], modules: [], alerts: [], activity: [], quality_gates: {}, language_breakdown: {}, module_type_breakdown: {}, daily_predictions: [] };
  }
}

async function checkApi() {
  const el = $("api-pill");
  try {
    const r = await fetch(API + "/health");
    const j = await r.json();
    el.textContent = j.model_exists ? "API · ML ready" : "API · rule mode";
    el.classList.add("live");
  } catch {
    el.textContent = "API offline";
    el.classList.remove("live");
  }
}

async function loadMetrics() {
  try {
    const r = await fetch(API + "/metrics");
    if (!r.ok) throw new Error();
    return await r.json();
  } catch {
    return {
      best_model: "gradient_boosting", defect_rate: 0.513, n_samples: 10000,
      results: {
        gradient_boosting: { f1: 0.607, roc_auc: 0.684, accuracy: 0.630, precision: 0.666, recall: 0.558 },
        random_forest: { f1: 0.602, roc_auc: 0.684, accuracy: 0.636, precision: 0.686, recall: 0.537 },
      },
      feature_importance: {
        code_churn: 0.214, cyclomatic_complexity: 0.14, loc: 0.12, team_experience: 0.10,
        path_count: 0.09, branch_count: 0.08, review_coverage: 0.07, test_coverage: 0.06,
      },
    };
  }
}

async function loadEda() {
  try {
    const r = await fetch(API + "/eda");
    if (!r.ok) throw new Error();
    return await r.json();
  } catch {
    return { total_records: 10000, defective_modules: 5133, clean_modules: 4867, mean_loc: 545, mean_complexity: 12.1, mean_churn: 21.8 };
  }
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function renderOverview(eda, metrics, sys) {
  const s = sys.system || {};
  $("k-modules").textContent = (eda.total_records || s.modules_scored_total || 10000).toLocaleString();
  const rate = metrics.defect_rate ?? (eda.defective_modules / (eda.total_records || 1));
  $("k-rate").textContent = (rate * 100).toFixed(1) + "%";
  $("k-p24").textContent = (s.predictions_24h || 0).toLocaleString();
  $("k-high").textContent = s.high_risk_open ?? "—";
  const clean = 100 - rate * 100;
  $("bar-clean-pct").textContent = clean.toFixed(0) + "%";
  $("bar-def-pct").textContent = (rate * 100).toFixed(0) + "%";
  $("bar-clean").style.width = clean + "%";
  $("bar-def").style.width = rate * 100 + "%";
  $("sys-meta").textContent = `Trained ${fmtDate(s.last_model_train)} · Refresh ${fmtDate(s.last_data_refresh)}`;
  $("sys-status").innerHTML = [
    ["Environment", s.environment || "demo"],
    ["Uptime", (s.uptime_hours || 0) + " h"],
    ["API p50", (s.api_latency_ms_p50 || "—") + " ms"],
    ["Best model", (metrics.best_model || "—").replace(/_/g, " ")],
  ].map(([k, v]) => `<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">${k}</span><strong>${v}</strong></div>`).join("");
  const daily = sys.daily_predictions || [];
  const maxC = Math.max(...daily.map(d => d.count), 1);
  $("daily-bars").innerHTML = daily.map(d => {
    const h = Math.round((d.count / maxC) * 100);
    return `<div class="daily-col"><div class="daily-bar" style="height:${h}%" title="${d.count}"></div><span class="daily-lbl">${d.date.slice(5)}</span></div>`;
  }).join("");
  const hot = (sys.modules || []).filter(m => m.risk_band === "High").slice(0, 5);
  $("hot-modules").innerHTML = hot.map(m => `
    <tr data-mid="${m.id}">
      <td><strong>${m.name}</strong></td><td>${m.project}</td>
      <td><span class="badge b-High">High</span></td>
      <td>${(m.defect_probability * 100).toFixed(0)}%</td>
      <td>${m.cyclomatic_complexity}</td>
    </tr>`).join("") || "<tr><td colspan='5'>None</td></tr>";
  $("hot-modules").querySelectorAll("tr[data-mid]").forEach(tr => {
    tr.addEventListener("click", () => openModule(tr.getAttribute("data-mid")));
  });
  if ($("side-meta")) $("side-meta").textContent = "v" + (s.version || "1.0") + " · MIT";
}

function renderProjects(sys) {
  $("project-table").innerHTML = (sys.projects || []).map(p => `
    <tr>
      <td>${p.id}</td>
      <td><strong>${p.name}</strong><div style="font-size:0.72rem;color:var(--muted)">${p.repository || ""}</div></td>
      <td>${p.language_primary}</td>
      <td>${p.modules}</td>
      <td>${(p.defect_rate * 100).toFixed(0)}%</td>
      <td>${p.avg_complexity}</td>
      <td class="b-${(p.health || "").replace(/\s/g, "\\ ")}">${p.health}</td>
    </tr>`).join("");
}

function renderModules() {
  const risk = $("filter-risk")?.value || "";
  const q = ($("module-search")?.value || "").toLowerCase();
  let list = MODULES;
  if (risk) list = list.filter(m => m.risk_band === risk);
  if (q) list = list.filter(m => (m.name + m.project + m.id).toLowerCase().includes(q));
  $("module-table").innerHTML = list.map(m => `
    <tr data-mid="${m.id}">
      <td>${m.id}</td>
      <td><strong>${m.name}</strong></td>
      <td>${m.project}</td>
      <td>${m.language}</td>
      <td>${m.module_type}</td>
      <td>${m.loc.toLocaleString()}</td>
      <td>${m.cyclomatic_complexity}</td>
      <td>${(m.review_coverage * 100).toFixed(0)}%</td>
      <td><span class="badge b-${m.risk_band}">${m.risk_band}</span></td>
      <td>${(m.defect_probability * 100).toFixed(0)}%</td>
    </tr>`).join("") || "<tr><td colspan='10'>No matches</td></tr>";
  $("module-table").querySelectorAll("tr[data-mid]").forEach(tr => {
    tr.addEventListener("click", () => openModule(tr.getAttribute("data-mid")));
  });
}

function openModule(id) {
  const m = MODULES.find(x => x.id === id);
  if (!m) return;
  SELECTED_MODULE = m;
  $("drawer-title").textContent = m.name;
  $("drawer-meta").textContent = `${m.id} · ${m.project} · scored ${fmtDate(m.last_scored)}`;
  $("drawer-body").innerHTML = [
    ["Language", m.language], ["Type", m.module_type],
    ["LOC", m.loc.toLocaleString()], ["Complexity", m.cyclomatic_complexity],
    ["Churn", m.code_churn], ["Review", (m.review_coverage * 100).toFixed(0) + "%"],
    ["Test coverage", (m.test_coverage * 100).toFixed(0) + "%"],
    ["Team exp.", (m.team_experience * 100).toFixed(0) + "%"],
    ["Risk", m.risk_band], ["Probability", (m.defect_probability * 100).toFixed(1) + "%"],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  $("drawer").classList.add("open");
  $("drawer-bg").classList.add("open");
  $("drawer").setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  $("drawer").classList.remove("open");
  $("drawer-bg").classList.remove("open");
  $("drawer").setAttribute("aria-hidden", "true");
}
$("drawer-close").addEventListener("click", closeDrawer);
$("drawer-bg").addEventListener("click", closeDrawer);
$("drawer-score").addEventListener("click", () => {
  if (!SELECTED_MODULE) return;
  const m = SELECTED_MODULE;
  const map = {
    loc: m.loc, cyclomatic_complexity: m.cyclomatic_complexity, code_churn: m.code_churn,
    review_coverage: m.review_coverage, test_coverage: m.test_coverage, team_experience: m.team_experience,
  };
  Object.entries(map).forEach(([k, v]) => { const el = $(k); if (el) el.value = v; });
  if ($("language")) $("language").value = m.language;
  if ($("module_type")) $("module_type").value = m.module_type;
  closeDrawer();
  showPage("predict");
  toast("Loaded " + m.name + " into Predict");
});

function renderInsights(eda, metrics, sys) {
  $("insight-stats").innerHTML = [
    ["Total modules", eda.total_records], ["Defective", eda.defective_modules],
    ["Clean", eda.clean_modules], ["Mean LOC", Math.round(eda.mean_loc || 0)],
    ["Mean complexity", (eda.mean_complexity || 0).toFixed(1)],
    ["Projects", (sys.projects || []).length],
    ["Open alerts", (sys.alerts || []).filter(a => a.status === "Open").length],
  ].map(([k, v]) => `<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">${k}</span><strong>${v}</strong></div>`).join("");
  const imp = metrics.feature_importance || {};
  const max = Math.max(...Object.values(imp), 0.01);
  $("importance-bars").innerHTML = Object.entries(imp).slice(0, 8).map(([f, v]) => `
    <div class="bar-row"><div class="bar-label"><span>${f}</span><span>${(v * 100).toFixed(1)}%</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${(v / max) * 100}%"></div></div></div>`).join("");
  const langs = sys.language_breakdown || {};
  const maxL = Math.max(...Object.values(langs), 1);
  $("lang-bars").innerHTML = Object.entries(langs).map(([k, v]) => `
    <div class="bar-row"><div class="bar-label"><span>${k}</span><span>${v}</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${(v / maxL) * 100}%"></div></div></div>`).join("");
  const types = sys.module_type_breakdown || {};
  const maxT = Math.max(...Object.values(types), 1);
  $("type-bars").innerHTML = Object.entries(types).map(([k, v]) => `
    <div class="bar-row"><div class="bar-label"><span>${k}</span><span>${v}</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${(v / maxT) * 100}%"></div></div></div>`).join("");
}

function renderModel(metrics) {
  $("model-cards").innerHTML = Object.entries(metrics.results || {}).map(([name, m]) => `
    <div class="panel">
      <h3 style="color:var(--text);font-size:0.95rem;text-transform:none;letter-spacing:0">${name.replace(/_/g, " ")}</h3>
      ${["accuracy", "precision", "recall", "f1", "roc_auc"].map(k => `
        <div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border);font-size:0.88rem">
          <span style="color:var(--muted)">${k}</span>
          <strong>${typeof m[k] === "number" ? (k === "roc_auc" ? m[k].toFixed(3) : (m[k] * 100).toFixed(1) + "%") : "—"}</strong>
        </div>`).join("")}
    </div>`).join("");
}

function renderAlerts() {
  const sev = $("filter-alert")?.value || "";
  const st = $("filter-alert-status")?.value || "";
  const local = loadAlertState();
  let items = (SYSTEM?.alerts || []).map(a => ({
    ...a,
    status: local[a.id]?.status || a.status,
  }));
  if (sev) items = items.filter(a => a.severity === sev);
  if (st) items = items.filter(a => a.status === st);
  $("alert-list").innerHTML = items.map(a => {
    const dot = (a.severity || "").toLowerCase() === "high" ? "high" : (a.severity || "").toLowerCase() === "low" ? "low" : "med";
    return `<div class="list-item" data-alert-id="${a.id}">
      <span class="dot ${dot}"></span>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;gap:0.5rem;flex-wrap:wrap">
          <strong>${a.module} · ${a.project}</strong>
          <span style="font-size:0.75rem;color:var(--muted)">${a.status} · ${fmtDate(a.created_at)}</span>
        </div>
        <div style="font-size:0.85rem;color:var(--muted);margin-top:0.2rem">${a.description}</div>
        <div style="font-size:0.72rem;margin-top:0.3rem;color:var(--accent-2)">Owner: ${a.owner || "—"} · ${a.id}</div>
        <div class="alert-actions">
          ${a.status !== "Acknowledged" && a.status !== "Closed" ? `<button type="button" class="btn btn-ghost btn-sm" data-alert-act="ack" data-id="${a.id}">Acknowledge</button>` : ""}
          ${a.status !== "Closed" ? `<button type="button" class="btn btn-ghost btn-sm" data-alert-act="close" data-id="${a.id}">Resolve</button>` : ""}
          ${a.status === "Closed" ? `<button type="button" class="btn btn-ghost btn-sm" data-alert-act="reopen" data-id="${a.id}">Reopen</button>` : ""}
        </div>
      </div>
    </div>`;
  }).join("") || "<p style='color:var(--muted);padding:0.5rem'>No alerts match filters</p>";

  $("alert-list").querySelectorAll("[data-alert-act]").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const id = btn.getAttribute("data-id");
      const act = btn.getAttribute("data-alert-act");
      const state = loadAlertState();
      state[id] = state[id] || {};
      if (act === "ack") state[id].status = "Acknowledged";
      if (act === "close") state[id].status = "Closed";
      if (act === "reopen") state[id].status = "Open";
      saveAlertState(state);
      renderAlerts();
      toast(act === "ack" ? "Acknowledged" : act === "close" ? "Resolved" : "Reopened");
    });
  });
}

function renderActivity(sys) {
  $("activity-list").innerHTML = (sys.activity || []).map(a => `
    <div class="act-row">
      <span class="act-ts">${fmtDate(a.ts)}</span>
      <span class="act-tag">${a.action}</span>
      <span><strong>${a.actor}</strong> — ${a.detail}</span>
    </div>`).join("");
}

function renderGates(sys) {
  const g = sys.quality_gates || {};
  $("quality-gates").innerHTML = [
    ["Review min", ((g.review_coverage_min || 0) * 100).toFixed(0) + "%"],
    ["Test min", ((g.test_coverage_min || 0) * 100).toFixed(0) + "%"],
    ["Max cyclomatic", g.max_cyclomatic ?? "—"],
    ["Max LOC core", g.max_loc_core ?? "—"],
    ["High risk ≥", ((g.high_risk_threshold || 0) * 100).toFixed(0) + "%"],
    ["Medium ≥", ((g.medium_risk_threshold || 0) * 100).toFixed(0) + "%"],
  ].map(([l, v]) => `<div class="gate"><div class="g-l">${l}</div><div class="g-v">${v}</div></div>`).join("");
}

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  Object.entries(p).forEach(([k, v]) => {
    const el = $(k);
    if (el) el.value = v;
  });
  toast("Preset: " + name);
}

document.querySelectorAll("[data-preset]").forEach(btn => {
  btn.addEventListener("click", () => applyPreset(btn.getAttribute("data-preset")));
});

function buildPayload() {
  const p = { ...DEFAULTS };
  ["loc", "cyclomatic_complexity", "code_churn", "branch_count", "halstead_effort",
   "path_count", "review_coverage", "test_coverage", "team_experience"].forEach(k => {
    const el = $(k);
    if (el) p[k] = parseFloat(el.value);
  });
  p.language = $("language").value;
  p.module_type = $("module_type").value;
  return p;
}

function computeFactors(d) {
  const factors = [
    { key: "loc", label: "LOC", raw: Math.min(d.loc / 5000, 1) * 0.12, direction: "up" },
    { key: "cyclomatic_complexity", label: "Cyclomatic complexity", raw: Math.min(d.cyclomatic_complexity / 40, 1) * 0.2, direction: "up" },
    { key: "code_churn", label: "Code churn", raw: Math.min(d.code_churn / 80, 1) * 0.15, direction: "up" },
    { key: "review_coverage", label: "Review coverage", raw: (1 - d.review_coverage) * 0.2, direction: d.review_coverage < 0.7 ? "up" : "down" },
    { key: "test_coverage", label: "Test coverage", raw: (1 - d.test_coverage) * 0.18, direction: d.test_coverage < 0.65 ? "up" : "down" },
    { key: "team_experience", label: "Team experience", raw: (1 - d.team_experience) * 0.15, direction: d.team_experience < 0.6 ? "up" : "down" },
  ];
  return factors.map(f => ({
    ...f,
    pct: Math.round(f.raw * 1000) / 10,
  })).sort((a, b) => b.raw - a.raw);
}

function offlinePredict(d) {
  const factors = computeFactors(d);
  let score = factors.reduce((s, f) => s + f.raw, 0);
  score = Math.max(0.05, Math.min(0.95, score));
  const level = score >= 0.6 ? "High" : score >= 0.35 ? "Medium" : "Low";
  return {
    defective: score >= 0.5,
    probability: Math.round(score * 1000) / 10,
    defect_probability: Math.round(score * 10000) / 10000,
    risk_band: level,
    recommendation:
      level === "High" ? "Prioritize review, tests, and refactoring" :
      level === "Medium" ? "Increase review coverage and targeted tests" :
      "Maintain current quality practices",
    mode: "offline",
    factors,
    inputs: { ...d },
  };
}

function evaluateGates(d, sys) {
  const g = sys?.quality_gates || {};
  const checks = [];
  if (g.review_coverage_min != null) {
    const ok = d.review_coverage >= g.review_coverage_min;
    checks.push({ label: "Review coverage ≥ " + Math.round(g.review_coverage_min * 100) + "%", ok, value: Math.round(d.review_coverage * 100) + "%" });
  }
  if (g.test_coverage_min != null) {
    const ok = d.test_coverage >= g.test_coverage_min;
    checks.push({ label: "Test coverage ≥ " + Math.round(g.test_coverage_min * 100) + "%", ok, value: Math.round(d.test_coverage * 100) + "%" });
  }
  if (g.max_cyclomatic != null) {
    const ok = d.cyclomatic_complexity <= g.max_cyclomatic;
    checks.push({ label: "CC ≤ " + g.max_cyclomatic, ok, value: String(d.cyclomatic_complexity) });
  }
  if (g.max_loc_core != null && d.module_type === "Core") {
    const ok = d.loc <= g.max_loc_core;
    checks.push({ label: "Core LOC ≤ " + g.max_loc_core, ok, value: String(d.loc) });
  }
  return checks;
}

function renderExplanations(r) {
  const el = $("explain-bars");
  if (!el) return;
  const factors = r.factors || (r.inputs ? computeFactors(r.inputs) : []);
  if (!factors.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:0.88rem">No factor breakdown for this response.</p>';
    return;
  }
  const max = Math.max(...factors.map(f => f.pct), 1);
  el.innerHTML = factors.map(f => `
    <div class="explain-row">
      <span class="explain-label">${f.label}</span>
      <div class="explain-track"><div class="explain-fill ${f.direction === "up" ? "up" : "down"}" style="width:${(f.pct / max) * 100}%"></div></div>
      <span class="explain-val">${f.direction === "up" ? "+" : "−"}${f.pct}%</span>
    </div>`).join("") +
    '<p style="margin-top:0.55rem;font-size:0.75rem;color:var(--muted)">Red = increases defect risk · Green = protective / lower contribution</p>';
}

function renderGateChecks(d) {
  const el = $("gate-checks");
  if (!el) return;
  const checks = evaluateGates(d, SYSTEM);
  if (!checks.length) { el.innerHTML = ""; return; }
  el.innerHTML = checks.map(c => `
    <div class="gate-check">
      <span>${c.label}</span>
      <span class="${c.ok ? "ok" : "fail"}">${c.ok ? "Pass" : "Fail"} · ${c.value}</span>
    </div>`).join("");
}

function pushHistory(r, payload) {
  const list = loadHistory();
  list.unshift({
    ts: new Date().toISOString(),
    risk_band: r.risk_band,
    probability: r.probability,
    mode: r.mode,
    loc: payload.loc,
    cc: payload.cyclomatic_complexity,
    language: payload.language,
    module_type: payload.module_type,
  });
  saveHistory(list);
  renderHistory();
}

function renderHistory() {
  const el = $("history-list");
  if (!el) return;
  const list = loadHistory();
  if (!list.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:0.88rem">No scores yet.</p>';
    return;
  }
  el.innerHTML = list.slice(0, 12).map(h => `
    <div class="history-item">
      <span><span class="badge b-${h.risk_band}">${h.risk_band}</span> ${h.probability}% · LOC ${h.loc} · CC ${h.cc}</span>
      <span style="color:var(--muted);font-size:0.75rem">${h.language || ""} ${h.module_type || ""} · ${fmtDate(h.ts)} · ${h.mode || ""}</span>
    </div>`).join("");
}

function showResult(r, payload) {
  LAST_RESULT = r;
  if (payload && !r.inputs) r.inputs = payload;
  if (payload && !r.factors) r.factors = computeFactors(payload);
  $("copy-result").disabled = false;
  $("result-panel").innerHTML = `
    <span class="risk-pill risk-${r.risk_band}">${r.risk_band} risk</span>
    <div class="prob">${r.probability}%</div>
    <div style="color:var(--muted);font-size:0.85rem">Defect probability · ${r.mode || "ml"}</div>
    <div style="font-weight:650;margin:0.5rem 0">${r.defective ? "Likely defective" : "Likely clean"}</div>
    <div class="rec">${r.recommendation}</div>`;
  renderExplanations(r);
  if (payload) {
    renderGateChecks(payload);
    pushHistory(r, payload);
  }
}

$("predict-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("predict-btn");
  btn.disabled = true;
  btn.textContent = "Scoring…";
  const payload = buildPayload();
  try {
    const res = await fetch(API + "/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    showResult(data, payload);
  } catch {
    showResult(offlinePredict(payload), payload);
  } finally {
    btn.disabled = false;
    btn.textContent = "Score module";
  }
});

$("reset-btn").addEventListener("click", () => {
  Object.entries(DEFAULTS).forEach(([k, v]) => {
    const el = $(k);
    if (el && typeof v !== "object") el.value = v;
  });
  $("result-panel").innerHTML = '<p style="color:var(--muted)">Submit metrics or pick a preset.</p>';
  $("copy-result").disabled = true;
  LAST_RESULT = null;
  if ($("explain-bars")) $("explain-bars").innerHTML = '<p style="color:var(--muted);font-size:0.88rem">Score a module to see factor contributions.</p>';
  if ($("gate-checks")) $("gate-checks").innerHTML = "";
});

$("copy-result").addEventListener("click", async () => {
  if (!LAST_RESULT) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(LAST_RESULT, null, 2));
    toast("Result copied to clipboard");
  } catch {
    toast("Copy failed");
  }
});

function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(c => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

$("export-modules")?.addEventListener("click", () => {
  const rows = [["id", "name", "project", "language", "type", "loc", "cc", "review", "risk", "prob"]];
  (MODULES || []).forEach(m => rows.push([m.id, m.name, m.project, m.language, m.module_type, m.loc, m.cyclomatic_complexity, m.review_coverage, m.risk_band, m.defect_probability]));
  downloadCsv("bugscope-modules.csv", rows);
  toast("Modules exported");
});

$("export-alerts")?.addEventListener("click", () => {
  const st = loadAlertState();
  const rows = [["id", "module", "project", "severity", "status", "owner", "created_at", "description"]];
  (SYSTEM?.alerts || []).forEach(a => {
    const status = st[a.id]?.status || a.status;
    rows.push([a.id, a.module, a.project, a.severity, status, a.owner, a.created_at, a.description]);
  });
  downloadCsv("bugscope-alerts.csv", rows);
  toast("Alerts exported");
});

$("export-history")?.addEventListener("click", () => {
  const list = loadHistory();
  const rows = [["ts", "risk", "probability", "loc", "cc", "language", "module_type", "mode"]];
  list.forEach(h => rows.push([h.ts, h.risk_band, h.probability, h.loc, h.cc, h.language, h.module_type, h.mode]));
  downloadCsv("bugscope-history.csv", rows);
  toast(list.length ? "History exported" : "No history to export");
});

async function scoreOne(payload) {
  try {
    const res = await fetch(API + "/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return offlinePredict(payload);
  }
}

$("batch-run")?.addEventListener("click", async () => {
  const text = ($("batch-input")?.value || "").trim();
  if (!text) { toast("Paste CSV rows first"); return; }
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const start = /^loc[,;\s]/i.test(lines[0]) ? 1 : 0;
  const items = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(/[,;\t]/).map(s => s.trim());
    if (parts.length < 6) continue;
    items.push({
      loc: parseFloat(parts[0]) || 800,
      cyclomatic_complexity: parseFloat(parts[1]) || 14,
      code_churn: parseFloat(parts[2]) || 20,
      review_coverage: parseFloat(parts[3]) || 0.55,
      test_coverage: parseFloat(parts[4]) || 0.5,
      team_experience: parseFloat(parts[5]) || 0.5,
      language: parts[6] || "Java",
      module_type: parts[7] || "Core",
      branch_count: 18, path_count: 45, halstead_effort: 8000,
    });
  }
  if (!items.length) { toast("No valid rows"); return; }
  const btn = $("batch-run");
  btn.disabled = true;
  btn.textContent = "Scoring…";
  LAST_BATCH = [];
  for (const p of items) {
    const r = await scoreOne(p);
    LAST_BATCH.push({ ...p, ...r });
  }
  const tbody = $("batch-body");
  const table = $("batch-table");
  if (tbody && table) {
    table.style.display = "";
    tbody.innerHTML = LAST_BATCH.map((r, i) => `
      <tr><td>${i + 1}</td><td>${r.loc}</td><td>${r.cyclomatic_complexity}</td>
      <td><span class="badge b-${r.risk_band}">${r.risk_band}</span></td>
      <td>${r.probability}%</td><td>${r.mode || ""}</td></tr>`).join("");
  }
  $("batch-export").disabled = false;
  btn.disabled = false;
  btn.textContent = "Score batch";
  toast("Scored " + LAST_BATCH.length + " modules");
});

$("batch-export")?.addEventListener("click", () => {
  if (!LAST_BATCH.length) return;
  const rows = [["loc", "cc", "churn", "review", "test", "experience", "language", "type", "risk", "probability", "mode"]];
  LAST_BATCH.forEach(r => rows.push([
    r.loc, r.cyclomatic_complexity, r.code_churn, r.review_coverage, r.test_coverage,
    r.team_experience, r.language, r.module_type, r.risk_band, r.probability, r.mode
  ]));
  downloadCsv("bugscope-batch.csv", rows);
  toast("Batch exported");
});

$("filter-risk")?.addEventListener("change", renderModules);
$("module-search")?.addEventListener("input", renderModules);
$("filter-alert")?.addEventListener("change", renderAlerts);
$("filter-alert-status")?.addEventListener("change", renderAlerts);

function runGlobalSearch(q) {
  q = (q || "").trim().toLowerCase();
  if (!q) return null;
  const mods = (MODULES || []).filter(m =>
    (m.name + " " + m.id + " " + m.project + " " + (m.language || "")).toLowerCase().includes(q)
  ).slice(0, 6);
  const projs = (SYSTEM?.projects || []).filter(p => p.name.toLowerCase().includes(q)).slice(0, 3);
  const alerts = (SYSTEM?.alerts || []).filter(a =>
    (a.module + " " + a.project + " " + (a.description || "")).toLowerCase().includes(q)
  ).slice(0, 3);
  return { mods, projs, alerts };
}

function ensureSearchHits() {
  let box = document.getElementById("search-hits");
  if (!box) {
    box = document.createElement("div");
    box.id = "search-hits";
    box.className = "search-hits";
    $("global-search").parentElement.appendChild(box);
  }
  return box;
}

$("global-search").addEventListener("input", (e) => {
  const q = e.target.value;
  const box = ensureSearchHits();
  const res = runGlobalSearch(q);
  if (!res || (!res.mods.length && !res.projs.length && !res.alerts.length)) {
    box.classList.remove("show");
    box.innerHTML = "";
    return;
  }
  let html = "";
  res.mods.forEach(m => {
    html += `<div class="search-hit" data-kind="module" data-id="${m.id}"><strong>${m.name}</strong><div class="sh-meta">Module · ${m.project} · ${m.risk_band || ""}</div></div>`;
  });
  res.projs.forEach(p => {
    html += `<div class="search-hit" data-kind="project" data-id="${p.id || p.name}"><strong>${p.name}</strong><div class="sh-meta">Project · ${p.language || ""}</div></div>`;
  });
  res.alerts.forEach(a => {
    html += `<div class="search-hit" data-kind="alert" data-id="${a.id}"><strong>${a.module}</strong><div class="sh-meta">Alert · ${a.severity} · ${a.status}</div></div>`;
  });
  box.innerHTML = html;
  box.classList.add("show");
  box.querySelectorAll(".search-hit").forEach(hit => {
    hit.addEventListener("click", () => {
      const kind = hit.getAttribute("data-kind");
      const id = hit.getAttribute("data-id");
      box.classList.remove("show");
      if (kind === "module") {
        showPage("modules");
        openModule(id);
        toast("Opened module");
      } else if (kind === "project") {
        showPage("projects");
        toast("Project: " + hit.querySelector("strong").textContent);
      } else {
        showPage("alerts");
        toast("Alert " + id);
      }
    });
  });
});

$("global-search").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    ensureSearchHits().classList.remove("show");
    return;
  }
  if (e.key !== "Enter") return;
  const q = e.target.value.trim().toLowerCase();
  if (!q) return;
  const res = runGlobalSearch(q);
  ensureSearchHits().classList.remove("show");
  if (res?.mods?.[0]) {
    showPage("modules");
    $("module-search").value = q;
    renderModules();
    openModule(res.mods[0].id);
    toast("Found " + res.mods[0].name);
  } else if (res?.projs?.[0]) {
    showPage("projects");
    toast("Project: " + res.projs[0].name);
  } else if (res?.alerts?.[0]) {
    showPage("alerts");
    toast("Alert: " + res.alerts[0].module);
  } else {
    toast("No match for “" + q + "”");
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) ensureSearchHits().classList.remove("show");
});

(async function init() {
  const pages = ["overview", "projects", "modules", "predict", "insights", "model", "alerts", "activity"];
  const hash = (location.hash || "#overview").replace("#", "");
  showPage(pages.includes(hash) ? hash : "overview");
  checkApi();
  const [metrics, eda, sys] = await Promise.all([loadMetrics(), loadEda(), loadSystemData()]);
  SYSTEM = sys;
  MODULES = sys.modules || [];
  renderOverview(eda, metrics, sys);
  renderProjects(sys);
  renderModules();
  renderInsights(eda, metrics, sys);
  renderModel(metrics);
  renderAlerts();
  renderActivity(sys);
  renderGates(sys);
  renderHistory();
})();
