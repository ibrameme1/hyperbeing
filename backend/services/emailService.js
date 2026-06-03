import { Resend } from 'resend';
import { logger } from './logger.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM || 'HyperBeing <onboarding@resend.dev>';

function appUrl() {
  return process.env.FRONTEND_URL || 'https://hyperbeing.co';
}

// ── Base template ─────────────────────────────────────────────────────────────

function base(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>HyperBeing</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Logo -->
        <tr><td style="padding-bottom:24px;text-align:center;">
          <span style="font-size:22px;font-weight:800;color:#18181b;letter-spacing:-0.5px;">Hyper<span style="color:#7c3aed;">Being</span></span>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#ffffff;border-radius:16px;padding:40px 36px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
          ${content}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:24px;text-align:center;font-size:12px;color:#a1a1aa;">
          HyperBeing · AI-powered presentations ·
          <a href="${appUrl()}" style="color:#7c3aed;text-decoration:none;">hyperbeing.co</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(text, url) {
  return `<a href="${url}" style="display:inline-block;margin-top:24px;padding:13px 28px;background:#7c3aed;color:#fff;border-radius:10px;font-weight:600;font-size:15px;text-decoration:none;">${text}</a>`;
}

function divider() {
  return `<hr style="border:none;border-top:1px solid #f4f4f5;margin:28px 0;" />`;
}

function tag(text, color = '#7c3aed') {
  return `<span style="display:inline-block;padding:3px 10px;background:${color}18;color:${color};border-radius:99px;font-size:12px;font-weight:600;">${text}</span>`;
}

// ── Low-level send (never throws — logs errors) ───────────────────────────────

async function send(to, subject, html) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) logger.warn('email send failed', { to, subject, error: error.message });
  } catch (err) {
    logger.warn('email send error', { to, subject, errorMessage: err.message });
  }
}

// ── 1. Welcome ────────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(name, email) {
  const html = base(`
    <p style="margin:0 0 4px;font-size:13px;color:#7c3aed;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Welcome aboard 🎉</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#18181b;line-height:1.2;">Hey ${name}, you made it!</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6;">
      Your HyperBeing account is all set up. Turn any idea into a stunning presentation in seconds — seriously, try it.
    </p>
    <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;">
      You've got <strong style="color:#18181b;">15 free credits</strong> to play with. No credit card needed.
    </p>
    ${btn('Make your first presentation →', appUrl())}
    ${divider()}
    <p style="margin:0;font-size:13px;color:#a1a1aa;">Questions? Just reply to this email — we actually read them.</p>
  `);
  await send(email, 'Your HyperBeing account is ready ✨', html);
}

// ── 2. Purchase confirmation ──────────────────────────────────────────────────

export async function sendPurchaseConfirmation(name, email, planName, credits) {
  const html = base(`
    <p style="margin:0 0 4px;font-size:13px;color:#16a34a;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Payment confirmed ✅</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#18181b;line-height:1.2;">You're on ${planName} now.</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6;">
      Thanks for the upgrade, ${name}! Your account has been topped up with <strong style="color:#18181b;">${credits} credits</strong> — go wild.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f9f8ff;border-radius:10px;padding:16px 20px;width:100%;">
      <tr>
        <td style="font-size:13px;color:#71717a;">Plan</td>
        <td style="font-size:13px;color:#18181b;font-weight:700;text-align:right;">${planName}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#71717a;padding-top:8px;">Credits</td>
        <td style="font-size:13px;color:#18181b;font-weight:700;text-align:right;padding-top:8px;">${credits}</td>
      </tr>
    </table>
    ${btn('Start creating →', appUrl())}
    ${divider()}
    <p style="margin:0;font-size:13px;color:#a1a1aa;">Manage your billing anytime at <a href="${appUrl()}/billing" style="color:#7c3aed;">hyperbeing.co/billing</a></p>
  `);
  await send(email, `You're on ${planName} — let's go! 🚀`, html);
}

// ── 3. Plan upgraded ──────────────────────────────────────────────────────────

export async function sendPlanUpgraded(name, email, newPlanName, credits) {
  const html = base(`
    <p style="margin:0 0 4px;font-size:13px;color:#7c3aed;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Level up ⬆️</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#18181b;line-height:1.2;">Welcome to ${newPlanName}, ${name}!</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6;">
      Your plan has been upgraded and your credits have been refreshed. You now have <strong style="color:#18181b;">${credits} credits</strong> ready to go.
    </p>
    ${btn('Keep building →', appUrl())}
  `);
  await send(email, `Upgraded to ${newPlanName} ⬆️`, html);
}

// ── 4. Plan downgrade scheduled ───────────────────────────────────────────────

export async function sendPlanDowngradeScheduled(name, email, currentPlan, pendingPlan, periodEnd) {
  const date = periodEnd ? new Date(periodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'end of billing period';
  const html = base(`
    <p style="margin:0 0 4px;font-size:13px;color:#f59e0b;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Plan change scheduled</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#18181b;line-height:1.2;">Heads up, ${name}.</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6;">
      You've switched from <strong style="color:#18181b;">${currentPlan}</strong> to <strong style="color:#18181b;">${pendingPlan}</strong>.
      The change kicks in on <strong style="color:#18181b;">${date}</strong> — until then, you keep everything you have now.
    </p>
    <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;">
      Changed your mind? You can revert anytime before then from your billing page.
    </p>
    ${btn('Manage billing', `${appUrl()}/billing`)}
  `);
  await send(email, `Your plan changes on ${date}`, html);
}

// ── 5. Subscription cancelled ─────────────────────────────────────────────────

export async function sendSubscriptionCancelled(name, email) {
  const html = base(`
    <p style="margin:0 0 4px;font-size:13px;color:#71717a;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Subscription cancelled</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#18181b;line-height:1.2;">Sorry to see you go, ${name}.</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6;">
      Your subscription has been cancelled and your account is back on the free plan. Your presentations are still there — nothing gets deleted.
    </p>
    <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;">
      If something wasn't working right, just reply and tell us — we'd genuinely love to fix it.
    </p>
    ${btn('Come back anytime', `${appUrl()}/pricing`)}
  `);
  await send(email, 'Your subscription has been cancelled', html);
}

// ── 6. Renewal receipt ────────────────────────────────────────────────────────

export async function sendRenewalReceipt(name, email, planName, credits) {
  const html = base(`
    <p style="margin:0 0 4px;font-size:13px;color:#16a34a;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Renewed 🔄</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#18181b;line-height:1.2;">You're all set for another month.</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6;">
      Hey ${name}, your <strong style="color:#18181b;">${planName}</strong> plan just renewed and your credits have been topped up.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f9f8ff;border-radius:10px;padding:16px 20px;width:100%;">
      <tr>
        <td style="font-size:13px;color:#71717a;">Plan</td>
        <td style="font-size:13px;color:#18181b;font-weight:700;text-align:right;">${planName}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#71717a;padding-top:8px;">Credits refreshed</td>
        <td style="font-size:13px;color:#18181b;font-weight:700;text-align:right;padding-top:8px;">${credits}</td>
      </tr>
    </table>
    ${btn('Get creating →', appUrl())}
    ${divider()}
    <p style="margin:0;font-size:13px;color:#a1a1aa;">To manage or cancel your plan visit <a href="${appUrl()}/billing" style="color:#7c3aed;">your billing page</a>.</p>
  `);
  await send(email, `${planName} renewed — ${credits} fresh credits waiting 🎨`, html);
}

// ── 7. Payment failed ─────────────────────────────────────────────────────────

export async function sendPaymentFailed(name, email, planName) {
  const html = base(`
    <p style="margin:0 0 4px;font-size:13px;color:#dc2626;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Action needed ⚠️</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#18181b;line-height:1.2;">Payment didn't go through, ${name}.</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6;">
      We couldn't charge your card for your <strong style="color:#18181b;">${planName}</strong> subscription. Happens to the best of us — just update your payment method and you'll be back in business.
    </p>
    <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;">
      If we can't collect payment soon, your account will drop to the free plan.
    </p>
    ${btn('Update payment method →', `${appUrl()}/billing`)}
    ${divider()}
    <p style="margin:0;font-size:13px;color:#a1a1aa;">Need help? Reply to this email and we'll sort it out.</p>
  `);
  await send(email, 'Payment failed — update your card to stay on ' + planName, html);
}

// ── 8. Credits granted by admin ───────────────────────────────────────────────

export async function sendCreditsGranted(name, email, creditsAdded, newBalance) {
  const html = base(`
    <p style="margin:0 0 4px;font-size:13px;color:#7c3aed;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Gift from us 🎁</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#18181b;line-height:1.2;">You just got ${creditsAdded} bonus credits!</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6;">
      Hey ${name}, we dropped some extra credits into your account. Your balance is now <strong style="color:#18181b;">${newBalance} credits</strong>. Enjoy!
    </p>
    ${btn('Go make something →', appUrl())}
  `);
  await send(email, `🎁 You got ${creditsAdded} bonus credits!`, html);
}

// ── 9. Presentation ready ─────────────────────────────────────────────────────

export async function sendPresentationReady(name, email, presentationId, title) {
  const presUrl = `${appUrl()}/presentation/${presentationId}`;
  const displayTitle = title && title !== 'Untitled Presentation' ? title : 'your presentation';
  const html = base(`
    <p style="margin:0 0 4px;font-size:13px;color:#7c3aed;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Done! ✨</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#18181b;line-height:1.2;">${displayTitle} is ready.</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6;">
      Hey ${name}, we just finished building your slides. Click below to check them out — and feel free to keep tweaking until it's perfect.
    </p>
    ${btn('View presentation →', presUrl)}
    ${divider()}
    <p style="margin:0;font-size:13px;color:#a1a1aa;">This was created with HyperBeing — AI-powered presentations.</p>
  `);
  await send(email, `"${displayTitle}" is ready to view 👀`, html);
}

// ── 10. Account deleted ───────────────────────────────────────────────────────

export async function sendAccountDeleted(name, email) {
  const html = base(`
    <p style="margin:0 0 4px;font-size:13px;color:#71717a;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Account deleted</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:#18181b;line-height:1.2;">All gone, ${name}.</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6;">
      Your HyperBeing account and all associated data have been permanently deleted. No hard feelings — if you ever want to come back, the door's always open.
    </p>
    <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;">
      If you didn't request this deletion, reply to this email immediately.
    </p>
  `);
  await send(email, 'Your HyperBeing account has been deleted', html);
}
