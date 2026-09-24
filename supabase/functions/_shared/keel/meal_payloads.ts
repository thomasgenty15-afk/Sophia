// ═══════════════════════════════════════════════════════════════════════════
// REPAS GÉNÉRÉS — LE PLAN MIS EN FORME POUR LA BASE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `meal_generation.ts` (découpage des gros
// fichiers, lot 2d-1). Aucune logique changée, aucun octet de prompt changé.
// `meal_generation.ts` ré-exporte tout ce qui y était exporté : les appelants
// continuent d'importer depuis lui.
//
// Ce qui est ici : `outputContractLinesOf` (toutes les lignes du plan, à plat
// et situées) et les quatre mises en forme écrites en base
// (`mealDishesPayload`, `mealPreparationsPayload`, `mealSessionsPayload`,
// `mealShoppingPayload`), avec leurs deux aides privées (`ingredientPayload`,
// `componentPayload`).

import type {
  OutputContractLine,
  OutputContractSite,
} from "./composition_contract.ts";
import { ingredientGroupPayload } from "./food_group_write.ts";
import { quantitySourcePayload } from "./quantity_from_prose.ts";
import type {
  DishIngredient,
  GeneratedMeal,
  MealComponent,
} from "./meal_types.ts";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-12 · ÉTAPE C1 — TOUTES LES LIGNES DU PLAN, À PLAT ET SITUÉES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LES PRÉPARATIONS EN FONT PARTIE, ET C'EST LA MOITIÉ QUI COMPTE. Sur la
 * lane du foyer, l'essentiel de la masse vit dans les préparations: n'examiner
 * que les plats rendrait un contrat de sortie vert au-dessus d'une casserole
 * que personne ne sait peser. C'est la même règle que `refTally`, dont
 * l'en-tête écrit déjà « le dénominateur est celui des identifiants, pas
 * `ingredientCount` ».
 *
 * ⚠️ UNE PRÉPARATION N'A NI JOUR NI MOMENT, et on ne lui en invente pas. Elle
 * porte son `preparationId`; le plat porte son jour, son moment et son titre.
 * Les fondre ferait dire « samedi midi » d'une casserole servie trois fois.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function outputContractLinesOf(
  meal: Pick<GeneratedMeal, "dishes" | "preparations">,
): OutputContractLine[] {
  const out: OutputContractLine[] = [];
  const push = (site: OutputContractSite, ing: DishIngredient) => {
    const term = String(ing?.term ?? "").trim();
    if (term === "") return;
    out.push({
      site,
      term,
      ref: ing.ref ?? null,
      refRefused: ing.refRefused === true,
      amount: ing.amount ?? null,
      unit: ing.unit ?? null,
    });
  };
  for (const dish of meal.dishes ?? []) {
    const site: OutputContractSite = {
      day: dish.day ?? null,
      slot: dish.slot ?? null,
      dish: String(dish.title ?? "").trim() || null,
      preparationId: null,
    };
    for (const ing of dish.ingredients ?? []) push(site, ing);
  }
  for (const prep of meal.preparations ?? []) {
    const site: OutputContractSite = {
      day: null,
      slot: null,
      dish: String(prep.title ?? "").trim() || null,
      preparationId: String(prep.id ?? "").trim() || null,
    };
    for (const ing of prep.ingredients ?? []) push(site, ing);
  }
  return out;
}

/**
 * Un ingrédient, en base. R1: clés ASCII, snake_case.
 *
 * ── LES QUATRE CHAMPS DE FF-038 SONT PERSISTÉS ────────────────────────────
 * Écrire les grammes recalculés plutôt que de les refaire à chaque lecture est
 * ce qui rend un plan RELISIBLE: le verdict de FF-039 et tout rejeu ultérieur
 * lisent la même valeur que celle qui a été calculée le jour de la
 * composition, avec le référentiel de ce jour-là. Recalculer à la lecture
 * ferait bouger l'histoire d'un plan à chaque curation d'alias.
 *
 * Aucun de ces champs n'est AFFICHÉ. Ce sont des grammes d'ALIMENT, du même
 * côté de la frontière que « 400 g de cuisses de poulet » — mais l'écran
 * continue de lire `quantity`, la prose.
 */
function ingredientPayload(i: DishIngredient): Record<string, unknown> {
  return {
    term: i.term,
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT C · L'IDENTIFIANT DE RÉFÉRENCE — 2026-09-11
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ ÉCRIT MÊME À `null`, comme `group` et `quantity_source`, et pour la
    // même raison: une clé absente ne se distingue pas d'un lot débranché. La
    // conséquence à connaître avant de mesurer est la même aussi —
    // `ing ? 'ref'` devient vrai partout, et la seule mesure qui dise quelque
    // chose est `ing->>'ref' is not null`.
    //
    // ⛔ IL EST DANS `MEAL_TOKEN_FIELDS`, PAS DANS LES CHAMPS TRADUISIBLES. Le
    // slug est anglais et ne paraît sur aucun écran; c'est `term` que l'élève
    // lit. Le traduire le détacherait de la table qui le pèse — le piège de
    // `preparations[].id`, mot pour mot.
    ref: i.ref,
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT A · LE REFUS SURVIT À L'ÉCRITURE — 2026-09-11
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ SANS CETTE CLÉ, UN REFUS NE DURAIT QUE LE TEMPS D'UNE GÉNÉRATION.
    // `readRefSlug` ne rend JAMAIS un slug refusé: `ref` part donc à `null`
    // pour « le modèle n'a rien écrit » ET pour « il a écrit un identifiant
    // inventé ». Relu depuis la base, le second redevenait le premier, et la
    // ligne repassait par le terme libre — c'est-à-dire par le rapprochement
    // approximatif que le chantier interdit. Le plan l'écrit: « une ligne
    // refusée ne redevient pas valide parce que sa référence a disparu à la
    // sérialisation ».
    //
    // ⚠️ ÉCRITE MÊME À `false`, comme `group` et `quantity_source`. Conséquence
    // à connaître avant de mesurer: `ing ? 'ref_refused'` devient vrai partout,
    // et la seule mesure qui dise quelque chose est
    // `(ing->>'ref_refused')::boolean`.
    ref_refused: i.refRefused,
    quantity: i.quantity,
    in_pantry: i.in_pantry,
    amount: i.amount,
    unit: i.unit,
    state: i.state,
    grams_raw: i.gramsRaw,
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT `L17-0` · LE GROUPE DÉCLARÉ PAR LE MODÈLE — 2026-08-22
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ CETTE FONCTION RECOPIAIT SEPT CLÉS EN DUR, ET `group` N'EN ÉTAIT PAS.
    // Le parseur posait le champ (`DishIngredient.group`), la ceinture le
    // comptait (`regime_belt.groups_declared`), et la recopie vers le payload
    // le jetait: **242 groupes déclarés par le modèle sur les 3 plans générés
    // sous v16+, 0 en base.** Le plan de chantier a lu ce zéro comme « le
    // modèle n'obéit pas » pendant deux jours.
    //
    // ⚠️ ÉCRITE MÊME À `null`, comme `dishes[].name` et `dishes[].boxes` — une
    // clé absente ne se distingue pas d'un lot débranché. Conséquence à
    // connaître avant de mesurer: `ing ? 'group'` devient vrai partout, et la
    // seule mesure qui dise quelque chose est `ing->>'group' is not null`.
    //
    // ⚠️ `group` ET PAS `food_group`: le voisin `shopping_list[].food_group`
    // est RÉSOLU depuis le référentiel, celui-ci est DÉCLARÉ par le modèle.
    // Deux provenances, deux noms. Détail dans `food_group_write.ts`.
    ...ingredientGroupPayload(i.group),
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT `L-1-b` · D'OÙ VENAIT LA QUANTITÉ — 2026-08-22
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ `amount` ET `unit` CI-DESSUS RESTENT LA DÉCLARATION DU MODÈLE, et ce
    // n'est pas un oubli: la mesure SQL qui a ouvert ce lot — « 3 850 lignes à
    // `amount is null`, dont 3 833 avec une prose non vide » — doit rester
    // reproductible pour toujours. Y écrire ce qu'on vient de LIRE dissoudrait
    // la mesure d'obéissance à FF-038 dans la mesure de lecture.
    //
    // ⚠️ ÉCRITE MÊME À `null`, comme `group` et `dishes[].name`: une clé absente
    // ne se distingue pas d'un lot débranché. Conséquence à connaître avant de
    // mesurer — `ing ? 'quantity_source'` devient vrai partout, et la seule
    // mesure qui dise quelque chose est `ing->>'quantity_source' = 'prose'`.
    ...quantitySourcePayload(i.quantitySource),
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT D · LE COMPOSANT CULINAIRE — 2026-09-11
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ ÉCRIT MÊME À `null`, comme `ref`, `group` et `quantity_source`: une
    // clé absente ne se distingue pas d'un lot débranché. Il DOIT survivre à
    // l'écriture, sinon un brouillon relu (`draft_adopt`) rejouerait
    // l'ajustement sans structure — c'est-à-dire retomberait exactement sur la
    // politique que ce lot retire. La seule mesure SQL qui dise quelque chose
    // est `ing->>'part' is not null`.
    part: i.part,
  };
}

/** Le payload `dishes` écrit en base. R1: clés ASCII. */
export function mealDishesPayload(meal: GeneratedMeal): Array<Record<string, unknown>> {
  return meal.dishes.map((d) => ({
    // ── L7 ③ · LE NOM D'USAGE, ÉCRIT MÊME À `null` ────────────────────────
    //
    // ⚠️ QUATRIÈME FOIS DANS CE PAYLOAD, ET TOUJOURS POUR LA MÊME RAISON: une
    // clé absente ne se distingue pas d'un lot débranché. `null` DIT « ce plat
    // n'a pas de nom d'usage, montre son titre » — ce que TOUS les plats
    // étaient avant ce lot, et ce que reste un plan dont le modèle a ignoré la
    // consigne. Un `dishes[].name` toujours écrit rend le taux comptable en SQL
    // sur les DEUX lanes, sans dépendre de `generated_from`.
    //
    // ⚠️ AUCUNE MIGRATION: `dishes` est une colonne `jsonb`, et les plans écrits
    // avant ce lot n'ont simplement pas la clé. Les lecteurs traitent son
    // absence comme `null`, c'est-à-dire « affiche le titre ».
    name: d.name,
    title: d.title,
    slot: d.slot,
    day: d.day,
    ingredients: d.ingredients.map(ingredientPayload),
    method: d.method,
    why: d.why,
    honours_belief_keys: d.honours_belief_keys,
    uses: d.uses.map((u) => ({
      preparation_id: u.preparationId,
      servings: u.servings,
      // ⚠️ ÉCRIT MÊME QUAND IL VAUT `"fridge"`, comme `boxes: []` trois clés
      // plus bas et pour la même raison: une clé absente ne se distingue pas
      // d'un lot débranché. `"fridge"` DIT « cette part a attendu au frigo ».
      //
      // Et c'est ce que l'écran lit pour poser « à sortir la veille »: sans la
      // clé en base, la garde passerait et la cuisine ne suivrait pas.
      kept: u.kept,
    })),
    // ── LES CONTENANTS DU REPAS, ÉCRITS MÊME VIDES ───────────────────────
    //
    // ⚠️ TROISIÈME FOIS DANS CE PAYLOAD, ET TOUJOURS POUR LA MÊME RAISON: une
    // clé absente ne se distingue pas d'un lot débranché. `[]` DIT « rien n'a
    // été pesé d'avance pour ce repas » — ce que reste une lane individuelle et
    // tout plat cuisiné de zéro, et c'est exactement ce que `box_counts` rend
    // comptable en SQL.
    //
    // ⚠️ AUCUNE MIGRATION: `dishes` est une colonne `jsonb`. Les plans écrits
    // avant le 2026-08-20 portent `box` au singulier, et le lecteur du front lit
    // les DEUX formes — un plan déjà en base garde ses grammes et ses noms.
    // Ceux d'avant le 08-19 n'ont ni l'une ni l'autre (leurs boîtes vivaient
    // sous `preparations[].boxes`): l'écran se tait plutôt que de montrer une
    // boîte au mauvais repas, ce qui serait le seul repli dangereux.
    //
    // ⚠️ `legacy_total_grams` SORT AUSSI, ET IL EST PRESQUE TOUJOURS `null`. Il
    // ne se remplit que sur un contenant reconstruit depuis un `box` v2: la
    // somme des parts, qui est bien une quantité de bac. Sur v4, le total se
    // dérive des `items` — deux nombres qui doivent s'accorder finissent par
    // diverger.
    boxes: d.boxes.map((box) => ({
      id: box.id,
      member_ids: [...box.memberIds],
      items: box.items.map((it) => ({
        preparation_id: it.preparationId,
        term: it.term,
        grams: it.grams,
        // ⟳ LOT A (2026-09-11) — L'IDENTITÉ SURVIT À L'ÉCRITURE, sinon elle
        // n'a servi qu'à l'intérieur d'une fonction. Écrites MÊME À
        // `null`/`false`, comme `group` et `quantity_source`: une clé absente
        // ne se distingue pas d'un lot débranché.
        ref: it.ref,
        ref_refused: it.refRefused,
        // ⟳ 2026-09-22 — LE VOLUME SURVIT À L'ÉCRITURE, sinon il n'aurait servi
        // qu'à l'intérieur d'une fonction — le défaut exact que `ref` a payé au
        // LOT A. Écrit MÊME À `null`: une clé absente ne se distingue pas d'un
        // lot débranché.
        ml: it.ml,
      })),
      legacy_total_grams: box.legacyTotalGrams,
    })),
    // LOT C — L'ATTRIBUTION, ÉCRITE MÊME À `null`.
    //
    // ⚠️ ÉCRITE TOUJOURS, exprès: une clé absente ne se distingue pas d'un lot
    // débranché, et ce dépôt paie en boucle la garde construite puis
    // silencieusement débranchée. `null` DIT « le plat de la table », ce qui est
    // le cas nominal et une affirmation — pas une ignorance.
    //
    // ⚠️ AUCUNE MIGRATION: `dishes` est une colonne `jsonb`, et les plans écrits
    // avant ce lot n'ont simplement pas la clé. Les lecteurs traitent son
    // absence comme `null`, c'est-à-dire comme le plat de la table — ce que ces
    // plans-là étaient déjà pour tout le monde.
    member_id: d.memberId,
    // ⟳ 2026-09-09 — LE COMPLÉMENT, ÉCRIT MÊME À `false`, même posture: le
    // front lit `true` pour garder le plat de la table dans la case de cette
    // personne au lieu de le cacher derrière son plat à elle.
    complements_shared: d.complementsShared === true,
    // ── LOT 2 · LE GESTE DU JOUR J, ÉCRIT MÊME À `null` ──────────────────
    //
    // ⚠️ MÊME POSTURE QUE `member_id` JUSTE AU-DESSUS, ET POUR LA MÊME RAISON:
    // une clé absente ne se distingue pas d'un lot débranché. `null` DIT « le
    // modèle n'a rien déclaré pour ce plat », ce qui est une information — et
    // c'est celle que le compteur `same_day` rend comptable en SQL.
    //
    // ⚠️ AUCUNE MIGRATION: `dishes` est une colonne `jsonb`, et les plans écrits
    // avant ce lot n'ont simplement pas la clé. Le lecteur du front traite son
    // absence comme `null`, c'est-à-dire « aucun bandeau » — ce que ces plans-là
    // étaient déjà.
    same_day: d.sameDay === null ? null : {
      kind: d.sameDay.kind,
      minutes: d.sameDay.minutes,
    },
    // ⟳ LOT D — LA STRUCTURE DE CUISSON, ÉCRITE MÊME VIDE. `[]` DIT « ce plat
    // n'a pas déclaré de composants », ce qu'est tout plan antérieur au
    // contrat; une clé absente ne le dirait pas.
    components: d.components.map(componentPayload),
  }));
}

/** ⟳ LOT D — un composant culinaire en base. R1: clés ASCII, `part_of` en serpent. */
function componentPayload(c: MealComponent): Record<string, unknown> {
  return { id: c.id, role: c.role, part_of: c.partOf };
}

export function mealPreparationsPayload(
  meal: GeneratedMeal,
): Array<Record<string, unknown>> {
  return meal.preparations.map((p) => ({
    id: p.id,
    title: p.title,
    servings_made: p.servingsMade,
    ingredients: p.ingredients.map(ingredientPayload),
    method: p.method,
    active_minutes: p.activeMinutes,
    total_minutes: p.totalMinutes,
    cook_on: p.cookOn,
    // ⟳ LOT D — voir `mealDishesPayload`: écrite même vide.
    components: p.components.map(componentPayload),
  }));
}

export function mealSessionsPayload(
  meal: GeneratedMeal,
): Array<Record<string, unknown>> {
  return meal.cooking_sessions.map((session) => ({
    day: session.day,
    preparation_ids: session.preparationIds,
    run_through: session.runThrough,
    total_minutes: session.totalMinutes,
  }));
}

export function mealShoppingPayload(meal: GeneratedMeal): Array<Record<string, unknown>> {
  return meal.shopping_list.map((s) => ({
    term: s.term,
    quantity: s.quantity,
    aisle: s.aisle,
    // ⟳ LOT `L0-a` — LE GROUPE PART AVEC LA LIGNE, et c'est ce qui rend la
    // fenêtre crue lisible par l'écran, le PDF du frigo et la liste
    // partageable sans compte. Aucune de ces surfaces n'a le référentiel; le
    // résoudre chez chacune serait le jumeau que `grocery_waves.ts` a tué.
    food_group: s.food_group,
    // ══════════════════════════════════════════════════════════════════════
    // LA DATE D'ACHAT PART AVEC LA LIGNE — 2026-09-01
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE DÉFAUT QU'ELLE FERME, MESURÉ SUR 10 PLANS LE 2026-08-23 ET
    // RAPPORTÉ PAR L'UTILISATEUR LE 2026-09-01: `shopping_list[]` ne portait
    // NI jour NI date. Le calcul des vagues existait, il était juste, et il
    // tournait UNIQUEMENT dans un panneau d'écran replié — donc la question
    // « quand j'achète ça ? » n'avait aucune réponse dans le produit, et la
    // personne achetait tout le premier jour. C'est comme ça qu'un poulet
    // acheté lundi finit cuisiné samedi.
    //
    // ⚠️ ELLE EST CALCULÉE PAR `grocery_waves.ts`, JAMAIS ICI. Ce champ est le
    // TRANSPORT d'une décision prise ailleurs; une seconde arithmétique de la
    // date à cet endroit serait le jumeau que ce module a déjà tué une fois.
    //
    // `null` sur un plan dont la fenêtre est inconnue, ou dont l'article n'a
    // pas pu être routé: l'écran retombe alors sur la liste plate d'avant.
    buy_on: s.buy_on ?? null,
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT C (2026-09-04) — LE GESTE PART AVEC LA LIGNE, LUI AUSSI
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ ET IL A ÉTÉ OUBLIÉ ICI PENDANT UN TIR ENTIER. La lane calculait la
    // marque, le compteur la disait (`freeze_on_purchase: 1/30` dans les
    // `issues`), et cette projection ne la recopiait pas: la charge rendue
    // portait TRENTE lignes sans le champ. C'est très exactement la cicatrice
    // du bloc au-dessus, rejouée trois jours après — un lecteur qui laisse
    // tomber un champ le fait en SILENCE.
    //
    // ⚠️ LE COMPTEUR EST CE QUI L'A RÉVÉLÉ. Sans ce `1/30` dans les issues, un
    // champ absent et « rien à congeler » rendaient exactement la même charge.
    //
    // `false` et jamais absent: la clé manquante et « rien à congeler » se
    // liraient pareil à l'écran, et c'est l'unique geste que la personne doit
    // exécuter en rentrant du magasin.
    freeze_on_purchase: s.freeze_on_purchase === true,
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-12 · ÉTAPE C3 — L'IDENTITÉ ET LA QUANTITÉ STRUCTURÉE
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LA DEMANDE EST RESTÉE OUVERTE DEUX CHANTIERS (`NON-BRANCHE.md` ⑥), ET
    // CE QU'ELLE COÛTAIT EST CHIFFRÉ: sans `ref` ni `amount`/`unit` sur la
    // ligne, **26 identités sur 26 de GAIN restaient incontrôlables en
    // quantité** — l'audit rendait « incomplet », honnêtement, mais il ne
    // contrôlait rien. Le test de relecture du lot F l'épinglait même
    // explicitement: « `shopping_list[]` n'a ni `amount`, ni `unit`, ni `ref` ».
    //
    // ⛔ ÉCRITS TOUJOURS, `null` PLUTÔT QU'ABSENTS. Même règle que
    // `freeze_on_purchase` juste au-dessus: une clé manquante et une valeur
    // inconnue se liraient pareil, et le lecteur choisirait pour nous.
    //
    // ⚠️ LE TEXTE EST DÉRIVÉ DE CES CHAMPS. `quantity` reste projeté (les plans
    // écrits avant ce lot n'ont que lui), mais le contrôle quantitatif de
    // `final_plan_audit.ts` lit `amount`/`unit` d'abord — il ne dépend plus de
    // la réinterprétation d'une phrase.
    ref: s.ref ?? null,
    amount: s.amount ?? null,
    unit: s.unit ?? null,
    state: s.state ?? null,
    // ⛔ `!== false` ET PAS `=== true`: une ligne d'archive qui ne porte pas le
    // champ est ACHETABLE, comme elle l'a toujours été. Seule une décision
    // explicite la sort du panier.
    purchasable: s.purchasable !== false,
  }));
}
