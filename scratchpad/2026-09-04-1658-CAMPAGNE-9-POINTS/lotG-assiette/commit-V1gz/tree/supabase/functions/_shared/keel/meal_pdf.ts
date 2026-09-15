/**
 * LE PDF — la liste de courses et la fiche repas, sur une feuille.
 *
 * ── POURQUOI UN PDF ET PAS UN MESSAGE ────────────────────────────────────
 * Une liste de courses se lit DANS un magasin, en tenant un panier, souvent
 * sans réseau. Un message WhatsApp de trente lignes se perd derrière trois
 * conversations; un document reste en tête de fil, s'ouvre hors ligne et se
 * garde.
 *
 * ── CE QUE CE FICHIER N'EST PAS ──────────────────────────────────────────
 * Un moteur de mise en page. `pdf-lib` n'a ni retour à la ligne, ni pagination
 * automatique: les deux sont écrits ici, à la main, et volontairement simples.
 * La règle de lisibilité choisie est qu'une ligne coupée reste lisible; un
 * rendu élégant qui perd le dernier ingrédient d'une page serait un rendu qui
 * fait rater un ingrédient.
 *
 * ── AUCUN CHIFFRE NUTRITIONNEL ───────────────────────────────────────────
 * Ce fichier ne fait que rendre ce que `parseGeneratedMeal` a déjà filtré. Il
 * n'ajoute AUCUN calcul: pas de total, pas de « portions », rien qui
 * ressemblerait à une mesure. Un PDF qui additionnerait quoi que ce soit
 * réintroduirait par la porte du rendu ce que le générateur a retiré.
 */

import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import type { GeneratedDish, ShoppingAisle, ShoppingItem } from "./meal_generation.ts";
import { type LocalePackKey, localePackKey } from "./locale.ts";

/** Les intitulés de rayon, dans l'ordre où on parcourt un magasin. */
const AISLE_ORDER: ShoppingAisle[] = [
  "produce",
  "protein",
  "dairy",
  "grains",
  "frozen",
  "pantry",
  "other",
];

/**
 * TOUT CE QUI PORTE LA LANGUE DE LA FEUILLE, dans UN objet par locale.
 *
 * Le fichier n'avait aucun champ de langue: `MealPdfInput` portait un prénom,
 * des plats, une liste et une date déjà formatée — et trois phrases anglaises
 * en dur. Un élève français recevait donc « Your shopping list » au-dessus de
 * plats français, générés par un modèle à qui on avait dit d'écrire en
 * français. Le document est la seule surface du produit qui SORT de l'app: on
 * l'ouvre au magasin, on le garde.
 */
type MealPdfPack = {
  aisleLabels: Record<ShoppingAisle, string>;
  /** Le titre change avec le mode, pas avec le contenu. */
  headline: (mode: "from_pantry" | "to_shop") => string;
  /** L'intitulé de la liste. Même règle. */
  listHeading: (mode: "from_pantry" | "to_shop") => string;
  nothingToBuy: string;
  contextPrefix: (context: string) => string;
  /** La marque devant un ingrédient: déjà là, ou à acheter. */
  markHave: string;
  markBuy: string;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * QUAND ACHETER — LA MOITIÉ QUE CE DOCUMENT NE POUVAIT PAS CALCULER.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE PDF EST LA SEULE SURFACE QUI NE PEUT PAS S'EN PASSER. L'écran
   * recalcule ses vagues à partir des préparations (`grocery_waves.ts`);
   * `meal-document-v1`, lui, ne lit que `dishes` et `shopping_list` — ni
   * `preparations`, ni `starts_on`. Il ne PEUT donc rien dater tout seul, et
   * c'est exactement pour lui que `shopping_list[].buy_on` a été posé sur la
   * ligne le 2026-09-01.
   *
   * ⚠️ C'est la feuille qu'on emporte au magasin. Une liste sans jour s'y lit
   * « achète tout maintenant » — le défaut rapporté, imprimé sur papier.
   */
  buyAllOn: (date: string) => string;
  buyOnDate: (date: string) => string;
};

const MEAL_PDF_PACKS: Record<LocalePackKey, MealPdfPack> = {
  en: {
    aisleLabels: {
      produce: "Fruit & veg",
      protein: "Meat & fish",
      dairy: "Dairy",
      grains: "Grains & bread",
      frozen: "Frozen",
      pantry: "Cupboard",
      other: "Other",
    },
    headline: (mode) =>
      mode === "to_shop" ? "Your shopping list" : "Cooking with what you have",
    listHeading: (mode) => (mode === "to_shop" ? "To buy" : "You still need"),
    nothingToBuy: "Nothing to buy — you have everything.",
    contextPrefix: (context) => `You told us: ${context}`,
    markHave: "have",
    markBuy: "buy",
    buyAllOn: (date) => `Buy it all on ${date} — nothing here spoils before it is cooked.`,
    buyOnDate: (date) => `Buy on ${date}`,
  },
  fr: {
    aisleLabels: {
      produce: "Fruits & légumes",
      protein: "Viande & poisson",
      dairy: "Crèmerie",
      grains: "Féculents & pain",
      frozen: "Surgelés",
      pantry: "Épicerie",
      other: "Divers",
    },
    headline: (mode) =>
      mode === "to_shop"
        ? "Ta liste de courses"
        : "Cuisiner avec ce que tu as",
    listHeading: (mode) => (mode === "to_shop" ? "À acheter" : "Il te manque"),
    nothingToBuy: "Rien à acheter — tu as déjà tout.",
    contextPrefix: (context) => `Tu nous as dit : ${context}`,
    markHave: "j'ai",
    markBuy: "acheter",
    buyAllOn: (date) =>
      `Tout est à acheter le ${date} — rien ici ne se gâte d'ici sa cuisson.`,
    buyOnDate: (date) => `À acheter le ${date}`,
  },
};

/** R7 par délégation: une langue non livrée jette, elle ne retombe pas. */
export function mealPdfPackFor(locale: string): MealPdfPack {
  return MEAL_PDF_PACKS[localePackKey(locale)];
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMMENT LA LISTE SE DÉCOUPE — LA DÉCISION, SÉPARÉE DU RENDU.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ EXTRAITE PARCE QUE LE RENDU N'EST PAS TESTABLE. La convention de ce
 * fichier, écrite dans son propre test, est qu'« on ne relit pas le texte dans
 * les octets d'un PDF (il est compressé) ». Une règle laissée en ligne dans
 * `buildMealPdf` serait donc une règle que RIEN ne peut vérifier — et c'est
 * exactement la forme de lot désarmé que ce dépôt paie en boucle.
 *
 * ── TROIS SORTIES, ET LA TROISIÈME EST LE COMPORTEMENT D'AVANT ────────────
 *   · `by_day`  — plusieurs jours d'achat: une section par jour;
 *   · `flat` + `buyOn` — un seul jour: une LIGNE au-dessus de la liste plate.
 *     Même arbitrage que l'écran (`ShoppingListPanel`): une vague ne se
 *     DÉCOUPE pas, ce qui manquait n'était pas un découpage mais une date;
 *   · `flat` + `buyOn: null` — aucune date: la feuille d'avant, au caractère
 *     près. C'est tout plan écrit avant le 2026-09-01, qu'aucune migration ne
 *     répare, et se taire est la seule réponse vraie.
 *
 * ⛔ LA GARDE EST « TOUTES DATÉES », PAS « AU MOINS UNE ». Une liste à moitié
 * datée découpée par jour laisserait les lignes sans date HORS de toute
 * section — et « rien ne disparaît » est la propriété que les vagues tiennent
 * avant toutes les autres.
 *
 * PURE: aucune mise en forme, aucune langue, aucun octet.
 */
export type ShoppingSections<T> =
  | { kind: "flat"; items: readonly T[]; buyOn: string | null }
  | { kind: "by_day"; days: { buyOn: string; items: T[] }[] };

export function shoppingSections<T extends { buy_on?: string | null }>(
  items: readonly T[],
): ShoppingSections<T> {
  const days: string[] = [];
  for (const item of items) {
    const day = item.buy_on ?? null;
    if (day && !days.includes(day)) days.push(day);
  }
  days.sort();
  const allDated = items.length > 0 &&
    items.every((i) => (i.buy_on ?? null) !== null);
  if (!allDated || days.length === 0) return { kind: "flat", items, buyOn: null };
  if (days.length === 1) return { kind: "flat", items, buyOn: days[0] };
  return {
    kind: "by_day",
    days: days.map((buyOn) => ({
      buyOn,
      items: items.filter((i) => (i.buy_on ?? null) === buyOn),
    })),
  };
}

const PAGE = { width: 595.28, height: 841.89 }; // A4 portrait, en points
const MARGIN = 56;
const LINE = 16;

// ---------------------------------------------------------------------------
// LA BOMBE — `StandardFonts.Helvetica` encode en WinAnsi, et pdf-lib LÈVE
// ---------------------------------------------------------------------------

/**
 * Les caractères que WinAnsi (CP1252) sait encoder, EN CODES UNICODE.
 *
 * ── POURQUOI CETTE TABLE EXISTE, ET CE QU'ELLE A COÛTÉ ────────────────────
 * `pdf-lib` n'encode pas « au mieux »: `widthOfTextAtSize` et `drawText`
 * LÈVENT tous les deux sur un caractère hors WinAnsi. Le français passe
 * presque entièrement (é è à ç ô « » — sont tous dans CP1252), ce qui rend le
 * défaut d'autant plus vicieux: le document sort bien 95 fois sur 100. Mais un
 * modèle qui écrit du français produit régulièrement U+202F (l'espace fine
 * insécable avant `? ! ; :`) et U+2011 (le trait d'union insécable), et ni
 * l'un ni l'autre n'existe en CP1252. Résultat: `meal-document-v1` rend un
 * **500**, pas un PDF dégradé — l'élève ne reçoit rien du tout, et la ligne
 * `student_meal_documents` n'est jamais écrite.
 *
 * ── POURQUOI PAS UNE TTF VIA FONTKIT ──────────────────────────────────────
 * Embarquer une police Unicode réglerait le problème d'encodage et en
 * ouvrirait trois: un binaire de ~300 ko dans le bundle edge, un
 * `registerFontkit` de plus, et un document qui grossit d'autant. La question
 * n'est pas « comment afficher toute langue » — deux langues sont livrées, et
 * les deux tiennent dans CP1252. La question est « comment ne pas rendre un
 * 500 sur une espace ».
 */
const WINANSI_HIGH_RANGE: ReadonlyArray<readonly [number, number]> = [
  [0x20, 0x7e], // ASCII imprimable
  [0xa1, 0xff], // Latin-1 supplement (0xA0 est traité comme une espace, plus bas)
];

/** Les 27 codes du bloc 0x80-0x9F de CP1252, par point de code Unicode. */
const WINANSI_CP1252_EXTRAS: ReadonlySet<number> = new Set([
  0x20ac, // €
  0x201a, // ‚
  0x0192, // ƒ
  0x201e, // „
  0x2026, // …
  0x2020, // †
  0x2021, // ‡
  0x02c6, // ˆ
  0x2030, // ‰
  0x0160, // Š
  0x2039, // ‹
  0x0152, // Œ
  0x017d, // Ž
  0x2018, // '
  0x2019, // '
  0x201c, // "
  0x201d, // "
  0x2022, // •
  0x2013, // –
  0x2014, // —
  0x02dc, // ˜
  0x2122, // ™
  0x0161, // š
  0x203a, // ›
  0x0153, // œ
  0x017e, // ž
  0x0178, // Ÿ
]);

/**
 * Les équivalents: ce qu'on REMPLACE plutôt que de le perdre.
 *
 * L'ordre de préférence est « le caractère le plus proche qui existe en
 * CP1252 », jamais « rien ». Une espace fine devient une espace; un trait
 * d'union insécable devient un trait d'union. La feuille se lit pareil.
 */
// ⚠️ ÉCRITE EN ÉCHAPPEMENTS, JAMAIS EN CARACTÈRES LITTÉRAUX. La moitié de ces
// caractères est INVISIBLE: une table écrite littéralement se relit à
// l'aveugle, et un `git diff` qui remplace une espace fine par une espace
// normale ne montre RIEN. L'échappement est ici la seule forme relisible.
const WINANSI_EQUIVALENTS: ReadonlyMap<string, string> = new Map([
  // Les espaces exotiques. U+202F est LE coupable mesure: l'espace fine
  // insecable, que tout modele ecrivant en francais pose avant `? ! ; :`.
  ["\u00A0", " "], // NO-BREAK SPACE — encodable, mais `wrap()` coupe dessus
  ["\u2002", " "], // EN SPACE
  ["\u2003", " "], // EM SPACE
  ["\u2004", " "],
  ["\u2005", " "],
  ["\u2006", " "],
  ["\u2007", " "], // FIGURE SPACE
  ["\u2008", " "],
  ["\u2009", " "], // THIN SPACE
  ["\u200A", " "],
  ["\u202F", " "], // NARROW NO-BREAK SPACE — le coupable n°1
  ["\u205F", " "],
  ["\u3000", " "], // IDEOGRAPHIC SPACE
  // Les traits. U+2011 est le second coupable: « demi-ecreme » revient
  // regulierement du modele avec un trait d'union insecable.
  ["\u2010", "-"], // HYPHEN
  ["\u2011", "-"], // NON-BREAKING HYPHEN — le coupable n°2
  ["\u2012", "-"], // FIGURE DASH
  ["\u2015", "\u2014"], // HORIZONTAL BAR -> EM DASH, qui EST en CP1252
  ["\u2212", "-"], // MINUS SIGN
  // Les invisibles: on les retire, ils ne portent rien sur une feuille A4.
  ["\u00AD", ""], // SOFT HYPHEN
  ["\u200B", ""], // ZERO WIDTH SPACE
  ["\u200C", ""],
  ["\u200D", ""],
  ["\u2060", ""], // WORD JOINER
  ["\uFEFF", ""], // BOM
  // Les apostrophes et guillemets « typographiques » hors CP1252.
  ["\u2032", "'"], // PRIME
  ["\u2035", "'"], // REVERSED PRIME
  ["\u201B", "'"], // SINGLE HIGH-REVERSED-9
  ["\u2033", '"'], // DOUBLE PRIME
  ["\u201F", '"'], // DOUBLE HIGH-REVERSED-9
]);

function isWinAnsiEncodable(codePoint: number): boolean {
  for (const [lo, hi] of WINANSI_HIGH_RANGE) {
    if (codePoint >= lo && codePoint <= hi) return true;
  }
  return WINANSI_CP1252_EXTRAS.has(codePoint);
}

/**
 * Rend `text` encodable par WinAnsi. À APPELER À L'ENTRÉE DE L'ÉCRITURE, une
 * fois, et jamais chez l'appelant.
 *
 * Trois passes, dans cet ordre, et l'ordre compte:
 *   1. NFC. « é » décomposé (e + U+0301) n'est PAS encodable, alors que « é »
 *      précomposé l'est. C'est la forme que produit macOS sur du texte collé,
 *      et elle traverse la génération sans se voir.
 *   2. les équivalents connus (table ci-dessus);
 *   3. le filet: tout ce qui reste hors WinAnsi est RETIRÉ, et SIGNALÉ.
 *
 * Le retrait est un dernier recours assumé: un émoji dans un titre de plat vaut
 * mieux perdu que rendu en 500. Il est journalisé pour que « la feuille a
 * mangé un caractère » soit constatable autrement que par un humain qui
 * compare deux PDF.
 */
export function toWinAnsi(text: string): string {
  const normalized = String(text ?? "").normalize("NFC");
  let out = "";
  const dropped: string[] = [];
  for (const ch of normalized) {
    const swap = WINANSI_EQUIVALENTS.get(ch);
    if (swap !== undefined) {
      out += swap;
      continue;
    }
    const cp = ch.codePointAt(0) ?? 0;
    if (isWinAnsiEncodable(cp)) {
      out += ch;
      continue;
    }
    dropped.push(`U+${cp.toString(16).toUpperCase().padStart(4, "0")}`);
  }
  if (dropped.length > 0) {
    console.warn(JSON.stringify({
      tag: "keel.meal_pdf.unencodable_dropped",
      code_points: [...new Set(dropped)].slice(0, 12),
      detail:
        "Helvetica encodes in WinAnsi (CP1252); these code points have no " +
        "equivalent and were removed rather than raising and losing the whole " +
        "document. Add an equivalent to WINANSI_EQUIVALENTS if one exists.",
    }));
  }
  return out;
}

interface Cursor {
  page: ReturnType<PDFDocument["addPage"]>;
  y: number;
}

/**
 * Coupe un texte à la largeur utile, en mots.
 *
 * Un mot plus long que la ligne est coupé brutalement plutôt qu'ignoré: un
 * ingrédient au nom interminable doit apparaître, même mal coupé.
 */
function wrap(
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  size: number,
  maxWidth: number,
): string[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
        lines.push(chunk);
        chunk = ch;
      } else chunk += ch;
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export interface MealPdfInput {
  /** Le prénom, pour que la feuille soit à quelqu'un. Jamais l'email. */
  firstName: string | null;
  dishes: readonly GeneratedDish[];
  shoppingList: readonly ShoppingItem[];
  /** Le contexte que l'élève a écrit, rappelé tel quel. */
  context: string | null;
  /** `from_pantry` change le titre de la liste, pas son contenu. */
  mode: "from_pantry" | "to_shop";
  /**
   * Date déjà formatée par l'appelant: ce module n'a pas d'horloge.
   *
   * L'appelant la formate DANS la même locale que celle passée juste en
   * dessous — « 4 August 2026 » sous « Ta liste de courses » serait la même
   * incohérence, en plus petit.
   */
  dateLabel: string;
  /**
   * LES JOURS D'ACHAT, DÉJÀ ÉCRITS DANS LA LANGUE DU DOCUMENT — 2026-09-01.
   *
   * `iso (YYYY-MM-DD)` → le libellé à imprimer. `{}` quand la liste n'est pas
   * datée (tout plan écrit avant ce lot), et le document rend alors la liste
   * plate d'avant, au caractère près.
   *
   * ⛔ FORMATÉS PAR L'APPELANT, ET C'EST DÉLIBÉRÉ. Ce module reçoit déjà
   * `dateLabel` tout fait: il RENDU, il ne met pas en forme. Ajouter ici un
   * second formateur de date ferait deux façons d'écrire un jour dans le même
   * produit — et c'est celle qu'on regarde le moins qui garderait l'ancienne.
   *
   * ⚠️ UNE DATE SANS LIBELLÉ S'IMPRIME BRUTE plutôt que de disparaître: on ne
   * perd pas un jour d'achat parce qu'on n'a pas su l'écrire joliment.
   */
  buyDateLabels: Readonly<Record<string, string>>;
  /**
   * A1 (2026-09-03) — LA PHRASE DU TIMING, DÉJÀ ÉCRITE DANS LA LANGUE DU
   * DOCUMENT. `null` = le plan est plus vieux que ce lot, et la feuille sort
   * exactement comme avant, au caractère près.
   *
   * ⛔ FORMATÉE PAR L'APPELANT, comme `dateLabel` et `buyDateLabels`. Ce module
   * RENDU, il ne met pas en forme: y calculer le timing lui ferait relire
   * `starts_on`, `lead_days` et une horloge qu'il n'a pas.
   *
   * ⚠️ ET C'EST LA FEUILLE QU'ON EMPORTE. Une liste de courses datée du jour
   * de cuisine, sans dire QUE c'est le jour de cuisine, se lit comme une
   * erreur de date — c'est le même défaut que « une liste sans jour se lit
   * achète tout maintenant », un cran plus loin.
   */
  timingLine: string | null;
  /**
   * La langue du DOCUMENT (`resolveArtifactLocale`). REQUISE.
   *
   * Ce champ n'existait pas. Les plats, eux, arrivaient déjà traduits — le
   * générateur reçoit un `contentLocale` depuis le lot précédent. Seule
   * l'ossature de la feuille restait anglaise, ce qui donnait un document
   * bilingue: « Your shopping list » au-dessus de « Poulet rôti au citron ».
   */
  locale: string;
}

/**
 * Rend le PDF et ses octets.
 *
 * PAS D'HORLOGE ICI: la date arrive formatée. Un module de rendu qui lit
 * `new Date()` devient intestable et se met à produire un document différent
 * selon l'heure à laquelle tourne le test.
 */
export async function buildMealPdf(input: MealPdfInput): Promise<Uint8Array> {
  const pack = mealPdfPackFor(input.locale);
  const doc = await PDFDocument.create();
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE.width - MARGIN * 2;
  const ink = rgb(0.1, 0.1, 0.12);
  const faded = rgb(0.42, 0.42, 0.46);

  const cur: Cursor = { page: doc.addPage([PAGE.width, PAGE.height]), y: PAGE.height - MARGIN };

  const room = (needed: number) => {
    if (cur.y - needed >= MARGIN) return;
    cur.page = doc.addPage([PAGE.width, PAGE.height]);
    cur.y = PAGE.height - MARGIN;
  };

  const write = (
    raw: string,
    opts: { size?: number; font?: typeof body; colour?: typeof ink; gap?: number } = {},
  ) => {
    const size = opts.size ?? 11;
    const font = opts.font ?? body;
    // ── LE SEUL POINT D'ENTRÉE DE TOUT TEXTE ────────────────────────────────
    //
    // Le nettoyage a lieu ICI et nulle part ailleurs, parce que `wrap()` appelle
    // `widthOfTextAtSize`, qui LÈVE sur un caractère hors WinAnsi exactement
    // comme `drawText`. Nettoyer au moment du dessin seulement laisserait la
    // mesure exploser d'abord, une ligne plus haut, avec un message d'erreur
    // qui parle de largeur et pas d'encodage.
    const text = toWinAnsi(raw);
    for (const line of wrap(text, font, size, maxWidth)) {
      room(LINE);
      cur.page.drawText(line, {
        x: MARGIN,
        y: cur.y,
        size,
        font,
        color: opts.colour ?? ink,
      });
      cur.y -= LINE;
    }
    if (opts.gap) cur.y -= opts.gap;
  };

  // ── En-tête ─────────────────────────────────────────────────────────────
  write(pack.headline(input.mode), { size: 20, font: bold });
  write(
    input.firstName ? `${input.firstName} · ${input.dateLabel}` : input.dateLabel,
    { size: 10, colour: faded, gap: 6 },
  );
  // A1 — SOUS LA DATE ET AVANT LE CONTEXTE. La séquence de lecture est « voici
  // ta feuille, voici QUAND ça se passe, voici la semaine dont tu parlais ».
  if (input.timingLine) {
    write(input.timingLine, { size: 10, colour: faded, gap: input.context ? 6 : 10 });
  }
  if (input.context) {
    // Le contexte est rappelé pour que l'élève reconnaisse SA semaine sur la
    // feuille — c'est ce qui distingue ce document d'une liste générique.
    write(pack.contextPrefix(input.context), { size: 10, colour: faded, gap: 10 });
  }

  // ══════════════════════════════════════════════════════════════════════
  // LA LISTE — PAR JOUR D'ACHAT, PUIS PAR RAYON (2026-09-01)
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE JOUR VIENT DE LA LIGNE, IL N'EST PAS CALCULÉ ICI. `buy_on` est posé
  // par la lane à partir de `grocery_waves.ts`, la seule définition de la
  // règle. Ce document ne reçoit ni les préparations ni la date de départ du
  // plan: il ne POURRAIT pas la recalculer, et c'est précisément pour lui que
  // le champ a été posé sur la ligne.
  //
  // ⚠️ TROIS SORTIES, ET LA TROISIÈME EST LE COMPORTEMENT D'AVANT:
  //   · plusieurs jours ⇒ une section par jour, et le rayon dedans;
  //   · un seul jour    ⇒ une ligne au-dessus de la liste plate (même
  //                       arbitrage que l'écran: une vague ne se DÉCOUPE pas,
  //                       ce qui manquait n'est pas un découpage mais une date);
  //   · aucun jour      ⇒ la liste plate, au caractère près. C'est le cas de
  //                       tout plan écrit avant ce lot, qu'aucune migration ne
  //                       répare, et se taire est la seule réponse vraie.
  if (input.shoppingList.length > 0) {
    write(pack.listHeading(input.mode), { size: 14, font: bold, gap: 4 });
    const sections = shoppingSections(input.shoppingList);
    const writeAisles = (items: readonly ShoppingItem[]) => {
      for (const aisle of AISLE_ORDER) {
        const inAisle = items.filter((i) => i.aisle === aisle);
        if (inAisle.length === 0) continue;
        room(LINE * 2);
        write(pack.aisleLabels[aisle], { size: 11, font: bold, colour: faded });
        for (const item of inAisle) {
          write(`  ${item.quantity ? `${item.quantity}  ` : ""}${item.term}`);
        }
        cur.y -= 6;
      }
    };
    if (sections.kind === "by_day") {
      for (const day of sections.days) {
        room(LINE * 3);
        write(pack.buyOnDate(input.buyDateLabels[day.buyOn] ?? day.buyOn), {
          size: 12,
          font: bold,
          gap: 2,
        });
        writeAisles(day.items);
      }
    } else {
      if (sections.buyOn !== null) {
        write(pack.buyAllOn(input.buyDateLabels[sections.buyOn] ?? sections.buyOn), {
          size: 11,
          colour: faded,
          gap: 6,
        });
      }
      writeAisles(sections.items);
    }
    } else if (input.mode === "from_pantry") {
    write(pack.nothingToBuy, { size: 11, gap: 10 });
  }

  // ── Les plats ───────────────────────────────────────────────────────────
  for (const d of input.dishes) {
    room(LINE * 4);
    cur.y -= 8;
    write(d.title, { size: 14, font: bold });
    if (d.why) write(d.why, { size: 10, colour: faded, gap: 4 });

    for (const ing of d.ingredients) {
      // Ce que l'élève a déjà est marqué. C'est la seule information du
      // document qui vient d'une VÉRIFICATION et pas du modèle, et c'est celle
      // qui évite un aller-retour au magasin.
      const mark = ing.in_pantry ? pack.markHave : pack.markBuy;
      write(`  [${mark}] ${ing.quantity ? `${ing.quantity}  ` : ""}${ing.term}`, { size: 10 });
    }
    if (d.method) {
      cur.y -= 4;
      write(d.method, { size: 10, gap: 6 });
    }
  }

  return await doc.save();
}
