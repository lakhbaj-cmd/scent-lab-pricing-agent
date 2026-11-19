# Scent Lab — Pricing Decision Agent

A BAIS 400 (Decision Support Systems) project. Scent Lab is a **fictional** perfume shop. The agent recommends the selling price, or an offer, for 16 perfumes each week. The owner approves every change.

**Live demo:** open the GitHub Pages link of this repository.

## What the agent does (Simon's four phases)
1. **Sense:** reads sales, stock, costs and competitor prices.
2. **Options:** lists the realistic prices (keep, match the competitor, minimum price, +5%, 10% or 15% offer) with expected 4-week profit for each.
3. **Recommend:** applies the pricing rules in order and explains why.
4. **Act:** drafts the new price. Nothing changes until the owner clicks **Approve**.

## Pricing rules
- First, a data check: if the data contradicts itself, do nothing and ask the owner.
1. Protect the margin: if the cost went up and the price is below the minimum, raise to the minimum.
2. High demand, low stock: under 14 days of stock and sales steady or rising → raise 5%.
3. Slow mover: over 60 days of stock → 10% offer; over 90 days → 15% offer (never below the minimum).
4. Competitor is cheaper: match the cheapest competitor without going below the minimum.
5. Otherwise keep the price.

Minimum price = cost ÷ (1 − minimum margin). Minimum margin: 20% mid-range, 30% luxury. Changes over 15% are flagged for owner review.

## Files
| File | What it is |
|---|---|
| `index.html`, `style.css`, `app.js` | The website (interface) |
| `agent.js` | The rules and models (knowledge + model base) |
| `data.js` | The data the website reads (made by `build_data.py`) |
| `data/` | Clean CSV files and `data_dictionary.md` (data package) |
| `build_data.py` | Builds the data files (ETL step) |
| `scripts/weekly-briefing.js` | Writes the weekly report |
| `.github/workflows/weekly-briefing.yml` | Runs the report every Sunday 07:00 Saudi time |
| `reports/` | The weekly reports |

## Data
Sales, stock and costs are **simulated**. Competitor prices are real listed prices from Golden Scent, Faces and Sephora (Saudi Arabia), checked on 19 Nov 2026. Bottle sizes may differ between sites.

Not affiliated with any brand or retailer.
