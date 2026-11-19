// Weekly briefing (Level 1 automation): runs the agent and writes a read-only report.
// It never changes a price. Run by GitHub Actions every Sunday 07:00 (Saudi time).
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const SCENT_DATA = new Function(fs.readFileSync(path.join(root, "data.js"), "utf8") + "; return SCENT_DATA;")();
const A = require(path.join(root, "agent.js"));
const recs = A.runAgent(SCENT_DATA.products);
const sum = a => a.reduce((x, y) => x + y, 0);
const ps = SCENT_DATA.products;
const last = sum(ps.map(p => p.sales[7] * p.price)), before = sum(ps.map(p => p.sales[6] * p.price));
const today = new Date().toISOString().slice(0, 10);
const list = (a, f) => (a.length ? a.map(f).join("\n") : "- None.");
const md = `# Scent Lab — Weekly Pricing Briefing (${today})

_Read-only report. The agent suggests; the owner approves on the website._

## Headline
- Revenue last week: **${Math.round(last).toLocaleString("en-US")} SAR** (${last >= before ? "up" : "down"} ${Math.abs(Math.round((last - before) / before * 100))}% vs the week before)
- Price suggestions waiting for approval: **${recs.filter(r => r.newPrice !== r.oldPrice).length}**

## Needs your decision first
${list(recs.filter(r => r.needsReview || r.dataIssue), r => `- **${r.name}**: ${r.reason}`)}

## All suggestions
| Perfume | Now | Suggested | Rule | Confidence |
|---|---:|---:|---|---|
${recs.map(r => `| ${r.name} | ${r.oldPrice} | ${r.newPrice} | ${r.rule} | ${r.confidence} |`).join("\n")}

## Low stock (re-order)
${list(recs.filter(r => r.cover != null && r.cover > 0 && r.cover < 14), r => `- **${r.name}**: ${r.cover} days left`)}

## Slow movers
${list(recs.filter(r => r.cover != null && r.cover > 60), r => `- **${r.name}**: ${r.cover} days of stock`)}
`;
fs.mkdirSync(path.join(root, "reports"), { recursive: true });
fs.writeFileSync(path.join(root, "reports", `briefing-${today}.md`), md);
fs.writeFileSync(path.join(root, "reports", "latest.md"), md);
console.log(md);
