/**
 * LA CONTAMINATION CROISÉE — LA CONSIGNE, ET SON COMPTEUR. PUR.
 *
 * Lot `C1` du plan de mise en œuvre, vague 1 (2026-08-22).
 *
 * ── CE QUE CE MODULE DIT, EN UNE PHRASE ──────────────────────────────────
 * Quand une bouche de la table porte une contrainte `severity='medical'` ET
 * que la fenêtre demande un plat à quelqu'un d'autre dans la MÊME session de
 * cuisine, le prompt reçoit un bloc qui interdit de partager la poêle, la
 * planche, le couteau, l'huile et la cuillère.
 *
 * ── POURQUOI C'EST LE SEUL SUJET DU MOTEUR OÙ UNE ERREUR REND MALADE ──────
 * Partout ailleurs, se tromper produit un plan médiocre : une portion fausse,
 * un dimanche sans rôti, une semaine ennuyeuse. Ici, se tromper envoie
 * quelqu'un à l'hôpital. La mesure du 2026-08-22 : le dépôt entier portait
 * **deux** occurrences du mot « contamination », et **aucune des deux n'était
 * fonctionnelle** — une chaîne de fixture dans un test
 * (`household_safety_test.ts:708`) et un commentaire
 * (`allergen_surface_forms.ts:52`). Aucune règle, nulle part.
 *
 * ── CE QUE LE BLOC NE CONTREDIT PAS ──────────────────────────────────────
 * Le bloc des contraintes dures (`safety_constraints.ts`) dit déjà que
 * « ONE MOUTH'S HARD CONSTRAINT GOVERNS EVERYTHING this household cooks ».
 * Il tient l'INGRÉDIENT : l'aliment nommé ne doit être écrit nulle part.
 * Celui-ci tient l'ÉQUIPEMENT, que le premier ne peut pas atteindre : une
 * planche, un couteau, une huile de friture et une cuillère portent ce que le
 * plat d'avant y a laissé — le paquet qu'on vient d'ouvrir, l'autre plat,
 * hier. Un moteur qui écrit du JSON ne peut pas retirer une trace d'une poêle.
 *
 * Et la prémisse n'est pas théorique : `dedicatedDishBlock`
 * (`household_meal_generation.ts`) ORDONNE littéralement « same cooking
 * session, same shopping, different plate ». C'est le moteur lui-même qui
 * demande deux plats côte à côte ; « different plate » ne suffit pas quand
 * une des deux bouches a une contrainte médicale.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CETTE CONSIGNE N'EST PAS GARANTIE, ET LE COMPTEUR NE PRÉTEND PAS LE
 *    CONTRAIRE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **On ne prouve pas depuis un JSON qu'une poêle a été lavée.** `emitted`
 * compte que la PHRASE EST PARTIE, jamais qu'un couteau a été rincé. Il
 * n'existe aucune vérification en sortie pour cette règle, et il n'y en aura
 * pas tant que le plan ne portera pas un champ que le modèle DÉCLARE — la
 * vérification de sortie est un chantier, pas ce lot.
 *
 * ⛔ Un lecteur qui verrait `cross_contact_block.emitted = 12` et en conclurait
 * « douze repas séparés » lirait ce compteur à l'envers. Il dit : *douze fois,
 * on l'a demandé*. Ce que le foyer en a fait n'est écrit nulle part.
 *
 * ⛔ ET C'EST POUR ÇA QUE LE BLOC DEMANDE UNE TRACE ÉCRITE. La dernière ligne
 * de la consigne réclame que la séparation entre dans les ÉTAPES du plat, en
 * clair, dans la langue du plan : c'est la seule moitié de cette règle qui
 * atteigne la personne qui cuisine. Le reste ne quitte jamais le prompt.
 *
 * ── POURQUOI UN MODULE, ET PAS TROIS LIGNES DANS LE PROMPT ────────────────
 * ⛔ « Une règle qui ne vit que dans un prompt régresse en réel et personne ne
 * le voit » — la fiche `C1`, et la mesure de `L26-0` le prouve d'un autre
 * angle : `boxSchemaBlock` interdit MOT POUR MOT de nommer la même personne
 * sur deux bacs, le bloc a été SERVI, et le modèle a violé l'interdiction
 * **12 fois sur 12**. Écrire une consigne de plus ne garantit rien. Ce qui
 * rend une consigne falsifiable, c'est un compteur qui distingue « la règle
 * n'avait pas lieu d'être » de « la règle n'a pas tourné ».
 *
 * ⛔ ET LE COMPTEUR A TROIS POPULATIONS, JAMAIS DEUX. `emitted` seul rendrait
 * le même zéro pour « aucun foyer médical » et pour « le bloc est débranché ».
 * C'est la cicatrice `model-declared-fields-need-a-counter` et celle de
 * `V0-B-bis` : un lot désarmé ressemble trait pour trait à un lot qui marche.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

// ---------------------------------------------------------------------------
// ① LES DEUX PRÉMISSES, ET L'ORDRE DANS LEQUEL ON LES REGARDE
// ---------------------------------------------------------------------------

/**
 * Une bouche, telle que le prompt la nomme : un prénom.
 *
 * ⚠️ PAS D'ID. Ce bloc vit dans le message UTILISATEUR, où toutes les consignes
 * nomment les gens par leur prénom (`- Peregrine: never serve fennel`, le seul
 * patron dont ce dépôt ait mesuré qu'il atterrit sur la bonne personne). Les
 * ids sont réservés aux clés de schéma, côté message système. `memberId` est
 * gardé parce que l'appelant l'a et que le dédoublonnage se fait dessus — deux
 * bouches peuvent partager un prénom.
 */
export interface CrossContactMouth {
  memberId: string;
  displayName: string;
}

/**
 * Pourquoi le bloc n'est PAS sorti. `null` quand il est sorti.
 *
 * ⛔ LES DEUX SONT EXCLUSIFS ET EXHAUSTIFS, ET L'ORDRE EST UNE DÉCISION :
 * l'absence de contrainte médicale est regardée EN PREMIER. Un foyer sans
 * bouche médicale et sans plat dédié compte donc `no_medical`, jamais les deux.
 * Sans cet ordre écrit, deux lecteurs comptent deux populations différentes et
 * la somme des trois cesse d'égaler le nombre de plans.
 */
export type CrossContactSkip = "no_medical" | "no_dedicated";

/** Ce que `crossContactBlock` rend : le texte, la raison, ET LES DEUX PRÉMISSES. */
export interface CrossContactOutcome {
  /** Le bloc de prompt. `""` dès que `emitted` est faux. */
  block: string;
  emitted: boolean;
  /** `null` si et seulement si `emitted`. */
  skipped: CrossContactSkip | null;
  /**
   * ⛔ LES DEUX PRÉMISSES, CHIFFRÉES, ET RENDUES PAR LE MODULE QUI LES A
   * ÉVALUÉES. Sans elles, l'appelant qui veut journaliser « combien de bouches
   * médicales » et « combien de plats dédiés » ré-évalue les mêmes entrées à
   * côté du module — deux lectures qui divergent au premier prénom blanc, et
   * un journal qui dit alors autre chose que le prompt.
   *
   * ⚠️ `medicalMouthsSeen` compte les bouches NOMMÉES **plus** les contraintes
   * médicales sans prénom : c'est la prémisse ①, pas un décompte de personnes.
   */
  medicalMouthsSeen: number;
  /** La prémisse ② : combien de bouches reçoivent un plat à elles. */
  dishBearersSeen: number;
}

/**
 * Les trois populations. **`emitted` compte des PHRASES ENVOYÉES, pas des
 * poêles lavées** — voir l'en-tête du module.
 */
export interface CrossContactCounts {
  emitted: number;
  skipped_no_medical: number;
  skipped_no_dedicated: number;
}

export const CROSS_CONTACT_BLOCK_TAG = "keel.household_meal.cross_contact_block";

export function emptyCrossContactCounts(): CrossContactCounts {
  return { emitted: 0, skipped_no_medical: 0, skipped_no_dedicated: 0 };
}

/**
 * Le total des trois. Il DOIT égaler le nombre de plans regardés.
 *
 * ⚠️ C'est l'assertion de cardinalité du lot : trois compteurs dont la somme ne
 * fait pas le dénominateur sont trois compteurs dont l'un ne tourne pas.
 */
export function crossContactSeen(counts: CrossContactCounts): number {
  return counts.emitted + counts.skipped_no_medical + counts.skipped_no_dedicated;
}

/** Ajoute UN verdict au tableau. Rend un objet neuf ; n'écrit pas dans l'entrée. */
export function tallyCrossContact(
  counts: CrossContactCounts,
  outcome: CrossContactOutcome,
): CrossContactCounts {
  if (outcome.emitted) return { ...counts, emitted: counts.emitted + 1 };
  if (outcome.skipped === "no_medical") {
    return { ...counts, skipped_no_medical: counts.skipped_no_medical + 1 };
  }
  return { ...counts, skipped_no_dedicated: counts.skipped_no_dedicated + 1 };
}

// ---------------------------------------------------------------------------
// ② LE BLOC
// ---------------------------------------------------------------------------

/**
 * ⛔ SECONDE COPIE DÉLIBÉRÉE DE `UNATTRIBUTED_MOUTH`
 * (`safety_constraints.ts:294`), ET IL FAUT SAVOIR POURQUOI.
 *
 * Ce module est **commité** ; l'export d'en face **n'existe pas dans `HEAD`**
 * (le fichier porte +176 lignes non commitées d'une autre session, et
 * l'ANNEXE du plan interdit de les emporter). Un module commité qui importe un
 * symbole absent d'un `git clone` propre casse `deno check` — la facture que
 * `V0-A` vient de payer sur 40 erreurs de typecheck.
 *
 * ⚠️ CE N'EST PAS UN JETON, RIEN N'Y JOINT. C'est une phrase de prose, servie
 * au modèle, jamais comparée à quoi que ce soit. Le coût d'une divergence est
 * une formulation qui varie entre deux blocs du même prompt, pas une garde
 * morte.
 *
 * LE GESTE INVERSE, QUAND `safety_constraints.ts` SERA COMMITÉ : remplacer
 * cette constante par `import { UNATTRIBUTED_MOUTH } from "./safety_constraints.ts"`
 * et supprimer ce commentaire.
 */
export const CROSS_CONTACT_UNNAMED_MOUTH = "someone at this table";

/**
 * ⛔ LA PHRASE QUI DIT QUE LA CONSIGNE N'EST PAS GARANTIE — celle qui part au
 * modèle. Sortie en constante pour qu'un test puisse la clouer : c'est la
 * seule ligne du bloc qu'on serait tenté de couper « pour gagner du budget »,
 * et la couper transformerait une consigne honnête en promesse.
 */
export const CROSS_CONTACT_NOT_GUARANTEED_LINE =
  "Nothing further down this pipeline can check a washed pan -- that written " +
  "step is the only part of this rule that reaches the person cooking.";

function nameList(mouths: readonly CrossContactMouth[]): string {
  const names = [
    ...new Set(
      mouths
        .map((m) => String(m.displayName ?? "").trim())
        .filter((n) => n !== ""),
    ),
  ];
  if (names.length === 0) return CROSS_CONTACT_UNNAMED_MOUTH;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * LE BLOC, OU RIEN.
 *
 * ── LES DEUX PRÉMISSES ────────────────────────────────────────────────────
 * ① `medicalMouths` ou `unnamedMedical` : au moins une bouche de la table
 *    porte une contrainte `severity='medical'`.
 * ② `dishBearers` : la fenêtre réclame à quelqu'un un plat à lui, cuit dans la
 *    même session que celui de la table.
 *
 * ⛔ `unnamedMedical` EST REQUIS, ET IL N'EST PAS DÉCORATIF. Une contrainte
 * médicale dont la bouche ne se résout pas en prénom (`unattributed`, cf.
 * `householdConstraintMouths`) reste une contrainte médicale. L'omettre
 * désarmerait ce bloc exactement pour la population qui ne peut pas se
 * redéclarer elle-même — la bouche sans compte, qui est le cas nominal de
 * `household_member_allergies`.
 *
 * ⚠️ LES DEUX BOUCHES N'ONT PAS À ÊTRE LA MÊME PERSONNE. Le risque va dans les
 * deux sens : la bouche médicale peut être celle qui reçoit le plat dédié, ou
 * celle qui mange la casserole commune pendant qu'un autre plat cuit à côté.
 * Le bloc parle donc du « plat que X mange », quel qu'il soit.
 */
export function crossContactBlock(input: {
  medicalMouths: readonly CrossContactMouth[];
  /** Combien de contraintes médicales n'ont PAS trouvé leur prénom. */
  unnamedMedical: number;
  dishBearers: readonly CrossContactMouth[];
}): CrossContactOutcome {
  const named = input.medicalMouths.filter(
    (m) => String(m.displayName ?? "").trim() !== "",
  );
  const unnamed = Number.isFinite(input.unnamedMedical)
    ? Math.max(0, Math.floor(input.unnamedMedical))
    : 0;
  const seen = {
    medicalMouthsSeen: named.length + unnamed,
    dishBearersSeen: input.dishBearers.length,
  };
  const hasMedical = named.length > 0 || unnamed > 0;
  // ⛔ L'ORDRE EST LA RÈGLE ÉCRITE SUR `CrossContactSkip` : le médical d'abord.
  if (!hasMedical) {
    return { block: "", emitted: false, skipped: "no_medical", ...seen };
  }
  if (input.dishBearers.length === 0) {
    return { block: "", emitted: false, skipped: "no_dedicated", ...seen };
  }

  const who = named.length > 0 ? nameList(named) : CROSS_CONTACT_UNNAMED_MOUTH;
  const carries = named.length > 1 ? "carry" : "carries";
  const bearers = nameList(input.dishBearers);

  return {
    block: [
      "== THE SAME KITCHEN, TWO DISHES ==",
      `${who} ${carries} a medical-severity hard constraint, and this window`,
      "asks for a dish of somebody's own beside the table's dish, in the SAME",
      `cooking session: ${bearers}.`,
      "The hard constraints above keep those foods out of everything you write.",
      "They cannot keep a TRACE out of a pan. A board, a knife, a spoon, the",
      "frying oil and the worktop carry what the last dish left on them -- the",
      "packet just opened, the other dish, yesterday. For a medical-severity",
      "constraint a trace is a hospital visit, not a disappointing meal.",
      "So wherever one day and one moment carry two dishes at once:",
      `- the dish ${who} eats -- whichever of the two it is -- is cooked and`,
      "  boxed FIRST, before the other dish is started;",
      "- board, knife, pan and worktop are washed in between, and the oil is",
      "  fresh;",
      "- one serving spoon per dish, never moved from one to the other;",
      "- each box is closed before the other dish is opened, and no box is ever",
      "  topped up from the other pot.",
      `Put it in the plan, not only in your answer: the steps of the dish ${who}`,
      "eats say, in the plan's own language, that it is made first and on clean",
      "equipment.",
      CROSS_CONTACT_NOT_GUARANTEED_LINE,
    ].join("\n"),
    emitted: true,
    skipped: null,
    ...seen,
  };
}
