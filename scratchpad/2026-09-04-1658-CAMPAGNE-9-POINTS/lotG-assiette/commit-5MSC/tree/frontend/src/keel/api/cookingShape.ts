/**
 * LE MODE DE CUISSON, DEMANDÉ À CHAQUE COMPOSITION — LOT B.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE N'EST PAS UN RÉGLAGE DE PROFIL, ET C'EST UNE DÉCISION.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le précédent est le BUDGET, déplacé du profil vers la composition le
 * 2026-08-13, avec son motif écrit dans `CookingCapacityCard`:
 *
 *   « un réglage de profil s'écrit une fois et s'applique en silence à toutes
 *     les semaines suivantes, y compris celle où on reçoit du monde et celle
 *     d'après les vacances. »
 *
 * Une colonne `cooking_shape` aurait fait cuisiner trois plats le mardi
 * ordinaire d'un foyer qui avait répondu pour un dimanche. Ce module n'écrit
 * donc RIEN: le jeton voyage avec la demande, et le serveur l'archive dans
 * `generated_from.household.cooking` — sans lecteur, exprès.
 *
 * ── UN PLAFOND, JAMAIS UN ORDRE ───────────────────────────────────────────
 * `capCookingShape` (`_shared/keel/household_portions.ts`) est le SEUL endroit
 * qui compare le choix au calcul, et il vit côté serveur. Le choix peut REFUSER
 * un second plat; il ne peut pas en fabriquer un — c'est la divergence des
 * directions de service qui le lève, comme avant ce lot. Quand le plafond mord,
 * le plan le DIT (`plan_rationale.ts`): un choix silencieusement ignoré est
 * pire que pas de choix.
 *
 * ⛔ AUCUNE GARDE N'EST RECOPIÉE ICI. Ce module ne sait pas ce qu'est une
 * direction de service, un barreau ou une divergence — et il ne doit pas
 * l'apprendre. Il porte trois jetons et leurs clés de phrase, rien de plus.
 *
 * ⛔ AUCUN IMPORT D'i18n. Aucun module de `frontend/src/keel/api/` n'importe
 * `i18n/t`, et c'est ce qui les rend montables des deux côtés d'une couture de
 * namespace (`i18n/pageSeams.int.test.ts`). Les CLÉS sont ici, les phrases sont
 * à l'écran.
 */

/**
 * LES TROIS JETONS, DANS L'ORDRE DE L'ÉCHELLE.
 *
 * ⚠️ MIROIR DE `COOKING_SHAPES` (`_shared/keel/household_portions.ts`), et
 * l'ordre EST le sens: c'est celui que `cookingShapeRank` compare côté serveur.
 * Une liste réordonnée ici ne casserait rien — le serveur ne lit que le jeton —
 * mais l'écran présenterait « chacun le sien » avant « un seul plat », ce qui
 * inverse la lecture d'un choix dont le premier terme est le défaut.
 */
export const COOKING_SHAPES = [
  "one_dish",
  "one_session",
  "separate_sessions",
] as const;
export type CookingShape = (typeof COOKING_SHAPES)[number];

/**
 * ⛔ LES CLÉS DE LIBELLÉ NE SONT PAS ICI, ET C'EST UNE CONTRAINTE MESURÉE.
 *
 * Elles vivent dans `components/CookingShapeField.tsx`. Ce module-ci est
 * atteint par `api/household.ts`, donc par toute page qui touche au foyer —
 * `/join-household` compris. Le détecteur de coutures (`pageSeams.int.test.ts`)
 * relève chaque littéral qui est une clé du seed et l'attribue à la page qui
 * l'atteint: écrire `"plan.cooking.shape_one_dish"` ici faisait « atteindre »
 * le namespace `plan.*` à une page d'invitation qui ne le déclare pas. Mesuré
 * le 2026-08-15, en rouge, avant de l'être en production.
 *
 * Les JETONS voyagent (ils partent au serveur), les MOTS restent avec le champ
 * qui les affiche.
 */

/**
 * LE DÉFAUT DE L'ÉCRAN — `null`, ET C'EST UNE AFFIRMATION.
 *
 * `null` veut dire « je ne demande rien », et le calcul gouverne alors seul,
 * exactement comme avant ce lot. Pré-cocher `one_dish` clouerait au barreau ①
 * tous les foyers qui n'ouvrent jamais la question — c'est-à-dire changer le
 * comportement de gens à qui on n'a rien demandé, ce que ce lot ne fait pas.
 */
export const NO_COOKING_SHAPE_ASKED: CookingShape | null = null;

/**
 * LE JETON, LU D'UNE VALEUR D'ÉCRAN. `""` (l'option « laisse décider ») et
 * toute valeur inconnue rendent `null`.
 *
 * Miroir de `readCookingShape` côté serveur, et la direction d'erreur est la
 * MÊME: « je n'ai pas su lire » et « rien n'a été demandé » produisent le même
 * comportement. Ce n'est pas une garde en double — le serveur relit et tranche;
 * celui-ci évite d'envoyer une chaîne vide dans un champ typé.
 */
export function readCookingShape(raw: unknown): CookingShape | null {
  const token = typeof raw === "string" ? raw.trim() : "";
  return (COOKING_SHAPES as readonly string[]).includes(token)
    ? token as CookingShape
    : null;
}

/**
 * LA QUESTION A-T-ELLE UN SUJET ?
 *
 * « Un seul plat pour tout le monde » n'a pas de sens à une bouche: il n'y a
 * pas de « tout le monde ». La lane individuelle n'accepte d'ailleurs pas le
 * champ, et le poser quand même ferait une question dont la réponse ne va nulle
 * part — la définition d'un réglage qui apprend que les réglages ne servent à
 * rien.
 *
 * `mouths` COMPTE LE COMPOSEUR. Un foyer à deux bouches est la première taille
 * où la question existe.
 */
export function cookingShapeApplies(mouths: number): boolean {
  return Number.isFinite(mouths) && mouths >= 2;
}
