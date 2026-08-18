// LES MOYENS DE CUISSON DU FOYER — LA COLLECTE, ET RIEN QUE LA COLLECTE.
//
// Conception: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.1
//
// ── LE TROU QUE CE MODULE OUVRE ────────────────────────────────────────────
// Vérifié le 2026-08-18 sur tout le moteur: AUCUNE occurrence de four, de
// micro-ondes ou de congélateur. Le générateur compose des cuissons sans
// savoir si elles sont possibles — il propose 50 minutes de four à quelqu'un
// qui n'en a pas, et « je congèle le reste » à quelqu'un qui n'a qu'un
// compartiment à glaçons.
//
// Une cuisine est PARTAGÉE: la question se pose une fois pour le foyer, pas
// par bouche. C'est pour ça que la réponse vit dans
// `student_goals.practical_constraints` — la maison des faits de la maison —
// et pas sur `household_members`.
//
// ── ⛔ CE MODULE NE PARLE PAS AU MODÈLE, ET C'EST UNE FRONTIÈRE DE LOT ──────
// Il n'y a ici NI ligne de prompt, NI branche de génération. L'exploitation
// appartient au lot L7, qui regroupe tous les changements de consigne en un
// seul bump de version (la lane foyer expire déjà à 4 min: chaque bloc ajouté
// coûte). Ce fichier lui livre trois choses et s'arrête: les jetons, le
// lecteur, et la logique à TROIS valeurs ci-dessous.
//
// ⚠️ Écrire ici une `equipmentLines()` inerte serait exactement le défaut que
// `coach_food_rules` a produit: un écran, des gardes, trente tests, et aucun
// lecteur au runtime. Tant que L7 n'a pas branché, ce module est une COLLECTE
// assumée, nommée comme telle, avec sa date.
//
// ── MODULE PUR ─────────────────────────────────────────────────────────────
// Aucun accès base, aucun import de `meal_generation.ts` (cycle au chargement,
// payé deux fois par ce dépôt — voir `fixed_intakes.ts` et `day_properties.ts`).

/**
 * LA LISTE FERMÉE, DANS L'ORDRE DE L'ÉCRAN.
 *
 * ⚠️ L'ORDRE EST NORMATIF. Il est celui de la maquette du §2.1, il est celui
 * dans lequel la réponse est ÉCRITE (jamais l'ordre des clics), et c'est lui
 * qui rend deux générations identiques pour une même déclaration — un ordre
 * qui suit la saisie ferait bouger la consigne sans que rien n'ait changé,
 * casserait le cache de prompt, et rendrait tout test de désarmement
 * impossible à écrire. Même raison, mot pour mot, que `parseDayProperties`.
 *
 * ⚠️ LES JETONS SONT ASCII, snake_case, ANGLAIS (R1: seules les VALEURS se
 * traduisent). Les mots à l'écran vivent avec le champ qui les affiche —
 * `components/KitchenEquipmentCard.tsx` —, jamais ici.
 *
 * ── LES TROIS QUI CHANGENT VRAIMENT LE PLAN ───────────────────────────────
 * Les sept ne pèsent pas pareil, et le §2.1 nomme les trois qui décident:
 *
 *   · `freezer`    — sans lui, la stratégie « une seule course, je congèle »
 *                    (FF-005) est IMPOSSIBLE, et la conservation au-delà de
 *                    trois jours n'a aucune autre issue.
 *   · `microwave`  — le geste « à réchauffer » livré le 2026-08-17 suppose un
 *                    moyen de réchauffer. Sans lui, « réchauffer » veut dire
 *                    poêle ou four, et le TEMPS DU JOUR J change.
 *   · `oven`       — l'essentiel du batch cooking en dépend (10 min de mains
 *                    pour 50 min de cuisson est *la* raison d'être des grosses
 *                    cuissons).
 *
 * Les quatre autres affinent; aucune ne rend un plan impossible.
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

/** La clé de `student_goals.practical_constraints`. Nommée une fois. */
export const KITCHEN_EQUIPMENT_KEY = "kitchen_equipment";

const TOOL_SET = new Set<string>(KITCHEN_TOOLS);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA GARDE DE CE LOT, ET C'EST LA SEULE QUI COMPTE: `null` ≠ `[]`.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « On ne m'a rien demandé » et « je n'ai rien » ne sont PAS la même réponse,
 * et les confondre est la seule façon de casser quelque chose ici.
 *
 * Tous les comptes qui existent aujourd'hui n'ont jamais vu la question. Si
 * l'absence de clé se lisait « ce foyer n'a ni four ni congélateur », le
 * premier plan généré après ce lot retirerait le batch cooking et la
 * congélation à TOUT LE MONDE — un lot de collecte qui dégrade le produit
 * pour ceux à qui il n'a rien demandé. C'est la forme exacte de la cicatrice
 * « coche automatique = faits faux indémentables », prise par l'autre bout:
 * ici le fait faux serait une ABSENCE.
 *
 * D'où la lecture à trois valeurs, et elle traverse tout le module:
 *
 *   `null`        → jamais demandé      ⇒ le moteur se comporte EXACTEMENT
 *                                          comme avant ce lot
 *   `[...]`       → déclaré, non vide   ⇒ ce qui est dedans existe, ce qui
 *                                          n'y est pas est DÉCLARÉ ABSENT
 *   `[]`          → n'existe pas        ⇒ voir ci-dessous
 *
 * ⚠️ `[]` N'EST PAS UNE RÉPONSE, ET LE LECTEUR LE TRAITE COMME UNE ABSENCE.
 * Un foyer sans AUCUN des sept ne cuisine pas du tout: ce produit n'a rien à
 * lui dire, et « aucun moyen de cuisson » n'est pas une contrainte, c'est une
 * impasse. L'écrivain refuse donc une sélection vide (voir
 * `frontend/src/keel/api/kitchenEquipment.ts#planKitchenEquipmentWrite`), et
 * ce lecteur-ci refuse de la lire: un tableau présent dont aucun jeton n'est
 * reconnu rend `null`, c'est-à-dire la direction SÛRE — celle qui ne
 * contraint rien.
 *
 * Un jeton inconnu tombe SEUL et laisse ses voisins (patron `parseAwayDays`,
 * `parseDayProperties`): une faute de frappe ne doit pas effacer une
 * déclaration lisible écrite à côté d'elle.
 *
 * @param pc le jsonb `practical_constraints`, tel qu'il sort de la base.
 */
export function readKitchenEquipment(
  pc: Record<string, unknown> | null | undefined,
): readonly KitchenTool[] | null {
  const raw = (pc ?? {})[KITCHEN_EQUIPMENT_KEY];
  if (!Array.isArray(raw)) return null;
  const declared = new Set<string>(
    raw.map((tool) => String(tool ?? "").trim().toLowerCase()).filter((tool) =>
      TOOL_SET.has(tool)
    ),
  );
  // Rien de lisible dedans ⇒ on n'a rien lu. Rendre `[]` ici ferait dire à une
  // ligne corrompue « ce foyer n'a pas de four », ce que personne n'a déclaré.
  if (declared.size === 0) return null;
  // L'ORDRE DE LA LISTE, jamais celui du stockage.
  return KITCHEN_TOOLS.filter((tool) => declared.has(tool));
}

/**
 * CE FOYER A-T-IL CET OUTIL ? — `true` / `false` / `null`, et le `null` est la
 * moitié utile.
 *
 * ⚠️ CE N'EST PAS UN `boolean` DÉGUISÉ. Un appelant qui écrit
 * `if (!hasKitchenTool(eq, "oven"))` traite « on ne sait pas » comme « il n'y
 * en a pas » et retire le four à tous les comptes d'avant ce lot.
 *
 * Le patron à suivre, côté consigne, est donc:
 *
 *   const oven = hasKitchenTool(equipment, "oven");
 *   if (oven === false) { …ne propose pas de cuisson au four… }
 *   // `true` ET `null` ⇒ rien à dire, comme avant ce lot.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ ET LE COMPILATEUR NE TIENT PAS CETTE RÈGLE — MESURÉ, PAS SUPPOSÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La première version de ce pavé affirmait que « le type force à nommer le
 * troisième cas ». C'est FAUX, et ça a été mesuré le 2026-08-18 (L2-B): sur un
 * module qui écrit
 *
 *   if (!hasKitchenTool(readKitchenEquipment(pc), "oven")) lines.push("no oven");
 *
 * `deno check` sort en 0 et `deno lint` ne dit rien — TypeScript autorise `!`
 * sur `boolean | null`, et il n'existe pas de règle de lint armée ici pour
 * l'interdire. À l'exécution, sur un compte jamais interrogé, cette ligne rend
 * bien `["no oven"]`: la dégradation silencieuse que tout ce lot existe pour
 * empêcher. Le test « `!` ne mord PAS » plus bas épingle la mesure, pour que
 * personne ne réécrive l'affirmation rassurante.
 *
 * ✅ LE CHEMIN SANS PIÈGE, ET C'EST CELUI QUE L7 DEVRAIT PRENDRE:
 * `missingKitchenTools(equipment)` rend `[]` quand rien n'a été déclaré. Il
 * n'a donc PAS de direction dangereuse — ni `!`, ni oubli du troisième cas ne
 * peuvent en tirer une interdiction que personne n'a énoncée:
 *
 *   for (const tool of missingKitchenTools(equipment)) { …interdis-le… }
 *   // ou, pour un seul outil:
 *   if (missingKitchenTools(equipment).includes("oven")) { …pas de four… }
 *
 * `hasKitchenTool` reste utile pour DISTINGUER les trois cas (afficher, log,
 * compteur). Ce qui doit décider d'une INTERDICTION passe par la liste.
 */
export function hasKitchenTool(
  equipment: readonly KitchenTool[] | null,
  tool: KitchenTool,
): boolean | null {
  if (equipment === null) return null;
  return equipment.includes(tool);
}

/**
 * CE QUE LE FOYER A DÉCLARÉ NE PAS AVOIR — vide tant qu'on n'a rien demandé.
 *
 * C'est la liste que L7 a le droit d'INTERDIRE. Elle est vide quand
 * `equipment` est `null`, ce qui redit la garde d'en haut avec une autre
 * forme: sans réponse, il n'y a rien à interdire.
 */
export function missingKitchenTools(
  equipment: readonly KitchenTool[] | null,
): readonly KitchenTool[] {
  if (equipment === null) return [];
  return KITCHEN_TOOLS.filter((tool) => !equipment.includes(tool));
}
