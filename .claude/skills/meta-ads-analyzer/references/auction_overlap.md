# Auction Overlap

## What Is Auction Overlap?

Auction overlap occurs when **multiple ad sets from the same advertiser compete against each other** in the same auction. Meta prevents self-competition by entering only the most competitive ad set into each auction, but this can limit delivery for overlapping ad sets.

## How Meta Handles Overlap

When two or more ad sets from the same account overlap:

1. Meta identifies the overlap in each auction
2. Only the ad set with the **highest Total Value** enters the auction
3. The other overlapping ad sets are excluded from that specific auction
4. This is called **auction deduplication**

## Symptoms of Auction Overlap

- **Delivery issues** — Ad sets not spending their full budget
- **High CPM/CPA** — Reduced auction opportunities lead to higher costs
- **Inconsistent delivery** — Some ad sets getting sporadic delivery
- **"Learning Limited" status** — Ad sets can't reach 50 optimization events

## Common Causes

1. **Similar audiences across ad sets** — Targeting overlapping demographics or interests
2. **Too many ad sets** — More ad sets = more overlap potential
3. **Broad targeting** — Multiple broad ad sets covering the same Accounts Center accounts
4. **Lookalike audiences with same source** — Different percentages still overlap significantly

## How to Diagnose

1. **Check the Audience Overlap tool** in Ads Manager (under Audiences)
2. **Look for ad sets with low delivery** relative to their budget
3. **Compare audience definitions** across ad sets — identify overlap areas
4. **Monitor "Learning Limited" status** — often a symptom of fragmented delivery

## Solutions

1. **Consolidate ad sets** — Combine overlapping audiences into fewer, broader ad sets
2. **Use CBO (Advantage+ Campaign Budget)** — Let the system allocate across ad sets optimally
3. **Differentiate audiences** — Use exclusions to create mutually exclusive segments
4. **Reduce ad set count** — Fewer ad sets = less overlap and faster learning
5. **Use Advantage+ audiences** — Let Meta's system handle targeting expansion
