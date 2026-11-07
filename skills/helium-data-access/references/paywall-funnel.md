# Paywall funnel

Use when the user asks where users drop off between seeing a paywall and buying, why a paywall converts poorly, or whether paywalls are failing to show.

## 1. Funnel by trigger and paywall

Counts paywall sessions at each step. `paywall_session_id` is set on nearly all paywall and purchase events, but not on `experience_skipped`.

```sql
SELECT
    trigger_name,
    paywall_name,
    uniqExactIf(paywall_session_id, event_name = 'experience_opened') AS opened,
    uniqExactIf(paywall_session_id, event_name = 'experience_view_rendered') AS rendered,
    uniqExactIf(paywall_session_id, event_name = 'purchase_started') AS purchase_started,
    uniqExactIf(paywall_session_id, event_name = 'purchase_succeeded') AS purchased,
    uniqExactIf(paywall_session_id, event_name = 'purchase_abandoned') AS abandoned,
    uniqExactIf(paywall_session_id, event_name = 'purchase_failed') AS failed,
    round(purchased / nullIf(opened, 0), 4) AS conversion_rate
FROM events
WHERE event_timestamp > now() - INTERVAL 14 DAY
GROUP BY trigger_name, paywall_name
HAVING opened >= 100
ORDER BY opened DESC
```

Read it step by step:

- `rendered` well below `opened`: the paywall is slow or failing to render. Go to step 2.
- `purchase_started` low: the paywall design, price or offer is not working.
- `abandoned` high: users cancel the store sheet. Check price and offer.
- `failed` high: purchase errors. Go to step 3.

## 2. Paywalls that fail to show or render

```sql
SELECT
    event_name,
    platform,
    helium_sdk_version,
    app_version,
    error_description,
    uniqExact(event_id) AS events,
    uniqExact(persistent_id) AS users
FROM events
WHERE event_timestamp > now() - INTERVAL 7 DAY
  AND event_name IN ('experience_open_failed', 'experience_view_render_failed', 'initialization_failed')
GROUP BY event_name, platform, helium_sdk_version, app_version, error_description
ORDER BY events DESC
LIMIT 50
```

Also check how often users saw a fallback paywall instead of the configured one. A rising share points to download or network problems:

```sql
SELECT
    toDate(event_timestamp) AS day,
    platform,
    uniqExact(event_id) AS opens,
    round(uniqExactIf(event_id, is_fallback = 1) / opens, 4) AS fallback_share
FROM events
WHERE event_timestamp > now() - INTERVAL 14 DAY
  AND event_name = 'experience_opened'
GROUP BY day, platform
ORDER BY day, platform
```

## 3. Purchase failures

```sql
SELECT
    product_id,
    platform,
    error_description,
    uniqExact(event_id) AS failures,
    uniqExact(persistent_id) AS users
FROM events
WHERE event_timestamp > now() - INTERVAL 7 DAY
  AND event_name = 'purchase_failed'
GROUP BY product_id, platform, error_description
ORDER BY failures DESC
LIMIT 30
```

One product with most failures usually means a store setup problem for that product.

## 4. Paywalls not shown on purpose

`experience_skipped` means targeting decided not to show a paywall. Many skips on a trigger can explain low opens:

```sql
SELECT trigger_name, uniqExact(event_id) AS skips, uniqExact(persistent_id) AS users
FROM events
WHERE event_timestamp > now() - INTERVAL 7 DAY
  AND event_name = 'experience_skipped'
GROUP BY trigger_name
ORDER BY skips DESC
```

## Report

Name the step with the biggest drop, the trigger or paywall where it happens, the numbers behind it, and the likely cause (rendering, price or offer, store errors, or targeting).
