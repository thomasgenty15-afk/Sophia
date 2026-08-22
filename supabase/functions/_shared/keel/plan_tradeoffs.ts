/**
 * CE QUE CE PLAN A SACRIFIÉ, ET POUR QUI. Module PUR. (L35-a)
 *
 * ── LE TROU QUE CE MODULE FERME ────────────────────────────────────────────
 * `plan_rationale.ts` explique un CALENDRIER et un ARGENT. Il ne dit rien de ce
 * que la composition a dû LAISSER TOMBER pour tenir la table: la bouche qu'elle
 * ne compte pas, celle dont elle ne sait rien, et le plat unique qui impose à
 * tout le monde la ligne de la personne la plus restrictive.
 *
 * *« Un compromis nommé est un service ; un compromis silencieux est une faute
 * qui retombe sur l'utilisateur. »*
 *
 * ── POURQUOI UN MODULE À PART, ET PAS TROIS GABARITS DE PLUS ───────────────
 * ⛔ C'EST LA RAISON PRINCIPALE, ET ELLE N'EST PAS UN GOÛT D'ARCHITECTURE.
 * `plan_rationale.ts` porte, dans son en-tête, un invariant fondateur:
 *
 *     « CHAQUE PHRASE EST ARMÉE PAR UNE PRÉMISSE. Aucune ligne ne sort d'un
 *       fait absent. »
 *
 * La QUATRIÈME phrase de ce module-ci fait EXACTEMENT L'INVERSE, et elle le
 * doit (voir la famille ④ plus bas). La poser au milieu de gabarits gouvernés
 * par la règle opposée, c'est garantir qu'un futur lecteur la « répare » —
 * c'est-à-dire qu'il casse une garde en croyant corriger une négligence.
 *
 * ⚠️ ET LA TABLE DE LANGUE N'EST PAS DUPLIQUÉE. Les prénoms, les jours et les
 * noms de régime sont rendus par `joinList`, `renderDays` et `regimeLabel`,
 * IMPORTÉS de `plan_rationale.ts`. Ce module n'ajoute que ses propres phrases.
 *
 * ── DÉTERMINISTE, JAMAIS DEMANDÉ AU MODÈLE ────────────────────────────────
 * Même posture que le module frère, et c'est ici qu'elle compte le plus: la
 * règle juste est **« personne n'explique la décision d'un autre »**. Le défaut
 * d'origine était de demander au MODÈLE d'expliquer une décision du MOTEUR.
 * C'est là que l'invention arrive, et nulle part ailleurs.
 *
 * ── DEUX GARDES, ET ELLES VALENT POUR CHAQUE GABARIT D'ICI ────────────────
 *   ① LA PHRASE EST FALSIFIABLE CONTRE LE PLAN. Chaque ligne ci-dessous dit
 *      quelque chose qu'on peut aller VÉRIFIER sur le plan à côté: une part
 *      absente, une part servie comme celle de la table, un plat unique et ce
 *      qu'il suit. Une affirmation qu'on ne peut pas confronter au JSON ne
 *      s'affiche pas.
 *   ② ⛔ AUCUN NOMBRE QUI VISE UNE PERSONNE. Sur un run réel, le modèle avait
 *      recopié un facteur dans le texte visible — « Zoé : 0,85 de la part de
 *      Marc », lu à voix haute à table. Aucun gabarit d'ici n'interpole de
 *      nombre à côté d'un prénom: ni un facteur, ni un gramme, ni même un
 *      COMPTE de repas manqués. Les jours se nomment, ils ne se comptent pas.
 *
 * ── CE QUE CE MODULE NE DIT JAMAIS ────────────────────────────────────────
 * Aucun objectif, aucun poids, aucune calorie, aucun plancher. En particulier:
 * il ne nomme JAMAIS pourquoi une bouche est servie autrement — seulement
 * QU'ELLE l'est, et de la même façon pour tout le monde.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import { timeAllowsASecondDish } from "./household_portions.ts";
import { findGuiltTripping } from "./reengagement.ts";
import {
  joinList,
  type RationaleLocale,
  regimeLabel,
  renderDays,
} from "./plan_rationale.ts";
import { type DayToken } from "./tokens.ts";

/** Miroir de `RationaleLocale`: les deux mêmes langues, jamais une troisième. */
export type TradeoffLocale = RationaleLocale;

/**
 * LES QUATRE FAMILLES, NOMMÉES. C'est le COMPTEUR du lot: une famille qui
 * cesse de sortir devient visible, là où une ligne perdue dans un tableau de
 * chaînes ne se remarque jamais.
 */
export const TRADEOFF_FAMILIES = [
  "mouth_absent",
  "mouth_without_body",
  "simple_cooking_regime",
  "shares_at_the_plate",
] as const;
export type TradeoffFamily = (typeof TRADEOFF_FAMILIES)[number];

/** Pourquoi rien ne sort. Nommé, jamais un booléen — comme le module frère. */
export type TradeoffRefusal = "guilt_tripping";

/**
 * UNE BOUCHE QUI N'EST PAS À TOUS LES REPAS DE LA FENÊTRE.
 *
 * ⚠️ `name` PORTE UN PRÉNOM, JAMAIS UN IDENTIFIANT: la phrase se lit à voix
 * haute à table, exactement comme `handTakenBy` et `mergedIn` du module frère.
 * Une bouche dont le nom n'a pas pu être résolu est ÉCARTÉE par l'appelant
 * plutôt que rendue en uuid.
 */
export interface AwayMouth {
  name: string;
  /**
   * LES JOURS DE LA FENÊTRE OÙ IL LUI MANQUE AU MOINS UN REPAS ICI.
   *
   * ⚠️ « AU MOINS UN », ET PAS « TOUS », ET C'EST UNE MESURE QUI A TRANCHÉ.
   * Le corpus du 2026-08-22 porte **8 bouches** avec une absence déclarée et
   * **ZÉRO** qui manque une journée ENTIÈRE: les absences réelles sont « le
   * midi », « le midi et le soir ». Une famille armée sur la journée pleine
   * serait donc une famille qui ne mord JAMAIS — indiscernable d'une famille
   * débranchée. La phrase dit « manque des repas », ce qui est vrai des deux.
   *
   * `[]` avec `allWindow: false` fait TAIRE la ligne: on ne dit pas « elle
   * manque des repas » sans pouvoir dire quand — ce serait une affirmation
   * qu'on ne peut pas confronter au plan (garde ①).
   */
  days: readonly DayToken[];
  /**
   * ELLE N'EST À AUCUN REPAS DE TOUTE LA FENÊTRE, donc le plan ne la compte
   * PAS DU TOUT — `presence.absentAllWindow`, la liste qui retire réellement
   * son assiette (`platedMembers`). Ce n'est pas la même phrase que « elle
   * manque mercredi »: l'une dit qu'il n'y a pas de part, l'autre qu'il en
   * manque quelques-unes.
   */
  allWindow: boolean;
}

/**
 * LES FAITS DÉJÀ CONNUS AU MOMENT OÙ LE PLAN EST ÉCRIT.
 *
 * ⚠️ TOUTES LES PROPRIÉTÉS SONT REQUISES — même posture que
 * `PlanRationaleFacts`. Un appelant qui n'a pas su lire un fait passe `null` ou
 * `[]` EXPLICITEMENT, et les deux ne disent pas la même chose. La fonction
 * JETTE sur un `undefined`: un `?` ferait passer les deux lanes sans rien
 * changer, et le lot serait construit sans être branché — « une ceinture armée
 * sur un coffre vide ».
 */
export interface PlanTradeoffFacts {
  /**
   * Le nombre de bouches réellement servies. `null` sur la lane individuelle.
   *
   * ⚠️ TOUT CE MODULE EST AU-DESSUS D'UNE BOUCHE, ET C'EST DÉFINITIF. « Le
   * plan ne compte pas X », « la table mange végane », « les parts sont
   * servies à l'assiette » n'ont aucun sujet quand on mange seul.
   */
  mouthsServed: number | null;
  /** Les bouches absentes, tout ou partie de la fenêtre. `[]` = personne. */
  awayMouths: readonly AwayMouth[];
  /**
   * LES BOUCHES DONT LE PLAN NE SAIT RIEN. Prénoms. `[]` = tout le monde a
   * dit quelque chose.
   *
   * ⛔ C'EST UNE ABSENCE DE DÉCLARATION, JAMAIS UN ÉTAT DE PROTECTION. L'appelant
   * la calcule sur « aucun poids connu, ni pesée ni fiche » — le seul cas où il
   * n'y a littéralement rien pour dimensionner une part. Une bouche sous
   * plancher, elle, A des pesées: elle n'entre pas dans cette liste, et c'est
   * ce qui empêche cette phrase de désigner qui que ce soit.
   */
  mouthsWithoutBody: readonly string[];
  /**
   * CE QUE LE PLAT COMMUN SUIT. `null` = personne n'a déclaré de régime.
   *
   * ⚠️ AUCUN PRÉNOM N'EST LU ICI, et c'est voulu: le module frère dit déjà DE
   * QUI c'est la ligne. La phrase d'ici dit ce que le CHOIX DE CUISINE a coûté
   * à la table, et nommer une seconde fois la même personne la désignerait deux
   * fois pour une décision qui n'est pas la sienne.
   */
  sharedDishRegime: { regime: string } | null;
  /**
   * LE MODE DE CUISSON DEMANDÉ, ET CE QU'IL A DONNÉ. `null` = rien n'a été
   * demandé. Les deux booléens viennent de `capCookingShape`, JAMAIS d'une
   * seconde comparaison écrite ici.
   */
  cookingShapeChoice: { capped: boolean; unused: boolean } | null;
  /**
   * LE TEMPS DE CUISINE D'UNE SEMAINE, EN MINUTES. `null` = pas lu. C'est un
   * TOTAL HEBDOMADAIRE, pas la durée d'une session — même contrat que
   * `PlanRationaleFacts.weeklyCookingMinutes`, et la même valeur.
   */
  weeklyCookingMinutes: number | null;
  /**
   * LE MODE DE LA LANE (`householdLaneMode`). `null` = pas résolu.
   *
   * ⛔ IL NE SE LIT PAS COMME UN SIGNAL, ET IL NE DOIT JAMAIS ÊTRE RENDU TEL
   * QUEL À QUI QUE CE SOIT. `per_portion` mélange DEUX populations par
   * construction (`household_composition.ts`): une bouche dégradée, OU aucune
   * enveloppe calculable à cette table. C'est la seule raison pour laquelle il
   * peut entrer ici.
   */
  laneMode: "per_kg" | "per_portion" | null;
}

export interface PlanTradeoffs {
  /** Les phrases finies, dans la langue du contenu. `[]` = rien à dire. */
  lines: string[];
  /**
   * LES FAMILLES QUI ONT PRODUIT UNE LIGNE, dans l'ordre de sortie. LE
   * COMPTEUR: l'appelant le journalise, et une famille qui cesse de mordre
   * devient un chiffre qui tombe, pas un silence.
   */
  families: TradeoffFamily[];
  /** Pourquoi rien ne sort. `null` quand il y a des lignes ou rien à dire. */
  refusal: TradeoffRefusal | null;
}

// ---------------------------------------------------------------------------
// LES GABARITS
// ---------------------------------------------------------------------------

/**
 * ⚠️ AUCUN DE CES GABARITS NE PORTE UN JUGEMENT, NI UN REPROCHE, NI UNE
 * SUGGESTION. « Sarah n'a toujours pas rempli son profil » se lit comme une
 * relance; « Sarah n'a pas dit ce qu'il lui faut » dit le même fait sans le
 * retourner contre elle. La porte finale, plus bas, coupe TOUT si un gabarit se
 * met à culpabiliser, et elle ne devrait jamais mordre.
 *
 * ⚠️ ET AUCUN N'INTERPOLE UN NOMBRE À CÔTÉ D'UN PRÉNOM (garde ②).
 */
const COPY = {
  fr: {
    // ── ① LA BOUCHE QUE LE PLAN NE COMPTE PAS ───────────────────────────
    awayAllWindowOne: (names: string) =>
      `${names} n'est à aucun repas de cette fenêtre : ce plan ne compte pas ` +
      `sa part.`,
    awayAllWindowMany: (names: string) =>
      `${names} ne sont à aucun repas de cette fenêtre : ce plan ne compte ` +
      `pas leurs parts.`,
    awaySomeDays: (name: string, days: string) =>
      `${name} manque des repas ${days} : ces parts-là ne sont pas comptées.`,
    // Au-delà de trois bouches, l'énumération n'est plus une explication:
    // c'est la grille de présence réécrite en prose. Même arbitrage que les
    // absences comptées du module frère.
    awaySomeDaysCrowd:
      "Plusieurs bouches manquent des repas de cette fenêtre : ces parts-là " +
      "ne sont pas comptées.",
    // ── ② LA BOUCHE DONT LE PLAN NE SAIT RIEN ───────────────────────────
    noBodyOne: (names: string) =>
      `${names} n'a pas dit ce qu'il lui faut : sa part est servie comme ` +
      `celle de la table.`,
    noBodyMany: (names: string) =>
      `${names} n'ont pas dit ce qu'il leur faut : leurs parts sont servies ` +
      `comme celle de la table.`,
    // ── ③ LE COMPROMIS DE LA FORME DE CUISINE ───────────────────────────
    simpleCookingRegime: (regime: string) =>
      `Tu as choisi de cuisiner simplement : toute la table mange ${regime}.`,
    // ── ④ LA PHRASE FIXE — voir le bloc de la famille ④ dans la chaîne ──
    sharesAtThePlate:
      "Les parts de ce plan sont servies à l'assiette, au plus près, plutôt " +
      "qu'ajustées bouche par bouche.",
  },
  en: {
    awayAllWindowOne: (names: string) =>
      `${names} is at no meal in this window: this plan does not count their ` +
      `share.`,
    awayAllWindowMany: (names: string) =>
      `${names} are at no meal in this window: this plan does not count ` +
      `their shares.`,
    awaySomeDays: (name: string, days: string) =>
      `${name} misses meals on ${days}: those shares are not counted.`,
    awaySomeDaysCrowd:
      "Several people miss meals in this window: those shares are not counted.",
    noBodyOne: (names: string) =>
      `${names} has not said what they need: their share is served like the ` +
      `table's.`,
    noBodyMany: (names: string) =>
      `${names} have not said what they need: their shares are served like ` +
      `the table's.`,
    simpleCookingRegime: (regime: string) =>
      `You chose to keep the cooking simple: the whole table eats ${regime}.`,
    sharesAtThePlate:
      "The shares in this plan are served at the plate, as close as they can " +
      "be, rather than adjusted mouth by mouth.",
  },
} as const;

/**
 * COMBIEN DE BOUCHES ON NOMME AVANT DE COMPTER PLUTÔT QUE D'ÉNUMÉRER.
 *
 * Il est ici, en constante lisible, PARCE QU'UN TEST DOIT POUVOIR LE FRANCHIR
 * SANS LE RECOPIER: « un test paramétré par sa propre constante reste vert
 * quand on change la constante ».
 */
export const MAX_NAMED_AWAY_MOUTHS = 3;

/** Les champs REQUIS, dans l'ordre où le lecteur les cherchera. */
const REQUIRED_FACTS: readonly (keyof PlanTradeoffFacts)[] = [
  "mouthsServed",
  "awayMouths",
  "mouthsWithoutBody",
  "sharedDishRegime",
  "cookingShapeChoice",
  "weeklyCookingMinutes",
  "laneMode",
];

function cleanNames(names: readonly string[]): string[] {
  return names.map((n) => String(n ?? "").trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// LA CHAÎNE
// ---------------------------------------------------------------------------

/**
 * CE QUE CE PLAN A SACRIFIÉ, en phrases finies.
 *
 * ⚠️ JETTE sur un champ manquant ou une locale inconnue — même posture que
 * `explainPlanChoices`. `null` est une valeur, `undefined` est un oubli.
 */
export function explainPlanTradeoffs(input: {
  facts: PlanTradeoffFacts;
  locale: TradeoffLocale;
}): PlanTradeoffs {
  if (input?.locale !== "fr" && input?.locale !== "en") {
    throw new Error(
      `[keel/plan_tradeoffs] locale inconnue: ${JSON.stringify(input?.locale)}`,
    );
  }
  const facts = input.facts;
  if (!facts || typeof facts !== "object") {
    throw new Error("[keel/plan_tradeoffs] facts est REQUIS");
  }
  for (const key of REQUIRED_FACTS) {
    if (
      !(key in facts) ||
      (facts as unknown as Record<string, unknown>)[key] === undefined
    ) {
      throw new Error(
        `[keel/plan_tradeoffs] ${key} est REQUIS — ` +
          "`null`/`[]` disent quelque chose, `undefined` ne dit rien",
      );
    }
  }

  const copy = COPY[input.locale];
  const lines: string[] = [];
  const families: TradeoffFamily[] = [];

  // ⛔ LA CONDITION QUI ENGLOBE TOUT: PLUS D'UNE BOUCHE. `null` est la lane
  // individuelle, et `1` est un foyer d'une personne — les deux se taisent.
  const table = facts.mouthsServed !== null &&
    Number.isFinite(facts.mouthsServed) &&
    facts.mouthsServed > 1;

  if (table) {
    // ── ① LA BOUCHE QUE LE PLAN NE COMPTE PAS ─────────────────────────────
    //
    // ARMÉE PAR SA PRÉMISSE, comme tout le module frère: `awayMouths: []` ne
    // produit RIEN, jamais « personne n'est absent ». Une phrase qui dit une
    // absence de fait apprend au lecteur à ne pas lire les autres.
    //
    // ⚠️ DEUX PHRASES, PAS UNE, ET ELLES NE DISENT PAS LA MÊME CHOSE. « Ce
    // plan ne compte pas sa part » est vrai de quelqu'un que `platedMembers` a
    // retiré; « ces parts-là ne sont pas comptées » est vrai de quelqu'un qui
    // mange ici les autres jours. Les confondre ferait dire à quelqu'un qu'il
    // n'a rien à manger cette semaine.
    const allWindow = cleanNames(
      facts.awayMouths.filter((m) => m?.allWindow === true).map((m) => m?.name),
    );
    if (allWindow.length > 0) {
      lines.push(
        allWindow.length === 1
          ? copy.awayAllWindowOne(joinList(allWindow, input.locale))
          : copy.awayAllWindowMany(joinList(allWindow, input.locale)),
      );
      families.push("mouth_absent");
    }

    // ⚠️ LES JOURS SE NOMMENT, ILS NE SE COMPTENT PAS (garde ②). « Yanis
    // manque 3 repas » est un nombre qui vise une personne; « Yanis ne mange
    // pas ici mercredi » est un fait qu'on peut aller vérifier sur la grille.
    const partial = facts.awayMouths.filter((m) =>
      m?.allWindow !== true &&
      String(m?.name ?? "").trim().length > 0 &&
      Array.isArray(m?.days) && m.days.filter(Boolean).length > 0
    );
    if (partial.length > 0) {
      if (partial.length > MAX_NAMED_AWAY_MOUTHS) {
        lines.push(copy.awaySomeDaysCrowd);
      } else {
        for (const mouth of partial) {
          lines.push(
            copy.awaySomeDays(
              String(mouth.name).trim(),
              renderDays(mouth.days.filter(Boolean), input.locale),
            ),
          );
        }
      }
      families.push("mouth_absent");
    }

    // ── ② LA BOUCHE DONT LE PLAN NE SAIT RIEN ─────────────────────────────
    //
    // ARMÉE PAR SA PRÉMISSE: `mouthsWithoutBody: []` ne produit RIEN.
    //
    // ⛔ ET C'EST LA SEULE PHRASE DU PRODUIT QUI NOMME UNE ABSENCE DE FAIT
    // CORPOREL. Elle est sûre pour une raison précise, écrite sur le champ:
    // l'appelant la calcule sur « aucun poids connu », et une bouche protégée
    // en a un. La phrase ne peut donc pas désigner quelqu'un qu'elle protège.
    const noBody = cleanNames(facts.mouthsWithoutBody);
    if (noBody.length > 0) {
      const rendered = joinList(noBody, input.locale);
      lines.push(
        noBody.length === 1 ? copy.noBodyOne(rendered) : copy.noBodyMany(rendered),
      );
      families.push("mouth_without_body");
    }

    // ── ③ LE COMPROMIS DE LA FORME DE CUISINE ─────────────────────────────
    //
    // TROIS PRÉMISSES, ET LES TROIS SONT ARMÉES:
    //   1. PLUS D'UNE BOUCHE — la condition du bloc englobant.
    //   2. LE PLAFOND A MORDU (`capped`) — c'est-à-dire que le calcul voulait
    //      un second plat et que le CHOIX l'a retenu. `unused` et le cas où les
    //      deux tombent d'accord ne sacrifient rien: il n'y a rien à nommer.
    //   3. LE RÉGIME EST CONNU DE LA COPIE — un slug que la copie ne sait pas
    //      nommer fait TAIRE la phrase plutôt qu'écrire « vegan » au milieu
    //      d'un texte français. Moins précis, jamais faux.
    //
    // ⚠️ C'EST LA SEULE PHRASE DU PRODUIT QUI RELIE LES DEUX. `shapeCapped*`
    // dit ce que le plafond a retenu, `sharedRegime` dit de qui le plat suit la
    // ligne; ni l'une ni l'autre ne dit que LE CHOIX a étendu cette ligne à
    // TOUTE LA TABLE. C'est très exactement le compromis, et il était muet.
    //
    // ⚠️ ET ELLE NE NOMME PERSONNE, exprès: le sacrifice est celui de la table,
    // la décision est celle de qui compose. Nommer ici la bouche la plus
    // restrictive ferait porter à une personne un choix qu'elle n'a pas fait.
    const shape = facts.cookingShapeChoice;
    const regime = facts.sharedDishRegime;
    if (shape !== null && shape.capped === true && regime !== null) {
      const label = regimeLabel(String(regime.regime ?? ""), input.locale);
      if (label) {
        lines.push(copy.simpleCookingRegime(label));
        families.push("simple_cooking_regime");
      }
    }

    // ══ ④ LA PHRASE FIXE — ⛔ L'INVERSE D'UNE PRÉMISSE ARMÉE ═══════════════
    //
    // ⛔⛔ NE LA « RÉPARE » PAS. Si tu es en train de te dire que cette phrase
    // sort trop souvent, et qu'il suffirait de la brancher sur le seul cas où
    // elle est « vraiment » utile — ARRÊTE-TOI ET RELIS CE BLOC. Ce serait la
    // casser, et la casse serait invisible.
    //
    // ── CE QU'ELLE PROTÈGE ────────────────────────────────────────────────
    // Quand une seule bouche est sous plancher, `householdLaneMode` fait passer
    // LA TABLE ENTIÈRE en `per_portion`: plus aucun dimensionnement au poids,
    // des directions de service qualitatives seulement. C'est l'arbitrage
    // d'INDISCERNABILITÉ, et il protège — le tronc que cette personne mange ne
    // peut pas être dimensionné sur les enveloppes de ses co-membres.
    //
    // Le plan est donc SERVI AUTREMENT, et jusqu'ici il ne le disait pas.
    //
    // ── POURQUOI L'ARMER « PROPREMENT » LA CASSERAIT ──────────────────────
    // Une phrase qui n'apparaîtrait QUE quand le verrou mord DÉSIGNERAIT la
    // personne qu'elle protège: il suffirait de la voir apparaître la semaine
    // où quelqu'un rejoint la table pour savoir. Sa valeur de garde tient
    // ENTIÈREMENT au fait qu'elle sort AUSSI dans des cas parfaitement anodins.
    //
    // ── LES QUATRE PORTES, ET POURQUOI LA PHRASE EST VRAIE DERRIÈRE CHACUNE ─
    //   d1. `laneMode === "per_portion"` — le cas protégé, ET le foyer dont
    //       aucune enveloppe n'est calculable. `householdLaneMode` mélange déjà
    //       ces deux populations par construction, exprès.
    //   d2. UNE BOUCHE SANS AUCUN FAIT CORPOREL — sa part est une part
    //       STANDARD, donc servie à l'assiette. Anodin, et fréquent.
    //   d3. LE PLAFOND DE FORME A MORDU — un seul plat pour tout le monde, donc
    //       des parts prises dans une casserole commune. Anodin.
    //   d4. LE TEMPS NE PERMET PAS UN SECOND PLAT — même conséquence, par une
    //       autre porte, et sans que personne n'ait rien déclaré. Anodin.
    //
    // ⛔ d3 ET d4 SONT LA MOITIÉ QUI COMPTE: ce sont les seules qui mordent
    // dans un foyer où TOUT LE MONDE a rempli sa fiche. Sans elles, la présence
    // de la phrase dans un tel foyer redeviendrait un signal. Les retirer
    // « parce qu'elles font doublon » désarme la garde.
    //
    // ⚠️ LE SEUIL DE TEMPS EST IMPORTÉ (`timeAllowsASecondDish`), jamais
    // recopié: une seconde comparaison écrite ici survivrait au déplacement du
    // seuil et ferait dire au plan l'inverse de ce qu'il a fait.
    //
    // ⚠️ ET LA PHRASE EST FIXE. Aucun prénom, aucun nombre, aucune branche de
    // pluriel: deux formulations différentes redeviendraient un signal à qui
    // les compare d'une semaine à l'autre.
    const noBodyGate = cleanNames(facts.mouthsWithoutBody).length > 0;
    const cappedGate = facts.cookingShapeChoice?.capped === true;
    const timeGate = facts.weeklyCookingMinutes !== null &&
      Number.isFinite(facts.weeklyCookingMinutes) &&
      !timeAllowsASecondDish(facts.weeklyCookingMinutes);
    if (
      facts.laneMode === "per_portion" || noBodyGate || cappedGate || timeGate
    ) {
      lines.push(copy.sharesAtThePlate);
      families.push("shares_at_the_plate");
    }
  }

  if (lines.length === 0) {
    // PAS DE REFUS NOMMÉ ICI, et c'est la différence avec le module frère: il
    // porte une ligne qui sort TOUJOURS, donc son silence est une anomalie.
    // Celui-ci n'a rien à dire quand rien n'a été sacrifié, et c'est le produit
    // qui fonctionne.
    return { lines: [], families: [], refusal: null };
  }

  // ── LA DERNIÈRE PORTE — L'ANTI-CULPABILISATION ──────────────────────────
  // Copie exacte de la porte finale de `explainPlanChoices`. Ces gabarits sont
  // fixes et testés: elle ne devrait jamais mordre. Quand ça arrive, ce n'est
  // pas une ligne à retirer, c'est un signal qu'on ne sait plus ce qu'on écrit.
  const guilt = findGuiltTripping(lines.join(" "));
  if (guilt.length > 0) {
    console.error("keel.plan_tradeoffs.guilt_tripping", {
      finding_count: guilt.length,
      matched: guilt.map((f) => f.matchedText).join(" | "),
      locale: input.locale,
    });
    return { lines: [], families: [], refusal: "guilt_tripping" };
  }

  return { lines, families, refusal: null };
}
