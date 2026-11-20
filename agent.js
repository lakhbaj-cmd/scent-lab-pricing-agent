/* Scent Lab Pricing Agent — decision rules (the "model base" + "knowledge base").
   Works in the browser and in Node (used by the weekly scheduled briefing). */

const DEFAULT_SETTINGS = {
  marginMid: 0.20,      // minimum margin for mid-range perfumes
  marginLux: 0.30,      // minimum margin for luxury perfumes
  raisePct: 0.05,       // raise when demand is high and stock is low
  offerSmall: 0.10,     // offer for slow movers
  offerBig: 0.15,       // offer for very slow movers
  slowDays: 60,         // more than 60 days of stock = slow mover
  verySlowDays: 90,     // more than 90 days of stock = very slow mover
  lowCoverDays: 14,     // less than 14 days of stock = low stock
  reviewLimit: 0.15,    // any change bigger than 15% is flagged for owner review
  elasticity: 1.2,      // assumption: +1% price -> -1.2% units
  compSensitivity: 3.0  // assumption: same bottle online, so being 10% above the cheapest site costs ~30% of sales
};

const COMPETITORS = ["Golden Scent", "Faces", "Sephora"];
const sum = a => a.reduce((x, y) => x + y, 0);
const mean = a => (a.length ? sum(a) / a.length : 0);
const r2 = n => Math.round(n * 100) / 100;

function minMargin(p, s) { return p.tier === "Luxury" ? s.marginLux : s.marginMid; }
function floorPrice(p, s) { return Math.ceil(p.cost / (1 - minMargin(p, s))); }

/* Units per week at a new price (simple price-elasticity assumption). */
function compFactor(comp, price, s) {
  const vals = COMPETITORS.map(c => comp[c]).filter(v => v != null);
  if (!vals.length) return 1;
  const low = Math.min(...vals);
  const gap = Math.max(0, (price - low) / low);
  return Math.max(0.25, 1 - s.compSensitivity * gap);
}
function weeklyUnits(p, newPrice, demandFactor, s) {
  const base = mean(p.sales.slice(-4)) * (demandFactor || 1);
  // sales history was observed at the original price (basePrice) and original competitor prices (compRef)
  const ref = p.basePrice || p.price;
  const change = (newPrice - ref) / ref;
  const comp = compFactor(p.comp, newPrice, s) / compFactor(p.compRef || p.comp, ref, s);
  return Math.max(0, base * (1 - s.elasticity * change) * comp);
}
/* Expected profit over the next 4 weeks. Normal products are restocked as usual.
   Low-stock products (under 14 days of cover) can only sell what is on the shelf. */
function profit4w(p, newPrice, demandFactor, s) {
  let units = weeklyUnits(p, newPrice, demandFactor, s) * 4;
  const daily = mean(p.sales.slice(-4)) / 7;
  const cover = daily > 0 ? p.stock / daily : Infinity;
  if (cover < s.lowCoverDays || p.stock === 0) units = Math.min(p.stock, units);
  return units * (newPrice - p.cost);
}

/* Runs Simon's four phases for one product and returns the recommendation. */
function analyseProduct(p, settings) {
  const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  // ---- 1. Intelligence: read the data, what changed, what is outside normal
  const avg4 = mean(p.sales.slice(-4));
  const prev4 = mean(p.sales.slice(-8, -4));
  const lastWeek = p.sales[p.sales.length - 1];
  const daily = avg4 / 7;
  const cover = daily > 0 ? p.stock / daily : Infinity;
  const floor = floorPrice(p, s);
  const m = minMargin(p, s);
  const known = COMPETITORS.filter(c => p.comp[c] != null).map(c => ({ name: c, price: p.comp[c] }));
  const missing = COMPETITORS.filter(c => p.comp[c] == null);
  const lowest = known.length ? known.reduce((a, b) => (b.price < a.price ? b : a)) : null;
  const highest = known.length ? known.reduce((a, b) => (b.price > a.price ? b : a)) : null;
  const marginNow = (p.price - p.cost) / p.price;

  const facts = [
    `Avg sales last 4 weeks: ${r2(avg4)} per week (previous 4 weeks: ${r2(prev4)}).`,
    `Stock: ${p.stock} bottles = ${isFinite(cover) ? Math.round(cover) + " days" : "no recent sales"} of cover.`,
    `Cost ${p.cost} SAR${p.costPrev !== p.cost ? ` (was ${p.costPrev} SAR)` : ""}; minimum margin ${Math.round(m * 100)}% → minimum price ${floor} SAR.`,
    `Current margin: ${Math.round(marginNow * 100)}%.`,
    known.length
      ? `Competitors: ${known.map(k => `${k.name} ${k.price}`).join(", ")} SAR.`
      : "No competitor sells this perfume."
  ];
  const checks = [];
  if (missing.length && known.length) checks.push(`${missing.join(" & ")} ${missing.length > 1 ? "do" : "does"} not sell a comparable bottle, so the comparison uses ${known.length} site${known.length > 1 ? "s" : ""} only.`);
  checks.push(`Competitor prices are the listed starting price from the check on ${p.compDate || "19 Nov 2026"}; bottle sizes may differ. Re-check before a big change.`);

  // ---- 2. Design: list realistic options with their expected 4-week profit
  const opts = [];
  const addOpt = (label, price) => {
    price = Math.round(price);
    if (opts.some(o => o.price === price)) return;
    opts.push({ label, price, profit: Math.round(profit4w(p, price, 1, s)), belowFloor: price < floor });
  };
  addOpt("Keep current price", p.price);
  if (lowest) addOpt(`Match lowest competitor (${lowest.name})`, Math.floor(lowest.price));
  addOpt("Minimum allowed price", floor);
  addOpt(`Raise ${Math.round(s.raisePct * 100)}%`, p.price * (1 + s.raisePct));
  addOpt(`Offer ${Math.round(s.offerSmall * 100)}% off`, p.price * (1 - s.offerSmall));
  addOpt(`Offer ${Math.round(s.offerBig * 100)}% off`, p.price * (1 - s.offerBig));

  // ---- 3. Choice: apply the rules in priority order
  let action = "keep", newPrice = p.price, rule = "No rule triggered", reason = "Price is competitive, margin is safe and stock is normal.";
  let confidence = known.length >= 3 ? "High" : known.length >= 1 ? "Medium" : "Low";
  let dataIssue = false;

  if (p.stock === 0 && lastWeek > 0) {
    dataIssue = true; action = "hold"; rule = "Data check";
    reason = `Stock says 0 but ${lastWeek} bottles were sold last week. The data contradicts itself, so I will not change the price.`;
    checks.unshift("Count the stock by hand and fix the stock number before running me again.");
    confidence = "Low";
  } else if (p.price < floor) {
    action = "raise"; newPrice = floor; rule = "Rule 1 · Protect the margin (cost went up)";
    reason = `The cost went up to ${p.cost} SAR, so ${p.price} SAR is below the minimum price of ${floor} SAR. Raise to the minimum price.`;
    if (highest && newPrice > highest.price) checks.push(`The new price is above every competitor (highest: ${highest.name} ${highest.price} SAR). Sales may slow down; consider asking the supplier for a better cost.`);
  } else if (cover < s.lowCoverDays && avg4 > 0 && avg4 >= prev4) {
    action = "raise"; newPrice = Math.round(p.price * (1 + s.raisePct)); rule = "Rule 2 · High demand, low stock";
    reason = `Sales are steady or rising and only ${Math.round(cover)} days of stock are left. Raise ${Math.round(s.raisePct * 100)}% to protect stock and earn more per bottle.`;
    checks.push("Re-order this perfume soon.");
    if (lowest && newPrice > lowest.price) checks.push(`${lowest.name} is cheaper (${lowest.price} SAR). The raise is fine while stock is low, but undo it after restocking.`);
  } else if (cover > s.slowDays) {
    const pct = cover > s.verySlowDays ? s.offerBig : s.offerSmall;
    const target = Math.round(p.price * (1 - pct));
    newPrice = Math.max(floor, target);
    rule = `Rule 3 · Slow mover offer (${Math.round(pct * 100)}%)`;
    if (newPrice >= p.price) { action = "keep"; reason = "Slow mover, but the price is already at the minimum. Do not discount; try a bundle or display instead."; newPrice = p.price; }
    else {
      action = "offer";
      reason = `Stock will last ${Math.round(cover)} days (more than ${pct === s.offerBig ? s.verySlowDays : s.slowDays}). Put it on a ${Math.round(pct * 100)}% offer to move it.` +
        (newPrice > target ? ` A full ${Math.round(pct * 100)}% would break the margin, so the offer stops at the minimum price (${floor} SAR).` : "");
    }
  } else if (lowest && lowest.price < p.price) {
    const match = Math.floor(lowest.price);
    newPrice = Math.max(floor, match);
    rule = "Rule 4 · Competitor is cheaper";
    if (newPrice >= p.price) { action = "keep"; newPrice = p.price; reason = `${lowest.name} is cheaper, but we are already at the minimum price.`; }
    else {
      action = "lower";
      reason = newPrice === match
        ? `${lowest.name} sells it for ${lowest.price} SAR. Match their price; our margin stays above ${Math.round(m * 100)}%.`
        : `${lowest.name} sells it for ${lowest.price} SAR, but matching would break the ${Math.round(m * 100)}% margin. Lower only to the minimum price (${floor} SAR).`;
    }
  }

  const change = (newPrice - p.price) / p.price;
  const overLimit = Math.abs(change) > s.reviewLimit + 0.005;
  let needsReview = dataIssue || overLimit;
  if (overLimit) checks.unshift(`This change is ${Math.round(Math.abs(change) * 100)}%, more than the ${Math.round(s.reviewLimit * 100)}% limit. The owner must review it before approving.`);
  if (confidence === "Low" && !dataIssue) checks.unshift("No competitor data, so this decision rests on our own sales only.");

  const pb = profit4w(p, p.price, 1, s), pa = profit4w(p, newPrice, 1, s);
  if (!dataIssue && newPrice !== p.price && pa < pb) checks.unshift(`Expected 4-week profit goes down (${Math.round(pb)} → ${Math.round(pa)} SAR). This rule protects our position in the market, not short-term profit. Decide if that is worth it.`);

  // ---- 4. Implementation: draft the action for owner approval (never applied automatically)
  return {
    id: p.id, name: p.name, brand: p.brand, tier: p.tier,
    oldPrice: p.price, newPrice, change: r2(change * 100), action, rule, reason,
    facts, options: opts, checks, confidence, needsReview, dataIssue,
    floor, cover: isFinite(cover) ? Math.round(cover) : null, avg4: r2(avg4),
    profitBefore: Math.round(profit4w(p, p.price, 1, s)),
    profitAfter: Math.round(profit4w(p, newPrice, 1, s))
  };
}

function runAgent(products, settings) { return products.map(p => analyseProduct(p, settings)); }

/* What-if: change inputs, re-run the agent, compare worst / likely / best. */
function applyScenario(products, sc) {
  return products.map(p => {
    const q = JSON.parse(JSON.stringify(p));
    q.compRef = JSON.parse(JSON.stringify(p.comp));
    if (sc.compName && sc.compDrop) {
      COMPETITORS.forEach(c => {
        if ((sc.compName === "All" || sc.compName === c) && q.comp[c] != null) q.comp[c] = r2(q.comp[c] * (1 - sc.compDrop / 100));
      });
    }
    if (sc.costUp) { q.costPrev = q.cost; q.cost = r2(q.cost * (1 + sc.costUp / 100)); }
    if (sc.demand && sc.demand !== 1) q.sales = q.sales.map((u, i) => (i >= q.sales.length - 4 ? u * sc.demand : u));
    return q;
  });
}
function scenarioResult(products, sc, settings) {
  const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  const mod = applyScenario(products, sc);
  const recs = runAgent(mod, s);
  const spread = sc.spread != null ? sc.spread : 0.2;
  const bands = { worst: 1 - spread, likely: 1, best: 1 + spread };
  const out = { recs, mod, bands: {} };
  for (const [k, f] of Object.entries(bands)) {
    let before = 0, after = 0;
    mod.forEach((p, i) => {
      before += profit4w(p, p.price, f, s);
      after += profit4w(p, recs[i].dataIssue ? p.price : recs[i].newPrice, f, s);
    });
    out.bands[k] = { before: Math.round(before), after: Math.round(after) };
  }
  return out;
}

/* Goal seek: lowest price that reaches a 4-week profit target for one product. */
function goalSeek(p, target, settings) {
  const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  const floor = floorPrice(p, s);
  let best = { price: floor, profit: profit4w(p, floor, 1, s) };
  for (let price = floor; price <= Math.round(p.price * 2); price++) {
    const pr = profit4w(p, price, 1, s);
    if (pr >= target) return { reachable: true, price, profit: Math.round(pr), floor };
    if (pr > best.profit) best = { price, profit: pr };
  }
  return { reachable: false, price: best.price, profit: Math.round(best.profit), floor };
}

if (typeof module !== "undefined") module.exports = { DEFAULT_SETTINGS, COMPETITORS, analyseProduct, runAgent, scenarioResult, goalSeek, profit4w, floorPrice, mean };
