/* Scent Lab — website interface. Rules live in agent.js, data in data.js. */
(function () {
  const ORIGINAL = SCENT_DATA.products;
  const KEY = "scentlab-demo-v1";
  const $ = s => document.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString("en-US");
  const sar = n => fmt(n) + " SAR";
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- state (saved in this browser only) ----------
  let saved = { prices: {}, log: [], comp: {}, meta: {} };
  try { const raw = localStorage.getItem(KEY); if (raw) saved = Object.assign(saved, JSON.parse(raw)); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} };
  const products = () => ORIGINAL.map(p => Object.assign({}, p, {
    basePrice: p.price,
    price: saved.prices[p.id] != null ? saved.prices[p.id] : p.price,
    compRef: p.comp,                                       // prices when the sales history happened
    comp: Object.assign({}, p.comp, (saved.comp || {})[p.id] || {})  // prices you updated by hand
  }));

  // ---------- tabs ----------
  function show(tab) {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === tab));
    window.scrollTo({ top: 0 });
    if (tab === "briefing") renderBriefing();
    if (tab === "log") renderLog();
    if (tab === "products") renderProducts();
    if (tab === "dashboard") renderDashboard();
  }
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => show(b.dataset.tab)));
  document.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => show(b.dataset.goto)));

  // ---------- helpers ----------
  const last4 = p => p.sales.slice(-4), prev4 = p => p.sales.slice(-8, -4);
  const sum = a => a.reduce((x, y) => x + y, 0);
  const coverDays = p => { const d = sum(last4(p)) / 4 / 7; return d > 0 ? p.stock / d : Infinity; };
  const cheapest = p => { const v = Object.values(p.comp).filter(x => x != null); return v.length ? Math.min(...v) : null; };

  // ---------- dashboard ----------
  function renderDashboard() {
    const ps = products();
    const hist = ORIGINAL; // history was sold at the original prices
    const rev = sum(hist.map(p => sum(last4(p)) * p.price));
    const revPrev = sum(hist.map(p => sum(prev4(p)) * p.price));
    const prof = sum(hist.map(p => sum(last4(p)) * (p.price - p.cost)));
    const margin = prof / rev;
    const slow = ps.filter(p => coverDays(p) > 60).length;
    const above = ps.filter(p => { const c = cheapest(p); return c != null && p.price > c; }).length;
    const change = (rev - revPrev) / revPrev;
    $("#kpis").innerHTML = [
      { l: "Revenue · 4 weeks", v: sar(rev), n: `${change >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(change * 100))}% vs previous 4 weeks`, c: change >= 0 ? "good" : "bad" },
      { l: "Gross profit · 4 weeks", v: sar(prof), n: "at current supplier cost", c: "" },
      { l: "Average margin", v: Math.round(margin * 100) + "%", n: "target: 20% mid · 30% luxury", c: margin >= 0.25 ? "good" : "warn" },
      { l: "Slow movers", v: slow, n: "over 60 days of stock", c: slow ? "warn" : "good" },
      { l: "Priced above a competitor", v: `${above} / ${ps.length}`, n: "a cheaper site exists", c: above > 4 ? "bad" : "good" }
    ].map(k => `<div class="kpi ${k.c}"><div class="label">${k.l}</div><div class="value">${k.v}</div><div class="note">${k.n}</div></div>`).join("");

    // trend chart
    const weeks = SCENT_DATA.weeks;
    const vals = weeks.map((w, i) => sum(hist.map(p => p.sales[i] * p.price)));
    const W = 520, H = 220, pad = 34, bw = (W - pad * 2) / vals.length;
    const max = Math.max(...vals) * 1.1;
    const bars = vals.map((v, i) => {
      const h = (v / max) * (H - pad * 2), x = pad + i * bw + 6, y = H - pad - h;
      const lbl = new Date(weeks[i] + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      return `<rect x="${x}" y="${y}" width="${bw - 12}" height="${h}" rx="4" fill="var(--accent)" opacity="${i >= 4 ? 1 : .45}"><title>${lbl}: ${sar(v)}</title></rect>
        <text x="${x + (bw - 12) / 2}" y="${y - 5}" text-anchor="middle">${(v / 1000).toFixed(1)}k</text>
        <text x="${x + (bw - 12) / 2}" y="${H - pad + 15}" text-anchor="middle">${lbl}</text>`;
    }).join("");
    $("#trend").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Weekly revenue for the last 8 weeks">
      <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="var(--line)"/>${bars}</svg>
      <p class="muted" style="margin:6px 0 0;font-size:.82rem">Dark bars = last 4 weeks. Light bars = the 4 weeks before.</p>`;

    // attention
    const recs = runAgent(ps);
    const items = recs.filter(r => r.dataIssue || r.needsReview || r.action === "raise" || r.action === "offer")
      .slice(0, 6).map(r => `<li><span class="pill ${r.dataIssue ? "hold" : r.needsReview ? "review" : r.action}">${r.dataIssue ? "Check data" : r.needsReview ? "Review" : r.action[0].toUpperCase() + r.action.slice(1)}</span>
        <span><b>${esc(r.name)}</b> · ${esc(r.reason.split(". ")[0])}.</span></li>`);
    $("#attention").innerHTML = items.join("") || `<li>Nothing needs attention right now.</li>`;
  }

  // ---------- products ----------
  function renderProducts() {
    const g = $("#fGender").value, t = $("#fTier").value;
    const ps = products().filter(p => (g === "All" || p.gender === g) && (t === "All" || p.tier === t));
    const head = `<tr><th>Perfume</th><th>Tier</th><th class="num">Cost</th><th class="num">Our price</th>
      <th class="num">Golden Scent</th><th class="num">Faces</th><th class="num">Sephora</th>
      <th class="num">Stock</th><th class="num">Sales / wk</th><th class="num">Days of stock</th><th class="num">Margin</th></tr>`;
    const rows = ps.map(p => {
      const all = [p.price, ...Object.values(p.comp).filter(x => x != null)];
      const min = Math.min(...all);
      const cell = v => v == null ? `<td class="num muted">—</td>` : `<td class="num ${v === min ? "cheap" : ""}">${v}</td>`;
      const cov = coverDays(p);
      return `<tr><td><b>${esc(p.name)}</b><br><span class="muted">${esc(p.brand)} · ${p.gender}</span></td><td>${p.tier}</td>
        <td class="num">${p.cost}</td>${cell(p.price)}${cell(p.comp["Golden Scent"])}${cell(p.comp["Faces"])}${cell(p.comp["Sephora"])}
        <td class="num">${p.stock}</td><td class="num">${(sum(last4(p)) / 4).toFixed(1)}</td>
        <td class="num">${isFinite(cov) ? Math.round(cov) : "—"}</td><td class="num">${Math.round((p.price - p.cost) / p.price * 100)}%</td></tr>`;
    }).join("");
    $("#ptable").innerHTML = head + rows;
  }
  // update a competitor price by hand (the agent "senses" it on the next run)
  const compSel = $("#cProd");
  compSel.innerHTML = ORIGINAL.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  const showCurrent = () => {
    const p = products().find(x => x.id === compSel.value), c = $("#cComp").value;
    $("#cPrice").value = p.comp[c] != null ? p.comp[c] : "";
    $("#cPrice").placeholder = p.comp[c] != null ? "" : "not sold there";
  };
  compSel.addEventListener("change", showCurrent); $("#cComp").addEventListener("change", showCurrent); showCurrent();
  $("#cSave").addEventListener("click", () => {
    const id = compSel.value, c = $("#cComp").value, v = $("#cPrice").value.trim();
    const n = v === "" ? null : Number(v);
    if (n !== null && (!isFinite(n) || n <= 0)) { $("#cMsg").textContent = "Please type a price above 0, or leave it empty for “not sold”."; return; }
    saved.comp = saved.comp || {}; saved.comp[id] = Object.assign({}, saved.comp[id], { [c]: n }); save();
    $("#cMsg").textContent = `Saved: ${c} now ${n === null ? "does not sell it" : "sells it for " + n + " SAR"}. Run the agent again to see its new advice.`;
    renderProducts();
  });
  $("#cUndo").addEventListener("click", () => { saved.comp = {}; save(); showCurrent(); renderProducts(); $("#cMsg").textContent = "Competitor prices are back to the real prices checked on 19 Nov 2026."; });
  $("#fGender").addEventListener("change", renderProducts);
  $("#fTier").addEventListener("change", renderProducts);

  // ---------- agent ----------
  let currentRecs = [];
  function recCard(r) {
    const label = r.dataIssue ? "Check data" : { raise: "Raise", lower: "Lower", offer: "Offer", keep: "Keep" }[r.action];
    const priceHtml = r.newPrice !== r.oldPrice
      ? `<span class="old">${r.oldPrice}</span>${r.newPrice} SAR <div class="muted" style="font-size:.85rem;font-family:Inter">${r.change > 0 ? "+" : ""}${r.change}%</div>`
      : `${r.oldPrice} SAR <div class="muted" style="font-size:.85rem;font-family:Inter">no change</div>`;
    const opts = r.options.map(o => `<tr><td>${esc(o.label)}${o.belowFloor ? " <span class='muted'>(breaks margin)</span>" : ""}</td>
      <td class="num">${o.price}</td><td class="num">${fmt(o.profit)}</td></tr>`).join("");
    const actionable = !r.dataIssue && r.newPrice !== r.oldPrice;
    return `<div class="rec" id="rec-${r.id}">
      <div class="rec-top">
        <div><div class="rec-name">${esc(r.name)}</div><div class="rec-brand">${esc(r.brand)} · ${r.tier}</div>
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
            <span class="pill ${r.dataIssue ? "hold" : r.action}">${label}</span>
            <span class="pill ${r.confidence}">Confidence: ${r.confidence}</span>
            ${r.needsReview ? `<span class="pill review">Owner review</span>` : ""}
          </div></div>
        <div class="price">${priceHtml}</div>
      </div>
      <details ${r.needsReview || r.dataIssue ? "open" : ""}><summary>Show reasoning (4 steps)</summary>
      <div class="rec-body">
        <div class="step"><h4>1 · Sense (Intelligence)</h4><ul>${r.facts.map(f => `<li>${esc(f)}</li>`).join("")}</ul></div>
        <div class="step"><h4>2 · Options (Design)</h4>
          <table><tr><th>Option</th><th class="num">Price</th><th class="num">Profit · 4 wks</th></tr>${opts}</table></div>
        <div class="step"><h4>3 · Recommend (Choice)</h4><p style="margin:0"><b>${esc(r.rule)}</b><br>${esc(r.reason)}</p>
          <p class="muted" style="margin:.4rem 0 0">Expected profit next 4 weeks: ${sar(r.profitBefore)} → ${sar(r.profitAfter)}</p></div>
        <div class="step"><h4>4 · What to check before approving</h4><ul>${r.checks.map(c => `<li>${esc(c)}</li>`).join("")}</ul></div>
      </div></details>
      ${actionable ? `<div class="rec-actions"><button class="btn ok" data-approve="${r.id}">Approve ${r.newPrice} SAR</button>
        <button class="btn no" data-reject="${r.id}">Reject</button><span class="muted" data-status="${r.id}"></span></div>` : ""}
    </div>`;
  }
  function runAndRender() {
    currentRecs = runAgent(products());
    const changes = currentRecs.filter(r => r.dataIssue || r.newPrice !== r.oldPrice);
    const keeps = currentRecs.filter(r => !r.dataIssue && r.newPrice === r.oldPrice);
    const count = a => currentRecs.filter(r => r.action === a && !r.dataIssue).length;
    $("#runInfo").textContent = `Ran at ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} on ${currentRecs.length} perfumes.`;
    const safe = changes.filter(r => !r.needsReview && !r.dataIssue);
    $("#runSummary").innerHTML = `<span class="chip">↑ Raise: ${count("raise")}</span><span class="chip">↓ Lower: ${count("lower")}</span>
      <span class="chip">% Offer: ${count("offer")}</span><span class="chip">= Keep: ${keeps.length}</span>
      <span class="chip">⚠ Owner review: ${currentRecs.filter(r => r.needsReview).length}</span>
      ${safe.length ? `<button class="btn" id="approveSafe">Approve all ${safe.length} without warnings</button>` : ""}`;
    $("#recs").innerHTML = changes.map(recCard).join("") +
      (keeps.length ? `<h3 style="margin:22px 0 10px">No change needed (${keeps.length})</h3>` + keeps.map(recCard).join("") : "");
    const as = $("#approveSafe");
    if (as) as.addEventListener("click", () => { safe.forEach(r => decide(r.id, true)); });
  }
  function decide(id, ok) {
    const r = currentRecs.find(x => x.id === id);
    if (!r) return;
    if (ok) { saved.prices[id] = r.newPrice; saved.meta = saved.meta || {}; saved.meta[id] = { action: r.action }; }
    saved.log.unshift({ t: new Date().toISOString(), id, name: r.name, old: r.oldPrice, nw: r.newPrice, rule: r.rule, ok });
    save();
    const card = document.getElementById("rec-" + id);
    if (card) {
      card.classList.add("done");
      card.querySelectorAll("[data-approve],[data-reject]").forEach(b => (b.disabled = true));
      const st = card.querySelector(`[data-status="${id}"]`);
      if (st) st.textContent = ok ? `Approved: price is now ${r.newPrice} SAR` : "Rejected: price stays the same";
    }
  }
  $("#runBtn").addEventListener("click", runAndRender);
  $("#recs").addEventListener("click", e => {
    const a = e.target.closest("[data-approve]"), rj = e.target.closest("[data-reject]");
    if (a) decide(a.dataset.approve, true);
    if (rj) decide(rj.dataset.reject, false);
  });

  // ---------- what-if ----------
  let sc = "comp";
  const forms = {
    comp: `<label>Competitor<select id="wComp"><option>Golden Scent</option><option>Faces</option><option>Sephora</option><option>All</option></select></label>
      <label>Price drop (%)<input id="wPct" type="number" value="10" min="1" max="60"></label>`,
    cost: `<label>Supplier cost increase (%)<input id="wCost" type="number" value="15" min="1" max="80"></label>
      <span class="muted">Example: shipping costs go up.</span>`,
    season: `<label>Season<select id="wSeason"><option value="40">Ramadan (+40% demand)</option><option value="50">Eid (+50% demand)</option><option value="30">National Day (+30% demand)</option></select></label>
      <label>Demand increase (%)<input id="wDemand" type="number" value="40" min="0" max="200"></label>`,
    margin: `<label>Mid-range minimum margin (%)<input id="wMid" type="number" value="15" min="0" max="60"></label>
      <label>Luxury minimum margin (%)<input id="wLux" type="number" value="30" min="0" max="70"></label>`,
    goal: `<label>Perfume<select id="wProd">${ORIGINAL.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
      <label>Profit target · next 4 weeks (SAR)<input id="wTarget" type="number" value="4000" min="0" step="100"></label>`
  };
  function setScenario(name) {
    sc = name;
    document.querySelectorAll(".sc").forEach(b => b.classList.toggle("active", b.dataset.sc === name));
    $("#scInputs").innerHTML = forms[name] + `<button class="btn primary" id="wRun">Run scenario</button>`;
    $("#scOut").innerHTML = "";
    $("#wRun").addEventListener("click", runScenario);
    const season = $("#wSeason");
    if (season) season.addEventListener("change", () => ($("#wDemand").value = season.value));
    if (name === "goal") {
      const prod = $("#wProd"), tgt = $("#wTarget");
      const setDefault = () => { const p = products().find(x => x.id === prod.value); tgt.value = Math.round(profit4w(p, p.price, 1, DEFAULT_SETTINGS) / 100) * 100; };
      prod.addEventListener("change", setDefault); setDefault();
    }
    runScenario();
  }
  document.querySelectorAll(".sc").forEach(b => b.addEventListener("click", () => setScenario(b.dataset.sc)));

  function bandsHtml(b) {
    const names = { worst: "Worst case (demand −20%)", likely: "Most likely", best: "Best case (demand +20%)" };
    return `<div class="bands">${["worst", "likely", "best"].map(k => {
      const d = b[k].after - b[k].before;
      return `<div class="band ${k}"><div class="t">${names[k]}</div>
        <div class="d muted">Keep today's prices: ${sar(b[k].before)}</div>
        <div class="v">${sar(b[k].after)}</div>
        <div class="d ${d >= 0 ? "up" : "down"}">Following the agent: ${d >= 0 ? "+" : "−"}${sar(Math.abs(d))}</div></div>`;
    }).join("")}</div>`;
  }
  function runScenario() {
    const ps = products();
    if (sc === "goal") {
      const p = ps.find(x => x.id === $("#wProd").value), target = +$("#wTarget").value;
      const g = goalSeek(p, target, DEFAULT_SETTINGS);
      const now = Math.round(profit4w(p, p.price, 1, DEFAULT_SETTINGS));
      $("#scOut").innerHTML = `<div class="answer"><b>${esc(p.name)}</b>: today's price ${p.price} SAR gives about ${sar(now)} profit in the next 4 weeks.<br>` +
        (g.reachable
          ? `To reach <b>${sar(target)}</b>, the price should be <b>${g.price} SAR</b> (expected profit ${sar(g.profit)}). Minimum allowed price is ${g.floor} SAR.`
          : `A target of <b>${sar(target)}</b> is <b>not reachable</b> with price alone. The best price is ${g.price} SAR, which gives about ${sar(g.profit)}. To reach the target you would need more sales or a lower cost.`) +
        `<br>Or keep today's price and sell <b>${Math.ceil(target / (p.price - p.cost))} bottles</b> in 4 weeks (expected at today's price: about ${Math.round(now / (p.price - p.cost))}).` +
        `</div><p class="muted">Goal seek works backwards: you set the result you want, and the agent finds the input (the price). It never goes below the minimum margin.</p>`;
      return;
    }
    let sce = {}, settings = {}, title = "";
    if (sc === "comp") { sce = { compName: $("#wComp").value, compDrop: +$("#wPct").value }; title = `${sce.compName === "All" ? "All competitors drop" : sce.compName + " drops"} prices by ${sce.compDrop}%`; }
    if (sc === "cost") { sce = { costUp: +$("#wCost").value }; title = `Supplier costs go up ${sce.costUp}%`; }
    if (sc === "season") { sce = { demand: 1 + (+$("#wDemand").value) / 100 }; title = `Demand goes up ${$("#wDemand").value}% for the season`; }
    if (sc === "margin") { settings = { marginMid: +$("#wMid").value / 100, marginLux: +$("#wLux").value / 100 }; title = `Minimum margin: ${$("#wMid").value}% mid-range, ${$("#wLux").value}% luxury`; }
    const res = scenarioResult(ps, sce, settings);
    const base = runAgent(ps);
    const diff = res.recs.map((r, i) => ({ r, b: base[i] })).filter(x => x.r.newPrice !== x.b.newPrice || x.r.action !== x.b.action);
    const rows = diff.map(({ r, b }) => `<tr><td><b>${esc(r.name)}</b></td><td class="num">${r.oldPrice}</td><td class="num">${b.newPrice}</td>
      <td class="num"><b>${r.newPrice}</b></td><td class="wrap">${esc(r.reason)}</td></tr>`).join("");
    const L = res.bands.likely;
    $("#scOut").innerHTML = `<div class="answer"><b>${esc(title)}.</b> Most likely, profit for the next 4 weeks is <b>${sar(L.after)}</b> if you follow the agent,
      compared with ${sar(L.before)} if you keep today's prices. The agent changes its advice for <b>${diff.length}</b> perfume${diff.length === 1 ? "" : "s"}.</div>
      ${bandsHtml(res.bands)}
      <h3>What changes because of this scenario</h3>
      ${diff.length ? `<div class="tablewrap"><table><tr><th>Perfume</th><th class="num">Today</th><th class="num">Agent (normal)</th><th class="num">Agent (scenario)</th><th>Why</th></tr>${rows}</table></div>` : `<p class="muted">The agent's advice is the same as normal.</p>`}
      <p class="muted" style="margin-top:12px">Assumptions: +1% price → −1.2% sales; being above the cheapest site loses sales (sensitivity 3); low-stock items can only sell what is on the shelf. The agent never invents a number that is not in the data or these formulas.</p>`;
  }

  // ---------- weekly briefing ----------
  function renderBriefing() {
    const ps = products(), recs = runAgent(ps);
    const lastWeekRev = sum(ORIGINAL.map(p => p.sales[7] * p.price)), weekBefore = sum(ORIGINAL.map(p => p.sales[6] * p.price));
    const ch = (lastWeekRev - weekBefore) / weekBefore;
    const review = recs.filter(r => r.needsReview || r.dataIssue), low = recs.filter(r => r.cover != null && r.cover < 14 && r.cover > 0);
    const slow = recs.filter(r => r.cover == null ? false : r.cover > 60);
    const gaps = ps.map(p => ({ p, c: cheapest(p) })).filter(x => x.c != null && x.p.price > x.c)
      .map(x => ({ ...x, gap: (x.p.price - x.c) / x.c })).sort((a, b) => b.gap - a.gap).slice(0, 3);
    const li = a => a.map(x => `<li>${x}</li>`).join("");
    $("#brief").innerHTML = `<p class="muted" style="margin-top:0">Report for the week of 15 Nov 2026 · generated Sunday 07:00 · read-only</p>
      <h3>Headline</h3><p>Revenue last week: <b>${sar(lastWeekRev)}</b> (${ch >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(ch * 100))}% vs the week before).
      The agent has <b>${recs.filter(r => r.newPrice !== r.oldPrice).length}</b> price suggestions waiting for your approval.</p>
      <h3>Needs your decision first</h3><ul>${li(review.map(r => `<b>${esc(r.name)}</b>: ${esc(r.reason)}`)) || "<li>Nothing urgent.</li>"}</ul>
      <h3>Low stock (re-order)</h3><ul>${li(low.map(r => `<b>${esc(r.name)}</b>: ${r.cover} days left`)) || "<li>None.</li>"}</ul>
      <h3>Slow movers</h3><ul>${li(slow.map(r => `<b>${esc(r.name)}</b>: ${r.cover} days of stock`)) || "<li>None.</li>"}</ul>
      <h3>Competitor watch</h3><ul>${li(gaps.map(x => `<b>${esc(x.p.name)}</b>: we are ${Math.round(x.gap * 100)}% above the cheapest site (${x.c} SAR)`)) || "<li>We are the cheapest on everything.</li>"}</ul>
      <p class="muted">The same report is written automatically every Sunday by a scheduled job (GitHub Actions) into the <code>reports/</code> folder of this project.</p>
      <button class="btn primary" data-goto2="agent">Open the recommendations →</button>`;
    $("#brief [data-goto2]").addEventListener("click", () => { show("agent"); runAndRender(); });
  }

  // ---------- log ----------
  function renderLog() {
    const L = saved.log;
    $("#ltable").innerHTML = L.length
      ? `<tr><th>Time</th><th>Perfume</th><th class="num">Old</th><th class="num">Suggested</th><th>Rule</th><th>Decision</th></tr>` +
        L.map(e => `<tr><td>${new Date(e.t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
        <td>${esc(e.name)}</td><td class="num">${e.old}</td><td class="num">${e.nw}</td><td>${esc(e.rule)}</td>
        <td><span class="pill ${e.ok ? "lower" : "hold"}">${e.ok ? "Approved" : "Rejected"}</span></td></tr>`).join("")
      : `<tr><td class="empty">No decisions yet. Run the agent and approve or reject a suggestion.</td></tr>`;
  }
  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Reset all approved prices and clear the log?")) return;
    saved = { prices: {}, log: [], comp: {}, meta: {} }; save(); renderLog();
  });

  // ---------- start ----------
  renderDashboard();
  setScenario("comp");
})();
