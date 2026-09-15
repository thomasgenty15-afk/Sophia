/**
 * L5 — LE SEL EST UN PLAFOND, LA VITAMINE K EST UNE STABILITÉ.
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L5`.
 *
 * ── ⛔ L'ERREUR DE CATÉGORIE QUE CE FICHIER REND IMPOSSIBLE ───────────────
 * `sodium_mg` est une valeur à MAXIMUM. Il n'existe pas de « besoin en sel »
 * qu'un plan pourrait manquer: la population française en avale 9-10 g de sel
 * par jour contre moins de 5 recommandés, et le produit n'a jamais eu de quoi
 * le voir. La faute symétrique — dire « vous êtes en dessous de votre besoin
 * en sel » — serait un conseil ACTIVEMENT nocif, rendu par un compteur qui a
 * l'air de fonctionner.
 *
 * Le verdict du sodium a donc TROIS valeurs et pas quatre:
 *
 *     `unknown`  on ne sait pas — au moins une ligne servie n'a pas de valeur
 *     `within`   sous le plafond, ZÉRO COMPRIS
 *     `above`    au-dessus du plafond
 *
 * ⛔ IL N'Y A PAS DE `below`, ET C'EST LA GARDE. `sodiumVerdict(0)` rend
 * `within`. Un jour sans une pincée de sel n'est pas un manque; c'est le seul
 * bout du domaine où ce produit n'a rien à dire. La liste `SODIUM_VERDICTS`
 * est exportée et assertée telle quelle dans le test: ajouter un quatrième
 * membre fait rougir, ce qui est la seule façon de tenir une ABSENCE.
 *
 * ⚠️ La même erreur guette la vitamine D et la B12, qui sont des AS (apports
 * satisfaisants) et pas des RNP — porte G6. Ce fichier ne les porte pas; il
 * porte la forme qu'elles devront prendre.
 *
 * ── ⛔ LA VITAMINE K SE TIENT STABLE, ELLE NE SE TIENT PAS BASSE ──────────
 * La warfarine est un antivitamine K: ce qui déstabilise l'INR, c'est la
 * VARIATION de l'apport, pas son niveau. Un plan qui retire les épinards
 * « pour être prudent » fait exactement le mal qu'il croit éviter — et il le
 * fait en silence, parce qu'à masse constante changer d'espèce fait varier la
 * K de deux ordres de grandeur (épinard ≈ 480 µg/100 g, kale ≈ 700, courgette
 * ≈ 5). « Varier les légumes » défait la garde sans changer un seul gramme.
 *
 * Le verdict de stabilité a donc QUATRE valeurs, et `suppressed` est nommé à
 * part de `unstable` parce que les deux appellent des corrections OPPOSÉES:
 *
 *     `unknown`     au moins une journée n'a pas de K calculable, ou aucune
 *                   référence n'a été fournie
 *     `stable`      toutes les journées sont dans la bande autour de la
 *                   référence
 *     `suppressed`  au moins une journée est SOUS la bande ⇒ le plan a poussé
 *                   la K vers le bas. ⛔ Ce n'est PAS `stable`, et c'est tout
 *                   l'objet de ce module
 *     `unstable`    la bande est franchie, mais pas par le bas
 *
 * ── ⛔ CE MODULE N'INVENTE AUCUNE VALEUR DE RÉFÉRENCE ─────────────────────
 * `referenceUg` est un PARAMÈTRE, et `null` rend `unknown`. La référence d'un
 * porteur de warfarine est son apport HABITUEL, pas un chiffre de table: la
 * consigne clinique est « ne changez pas », pas « atteignez 90 µg ». Poser ici
 * une RNP ferait entrer par la fenêtre la question que la porte G6 tient
 * ouverte, et transformerait une consigne de stabilité en objectif de niveau.
 *
 * ── ⛔ LES SOMMES S'ABSTIENNENT, ELLES NE COMPLÈTENT PAS ──────────────────
 * `dailyVitaminKUg` rend `null` dès qu'une ligne servie n'a pas de valeur.
 * Une somme partielle de K est plus dangereuse qu'une absence de somme: elle
 * a l'air d'un chiffre. C'est la règle déjà écrite pour les macros de
 * `nutrientsOf`, appliquée là où elle mord le plus fort.
 *
 * ── CE FICHIER EST PUR ────────────────────────────────────────────────────
 * Aucune I/O, aucun accès base, aucun appel de modèle. Il ne connaît pas
 * `CompositionRef`: il prend des nombres et il rend des verdicts, pour que le
 * jour où `L9bis` / `L38` le branchent, le branchement soit la seule chose à
 * relire.
 */

// ---------------------------------------------------------------------------
// LE SODIUM — UN PLAFOND, ET RIEN D'AUTRE
// ---------------------------------------------------------------------------

/**
 * ⛔ LES TROIS SEULS VERDICTS DU SODIUM. IL N'Y EN A PAS UN QUATRIÈME.
 *
 * Cette constante est exportée POUR ÊTRE ASSERTÉE. C'est le seul moyen connu
 * de ce dépôt de tenir une absence: on ne peut pas écrire un test qui échoue
 * sur un membre qui n'existe pas encore, on peut écrire un test qui échoue
 * dès qu'un membre apparaît.
 */
export const SODIUM_VERDICTS = ["unknown", "within", "above"] as const;
export type SodiumVerdict = (typeof SODIUM_VERDICTS)[number];

/**
 * LE PLAFOND, EN MILLIGRAMMES DE SODIUM PAR JOUR.
 *
 * 2 000 mg de sodium = 5 g de sel (facteur 2,54 entre sel et sodium).
 * C'est la limite de l'OMS pour un adulte, reprise par l'ANSES et par le PNNS.
 *
 * ⛔ C'EST UN PLAFOND, PAS UNE CIBLE. Le nommer `SODIUM_TARGET_MG` aurait
 * suffi à faire écrire « vous n'atteignez pas votre cible » par le premier
 * appelant pressé.
 */
export const SODIUM_MAX_MG_PER_DAY = 2000;

/** Le facteur de conversion sel ⇄ sodium. Chlorure de sodium: 58,44 / 22,99. */
export const SALT_PER_SODIUM = 2.54;

/**
 * SOUS LE PLAFOND, OU AU-DESSUS. Jamais « en dessous du besoin ».
 *
 * ⛔ `0` rend `within`. C'est la ligne du fichier qui compte le plus.
 */
export function sodiumVerdict(
  mgPerDay: number | null,
  maxMgPerDay: number = SODIUM_MAX_MG_PER_DAY,
): SodiumVerdict {
  if (mgPerDay === null || !Number.isFinite(mgPerDay)) return "unknown";
  if (mgPerDay < 0) return "unknown";
  return mgPerDay > maxMgPerDay ? "above" : "within";
}

/** Le sel équivalent, pour une phrase qui parle aux gens. Jamais un manque. */
export function saltGramsOf(sodiumMg: number | null): number | null {
  if (sodiumMg === null || !Number.isFinite(sodiumMg) || sodiumMg < 0) return null;
  return Math.round((sodiumMg * SALT_PER_SODIUM) / 100) / 10;
}

// ---------------------------------------------------------------------------
// LA SOMME D'UNE JOURNÉE — ET SON ABSTENTION
// ---------------------------------------------------------------------------

/** Une ligne servie: des grammes, et ce que 100 g en portent. */
export interface ServedLine {
  grams: number;
  /** `null` = le référentiel ne donne pas la valeur pour cet aliment. */
  per100g: number | null;
}

/**
 * La somme d'une journée, ou `null`.
 *
 * ⛔ UNE SEULE LIGNE SANS VALEUR SUFFIT À S'ABSTENIR. Additionner ce qu'on
 * connaît reviendrait à dire « ce plan porte 40 µg de K » d'un plan qui en
 * porte peut-être 500 — et c'est précisément la lecture sur laquelle un
 * porteur de warfarine réglerait sa dose.
 */
export function sumPer100g(lines: readonly ServedLine[]): number | null {
  if (lines.length === 0) return null;
  let total = 0;
  for (const l of lines) {
    if (l.per100g === null || !Number.isFinite(l.per100g)) return null;
    if (!Number.isFinite(l.grams) || l.grams < 0) return null;
    total += (l.per100g * l.grams) / 100;
  }
  return Math.round(total * 10) / 10;
}

/** La K d'une journée, en µg, ou `null`. Alias nommé de `sumPer100g`. */
export function dailyVitaminKUg(lines: readonly ServedLine[]): number | null {
  return sumPer100g(lines);
}

/** Le sodium d'une journée, en mg, ou `null`. Alias nommé de `sumPer100g`. */
export function dailySodiumMg(lines: readonly ServedLine[]): number | null {
  return sumPer100g(lines);
}

// ---------------------------------------------------------------------------
// LA VITAMINE K — LA STABILITÉ, PAS LE NIVEAU
// ---------------------------------------------------------------------------

/**
 * ⛔ `suppressed` EST NOMMÉ À PART DE `unstable`, ET CE N'EST PAS UN DÉTAIL.
 *
 * Les deux disent « la bande est franchie ». Ils n'appellent pas la même
 * correction: `unstable` demande de resserrer la composition, `suppressed`
 * demande de REMETTRE des légumes verts. Un seul mot pour les deux ferait
 * corriger dans la direction qui aggrave.
 */
export const VITAMIN_K_STABILITY_VERDICTS = [
  "unknown",
  "stable",
  "suppressed",
  "unstable",
] as const;
export type VitaminKStabilityVerdict =
  (typeof VITAMIN_K_STABILITY_VERDICTS)[number];

/**
 * LA DEMI-LARGEUR DE LA BANDE, EN PART DE LA RÉFÉRENCE.
 *
 * ±30 % est une CONVENTION AVOUÉE, pas une mesure: la littérature clinique
 * dit « constant », sans chiffre opposable. La direction du choix est écrite:
 * une bande trop large laisserait passer un doublement, une bande trop étroite
 * rendrait `unstable` sur du bruit de composition. On paie le second.
 */
export const VITAMIN_K_STABILITY_TOLERANCE = 0.3;

export interface VitaminKStabilityInput {
  /**
   * L'APPORT HABITUEL, en µg/jour. `null` ⇒ `unknown`.
   *
   * ⛔ CE MODULE NE LE DEVINE PAS. Une référence inventée transformerait la
   * consigne « ne changez pas » en objectif de niveau, c'est-à-dire en la
   * question que la porte G6 tient ouverte.
   */
  referenceUg: number | null;
  /** Une entrée par journée du plan. `null` = journée non calculable. */
  dailyUg: readonly (number | null)[];
  tolerance?: number;
}

export interface VitaminKStability {
  verdict: VitaminKStabilityVerdict;
  /** Les bornes de la bande, quand elles existent. */
  lowUg: number | null;
  highUg: number | null;
  /** Les indices des journées hors bande, par le bas puis par le haut. */
  belowDays: number[];
  aboveDays: number[];
}

/**
 * LA K TIENT-ELLE ?
 *
 * ⛔ UN PLAN QUI POUSSE LA K VERS LE BAS N'EST PAS `stable`. C'est le seul
 * comportement que ce lot avait à garantir, et il est testé par un cas qui
 * MORD (sept journées à 12 µg, parfaitement constantes, référence 120 ⇒
 * `suppressed`) et par un cas qui PASSE (sept journées entre 95 et 140 ⇒
 * `stable`). Une garde sans cas qui passe est une garde qui bloque tout.
 */
export function vitaminKStability(
  input: VitaminKStabilityInput,
): VitaminKStability {
  const tolerance = input.tolerance ?? VITAMIN_K_STABILITY_TOLERANCE;
  const ref = input.referenceUg;
  const abstain: VitaminKStability = {
    verdict: "unknown",
    lowUg: null,
    highUg: null,
    belowDays: [],
    aboveDays: [],
  };
  if (ref === null || !Number.isFinite(ref) || ref <= 0) return abstain;
  if (input.dailyUg.length === 0) return abstain;
  if (input.dailyUg.some((d) => d === null || !Number.isFinite(d))) return abstain;
  if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance >= 1) return abstain;

  const lowUg = Math.round(ref * (1 - tolerance) * 10) / 10;
  const highUg = Math.round(ref * (1 + tolerance) * 10) / 10;
  const belowDays: number[] = [];
  const aboveDays: number[] = [];
  input.dailyUg.forEach((d, i) => {
    const v = d as number;
    if (v < lowUg) belowDays.push(i);
    else if (v > highUg) aboveDays.push(i);
  });

  // ⛔ LE BAS L'EMPORTE SUR LE HAUT, ET C'EST DÉLIBÉRÉ. Un plan qui sort de la
  // bande des deux côtés a d'abord un problème de suppression: c'est celui des
  // deux dont la correction est urgente et contre-intuitive.
  const verdict: VitaminKStabilityVerdict = belowDays.length > 0
    ? "suppressed"
    : aboveDays.length > 0
    ? "unstable"
    : "stable";
  return { verdict, lowUg, highUg, belowDays, aboveDays };
}

// ---------------------------------------------------------------------------
// LA LISTE FERMÉE DES ALIMENTS À K ÉLEVÉE
// ---------------------------------------------------------------------------

/**
 * LE SEUIL « ALIMENT À K ÉLEVÉE », EN µg POUR 100 g.
 *
 * 100 µg/100 g est le palier utilisé en conseil warfarine: au-delà, une
 * portion ordinaire (80-150 g) déplace l'apport de la journée entière. En
 * dessous, il faudrait un kilo pour bouger l'aiguille.
 *
 * ⚠️ Le seuil n'est PAS la source de la liste publiée: il en est le FILET.
 * C'est la forme de `L-C` — la liste est écrite en toutes lettres dans la
 * migration, et le script refuse (`rc=1`) qu'une ligne attrapable par le seuil
 * en soit absente.
 */
export const HIGH_VITAMIN_K_UG_PER_100G = 100;

export function isHighVitaminK(ugPer100g: number | null): boolean {
  return ugPer100g !== null && Number.isFinite(ugPer100g) &&
    ugPer100g >= HIGH_VITAMIN_K_UG_PER_100G;
}
