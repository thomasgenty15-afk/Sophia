// Seed anglais — le namespace `household_claim`, et lui seul.
// Assemblé dans `../en.ts`; une clé `household_claim.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enHouseholdClaim = {
  // ── LA PAUSE (chantier 3, D4) ────────────────────────────────────────────
  //
  // L'ORDRE DES PHRASES EST LA DÉCISION. « Rien n'est perdu » vient AVANT « ce
  // qui s'arrête », parce que c'est la première peur de quelqu'un qui a saisi
  // huit personnes, leurs âges et leurs allergies — et parce que c'est vrai:
  // D4 gèle, n'efface jamais. L'inverse (« votre accès est suspendu ») produit
  // la conviction que les données sont parties, et cette conviction ne se
  // rattrape pas avec un second paragraphe.
  //
  // AUCUN MONTANT, AUCUNE DATE. Le prix vit derrière le tunnel Stripe, qui en
  // est la source; l'écrire ici en ferait une seconde, celle qui ment le jour
  // où un humain prolonge un essai à la main.
  //
  // AUCUN REPROCHE. « Votre paiement a échoué » accuse quelqu'un dont la carte
  // a expiré pendant ses vacances. On dit l'état, et le geste.
  // ⟳ 2026-09-09 — CES SIX CLÉS ONT DÉMÉNAGÉ EN `app.paywall.*` (FF-064).
  // La phrase n'a pas changé d'un caractère; c'est l'écran qui la porte qui a
  // changé. Elle vivait sur une carte de `/app/household`, visible seulement de
  // qui y arrivait; elle est maintenant le mur qui ferme tout `/app/*`.
  // Un profil réclamé ne porte pas la carte: c'est le compte maître qui paie
  // (11,99 € le foyer, +2 € par profil réclamé). Lui montrer un bouton refusé
  // par le serveur serait la version « écran » du défaut que ce lot retire.

  // ── /join-household — RÉCLAMER SON PROFIL (lot 6) ────────────────────────
  //
  // DEUX MOITIÉS, MÊME POIDS. « Ce que ça donne » et « ce que ça ne donne
  // pas » sont côte à côte parce qu'une seule personne gouverne le menu, et
  // que ce choix est INVISIBLE si on ne l'écrit pas: quelqu'un qui réclame en
  // croyant pouvoir composer l'apprendrait par un bouton absent.
  //
  // Aucune phrase ici ne parle de ce qui est « bon » pour quelqu'un — même
  // règle que le reste du bloc foyer: le domestique et l'épistémique ne se
  // mélangent jamais.
  //
  // ⚠️ NAMESPACE `household_claim` ET NON `household`, alors que la page est
  // voisine. La raison est la frontière de traduction (i18n/catalog.ts): cette
  // page est PUBLIQUE — elle s'ouvre sans compte — donc elle appartient à la
  // liste des surfaces de vitrine pas encore traduites. `household.*`, lui,
  // vit dans le produit connecté, anglais par choix et sans dette. Les mêler
  // ferait croire à une traduction due pour tout l'écran du foyer.
  "household_claim.seo_title": "Claim your profile — Sophia",
  "household_claim.seo_description":
    "Attach your account to the line someone already set up for you in their household.",
  "household_claim.checking": "Checking this link...",
  "household_claim.title": "{name}'s place in {household}",
  "household_claim.lead":
    "Someone already set up this line: {name}'s first name, allergies, and what the house does not serve. Claiming it attaches your account to that same line — it does not create a second one, and nothing already on it is lost.",
  "household_claim.gains_label": "What claiming gives you",
  "household_claim.gains_1": "You read what the household is cooking, and your own serving.",
  "household_claim.gains_2":
    "You set your own direction — losing fat, building muscle, or none — and your serving follows it.",
  "household_claim.gains_3": "Your first name, your allergies and your line stay yours.",
  "household_claim.limits_label": "What it does not give you",
  "household_claim.limits_1":
    "You do not compose the plan, and you do not add or remove anyone. One person runs the menu.",
  "household_claim.limits_2":
    "You do not decide what the house does not serve — and whoever does is named on screen, never hidden.",
  "household_claim.signed_in_as": "You are signed in as {email}.",
  "household_claim.submit": "Claim this profile",
  "household_claim.working": "Claiming...",
  "household_claim.signed_out.body":
    "This invitation was sent to {email}. Sign in with that address to claim it — the account has to match.",
  "household_claim.signed_out.cta": "Sign in and claim",
  // ── LA PORTE D'INSCRIPTION (chantier 4, D1) ──────────────────────────────
  //
  // Elle remplace `signed_out.no_account`, qui DISAIT le trou plutôt que de le
  // cacher: « signing up on your own is not open today ». Ce n'est plus vrai.
  //
  // ⚠️ AUCUNE de ces phrases ne promet un produit d'élève. Réclamer une place
  // donne à lire le foyer et à poser SON objectif; le reste — composer,
  // ajouter, retirer, restreindre — appartient au compte maître, et les deux
  // moitiés sont déjà côte à côte plus haut sur le même écran.
  "household_claim.signed_out.or": "No account on that address yet?",
  "household_claim.signup.cta": "Create my account",
  "household_claim.signup.title": "Create the account for {email}",
  "household_claim.signup.lead":
    "This address is the one the invitation was sent to, and the only one that can claim this place. Your account is yours — the household does not read your password, and you can leave at any time.",
  "household_claim.signup.email_label": "Email address",
  "household_claim.signup.email_hint":
    "Fixed by the invitation. Claiming with another address is refused.",
  "household_claim.signup.name_label": "Your name",
  "household_claim.signup.language_label":
    "The language you want to be spoken to in",
  "household_claim.signup.language_hint":
    "Your coach answers in this language, and writes your plan in it. You can change it later.",
  "household_claim.signup.name_hint":
    "On your account. The first name on the household line stays as it was set up.",
  "household_claim.signup.password_label": "Password",
  "household_claim.signup.password_hint": "At least 8 characters.",
  "household_claim.signup.legal_prefix": "I accept the",
  "household_claim.signup.legal_terms": "Terms",
  "household_claim.signup.legal_and": "and the",
  "household_claim.signup.legal_privacy": "Privacy Policy",
  "household_claim.signup.submit": "Create my account and claim",
  "household_claim.signup.submitting": "Creating your account...",
  "household_claim.signup.error.legal":
    "Please accept the Terms and the Privacy Policy to continue.",
  "household_claim.signup.error.existing":
    "There is already an account on this address. Sign in instead — your place is waiting.",
  "household_claim.signup.closed":
    "Creating an account is closed right now (pre-launch). If you already have one, sign in above.",
  "household_claim.signup.check_email.title": "Confirm your email address",
  "household_claim.signup.check_email.body":
    "Your account is created. Click the link we just sent to {email}, then open your invitation link again — claiming your place needs a confirmed address.",
  "household_claim.no_token.title": "This link is incomplete",
  "household_claim.no_token.body":
    "The address is missing its invitation code. Open the link you were sent in full, or ask for a new one.",
  "household_claim.refused.title": "This link cannot be used",
  "household_claim.refused.generic":
    "We could not use this invitation. Ask for a new one.",
  "household_claim.refused.unknown_token":
    "We do not recognise this invitation. Check that you copied the whole link, or ask for a new one.",
  "household_claim.refused.expired": "This invitation has expired. Ask for a new one.",
  "household_claim.refused.already_used":
    "This invitation has already been used. If that was you, sign in — your place is waiting.",
  "household_claim.refused.already_claimed":
    "That line already has an account on it. If it is yours, sign in.",
  "household_claim.refused.email_mismatch":
    "This invitation was sent to a different address. Sign in with the one it was sent to.",
  "household_claim.refused.already_in_household":
    "Your account is already in a household, and an account belongs to one household at a time.",
  // LES DEUX MOTIFS DE PAYS (chantier 4). `country_required` n'est PAS une
  // impasse à l'écran: la page montre alors le sélecteur. Le libellé existe
  // pour le cas où le refus revient quand même — une garde sans phrase est une
  // page muette.
  "household_claim.refused.country_required":
    "Your account does not say which country you live in, and a place in a household cannot be claimed without it — it decides which helpline you are given.",
  "household_claim.refused.bad_country":
    "That country code was not understood. Pick one from the list.",
  "household_claim.refused.not_authenticated":
    "Your session ended before we could finish. Sign in and open the link again.",
  "household_claim.refused.unreachable":
    "We could not reach the server. The invitation is fine — reload the page and try again.",
  "household_claim.refused.ask_again":
    "Whoever runs that household can send a new link in a few seconds.",
  "household_claim.done.title": "You are in {household}",
  "household_claim.done.body":
    "Your account is attached to the line that was already set up for you. Set your direction whenever you like — it changes your serving, not anyone else's.",
  "household_claim.done.cta": "Open the household",
  "household_claim.home_link": "Back to the home page",
} as const
