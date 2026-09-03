import { supabase } from "../../lib/supabase";
import {
  mergePracticalConstraints,
  type PracticalConstraints,
} from "./practicalConstraints";

/**
 * LES MOYENS DE CUISSON DU FOYER — LE CÔTÉ ÉCRAN DE LA COLLECTE.
 *
 * Conception: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.1
 *
 * ── C'EST UNE PROPRIÉTÉ DU FOYER, PAS D'UNE PERSONNE ──────────────────────
 * Une cuisine est partagée: la question se pose UNE fois. Elle vit donc dans
 * `student_goals.practical_constraints`, à côté de `cooking_time_min`,
 * `cook_days` et `budget_amount` — la maison des faits de la maison —, et pas
 * sur `household_members`.
 *
 * ⚠️ LA SEULE EXCEPTION CONNUE EST AILLEURS, ET ELLE N'EST PAS DANS CE LOT: le
 * micro-ondes DU BUREAU (§2.2 ⓐ) appartient à la PERSONNE, pas au foyer, et
 * c'est le seul endroit du produit où un équipement est individuel. Ne pas le
 * ranger ici: « il y a un micro-ondes à la maison » et « il y en a un au
 * bureau » sont deux faits, et les confondre ferait servir froid un repas
 * réchauffable (ou l'inverse).
 *
 * ⛔ CE N'EST PAS UN RÉGLAGE DE COMPOSITION. Le budget et le mode de cuisson
 * ont été SORTIS du profil le 2026-08-13/15 avec un motif écrit: « un réglage
 * de profil s'écrit une fois et s'applique en silence à toutes les semaines
 * suivantes, y compris celle où on reçoit du monde ». Un four, lui, ne change
 * pas d'une semaine à l'autre — c'est un fait de la CUISINE, pas une demande
 * de plan. Il a donc le droit d'être durable, et c'est ce qui le range à
 * l'étape `table` (« ce qui reste vrai quand la semaine change ») et jamais à
 * l'étape `request`.
 *
 * ⛔ AUCUN IMPORT D'i18n, ET AUCUNE CLÉ DE LIBELLÉ ICI. Règle mesurée sur
 * `api/cookingShape.ts` le 2026-08-15, en rouge avant de l'être en production:
 * le détecteur de coutures (`i18n/pageSeams.int.test.ts`) attribue chaque
 * littéral de clé à toutes les pages qui atteignent le module. Les JETONS
 * voyagent, les MOTS restent avec le champ qui les affiche
 * (`components/KitchenEquipmentCard.tsx`).
 *
 * ⛔ ET AUCUNE RÈGLE DE PLAN. Ce module ne sait pas ce qu'un four autorise; il
 * porte sept jetons, un lecteur et un écrivain. L'exploitation appartient au
 * lot L7 — voir `supabase/functions/_shared/keel/kitchen_equipment.ts`.
 */

/**
 * LES SEPT JETONS, DANS L'ORDRE DE L'ÉCRAN.
 *
 * ⚠️ MIROIR DE `KITCHEN_TOOLS`
 * (`supabase/functions/_shared/keel/kitchen_equipment.ts`), et l'ordre EST le
 * sens: c'est celui dans lequel la réponse est écrite, donc celui qui rend
 * deux déclarations identiques comparables d'une génération à l'autre.
 *
 * La liste est RECOPIÉE et pas importée — le bundle du navigateur n'embarque
 * pas de module Deno —, et `kitchenEquipment.int.test.ts` épingle l'égalité
 * des deux listes, dans le même ordre. C'est le patron de `cookingShape.ts`:
 * une seconde définition d'une même règle est une divergence en attente, et
 * c'est celle qu'on regarde le moins qui garde l'ancien comportement.
 */
export const KITCHEN_TOOLS = [
  "oven",
  "stovetop",
  "microwave",
  "freezer",
  "air_fryer",
  "pressure_cooker",
  "blender",
] as const;
export type KitchenTool = (typeof KITCHEN_TOOLS)[number];

/** La clé de `practical_constraints`. Nommée une fois, des deux côtés. */
export const KITCHEN_EQUIPMENT_KEY = "kitchen_equipment";

const TOOL_SET = new Set<string>(KITCHEN_TOOLS);

/**
 * CE QUI EST DÉJÀ DÉCLARÉ — `null` quand la question n'a jamais été posée.
 *
 * ⚠️ MÊME DIRECTION D'ERREUR QUE LE SERVEUR, ET C'EST VOULU. « on ne m'a rien
 * demandé » et « je n'ai rien » ne sont pas la même réponse: confondre les
 * deux ferait cocher zéro case sur un écran de reprise, et le premier
 * enregistrement écrirait « ce foyer n'a pas de four » à la place de
 * quelqu'un. Ce n'est pas une garde en double — le serveur relit et tranche;
 * celui-ci décide de ce que l'écran AFFICHE.
 */
export function readKitchenEquipment(
  pc: PracticalConstraints | null | undefined,
): readonly KitchenTool[] | null {
  const raw = (pc ?? {})[KITCHEN_EQUIPMENT_KEY];
  if (!Array.isArray(raw)) return null;
  const declared = new Set<string>(
    (raw as unknown[])
      .map((tool) => String(tool ?? "").trim().toLowerCase())
      .filter((tool) => TOOL_SET.has(tool)),
  );
  if (declared.size === 0) return null;
  return KITCHEN_TOOLS.filter((tool) => declared.has(tool));
}

/**
 * CE QUI EST COCHÉ AU PREMIER RENDU — ET C'EST `[]`, POUR TOUT LE MONDE.
 *
 * ⚠️ RIEN N'EST PRÉ-COCHÉ, ET C'EST LA DOCTRINE DE L'ÉTAPE OÙ CETTE CARTE
 * ATTERRIT, écrite dans `SetupPage#TableStep`: « ni le régime (`null` ≠ mange
 * de tout), ni les moments d'une bouche, ni la taille ». La maquette du §2.1
 * dessine deux cases cochées (four, plaques) — c'est un exemple de formulaire
 * REMPLI, pas un défaut: pré-cocher écrirait, au premier Enregistrer d'un
 * foyer qui n'a pas lu la ligne, un four que personne n'a déclaré. « Coche
 * automatique = faits faux indémentables » est une cicatrice de ce dépôt.
 *
 * Et l'inverse est gardé par la lecture à trois valeurs: tant que rien n'est
 * enregistré, le moteur se comporte exactement comme avant ce lot. Ne rien
 * pré-cocher ne retire donc rien à personne.
 */
/**
 * CE FOYER A-T-IL DÉCLARÉ UN CONGÉLATEUR ? — 2026-09-01.
 *
 * ⚠️ MIROIR DE `hasFreezerDeclared` (`_shared/keel/kitchen_equipment.ts`), et
 * l'autorité est LÀ-BAS: c'est elle qui décide si un lot peut être servi
 * au-delà de trois jours. Celle-ci ne sert qu'à ce que l'ENTONNOIR puisse dire
 * la même chose que le moteur AVANT de composer.
 *
 * ⛔ `=== true`, ET LA COMPARAISON EST LA GARDE. Une liste `null` veut dire
 * « on n'a pas encore lu », pas « il n'en a pas ». Écrire `!list?.includes(...)`
 * confondrait les deux et ferait annoncer des journées hors de portée à un
 * foyer équipé — c'est-à-dire promettre à l'écran l'inverse de ce que le
 * moteur fera.
 */
export function hasFreezerDeclared(
  equipment: readonly KitchenTool[] | null,
): boolean {
  return equipment !== null && equipment.includes("freezer");
}

export function initialKitchenSelection(
  pc: PracticalConstraints | null | undefined,
): readonly KitchenTool[] {
  return readKitchenEquipment(pc) ?? [];
}

/** Coche / décoche, en gardant l'ordre de la liste. */
export function toggleKitchenTool(
  selection: readonly KitchenTool[],
  tool: KitchenTool,
): readonly KitchenTool[] {
  const next = new Set(selection);
  if (next.has(tool)) next.delete(tool);
  else next.add(tool);
  return KITCHEN_TOOLS.filter((t) => next.has(t));
}

/**
 * LE REFUS, RENDU AVANT TOUTE ÉCRITURE.
 *
 * ── POURQUOI UNE SÉLECTION VIDE EST REFUSÉE ───────────────────────────────
 * `[]` voudrait dire « ni four, ni plaques, ni micro-ondes, ni rien »: ce
 * foyer ne cuisine pas, et ce produit n'a alors rien à lui composer. Ce n'est
 * pas une contrainte, c'est une impasse — et écrite en base, elle ferait pire
 * que l'absence de réponse, puisque le lecteur la traiterait comme un fait.
 *
 * ⚠️ REFUSER N'EST PAS EXIGER. Ne pas répondre du tout reste permis et gratuit
 * (la question est un `better`, pas un `wrong`): sans clé, le moteur fait
 * comme avant. Ce qui est refusé est la réponse « aucun », pas le silence.
 *
 * ⚠️ ET LE REFUS EST RENDU PRÈS DU GESTE. Ce module rend un résultat au lieu
 * de lever: un bouton désactivé, ou une erreur affichée en haut d'un écran
 * long, se lit « le bouton ne marche pas » — cicatrice mesurée trois fois dans
 * `SetupPage`. La carte l'affiche sous son propre bouton.
 */
export type KitchenWritePlan =
  | { ok: true; tools: readonly KitchenTool[] }
  | { ok: false; reason: "empty" };

export function planKitchenEquipmentWrite(
  selection: readonly string[],
): KitchenWritePlan {
  const declared = new Set<string>(
    selection
      .map((tool) => String(tool ?? "").trim().toLowerCase())
      .filter((tool) => TOOL_SET.has(tool)),
  );
  if (declared.size === 0) return { ok: false, reason: "empty" };
  // L'ORDRE DE LA LISTE, PAS CELUI DES CLICS — même règle que `cook_days` et
  // `eating_rhythm` dans `savePlanAnswers`.
  return { ok: true, tools: KITCHEN_TOOLS.filter((tool) => declared.has(tool)) };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ LA PHOTO PRISE AU MONTAGE EFFACE L'ÉCRITURE D'À CÔTÉ — CICATRICE PAYÉE
 * DEUX FOIS, DANS CETTE COLONNE, SUR CETTE ÉTAPE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `mergePracticalConstraints` réécrit l'objet EN ENTIER (`{...current,
 * ...patch}`). Partir d'un `current` lu au montage de la page efface donc, en
 * silence, tout ce qu'une autre surface a écrit depuis dans la même colonne.
 *
 * Mesuré le 2026-08-15 sur un compte réel, et deux fois plutôt qu'une
 * (`SetupPage:1119` et `SetupPage:1456`): « Je mange de tout » — la seule
 * réponse de régime dont l'accusé JSON est la SEULE trace — ne survivait
 * jamais. `readDietAnswer` la relisait `null`, l'étape retenait sur `own_diet`,
 * et elle retenait À CHAQUE FOIS. Un bouton « Continuer » qui ne pouvait pas
 * continuer.
 *
 * Cette carte tombe exactement dans le même piège: elle vit sur l'étape
 * `table`, dont le « Continuer » écrit `diet_asked`, `eating_rhythm`,
 * `cook_days` — la MÊME colonne, à la seconde d'à côté.
 *
 * D'où deux décisions:
 *
 *   ① `saveKitchenEquipment` N'ACCEPTE PAS de `current`. Un paramètre qu'on
 *      s'engage à ignorer est un paramètre qu'on finit par honorer: le refuser
 *      dans la signature est la seule forme qui ne se défait pas.
 *   ② Il RELIT la colonne juste avant de fusionner. Un aller-retour de plus
 *      contre une écriture perdue en silence: l'échange est évident.
 *
 * ⚠️ CE N'EST PAS RÉPARÉ POUR LES AUTRES APPELANTS, ET C'EST DÉLIBÉRÉ. La
 * vraie place de cette règle est `mergePracticalConstraints` lui-même — c'est
 * exactement le genre de règle « qu'on ne peut pas redemander à trois
 * appelants de se rappeler », et son propre en-tête le dit. La déplacer là
 * change le comportement des cinq surfaces qui l'appellent, dont deux
 * appartiennent à d'autres lots en cours d'écriture. SIGNALÉ, PAS FAIT.
 *
 * La prop `practicalConstraints` de la carte reste ce qu'elle doit être: de
 * quoi PRÉ-COCHER l'écran, jamais de quoi écrire.
 */

/**
 * Ce que la colonne porte, décidé à partir de ce que PostgREST a rendu.
 *
 * Pur, donc testable sans base — et c'est tout l'intérêt de le sortir du
 * chemin réseau: la seule branche qui compte ici est celle de l'ERREUR.
 *
 * ⛔ UNE LECTURE RATÉE LÈVE, ELLE NE REND PAS `{}`. Rendre l'objet vide
 * ferait fusionner sur du néant, c'est-à-dire ÉCRASER toute la colonne — le
 * rythme, le budget, le régime, les préférences — avec la seule clé de cette
 * carte. Avaler l'erreur transformerait un incident réseau en perte de données.
 *
 * Ligne absente ou colonne nulle rendent `{}`, et c'est juste: il n'y a rien à
 * conserver. Le cas « aucune ligne » est de toute façon rattrapé par
 * `mergePracticalConstraints`, dont l'update rend zéro ligne et le dit.
 */
export function constraintsFromRow(args: {
  error: { message: string } | null;
  row: { practical_constraints?: unknown } | null;
}): PracticalConstraints {
  if (args.error) {
    throw new Error(
      `[keel/api] kitchenEquipment: could not read your constraints — ` +
        `nothing was saved (${args.error.message})`,
    );
  }
  const pc = args.row?.practical_constraints;
  return pc && typeof pc === "object" && !Array.isArray(pc)
    ? pc as PracticalConstraints
    : {};
}

/** La colonne, relue à l'instant. Voir le pavé ci-dessus. */
async function readFreshConstraints(userId: string): Promise<PracticalConstraints> {
  const { data, error } = await supabase
    .from("student_goals")
    .select("practical_constraints")
    // `.eq` EXPLICITE malgré RLS: quelqu'un qui est à la fois coach et mangeur
    // lit aussi les lignes de ses élèves, et une lecture non scopée lui
    // rendrait la ligne de l'un d'eux. Le dépôt a déjà payé ce défaut sur
    // cette table.
    .eq("user_id", userId)
    .maybeSingle();
  return constraintsFromRow({
    error: error ? { message: error.message } : null,
    row: data as { practical_constraints?: unknown } | null,
  });
}

/**
 * L'ÉCRITURE, FUSIONNÉE DANS LA COLONNE.
 *
 * `mergePracticalConstraints` porte les deux règles qu'on ne peut pas
 * redemander à chaque appelant de se rappeler: l'étalement (deux cartes
 * ouvertes côte à côte ne se désécrivent pas), et le refus d'un update qui n'a
 * touché AUCUNE ligne — PostgREST répond 204 sans corps ni erreur, et l'écran
 * affichait « Enregistré » sur une saisie partie nulle part.
 *
 * @returns `{ ok: false, reason: "empty" }` sans toucher au réseau quand la
 *          sélection est vide. Les échecs de lecture et d'écriture, eux,
 *          LÈVENT: ils ne sont pas une réponse de l'utilisateur.
 */
export async function saveKitchenEquipment(args: {
  userId: string;
  selection: readonly string[];
}): Promise<KitchenWritePlan> {
  const plan = planKitchenEquipmentWrite(args.selection);
  if (!plan.ok) return plan;
  const current = await readFreshConstraints(args.userId);
  await mergePracticalConstraints({
    userId: args.userId,
    current,
    patch: { [KITCHEN_EQUIPMENT_KEY]: [...plan.tools] },
    source: "KitchenEquipmentCard",
  });
  return plan;
}
