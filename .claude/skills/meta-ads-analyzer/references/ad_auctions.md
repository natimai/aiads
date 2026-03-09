# How Ad Auctions Work

## Overview

Every time there's an opportunity to show someone an ad, Meta runs a real-time auction among all eligible advertisers. The auction determines which ad is shown and how much the advertiser pays.

## Auction Mechanics

### Total Value Calculation

The winner is determined by **Total Value**, not just the bid:

**Total Value = Advertiser Bid × Estimated Action Rate + Ad Quality Score**

- **Advertiser Bid:** The maximum the advertiser is willing to pay (set by bid strategy)
- **Estimated Action Rate:** How likely the person is to take the desired action (click, convert, etc.)
- **Ad Quality Score:** Derived from feedback signals, ad relevance, and post-click experience

### Why Total Value Matters

This formula means:
- A **lower bid can win** if the ad is more relevant and engaging
- **High-quality ads cost less** per result because they win auctions at lower bids
- The system rewards advertisers who create relevant, high-quality ads

## Pricing: How You Pay

Meta uses a **second-price auction** (modified):

- You pay the **minimum amount needed to win** the auction
- This is typically less than your maximum bid
- The actual cost depends on the competition, not just your bid

## Auction Eligibility

Not all advertisers enter every auction. Eligibility depends on:

1. **Targeting:** Does the person match the advertiser's audience?
2. **Budget/Pacing:** Does the ad set have remaining budget and is pacing on track?
3. **Ad Quality:** Ads with very low quality may be filtered out
4. **Frequency Caps:** Has the person seen the ad too many times?
5. **Auction Overlap:** Only one ad set per account enters each auction

## Factors That Improve Auction Performance

1. **Create relevant, high-quality ads** — Improves both Estimated Action Rate and Ad Quality
2. **Target the right audience** — Higher action rates for relevant Accounts Center accounts
3. **Optimize landing pages** — Better post-click experience improves quality scores
4. **Use appropriate bid strategy** — Match your strategy to your goals
5. **Avoid audience fragmentation** — Consolidated ad sets perform better

## Common Misconceptions

- **"Higher bid always wins"** — False. Total Value includes quality and relevance.
- **"You pay your bid amount"** — False. You pay the minimum to win (second-price).
- **"More ad sets = more auction wins"** — False. Self-competition reduces efficiency.
- **"Small audiences are more targeted"** — Not always. Broader audiences give the system more optimization room.
