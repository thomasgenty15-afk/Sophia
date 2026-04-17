export function looksLikeEmail(raw) {
  const t = (raw ?? "").trim();
  // Conservative email regex; good enough for onboarding.
  const m = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : null;
}
export function normalizeEmail(raw) {
  return (raw ?? "").trim().toLowerCase();
}
export async function maybeSendEmail(params) {
  const { sendResendEmail } = await import("../_shared/resend.ts");
  const out = await sendResendEmail({
    to: params.to,
    subject: params.subject,
    html: params.html,
    maxAttempts: 6
  });
  if (!out.ok) return {
    ok: false,
    error: out.error
  };
  return {
    ok: true,
    data: out.data
  };
}
export async function getAccountEmailForProfile(admin, profileId, profileEmail) {
  const direct = (profileEmail ?? "").trim();
  if (direct) return direct;
  const { data: userData } = await admin.auth.admin.getUserById(profileId);
  return (userData?.user?.email ?? "").trim();
}
