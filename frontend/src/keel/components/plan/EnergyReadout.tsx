import type {
  DayEnergyView,
  DishEnergyView,
  EnergyTargetDirection,
  EnergyTargetView,
} from "../../api/mealEnergy";
import { dayEnergySubjectClause } from "../../api/mealEnergy";
import { mealCopy } from "../../api/mealLabels";
// ⟳ LOT 5 — LE MÊME `Button` QUE PARTOUT. La rangée d'interrupteurs vient
// d'être extraite de `MealBuilder`, où elle utilisait déjà celui-ci: l'importer
// est ce qui garantit que les deux adresses de la rangée rendent le même
// bouton, et pas deux qui se ressemblent.
import { Button } from "../ui/Button";
// ⟳ LOT 4 — `MealCopyKey`, PAS `MessageKey`. `mealCopy` n'accepte que le
// sous-ensemble `meals.*`, et une fonction qui rendrait la clé LARGE ne
// compilerait pas chez son appelant — c'est le compilateur qui recense ici
// que ces deux choix ne peuvent désigner que de la copie de repas.
import type { MealCopyKey } from "../../api/mealLabels";
import { uiLocale } from "../../i18n/runtime";
// ① — LA PHRASE DU CONSEIL DU MIDI, IMPORTÉE, JAMAIS RÉÉCRITE ICI. Elle vit
// avec le nombre (`household_portions.ts`) pour la raison exacte de
// `PACE_WARNING_LABELS`: « autour de » est load-bearing dans les deux langues,
// et le libellé de chaque moment porte sa préposition — un gabarit `Au ${label}`
// rendrait « Au ta collation du matin ».
import { eatingOutAdviceSentence } from "../../../../../supabase/functions/_shared/keel/household_portions.ts";

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
  const locale = uiLocale() === "fr" ? "fr" : "en";
  // ══ ① · LE CONSEIL DU MIDI ═══════════════════════════════════════════════
  //
  // « Au déjeuner, vise autour de 700. » Décision produit §2.2 ⓑ: le repas
  // sort du plan, il ne sort pas du calcul.
  //
  // ⛔ UNE CONSIGNE, JAMAIS UN SOLDE. Aucun reste, aucun verdict, aucune
  // couleur, aucune barre. La phrase vient du module (« autour de » est
  // load-bearing) et le ton reste celui d'un repère, pas d'un score.
  //
  // ⚠️ IL SURVIT À UNE JOURNÉE ILLISIBLE, et c'est le point. « Vise 700 au
  // déjeuner » est vrai que le référentiel ait su lire les autres plats ou
  // non: il se calcule sur la journée DÉCLARÉE, pas sur ce que le plan a
  // composé. Le taire là serait perdre le conseil très exactement le jour où
  // l'écran n'a rien d'autre à offrir.
  const advice = energy.eatingOutAdvice.length === 0 ? null : (
    <span className="text-xs font-normal text-ink-soft">
      {energy.eatingOutAdvice
        .map((a) => eatingOutAdviceSentence(locale, a.slot, a.kcal))
        .join(" ")}
    </span>
  );
  if (energy.kcal === null) {
    // Aucun plat lisible. On ne rend PAS « 0 kcal », qui se lirait « cette
    // journée ne nourrit pas » — le sens exactement inverse.
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <span className="text-xs font-normal text-ink-soft">
          {mealCopy("meals.energy.day_unreadable")}
        </span>
        {advice}
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
    ? dayEnergySubjectClause(locale, {
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
  if (advice === null) {
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
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span
        className={`text-xs font-normal tabular-nums ${
          energy.complete ? "text-ink-soft" : "text-amber-700"
        }`}
      >
        {text}
      </span>
      {advice}
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
  const rangeKey = energyTargetRangeKey(target.direction);
  return (
    <div className="text-xs leading-5 text-ink-soft">
      <p className="tabular-nums text-ink-soft">
        {mealCopy(rangeKey)
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
      {/* CE QUE LA FOURCHETTE N'EST PAS. Ces phrases ne sont pas décoratives:
          sans elles, un intervalle affiché sous un total se lit comme une cible
          à atteindre.

          ⟳ LOT 4 — LA NOTE SUIT LA MÊME BASCULE QUE LE NOMBRE, et elle DOIT la
          suivre: la note d'entretien dit « à peu près ce qu'un corps de ta
          taille dépense », ce qui est faux mot pour mot d'une fourchette qu'on
          vient de décaler d'un déficit. Une phrase de garde qui survit à la
          règle qui l'a fondée est pire que pas de phrase. */}
      <p className="mt-1">{mealCopy(energyTargetNoteKey(target.direction))}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ⟳ LOT 4 (2026-09-01) — LES DEUX CHOIX DE PHRASE, EXTRAITS ET TESTABLES
//
// ── POURQUOI DEHORS PLUTÔT QU'EN LIGNE DANS LE JSX ────────────────────────
// Ce dépôt n'a AUCUN harnais de rendu côté front — pas de testing-library, pas
// de jsdom, aucun `.test.tsx`. Une décision laissée dans le JSX est donc une
// décision qu'aucun test ne peut atteindre, et celle-ci choisit ce qu'un
// chiffre de calories DIT à quelqu'un. Extraites, les deux tiennent dans un
// `.int.test.ts` comme le reste du dépôt (`pageFrontier.int.test.ts` importe
// déjà des composants).
// ---------------------------------------------------------------------------

/**
 * LA PHRASE DU NOMBRE, CHOISIE PAR LA DIRECTION QUE LA FOURCHETTE A SUIVIE.
 *
 * ⚠️ `direction` EST DÉJÀ TOUT-OU-RIEN À LA LECTURE (`readTarget`): il n'est
 * non nul que si la BASE dit `weight_range_with_direction` ET que les deux
 * bornes existent. Cette fonction n'a donc rien à revérifier, et elle ne doit
 * surtout pas refaire le test — deux points de décision sur « de quoi ce nombre
 * parle » finiraient par ne plus dire la même chose du même nombre.
 *
 * Le repli est la phrase de maintenance: le comportement d'avant ce champ, vrai
 * hier et vrai aujourd'hui.
 */
export function energyTargetRangeKey(
  direction: EnergyTargetDirection | null,
): MealCopyKey {
  if (direction === "down") return "meals.energy.target_range_down";
  if (direction === "up") return "meals.energy.target_range_up";
  return "meals.energy.target_range";
}

/**
 * LA NOTE SOUS LE NOMBRE, ET ELLE SUIT LA MÊME BASCULE — ELLE DOIT LA SUIVRE.
 *
 * ⛔ La note d'entretien dit « à peu près ce qu'un corps de ta taille dépense ».
 * Posée sous une fourchette qu'on vient de décaler d'un déficit, elle est fausse
 * mot pour mot. Une phrase de garde qui survit à la règle qui l'a fondée est
 * pire que pas de phrase: elle rassure sur une propriété qui n'existe plus.
 */
export function energyTargetNoteKey(
  direction: EnergyTargetDirection | null,
): MealCopyKey {
  return direction === null
    ? "meals.energy.target_note"
    : "meals.energy.target_note_directed";
}

// ---------------------------------------------------------------------------
// ⟳ LOT 5 (2026-09-01) — LES DEUX INTERRUPTEURS, ET ILS N'EXISTENT QU'ICI
//
// ── LE DÉFAUT QUE CE COMPOSANT FERME ──────────────────────────────────────
// Cette rangée vivait EN LIGNE dans `MealBuilder`, sous les plats, et c'était
// sa seule adresse dans tout le produit. Conséquence mesurée le 2026-09-01:
// quelqu'un qui avait éteint le chiffre devait revenir sur un écran de PLAN,
// dérouler jusqu'en bas des repas, et retrouver un bouton dont rien n'annonce
// qu'il est là. Le geste d'extinction était à un clic; le geste inverse était
// une fouille.
//
// Elle est donc rendue à DEUX endroits — sous les plats (là où le chiffre se
// lit) et dans la fenêtre « À propos de toi » (là où on va pour régler quelque
// chose). ⛔ MAIS UNE SEULE ÉCRITURE: deux copies d'une rangée de boutons
// divergent, et c'est celle qu'on regarde le moins qui garderait l'ancienne
// copie, l'ancienne condition d'affichage, ou l'ancien libellé.
//
// ── ⚠️ CE COMPOSANT NE DÉCIDE TOUJOURS RIEN ──────────────────────────────
// `switchOfferable` vient du SERVEUR et vaut vrai seulement quand le seul refus
// est l'interrupteur lui-même. Proposer « voir les calories » à quelqu'un que
// le plancher TCA, son âge ou son coach protègent, ce serait encore lui parler
// de calories — et cette règle-là ne se réécrit pas ici, elle se lit.
// ---------------------------------------------------------------------------

/**
 * LA RANGÉE DES DEUX BASCULES, ou rien.
 *
 * ⚠️ ELLE PREND L'OBJET ENTIER, pas six props éclatées. Les conditions
 * d'affichage (`ready`, `switchOfferable`, `targetOfferable`) et les actions
 * (`toggle`, `toggleTarget`) sont UNE décision: un appelant qui pourrait passer
 * `switchOfferable` sans `toggle` fabriquerait un bouton mort, et un appelant
 * qui pourrait forcer `switchOfferable: true` court-circuiterait la chaîne de
 * gardes depuis le client.
 */
export function EnergySwitches(
  { energy }: {
    energy: {
      ready: boolean;
      showing: boolean;
      switchOfferable: boolean;
      targetOfferable: boolean;
      target: EnergyTargetView | null;
      error: boolean;
      toggle: (next: boolean) => Promise<void>;
      toggleTarget: (next: boolean) => Promise<void>;
    };
  },
) {
  if (!energy.ready || !energy.switchOfferable) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={() => energy.toggle(!energy.showing)}>
        {energy.showing
          ? mealCopy("meals.energy.switch_off")
          : mealCopy("meals.energy.switch_on")}
      </Button>
      {/* LA SECONDE BASCULE, SÉPARÉE. Accepter de voir ce que pèse son dîner
          n'est pas accepter qu'on estime ce que son corps devrait manger. Elle
          ne s'affiche que si le SEUL refus de la cible est elle-même. */}
      {energy.targetOfferable && (
        <Button
          variant="secondary"
          onClick={() => energy.toggleTarget(energy.target === null)}
        >
          {energy.target === null
            ? mealCopy("meals.energy.target_switch_on")
            : mealCopy("meals.energy.target_switch_off")}
        </Button>
      )}
      <span className="text-xs text-ink-soft">
        {mealCopy("meals.energy.switch_hint")}
      </span>
      {/* UNE BASCULE QUI N'A PAS PRIS SE DIT. Le silence se lirait « c'est
          enregistré », sur un réglage dont toute la valeur est qu'il obéit. */}
      {energy.error && (
        <span className="text-xs text-red-700">
          {mealCopy("meals.energy.switch_failed")}
        </span>
      )}
    </div>
  );
}
