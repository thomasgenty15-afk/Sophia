// Pack français — le namespace `app`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `app.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frApp = {
  // ═══════════════════════════════════════════════════════════════════════════
  // LE COULOIR D'ENTRÉE (lot 2)
  //
  // ⚠️ REGISTRE: TUTOIEMENT, et c'est la suite de l'arbitrage du lot 1. La
  // vitrine vouvoie l'acheteur qu'elle ne connaît pas (`/`, `/pro`, `/auth`,
  // `/start`); le PRODUIT tutoie, comme `/meal-prep`, `/coaches`, la signature
  // du pied de page (« Ta méthode, qui répond en ton absence. ») et Sophia
  // elle-même dans le chat. Tout ce qui suit est derrière la porte.
  //
  // Le raccord `/start` (vous) → `/app/setup` (tu) est VISIBLE et connu. Il
  // appartient au lot qui uniformisera le registre du site, pas à celui-ci —
  // choisir le vouvoiement ici aurait juste déplacé la couture d'un cran, entre
  // le tunnel et le chat.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── LE CHROME DE L'APP CONNECTÉE, CE QUI EN EST TRADUIT (`app.*`) ─────────
  //
  // ⚠️ CE NAMESPACE EST ENTRÉ PAR LA GARDE DE ROUTE, PAS PAR SON CONTENU.
  // `/app/setup` est monté dans `<KeelHouseholdRoute>`, qui rend
  // `app.guard.checking` pendant qu'il résout l'accès — la toute première chose
  // qu'on voit du tunnel d'entrée. Le laisser en anglais faisait lever `t()` en
  // DEV au premier rendu, et aurait affiché « Checking your access… » à un
  // francophone avant même le titre.
  //
  // Les huit libellés d'onglets qui suivent ne sont rendus que par
  // `KeelAppShell`, donc pas encore vus par personne en français — `shell` et
  // `chat` restent en attente et `/app/household` reste anglaise. Ils sont
  // traduits quand même: le namespace est tout-ou-rien par construction, et la
  // moitié qui manque coûterait le même travail dans six mois.
  "app.nav.today": "Aujourd’hui",
  // ⟳ chantier-0903/SUIVI (A7, D7.1) — « Progression » → « Suivi », « Santé »
  // → « Sécurité ». Voir la note jumelle dans `en.ts` : les CHEMINS ne bougent
  // pas, seuls les libellés.
  "app.nav.progress": "Suivi",
  "app.nav.chat": "Sophia",
  "app.nav.household": "Foyer",
  // 75 px par colonne sur la barre d'onglets du téléphone: la forme courte
  // doit tenir sur une ligne, en français comme en anglais.
  //
  // ⟳ DEUX DE PLUS LE 2026-09-09 — voir la note jumelle dans `en.ts`: le « + »
  // a pris la cinquième colonne, et à 320 px « Aujourd'hui » comme
  // « Conversation » se coupaient à l'ellipse.
  //
  // ⟳ 2026-09-23 — L'ONGLET S'APPELLE « SOPHIA », EN LONG COMME EN COURT.
  // Il nommait ce qu'on y fait (« Conversation », « Dialogue »); il nomme
  // maintenant qui est au bout du fil. Demandé: « c'est plus friendly ».
  // « Sophia » tient dans les 48 px de texte d'une colonne à 320 px.
  "app.nav.today.short": "Journée",
  "app.nav.chat.short": "Sophia",
  "app.nav.plan.short": "Plan",
  "app.nav.plan": "Mon plan",
  "app.plan_untitled": "Ton plan",
  "app.guard.checking": "Vérification de ton accès…",
  // ── FF-064 · LE MUR DE PAIEMENT ─────────────────────────────────────────
  // ⛔ Ni date, ni montant, ni décompte — voir le pavé de `en.ts`.
  "app.paywall.title": "Ton foyer est en pause",
  "app.paywall.body":
    "Aucune nouvelle semaine n’est composée en ce moment. Rien de ce que tu as réglé n’a bougé.",
  "app.paywall.kept":
    "Rien n’a été effacé. Les personnes d’ici, leurs âges, leurs allergies et leurs directions sont exactement où tu les as laissés, et ils reviennent tels quels.",
  "app.paywall.resume_cta": "Le relancer",
  "app.paywall.working": "Ouverture…",
  "app.paywall.owner_only":
    "La personne qui a créé ce foyer peut le relancer depuis son propre compte.",
  "app.paywall.cta_billing": "Voir mon abonnement",
  "app.paywall.account": "Mon compte",
  "app.guard.not_student_title": "Cet espace est réservé aux élèves",
  "app.guard.not_student_body":
    "Ton compte ne suit le plan d’aucun coach. Demande une invitation au tien.",
  "app.nav.about_you": "Ce que Sophia sait",
} satisfies TranslatedMessagesOf<"app">;
