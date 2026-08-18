/**
 * FF-057 — LA CHARGE D'UN TAP D'ACCIDENT, CÔTÉ ÉCRAN.
 *
 * ── POURQUOI CE FICHIER EXISTE ────────────────────────────────────────────
 * L'arbre de décision de la procédure accident est ENTIER et testé, dans
 * `supabase/functions/_shared/keel/accident.ts`: le glissement, la cascade
 * d'une session sautée, les quatre refus (`perishables_at_risk`,
 * `already_cooked`, `outside_plan_window`, `no_session`), l'espace de
 * réalignement (`shift_dish`, `no_cook`, `shift_session`, `nothing_to_change`).
 *
 * Il n'était atteignable QUE par la conversation. Mesuré le 2026-08-18:
 *
 *     grep -r "KEEL_FIX" frontend/src/ → 0
 *
 * Le mécanisme le moins copiable du produit était invisible pour qui ne tape
 * pas dans le chat. Ce module ouvre la porte, et RIEN D'AUTRE.
 *
 * ── CE QU'IL S'INTERDIT, ET C'EST LA MOITIÉ DU LOT ────────────────────────
 * ⛔ IL NE REJOUE PAS L'ARBRE. Aucune décision, aucun refus, aucun calcul de
 * date, aucune cascade ici. L'écran FORME UN TAP et l'envoie par le canal qui
 * existe; le serveur décide, et sa réponse revient dans la conversation avec
 * ses propres boutons de suite. Une seconde implémentation de l'arbre
 * divergerait de la première au premier correctif — et c'est l'écran, le moins
 * relu des deux, qui garderait l'ancienne règle.
 *
 * ⚠️ LE LITTÉRAL EST DUPLIQUÉ, ET LA DUPLICATION EST GARDÉE. Deno et le
 * navigateur ne partagent pas de module; recopier « KEEL_FIX_SESSION_NO » est
 * inévitable, le laisser dériver ne l'est pas. `accidentPayload.int.test.ts`
 * relit `accident.ts` et fait échouer la suite si le jeton, le séparateur ou
 * l'ordre des champs bougent d'un côté sans l'autre.
 */

/** Le jeton du tap « la session de cuisine n'a pas eu lieu ». */
export const ACCIDENT_SESSION_NO = "KEEL_FIX_SESSION_NO";

/** Le séparateur des charges d'accident. `SEP` dans `accident.ts`. */
export const ACCIDENT_SEP = "|";

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * « Je n'ai pas fait cette cuisson » — la charge à envoyer.
 *
 * ⚠️ REND `null` PLUTÔT QUE DE JETER, contrairement au constructeur serveur.
 * L'écran s'en sert pour décider s'il AFFICHE le bouton: sans identifiant de
 * plan (`mealId` est `string | null`) ou sans date valide, il n'y a pas de tap
 * possible, et « un bouton qui ouvre un vide est pire que pas de bouton »
 * (`DishCard`, mot pour mot). Jeter ici ferait tomber l'écran du jour entier
 * pour un plan sans identifiant.
 *
 * ⚠️ LA CLÉ EST UNE DATE CALENDAIRE, PAS UN JETON DE JOUR. C'est la règle que
 * `accident.ts` porte en tête: un jeton (`sun`) cesse de désigner la même chose
 * dès que le glissement déplace la session, alors que « la cuisson du 18 août
 * n'a pas eu lieu » reste vrai après le glissement.
 */
export function sessionMissedPayload(
  mealId: string | null,
  cookOn: string,
): string | null {
  const id = String(mealId ?? "").trim();
  if (!id) return null;
  if (!CALENDAR_DATE.test(String(cookOn ?? ""))) return null;
  return [ACCIDENT_SESSION_NO, id, cookOn].join(ACCIDENT_SEP);
}
