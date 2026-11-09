---
name: helium-data-access
description: Investigate a Helium organization's paywall, experiment, subscription and revenue data with read-only SQL through the Helium Data Access API. Use when asked why revenue or conversion changed, which experiment variant is winning, how trials convert, where users drop off in a paywall, or to export Helium data.
---

# Helium Data Access

The Helium Data Access API runs read-only ClickHouse SQL against the organization's `customer_v1` tables: `events`, `revenue`, `subscriptions` and `users`. Every query only sees that organization's rows.

- API guide: https://docs.tryhelium.com/data-access/overview
- Column reference: https://docs.tryhelium.com/data-access/schema

## Run a query

The secret key must be in the `HELIUM_SECRET_KEY` environment variable. If it is missing, ask the user to create one in **Settings → Data Access** and export it. Never print the key, paste it into chat, or write it to a file.

```bash
helium_sql() {
  jq -n --arg sql "$1" '{sql: $sql}' |
    curl -sS -X POST https://app.tryhelium.com/api/metrics-query \
      -H "Authorization: Bearer $HELIUM_SECRET_KEY" \
      -H "Content-Type: application/json" \
      --data-binary @-
}

helium_sql "SELECT event_name, uniqExact(event_id) AS events FROM events WHERE event_timestamp > now() - INTERVAL 1 DAY GROUP BY event_name ORDER BY events DESC" | jq '.data'
```

The response is ClickHouse JSON: `meta`, `data`, `rows`, `statistics`. Errors are `{"error": {"type", "message"}}`. Keep the `X-Request-Id` response header (`curl -i`) if the user needs to contact Helium support.

## How to investigate

1. **Pin down the question.** Write down the metric, the time window, the comparison (previous period, variant, platform) and any filters before querying. Ask the user if any of these are unclear.
2. **Look before you measure.** Run small queries first: which `event_name`, `trigger_name`, `app_store`, `environment` and experiment values exist in the window, and how many rows each has. Never assume a value exists.
3. **Follow the matching recipe** in `references/` (list below). If none fits, use the rules below and the column reference.
4. **Check the result.** Compare totals against a second source (for example SDK `purchase_succeeded` events against `revenue` rows), check that segments add up to the total, and look for days with missing or partial data.
5. **Report.** Give the answer first, then the numbers, the exact window and filters, the SQL you ran, and the caveats that apply. Say what you could not verify.

## Rules for every query

- **Filter on time.** Always bound `events.event_timestamp` or `revenue.timestamp`. Start with a day or a week and widen only if needed. Full-history scans hit the limits.
- **Aggregate in SQL.** Return summaries, not raw rows. Add `LIMIT` to any exploratory `SELECT`.
- **Count events with `uniqExact(event_id)`**, not `count()`. About 1 in 1,000 events is stored twice.
- **Count users with `uniqExact(helium_persistent_id)`**. It is the user column on `events`, `subscriptions` and `users`.
- **Exclude test data.** Use `environment = 'PRODUCTION'` on `revenue` and `subscriptions`, and `app_environment = 'PRODUCTION'` on `events`.
- **Refunds are negative** in `revenue_usd` and `proceeds_usd`, so `sum()` already nets them out.
- **Proceeds have a gap.** App Store, Google Play and RevenueCat rows before 22 June 2026 have `proceeds_usd = 0`. Don't compare proceeds across that date for those stores; use `revenue_usd` instead.
- **Two timestamps on `revenue`.** `timestamp` is when Helium received the store notification. `coalesce(event_timestamp, timestamp)` is when it happened. Pick one and say which.
- **Recent data is incomplete.** About 1.5% of events arrive more than a day late, and store notifications can take hours or days. End comparison windows at least one full day ago, and compare whole days.
- **Active subscribers:** use `has_access = 1`, not `subscription_status`.
- **Link revenue to paywalls and experiments through `subscriptions`.** Use its `attributed_*` columns, or join `revenue.original_transaction_id = subscriptions.subscription_id`. `revenue.helium_persistent_id` is often empty.
- **Attribution is partial.** `attributed_*` columns are only set when `is_helium_attributed = 1`, and hold `Unknown` otherwise. Filter experiments and paywalls with `NOT IN ('', 'Unknown')`. Report the attributed share alongside attributed totals.
- **Missing timestamps are placeholder dates, not NULL**, on most `subscriptions` timestamp columns: `2299-12-31` for trial and first-payment columns, `1970-01-01` for the others. A real trial has `trial_start_timestamp < '2200-01-01'`; a paid subscription has `first_paid_timestamp < '2200-01-01'`. See the schema reference for the full list.
- **64-bit integers come back as strings** in JSON. Convert before doing math outside SQL.
- **Numbers can differ slightly from the Helium dashboard**, because late data arrives between reads. Differences of a few percent on recent days are expected.

## Limits and errors

Queries can run for 300 seconds, read 20 GB, use 8 GB of memory and return 1,000,000 rows, with a 4 MB response. Each organization can run 4 queries at once, so run queries one after another. A `RESULT_TOO_LARGE` error means the result needs a `LIMIT` or more aggregation.

- `422` (`TIMEOUT_EXCEEDED`, `TOO_MANY_BYTES`, `TOO_MANY_ROWS`, `MEMORY_LIMIT_EXCEEDED`): narrow the time window, select fewer columns, or aggregate more.
- `429`: wait for a running query to finish, then retry.
- `400` with `UNKNOWN_IDENTIFIER`: check the column name in the schema reference.
- `401`: the key is missing, expired or revoked. Ask the user for a new one.
- `403`: Data Access is turned off for the organization.

## Investigation recipes

- [Revenue changed](references/revenue-change.md): revenue or proceeds went up or down and you need to know why.
- [Experiment results](references/experiment-results.md): compare variants on allocation, conversion and revenue.
- [Trial conversion](references/trial-conversion.md): how many trials convert to paid, by cohort and segment.
- [Paywall funnel](references/paywall-funnel.md): where users drop off between paywall open and purchase, and paywall failures.
