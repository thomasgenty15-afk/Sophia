import type {
  DayEnergyView,
  DishEnergyView,
  EnergyTargetView,
} from "../../api/mealEnergy";
import { dayEnergySubjectClause } from "../../api/mealEnergy";
import { mealCopy } from "../../api/mealLabels";
import { uiLocale } from "../../i18n/runtime";

// FF-059 — LE CHIFFRE, RENDU UNE SEULE FOIS.
//
// Fiche: docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md
//
// ── POURQUOI UN COMPOSANT, POUR UN NOMBRE ET UNE UNITÉ ─────────────────────
// Parce que ce nombre doit s'afficher à trois endroits — la carte d'un plat sur
// `/app/plan`, la même carte sur `/app/today`, l'en-tête d'un jour — et parce
// que la règle qui l'accompagne n'est pas « affiche-le »: c'est « ne l'affiche
// que s'il est complet, et dis avec lui ce qu'il ne compte pas ». Trois copies
// de cette règle, c'est trois occasions d'en garder une qui affiche un total
// partiel comme s'il était le total.
//
// ── CE COMPOSANT NE DÉCIDE JAMAIS DU DROIT DE VOIR ─────────────────────────
// Il rend ce qu'on lui donne. Quand une porte est fermée, l'appelant n'a
// AUCUNE donnée à lui passer — la réponse du serveur n'en contient pas. C'est
// ce qui rend la garde tenable côté client sans une seule condition ici: on ne
// peut pas afficher par erreur ce qui n'a pas voyagé.
//
// ── AUCUNE PROSE, AUCUNE PHRASE COMPOSÉE AUTOUR DU NOMBRE ──────────────────
// Le chiffre sort d'un champ typé et entre dans un `<span>`. Il ne traverse
// jamais un texte libre, jamais un `rationale`, jamais une réponse d'agent. R4
// tient parce que ce chemin-ci est le seul, et qu'il est court.

/**
 * Le chiffre d'UN plat. `null` quand il n'y en a pas — et alors on DIT
 * pourquoi.
 *
 * ⚠️ Un plat muet à côté de plats chiffrés se lit « celui-ci ne compte pas ».
 * Le motif nommé est ce qui empêche cette lecture, et c'est aussi ce qui rend
 * l'abstention utile: « un ingrédient n'est pas dans notre table » est une
 * information sur le PRODUIT, pas un reproche à l'assiette.
 */
export function DishEnergyLine({ energy }: { energy: DishEnergyView | null }) {
  if (!energy) return null;
  if (energy.kcal !== null && energy.complete) {
    return (
      <span className="text-sm tabular-nums text-ink-soft">
        {mealCopy("meals.energy.dish").replace("{n}", String(energy.kcal))}
      </span>
    );
  }
  const gap = energy.gaps[0];
  const label = gap === "unknown_ingredient"
    ? mealCopy("meals.energy.dish_unknown_ingredient")
    : gap === "missing_quantity"
    ? mealCopy("meals.energy.dish_missing_quantity")
    // `no_ingredients` ne se dit pas: un plat sans ingrédient lisible n'a rien
    // à expliquer à l'élève, et le nommer commenterait un défaut de génération
    // sur sa carte.
    : null;
  if (!label) return null;
  return <span className="text-xs text-ink-soft">{label}</span>;
}

/**
 * Le total d'un JOUR, et l'aveu de ce qu'il ne compte pas.
 *
 * ⚠️ LE CAS PARTIEL PORTE SES DEUX NOMBRES, jamais le seul mot « incomplet ».
 * « 1 200 kcal (incomplet) » se lit « 1 200 kcal »; « 1 200 kcal — 2 des 3
 * plats comptés » se lit correctement. C'est très exactement le rabbit hole
 * n°3 de la fiche, et il ne se commet pas dans le calcul: il se commet ici.
 *
 * ── ② · ET IL PORTE MAINTENANT SON SUJET ──────────────────────────────────
 * DEUX incomplétudes se croisent sur cette ligne, et elles ne se réparent pas
 * au même endroit:
 *
 *   `dishesCounted`/`dishesTotal` — « je n'ai pas su lire tous les plats ».
 *                                    Se répare par le référentiel.
 *   `subject`/`mealsOut` .......... « il manquait des plats à lire ».
 *                                    Ne se répare pas: c'est la vie de
 *                                    quelqu'un, et un midi au restaurant.
 *
 * Un écran qui n'en dirait qu'une nommerait la mauvaise — et proposerait de
 * curer une table de composition pour un déjeuner pris dehors.
 */
export function DayEnergyLine({ energy }: { energy: DayEnergyView | null }) {
  if (!energy) return null;
  if (energy.kcal === null) {
    // Aucun plat lisible. On ne rend PAS « 0 kcal », qui se lirait « cette
    // journée ne nourrit pas » — le sens exactement inverse.
    return (
      <span className="text-xs font-normal text-ink-soft">
        {mealCopy("meals.energy.day_unreadable")}
      </span>
    );
  }
  // ══ ② · LE NOMBRE CHANGE DE SUJET, ET IL LE DIT ═══════════════════════════
  //
  // ⛔ « TA JOURNÉE : 1 400 » EST FAUX dès qu'un repas sur trois est pris
  // dehors, et faux dans le sens qui décourage: la personne lit un déficit
  // alors qu'elle a peut-être mangé un burger. La VALEUR ne bouge pas — elle
  // est exacte sur ce qu'elle couvre — c'est le SUJET qui change.
  //
  // ⚠️ AUCUN SOLDE, AUCUN VERDICT, AUCUNE COULEUR. Pas de « il te manque »,
  // pas de rouge: le produit ne sait pas ce qui a été mangé dehors, et il ne
  // peut pas le savoir. La teinte reste celle du total, décidée par `complete`.
  //
  // ⚠️ LES TROIS CONDITIONS SONT LA SECONDE CEINTURE, PAS LA PREMIÈRE. La règle
  // tout-ou-rien vit déjà dans `readDay`, qui refuse un `subject` sans son
  // compte. Deux écritures de la même règle aux deux bouts du fil: le jour où
  // l'une se relâche, l'autre tient — même discipline que `readDish`, dont le
  // chiffre ne survit pas à `complete: false` des deux côtés.
  const subject = energy.subject === "what_the_plan_made" && energy.mealsOut > 0 &&
      energy.dishesTotal > 0
    ? dayEnergySubjectClause(uiLocale() === "fr" ? "fr" : "en", {
      dishes: energy.dishesTotal,
      mealsOut: energy.mealsOut,
    })
    : null;
  /**
   * L'incise, ajoutée à une phrase qui ne prétend PAS parler de la journée.
   */
  const withSubject = (base: string) => subject === null ? base : `${base} — ${subject}`;
  const text = !energy.complete
    // ⚠️ `day_partial` SURVIT TEL QUEL, et l'incise s'y AJOUTE. Les deux
    // incomplétudes ne se réparent pas au même endroit — « je n'ai pas su lire
    // tous les plats » se répare par le référentiel, « il manquait des plats à
    // lire » ne se répare pas, c'est la vie de quelqu'un. Un écran qui n'en
    // dirait qu'une nommerait la mauvaise.
    ? withSubject(
      mealCopy("meals.energy.day_partial")
        .replace("{n}", String(energy.kcal))
        .replace("{counted}", String(energy.dishesCounted))
        .replace("{total}", String(energy.dishesTotal)),
    )
    // L'ADD-ON SE DIT, il ne se fond pas dans le total. Le taire ferait lire à
    // deux personnes de la même table deux chiffres pour le même plat, sans
    // rien pour expliquer l'écart — après quoi la plus servie croit que le plat
    // est plus gros, et l'autre que le sien est rogné.
    : energy.addonKcal > 0
    ? withSubject(
      mealCopy("meals.energy.day_with_addon")
        .replace("{n}", String(energy.kcal))
        .replace("{addon}", String(energy.addonKcal)),
    )
    // ══ LA SEULE PHRASE QUI SE FAIT REMPLACER, ET C'EST TOUT LE LOT ══════
    //
    // `meals.energy.day` dit « {n} kcal SUR LA JOURNÉE ». C'est très exactement
    // l'affirmation qui devient fausse quand un repas échappe au plan — et lui
    // accoler l'incise donnerait « 1 400 kcal sur la journée — sur les 2 repas
    // que j'ai composés », une phrase qui se contredit dans sa propre longueur.
    // Les deux autres variantes ne revendiquent pas la journée (elles parlent
    // de plats comptés et d'add-on), donc elles se complètent au lieu de se
    // faire remplacer.
    : subject !== null
    ? `${mealCopy("meals.energy.dish").replace("{n}", String(energy.kcal))} ${subject}`
    : mealCopy("meals.energy.day").replace("{n}", String(energy.kcal));
  return (
    <span
      className={`text-xs font-normal tabular-nums ${
        energy.complete ? "text-ink-soft" : "text-amber-700"
      }`}
    >
      {text}
    </span>
  );
}

/**
 * D'OÙ VIENT LE CHIFFRE — une fois par écran, jamais par plat.
 *
 * `CALORIE_REVERSAL` en une phrase: un chiffre vit dans un champ qui porte sa
 * base, ou il n'existe pas. Cette ligne est l'endroit où la base devient
 * LISIBLE — sans elle, la garantie n'est vraie que dans le code, et l'élève
 * n'a aucun moyen de distinguer ce calcul d'une estimation par photo, qui est
 * précisément ce que le produit refuse de lui montrer (−26,6 % de biais).
 */
export function EnergyBasisNote() {
  return (
    <p className="text-xs leading-5 text-ink-soft">
      {mealCopy("meals.energy.basis")}
    </p>
  );
}

/**
 * FF-059 LOT 3 — LA FOURCHETTE DE MAINTENANCE. Le niveau C, et le seul endroit
 * du produit où un chiffre parle de la PERSONNE et pas de la nourriture.
 *
 * ── CE QUE CE COMPOSANT NE FERA JAMAIS ─────────────────────────────────────
 * Il ne soustrait rien. Il n'affiche ni « il te reste », ni barre de
 * progression, ni couleur qui dit bien/mal, ni pourcentage. Le total de la
 * journée est ailleurs sur l'écran, cette fourchette est ici, et c'est l'élève
 * qui lit. Toute arithmétique entre les deux ferait de ce produit le tracker
 * que `coachStartingNumbers` refuse depuis le premier jour.
 *
 * ── ET IL N'EST PAS À CÔTÉ DU TOTAL, MAIS EN BAS ───────────────────────────
 * Deux nombres alignés se soustraient tout seuls dans la tête de qui les lit.
 * La fourchette vit donc avec la note de base, sous les plats — au rang d'un
 * repère, pas d'un score.
 */
export function EnergyTargetNote({ target }: { target: EnergyTargetView | null }) {
  if (!target) return null;
  if (target.low === null || target.high === null) {
    // L'ABSENCE SE DIT, avec son motif: « ajoute une pesée » et « ta dernière
    // pesée n'a pas l'air juste » ne se réparent pas au même endroit, et un
    // silence commun ferait ressaisir un poids à qui vient de taper 500.
    const label = target.gap === "no_weight"
      ? mealCopy("meals.energy.target_no_weight")
      : target.gap === "implausible_weight"
      ? mealCopy("meals.energy.target_implausible_weight")
      : null;
    return label ? <p className="text-xs leading-5 text-ink-soft">{label}</p> : null;
  }
  return (
    <div className="text-xs leading-5 text-ink-soft">
      <p className="tabular-nums text-ink-soft">
        {mealCopy("meals.energy.target_range")
          .replace("{low}", String(target.low))
          .replace("{high}", String(target.high))}
        {target.weightWeekStart && (
          <span className="text-ink-soft">
            {" — "}
            {mealCopy("meals.energy.target_measured").replace(
              "{date}",
              target.weightWeekStart,
            )}
          </span>
        )}
      </p>
      {/* CE QUE LA FOURCHETTE N'EST PAS. Trois phrases, et elles ne sont pas
          décoratives: sans elles, un intervalle affiché sous un total se lit
          comme une cible à atteindre — ce qu'il n'est pas, et ce que le
          générateur ne vise pas (R6). */}
      <p className="mt-1">{mealCopy("meals.energy.target_note")}</p>
    </div>
  );
}
