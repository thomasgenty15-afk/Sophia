// KEEL — UN TROU DANS LE DOCUMENT DU COACH, LU COMME LA DÉCISION QU'IL EST.
//
// ── POURQUOI CE FICHIER EXISTE, ET CE QU'IL A DÉBLOQUÉ ─────────────────────
// `gapQuestion` vivait dans `api/labels.ts`. Elle n'a qu'UN appelant —
// `pages/PlanImportPage.tsx`, l'écran d'import du coach — mais `labels.ts` est
// le module de mots PARTAGÉ entre l'élève et le coach: `/app/today` l'importe
// pour rendre les phrases d'engagement.
//
// Conséquence mesurée au lot 4: `/app/today` ATTEIGNAIT `review.*` par ce seul
// chemin d'import, alors qu'elle ne peut pas l'afficher — il n'y a pas de trou
// d'extraction sur l'écran du jour. La frontière étant à la maille du
// namespace, déclarer `/app/today` française aurait exigé de traduire les 44
// clés `review.*` de l'écran d'import du coach, pour du texte qu'aucun élève ne
// verra jamais. La fonction est donc rangée là où elle est lue.
//
// ── ELLE EST ANGLAISE PAR CONSTRUCTION, ET CE N'EST PAS UN OUBLI ───────────
// Elle DÉCOUPE une phrase anglaise: les deux préambules ci-dessous sont des
// expressions régulières sur « The document says / asks for / sets no … »,
// c'est-à-dire sur la sortie de l'EXTRACTEUR, qui écrit en anglais. Sur une
// description française elles ne mordent pas et la fonction retombe sur la
// question générique. Traduire `review.gap_question` ne suffirait donc pas: on
// obtiendrait une coquille française autour d'un sujet anglais.
//
// C'est un chantier à part — la langue de SORTIE de l'extracteur —, il
// appartient au lot des écrans coach, et il se voit ici plutôt que d'être
// dilué dans un fichier de 700 lignes.

import { t } from "../i18n/t";

// L'extracteur décrit un trou comme un rapport le ferait: « The document asks
// for retesting vitamin D in 8 weeks, but no standalone retest commitment is
// prescribed. » C'est un constat SUR le document. Ce dont le coach a besoin,
// c'est de la décision qu'il contient.
//
// Deux préambules, parce que l'extracteur écrit le trou par les deux bouts: le
// positif nomme quelque chose que le document mentionne (« asks for retesting
// vitamin D »), le négatif nomme quelque chose qui lui manque (« sets no
// explicit hydration target »). Les deux laissent un groupe nominal auquel le
// coach peut répondre oui ou non; tout le reste retombe sur la question
// générique, avec la phrase complète en dessous.
const GAP_PREAMBLE =
  /^the (?:document|plan)\s+(?:says|states|mentions|notes|asks for|asks|requires|calls for|prescribes|specifies)\s+(?:that\s+)?(?:to\s+)?/i;
const GAP_NEGATIVE_PREAMBLE =
  /^the (?:document|plan)\s+(?:(?:does not|doesn't)\s+(?:specify|prescribe|give|set|include|mention|state|define)|(?:sets|gives|contains|has|includes|provides)\s+no)\s+/i;
const GAP_TAIL = /(?:,?\s*(?:but|although|though|however|while)\b|\s+despite\b).*$/i;
const GAP_SUBJECT_MAX = 90;

function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * A gap, read as the question it is: "Retest vitamin D in 8 weeks - do you
 * want that tracked?".
 *
 * The negation is deliberately NOT stripped ("says not to stack them" keeps
 * its "not to"): a shorter title that inverts the coach's meaning is worse
 * than an awkward one. When no subject can be isolated, the generic question
 * is used and the full description carries the detail underneath — the screen
 * never invents a prescription the document does not contain.
 */
export function gapQuestion(description: string): string {
  const subject = description
    .trim()
    .replace(GAP_PREAMBLE, "")
    .replace(GAP_NEGATIVE_PREAMBLE, "")
    .replace(GAP_TAIL, "")
    .replace(/\.\s*$/, "")
    .trim();
  if (subject === "" || subject.length > GAP_SUBJECT_MAX) {
    return t("review.gap_question_generic");
  }
  return t("review.gap_question", { subject: capitalizeFirst(subject) });
}
