# Revenue changed

Use when revenue or proceeds went up or down, or look wrong, and the user wants to know why.

Every query that compares periods starts with the same `WITH` lines. Replace `cur_start` and `cur_end` there with the current window; the previous window of the same length is computed from them. End the window at least one full day ago.

## 1. Confirm the change

Daily revenue and proceeds by store. Use `coalesce(event_timestamp, timestamp)` to place money on the day it happened.

```sql
WITH
    toDate('2026-10-15') AS cur_start,
    toDate('2026-10-29') AS cur_end,
    cur_start - (cur_end - cur_start) AS prev_start
SELECT
    toDate(coalesce(event_timestamp, timestamp)) AS day,
    source,
    round(sum(revenue_usd), 2) AS total_revenue_usd,
    round(sum(proceeds_usd), 2) AS total_proceeds_usd,
    countIf(revenue_usd != 0) AS charged_rows
FROM revenue
WHERE environment = 'PRODUCTION'
  AND timestamp >= prev_start - INTERVAL 7 DAY
  AND coalesce(event_timestamp, timestamp) >= prev_start
  AND coalesce(event_timestamp, timestamp) < cur_end
GROUP BY day, source
ORDER BY day, source
```

If the change is in one store only, or on one day only, say so before going further.

## 2. Split by event type

This shows whether the change is new purchases, renewals or refunds. Refund rows are negative.

```sql
WITH
    toDate('2026-10-15') AS cur_start,
    toDate('2026-10-29') AS cur_end,
    cur_start - (cur_end - cur_start) AS prev_start
SELECT
    event_type,
    countIf(day >= cur_start) AS current_rows,
    countIf(day < cur_start) AS previous_rows,
    round(sumIf(revenue_usd, day >= cur_start), 2) AS current_usd,
    round(sumIf(revenue_usd, day < cur_start), 2) AS previous_usd,
    round(current_usd - previous_usd, 2) AS change_usd
FROM
(
    SELECT event_type, revenue_usd, toDate(coalesce(event_timestamp, timestamp)) AS day
    FROM revenue
    WHERE environment = 'PRODUCTION'
      AND timestamp >= prev_start - INTERVAL 7 DAY
)
WHERE day >= prev_start AND day < cur_end
GROUP BY event_type
ORDER BY abs(change_usd) DESC
```

## 3. Find where it moved

Swap `product_id` for `source`, `storefront`, `currency`, `offer_type` or `product_type` to find the segment that explains most of the change.

```sql
WITH
    toDate('2026-10-15') AS cur_start,
    toDate('2026-10-29') AS cur_end,
    cur_start - (cur_end - cur_start) AS prev_start
SELECT
    product_id,
    countIf(day >= cur_start AND revenue_usd > 0) AS current_charges,
    countIf(day < cur_start AND revenue_usd > 0) AS previous_charges,
    round(sumIf(revenue_usd, day >= cur_start), 2) AS current_usd,
    round(sumIf(revenue_usd, day < cur_start), 2) AS previous_usd,
    round(current_usd - previous_usd, 2) AS change_usd
FROM
(
    SELECT product_id, revenue_usd, toDate(coalesce(event_timestamp, timestamp)) AS day
    FROM revenue
    WHERE environment = 'PRODUCTION'
      AND timestamp >= prev_start - INTERVAL 7 DAY
)
WHERE day >= prev_start AND day < cur_end
GROUP BY product_id
ORDER BY abs(change_usd) DESC
LIMIT 20
```

Then separate volume from price: if the number of charges is flat but revenue moved, look at price, currency mix and offers. If charges moved, go to the paywall funnel (`paywall-funnel.md`) and the trial recipe (`trial-conversion.md`).

## 4. Rule out missing data

A drop on the most recent days is often late data. Check how late store notifications arrive for each store. This looks at the last 14 days, which is what matters for recent days; widen it if your window is older:

```sql
SELECT
    source,
    count() AS rows,
    round(countIf(dateDiff('hour', event_timestamp, timestamp) > 24) / count(), 4) AS share_over_1_day_late,
    max(timestamp) AS latest_received
FROM revenue
WHERE environment = 'PRODUCTION'
  AND timestamp > now() - INTERVAL 14 DAY
  AND event_timestamp IS NOT NULL
GROUP BY source
```

Then compare new purchases the SDK saw with new subscriptions and purchases the stores reported. SDK `purchase_succeeded` includes free-trial starts and never includes renewals, so compare it with store `subscription_start` and `purchase` rows, which also include trial starts (with `revenue_usd = 0`), not with charges:

```sql
WITH
    toDate('2026-10-15') AS cur_start,
    toDate('2026-10-29') AS cur_end,
    cur_start - (cur_end - cur_start) AS prev_start
SELECT
    toDate(event_timestamp) AS day,
    platform,
    uniqExact(event_id) AS sdk_purchases
FROM events
WHERE event_name = 'purchase_succeeded'
  AND app_environment NOT IN ('SANDBOX', 'DEBUG')
  AND event_timestamp >= prev_start
  AND event_timestamp < cur_end
GROUP BY day, platform
ORDER BY day, platform
```

```sql
WITH
    toDate('2026-10-15') AS cur_start,
    toDate('2026-10-29') AS cur_end,
    cur_start - (cur_end - cur_start) AS prev_start
SELECT
    toDate(coalesce(event_timestamp, timestamp)) AS day,
    source,
    count() AS store_new_purchases
FROM revenue
WHERE environment = 'PRODUCTION'
  AND event_type IN ('subscription_start', 'purchase')
  AND timestamp >= prev_start - INTERVAL 7 DAY
  AND coalesce(event_timestamp, timestamp) >= prev_start
  AND coalesce(event_timestamp, timestamp) < cur_end
GROUP BY day, source
ORDER BY day, source
```

`platform = 'ios'` lines up with `app_store_server_notifications` and `platform = 'android'` with `google_play_rtdn`. RevenueCat, Stripe and Paddle rows can come from either platform, so compare totals for those. The two counts won't match exactly; look at the daily trend. A gap that opens on one day for one store, while the SDK count holds steady, points to a store connection problem, not a real drop.

## Report

State the size of the change, the window, the segment that explains most of it, whether it is volume or price, and whether late or missing data could explain any of it.
