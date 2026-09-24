// Seed anglais — le namespace `join`, et lui seul.
// Assemblé dans `../en.ts`; une clé `join.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enJoin = {
  // ── /join — the student's front door ────────────────────────────────────
  //
  // The ONLY page a student meets before they have an account. They did not
  // come from the landing (that page sells to coaches): they came from their
  // coach's invitation email, and they already have a coach. So this is not
  // acquisition copy — it is the welcome of someone who has decided, and now
  // wants to know what they are walking into.
  //
  // `{coach}` is ALWAYS the mid-sentence form: the caller passes the coach's
  // first name, or "your coach" when the RPC returned null. No key below may
  // put `{coach}` at the start of a sentence, or the fallback reads as a
  // lowercase opener. `invite.accept_title` is the one sentence-initial use,
  // and it carries its own "Your coach" fallback.
  //
  // EVERY CLAIM HERE IS A COLUMN, OR AN ABSENCE OF ONE. The sees/never-sees
  // block was written against the live schema, not against intent — see
  // docs/nutrition-pivot/STUDENT-PAGE.md for the line-by-line proof. Adding a
  // line here without that proof is how this page starts lying.

  // "{coach} coaches through" stuttered on the null branch ("your coach coaches
  // through"), which is the branch a student with an unnamed coach reads. The
  // possessive works on both substitutions.
  "join.lead":
    "Sophia is {coach}'s assistant, and from today it is yours too. It carries their method — their convictions, their red lines, the calls they make when it gets complicated — and answers you in it, every day, in your chat here.",
  "join.lead_form_note":
    "The form is at the bottom. Read this first — it is what you are agreeing to.",

  // The route carries a token, so it must never be indexed. It also had no
  // <SEO> at all, which left a student's first screen wearing the legacy
  // French index.html title.
  "join.seo_title": "Your coach's invitation",
  "join.seo_description":
    "What Sophia is, what your days will look like, and exactly what your coach can and cannot see — before you create anything.",

  // ⚠️ « LES MAPS `PREVIEW_REFUSALS` / `ACCEPT_REFUSALS` RESTENT INLINE,
  // VERBATIM ET INTOUCHÉES, PARCE QUE TRANSCRIRE UN REFUS EST COMMENT UN REFUS
  // S'AFFAIBLIT » — C'ÉTAIT ÉCRIT ICI, ET C'ÉTAIT UNE PROTECTION QUI PROTÉGEAIT
  // DU MAUVAIS RISQUE. Le risque réel n'était pas la réécriture: c'est que sept
  // refus restent en anglais sur la première page qu'un élève francophone voit,
  // avec une seule des sept clés (`invite.expired`) traduite — donc six phrases
  // anglaises encadrant une phrase française. Les voici, MOT POUR MOT: la
  // migration n'a changé aucun caractère, elle a seulement rendu ces phrases
  // atteignables par la table des langues.
  //
  // La prudence d'origine tient dans la règle: on ne réécrit pas un refus
  // pendant qu'on le déplace. Toute réécriture est un geste séparé, visible en
  // diff, sur une ligne qui ne bouge pas en même temps que son fichier.
  "join.refusal.invalid_token":
    "This invitation link is not valid. Check that you copied the whole link from the email, or ask your coach to send a new one.",
  "join.refusal.revoked": "Your coach cancelled this invitation. Ask them for a new one.",
  "join.refusal.already_accepted":
    "This invitation has already been used. If that was you, sign in — your space is waiting.",
  "join.refusal.coach_unavailable":
    "This coach's account is not active right now, so the invitation cannot be accepted.",
  // Le refus qui dit NON À UN GESTE AUTOMATIQUE autant qu'à l'invitation: on ne
  // déplace personne d'un coach à l'autre sans qu'il le fasse lui-même.
  "join.refusal.already_coached":
    "Your account already follows another coach's program. End that relationship from your account page first — we never move you between coaches without you doing it.",
  "join.refusal.self_invitation": "This invitation was issued by your own coach account.",
  // Les deux pannes de transport, distinctes des refus produit ci-dessus: la
  // lecture de l'invitation, puis son acceptation. La seconde dit « rien n'a
  // changé » parce que c'est vrai (la RPC est atomique) et parce que la
  // première peur devant un échec est d'avoir consommé son lien pour rien.
  "join.refusal.preview_unreachable":
    "We could not check this invitation right now. Reload the page to try again.",
  "join.refusal.accept_failed":
    "That did not go through. Nothing changed — reload and try again.",

  // Les deux attentes. Elles durent une seconde et personne ne les lit — sauf
  // le jour où le serveur rame, qui est le seul jour où elles comptent.
  "join.state.checking": "Checking this invitation...",
  "join.state.joining": "Joining...",

  // Le compte existe, l'invitation est acceptée, il reste l'e-mail à confirmer.
  // ⚠️ LE CORPS ÉTAIT COMPOSÉ PAR CONCATÉNATION dans le JSX — trois morceaux
  // recollés autour d'un `{coachName}'s` ou d'un « your coach's ». Une phrase
  // coupée en fragments ne se traduit pas: le génitif anglais devient un
  // complément en français, et « de + le » se contracte. Elle est donc UNE
  // clé, avec son trou dedans.
  "join.check_email.title": "Confirm your email",
  "join.check_email.body":
    "Your account is created and you are already attached to {coach}'s program. Open the confirmation email we just sent to finish signing in.",
  // Le coach sans prénom, en MILIEU de phrase — jamais en ouverture, sinon la
  // minuscule saute aux yeux. La forme initiale est `invite.coach_fallback`.
  "join.coach_fallback": "your coach",

  // Compact states.
  "join.refused.title": "This invitation cannot be used",
  "join.refused.signin_cta": "Sign in to an existing account",
  "join.accepted.title": "You are in.",
  "join.accepted.title_with_coach": "You are in, with {coach}.",
  "join.accepted.body":
    "Your space is open. Sophia is waiting in your chat, and your week lives here too.",
  // Le bouton dit où il emmène. Il partageait sa clé avec « Go to my space »,
  // qui reste juste pour un élève déjà installé et faux pour celui qui vient
  // d'entrer: on l'emmène dans la conversation, pas dans un espace vide.
  "join.accepted.cta": "Start talking to Sophia",

  // What the days actually look like. The eyebrow is the SURFACE, because
  // which screen a thing happens on is the useful fact.
  "join.day.title": "What this actually looks like",
  "join.day.where_chat": "In your chat",
  "join.day.where_app": "In this app",
  "join.day.photo_title": "You send a photo of your plate, whenever you want.",
  "join.day.photo_body":
    "One photo, no form to fill in and nothing to put on a scale for it. What comes back is an answer in {coach}'s method — what the plate does well, what it is short of, in their words rather than a nutrition label's.",
  "join.day.evening_title": "In the evening, one question and one tap.",
  "join.day.evening_body":
    "Good day, so-so, or rough. If it was not a good day, one more tap says whether it was energy, hunger or sleep. That is the whole thing, and you can leave it alone on the days you'd rather not.",
  "join.day.app_title": "Your week, and how it is going.",
  "join.day.app_body":
    "Sophia drafts a week from {coach}'s method and from what your life actually allows, and it is not yours until you say it is. Next to it: the days you logged, how the evenings went, what your plates looked like.",
  "join.day.tap_good": "All good",
  "join.day.tap_mixed": "So-so",
  "join.day.tap_hard": "Rough",

  // The dark block. The landing spends its one dark ground on the guarantee a
  // coach cares about; this page spends it on the one a student cares about.
  "join.grade.kicker": "The part that is different",
  "join.grade.title": "Counted, never graded",
  "join.grade.lead":
    "Things do get counted here — the days you logged, the plates you photographed, what showed up on them. The difference is what happens next: none of it is turned into a mark you have to chase, and a rough week never becomes a number you owe.",
  "join.grade.one_title": "No score, no streak, no percentage on your screens.",
  "join.grade.one_body":
    "Counts exist, and you can read them in your own space — but none of them is running against you. A day you miss breaks nothing, because there is no run to break and no total to spoil.",
  "join.grade.two_title": "A photo never becomes a number.",
  "join.grade.two_body":
    "Not from a photo, ever — nothing is read off your plate as a calorie or a macro, stored, or sent on. We measured why before deciding: across 85 real analyses, a calorie estimate from a photo landed 26.6% under the truth on average, and the model's own margin of error contained the truth barely more than half the time. Where a figure does exist in this product, it is computed from quantities someone actually gave — never from an image.",
  "join.grade.three_title": "A day you don't log is not a day you failed.",
  "join.grade.three_body":
    "Silence is recorded as unknown, and unknown is never quietly turned into a miss. It is the one thing this product refuses to guess about you.",

  // The ledger. The strongest argument on the page, and the only one that
  // required reading the database to write.
  "join.seen.kicker": "Before you send a single photo",
  "join.seen.title": "What {coach} sees, and what they don't",
  "join.seen.lead":
    "You are about to start showing your food to software. You should have the actual list, not a reassurance. This is it.",
  "join.seen.sees_label": "What crosses over",
  "join.seen.never_label": "What stays with you",
  "join.seen.sees_1": "Your name, and the time zone you live in.",
  "join.seen.sees_2": "When you last wrote, and how many times in the past week.",
  // Deliberately not the weaker "that you logged something": the coach view
  // carries `recognized`, `food_group_ref` and `quantity`, so the food groups
  // read off a plate DO cross over. Understating here would be the same
  // dishonesty as overstating, one page before someone types a password.
  "join.seen.sees_3":
    "What you logged and when — including the food groups read off a plate, and whether a photo came with it.",
  "join.seen.sees_4":
    "How the week went: how many days were good, so-so or rough, and which of energy, hunger or sleep comes up most when it isn't good.",
  // The student CAN get this back — `coach_access_events` has a student SELECT
  // policy and account-export-v1 includes it — but there is no screen for it,
  // so the copy points at the export rather than implying a page.
  "join.seen.sees_5":
    "Every time they open your space. That gets written down, and it comes back to you if you ask for your data.",
  "join.seen.never_1":
    "What you write. Their window over your conversation has two columns: when you last wrote, and how often. There is no column holding the words.",
  "join.seen.never_2":
    "Your photos. They reach Sophia and stop there. What your coach's view carries is that a photo existed, never the photo.",
  "join.seen.never_3": "Anything you add in your own words alongside a meal.",
  // ⚠️ RÉÉCRITE LE 2026-08-12 (FF-059), ET LA CLAUSE RETIRÉE COMPTE.
  //
  // Elle disait « there is no such number anywhere in here, FOR ANYONE ». En
  // contexte — cette liste dit ce que le COACH ne voit pas — la phrase restait
  // vraie: FF-059 n'a rien ouvert côté coach. C'est « for anyone » qui est
  // devenu faux, puisqu'un élève majeur, hors plancher TCA, dont le coach ne
  // s'y oppose pas, et qui l'a lui-même allumé, voit l'énergie de ses plats.
  //
  // Une page de CONSENTEMENT est le dernier endroit où l'on garde une clause
  // trop large parce qu'elle sonne mieux: elle est lue juste avant qu'on tape
  // un mot de passe, et c'est très exactement la promesse sur laquelle
  // quelqu'un décide. Ce qui reste ici est ce qui est encore vrai, et les deux
  // ⟳ RE-RÉÉCRITE LE 2026-09-01. La version du 2026-08-12 disait « le coach ne
  // voit rien (aucune surface ne le lui montre) ». C'était FAUX: `CoachStudentPage`
  // rend le bloc C8 « Starting numbers » — `coach.student.numbers.maintenance_value`,
  // « {low}–{high} kcal/day » — depuis la première pesée du dimanche. La clause
  // large a survécu à sa propre correction, sur la page où quelqu'un consent.
  // Ce qui reste vrai, et qui est maintenant dit en entier: rien de ce que
  // l'élève MANGE ne devient un chiffre côté coach, la photo n'en produit
  // aucun (−26,6 % de biais, le chemin photo n'a pas bougé), et la fourchette
  // que le coach voit sort de la PESÉE seule — elle est nommée plutôt que tue.
  "join.seen.never_4":
    "A calorie count read off your food. Nothing you eat turns into a figure for them, and a photo never produces one. What they do see is a maintenance bracket worked out from your weigh-in alone — the range they would open with, never a reading of your plates.",
  "join.seen.exception_label": "One exception, and it is deliberate",
  "join.seen.exception_body":
    "If something you write suggests your relationship with food is turning against you, that sentence goes to {coach} the same day, marked urgent. Software should not be the only thing holding that.",

  // The limit, stated plainly and immediately before the form — the last thing
  // read before a password is typed. There is no one-to-one channel, and a
  // page that lets someone hope for one has mis-sold the product on day one.
  "join.limit.title": "There is no direct line to {coach}",
  "join.limit.body":
    "This is not a messaging app with your coach at the other end. They teach one method to everyone they coach, and Sophia is how it reaches you daily. What you share builds the weekly picture they read — it is not a message waiting for their reply.",

  "join.form.title": "Create your space",
  "join.form.lead": "You are connected to {coach} the moment you finish.",
  "join.form.name": "Your name",
  "join.form.language":
    "The language you want to be spoken to in",
  "join.form.language_hint":
    "Your coach answers in this language, and writes your plan in it. You can change it later.",
  "join.form.email": "Email",
  "join.form.password": "Password",
  "join.form.password_hint": "At least 8 characters.",
  "join.form.submitting": "Creating your space…",
  "join.form.have_account": "Already have an account?",
  "join.form.have_account_cta": "Sign in and accept from there",
  "join.form.signed_in_as": "Signed in as {email}.",
  "join.form.signed_in_body":
    "Accepting opens exactly the window described above to {coach}, and nothing wider. They read; they can never act as you. You can end it from your account page whenever you want.",

  // No token. Not an error — the ordinary case of someone who typed the
  // address, or opened a link that lost its tail. There is one action, and it
  // is not on this page.
  "join.no_token.title": "You'll need your coach's link",
  "join.no_token.body":
    "There is no sign-up here. A space is only ever created from an invitation your coach sends you, with your address on it. Ask them for it, and open it on your phone.",
  "join.no_token.have_account": "Already have an account?",
  "join.no_token.have_account_cta": "Sign in",
  "join.no_token.what_is_this": "What you'd be joining",
} as const
