// FF-063 LOT 2 — CE QU'UN E-MAIL DE CYCLE DE VIE N'A PAS LE DROIT DE DIRE.
//
// Autorité: `docs/keel/LEGAL.md` §6.1 (interdits absolus, partout) et §6.2
// (Royaume-Uni, CAP Code section 13 — contrôle du poids et amaigrissement).
//
// ── POURQUOI CETTE GARDE NAÎT MAINTENANT ─────────────────────────────────
// Vérifié le 2026-09-09: il n'existe AUCUN contrôle automatique de la copie
// commerciale dans ce dépôt. `LEGAL.md` est cité dans trois commentaires de
// code et dans aucun test. Ça a tenu tant que la seule surface qui parlait de
// poids était la vitrine — relue à la main, changée rarement, par une personne
// qui avait le document ouvert.
//
// Les e-mails de cycle de vie cassent ces trois conditions à la fois: ils
// parlent de poids (c'est le positionnement du produit), ils se multiplient
// (onze types), et ils s'écrivent en deux langues par quelqu'un qui n'aura pas
// `LEGAL.md` sous les yeux. Une phrase de trop ne se verrait qu'à la plainte.
//
// ── LA PORTÉE, ET IL FAUT LA RESPECTER ───────────────────────────────────
// ⚠️ Cette garde est écrite pour la COPIE DES E-MAILS DE CYCLE DE VIE, et pour
// rien d'autre. Elle refuse un poids associé à une durée; un plan de foyer, lui,
// écrit légitimement « 2 kg de poulet pour la semaine ». Lui appliquer ces
// règles produirait des faux positifs sur du texte irréprochable — et une garde
// qui crie à tort finit désarmée.
//
// ── PAS DE MATCHER MAISON ────────────────────────────────────────────────
// Chaque règle est une expression régulière avec des BORDS DE MOT explicites.
// Ce dépôt a déjà payé un matcher par sous-chaîne qui prenait « laitue » pour
// « lait »: douze faux positifs sur douze mesurés. Et chaque règle nomme ses
// formes dans LES DEUX LANGUES — une garde écrite en français seul laisse
// passer l'anglais, ce qui est arrivé ici avec `not` qui ne couvrait pas
// `doesn't`.

/** Une violation trouvée: quelle règle, et la phrase qui la déclenche. */
export interface CopyViolation {
  rule: CopyRuleKey;
  /** La phrase fautive, telle quelle. C'est elle qu'on montre, pas un code. */
  sentence: string;
}

export type CopyRuleKey =
  /** Un poids chiffré dans la même phrase qu'une durée. CAP §13, l'interdit le
   *  plus souvent enfreint et le plus facile à repérer. */
  | "rate_over_period"
  /** Un poids chiffré promis: « perds 5 kg ». LEGAL §6.1. */
  | "promised_amount"
  /** Une garantie de résultat. LEGAL §6.1. */
  | "guarantee"
  /** Avant/après. LEGAL §6.1 — le format que les régulateurs regardent
   *  d'abord, et que Meta refuse avant même la question légale. */
  | "before_after"
  /** Une revendication de maladie. LEGAL §6.1 — la phrase qui fait basculer
   *  un logiciel de bien-être en dispositif médical. */
  | "disease_claim"
  /** Une comparaison à un professionnel de santé. LEGAL §6.1. */
  | "professional_comparison";

/** Un nombre suivi d'une unité de MASSE CORPORELLE, dans les deux langues. */
const WEIGHT_AMOUNT =
  /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|kilos?|kilogrammes?|lbs?|pounds?|livres?)\b/i;

/** Une durée. `\b` partout: « moisson » n'est pas « mois ». */
const PERIOD =
  /\b(?:jours?|semaines?|mois|ans?|années?|days?|weeks?|months?|years?)\b/i;

/** Perdre ou prendre du poids, conjugué à ce qu'un e-mail écrit vraiment. */
const LOSS_OR_GAIN_VERB =
  /\b(?:perds|perdez|perdre|perdu|maigris|maigrir|prends|prendre|pris|gagne|gagner|gagné|lose|losing|lost|shed|drop|gain|gaining|gained|put\s+on)\b/i;

const RULES: ReadonlyArray<{ key: CopyRuleKey; hit: (s: string) => boolean }> = [
  {
    key: "rate_over_period",
    hit: (s) => WEIGHT_AMOUNT.test(s) && PERIOD.test(s),
  },
  {
    key: "promised_amount",
    hit: (s) => WEIGHT_AMOUNT.test(s) && LOSS_OR_GAIN_VERB.test(s),
  },
  {
    key: "guarantee",
    hit: (s) =>
      /\b(?:garanti|garantie|garantis|garanties|garantit|guarantee|guaranteed|guarantees)\b/i
        .test(s),
  },
  {
    key: "before_after",
    hit: (s) =>
      /\bavant\s*(?:\/|-|et)\s*apr[eè]s\b/i.test(s) ||
      /\bbefore\s*(?:\/|-|and)\s*after\b/i.test(s),
  },
  {
    key: "disease_claim",
    hit: (s) =>
      /\b(?:pr[ée]diab[èe]te|diab[èe]te|ob[ée]sit[ée]|cholest[ée]rol|hypertension|thyro[ïi]de|prediabetes|diabetes|obesity|cholesterol|thyroid)\b/i
        .test(s) ||
      /\b(?:soigne|soigner|gu[ée]rit|gu[ée]rir|traite|traiter|inverse|inverser|cure|cures|heals?|treats?|reverses?)\s+(?:ton|ta|tes|votre|vos|le|la|les|your|the)\b/i
        .test(s),
  },
  {
    key: "professional_comparison",
    hit: (s) =>
      /\b(?:di[ée]t[ée]ticien\w*|nutritionniste\w*|m[ée]decin\w*|dietitians?|dieticians?|nutritionists?|doctors?)\b/i
        .test(s),
  },
];

/**
 * Découpe en phrases. Grossier EXPRÈS: les deux règles à deux conditions
 * (`rate_over_period`, `promised_amount`) n'ont de sens que si les deux termes
 * sont assez proches pour se lire ensemble. Sur un texte entier, « 3 kg » au
 * début et « semaine » à la fin déclencheraient une règle que personne n'a
 * enfreinte.
 *
 * Les balises HTML sont retirées d'abord: sans ça, `<br/>` et les attributs de
 * style entrent dans les phrases et cassent les bords de mot.
 */
function sentencesOf(text: string): string[] {
  return String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .split(/[.!?…\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Ce que ce texte enfreint. Tableau vide = rien.
 *
 * Rend TOUTES les violations, pas la première: une relecture qui corrige une
 * phrase et redécouvre la suivante au run d'après coûte un aller-retour par
 * faute.
 */
export function findForbiddenClaims(text: string): CopyViolation[] {
  const found: CopyViolation[] = [];
  for (const sentence of sentencesOf(text)) {
    for (const rule of RULES) {
      if (rule.hit(sentence)) found.push({ rule: rule.key, sentence });
    }
  }
  return found;
}

/**
 * Le lecteur des tests: jette avec la phrase fautive et la règle, jamais avec
 * un code seul. Un message qui ne montre pas le texte oblige à rouvrir le
 * fichier pour comprendre ce qu'on a écrit de mal.
 */
export function assertNoForbiddenClaim(text: string, where: string): void {
  const violations = findForbiddenClaims(text);
  if (violations.length === 0) return;
  const lines = violations
    .map((v) => `  [${v.rule}] « ${v.sentence} »`)
    .join("\n");
  throw new Error(
    `${where}: copie interdite par docs/keel/LEGAL.md §6\n${lines}`,
  );
}
