// KEEL — LE PREMIER MOT QU'ON ADRESSE À QUELQU'UN, DANS SA LANGUE.
//
// ── LE DÉFAUT QUE CE MODULE FERME (2026-09-09, FF-063 lot 3) ──────────────
// Ce mail vendait le produit PRÉCÉDENT. Il disait « Ta conversation est
// ouverte », promettait « nos échanges au quotidien, tes photos de repas, tes
// bilans », et son bouton pointait sur `/app/chat`. C'était la promesse du
// coach de vie, pas celle de Sophia — et depuis FF-060 l'entrée du produit est
// `/app/setup`, qui se termine PAR UNE GÉNÉRATION de plan. Le seul e-mail qui
// partait envoyait donc au mauvais écran, au nom d'un produit abandonné.
//
// ── LE LIEN VA SUR `/app/plan`, ET C'EST UN CHOIX MÉCANIQUE ──────────────
// L'appelant construit `planUrl` sur `/app/plan` plutôt que `/app/setup`,
// parce que cette route EMPILE LES DEUX GARDES QUI DÉCIDENT À NOTRE PLACE:
//   · `KeelHouseholdRoute` est l'union (foyer ⇒ passe; sinon il délègue à
//     `KeelStudentRoute`, qui renvoie sur `/auth?redirect=…` sans session);
//   · `KeelOnboardingGate` renvoie sur `/app/setup` tant que `student_goals`
//     est vide, et laisse passer sinon.
// UNE seule adresse, correcte dans les trois cas. Sans ça il aurait fallu
// retarder l'envoi — ou brancher le texte sur un état qui, au moment du
// trigger, est TOUJOURS vide, puisque le compte vient d'être confirmé.
//
// ── POURQUOI DEUX PACKS ENTIERS, ET PAS DES FRAGMENTS INTERPOLÉS ─────────
// « Bienvenue {prenom} ! » et « Welcome {name}! » diffèrent par l'espace
// insécable avant le point d'exclamation, par la place de la virgule, et par
// le fait qu'en français on tutoie. Composer une phrase par concaténation de
// fragments produit du texte qui se lit comme une machine dans au moins une
// des deux langues.
//
// ── CE MAIL EST TRANSACTIONNEL, ET IL PORTE QUAND MÊME LA SORTIE ─────────
// Il ignore le plafond et l'interrupteur de `_shared/keel/lifecycle_email.ts`:
// quelqu'un qui vient de créer un compte a demandé ce message. Mais il porte le
// lien de désinscription comme les autres — refuser la sortie sur le PREMIER
// contact serait le pire endroit du parcours pour la refuser.

import { isFrenchLocale } from "../_shared/keel/locale.ts";
import {
  lifecycleEmailCta,
  lifecycleEmailShell,
} from "../_shared/keel/lifecycle_email.ts";

export interface WelcomeEmailArgs {
  /**
   * Le prénom, déjà extrait — ou `null` quand le compte n'a pas de nom.
   *
   * ⚠️ `null` ET PAS UN REPLI DE L'APPELANT. Le handler écrivait `"là"` dans ce
   * cas, ce qui donnait « Hello là, » — passable en français, absurde en
   * anglais. Un repli textuel choisi en amont impose sa langue à tous les packs;
   * l'absence, elle, se rend dans chacun.
   */
  firstName: string | null;
  /** L'URL absolue du plan (voir l'en-tête: `/app/plan`, jamais `/app/setup`). */
  planUrl: string;
  /** L'URL absolue de désinscription, jeton et `?lang=` compris. */
  unsubscribeUrl: string;
  /**
   * La langue du COMPTE (`profiles.locale`). REQUISE.
   *
   * Optionnelle, elle aurait un défaut — et un défaut de langue est exactement
   * l'épingle que ce chantier retire partout ailleurs.
   */
  locale: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

/**
 * Le pack FRANÇAIS.
 *
 * ⚠️ CE QU'IL NE DIT PAS, ET POURQUOI (docs/keel/LEGAL.md §6.1 et §6.2):
 * aucun chiffre de perte de poids, aucune durée associée à un poids, aucune
 * garantie, aucune comparaison à un diététicien. La copie décrit le MÉCANISME
 * — ce que le produit compose — jamais le RÉSULTAT. C'est aussi ce qui la rend
 * vraie: Sophia organise des repas, elle ne produit pas un corps.
 * `_shared/keel/lifecycle_copy_guard.ts` le vérifie à chaque run de test.
 */
function french(args: WelcomeEmailArgs): RenderedEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: name
      ? `Bienvenue ${name} — ton premier plan t'attend`
      : "Bienvenue — ton premier plan t'attend",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>Sophia compose tes repas autour de ton objectif, avec les",
        "        quantités déjà calculées. Tu dis pour combien de jours et pour",
        "        combien de personnes ; elle organise les menus, les courses et",
        "        les sessions de cuisine.</p>",
        "",
        "        <p>Il reste quelques questions — ta date de naissance, ta taille,",
        "        ta direction — et tu as ton premier plan.</p>",
        "",
        lifecycleEmailCta(args.planUrl, "Voir mon plan"),
        "",
        "        <p>À tout de suite,</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

/**
 * Le pack ANGLAIS — redérivé du français plutôt que traduit littéralement:
 * l'anglais du produit vouvoie moins mais promet autant, et « Je suis super
 * contente que tu sois là » rendu mot à mot donnerait une phrase que personne
 * n'écrit.
 */
function english(args: WelcomeEmailArgs): RenderedEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: name
      ? `Welcome ${name} — your first plan is waiting`
      : "Welcome — your first plan is waiting",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>Sophia builds your meals around your goal, with the amounts",
        "        already worked out. You say how many days and how many people;",
        "        she organises the menus, the shopping and the cooking",
        "        sessions.</p>",
        "",
        "        <p>A few questions left — your date of birth, your height, your",
        "        direction — and your first plan is there.</p>",
        "",
        lifecycleEmailCta(args.planUrl, "See my plan"),
        "",
        "        <p>Talk soon,</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

/**
 * `isFrenchLocale` est LE prédicat unique du gel (voir `locale.ts`). Une langue
 * non livrée est déjà ramenée à l'anglais par `clampToDeliveredLocale` en amont
 * de la chaîne, donc « pas français » veut bien dire « anglais » ici.
 */
export function renderWelcomeEmail(args: WelcomeEmailArgs): RenderedEmail {
  return isFrenchLocale(args.locale) ? french(args) : english(args);
}
