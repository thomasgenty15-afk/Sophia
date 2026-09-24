// ═══════════════════════════════════════════════════════════════════════════
// LE PROMPT DU FOYER — LA RÈGLE DU « why », SON TEXTE ET SON COMPTEUR
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `household_meal_generation.ts` (découpage
// des gros fichiers, lot 2c). Aucune logique changée, aucun octet de prompt
// changé. `household_meal_generation.ts` ré-exporte tout ce qui est exporté
// ici : les appelants continuent d'importer depuis lui.
//
// Le texte (`whyRuleSchemaBlock`, `whyRuleBlock`) et le compteur
// (`countWhyRuleAttributions`) restent ensemble : ils lisent la même liste
// fermée (`HouseholdRuleHolder`).
//
// Ce module n'importe rien.

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT C ② — UNE BOUCHE QUI PORTE UNE RÈGLE, ET SON PRÉNOM.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La LISTE FERMÉE contre laquelle `why_rule_of` est validé. Elle est construite
 * par l'appelant, qui tient les trois provenances d'une règle (une contrainte
 * dure, un régime déclaré, une règle de maison) et le roster qui les nomme.
 *
 * ⚠️ ELLE NE DIT PAS LAQUELLE. Le prompt nomme déjà les contraintes dures avec
 * leur bouche, et le régime avec la sienne; répéter ici « Lubna: gluten » ferait
 * une SECONDE source pour un fait déjà écrit, et c'est celle qu'on regarde le
 * moins qui garderait l'ancienne valeur. Ce bloc-ci ne répond qu'à une question:
 * QUI, à cette table, a une règle dont un `why` pourrait se réclamer.
 */
export interface HouseholdRuleHolder {
  memberId: string;
  displayName: string;
}

/**
 * ⛔ LE DÉFAUT MESURÉ, ET IL EST DANS LA PROSE — PAS DANS LE PROMPT.
 *
 * Plan réel du 2026-08-19 (`05-qualite-foyer/plan-4`), foyer de quatre, une
 * seule allergie au gluten et elle est à Lubna. Le prompt l'attribue
 * correctement, en toutes lettres: `- Lubna: gluten — allergy, severity=medical`.
 * TROIS `dishes[].why` sur huit l'ont mise ailleurs:
 *
 *     "A high-protein, gluten-free meal designed specifically for Roxane's
 *      midday energy needs."
 *     "A quick, warm lunch for Roxane that avoids gluten and fits her
 *      portioning needs."
 *     "A warm, comforting dinner for Roxane that is entirely gluten-free."
 *
 * Roxane n'a aucune contrainte. Inoffensif sur ce plan-là — le gluten est
 * absent de TOUTE la table de toute façon, c'est la règle d'union — mais c'est
 * la même faiblesse qui, deux runs plus tôt sur un autre foyer, a mis 120 g de
 * traybake au pistachio dans la boîte de l'ALLERGIQUE en écrivant
 * l'avertissement sur l'assiette du voisin.
 *
 * ── POURQUOI DEUX MOITIÉS, ET PAS UNE ──────────────────────────────────────
 * ① LE `why` NE PORTE AUCUNE RÈGLE. C'est la correction, et elle est absolue:
 *    ce champ est rendu à l'écran sous le plat (`DishCard.tsx:211`), donc lu par
 *    toute la maison. Quatre runs sur quatre y ont écrit le régime ou la
 *    contrainte médicale de quelqu'un, dont DEUX en recopiant l'échappatoire du
 *    prompt elle-même (« one of the foods on your medical list »). Le prompt
 *    donnait cette formule pour NE PAS nommer l'allergène; il n'était écrit
 *    nulle part qu'elle ne devait pas finir sur la table non plus.
 * ② SI UNE RÈGLE PASSE QUAND MÊME, ELLE EST DÉCLARÉE ET ATTRIBUÉE. Sans ②, ①
 *    est une phrase de plus dans un prompt qui en compte trois cents, et sa
 *    désobéissance est MUETTE: un run où le modèle obéit et un run où il écrit
 *    la maladie cœliaque d'une adulte au dîner rendent exactement les mêmes
 *    octets d'instrumentation. Voir `countWhyRuleAttributions`.
 *
 * ⛔ ET PAS DE MATCHER. Chercher « gluten » ou « vegan » dans une prose que le
 * modèle rend en anglais, en français ou en néerlandais, avec ou sans négation,
 * est très exactement le geste que ce dépôt a payé douze faux positifs sur douze
 * (« laitue » ≠ « lait »). Le champ est DÉCLARÉ par le modèle et validé contre
 * la liste fermée ci-dessus — le patron de `for_member_id`, de `same_day` et de
 * `preparation_id`, qui fonctionnent en production.
 */
export function whyRuleSchemaBlock(
  ruleHolders: readonly HouseholdRuleHolder[],
): readonly string[] {
  if (ruleHolders.length === 0) return [];
  return [
    "== WHOSE RULE IS IN A \"why\" (household) ==",
    'A dish can carry one more key: "why_rule_of".',
    "Set it ONLY when the dish's \"why\" still names somebody's diet, allergy,",
    "medical list or house rule. Its value is the EXACT member_id of the person",
    "that rule belongs to -- the one who would be harmed, never the person the",
    "dish happens to be for.",
    "Leave it out when the \"why\" names nobody's rule. That is the normal case,",
    "and it is the case this plan asks for.",
    ...ruleHolders.map((h) => `  ${h.displayName} = ${h.memberId}`),
  ];
}

/** LOT C ② — LA MOITIÉ CONSIGNE, dans le groupe des verrous. Voir ci-dessus. */
export function whyRuleBlock(ruleHolders: readonly HouseholdRuleHolder[]): string {
  if (ruleHolders.length === 0) return "";
  return [
    "== WHAT A \"why\" IS ALLOWED TO SAY ==",
    "Every dish's \"why\" is shown under that dish to the WHOLE household. It",
    "says what the FOOD is: warm, quick, cheap, in season, it reheats, it uses",
    "up what is already there. That is all it ever says.",
    "It NEVER says whose diet, whose allergy, whose medical list or whose house",
    "rule made you pick it. Not the rule, not the family word for it, not the",
    'phrase "one of the foods on your medical list" -- that phrase exists so you',
    "can avoid naming a food to the STUDENT, and it is not a sentence to put on",
    "the table either.",
    "And you do not know whose rule it is beyond what is written above. On the",
    "plan this instruction was written for, three dishes explained that a meal",
    "avoided a food \"for\" a person who had no such constraint; the one person",
    "at that table who did have it was somebody else. A rule pinned on the wrong",
    "person is worse than a rule not mentioned: it is read out, it is wrong, and",
    "nobody in the room can correct it.",
    "If a \"why\" you wrote still names a rule, that dish MUST carry",
    "\"why_rule_of\" with the exact member_id of the person whose rule it is,",
    "from the list in the schema. A rule named at this table without that key",
    "is a rule nobody can check.",
  ].join("\n");
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT C ② — LE COMPTEUR, ET IL A TROIS NOMBRES PARCE QUE DEUX MENTENT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `{déclaré, attribué}` rend le MÊME zéro pour « aucun `why` n'a nommé de
 * règle » — ce qu'on veut — et pour « le modèle ignore la clé » — ce qui rend la
 * consigne invérifiable. Les deux appellent des corrections opposées, et ce
 * dépôt a déjà payé ce zéro ambigu deux fois (`dish_owners`, `same_day`).
 *
 *   · `dishes`   — les plats de la RÉPONSE DU MODÈLE. Le dénominateur.
 *   · `declared` — ceux qui portent un `why_rule_of` non vide, avant validation.
 *   · `valid`    — ceux dont l'id est une bouche qui porte VRAIMENT une règle.
 *   · `refused`  — ceux dont l'id n'en est pas une. **C'est la mauvaise
 *                  attribution**, et c'est le nombre du défaut.
 *
 * ⚠️ LA POPULATION EST LA RÉPONSE DU MODÈLE, PAS LE PLAN GARDÉ, et le nom du
 * champ le dit. `dish_owner_counts` compte les plats survivants parce que sa clé
 * traverse le parseur; `why_rule_of` n'y entre pas — le parseur est le TRONC,
 * partagé avec la lane individuelle, et lui ajouter un paramètre requis
 * toucherait quinze fichiers de tests appartenant à quatre lots parallèles. Les
 * quatre nombres sont donc comptés sur la MÊME liste, ce qui est la seule
 * propriété qui compte pour qu'un compteur ne mente pas.
 *
 * ⚠️ `declared === valid + refused` EST UNE PROPRIÉTÉ QU'UN TEST VÉRIFIE, pas
 * une définition. Dériver `refused` de la soustraction est la cicatrice
 * `withheld`/`over_cap`: deux nombres du même objet, gonflé et dégonflé en sens
 * inverses, sans que rien n'échoue.
 *
 * ⚠️ NE REJETTE RIEN, NE RÉÉCRIT RIEN. Posture `for_member_id` / `same_day`: un
 * `why` mal attribué reste un plat qui se cuisine et se mange, et « on ne
 * répare jamais un plan à la main ». Ce module CONSTATE; ce qui se corrige est
 * le prompt.
 */
export interface WhyRuleCounts {
  dishes: number;
  declared: number;
  valid: number;
  refused: number;
}

export function countWhyRuleAttributions(
  rawJsonText: string,
  ruleHolders: readonly HouseholdRuleHolder[],
): { counts: WhyRuleCounts; issues: string[] } {
  const empty: WhyRuleCounts = { dishes: 0, declared: 0, valid: 0, refused: 0 };
  const text = String(rawJsonText ?? "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { counts: empty, issues: [] };
  let dishes: unknown;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    dishes = parsed?.dishes;
  } catch {
    // ILLISIBLE ⇒ ZÉRO PARTOUT, ET AUCUNE `issue`. Une réponse que ce module
    // n'arrive pas à relire est une réponse que `parseGeneratedMeal` a déjà
    // refusée en amont — la requête est morte avant d'arriver ici. Lever ferait
    // perdre un dîner pour un compteur.
    return { counts: empty, issues: [] };
  }
  if (!Array.isArray(dishes)) return { counts: empty, issues: [] };

  const holders = new Map(
    ruleHolders
      .map((h) => [String(h.memberId ?? "").trim(), String(h.displayName ?? "").trim()])
      .filter(([id]) => id.length > 0) as [string, string][],
  );
  const counts: WhyRuleCounts = { dishes: dishes.length, declared: 0, valid: 0, refused: 0 };
  const issues: string[] = [];
  for (let i = 0; i < dishes.length; i++) {
    const d = (dishes[i] ?? {}) as Record<string, unknown>;
    const declared = String(d.why_rule_of ?? "").trim();
    if (!declared) continue;
    counts.declared += 1;
    if (holders.has(declared)) {
      counts.valid += 1;
      // ⚠️ UNE `issue` MÊME QUAND L'ID EST BON, et c'est délibéré. Le bloc
      // demande qu'AUCUN `why` ne nomme de règle: un id valide veut dire « une
      // règle a bien été nommée, et au moins sur la bonne personne ». C'est
      // moins grave, ce n'est pas ce qu'on a demandé, et le taire ferait de la
      // consigne ① une phrase sans lecteur.
      issues.push(`why_rule_named:${declared}`);
    } else {
      counts.refused += 1;
      issues.push(
        `why_rule_of ${JSON.stringify(declared)} on dishes[${i}] is not a mouth ` +
          `that holds a rule at this table`,
      );
    }
  }
  return { counts, issues };
}
