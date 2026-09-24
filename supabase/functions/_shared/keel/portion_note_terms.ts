// ═══════════════════════════════════════════════════════════════════════════
// LA BIFURCATION — LES LISTES DE MOTS D'UNE CONSIGNE DE PORTION
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `household_portions.ts` (découpage des gros
// fichiers, lot 2b). Aucune logique changée. `household_portions.ts` ré-exporte
// tout ce qui est exporté ici : les appelants continuent d'importer depuis lui.
// `sanitizePortionNote`, qui applique `FORBIDDEN_PORTION_TERMS`, reste dans
// `household_portions.ts`.
//
// Ce module n'importe que le moteur d'appariement (`forbidden_matcher.ts`).

import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";

/**
 * LA LISTE FERMÉE — ce qu'une consigne de service ne peut pas contenir.
 *
 * Les deux langues, parce que ce dépôt a déjà payé « garde testée dans une
 * seule langue »: une ceinture qui ne connaît que `weight` laisse passer
 * `poids`, et le produit sort en français par défaut (`profiles.locale`).
 *
 * ── CE QUE LE LOT 3B Y A AJOUTÉ, ET POURQUOI ──────────────────────────────
 * La liste couvrait le POIDS et l'OBJECTIF, parce que c'était tout ce que le
 * modèle avait de quoi dire. Depuis que le brief porte la TAILLE, la BANDE
 * D'ÂGE et le TOUR DE TAILLE de chaque bouche, il a de quoi en dire davantage —
 * et une ceinture armée sur ce qu'on lui donnait HIER est une ceinture désarmée.
 *
 * Vérifié plutôt que supposé: avant ce lot, « 1,5 part vu ta taille », « a
 * bigger share for your height » et « selon tes mesures » PASSAIENT tous les
 * trois, dans les deux langues.
 *
 * ── LA FRONTIÈRE, ET CE QUI RESTE DEHORS ──────────────────────────────────
 * On n'ajoute que du vocabulaire qui DÉSIGNE LE CORPS D'UNE PERSONNE. Les
 * unités nues (`kg`, `cm`) restent HORS liste, et c'est un arbitrage, pas un
 * oubli: « coupe les carottes en morceaux de 3 cm » est une consigne de service
 * parfaitement légitime, et une ceinture qui mord dessus met la personne en
 * part standard sans que personne comprenne pourquoi. « Une ceinture qui mord
 * sur tout se fait désarmer dans la semaine. »
 *
 * ⚠️ CONSÉQUENCE CONNUE ET NON REFERMÉE: un ÉCHO NUMÉRIQUE NU — « pour tes
 * 84 kg », « tu mesures 186 cm » — n'est mordu par personne. Le moteur apparie
 * des séquences de MOTS; il n'a aucun moyen d'exprimer « un nombre suivi d'une
 * unité, rattaché à une personne ». Le refermer demande soit une seconde
 * ceinture d'un autre genre (une expression régulière sur nombre+unité), soit
 * d'accepter les faux positifs des unités nues. C'est une décision de produit,
 * elle n'est pas prise ici.
 */
export const FORBIDDEN_PORTION_TERMS: readonly ForbiddenTerm[] = [
  {
    ruleId: "portion.body",
    token: "weight",
    surfaceForms: [
      "poids",
      "weight loss",
      "weight gain",
      "perte de poids",
      "prise de poids",
    ],
  },
  {
    ruleId: "portion.body",
    token: "maigrir",
    surfaceForms: [
      "mincir",
      "grossir",
      "slim down",
      "lose weight",
      "gain weight",
    ],
  },
  {
    ruleId: "portion.body",
    token: "silhouette",
    surfaceForms: ["body fat", "belly", "ventre", "masse grasse"],
  },
  {
    ruleId: "portion.goal",
    token: "calories",
    // `bmi` / `imc`: le brief dit maintenant en toutes lettres « no BMI », et
    // ce qui entre dans un prompt finit par en sortir. Un verdict sur un corps
    // n'a rien à faire dans une phrase lue à table.
    surfaceForms: [
      "calorie",
      "kcal",
      "calorie deficit",
      "deficit calorique",
      "bmi",
      "imc",
    ],
  },
  // ── LOT 3B — LA TAILLE ET LE TOUR DE TAILLE ─────────────────────────────
  // `taille` NUE reste hors liste: « une part de la taille d'une paume » est la
  // bonne façon d'écrire une portion, et c'est même celle que le brief
  // encourage. Ce sont les formes POSSESSIVES qui désignent le corps de
  // quelqu'un, et elles seules.
  {
    ruleId: "portion.body",
    token: "height",
    surfaceForms: [
      "ta taille",
      "ta hauteur",
      "votre taille",
      "sa taille",
      "your height",
      "his height",
      "her height",
      "how tall",
      "tour de taille",
      "waist",
    ],
  },
  // ── LOT 3B — LES MESURES, DÉSIGNÉES COMME TELLES ────────────────────────
  // Encore les formes possessives seulement: « prends deux mesures de riz » est
  // une consigne de cuisine, pas une fuite.
  {
    ruleId: "portion.body",
    token: "measurements",
    surfaceForms: [
      "tes mesures",
      "vos mesures",
      "ses mesures",
      "your measurements",
      "body measurements",
    ],
  },
  // ── LOT 3B — L'ÂGE ──────────────────────────────────────────────────────
  // La bande d'âge entre désormais dans le brief. Le jeton nu suffit et couvre
  // les deux langues d'un coup (`âge` se normalise en `age`); aucune consigne
  // de service n'a de raison légitime de nommer l'âge de quelqu'un.
  {
    ruleId: "portion.body",
    token: "age",
    surfaceForms: ["years old", "year old", "ans"],
  },
  {
    ruleId: "portion.goal",
    token: "cutting",
    surfaceForms: ["bulking", "seche", "prise de masse", "surplus"],
  },
  {
    ruleId: "portion.goal",
    token: "diet",
    surfaceForms: ["regime", "objectif", "goal"],
  },
  // ── D2 (QA du 2026-08-12) — LES SIX OBJECTIFS, PAR LEUR NOM ─────────────
  //
  // ⚠️ L'ASYMÉTRIE QUE CE BLOC FERME. L6 a réparé le 2026-08-12 la liste des
  // ENTRÉES (`FORBIDDEN_VOICE_TERMS`) et cette liste-ci — celle des SORTIES,
  // c'est-à-dire du texte LU À VOIX HAUTE À TABLE — a gardé le trou intact.
  // Mesuré sur `findForbiddenMatches`, `allowNegatedMentions: false`:
  //
  //     « a smaller starch share for fat loss »   PASSAIT
  //     « extra rice for muscle gain »            PASSAIT
  //     « recomposition »                         PASSAIT
  //     « perte de graisse »                      PASSAIT
  //     « prise de masse »                        mordait (`cutting`)
  //
  // La liste était armée sur le POIDS, le CORPS et les CALORIES, et pas une
  // seule fois sur les six valeurs de `MEMBER_GOALS` — c'est-à-dire sur ce que
  // le produit range dans la colonne que D4 interdit d'énoncer. Rien n'avait
  // fui (1 393 champs passés au crible, 0 morsure), mais parce que le modèle ne
  // les avait pas écrits, pas parce que la garde les aurait arrêtés.
  //
  // ── LES TOKENS SONT LES VALEURS DE `MEMBER_GOALS`, MOT POUR MOT ─────────
  // Pas par élégance: la trace devient alors le vocabulaire du produit
  // (`voice_line_withheld:<membre>:fat_loss`), et un test peut BOUCLER sur la
  // constante réelle plutôt que sur une liste recopiée à côté — un test
  // paramétré par sa propre copie reste vert quand on ajoute un septième
  // objectif.
  //
  // ── CE QUI RESTE DEHORS, ET CE QUE ÇA COÛTE ─────────────────────────────
  //   `fat` NU        « low-fat yogurt », « retire le gras du jambon » sont des
  //                   consignes de service ordinaires. Seul `fat loss` mord —
  //                   le jeton est une SÉQUENCE, pas un mot.
  //   `graisse` NU    « graisse de canard » est un ingrédient.
  //   `muscle` NU     un plat peut nommer un muscle (« blanc », « paleron »).
  //   `maintien` NU   « maintien au chaud » est de la cuisine. C'est
  //                   `maintien du poids` qui parle de quelqu'un.
  //
  // ⚠️ `health`/`sante` ET `performance` MORDENT NUS, ET ILS COÛTENT. Mesuré
  // sur le banc passant: « Il fait attention à sa santé » et « She is very
  // health conscious » sont désormais RETENUES à l'entrée (2 lignes sur 16).
  // C'est assumé dans ce sens-là — ce sont deux des six objectifs, ils se
  // rendent EXACTEMENT par ce mot dans les deux langues (`household.goal.health`
  // = « Health »), et une ceinture qui laisserait passer deux objectifs sur six
  // serait la même asymétrie qu'on ferme ici. Le prix d'une morsure est une
  // ligne non montrée au modèle (tracée), jamais un repas perdu.
  {
    ruleId: "portion.goal",
    token: "fat_loss",
    surfaceForms: [
      "losing fat",
      "lose fat",
      "perte de graisse",
      "perte de gras",
      "perdre de la graisse",
      "perdre du gras",
    ],
  },
  {
    ruleId: "portion.goal",
    token: "muscle_gain",
    surfaceForms: [
      "gaining muscle",
      "gain muscle",
      "building muscle",
      "build muscle",
      "muscle building",
      "prise de muscle",
      "prendre du muscle",
      "gain musculaire",
    ],
  },
  {
    ruleId: "portion.goal",
    token: "recomposition",
    // Le jeton couvre les deux langues d'un coup (« recomposition corporelle »,
    // « body recomposition »): il est le même mot des deux côtés.
    surfaceForms: ["recomp"],
  },
  { ruleId: "portion.goal", token: "performance" },
  { ruleId: "portion.goal", token: "health", surfaceForms: ["sante"] },
  {
    ruleId: "portion.goal",
    token: "maintenance",
    surfaceForms: ["maintien du poids", "maintenir son poids"],
  },
];

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 4 — LE VOCABULAIRE DU FLOU. UNE LISTE FERMÉE, DEUX LANGUES, ET ELLE NE
 * RETIRE RIEN.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE N'EST PAS `FORBIDDEN_PORTION_TERMS`, ET LES DEUX NE FONT PAS LE MÊME
 * MÉTIER. Celle-là porte des termes de CORPS et elle MORD: la note part à
 * `null`, parce qu'une phrase qui parle du poids de quelqu'un devant toute la
 * table est un dommage qu'on ne répare pas après coup. Celle-ci porte des termes
 * de QUANTITÉ et elle COMPTE: « une bonne portion de poulet » n'est pas
 * dangereux, c'est juste inutile — et le retirer laisserait la bouche sans
 * aucune consigne, ce qui est PIRE que la consigne floue. On mesure, et c'est la
 * mesure qui dira si la consigne resserrée du prompt a porté.
 *
 * ── LA FRONTIÈRE, ET CE QUI RESTE DEHORS ──────────────────────────────────
 * On n'ajoute que du vocabulaire qui remplace UN NOMBRE par une impression.
 *   `un peu` / `a little`   « un peu de sel » est une consigne de cuisine
 *                           parfaitement juste — le sel a droit à la pincée
 *                           dans le prompt depuis FF-038.
 *   `cuillere` / `spoonful` une cuillère EST une unité (`tbsp`/`tsp` sont dans
 *                           `COMPOSITION_UNITS`); mordre dessus punirait une
 *                           quantité vraie.
 *   `louche`                idem: une louche est un ustensile calibré, pas une
 *                           impression.
 * « Une ceinture qui mord sur tout se fait désarmer dans la semaine » — c'est
 * l'arbitrage écrit vingt lignes plus haut pour les unités nues, appliqué ici.
 *
 * ⚠️ AUCUN MATCHER MAISON. On réutilise `findForbiddenMatches`, qui porte déjà
 * les frontières de mot, la normalisation des accents et les pluriels. Écrire un
 * `includes()` ici ferait mordre « poignée » à l'intérieur d'un autre mot et
 * raterait « poignées » — c'est la douzième fois que ce dépôt l'écrit.
 */
export const VAGUE_PORTION_TERMS: readonly ForbiddenTerm[] = [
  {
    ruleId: "portion.vague",
    token: "handful",
    surfaceForms: ["poignee"],
  },
  {
    ruleId: "portion.vague",
    token: "generous portion",
    surfaceForms: [
      "generous helping",
      "generous serving",
      "generous share",
      "large portion",
      "grosse portion",
      "grosse part",
      "belle portion",
      "belle part",
      "grande portion",
    ],
  },
  {
    ruleId: "portion.vague",
    token: "as much as you like",
    surfaceForms: [
      "as much as they like",
      "as much as they want",
      "a volonte",
      "a discretion",
    ],
  },
  {
    ruleId: "portion.vague",
    token: "a good amount",
    surfaceForms: [
      "a good amount of",
      "plenty of",
      "une bonne quantite",
      "une bonne dose",
    ],
  },
];

/**
 * LES MOTIFS DE FLOU D'UNE CONSIGNE. `[]` = elle est chiffrée, ou muette.
 *
 * ⚠️ `allowNegatedMentions: false`, EXACTEMENT COMME `sanitizePortionNote`. « pas
 * une poignée mais 80 g » reste une phrase qui propose une poignée comme repère,
 * et la lecture absolue est celle qu'on veut ici comme là-bas.
 *
 * ⛔ ET ELLE NE REND PAS DE TEXTE, elle rend des motifs. Le texte, lui, sort
 * intact de cette fonction — c'est tout l'écart avec la ceinture du dessus, et
 * c'est ce qui rend le cas passant vérifiable: « Your box: 150 g of the chicken »
 * rend `[]` et sa phrase arrive telle quelle sur l'écran.
 */
export function vaguePortionMatches(raw: unknown): string[] {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return [];
  const matches = findForbiddenMatches(text, VAGUE_PORTION_TERMS, {
    allowNegatedMentions: false,
  });
  return [...new Set(matches.map((m) => m.token))].sort();
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA TAILLE DITE EN MOTS — le compteur de la contradiction, 2026-08-19.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QU'IL COMPTE, ET POURQUOI IL EXISTE. Quand le moteur possède le
 * grammage, tout mot de taille écrit par le modèle est un second avis sur le
 * même nombre — et il a été mesuré FAUX une fois sur deux: sur `cfd44e89`,
 * « Serve a larger share » à l'adulte de 47 kg qui reçoit 134 g (la plus petite
 * part de la table) et « the standard share » à l'ado de 70 kg qui en reçoit
 * 271 g (presque la plus grande). La phrase se contredit dans sa propre ligne,
 * et elle est lue à voix haute à table.
 *
 * ⛔ ON COMPTE, ON NE RÉÉCRIT PAS. Nuller la note ferait tomber avec elle la
 * moitié UTILE — « retirer les croûtes », « sauce piquante à part », « pas de
 * fenouil » — c'est-à-dire ce que le modèle est le seul à savoir. La ceinture
 * est le BRIEF (qui nomme le vocabulaire refusé); ceci est l'instrument qui dit
 * s'il a été suivi.
 *
 * ⛔ CE N'EST PAS UN MATCHER MAISON. Aucune forme devinée, aucun savoir sur les
 * aliments: une LISTE FERMÉE de tournures, passée au moteur du dépôt
 * (`findForbiddenMatches`), exactement comme `VAGUE_PORTION_TERMS` juste
 * au-dessus. `allowNegatedMentions: false`, même posture que
 * `sanitizePortionNote`: « pas une plus grosse part » parle quand même de la
 * taille de la part de quelqu'un.
 *
 * ⚠️ CE QU'IL NE COMPTE PAS, ET C'EST ASSUMÉ. Une comparaison écrite sans aucun
 * de ces mots (« Odalric gets the bowl, Wilfrid the small plate ») lui échappe.
 * C'est un PLANCHER de mesure, pas un verdict — le même statut que
 * `vague_portions` et `unquantified_dish_ingredients`.
 */
export const SIZE_WORD_TERMS: readonly ForbiddenTerm[] = [
  {
    ruleId: "portion.size_word",
    token: "larger share",
    surfaceForms: [
      "large share",
      "larger portion",
      "bigger share",
      "bigger portion",
      "big portion",
      "plus grande part",
      "plus grosse part",
      "part plus grande",
      "portion plus grande",
    ],
  },
  {
    ruleId: "portion.size_word",
    token: "smaller share",
    surfaceForms: [
      "small share",
      "smaller portion",
      "small portion",
      "reduced portion",
      "plus petite part",
      "part plus petite",
      "portion plus petite",
    ],
  },
  {
    ruleId: "portion.size_word",
    token: "standard share",
    surfaceForms: [
      "standard portion",
      "normal share",
      "normal portion",
      "usual share",
      "usual portion",
      "regular portion",
      "part standard",
      "portion standard",
      "portion normale",
      "part normale",
    ],
  },
  {
    ruleId: "portion.size_word",
    token: "child-size share",
    surfaceForms: [
      "child size share",
      "child-sized share",
      "child sized share",
      "child-size portion",
      "child-sized portion",
      "child portion",
      "kid-size portion",
      "part d'enfant",
      "portion d'enfant",
    ],
  },
  {
    ruleId: "portion.size_word",
    token: "same share as",
    surfaceForms: [
      "same portion as",
      "same share",
      "same amount as",
      "meme part que",
      "meme portion que",
    ],
  },
];

/**
 * LES TOURNURES DE TAILLE D'UNE CONSIGNE, dédupliquées et triées.
 * `[]` quand il n'y en a aucune — le cas voulu dès que le moteur pèse.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function sizeWordMatches(raw: unknown): string[] {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return [];
  const matches = findForbiddenMatches(text, SIZE_WORD_TERMS, {
    allowNegatedMentions: false,
  });
  return [...new Set(matches.map((m) => m.token))].sort();
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 4C ② — UN NOMBRE SUIVI D'UNE UNITÉ. LE SEUL FAIT VÉRIFIABLE ICI.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI CE COMPTEUR EXISTE, ET CE QU'IL RÉPARE. Le 2026-08-17,
 * `vague_portions` a rendu **0 flou sur 93 notes réelles** — et ce zéro était un
 * FEU VERT FAUX. Voici ce qu'il recouvrait, mot pour mot: « One standard table
 * portion. », « Balanced share of the shared dish. », « Child-size share of the
 * same dish. » ZÉRO note sur 93 portait un gramme. Un compteur qui affiche 0
 * pendant que 93 notes sur 93 sont sans chiffre est PIRE qu'absent: il dit « tout
 * va bien » à qui ouvre le tableau de bord.
 *
 * ⛔ ET CE N'EST PAS UNE LISTE DE MOTS PLUS LONGUE. Ajouter « standard portion »,
 * « balanced share », « child-size » à `VAGUE_PORTION_TERMS` ferait la ceinture
 * qui mord sur tout et qu'on désarme dans la semaine. Le manque est un COMPTEUR,
 * pas du vocabulaire — patron `unquantified_dish_ingredients`, qui constate un
 * champ et ne juge aucun mot.
 *
 * ⚠️ CE N'EST PAS UN MATCHER D'ALIMENT, et la distinction est celle qui compte:
 * cette expression ne connaît AUCUN nom d'aliment, ne décide d'aucun mot, et ne
 * peut donc pas confondre « laitue » et « lait ». Elle constate un CHIFFRE suivi
 * d'une UNITÉ — la forme exacte de `ENERGY_UNIT_RE` (`meal_generation.ts:2656`),
 * qui vit dans ce dépôt depuis FF-038 pour la même raison.
 *
 * ── CE QU'ELLE NE COMPTE PAS, ET C'EST ASSUMÉ ─────────────────────────────
 *   · « half a lemon », « deux tranches » — les DÉNOMBRABLES. Les reconnaître
 *     demanderait de savoir ce qui se compte à l'unité, c'est-à-dire un savoir
 *     sur les ALIMENTS. Conséquence: un plan honnête n'est jamais à 100 %, et ce
 *     nombre est un PLANCHER à surveiller, pas un verdict — exactement le statut
 *     de `unquantified_dish_ingredients`, qui ne fait aucune exception pour le
 *     sel.
 *   · « 3 cm » — `cm` n'est pas une unité de portion. « Coupe les carottes en
 *     morceaux de 3 cm » est une consigne de découpe, pas une part, et la
 *     compter comme chiffrée gonflerait le taux avec des phrases qui ne disent
 *     rien de combien on mange.
 *
 * Les symboles viennent de `COMPOSITION_UNITS` (`g`, `ml`, `tbsp`, `tsp`); les
 * formes écrites en toutes lettres s'y ajoutent parce que ce texte-ci est de la
 * PROSE lue à voix haute, pas un champ structuré. `unit` n'a pas de forme en
 * prose et n'y est donc pas.
 */
const PORTION_QUANTITY_RE =
  /\d[\d.,]*\s*(g|gr|grammes?|grams?|kg|ml|cl|tbsp|tablespoons?|tsp|teaspoons?)\b/i;

/** `true` quand la consigne porte au moins un nombre suivi d'une unité connue. */
export function portionCarriesAQuantity(raw: unknown): boolean {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return false;
  return PORTION_QUANTITY_RE.test(text);
}
