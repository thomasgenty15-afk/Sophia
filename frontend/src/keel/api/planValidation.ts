/**
 * ══════════════════════════════════════════════════════════════════════════
 * ÉTAPE C5 — LE STATUT DE VALIDATION D'UN PLAN, LU ET MIS EN MOTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Autorité : `docs/keel/PLAN-CLOTURE-APRES-SIX-TIRS-2026-09-11.md`, § C5 ③ ④ ⑤.
 * Producteur : `supabase/functions/_shared/keel/plan_validation.ts`, écrit sur
 * la ligne (`generated_from.validation`) ET rendu dans la réponse.
 *
 * ── ⛔ LA DETTE QUE CE FICHIER SOLDE, AVEC SON CHIFFRE ─────────────────────
 * Le serveur nomme ses écarts depuis le lot E. **Aucune surface ne les lisait.**
 * Mesuré à l'étape C3 : `shopping_lines_unattributed:1/26` est écrit dans
 * `issues[]` d'un plan réel, et pas un écran du produit ne l'affiche. Un écart
 * qu'on ne montre pas est un écart qu'on n'a pas.
 *
 * ── ⛔ TROIS LISTES, ET ELLES NE SE FONDENT JAMAIS ────────────────────────
 * `defects` accuse le plan ; `incomplete` dit qu'un contrôle n'a pas pu
 * conclure ; `not_applicable` dit qu'il ne s'applique pas ici. Les additionner
 * ferait un nombre qui ne veut rien dire — c'est la faute de mesure n° 4 du
 * lot 0 (« "non applicable" n'est pas "non contrôlé" »).
 *
 * ── ⛔ AUCUN CHIFFRE DU SERVEUR N'EST RENDU, ET C'EST UNE PORTE ────────────
 * Le plan (§ C5 ④) : « respecter les portes d'affichage calorique : pas de
 * chiffres masqués par une protection réintroduits dans un message d'erreur. »
 * Le serveur ne persiste déjà AUCUN `detail` ; ce module ne fabrique donc aucun
 * nombre à partir de rien, et il va plus loin : quand la porte calorique de la
 * personne est FERMÉE, les écarts de la famille énergie/protéine sont RETIRÉS
 * de la liste. Un plancher TCA masque ces sujets à l'écran ; les réintroduire
 * sous forme de statut serait la fuite par un autre chemin.
 *
 * ⚠️ PURE : ce module ne fait ni requête ni rendu. Les fonctions d'ici sont
 * appelées par `PlanValidationNotice.tsx` et testées sans React.
 *
 * ── ⛔ AUCUNE `MessageKey` ICI, ET C'EST UNE CONTRAINTE MESURÉE ────────────
 * Ce fichier est importé par `api/mealGeneration.ts`, donc par `/`,
 * `/join-household`, `/app/chat` et `/app/today`. Le scanner de coutures
 * (`i18n/pageSeams.int.test.ts`) suit le graphe d'imports : y écrire une clé
 * `plan.validation.*` faisait « atteindre » le namespace `plan` à quatre pages
 * qui ne l'ont pas déclaré — quatre rouges au premier lancement. Les tables de
 * clés vivent donc dans le COMPOSANT, qui n'est importé que par les deux écrans
 * qui l'affichent.
 */

/**
 * LES TROIS ÉTATS, DANS LE VOCABULAIRE EXACT DU SERVEUR.
 *
 * ⚠️ VOCABULAIRE FERMÉ, ET UNE VALEUR HORS LISTE REND `null` (R7). Un plan
 * écrit par une version future qui inventerait un quatrième état ne doit pas
 * se lire « conforme » par défaut : l'écran se tait, ce qui est vrai.
 */
export const PLAN_VALIDATION_STATES = [
  "conforme",
  "livrable_avec_ecarts",
  "non_livrable",
] as const;
export type PlanValidationState = (typeof PLAN_VALIDATION_STATES)[number];

export interface PlanValidationDefect {
  cause: string;
  blocking: boolean;
  /** Jeton de jour (`sun`) pour une case, date ISO pour une journée. */
  day: string | null;
  slot: string | null;
  memberId: string | null;
  term: string | null;
  /** Le `detail` de cette cause portait un chiffre protégé : il n'existe pas. */
  numberProtected: boolean;
}

export interface PlanValidationControl {
  control: string;
  count: number;
}

export interface PlanValidationView {
  version: number;
  state: PlanValidationState;
  defects: PlanValidationDefect[];
  incomplete: PlanValidationControl[];
  notApplicable: PlanValidationControl[];
  notRun: string[];
}

/**
 * LE STATUT, LU D'UN OBJET BRUT (`generated_from.validation` ou la réponse).
 *
 * `null` = ce plan n'en porte pas. Deux cas, et ils se lisent pareil à l'écran
 * (on se tait) : une ligne écrite avant ce lot, et une génération où la garde
 * finale est tombée (`final_gate_unavailable`). ⛔ Surtout pas « conforme » par
 * défaut : « la garde n'a pas tourné » n'est pas « le plan est propre ».
 *
 * ⚠️ LA VERSION EST LUE, PAS IGNORÉE. Une forme future inconnue rend `null` —
 * s'abstenir est la seule direction d'erreur sûre pour un statut.
 */
export function readPlanValidation(raw: unknown): PlanValidationView | null {
  if (raw === null || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const version = Number(v.version);
  if (!Number.isFinite(version) || version !== 1) return null;
  const state = String(v.state ?? "");
  if (!(PLAN_VALIDATION_STATES as readonly string[]).includes(state)) return null;
  const controls = (value: unknown): PlanValidationControl[] =>
    (Array.isArray(value) ? value : [])
      .map((entry) => {
        const c = (entry ?? {}) as Record<string, unknown>;
        return {
          control: String(c.control ?? ""),
          count: Number(c.count) || 0,
        };
      })
      .filter((c) => c.control !== "" && c.count > 0);
  return {
    version,
    state: state as PlanValidationState,
    defects: (Array.isArray(v.defects) ? v.defects : [])
      .map((entry) => {
        const d = (entry ?? {}) as Record<string, unknown>;
        return {
          cause: String(d.cause ?? ""),
          blocking: d.blocking === true,
          day: typeof d.day === "string" && d.day.trim() !== "" ? d.day : null,
          slot: typeof d.slot === "string" && d.slot.trim() !== "" ? d.slot : null,
          memberId: typeof d.member_id === "string" && d.member_id.trim() !== ""
            ? d.member_id
            : null,
          term: typeof d.term === "string" && d.term.trim() !== "" ? d.term : null,
          numberProtected: d.number_protected === true,
        };
      })
      .filter((d) => d.cause !== ""),
    incomplete: controls(v.incomplete),
    notApplicable: controls(v.not_applicable),
    notRun: (Array.isArray(v.not_run) ? v.not_run : [])
      .filter((c): c is string => typeof c === "string" && c.trim() !== ""),
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES CAUSES DE LA FAMILLE CALORIQUE — celles que la porte d'affichage garde
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ MÊME LISTE QUE `CALORIE_PROTECTED_CAUSES` CÔTÉ SERVEUR, et un test
 * l'épingle contre la source de la fonction edge. Deux listes divergeraient, et
 * la divergence serait muette — du côté qui fuit.
 */
export const CALORIE_PROTECTED_CAUSES: readonly string[] = [
  "cell_energy_off",
  // ⟳ 2026-09-12 · FERMETURE LOT 2 — la densité et les bornes de masse parlent
  // en kcal/100 g et en grammes: même famille, même porte.
  "cell_bounds_off",
  "day_energy_off",
  "protein_floor_short",
  "protein_ceiling_over",
  "cell_energy_unmeasurable",
  "mouth_energy_short",
];

/**
 * LES ÉCARTS À MONTRER, SELON QUE LA PORTE CALORIQUE EST OUVERTE OU FERMÉE.
 *
 * ⛔ FERMÉE ⇒ LES SIX CAUSES DE LA FAMILLE ÉNERGIE SORTENT DE LA LISTE. Ce
 * n'est pas de la prudence décorative : `useMealEnergy().showing` est faux
 * notamment quand un plancher TCA, l'âge ou le coach protègent la personne du
 * sujet. Lui afficher « ce plan n'atteint pas ta protéine » remettrait très
 * exactement le sujet que la protection retire, sans même un chiffre.
 *
 * ⚠️ LES AUTRES ÉCARTS RESTENT, PORTE OUVERTE OU FERMÉE : un ingrédient qui
 * n'est sur aucune liste de courses ne protège personne, et le cacher priverait
 * la personne d'un fait dont elle a besoin pour cuisiner.
 *
 * PURE.
 */
export function visibleDefects(
  defects: readonly PlanValidationDefect[],
  showEnergy: boolean,
): PlanValidationDefect[] {
  return defects.filter((d) =>
    showEnergy || !CALORIE_PROTECTED_CAUSES.includes(d.cause)
  );
}

/**
 * LES CONTRÔLES INCOMPLETS À MONTRER, SELON LA PORTE CALORIQUE.
 *
 * Même règle que `visibleDefects`, et pour la même raison : « on n'a pas pu
 * lire l'énergie de trois assiettes » parle d'énergie.
 */
const CALORIE_PROTECTED_CONTROLS: readonly string[] = [
  "cell_energy",
  "protein_floor",
  "mouth_energy",
  "protein_floor_protected",
];

export function visibleControls(
  controls: readonly PlanValidationControl[],
  showEnergy: boolean,
): PlanValidationControl[] {
  return controls.filter((c) =>
    showEnergy || !CALORIE_PROTECTED_CONTROLS.includes(c.control)
  );
}
