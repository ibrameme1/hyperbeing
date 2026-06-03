import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({ from = 'onboarding@resend.dev', to, subject, html }) {
  const { data, error } = await resend.emails.send({ from, to, subject, html });
  if (error) throw new Error(error.message);
  return data;
}

export async function sendWelcomeEmail(toEmail) {
  return sendEmail({
    to: toEmail,
    subject: 'Hello World',
    html: '<p>Congrats on sending your <strong>first email</strong>!</p>',
  });
}
