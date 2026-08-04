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

const AISLE_LABEL: Record<ShoppingAisle, string> = {
  produce: "Fruit & veg",
  protein: "Meat & fish",
  dairy: "Dairy",
  grains: "Grains & bread",
  frozen: "Frozen",
  pantry: "Cupboard",
  other: "Other",
};

const PAGE = { width: 595.28, height: 841.89 }; // A4 portrait, en points
const MARGIN = 56;
const LINE = 16;

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
  /** Date déjà formatée par l'appelant: ce module n'a pas d'horloge. */
  dateLabel: string;
}

/**
 * Rend le PDF et ses octets.
 *
 * PAS D'HORLOGE ICI: la date arrive formatée. Un module de rendu qui lit
 * `new Date()` devient intestable et se met à produire un document différent
 * selon l'heure à laquelle tourne le test.
 */
export async function buildMealPdf(input: MealPdfInput): Promise<Uint8Array> {
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
    text: string,
    opts: { size?: number; font?: typeof body; colour?: typeof ink; gap?: number } = {},
  ) => {
    const size = opts.size ?? 11;
    const font = opts.font ?? body;
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
  write(
    input.mode === "to_shop" ? "Your shopping list" : "Cooking with what you have",
    { size: 20, font: bold },
  );
  write(
    input.firstName ? `${input.firstName} · ${input.dateLabel}` : input.dateLabel,
    { size: 10, colour: faded, gap: 6 },
  );
  if (input.context) {
    // Le contexte est rappelé pour que l'élève reconnaisse SA semaine sur la
    // feuille — c'est ce qui distingue ce document d'une liste générique.
    write(`You told us: ${input.context}`, { size: 10, colour: faded, gap: 10 });
  }

  // ── La liste, groupée par rayon ─────────────────────────────────────────
  if (input.shoppingList.length > 0) {
    write(
      input.mode === "to_shop" ? "To buy" : "You still need",
      { size: 14, font: bold, gap: 4 },
    );
    for (const aisle of AISLE_ORDER) {
      const items = input.shoppingList.filter((i) => i.aisle === aisle);
      if (items.length === 0) continue;
      room(LINE * 2);
      write(AISLE_LABEL[aisle], { size: 11, font: bold, colour: faded });
      for (const item of items) {
        write(`  ${item.quantity ? `${item.quantity}  ` : ""}${item.term}`);
      }
      cur.y -= 6;
    }
  } else if (input.mode === "from_pantry") {
    write("Nothing to buy — you have everything.", { size: 11, gap: 10 });
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
      const mark = ing.in_pantry ? "have" : "buy";
      write(`  [${mark}] ${ing.quantity ? `${ing.quantity}  ` : ""}${ing.term}`, { size: 10 });
    }
    if (d.method) {
      cur.y -= 4;
      write(d.method, { size: 10, gap: 6 });
    }
  }

  return await doc.save();
}
