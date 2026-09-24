// Seed anglais — le namespace `account`, et lui seul.
// Assemblé dans `../en.ts`; une clé `account.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enAccount = {
  // ══ `/account` — LE COMPTE ══════════════════════════════════════════════
  // `components/UserProfile.tsx`, `components/account/DataPrivacySection.tsx`
  // et `components/account/DeletionPendingScreen.tsx`. Tout était en dur, en
  // anglais. ⚠️ Le mot de confirmation « DELETE » n'est PAS ici: c'est
  // `account-deletion-v1` qui le compare, dans les deux langues.
  "account.close": "Close",
  "account.cancel": "Cancel",
  "account.save": "Save",
  "account.saving": "Saving…",
  "account.sign_out": "Sign out",
  "account.fallback_name": "User",
  "account.tab.general": "Account",
  "account.tab.subscription": "Subscription",
  "account.tab.settings": "Options",
  "account.general.section": "Personal details",
  "account.general.full_name": "Full name",
  "account.general.full_name_placeholder": "Your name",
  "account.general.saved": "Details saved.",
  "account.general.error.save": "Could not save.",
  "account.general.email": "Email",
  "account.email.change": "Change my email",
  "account.email.new_aria": "New email address",
  "account.email.new_placeholder": "new-email@example.com",
  "account.email.confirm": "Confirm",
  "account.email.sending": "Sending…",
  "account.email.hint":
    "If email confirmation is enabled, Sophia will ask you to confirm through a link sent to your inbox.",
  "account.email.error.required": "Email is required.",
  "account.email.unchanged": "Email unchanged.",
  "account.email.sent": "Request sent. Check your email to confirm the change.",
  "account.email.error.failed": "Could not change the email.",
  // Le lien part vers l'adresse DU COMPTE, jamais vers une adresse saisie.
  "account.password.change": "Change my password",
  "account.password.sending": "Sending…",
  "account.password.sent": "A link to change your password was sent to {email}.",
  "account.password.error": "Could not send the link.",
  // `{days}` est déjà pluralisé par `plural()` au site d'appel.
  "account.member_for": "Member for {days}",
  "account.member_days_one": "{count} day",
  "account.member_days_many": "{count} days",
  // L'onglet ne gère plus rien lui-même: l'abonnement a sa page
  // (`/app/billing`, ou `/coach/billing` pour un coach).
  "account.subscription.body": "Your subscription is managed on its own page.",
  "account.subscription.cta": "See my subscription",
  "account.settings.section": "Preferences",
  "account.settings.language": "Language",
  "account.settings.language_hint":
    "Applies immediately, and reloads. This is also the language Sophia answers you in.",
  "account.settings.timezone": "Time zone (IANA)",
  "account.settings.timezone_current_device": "Current: {tz} (device)",
  "account.settings.timezone_current_profile": "Current: {tz} (profile)",
  "account.settings.roaming": "Roaming",
  "account.settings.roaming_hint": "Follow the device time zone automatically.",
  "account.settings.roaming_aria": "Enable roaming",
  "account.settings.saved": "Preferences saved.",
  "account.settings.error.save": "Could not save preferences.",
  "account.error.wrong_password": "Wrong password.",
  "account.data.section": "My data",
  "account.export.title": "Export my data",
  "account.export.body":
    "Download a copy of your data (profile, plans, conversations, memories) as JSON in a ZIP archive. Limit: 1 export per 24 h.",
  "account.export.open": "Prepare my export",
  "account.export.password_label": "Confirm your password to continue",
  "account.export.password_placeholder": "Your password",
  "account.export.download": "Download the archive (link valid for 15 minutes)",
  "account.export.preparing": "Preparing the archive…",
  "account.export.generate": "Generate my export",
  "account.export.safety":
    "For your safety, a notification is sent in your chat and by email for every export request. The file contains sensitive personal data: keep it somewhere safe.",
  "account.export.error.rate_limited":
    "You already requested an export recently (limit: 1 export per 24 h). Try again later.",
  "account.export.error.failed":
    "The export failed. Try again in a few minutes, or write to sophia@sophia-coach.ai.",
  "account.delete.title": "Delete my account",
  "account.delete.done_title": "Done",
  "account.delete.export_body":
    "Before you go, you can download a copy of your data (profile, plans, conversations, memories). It is optional — and only possible while your account still exists.",
  "account.delete.export_first": "Download my data first",
  "account.delete.continue": "Continue",
  "account.delete.explain_title": "Here is what will happen:",
  "account.delete.explain_access": "Your access to the app is cut off immediately.",
  "account.delete.explain_messages": "Sophia stops writing to you straight away.",
  "account.delete.explain_subscription":
    "Your subscription is cancelled immediately, with no further charge. The period already paid is not refunded pro rata.",
  "account.delete.explain_purge": "All your data is permanently deleted in 7 days.",
  "account.delete.explain_irreversible": "This deletion is irreversible.",
  "account.delete.explain_restore":
    "You can change your mind: sign in again before that date and your account is restored in one click (the subscription is not reactivated automatically).",
  // Trois morceaux par phrase: le gras est au milieu. Pas d'espace de bord
  // (`parity.int.test.ts`), donc le deux-points vit DANS le gras.
  "account.delete.member_lead": "Your place in {household} is",
  "account.delete.member_kept": "kept by default:",
  "account.delete.member_rest":
    "your serving and your allergies stay part of the household so nobody there loses a meal. You can ask for it to go too, on the next screen.",
  "account.delete.owner_lead": "You run {household}. It is",
  "account.delete.owner_kept": "not deleted",
  "account.delete.owner_rest":
    "— the people in it keep their servings, their allergies and their meals. What you lose is your access to it.",
  "account.delete.household_your": "your household",
  "account.delete.household_a": "a household",
  "account.delete.household_this": "this household",
  "account.delete.kept_title": "What is kept",
  "account.delete.kept_body":
    "The invoices for your payments (statutory accounting retention obligation) and a minimal anonymised record of the deletion (hashed email and phone number, with the date) as proof of compliance. Nothing else.",
  "account.delete.understand": "I understand, continue",
  "account.delete.confirm_lead": "Last step. Confirm your password, then type",
  "account.delete.confirm_rest": "to delete your account.",
  "account.delete.leave_question": "Also remove my place in {household}?",
  "account.delete.leave_body":
    "Leave this unticked and your place stays: your first name, your serving and your allergies remain part of the household, and nobody there loses a meal. Tick it and all of that is deleted along with your account, on the same day.",
  "account.delete.password": "Password",
  "account.delete.type_word": "Type {word}",
  "account.delete.error.rate_limited": "Too many attempts. Try again in an hour.",
  "account.delete.error.request":
    "The request failed. Try again, or write to sophia@sophia-coach.ai.",
  "account.delete.error.word": "Type exactly \"{word}\" to confirm.",
  "account.delete.error.subscription":
    "Could not cancel your subscription right now. Nothing has been deleted — try again in a few minutes.",
  "account.delete.error.failed": "The deletion failed. Nothing has been deleted — try again.",
  "account.delete.deleting": "Deleting…",
  "account.delete.confirm": "Permanently delete my account",
  "account.delete.done_deactivated": "Your account is deactivated.",
  "account.delete.done_restore":
    "If you change your mind, sign in again before that date: your account will be restored in one click.",
  "account.delete.done_subscription":
    "Your subscription has been cancelled and will not be reactivated automatically.",
  "account.delete.done_thanks":
    "Thank you for walking part of the way with Sophia. Take care of yourself.",
  // La date de purge. Deux formes: avec la date, et sans (la date manque).
  "account.purge.lead": "All your data will be",
  "account.purge.on": "permanently deleted on {date}",
  "account.purge.soon": "permanently deleted in 7 days",
  "account.pending.title": "Your account is being deleted",
  "account.pending.restore_body":
    "Until then, you can restore your account in one click: everything is put back (plans, conversations, memories, reminders).",
  "account.pending.subscription":
    "If you had a subscription, it has been cancelled and will not be reactivated automatically: you can take out a new one from the Subscription page.",
  "account.pending.error": "The restore failed. Try again, or contact sophia@sophia-coach.ai.",
  "account.pending.restoring": "Restoring…",
  "account.pending.restore": "Restore my account",
} as const
