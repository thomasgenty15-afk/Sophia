// KEEL — QUAND LE NAVIGATEUR ET LE COMPTE NE DISENT PAS LA MÊME LANGUE.
//
// ── LES DEUX MÉMOIRES, ET POURQUOI ELLES DIVERGENT ─────────────────────────
// `localStorage` retient ce que le visiteur a cliqué sur CE navigateur.
// `profiles.locale` retient ce que le COMPTE a déclaré — et c'est celle-là que
// le backend lit à chaque tour pour décider dans quelle langue l'agent répond
// (`run.ts` -> `resolveResponseLocale`).
//
// Elles divergent dès qu'on ouvre une session ailleurs: un coach qui s'inscrit
// en français sur son portable, puis se connecte depuis l'ordinateur du bureau,
// y arrive avec un `localStorage` vide et un navigateur anglais. Sans
// réconciliation il lit une interface anglaise pendant que son agent lui répond
// en français — les deux moitiés du même produit, dans deux langues.
//
// ── POURQUOI LE COMPTE GAGNE ───────────────────────────────────────────────
// Parce qu'il est le seul des deux à avoir été DÉCLARÉ. `localStorage` peut
// venir d'un `navigator.languages` deviné, d'un `?lang=` dans un lien partagé,
// ou de rien du tout. `profiles.locale` ne s'écrit qu'à l'inscription ou par un
// geste explicite — et depuis que ce geste écrit LES DEUX (voir
// `api/uiLanguage.ts`), il n'existe aucun cas où le navigateur en sait plus.
//
// ── POURQUOI UNE FONCTION PURE ─────────────────────────────────────────────
// La partie qui casse n'est pas la lecture, c'est la BOUCLE: adopter veut dire
// recharger, et recharger relit. Le garde qui l'empêche est un argument d'ici,
// pas un effet de bord, donc un test peut le jouer.

import { parseUiLocale, type UiLocale } from "./catalog";

export type LocaleReconciliation =
  /** Rien à faire: les deux mémoires s'accordent, ou il n'y a rien à lire. */
  | { kind: "keep" }
  /** Le compte dit autre chose: adopter sa langue, puis recharger. */
  | { kind: "adopt"; locale: UiLocale };

export interface ReconcileInputs {
  /** `profiles.locale`, tel quel. `null` = le compte n'a rien déclaré. */
  profileLocale: string | null | undefined;
  /** Ce que le navigateur retient (`chosenUiLocale()`). */
  chosen: UiLocale;
  /**
   * Le compte POUR LEQUEL cet onglet a déjà tranché — `uiLocaleDecisionOwner()`.
   * `null` s'il n'a rien tranché, `ANONYMOUS_LOCALE_OWNER` si la décision a été
   * prise hors session.
   *
   * ⚠️ CE CHAMP ÉTAIT UN BOOLÉEN (`alreadyAdoptedThisSession`), ET C'ÉTAIT LE
   * DÉFAUT. Un garde par ONGLET sur une décision par COMPTE: un clic sur le
   * drapeau de la vitrine — donc sans session, donc sans rien en base — gelait
   * l'écran pour TOUS les comptes ouverts ensuite dans cet onglet. Mesuré le
   * 2026-08-14: écran français, compte anglais, agent anglais. Il ne masquait
   * pas un détail, il masquait le symptôme d'un second défaut (l'écrasement
   * SQL de `profiles.locale`), donc il coûtait la seule alarme qu'on avait.
   */
  decisionOwner: string | null;
  /**
   * Le compte dont on vient de lire `profileLocale`. C'est lui qui rend le
   * garde comparable à quelque chose: sans identité, « déjà tranché » ne peut
   * pas distinguer « pour toi » de « pour quelqu'un d'autre ».
   */
  accountId: string;
}

export function reconcileUiLocaleWithProfile(
  input: ReconcileInputs,
): LocaleReconciliation {
  // Le garde ne mord que sur le compte qui a tranché. Un autre compte dans le
  // même onglet — et tout compte après une décision anonyme — décide à nouveau.
  if (input.decisionOwner !== null && input.decisionOwner === input.accountId) {
    return { kind: "keep" };
  }

  const declared = String(input.profileLocale ?? "").trim();
  // Un compte sans langue déclarée ne décide rien. Le cas existe: les comptes
  // nés avant le sélecteur, et toute ligne écrite par une fixture.
  if (declared === "") return { kind: "keep" };

  const wanted = parseUiLocale(declared);
  if (wanted === input.chosen) return { kind: "keep" };

  return { kind: "adopt", locale: wanted };
}
