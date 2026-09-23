// KEEL — L3 · CE QU'ON DIT SOUS LE CURSEUR DE RYTHME.
//
// ── ⚠️ LIS D'ABORD CECI (2026-09-15) ──────────────────────────────────────
// CETTE PHRASE DONNE UNE DATE, ET C'EST LA TROISIÈME DÉCISION PRISE ICI.
//
//   2026-08-22  le nombre de semaines est RETIRÉ (lot `L3`), sur la mesure
//               recopiée plus bas — elle n'a jamais été démentie.
//   2026-09-01  il REVIENT, mais collé à sa réserve: « le calcul du curseur,
//               pas une date : seule la balance dira le rythme réel ».
//   2026-09-15  la réserve est RETIRÉE et la DATE est donnée, à la demande,
//               mot pour mot: « Si tu fais attention à bien coller au plan,
//               le xxx tu seras à ton objectif de XX kilos. C'est
//               mathématique. »
//
// ⚠️ LA MESURE DU 22/08 RESTE VRAIE, ET ELLE EST RECOPIÉE EN ENTIER PLUS BAS.
// Ce qui change est ce que le produit CHOISIT d'en dire. Ce qui reste de la
// garde est donc déplacé, pas supprimé: la date ne sort JAMAIS seule, elle
// sort attachée à la condition qui la rend vraie (« si tu colles au plan »).
// C'est `arrivalCopyCarriesItsCondition` qui le refuse, gabarit par gabarit.
//
// ⛔ CE MODULE NE REND PLUS UN JETON NU, ET C'EST LÀ QUE TIENT LA CONDITION.
// `ARRIVAL_HORIZON_TEMPLATES` porte la date, le poids visé ET la condition
// dans UNE SEULE chaîne: il n'existe aucun rendu qui puisse prendre l'un sans
// l'autre. Un écran qui voudrait « juste la date » devrait découper la phrase
// à la main, et la garde refuserait le gabarit découpé.
//
// ── ⚠️ LA MESURE QUI A FAIT RETIRER LE CHIFFRE — ELLE RESTE VRAIE ─────────
// À l'échelle de la dépense TOTALE, les meilleures équations testées contre
// l'eau doublement marquée gardent un RMSE d'environ 20 % et ne placent que
// 43 à 54 % des individus à ±10 % (Prado-Nóvoa, Sci Rep 2024). Sur notre
// corpus, ça vaut ~±580 kcal/j — PLUS GRAND que notre plafond de déficit
// (`MAX_DAILY_DEFICIT_KCAL` = 880 depuis le 2026-09-22, 500 avant).
//
// Mesuré le 2026-08-22 à 17:16 CEST sur les cas de design du dépôt:
//
//   femme 60 kg → 55 kg : l'écran disait « About 12 weeks at this pace. »
//     écart prescrit 495 kcal/j → intervalle réel [-85 … 1075] kcal/j
//     semaines réellement possibles : de 6 à JAMAIS
//   homme 95 kg → 80 kg : l'écran disait « About 34 weeks at this pace. »
//     semaines réellement possibles : de 16 à JAMAIS
//
// ⛔ CE « JAMAIS » EST CE QUE LA PHRASE NE DIT PAS, ET IL FAUT LE SAVOIR EN
// LA LISANT. La date rendue est l'arithmétique du curseur, exacte au jour
// près; le rythme que la balance montrera, lui, est inconnu à cette largeur-là.
// La phrase le porte par sa CONDITION (« si tu colles au plan »), pas par une
// réserve: une largeur annoncée (« 12 à 24 semaines ») ferait passer pour
// bornée une borne haute qui est l'infini, et c'est le seul énoncé que ce
// module continue de s'interdire.
//
// ── ⛔ CE QUE LA PHRASE N'A TOUJOURS PAS LE DROIT DE DIRE ─────────────────
//   ① UNE FOURCHETTE — voir juste au-dessus.
//   ② « LE PLAN SUIVRA VOS PESÉES ». Le lot `L11★` mesure 9 comptes portant
//      plus d'une pesée et ZÉRO BOUCHE, et aucun écrivain ne propage vers
//      `household_member_bodies.weight_kg`.
//   ③ DES kcal — clause C5, même raison que `PACE_WARNING_LABELS`: une
//      grandeur d'énergie PAR BOUCHE sortirait ici sans avoir traversé la
//      moindre porte, à côté d'un curseur que le compte maître règle POUR
//      QUELQU'UN D'AUTRE.
//
// ── ⛔ LA SECONDE SURFACE, ET POURQUOI ELLE EST PARTIE ────────────────────
// Le champ « poids visé » portait un `hint` rendu SANS CONDITION. Il a dit,
// successivement:
//
//   avant le 2026-08-22 : « Avec le rythme ci-dessous, il donne une date
//                           d'arrivée. »        → la promesse, en toutes lettres
//   du 2026-08-22 au -09-01 : « …il dit le sens de marche, pas le moment où
//                           il sera atteint. »  → la négation de la promesse
//
// ⛔ LES DEUX SONT INTENABLES AVEC LA PHRASE DU DESSOUS: la première la
// surpromet, la seconde la CONTREDIT à quinze lignes de distance — et depuis
// le 2026-09-15, la seconde la contredit MOT POUR MOT, puisque l'écran donne
// désormais « le moment où il sera atteint ». Le `hint` est donc retiré, pas
// réécrit. Un troisième texte ailleurs ne pourrait que diverger de celui-ci.
//
// ⚠️ `household.mouth.target_weight_hint` reste dans les catalogues, plus
// lue.
//
// ── ⚠️ LE MODULE PORTE SON PROPRE CATALOGUE DE LANGUE ─────────────────────
// Comme `PACE_WARNING_LABELS` dans `weight_pace.ts`. La phrase et sa décision
// sont un seul objet: les séparer laisse l'une bouger sans l'autre, et c'est
// toujours la phrase qui bouge.
//
// ── ⚠️ ET SON PROPRE AXE DE VOIX (2026-09-15) ────────────────────────────
// La phrase TUTOIE, et cette fiche se règle aussi POUR QUELQU'UN D'AUTRE: le
// compte maître pousse le curseur d'une bouche de son foyer. Un « tu seras à
// ton objectif » sous le prénom de quelqu'un d'autre est la cicatrice
// `ui-language-is-not-evidence` prise par le bout de la voix — déjà payée sur
// cet écran (« Tu en as coché 4 » sous un prénom tiers). Le catalogue porte
// donc DEUX chaînes par langue, et `whoOf` remplit `{who}`.
//
// PURE MODULE: no I/O, no clock, no randomness.

import { weeksToTarget } from "../../../../supabase/functions/_shared/keel/weight_pace.ts";

/**
 * Le seul horizon que ce produit rend.
 *
 * ⟳ 2026-09-15 — LE JETON GARDE SON NOM, ET CE N'EST PLUS UNE RÉSERVE, C'EST
 * UNE DESCRIPTION DU CALCUL. `weeks_at_this_pace` dit d'où vient la date: une
 * division par le cran du curseur, rien d'autre. La renommer `arrival_date`
 * ferait croire à un prochain lecteur qu'une pesée est entrée dans le calcul.
 */
export const ARRIVAL_HORIZONS = ["weeks_at_this_pace"] as const;
export type ArrivalHorizonKind = (typeof ARRIVAL_HORIZONS)[number];

/**
 * L'HORIZON — LES TROIS CHOSES QUE LA PHRASE DIT, JAMAIS L'UNE SANS LES AUTRES.
 *
 * ⛔ `weeks` RESTE, ET IL NE SE REND PLUS. C'est l'étape intermédiaire du
 * calcul (`weeksToTarget`), gardée parce que c'est elle qui est testée et
 * arrondie au supérieur; la phrase, elle, ne montre que la DATE qui en sort.
 * Ne le rends pas à côté: deux façons de dire le même horizon divergent au
 * premier arrondi changé.
 */
export type ArrivalHorizon = {
  kind: ArrivalHorizonKind;
  /** Entier, arrondi AU SUPÉRIEUR par `weeksToTarget`. INTERNE. */
  weeks: number;
  /**
   * LE JOUR D'ARRIVÉE, EN ISO LOCAL (`YYYY-MM-DD`).
   *
   * ⚠️ IL VIENT DE `todayLocalIso + weeks × 7`, ET LE MODULE RESTE PUR: la
   * date d'aujourd'hui ENTRE, elle ne se lit pas ici. Un `new Date()` changerait
   * de réponse à minuit pendant qu'on pousse le curseur, et rendrait cette
   * fonction intestable sur la valeur — même décision que `ageYearsFrom`.
   */
  arrivalOn: string;
  /** Le poids visé, tel que la phrase le nomme. */
  targetKg: number;
};

/** À qui la phrase parle. Même axe que `MouthVoice`, redit ici pour rester pur. */
export type ArrivalVoice = "self" | "other";

/**
 * LES GABARITS — DATE, POIDS VISÉ ET CONDITION DANS UNE MÊME CHAÎNE.
 *
 * ⛔ NE LES DÉCOUPE PAS. C'est la seule chose qui garantit qu'un écran ne peut
 * pas rendre « le 26 avril 2027. » tout seul: il n'y a pas de moitié à
 * prendre. La garde ci-dessous refuse tout gabarit qui perdrait sa condition,
 * et le test l'applique à CHAQUE entrée, dans les deux langues et les deux
 * voix.
 *
 * ⚠️ « C'EST MATHÉMATIQUE » PORTE SUR LA DIVISION, PAS SUR LE CORPS, et c'est
 * la condition qui place le curseur: la phrase dit « SI tu colles au plan ».
 * Le jour où quelqu'un voudra retirer la condition pour raccourcir, relire la
 * mesure du 22/08 en tête de fichier — c'est elle qui rend la conditionnelle
 * obligatoire.
 */
export const ARRIVAL_HORIZON_TEMPLATES: Record<
  ArrivalHorizonKind,
  Record<"en" | "fr", Record<ArrivalVoice, string>>
> = {
  weeks_at_this_pace: {
    en: {
      self:
        "Stick to the plan and on {date} you are at your target of {target} kg. " +
        "It is arithmetic.",
      other:
        "If {who} sticks to the plan, on {date} {who} is at their target of " +
        "{target} kg. It is arithmetic.",
    },
    fr: {
      self:
        "Si tu colles au plan, le {date} tu seras à ton objectif de {target} kg. " +
        "C'est mathématique.",
      other:
        "Si {who} colle au plan, le {date} {who} sera à son objectif de " +
        "{target} kg. C'est mathématique.",
    },
  },
};

/**
 * LES MOTS DE LA CONDITION — vocabulaire FERMÉ, par langue, possédé par ce
 * module.
 *
 * ⚠️ PAR LANGUE, ET PAS UNE LISTE UNIQUE: la condition française et l'anglaise
 * ne partagent aucun mot, et une liste commune rendrait la garde verte sur une
 * phrase mi-traduite.
 *
 * ⚠️ CE N'EST PAS UN MATCHER SUR DU TEXTE LIBRE — ce que ce dépôt s'interdit
 * (« laitue » ≠ « lait »). Le corpus fait quatre chaînes, et elles sont
 * écrites vingt lignes plus haut.
 */
const CONDITION_MARKERS: Record<"en" | "fr", readonly string[]> = {
  // ① ce qui doit être tenu pour que la date arrive, ② ce que la date vaut.
  en: ["stick", "arithmetic"],
  fr: ["colle", "mathématique"],
};

/** Le trou trouvé dans un gabarit, nommé — jamais un `false` nu. */
export type ConditionLeak =
  | { kind: "no_date" }
  | { kind: "no_target" }
  | { kind: "missing_condition"; missing: string };

/**
 * CE GABARIT PORTE-T-IL SA DATE, SON POIDS VISÉ **ET** SA CONDITION ?
 *
 * `null` = oui, il peut s'afficher — et c'est LE CAS QUI PASSE, celui sans
 * lequel cette garde bloquerait tout en ressemblant à une garde qui marche
 * (cicatrice `guards-need-a-passing-case`). Les quatre gabarits livrés le
 * prouvent, dans les deux langues et les deux voix.
 *
 * ⛔ CE QU'ELLE GARDE EST L'INVARIANT DU LOT, PAS L'ANCIEN. Elle remplace
 * `arrivalCopyCarriesItsReserve` (2026-09-01), qui exigeait « pas une date » et
 * « la balance »: ces deux marqueurs sont morts avec la décision qu'ils
 * tenaient, ils ne sont pas oubliés. Ce qui survit est la FORME de la garde —
 * le chiffre n'a pas le droit d'exister SEUL.
 *
 * ⛔ CE QU'ELLE NE COUVRE PAS, ÉCRIT PLUTÔT QU'OUBLIÉ: une condition présente
 * mais noyée (trois phrases avant la date), ou rendue dans un autre bloc
 * visuel. Elle attrape la séparation, qui est la forme qu'a prise la perte
 * pendant toute la vie de cet écran.
 */
export function arrivalCopyCarriesItsCondition(
  template: string,
  lang: "en" | "fr",
): ConditionLeak | null {
  if (!template.includes("{date}")) return { kind: "no_date" };
  if (!template.includes("{target}")) return { kind: "no_target" };
  const lowered = template.toLocaleLowerCase(lang === "fr" ? "fr-FR" : "en-GB");
  for (const marker of CONDITION_MARKERS[lang]) {
    if (!lowered.includes(marker)) {
      return { kind: "missing_condition", missing: marker };
    }
  }
  return null;
}

/**
 * LE JOUR D'ARRIVÉE, EN ARITHMÉTIQUE UTC.
 *
 * ⚠️ UTC, ET PAS L'HEURE LOCALE DU NAVIGATEUR. `new Date("2026-09-15")` est déjà
 * minuit UTC; ajouter des jours en local ferait sauter ou répéter un jour au
 * passage de l'heure d'été, une fois par an, sur une phrase qui annonce une
 * date. Le rendu repasse par `timeZone: "UTC"` pour la même raison.
 *
 * `null` si la date d'entrée n'est pas une date — on n'invente pas un jour.
 */
function dayAfterWeeks(todayLocalIso: string, weeks: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayLocalIso)) return null;
  const ms = Date.parse(`${todayLocalIso}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  const at = new Date(ms + weeks * 7 * 86_400_000);
  return at.toISOString().slice(0, 10);
}

/**
 * LA PHRASE PRÊTE À RENDRE.
 *
 * ⚠️ LA DATE PASSE PAR `toLocaleDateString` AVEC LE MOIS EN TOUTES LETTRES:
 * « 26/04/2027 » se lit à l'envers d'une langue à l'autre, et cette phrase-ci
 * est lue une fois, vite, sous un curseur qu'on pousse.
 *
 * ⚠️ LE POIDS PASSE PAR `toLocaleString`: le cran du curseur peut donner un
 * demi-kilo, et « 80,5 kg » ne s'écrit pas « 80.5 » en français.
 */
export function arrivalHorizonCopy(
  horizon: ArrivalHorizon,
  lang: "en" | "fr",
  voice: ArrivalVoice,
  who: string,
): string {
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const date = new Date(`${horizon.arrivalOn}T00:00:00Z`).toLocaleDateString(
    locale,
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
  );
  const target = horizon.targetKg.toLocaleString(locale);
  return ARRIVAL_HORIZON_TEMPLATES[horizon.kind][lang][voice]
    .replaceAll("{date}", date)
    .replaceAll("{target}", target)
    .replaceAll("{who}", who);
}

/**
 * LA PRÉMISSE — la phrase ne sort que là où elle a un sens.
 *
 * ⛔ ELLE EST ARMÉE, comme chaque phrase de `plan_rationale.ts`: sans cible
 * acceptée, sans rythme vivant et sans écart, elle ne sort pas. Une phrase
 * qui sort toujours n'informe de rien.
 *
 * ⚠️ `weeksToTarget` RESTE LE SEUL ENDROIT OÙ LA DIVISION SE FAIT, avec ses
 * tests (`weight_pace_test.ts`) et son arrondi au supérieur choisi: une date
 * annoncée trop tôt est une déception programmée, trop tard une bonne
 * surprise. Recalculer ici donnerait deux arithmétiques à faire diverger.
 *
 * ⚠️ `todayLocalIso` EST UNE ENTRÉE, PAS UNE LECTURE D'HORLOGE. Le module reste
 * pur; c'est l'écran qui sait quel jour on est chez la personne.
 */
export function arrivalHorizonFor(input: {
  /** La cible a passé `targetWeightRefusal` — donc écart non nul et bon sens. */
  targetAccepted: boolean;
  /** Le poids d'aujourd'hui, ou `null` quand le corps n'est pas encore là. */
  currentKg: number | null;
  /** Le poids visé, ou `null`. */
  targetKg: number | null;
  /** Le cran du curseur, ou `null` quand il n'y a pas de curseur. */
  paceKgPerWeek: number | null;
  /** Le jour d'aujourd'hui chez la personne, `YYYY-MM-DD`. */
  todayLocalIso: string;
}): ArrivalHorizon | null {
  if (!input.targetAccepted) return null;
  const { currentKg, targetKg, paceKgPerWeek: pace } = input;
  if (currentKg === null || targetKg === null || pace === null) return null;
  if (!Number.isFinite(currentKg) || !Number.isFinite(targetKg)) return null;
  if (!Number.isFinite(pace) || pace <= 0) return null;
  const weeks = weeksToTarget(currentKg, targetKg, pace);
  if (weeks === null) return null;
  // ⛔ SANS JOUR D'AUJOURD'HUI, PAS D'HORIZON. Rendre les semaines sans leur
  // date laisserait un objet que la phrase ne sait pas composer — et c'est
  // l'écran qui se tairait, sans savoir pourquoi.
  const arrivalOn = dayAfterWeeks(input.todayLocalIso, weeks);
  if (arrivalOn === null) return null;
  return { kind: "weeks_at_this_pace", weeks, arrivalOn, targetKg };
}
