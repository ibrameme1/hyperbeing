# Credit Economy Implementation — Progress Notes

This file tracks progress on the full credit-based usage economy spec.
Delete this file once the implementation is complete and merged.

## ✅ Done

1. **`backend/config/credits.js`** (NEW) — single source of truth:
   `CREDIT_COSTS`, `EDIT_TIER_THRESHOLDS`, `PLAN_CREDITS`, `PLAN_LADDER`,
   `getEditTierThreshold()`, `suggestPlanForCost()`.
   - `CREDIT_COSTS.PROMPT_CHAT_MESSAGE = 8` added (new gate for the
     previously-uncovered prompt-chat Claude call).

2. **`backend/database.js`** — migrations added:
   - `subscriptions.edits_this_month`, `subscriptions.credits_reset_date`
   - `presentations.locked_slides` (TEXT, JSON array, server-side only)
   - `credit_transactions` extended: `credits_before`, `slides_generated`,
     `slides_locked`, `edit_tier_used`, `edits_this_month_before`, `metadata`
     — this table is now the full ledger (the spec's "credit_ledger").

3. **`backend/services/stripeService.js`** — fully rewritten:
   - `PLANS`: free/basic/pro/ultra1-4 with new credit allocations & prices
     (matches spec exactly). `PLANS.ultra` aliased to `ultra1` for legacy rows.
   - `ULTRA_TIERS[0..3]` now map to `ultra1..ultra4` (`{planKey, priceId, annualPriceId}`).
   - New: `deductCredits` (atomic, full ledger write, admin bypass),
     `refundCredits`, `deductCreditsForEdit` (atomic tier-check + deduct +
     `edits_this_month++`), `computeAffordableSlides`, `grantCredits`,
     `resetCreditsForPlan` (now also resets `edits_this_month`, sets
     `credits_reset_date`), `applyPlanUpgrade` (adds difference),
     `scheduleDowngrade` (defers via `pending_plan`, updates `credits_total`
     immediately), `scheduleCancellation` (don't zero credits — defer to
     `pending_plan='free'`), `maybeApplyScheduledReset` (lazy backstop),
     `getCreditsInfo` (for `GET /api/user/credits`).
   - Re-exports `CREDIT_COSTS`, `EDIT_TIER_THRESHOLDS`, etc. from
     `config/credits.js` for backward-compat imports.

4. **`backend/routes/billing.js`** — checkout handler updated:
   - `planKey:'ultra'` + `ultraTier` (0-3) now maps internally to
     `actualPlanKey = ultra1..ultra4` via `ULTRA_TIERS[ultraTier].planKey`.
   - `PLAN_RANK` updated for ultra1-4 (+ legacy `ultra` alias).
   - Upgrade path now calls `applyPlanUpgrade()` (adds diff) instead of
     `resetCreditsForPlan()`.
   - Downgrade path now calls `scheduleDowngrade()` (updates `credits_total`
     immediately, defers plan/credits_remaining via `pending_plan`).
   - Cancel-pending-downgrade path also updates `credits_total` back.

## 🚧 TODO (in order)

1. **`backend/routes/billing.js` webhook handlers** (NOT YET DONE):
   - `invoice.paid` (subscription_cycle): call
     `resetCreditsForPlan(sub.user_id, sub.pending_plan || sub.plan, resetDate)`
     where `resetDate` should come from
     `invoice.lines?.data?.[0]?.period?.end` (unix seconds → ISO).
   - `customer.subscription.deleted`: replace the immediate
     `credits_remaining = 0` update with `scheduleCancellation(sub.user_id)`.
   - `customer.subscription.updated`: `planFromStripe` will now already be
     `ultra1..ultra4` (set via metadata in checkout). Keep existing
     `resetCreditsForPlan` fallback for external/admin-driven plan changes
     (case where DB plan wasn't already updated by our own checkout flow).
   - `checkout.session.completed`: unchanged logic should still work since
     `planKey` in metadata will already be `ultra1..ultra4`.

2. **New endpoint `GET /api/user/credits`** — wire up `getCreditsInfo()`
   from stripeService. Decide which router (probably a new
   `backend/routes/user.js` or add to existing `billing.js`/`auth.js` —
   check `app.js`/`server.js` for route mounting prefix `/api/user`).

3. **`backend/routes/presentations.js`** — the big one:
   - `POST /` (create): REMOVE the upfront `deductCredits(... create_presentation ...)`.
     Credits are deducted inside `runFullFlow()` AFTER `generateCompactPlan()`
     returns `slides` (final count known), BEFORE Phase 2 / NB2.
     Use `computeAffordableSlides(userId, slides.length)` →
     `deductCredits(userId, affordable*PER_SLIDE, 'create_presentation', ..., {presentationId, slidesGenerated: affordable, slidesLocked: locked, metadata:{...}})`.
     - Only run `streamSlidePrompts`/`generateSlideImage` for the first
       `affordable` slides (by index order, e.g. `slides.slice(0, affordable)`).
     - For the locked slides: store `{status:'locked', slide_index, prompt: <nano_banana_prompt or fallback>, locked_reason:'insufficient_credits', credits_needed, suggested_plan, upgrade_url}` —
       BUT the prompt isn't known yet at lock time (Phase 2 hasn't run for
       them). Decision: run Phase 2 (`streamSlidePrompts`) for ALL slides
       (cheap, Claude-only) so prompts exist for locked slides too, but only
       call `generateSlideImage` (NB2) for the affordable ones. Store locked
       slides' `nano_banana_prompt` in the new `presentations.locked_slides`
       column (JSON array) — NEVER include `prompt` in the `slides_data`
       sent to frontend (strip it, send only placeholder metadata).
     - `credits_needed = locked * CREDIT_COSTS.PER_SLIDE`,
       `suggested_plan = suggestPlanForCost(plan, credits_needed)`,
       `upgrade_url = '/pricing?plan=' + suggested_plan`.
     - Ledger entry already covers `slides_generated`/`slides_locked`/`metadata`
       (put locked prompts + slide indexes in `metadata.locked_slides`).
     - If `affordable === 0` (can't even afford 1 slide): return the "cute
       Nova" 402 directly from the route handler BEFORE calling Claude at all
       — i.e. check `computeAffordableSlides` isn't quite right here since
       slide count isn't known pre-Claude. Re-read spec: "Claude runs first
       → calculate slides_affordable". So Claude (Phase 1, cheap) always
       runs; if `affordable === 0` after that, deduct 0, mark ALL slides
       locked, still return 201 (presentation created in 'partial'/locked
       state) — do NOT 402 the whole request (per spec, locked slides are
       the mechanism, not a hard error). Reserve the "cute Nova" 402 JSON
       shape for actions that aren't generation (see point 6).
     - On NB2 failure for an affordable slide: `refundCredits(userId, PER_SLIDE, 'generation_refund', ..., presentationId, {slide_index})`.
       Need to detect failure vs SVG-placeholder fallback — check
       `imageData.startsWith('data:image/svg')`.

   - `POST /:id/add-slides`: replace flat `CREDIT_COSTS.add_slides` deduction.
     - Fixed count (not 'auto'): deduct `count * CREDIT_COSTS.SLIDES_ADD_PER_SLIDE`
       BEFORE calling `streamNewSlides`/any API — use
       `computeAffordableSlides(userId, count)` first; if `affordable < count`,
       only request `affordable` slides from Claude, and create `locked`
       placeholders for the rest (same locked-slide shape, stored in
       `presentations.locked_slides`, indexes continuing from `startIndex`).
       If `affordable === 0`, return the cute-Nova 402 (this is a
       non-generation-context action where the user explicitly asked to add
       N slides and can't afford even 1 — matches "can't afford even 1
       slide" insufficient-credits case).
     - `'auto'` mode: Claude decides count via `streamNewSlides(description,
       null, ...)`. Deduct AFTER Claude returns the slide defs (same
       affordability/locking pattern as main generation), BEFORE NB2.
     - Refund on NB2 failure per slide, same as above.

   - `POST /:id/slides/:index/regenerate` (slide edit):
     - Determine `hasReferenceImage` = `(reqBodyAttachments || []).some(a => a.data)`
       (user-uploaded reference images; the auto-included "current rendered
       slide" `pic1` does NOT count as a reference image).
     - Call `deductCreditsForEdit(userId, presentationId, hasReferenceImage, description)`
       BEFORE calling `generateSlideImage`. On `INSUFFICIENT_CREDITS`, respond
       with the cute-Nova 402 (action_type: 'slide_edit').
     - On NB2 failure, `refundCredits(userId, cost, 'slide_edit_refund', ...)`.

   - `POST /:id/slides/:index/retry`:
     - Same `deductCreditsForEdit(userId, presentationId, false, 'Retry slide')`
       (no reference image possible — `[]` attachments). Refund on failure.

   - **NEW** `POST /:id/unlock-slides`:
     - Body `{slide_indexes: number[]}`.
     - Read `presentations.locked_slides` (JSON array of
       `{slide_index, prompt, type, ...}`), filter to requested indexes.
     - `cost = slide_indexes.length * CREDIT_COSTS.PER_SLIDE`.
     - If `credits_remaining < cost`: 402 cute-Nova
       `{credits_remaining, credits_needed: cost, suggested_plan, upgrade_url}`.
     - Else: `deductCredits(...)`, then for each unlocked slide call
       `generateSlideImage(prompt, ...)`, merge into `slides_data`, remove
       from `locked_slides`, write ledger entry
       (`type:'unlock_slides', slidesGenerated: N`), broadcast `slide_ready`
       events, return generated slides (with image_data) to caller.
     - Refund any slides that fail NB2 (partial refund for failed ones only).

4. **Cute-Nova 402 helper** — add a small helper (e.g. in
   `backend/config/credits.js` or a new `backend/services/novaErrors.js`):
   ```js
   function novaInsufficientCredits({credits_remaining, credits_needed, action_type, current_plan}) {
     return {
       error: "omg i can't help with that right now... you're out of credits 🥺",
       nova: true,
       credits_remaining, credits_needed, action_type,
       current_plan,
       suggested_plan: suggestPlanForCost(current_plan, credits_needed),
       upgrade_url: '/pricing',
       code: 'INSUFFICIENT_CREDITS',
     };
   }
   ```
   Use this everywhere a 402 is returned for credits (replace the old
   `{error:'Insufficient credits', code:'INSUFFICIENT_CREDITS'}` shape).

5. **`backend/routes/promptChat.js`** — add
   `deductCredits(userId, CREDIT_COSTS.PROMPT_CHAT_MESSAGE, 'prompt_chat', 'Prompt generator message')`
   before calling `generatePromptResponse()`. 402 with cute-Nova shape on
   `INSUFFICIENT_CREDITS`. Refund not needed (Claude call doesn't have the
   same placeholder-fallback failure mode as NB2 — but if it throws, refund).

6. **Frontend**:
   - `frontend/src/components/SlideRenderer.jsx`: handle `slide.status ===
     'locked'` — render lock icon, "Unlock this slide — you need X more
     credits", upgrade button (calls `/unlock-slides` or navigates to pricing).
   - `frontend/src/components/OutOfCreditsModal.jsx`: update to consume the
     new cute-Nova 402 shape (`credits_remaining`, `credits_needed`,
     `action_type`, `suggested_plan`, `upgrade_url`); update `UPGRADE_OPTIONS`
     for ultra1-4.
   - `frontend/src/pages/Pricing.jsx`: DROP the `CM = 10` multiplier — display
     raw backend numbers. Update `PLANS`/`ULTRA_TIERS` arrays to the new
     allocations (1200/3200/8000/11200/14400/16000) and prices (already
     correct: 149/209/269/299, 116/157/194/209). Update `CREDIT_TABLE` to
     reflect `PER_SLIDE=18`-based costs (e.g. "Create presentation (per
     slide): 18", "Add slide: 18", "Edit slide: 5–15 (tiered)", "Reference
     image: +5/slide", "Export: free").
   - Add a small credits hook/util that calls `GET /api/user/credits` after
     every AI action (generation complete, add-slides complete, edit
     complete, unlock) and updates a shared credits display (header/sidebar —
     find where current credit balance is shown, likely `Dashboard.jsx` or a
     layout component — NOT YET LOCATED).
   - `EditSlideModal.jsx`: optionally show edit cost preview (TIER_1/TIER_2 +
     reference surcharge) — lower priority; at minimum handle new 402 shape.

## Key files already fully read (content known, don't re-read unless changed)
- `backend/database.js`, `backend/services/stripeService.js`,
  `backend/config/credits.js`, `backend/routes/billing.js` (mid-edit),
  `backend/routes/presentations.js` (1087 lines, full content captured),
  `backend/routes/admin.js`, `backend/services/imageGeneration.js`,
  `backend/middleware/auth.js`, `backend/prompts/system_prompt.md`,
  `frontend/src/components/{OutOfCreditsModal,EditSlideModal,SlideRenderer}.jsx`,
  `frontend/src/pages/Pricing.jsx` (729 lines — re-read if needed, large).

## Not yet located
- Where `GET /api/user/credits` should be mounted (check `backend/server.js`
  or `backend/app.js` for router prefixes).
- Where the frontend displays the user's current credit balance (for the
  "refresh after every AI action" requirement).
