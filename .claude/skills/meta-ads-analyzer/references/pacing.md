# Pacing

## Overview

Pacing is Meta's system for controlling **how quickly an ad set's budget is spent** over its scheduled delivery period. The goal is to spend the budget evenly while finding the best results.

## How Pacing Works

### Even Pacing (Default)

- Distributes spend evenly throughout the day or campaign duration
- Adjusts bids dynamically to match the spending pace with available opportunities
- If budget is being spent too quickly, the system lowers bids
- If budget is underspending, the system raises bids to capture more opportunities

### The Pacing Algorithm

1. **Calculate target spend rate** based on remaining budget and remaining time
2. **Compare actual spend** to target spend
3. **Adjust bids up or down** to align actual spend with target
4. This happens continuously throughout the delivery period

## Pacing and Cost

- **Underpacing (spending too slowly):** System raises bids → higher costs per result
- **Overpacing (spending too quickly):** System lowers bids → may miss late-day opportunities
- **On-pace:** Optimal balance between cost and delivery

## Budget Changes and Pacing

- **Small budget increases (<20%):** Pacing adjusts smoothly
- **Large budget increases (>20%):** May reset learning phase; pacing needs to recalibrate
- **Budget decreases:** System may struggle to find results at lower bid levels
- **Mid-day budget changes:** Can cause pacing disruptions for the remainder of the day

## Daily vs Lifetime Budgets

### Daily Budget
- Pacing targets spending the full daily budget each day
- Can overspend up to 25% on high-opportunity days (balanced over the week)
- Best for ongoing campaigns with consistent daily spend

### Lifetime Budget
- Pacing distributes budget across the entire campaign duration
- The system can shift spend between days based on opportunity quality
- Better for campaigns with fixed end dates and total budgets
- Allows ad scheduling (dayparting)

## Diagnosing Pacing Issues

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| Underspending | Audience too narrow, bid too low | Broaden audience, increase budget |
| Overspending early | High competition, broad audience | System will self-correct; no action needed |
| Uneven daily spend | Normal pacing behavior | Allow 3-5 days for stabilization |
| Sudden spend drop | Competition change, audience fatigue | Check frequency, refresh creative |
