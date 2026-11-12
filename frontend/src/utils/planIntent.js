// A visitor who picks a plan before signing in shouldn't have to find it
// again afterwards. The choice is parked in sessionStorage (this tab only),
// survives the login / OAuth round-trip, and is picked up once they land in
// the app (see PlanIntentResume in App.jsx), which sends them to
// /pricing?plan=… with that plan ready to check out. Nothing is charged
// until they press the button there.
const KEY = 'hb_plan_intent';
const MAX_AGE_MS = 60 * 60 * 1000;
const PLANS = ['basic', 'pro', 'ultra'];

export function savePlanIntent({ plan, billing = 'annual', ultraTier = 0 }) {
  if (!PLANS.includes(plan)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ plan, billing: billing === 'monthly' ? 'monthly' : 'annual', ultraTier: Number(ultraTier) || 0, at: Date.now() }));
  } catch { /* private mode: the visitor just picks the plan again */ }
}

// Returns the parked choice once and forgets it.
export function takePlanIntent() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const v = JSON.parse(raw);
    if (!PLANS.includes(v?.plan) || Date.now() - (v.at || 0) > MAX_AGE_MS) return null;
    return v;
  } catch { return null; }
}
