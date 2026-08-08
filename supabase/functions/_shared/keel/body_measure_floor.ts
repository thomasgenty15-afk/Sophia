/**
 * LE PLANCHER DÉTERMINISTE DE LA MESURE CORPORELLE ANNONCÉE.
 *
 * FF-008. Même famille, même patron et même raison que
 * `meal_declaration_floor.ts` — sauf que l'enjeu n'est pas le même, et que
 * l'asymétrie s'inverse.
 *
 * ── POURQUOI C'EST DE LA SÉCURITÉ, PAS UNE COMMODITÉ ────────────────────────
 * `restriction_guard.ts` détecte `rapid_weight_loss` en comparant deux poids
 * hebdomadaires distants de 14 jours contre `max_weekly_loss_pct = 1.2`. Un
 * élève qui annonce sa perte DANS LE CHAT et seulement là est un élève dont la
 * perte rapide n'est jamais détectée. Ouvrir ce chemin d'écriture sans brancher
 * la ceinture, c'est désarmer une garde en croyant ajouter une commodité
 * (FF-007 R5).
 *
 * ── POURQUOI UN PLANCHER, ET PAS UN MEILLEUR PROMPT ─────────────────────────
 * Mesuré sur les repas: la MÊME phrase, jouée quatre fois, écrivait le fait
 * `[0, 3, 3, 0]` en français et `[0, 0, 0, 0]` en anglais. Une instabilité sur
 * une phrase identique prouve un tirage, pas une règle. Sur une donnée qui ARME
 * UNE CEINTURE, l'enjeu est plus grand, pas moins: la reconnaissance est
 * déterministe et passe AVANT le modèle.
 *
 * ── L'ASYMÉTRIE, ET ELLE EST INVERSE DE CELLE DES REPAS ─────────────────────
 * Sur-déclarer un repas écrit un fait de trop, que l'élève corrige. Sur-déclarer
 * un POIDS fausse `outcomes` puis la ceinture: le produit croira à une perte qui
 * n'a pas eu lieu, ou n'en verra pas une qui a lieu. Ici la porte est donc
 * étroite DES DEUX CÔTÉS: pas de lexique large, pas d'unité devinée, pas de
 * nombre ramassé au hasard, `null` dès que ce n'est pas sûr (R2).
 *
 * ── CE QU'IL NE FAIT PAS ────────────────────────────────────────────────────
 * Il ne déduit RIEN d'une variation (« j'ai perdu 2 »): il faudrait connaître le
 * point de départ, et un poids déduit est un poids faux dans une ceinture de
 * sécurité. Il ne lit pas l'horloge. Il ne calcule aucun IMC — « un IMC n'est
 * pas une mesure de l'élève, c'est un verdict sur lui »
 * (`student_body_io.ts`). Il ne distingue pas une cible d'une mesure « au
 * feeling »: la frontière est lexicale, fermée, et testée cas par cas.
 */

/** Ce que le plancher reconnaît. Deux grandeurs, pas une de plus. */
export type BodyMeasureKind = "weight" | "waist";

/**
 * Le système d'unités du profil (`profiles.display_unit_system`).
 *
 * ⚠️ PARAMÈTRE REQUIS, jamais optionnel. Ce dépôt a déjà mesuré qu'« un
 * paramètre de garde optionnel est une garde désarmée »: `safetyBand` était
 * optionnel et n'a jamais été passé. Ici, un défaut implicite ferait lire
 * « 172 » comme 172 kg chez quelqu'un qui pense en livres — soit une mesure
 * fausse dans la ceinture.
 */
export type DisplayUnitSystem = "metric" | "imperial";

/** L'unité EXPRIMÉE, avant conversion. Liste fermée. */
export type BodyMeasureUnit = "kg" | "lb" | "cm" | "in";

export type BodyMeasureHit = {
  kind: BodyMeasureKind;
  /** La valeur en SI: kg pour le poids, cm pour le tour de taille. */
  valueSi: number;
  /** L'unité telle qu'elle a été comprise. */
  unit: BodyMeasureUnit;
  /** D'où vient l'unité: écrite par l'élève, ou défaut du profil (R6). */
  unitSource: "explicit" | "profile_default";
  /** La valeur telle qu'écrite, avant conversion — pour que le log soit lisible. */
  rawValue: number;
  /** Le fragment qui a ouvert la porte, pour que le log soit lisible. */
  matched: string;
  /** Les mots de l'élève, tels quels. */
  studentNote: string;
};

/**
 * BORNES DE PLAUSIBILITÉ — CELLES DU FORMULAIRE, pas d'autres.
 *
 * Alignées mot pour mot sur `student_body_io.ts` et sur le formulaire hebdo. Une
 * valeur hors bornes est REFUSÉE (le plancher rend `null`), jamais écrite en
 * silence: elle vient presque toujours d'une unité mal lue, et
 * `restriction_guard` JETTE sur un poids implausible (20-500 kg). Écrire
 * silencieusement casserait la garde en aval au lieu de la nourrir.
 */
export const BODY_MEASURE_BOUNDS = Object.freeze({
  weight_kg_min: 25,
  weight_kg_max: 350,
  waist_cm_min: 40,
  waist_cm_max: 200,
});

/** Facteurs de conversion, exacts et gelés. */
const LB_TO_KG = 0.45359237;
const IN_TO_CM = 2.54;

/**
 * Normalisation. Comme celle du plancher de repas, à UNE différence près qui
 * compte: le séparateur décimal SURVIT. « 78,5 kg » écrasé en « 78 5 kg »
 * deviendrait deux nombres, donc un refus — et la moitié de l'Europe écrit la
 * virgule.
 */
/**
 * Le caractère sous lequel le séparateur décimal se met à l'abri le temps du
 * nettoyage. Écrit en échappement Unicode et pas en littéral: un caractère de
 * contrôle invisible dans un fichier source est une bombe à retardement pour
 * la relecture.
 */
const DECIMAL_SENTINEL = "\u0001";

function normalize(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    // Le séparateur décimal survit au nettoyage. SANS espace autour, exprès:
    // « 172, 3 jours plus tard » doit rester DEUX nombres — donc un refus — et
    // pas devenir « 172.3 ».
    .replace(/(\d)[.,](\d)/g, `$1${DECIMAL_SENTINEL}$2`)
    .replace(/['\u2019]/g, " ")
    .replace(new RegExp(`[^a-z0-9\\s${DECIMAL_SENTINEL}]`, "g"), " ")
    .replace(new RegExp(DECIMAL_SENTINEL, "g"), ".")
    // « 78kg » doit se lire « 78 kg ». Sans cette coupure, `\b\d+\b` ne voit
    // AUCUN nombre (le « k » de « kg » est un caractère de mot) et le plancher
    // refuserait une déclaration parfaitement claire.
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * LE LEXIQUE DES UNITÉS. Table FERMÉE, FR + EN, écrite à la main.
 *
 * ⚠️ `in` (le mot anglais « inch » abrégé) est ABSENT, exprès: c'est aussi la
 * préposition anglaise la plus fréquente de la langue, et « I'm at 172 in the
 * morning » deviendrait 172 pouces. Un abrégé ambigu n'entre pas dans un
 * lexique fermé qui alimente une ceinture.
 */
const UNIT_TERMS: ReadonlyArray<{ unit: BodyMeasureUnit; term: string }> = [
  { unit: "kg", term: "kg" },
  { unit: "kg", term: "kgs" },
  { unit: "kg", term: "kilo" },
  { unit: "kg", term: "kilos" },
  { unit: "kg", term: "kilogramme" },
  { unit: "kg", term: "kilogrammes" },
  { unit: "kg", term: "kilogram" },
  { unit: "kg", term: "kilograms" },
  { unit: "lb", term: "lb" },
  { unit: "lb", term: "lbs" },
  { unit: "lb", term: "pound" },
  { unit: "lb", term: "pounds" },
  { unit: "lb", term: "livre" },
  { unit: "lb", term: "livres" },
  { unit: "cm", term: "cm" },
  { unit: "cm", term: "cms" },
  { unit: "cm", term: "centimetre" },
  { unit: "cm", term: "centimetres" },
  { unit: "cm", term: "centimeter" },
  { unit: "cm", term: "centimeters" },
  { unit: "in", term: "inch" },
  { unit: "in", term: "inches" },
  { unit: "in", term: "pouce" },
  { unit: "in", term: "pouces" },
];

/** Les unités que chaque grandeur accepte. Un poids en cm n'est pas un poids. */
const UNITS_FOR_KIND: Readonly<Record<BodyMeasureKind, readonly BodyMeasureUnit[]>> = {
  weight: ["kg", "lb"],
  waist: ["cm", "in"],
};

/** Le défaut du profil, par grandeur (R6). Jamais deviné du nombre. */
const DEFAULT_UNIT: Readonly<
  Record<DisplayUnitSystem, Record<BodyMeasureKind, BodyMeasureUnit>>
> = {
  metric: { weight: "kg", waist: "cm" },
  imperial: { weight: "lb", waist: "in" },
};

/**
 * LA BANDE D'AMBIGUÏTÉ D'UN POIDS SANS UNITÉ.
 *
 * FF-008 R6 le pose en une phrase: « 165 » est 165 lb ou 165 cm de tour de
 * taille, jamais 165 kg — le nombre seul ne tranche pas. Le défaut du profil
 * donne l'unité, il ne lève pas cette ambiguïté-là: en métrique, un nombre
 * entre 140 et 210 est bien plus souvent une STATURE en centimètres qu'un poids
 * en kilos; en impérial, un nombre sous 90 est bien plus souvent une stature en
 * pouces qu'un poids en livres.
 *
 * Dans la bande, le plancher REFUSE. C'est un refus, pas une écriture
 * approximative: l'élève qui pèse réellement 145 kg écrit « 145 kg » et est
 * enregistré. Le sens du refus est le seul qui soit récupérable — une mesure
 * fausse dans une ceinture de sécurité ne l'est pas.
 */
const IMPLICIT_WEIGHT_ACCEPTED = Object.freeze({
  /** Au-dessus, on lit plus probablement une taille en centimètres. */
  metric_max_kg: 140,
  /** En dessous, on lit plus probablement une taille en pouces. */
  imperial_min_lb: 90,
});

/**
 * LES PORTES DU POIDS, et elles sont étroites.
 *
 * Chacune est une affirmation de PRÉSENT ou de PASSÉ IMMÉDIAT, à la première
 * personne, suivie d'un nombre. « Je suis à 78 », « je fais 78 », « 78 ce
 * matin », « I'm at 172 », « I weighed 172 this morning ». Le nombre doit
 * appartenir à la porte: une porte qui accepterait n'importe quel nombre du
 * message ramasserait l'heure du réveil.
 */
const WEIGHT_GATES: readonly RegExp[] = [
  // FR
  /\bje suis (?:a|descendu a|remonte a|passe a|monte a) (\d+(?:\.\d+)?)/,
  /\bje (?:fais|pese|faisais|pesais) (\d+(?:\.\d+)?)/,
  /\bje me suis pese[e]? (?:a |ce matin a |et je suis a )?(\d+(?:\.\d+)?)/,
  /\b(?:la balance|le pese personne) (?:dit|affiche|indique) (\d+(?:\.\d+)?)/,
  /\bmon poids (?:est|est de|du jour est|de ce matin est)? ?(?:de )?(\d+(?:\.\d+)?)/,
  /\b(\d+(?:\.\d+)?) (?:kg|kgs|kilo|kilos|kilogramme|kilogrammes|lb|lbs|livre|livres) (?:ce matin|ce soir|aujourd hui|ce midi)\b/,
  // EN — « I'm » se normalise en « i m » (l'apostrophe devient une espace):
  // les trois orthographes sont donc écrites, sinon la garde ne mord que sur
  // la forme la moins fréquente.
  /\b(?:i m|i am|im) (?:at|now at|down to|up to) (\d+(?:\.\d+)?)/,
  /\bi (?:weigh|weighed|was) (\d+(?:\.\d+)?)/,
  /\b(?:i ve|i have) (?:hit|reached) (\d+(?:\.\d+)?)/,
  /\bweighed in at (\d+(?:\.\d+)?)/,
  /\b(?:the )?(?:scale|scales) (?:says?|said|showed?|reads?) (\d+(?:\.\d+)?)/,
  /\bmy weight (?:is|was|this morning is) (\d+(?:\.\d+)?)/,
];

/**
 * LES PORTES DU TOUR DE TAILLE.
 *
 * Le mot « taille » seul est EXCLU: en français il désigne aussi la stature et
 * la taille de vêtement, et « je fais du 40 » n'est pas un tour de taille. Il
 * faut « tour de taille » ou « waist ».
 */
const WAIST_GATES: readonly RegExp[] = [
  // FR
  /\btour de taille (?:est |est de |de |a )?(\d+(?:\.\d+)?)/,
  /\bmon tour de taille (?:est|fait|est de) ?(?:de )?(\d+(?:\.\d+)?)/,
  /\bje fais (\d+(?:\.\d+)?) (?:cm|cms|centimetre|centimetres|pouce|pouces) de tour de taille\b/,
  /\b(\d+(?:\.\d+)?) (?:cm|cms|centimetre|centimetres|pouce|pouces) de tour de taille\b/,
  // EN
  /\bmy waist (?:is|was|measures) ?(?:at )?(\d+(?:\.\d+)?)/,
  /\bwaist (?:is|at|measures) (\d+(?:\.\d+)?)/,
  /\bi measured (\d+(?:\.\d+)?) (?:cm|cms|centimetre|centimetres|inch|inches) (?:around|at) (?:the |my )?waist\b/,
];

/**
 * CE QUI DÉSARME LE PLANCHER, vérifié sur le message ENTIER.
 *
 * Condition de désarmement explicite (doctrine P9): une ceinture sans elle est
 * une ceinture qu'on ne sait pas retirer. Chacune ferme un faux positif NOMMÉ
 * par FF-008 §7, et chacune est écrite dans les DEUX langues — le dépôt a déjà
 * payé une garde testée dans une seule (`not` ne couvrait pas `doesn't`).
 */
const DISARM: readonly RegExp[] = [
  // ── LA CIBLE (R4). « Atteindre 75 » et « je suis à 78 » lus pareil feraient
  // afficher une perte qui n'a jamais eu lieu.
  /\b(?:objectif|cible|but)\b/,
  /\bje (?:veux|voudrais|aimerais|compte|espere|vise|prevois)\b/,
  /\bd ici\b/,
  /\bpour (?:l ete|juin|juillet|aout|septembre|octobre|novembre|decembre|janvier|fevrier|mars|avril|mai|la rentree|le mariage)\b/,
  /\bj aimerais (?:etre|faire|descendre|arriver)\b/,
  /\b(?:target|goal|aiming for|aim for)\b/,
  /\bi (?:want|would like|d like|hope|plan|intend|aim)\b/,
  /\bby (?:the end of|summer|june|july|august|september|october|november|december|january|february|march|april|may|christmas)\b/,
  /\bget (?:down |back )?to\b/,
  /\bdescendre a\b/,
  // ── LA VARIATION (R3). « J'ai perdu 2 » n'écrit rien: il faudrait connaître
  // le point de départ, et un poids déduit est un poids faux.
  /\bj ai (?:perdu|pris|reperdu|repris)\b/,
  /\bje (?:perds|prends)\b/,
  /\b(?:de|en) (?:moins|plus)\b/,
  /\bi (?:lost|gained|have lost|have gained|ve lost|ve gained|dropped|put on)\b/,
  /\b(?:down|up) (?:by )?\d/,
  // ── LA PLAGE. « Je fais entre 78 et 79 » n'est pas une mesure.
  /\bentre \d/,
  /\bbetween \d/,
  /\d\s*(?:a|to|et|and)\s*\d+(?:\.\d+)?\s*(?:kg|kgs|kilos?|lb|lbs|cm|cms)\b/,
  // ── LA NÉGATION.
  /\bje ne suis (?:pas|plus)\b/,
  /\bje ne (?:fais|pese) (?:pas|plus)\b/,
  /\bi(?: a)?m not\b/,
  /\bi (?:don t|do not|didn t|did not|haven t|have not)\b/,
  /\bpas encore\b/,
  /\bnot yet\b/,
  // ── QUELQU'UN D'AUTRE. Reprise mot pour mot du plancher de repas: la même
  // frontière, écrite deux fois différemment, divergerait.
  /\b(?:my|his|her|their|our) (?:son|daughter|child|kid|wife|husband|partner|mother|father|mum|mom|dad|friend|colleague|brother|sister)\b/,
  /\b(?:mon|ma|mes) (?:fils|fille|enfant|enfants|femme|mari|conjoint|conjointe|mere|pere|ami|amie|collegue|frere|soeur)\b/,
  /\b(?:il|elle) (?:fait|pese)\b/,
  /\b(?:he|she) (?:weighs|weighed|is at)\b/,
  // ── L'HYPOTHÈSE.
  /\b(?:si je|if i|suppose|imagine|admettons)\b/,
  // ── LA QUESTION. « Je devrais faire combien ? » nomme un nombre sans en
  // déclarer aucun.
  /\?/,
  /\b(?:combien|est ce que|qu est ce que|je devrais|puis je|je peux)\b/,
  /\b(?:how much|how many|should i|what should|is it|do you think|can i)\b/,
  // ── LE PASSÉ LOINTAIN. « L'an dernier je faisais 92 » est une anecdote, pas
  // la mesure d'aujourd'hui, et la revue de semaine ne sait pas ranger un
  // passé (question ouverte de FF-008 §11, donc interdit tant qu'ouvert).
  /\b(?:l an dernier|l annee derniere|avant|autrefois|a l epoque|il y a \d+ (?:jours?|semaines?|mois|ans?))\b/,
  /\b(?:last year|back then|years ago|months ago|used to)\b/,
  // ── LE PASSÉ *PROCHE*, ET IL MANQUAIT.
  //
  // ⚠️ MESURÉ EN RUN RÉEL (2026-08-08, FF-008 A5). « La semaine dernière je
  // pesais 85 kg » et « last Monday I was 85 kg » mordaient les portes
  // `je pesais` / `i was` et s'écrivaient dans la semaine COURANTE — un poids
  // périmé rangé dans la case que `restriction_guard` compare. C'est le pire
  // des trois sorts possibles: pas un refus, pas la bonne date, mais une
  // FAUSSE mesure d'aujourd'hui. Une perte réelle s'en trouve diluée (la
  // semaine courante porte un poids trop ancien) ou inventée (un poids
  // d'il y a un mois lu comme celui de cette semaine).
  //
  // La liste ci-dessus disait déjà l'intention — « la revue de semaine ne sait
  // pas ranger un passé » — mais ne nommait que le passé LOINTAIN. Un jour
  // nommé et la semaine dernière sont exactement le passé qu'un élève écrit,
  // et ils passaient par le trou entre les deux.
  //
  // Le jour nommé désarme SEUL, sans exiger « dernier »: « lundi je pesais
  // 85 » n'a pas de marqueur d'antériorité, et exiger « dernier » raterait la
  // forme la plus courante. Coût assumé: « je me pèse le lundi, je suis à
  // 78 » est refusé aussi. C'est le sens du refus qui est récupérable (R2) —
  // l'élève réécrit son poids sans le jour, et il est enregistré.
  /\b(?:hier|la semaine derniere|la semaine passee|le mois dernier|le mois passe|le week end dernier)\b/,
  /\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/,
  /\b(?:yesterday|last (?:week|month|weekend|night|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/,
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  /\b(?:days? ago|weeks? ago)\b/,
  // ── LA CONSIGNE RAPPORTÉE.
  /\b(?:tu as dit|le coach|my coach|you said) /,
];

/** Tous les nombres du message, dans l'ordre. */
function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const match of text.matchAll(/\b\d+(?:\.\d+)?\b/g)) {
    const n = Number(match[0]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * L'unité écrite JUSTE APRÈS le nombre, s'il y en a une.
 *
 * L'adjacence est la règle, et elle n'est pas cosmétique: sans elle, « je suis
 * à 78 ce matin, j'ai acheté trois kilos de pommes » lirait « kilos » comme
 * l'unité de 78. L'unité qualifie SON nombre, ou elle n'existe pas.
 */
function unitRightAfter(text: string, value: string): BodyMeasureUnit | null {
  for (const { unit, term } of UNIT_TERMS) {
    if (new RegExp(`(^|\\s)${value}\\s*${term}(\\s|$)`).test(text)) return unit;
  }
  return null;
}

function toSi(value: number, unit: BodyMeasureUnit): number {
  if (unit === "kg" || unit === "cm") return value;
  const converted = unit === "lb" ? value * LB_TO_KG : value * IN_TO_CM;
  // Un dixième, comme le formulaire (`weekly_flow.readMeasure`). Une conversion
  // qui rendrait 78.01847 ferait croire à une précision que la balance n'a pas.
  return Math.round(converted * 10) / 10;
}

function withinBounds(kind: BodyMeasureKind, valueSi: number): boolean {
  return kind === "weight"
    ? valueSi >= BODY_MEASURE_BOUNDS.weight_kg_min &&
      valueSi <= BODY_MEASURE_BOUNDS.weight_kg_max
    : valueSi >= BODY_MEASURE_BOUNDS.waist_cm_min &&
      valueSi <= BODY_MEASURE_BOUNDS.waist_cm_max;
}

function firstGateHit(
  text: string,
  gates: readonly RegExp[],
): { value: string; matched: string } | null {
  for (const gate of gates) {
    const match = gate.exec(text);
    if (match && match[1]) return { value: match[1], matched: match[0].trim() };
  }
  return null;
}

/**
 * Le plancher. Rend `null` dès qu'il n'est pas SÛR — jamais une approximation.
 *
 * @param userMessage le message BRUT de l'élève.
 * @param unitSystem `profiles.display_unit_system`. REQUIS: voir
 *   `DisplayUnitSystem`.
 */
export function detectDeclaredBodyMeasure(
  userMessage: unknown,
  unitSystem: DisplayUnitSystem,
): BodyMeasureHit | null {
  const raw = String(userMessage ?? "").trim();
  if (!raw) return null;
  // Un copier-coller n'est pas une déclaration de mesure. Même borne que le
  // plancher de repas, et pour la même raison.
  if (raw.length > 600) return null;
  const text = ` ${normalize(raw)} `;
  if (!text.trim()) return null;

  for (const disarm of DISARM) {
    if (disarm.test(text)) return null;
  }

  // DEUX NOMBRES = PAS DE MESURE SÛRE (FF-008 §7). Le plancher ne choisit pas
  // lequel des deux est le poids: choisir, c'est deviner, et un poids deviné est
  // un poids faux dans une ceinture de sécurité.
  const numbers = numbersIn(text);
  if (numbers.length !== 1) return null;

  // Le poids d'abord: c'est la grandeur qui arme la ceinture, et les deux
  // familles de portes ne se recouvrent pas (« tour de taille » n'apparaît dans
  // aucune porte de poids).
  const weightHit = firstGateHit(text, WEIGHT_GATES);
  const waistHit = weightHit ? null : firstGateHit(text, WAIST_GATES);
  const hit = weightHit ?? waistHit;
  if (!hit) return null;
  const kind: BodyMeasureKind = weightHit ? "weight" : "waist";

  const rawValue = Number(hit.value);
  if (!Number.isFinite(rawValue)) return null;
  // La porte a mordu sur un nombre; ce nombre DOIT être le seul du message,
  // sinon la porte parle d'autre chose que ce qu'on a compté.
  if (rawValue !== numbers[0]) return null;

  const explicit = unitRightAfter(text, hit.value);
  if (explicit !== null && !UNITS_FOR_KIND[kind].includes(explicit)) {
    // « je fais 78 cm » n'est pas un poids, et « mon tour de taille est 84 kg »
    // n'est pas un tour de taille. Une unité qui contredit la grandeur est un
    // message qu'on n'a pas compris: on n'écrit rien.
    return null;
  }
  const unit = explicit ?? DEFAULT_UNIT[unitSystem][kind];

  // R6, la moitié qu'un défaut de profil ne couvre PAS: un poids sans unité
  // dans la bande d'ambiguïté avec une stature ne s'écrit pas. Voir
  // `IMPLICIT_WEIGHT_ACCEPTED`.
  if (explicit === null && kind === "weight") {
    if (
      unitSystem === "metric" &&
      rawValue >= IMPLICIT_WEIGHT_ACCEPTED.metric_max_kg
    ) return null;
    if (
      unitSystem === "imperial" &&
      rawValue < IMPLICIT_WEIGHT_ACCEPTED.imperial_min_lb
    ) return null;
  }

  const valueSi = toSi(rawValue, unit);
  // R5: hors bornes = REFUS, jamais une écriture silencieuse. La valeur vient
  // presque toujours d'une unité mal lue, et `restriction_guard` jette sur un
  // poids implausible.
  if (!withinBounds(kind, valueSi)) return null;

  return {
    kind,
    valueSi,
    unit,
    unitSource: explicit === null ? "profile_default" : "explicit",
    rawValue,
    matched: hit.matched,
    studentNote: raw.slice(0, 2000),
  };
}
