# Core Concepts: Meta Ads System

## Ad Auction

Every time there's an opportunity to show an ad, Meta runs an auction. The winner is determined by **Total Value**, which combines:

1. **Advertiser Bid** — How much the advertiser is willing to pay
2. **Estimated Action Rates** — How likely the person is to take the desired action
3. **Ad Quality** — The quality and relevance of the ad

**Total Value = Bid × Estimated Action Rate + Ad Quality**

The ad with the highest total value wins the auction. This means a lower bid can win if the ad has higher estimated action rates and quality.

## Pacing

Pacing is the system that controls **how quickly budget is spent** throughout the day or campaign lifetime.

- **Even Pacing (Default):** Spreads spend evenly to avoid exhausting budget early
- **Accelerated Delivery:** Spends budget as quickly as possible (higher costs, less optimization)
- The pacing system adjusts bids in real-time based on remaining budget and time

## Learning Phase

When a new ad set is created or significantly edited, it enters the **Learning Phase**:

- The system needs approximately **50 optimization events** to stabilize delivery
- During learning phase, performance is **more volatile** and costs may be higher
- Significant edits (budget changes >20%, audience changes, creative changes) can **reset** the learning phase
- Ad sets that don't reach 50 events within 7 days enter "Learning Limited"

## Campaign Budget Optimization (CBO / Advantage+ Campaign Budget)

CBO allows Meta to automatically distribute budget across ad sets:

- Budget is set at the **campaign level**, not ad set level
- The system dynamically allocates spend to the best-performing ad sets
- Individual ad set performance should be evaluated at the **campaign level** (Breakdown Effect)
- Minimum/maximum spend limits per ad set can constrain optimization

## Advantage+ Audiences

Meta's automated targeting that uses machine learning to find the best audience:

- Advertisers provide **audience suggestions** rather than strict targeting
- The system may go beyond suggestions if it finds better opportunities
- Reduces the need for manual audience research and testing
