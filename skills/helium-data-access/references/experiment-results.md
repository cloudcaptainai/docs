# Experiment results

Use when the user asks how an experiment is doing, which variant is winning, or whether an experiment is set up correctly.

## 1. Find the experiment

```sql
SELECT
    experiment_id,
    experiment_name,
    experiment_chosen_variant_name AS variant,
    uniqExact(persistent_id) AS allocated_users,
    min(event_timestamp) AS first_allocation,
    max(event_timestamp) AS last_allocation
FROM events
WHERE event_name = 'user_experiment_allocated'
  AND event_timestamp > now() - INTERVAL 30 DAY
GROUP BY experiment_id, experiment_name, variant
ORDER BY experiment_name, variant
```

Use `experiment_id` in later queries. Names can be reused or renamed.

## 2. Check the split

Compare `allocated_users` per variant with the split configured in Helium. A large mismatch (for example 45/55 on a 50/50 test with thousands of users) means allocation or event delivery is uneven, and the variant comparison is not reliable. Report it before any results.

## 3. Paywall conversion per variant

Counts users, not events. A user is converted if they had a `purchase_succeeded` event after allocation. Paywall and purchase events carry the experiment fields only when they come from the experiment's paywalls, so this measures conversion on those paywalls. For purchases from anywhere in the app, use step 4.

```sql
WITH 'EXPERIMENT_ID' AS exp
SELECT
    variant,
    count() AS allocated_users,
    countIf(opened) AS opened_users,
    countIf(purchased) AS purchased_users,
    round(purchased_users / nullIf(allocated_users, 0), 4) AS conversion_per_allocated_user,
    round(purchased_users / nullIf(opened_users, 0), 4) AS conversion_per_opened_user
FROM
(
    SELECT
        persistent_id,
        argMinIf(experiment_chosen_variant_name, event_timestamp, event_name = 'user_experiment_allocated') AS variant,
        minIf(event_timestamp, event_name = 'user_experiment_allocated') AS allocated_at,
        maxIf(event_timestamp, event_name = 'experience_opened') >= allocated_at AS opened,
        maxIf(event_timestamp, event_name = 'purchase_succeeded') >= allocated_at AS purchased
    FROM events
    WHERE experiment_id = exp
      AND event_timestamp > now() - INTERVAL 30 DAY
    GROUP BY persistent_id
    HAVING countIf(event_name = 'user_experiment_allocated') > 0
)
GROUP BY variant
ORDER BY variant
```

## 4. Revenue per variant

Uses store data attributed to the experiment, so it includes renewals and refunds that the SDK never sees.

```sql
SELECT
    attributed_variant_allocation_name AS variant,
    count() AS subscriptions,
    countIf(trial_start_timestamp > '1970-01-02' AND trial_start_timestamp < '2200-01-01') AS trials,
    countIf(has_paid_revenue = 1) AS paid_subscriptions,
    countIf(has_access = 1) AS active_subscriptions,
    round(sum(total_revenue_usd), 2) AS revenue_usd,
    round(sum(net_revenue_usd), 2) AS net_revenue_usd
FROM subscriptions
WHERE attributed_experiment_id = 'EXPERIMENT_ID'
  AND environment = 'PRODUCTION'
GROUP BY variant
ORDER BY variant
```

Revenue per allocated user is `net_revenue_usd` from this query divided by `allocated_users` from step 1. Use the same date window for both.

## Read the result

- Small samples swing a lot. With fewer than a few hundred purchases per variant, say the result is not conclusive yet.
- Revenue keeps changing after a purchase: trials convert, renewals arrive, refunds come in weeks later. Variants that started on different days are not comparable on lifetime revenue.
- Only subscriptions Helium could link to a paywall session are attributed. If attribution differs a lot between variants, say so.

## Report

Give the split check result first, then conversion and revenue per variant, the window, sample sizes, and whether the difference is large enough to act on.
