# Trial conversion

Use when the user asks how many free trials convert to paid, whether trial conversion changed, or which products or paywalls convert best.

## Definitions

- **Trial:** a subscription with a real `trial_start_timestamp`. Missing values are stored as `1970-01-01` or `2999-12-31`, so always filter on `trial_start_timestamp > '1970-01-02' AND trial_start_timestamp < '2999-01-01'`.
- **Resolved:** `is_trial_resolved = 1`. The trial is at least 7 days old and at least 2 days past its trial end, so the store has had time to report the outcome.
- **Pending:** `is_trial_pending = 1`. The outcome is not known yet. Leave pending trials out of conversion rates.
- **Converted:** a resolved trial with `has_paid_revenue = 1`.

## 1. Conversion by trial start week

```sql
SELECT
    toStartOfWeek(trial_start_timestamp) AS trial_week,
    count() AS trials,
    countIf(is_trial_pending = 1) AS pending,
    countIf(is_trial_resolved = 1) AS resolved,
    countIf(is_trial_resolved = 1 AND has_paid_revenue = 1) AS converted,
    round(converted / nullIf(resolved, 0), 4) AS conversion_rate
FROM subscriptions
WHERE environment = 'PRODUCTION'
  AND trial_start_timestamp > '1970-01-02'
  AND trial_start_timestamp < '2999-01-01'
  AND trial_start_timestamp >= now() - INTERVAL 90 DAY
GROUP BY trial_week
ORDER BY trial_week
```

Recent weeks have mostly pending trials. Only compare weeks where most trials are resolved.

## 2. Find the segment

Swap `product_id` for `store`, `storefront`, `attributed_paywall_name`, `attributed_trigger_name` or `attributed_variant_allocation_name`:

```sql
SELECT
    product_id,
    countIf(is_trial_resolved = 1) AS resolved,
    countIf(is_trial_resolved = 1 AND has_paid_revenue = 1) AS converted,
    round(converted / nullIf(resolved, 0), 4) AS conversion_rate,
    countIf(is_trial_resolved = 1 AND has_paid_revenue = 1 AND has_refund = 1) AS converted_then_refunded
FROM subscriptions
WHERE environment = 'PRODUCTION'
  AND trial_start_timestamp > '1970-01-02'
  AND trial_start_timestamp < '2999-01-01'
  AND trial_start_timestamp >= now() - INTERVAL 90 DAY
GROUP BY product_id
HAVING resolved >= 50
ORDER BY resolved DESC
```

## 3. Time to convert

```sql
SELECT
    dateDiff('day', trial_start_timestamp, first_paid_timestamp) AS days_to_first_payment,
    count() AS subscriptions
FROM subscriptions
WHERE environment = 'PRODUCTION'
  AND trial_start_timestamp > '1970-01-02'
  AND trial_start_timestamp < '2999-01-01'
  AND trial_start_timestamp >= now() - INTERVAL 90 DAY
  AND has_paid_revenue = 1
  AND first_paid_timestamp > '1970-01-02'
  AND first_paid_timestamp < '2999-01-01'
GROUP BY days_to_first_payment
ORDER BY days_to_first_payment
```

Payments well after the trial length usually come from billing retry or a resubscribe. Mention them if they are a large share.

## Report

Give the conversion rate with the number of resolved trials behind it, the trial start window, how many trials are still pending, and the segments that differ most.
