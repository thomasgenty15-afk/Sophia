/**
 * LOT ③ — LES JOURS DE TRADITION. Déterministe, pur, et volontairement étroit.
 *
 * Chantier: `scratchpad/2026-08-20-0200-DESIGN-habitudes-et-signaux.md`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE C'EST, ET LA RÈGLE PRODUIT QUI LE GOUVERNE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * « Le dimanche c'est rôti », « vendredi poisson ». Un fait PERMANENT du
 * FOYER, clavetté sur un jour de semaine et un moment.
 *
 * La règle qui gouverne les cinq lots de ce chantier:
 *
 *     Le produit ne change pas ce qu'on mange. Il fait gagner du temps sur la
 *     planification et la préparation, et rééquilibre à la marge.
 *
 * Casser un de ces jours fait fermer l'app — **pas parce que le plat est
 * mauvais, parce qu'il est déplacé**. C'est pour ça que ce lot passe avant
 * tous les autres, et qu'il ne calcule rien.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE QUE CE MODULE NE PORTE PAS, ET POURQUOI — « ON COMMANDE LE SAMEDI »
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le cadre citait trois exemples: « dimanche rôti », « vendredi poisson »,
 * **« samedi soir on commande »**. Le troisième N'EST PAS DANS CE MODULE, et
 * ce n'est pas un oubli: **il existe déjà**.
 *
 * `household_presence.ts` porte l'état `eating_out` depuis le 2026-08-18, et
 * il est claveté exactement pareil — un JOUR DE SEMAINE (`AwayDay.day` vaut
 * `mon`…`sun`, jamais une date) et des moments. « Samedi soir on commande »
 * s'écrit `{day: "sat", slots: ["dinner"], kind: "eating_out"}` sur
 * `away_days`, et le prompt porte déjà le bloc qui dit au modèle de ne rien
 * composer là (`eatingOutBlock`), avec ses gardes: ne pas grossir un autre
 * repas pour compenser, ne pas déplacer le repas, ne pas le mentionner.
 *
 * Construire ici une seconde façon de dire « ne compose pas cette case »
 * donnerait DEUX magasins qui décrivent le même fait, et c'est celui qu'on
 * regarde le moins qui garderait l'ancienne valeur. La règle du cadre
 * (« ne construis rien à côté ») s'applique à son propre exemple.
 *
 * ⚠️ LA LIMITE QUI RESTE, ET ELLE EST NOMMÉE: `away_days` est PAR BOUCHE. Un
 * foyer qui commande le samedi doit le marquer sur chaque bouche. C'est un
 * raccourci d'écran qui manque, pas un support qui manque — et le réparer
 * appartient à la présence, pas aux traditions.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ POURQUOI UN VERROU DÉTERMINISTE, ET CE QU'IL PEUT VRAIMENT FAIRE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * « Ce n'est PAS une préférence à glisser dans le prompt en espérant »: ce
 * dépôt a mesuré plusieurs fois qu'une consigne facultative est une consigne
 * que le modèle n'exécute pas. Le jumeau de ce module est
 * `household_restriction_lock.ts`, dont l'en-tête le dit en une phrase — *une
 * consigne de prompt régresse en réel*.
 *
 * MAIS les deux verrous ne peuvent pas la même chose, et il faut l'écrire:
 *
 *   · un verrou NÉGATIF (`applyHouseRuleLock`) peut RETIRER. Un plat qui sert
 *     du nutella part, et le foyer mange autre chose.
 *   · un verrou POSITIF ne peut pas AJOUTER. On ne fabrique pas un rôti
 *     déterministe — il faudrait inventer des ingrédients, des quantités, une
 *     méthode, c'est-à-dire composer, c'est-à-dire faire le travail du modèle.
 *
 * Ce module fait donc ce qu'un verrou positif PEUT faire, et rien de plus:
 * il OBSERVE la case, et il COMPTE. **Il ne retire pas le plat**, et c'est un
 * arbitrage, pas un renoncement: retirer un dîner parce qu'un matcher n'a pas
 * trouvé un mot est très exactement la cicatrice « 12 faux positifs sur 12 »
 * de ce dépôt, dans sa direction la plus chère.
 *
 * ⛔ ET IL N'OBSERVE PAS CE QU'IL CROYAIT — LA MESURE A RENOMMÉ SON VERDICT.
 * Voir `TRADITION_VERDICTS`: sur le premier run réel, « vendredi poisson » a
 * été honoré par un cabillaud, et le verrou a rendu « manqué ». La seule chose
 * qu'un matcher littéral sait dire est « les mots du foyer ne sont pas dans
 * cette case » — pas « la tradition a été cassée ». Un seul verdict est
 * matcher-free, donc affichable: `not_composed`, la case vide.
 *
 * ⚠️ CE QUE ÇA LAISSE OUVERT: rendre la vérification sémantique demanderait un
 * pont mot-de-catégorie → groupe d'aliments (« poisson » → `white_fish` +
 * `fatty_fish`). Le corpus porte la moitié du pont — `cabillaud` → `cod` →
 * `white_fish` — et pas l'autre: « poisson » n'a aucun alias, parce que ce
 * n'est pas un aliment. Construire cette moitié est un lot à part, et le
 * bâcler ici referait un matcher maison.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LE MATCHER N'EST PAS ÉCRIT ICI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `findForbiddenMatches` est LE matcher du dépôt, et « jamais de matcher
 * maison » est une cicatrice mesurée (« laitue » ≠ « lait », 12 faux positifs
 * sur 12). On l'appelle, on ne le recopie pas.
 *
 * ⚠️ ET LA NÉGATION EST LAISSÉE ACTIVE, CE QUI EST L'INVERSE DU VERROU DES
 * RÈGLES DE MAISON. Là-bas, on cherche si un aliment est MENTIONNÉ, donc
 * « sans nutella » doit compter. Ici, on cherche si le plat SERT vraiment du
 * poisson: « un gratin sans poisson » n'honore pas « vendredi poisson », et le
 * compter honoré serait rendre la garde muette sur le seul cas qui la teste.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  type EatingOccasion,
  EATING_OCCASIONS,
  dayProse,
  OCCASION_PROSE,
} from "./meal_generation.ts";
import { DAY_TOKENS, type DayToken } from "./tokens.ts";
import { findForbiddenMatches } from "./forbidden_matcher.ts";

/**
 * UNE TRADITION, telle que la ligne de foyer la porte.
 *
 * ⛔ `label` EST REQUIS ET NON VIDE. Une tradition sans mot ne dit rien à
 * personne: ni au modèle, qui ne saurait quoi composer, ni au vérificateur,
 * qui construirait un motif vide — et un motif vide matche tout, donc
 * honorerait n'importe quel plat. C'est la garde « un libellé vide ne devient
 * pas un terme de verrou », déjà écrite pour les règles de maison.
 */
export interface HouseholdTradition {
  /** `mon`…`sun`. Un JOUR DE SEMAINE, jamais une date: c'est permanent. */
  weekday: DayToken;
  slot: EatingOccasion;
  /** Les mots du foyer, tels quels. « rôti », « poisson », « pizza ». */
  label: string;
}

/**
 * LE PLAFOND — trois traditions, pas plus.
 *
 * ⚠️ CE N'EST PAS UNE BORNE TECHNIQUE, C'EST LA RÈGLE PRODUIT RENDUE
 * EXÉCUTABLE. « Deux ou trois cases, une seule fois » dit le cadre. Un foyer
 * qui en poserait dix aurait verrouillé sa semaine entière, et le produit ne
 * ferait plus rien pour lui — il rendrait son propre menu. La borne est en
 * base ET ici: un plafond d'écran n'est pas un plafond.
 */
export const MAX_TRADITIONS = 3;

/**
 * CE QU'UNE TRADITION DEVIENT APRÈS LA GÉNÉRATION.
 *
 * ⛔ QUATRE ÉTATS, ET LE DEUXIÈME A ÉTÉ RENOMMÉ PAR UNE MESURE — LIRE CECI
 * AVANT DE LE RE-RENOMMER.
 *
 * Il s'appelait `missed`, c'est-à-dire « la tradition a été cassée ». Premier
 * run réel avec « vendredi poisson » posé sur le foyer `5600347f`, le
 * 2026-08-20:
 *
 *     vendredi dîner  ->  « Cabillaud, pommes de terre et haricots verts »
 *     verdict rendu   ->  missed
 *
 * **Le modèle avait honoré la tradition.** Le vérificateur, lui, cherche le
 * mot « poisson » — et un cabillaud n'est pas écrit « poisson ». Le corpus
 * confirme qu'il n'y a pas de pont: `cabillaud` a un alias vers `cod`, dont le
 * groupe est `white_fish`; « poisson » n'a AUCUN alias, parce que c'est un mot
 * de CATÉGORIE, pas un aliment.
 *
 * Autrement dit, `missed` affirmait un fait que ce module ne peut pas
 * observer. Et il ne s'arrêtait pas là: il sortait dans les `issues`,
 * c'est-à-dire qu'il ANNONÇAIT au foyer que son vendredi avait été cassé
 * pendant que son poisson était dans l'assiette. Un compteur faux est un
 * compteur; un compteur faux qu'on affiche est un mensonge.
 *
 *   `honoured`                les mots DU FOYER se retrouvent dans la case
 *   `composed_without_label`  la case est composée, ces mots n'y sont pas.
 *                             ⛔ CE N'EST PAS « la tradition est cassée »:
 *                             c'est tout ce qu'un matcher littéral peut voir,
 *                             et le run ci-dessus prouve que la différence est
 *                             réelle. Un signal à REGARDER, jamais à afficher.
 *   `not_composed`            la case est VIDE. Le seul verdict sans matcher,
 *                             donc le seul qui puisse remonter à l'écran.
 *   `out_of_window`           ce jour n'est pas dans la fenêtre demandée. Il
 *                             n'y a rien à honorer, et le compter en échec
 *                             ferait rougir un plan de trois jours parce qu'il
 *                             ne contient pas dimanche.
 */
export const TRADITION_VERDICTS = [
  "honoured",
  "composed_without_label",
  "not_composed",
  "out_of_window",
] as const;
export type TraditionVerdict = (typeof TRADITION_VERDICTS)[number];

/** Ce qu'une tradition a rendu, sur ce plan-ci. */
export interface TraditionOutcome {
  weekday: DayToken;
  slot: EatingOccasion;
  verdict: TraditionVerdict;
}

/**
 * Lire les traditions d'une ligne de base. Ce qui n'est pas reconnu TOMBE.
 *
 * MÊME POSTURE QUE `parseAwayDays` ET `parseEatingRhythm`: une entrée illisible
 * fait tomber SON entrée et garde les autres. Une tradition illisible qui
 * emporterait les deux autres ferait composer par-dessus deux jours que le
 * foyer a verrouillés — c'est-à-dire le défaut exact que le lot corrige.
 *
 * ⚠️ ET LE PLAFOND EST APPLIQUÉ ICI AUSSI. La base le tient (un CHECK sur le
 * compte ne s'écrit pas simplement, donc c'est un trigger), mais une ligne
 * écrite avant le trigger, ou par un chemin de service, ne doit pas pouvoir
 * verrouiller la semaine entière en aval.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function parseTraditions(raw: unknown): HouseholdTradition[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: HouseholdTradition[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const weekday = String(row.weekday ?? "").trim().toLowerCase();
    const slot = String(row.slot ?? "").trim().toLowerCase();
    const label = String(row.label ?? "").trim();
    if (!(DAY_TOKENS as readonly string[]).includes(weekday)) continue;
    if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) continue;
    // ⛔ UN LIBELLÉ VIDE N'EST PAS UNE TRADITION. Voir `HouseholdTradition`.
    if (label === "") continue;
    const key = `${weekday} ${slot}`;
    // UNE SEULE TRADITION PAR CASE. Deux mots pour un même dîner
    // demanderaient au modèle deux plats sur une case qui n'en porte qu'un, et
    // le vérificateur en déclarerait un manqué quoi qu'il compose.
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ weekday: weekday as DayToken, slot: slot as EatingOccasion, label });
    if (out.length >= MAX_TRADITIONS) break;
  }
  return out;
}

/**
 * LE BLOC DE PROMPT — vide quand il n'y a aucune tradition.
 *
 * ⚠️ VIDE VEUT DIRE « LE PROMPT D'HIER, AU CARACTÈRE PRÈS ». C'est la
 * contre-épreuve du lot, et elle est tenue par un test: un foyer sans
 * tradition ne doit pas voir une ligne de plus dans son prompt, sinon « sans
 * tradition » et « avec tradition » ne sont plus comparables.
 *
 * ⚠️ IL NE PARLE QUE DES JOURS DE LA FENÊTRE. Demander un rôti dominical à un
 * plan qui va de jeudi à samedi ferait poser une contrainte impossible, et une
 * contrainte impossible apprend au modèle que les contraintes sont
 * facultatives.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function traditionBlock(
  traditions: readonly HouseholdTradition[],
  daysInWindow: readonly string[],
): { block: string; cells: number } {
  const inWindow = traditionsInWindow(traditions, daysInWindow);
  if (inWindow.length === 0) return { block: "", cells: 0 };
  const lines = inWindow.map((tr) =>
    `- ${dayProse(tr.weekday)} ${OCCASION_PROSE[tr.slot]}: ${tr.label}`
  );
  const block = [
    "== THE DAYS THIS HOUSEHOLD DOES NOT MOVE ==",
    "These meals are a standing habit here. They are not a preference and not",
    "a request for this week -- they are what this household already does, and",
    "has done for a long time:",
    ...lines,
    "Build THAT meal on THAT day, at THAT moment. Everything else in the plan",
    "is composed around it.",
    "You may cook it your way -- the cut, the sides, the seasoning are yours.",
    "What you may not do is put something else there, move it to another day,",
    "or leave that slot empty.",
    // ⛔ LA CONSIGNE DE SILENCE, ET ELLE A LE MÊME MOTIF QUE CELLE DE
    // `hunger_signal.ts` ET DU VERROU DES RÈGLES DE MAISON: le produit ne
    // commente pas une décision domestique comme si c'était la sienne.
    // « J'ai respecté votre traditionnel rôti du dimanche » fait porter à
    // Sophia un fait qui appartient au foyer.
    "Do NOT mention this habit -- not in a title, not in a method, not in a",
    "note. It is simply what happens here.",
  ].join("\n");
  return { block, cells: inWindow.length };
}

/**
 * LES TRADITIONS QUI TOMBENT DANS LA FENÊTRE DEMANDÉE.
 *
 * ⚠️ `daysInWindow` EST REQUIS, jamais un défaut à « toute la semaine ». Un
 * défaut ferait de la fenêtre entière la réponse silencieuse de tous les
 * appelants, et un plan de trois jours se verrait reprocher un dimanche qu'il
 * ne couvre pas.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function traditionsInWindow(
  traditions: readonly HouseholdTradition[],
  daysInWindow: readonly string[],
): HouseholdTradition[] {
  const days = new Set(daysInWindow);
  return traditions.filter((tr) => days.has(tr.weekday));
}

/** Un plat, réduit à ce que ce module regarde. */
export interface TraditionCheckableDish {
  day?: unknown;
  slot?: unknown;
  title?: unknown;
  method?: unknown;
  ingredients?: unknown;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * TOUT CE QUE LE PLAT DIT, EN UN SEUL TEXTE.
 *
 * ⚠️ LE TITRE ET LES INGRÉDIENTS COMPTENT TOUS LES DEUX, et il faut les deux.
 * « Rôti de porc » n'a pas besoin d'un ingrédient nommé « rôti » pour être un
 * rôti; « poisson » peut n'apparaître que sous « cabillaud » dans les
 * ingrédients et sous « gratin » dans le titre. Ne lire qu'un des deux
 * déclarerait manqué un plat parfaitement conforme.
 */
function dishText(dish: TraditionCheckableDish): string {
  const ingredients = Array.isArray(dish.ingredients)
    ? (dish.ingredients as unknown[])
      .map((i) =>
        i && typeof i === "object" ? textOf((i as Record<string, unknown>).term) : ""
      )
      .join(" ")
    : "";
  return [textOf(dish.title), textOf(dish.method), ingredients].join(" ");
}

/**
 * UNE CASE DE TRADITION EST-ELLE HONORÉE ?
 *
 * ⚠️ LA NÉGATION RESTE ACTIVE (`allowNegatedMentions` par défaut), donc « un
 * gratin sans poisson » n'honore PAS « vendredi poisson ». C'est l'inverse du
 * réglage du verrou des règles de maison, et l'en-tête dit pourquoi.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function traditionHonoured(
  tradition: HouseholdTradition,
  dish: TraditionCheckableDish,
): boolean {
  const label = tradition.label.trim();
  if (label === "") return false;
  return findForbiddenMatches(dishText(dish), [{
    ruleId: `tradition.${tradition.weekday}.${tradition.slot}`,
    token: label,
  }]).length > 0;
}

/**
 * LE VERDICT DE CHAQUE TRADITION SUR CE PLAN.
 *
 * ⛔ IL NE RETIRE RIEN, ET NE RÉÉCRIT RIEN. Voir l'en-tête: un verrou positif
 * ne peut pas fabriquer le plat qui manque, et retirer celui qui est là sur la
 * foi d'un matcher est la faute que ce dépôt a déjà payée douze fois sur
 * douze. Ce qu'il rend est une MESURE, destinée à `generated_from` et aux
 * `issues` — c'est-à-dire un manquement qu'on peut voir, au lieu d'une
 * promesse qu'on croit tenue.
 *
 * ⚠️ TOUTES LES TRADITIONS SONT RENDUES, y compris `out_of_window`. Un compteur
 * qui ne nommerait que les échecs ne distingue pas « la case a été honorée » de
 * « la case n'existait pas », et c'est le zéro ambigu que ce chantier paie en
 * boucle.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function traditionOutcomes(
  traditions: readonly HouseholdTradition[],
  daysInWindow: readonly string[],
  dishes: readonly TraditionCheckableDish[],
): TraditionOutcome[] {
  const days = new Set(daysInWindow);
  return traditions.map((tr) => {
    if (!days.has(tr.weekday)) {
      return { weekday: tr.weekday, slot: tr.slot, verdict: "out_of_window" as const };
    }
    const inCell = dishes.filter((d) =>
      String(d.day ?? "") === tr.weekday && String(d.slot ?? "") === tr.slot
    );
    if (inCell.length === 0) {
      return { weekday: tr.weekday, slot: tr.slot, verdict: "not_composed" as const };
    }
    // ⚠️ UN SEUL PLAT SUFFIT. Une case peut porter deux plats (un plat dédié à
    // une bouche, par exemple); la tradition est honorée dès que l'un d'eux la
    // porte. Exiger que TOUS la portent ferait déclarer manqué un dimanche où
    // le rôti est là ET où l'enfant a son plat à part.
    const honoured = inCell.some((d) => traditionHonoured(tr, d));
    return {
      weekday: tr.weekday,
      slot: tr.slot,
      verdict: honoured
        ? ("honoured" as const)
        // ⛔ PAS « missed ». Voir `TRADITION_VERDICTS`: ce module ne sait pas
        // qu'un cabillaud est un poisson, et l'affirmer a déjà été mesuré faux.
        : ("composed_without_label" as const),
    };
  });
}

/**
 * L'HISTOGRAMME DES VERDICTS, pour `generated_from` et pour le journal.
 *
 * ⛔ AUCUN LIBELLÉ, AUCUN JOUR. « Le foyer n'a pas eu son rôti dominical » dans
 * une colonne lisible par toute la maison serait un reproche adressé à
 * quelqu'un. C'est un histogramme, comme ses voisins `anchor` et `share`.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function traditionCounts(
  outcomes: readonly TraditionOutcome[],
): Record<TraditionVerdict, number> {
  const counts = {} as Record<TraditionVerdict, number>;
  for (const verdict of TRADITION_VERDICTS) counts[verdict] = 0;
  for (const outcome of outcomes) counts[outcome.verdict] += 1;
  return counts;
}
