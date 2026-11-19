# Scent Lab — Data Dictionary

Scent Lab is a fictional perfume shop. **Sales, stock and costs are simulated data.** Competitor prices are real prices listed on Golden Scent, Faces and Sephora (Saudi Arabia), checked on 19 Nov 2026. We used the starting price each site shows in its search results, so bottle sizes may not match exactly between sites.

## Grain
- `sales_weekly.csv`: each row is **one product, sold in one week**.
- `competitor_prices.csv`: each row is **one product at one competitor, on one check date**.
- `products.csv` and `costs.csv`: each row is **one product**.

## products.csv
| Column | Meaning | Unit | Example |
|---|---|---|---|
| product_id | Unique product code | text | P07 |
| name | Perfume name | text | Sauvage Eau de Parfum |
| brand | Brand | text | Dior |
| gender | Women / Men / Unisex | text | Men |
| tier | Mid or Luxury (decides the minimum margin) | text | Mid |
| current_price | Scent Lab's selling price today | SAR | 535 |
| stock_on_hand | Bottles in stock today | units | 6 |

## sales_weekly.csv
| Column | Meaning | Unit | Example |
|---|---|---|---|
| week_start | First day (Sunday) of the week | date | 2026-11-15 |
| product_id | Product code | text | P07 |
| units_sold | Bottles sold that week | units | 10 |
| unit_price | Selling price that week | SAR | 535 |
| revenue | units_sold × unit_price | SAR | 5350 |

## costs.csv
| Column | Meaning | Unit | Example |
|---|---|---|---|
| product_id | Product code | text | P12 |
| cost_previous | Supplier cost before the last change | SAR | 420 |
| cost_current | Supplier cost now | SAR | 500 |
| cost_changed_on | Date the cost changed (blank = no change) | date | 2026-11-12 |

## competitor_prices.csv
| Column | Meaning | Unit | Example |
|---|---|---|---|
| product_id | Product code | text | P02 |
| competitor | Golden Scent, Faces or Sephora | text | Faces |
| price | Listed price (blank = not sold there or not comparable) | SAR | 418.6 |
| checked_on | Date the price was checked | date | 2026-11-19 |
| note | Extra info | text | listed starting price |

## Derived measures (calculated by the agent, not stored)
- **Avg weekly sales** = average units_sold over the last 4 weeks.
- **Days of cover** = stock_on_hand ÷ (avg weekly sales ÷ 7).
- **Minimum price (floor)** = cost_current ÷ (1 − minimum margin). Minimum margin: Mid 20%, Luxury 30%.
- **Margin** = (price − cost) ÷ price.
