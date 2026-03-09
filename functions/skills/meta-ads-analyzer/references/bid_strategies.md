# Bid Strategies

## Overview

Bid strategies control how Meta bids in auctions on your behalf. The right strategy depends on your goals: maximizing volume, controlling costs, or achieving target returns.

## Spend-Based Strategies

### Highest Volume (formerly Lowest Cost)
- **Goal:** Get the most results for your budget
- **How it works:** System bids whatever is needed to spend the full budget
- **Best for:** Maximizing conversions when you don't have strict CPA targets
- **Risk:** CPA may be higher than desired; no cost control
- **When to use:** New campaigns, testing phases, volume-focused objectives

### Highest Value
- **Goal:** Get the highest purchase value for your budget
- **How it works:** System optimizes for conversion value, not volume
- **Best for:** E-commerce campaigns where purchase values vary significantly
- **Requirement:** Must have value-based optimization set up (purchase values reported)

## Goal-Based Strategies

### Cost Per Result Goal (formerly Cost Cap)
- **Goal:** Maximize results while keeping average CPA near a target
- **How it works:** System bids to keep average cost around your target over time
- **Best for:** Campaigns with specific CPA targets
- **Note:** Costs may exceed the cap during learning; evaluated over time, not per result
- **Risk:** May underspend if target is too aggressive

### ROAS Goal (formerly Minimum ROAS)
- **Goal:** Maintain a minimum return on ad spend
- **How it works:** System targets results that meet your ROAS threshold
- **Best for:** E-commerce with clear ROAS requirements
- **Requirement:** Value-based optimization with purchase values

## Manual Strategy

### Bid Cap
- **Goal:** Set a maximum bid for each auction
- **How it works:** System never bids above your cap in any single auction
- **Best for:** Experienced advertisers who understand their auction dynamics
- **Risk:** Significantly limits delivery if cap is too low; requires careful management
- **Note:** This is a hard cap per auction, not an average — very different from Cost Per Result Goal

## Strategy Comparison

| Strategy | Cost Control | Volume | Complexity | Best For |
|----------|-------------|--------|------------|----------|
| Highest Volume | None | Maximum | Low | Volume maximization |
| Highest Value | None | Varies | Medium | Value optimization |
| Cost Per Result Goal | Average target | Moderate | Medium | CPA-focused campaigns |
| ROAS Goal | ROAS target | Moderate | Medium | ROAS-focused campaigns |
| Bid Cap | Hard cap | Limited | High | Expert cost control |

## Choosing the Right Strategy

1. **No CPA/ROAS target?** → Use Highest Volume or Highest Value
2. **Have a CPA target?** → Use Cost Per Result Goal
3. **Have a ROAS target?** → Use ROAS Goal
4. **Need strict auction-level control?** → Use Bid Cap (advanced)
5. **New campaign / testing?** → Start with Highest Volume, then add controls
