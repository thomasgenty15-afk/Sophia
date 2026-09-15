import { describe, expect, it } from "vitest";

import {
  blockOf,
  HOUSEHOLD_SUBJECT,
  itemsInBlock,
  KNOWN_BLOCKS,
  type MemoLine,
  preferenceSideOf,
  type RetainedItem,
  visibleDuplicates,
} from "./retainedItems";

// ===========================================================================
// LOT D · LA CARTE MONTRE TROIS CHOSES, UNE FOIS CHACUNE
//
// ── LE DÉFAUT QUE CE FICHIER GARDE ────────────────────────────────────────
// La nomenclature (§2.3) pose que les trois destinations sont SANS
// RECOUVREMENT. Pour le magasin structuré, c'est le TYPE qui le tient:
// `blockOf` rend un bloc et un seul. Entre ce magasin et le MÉMO, rien ne le
// tenait — ce sont deux magasins, et c'est un classifieur qui décide lequel
// reçoit. Un classifieur qui hésite range « pas de saumon pour Tom » des deux
// côtés, et la personne lit la même chose deux fois sans savoir laquelle
// compte.
//
// ⚠️ CE FICHIER EXISTE PARCE QUE §7.3 L'EXIGE EN CES TERMES: « la règle
// anti-doublon a un test, pas seulement une phrase ».
// ===========================================================================

const TOM = "member:11111111-1111-4111-8111-111111111111" as const;
const LEA = "member:22222222-2222-4222-8222-222222222222" as const;

function item(over: Partial<RetainedItem> = {}): RetainedItem {
  return {
    kind: "food.exclude",
    scope: "durable",
    subject: TOM,
    source: "written",
    text: "saumon",
    at: "2026-09-03",
    item: "",
    confidence: null,
    quote: null,
    value: null,
    ...over,
  } as RetainedItem;
}

function memoLine(over: Partial<MemoLine> = {}): MemoLine {
  return {
    text: "saumon",
    at: "2026-09-03",
    source: "draft_note",
    quote: "pas de saumon pour Tom",
    subject: TOM,
    when: null,
    ...over,
  };
}

describe("chaque ligne a UN bloc, et un seul", () => {
  it("aucune famille ne tombe dans deux blocs", () => {
    // ⛔ LA GARDE STRUCTURELLE. `blockOf` rend un bloc; si un jour deux blocs
    // se partageaient une famille, la même ligne s'afficherait deux fois sur
    // l'écran dont toute la promesse est de ne rien montrer deux fois.
    const rows: RetainedItem[] = [
      item({ kind: "food.exclude" }),
      item({ kind: "food.prefer" }),
      item({ kind: "method.avoid" }),
      item({ kind: "method.prefer" }),
      item({
        kind: "portion.adjust",
        value: { direction: "down", magnitude: "slight" },
      }),
      item({
        kind: "rhythm.set",
        value: { occasion: "dinner", present: false },
      }),
      item({
        kind: "logistics.set",
        value: { field: "variety", value: "varied" },
      }),
      item({ kind: "craving", scope: "next_plan" }),
    ];
    for (const row of rows) {
      const blocks = KNOWN_BLOCKS.filter((block) =>
        itemsInBlock([row], block).length > 0
      );
      expect(blocks, `${row.kind} apparaît dans ${blocks.length} blocs`)
        .toHaveLength(1);
      expect(blocks[0]).toBe(blockOf(row));
    }
  });

  it("le total des blocs redonne le magasin, sans perte ni doublon", () => {
    // ⚠️ LA MOITIÉ QUI ATTRAPE LA PERTE. Le test du dessus prouve qu'aucune
    // ligne n'est dans DEUX blocs; il resterait vert sur un `blockOf` qui en
    // oublierait une — elle serait alors dans ZÉRO bloc, invisible à l'écran,
    // et bien vivante dans le prompt.
    const rows: RetainedItem[] = [
      item({ kind: "food.exclude" }),
      item({ kind: "method.prefer", subject: LEA }),
      item({
        kind: "portion.adjust",
        subject: HOUSEHOLD_SUBJECT,
        value: { direction: "up", magnitude: "clear" },
      }),
      item({ kind: "craving", scope: "next_plan" }),
    ];
    const seen = KNOWN_BLOCKS.flatMap((block) => itemsInBlock(rows, block));
    expect(seen).toHaveLength(rows.length);
    expect(new Set(seen).size).toBe(rows.length);
  });

  it("les deux listes de préférences se partagent le bloc sans le trouer", () => {
    const rows = [
      item({ kind: "food.exclude" }),
      item({ kind: "method.avoid" }),
      item({ kind: "food.prefer" }),
      item({ kind: "method.prefer" }),
    ];
    const preferences = itemsInBlock(rows, "preferences");
    const noMore = preferences.filter((r) => preferenceSideOf(r) === "no_more");
    const again = preferences.filter((r) => preferenceSideOf(r) === "again");
    expect(noMore).toHaveLength(2);
    expect(again).toHaveLength(2);
    // ⛔ AUCUNE LIGNE SANS CÔTÉ: elle serait dans le bloc et dans aucune de ses
    // deux listes, c'est-à-dire invisible sous un titre qui la promet.
    expect(noMore.length + again.length).toBe(preferences.length);
  });
});

describe("la règle anti-doublon a un test, pas seulement une phrase", () => {
  it("le même aliment en préférence ET en note est DÉTECTÉ", () => {
    const found = visibleDuplicates({
      items: [item({ text: "saumon" })],
      memo: [memoLine({ text: "saumon" })],
    });
    expect(found).toHaveLength(1);
    expect(found[0].subject).toBe(TOM);
    expect(found[0].text).toBe("saumon");
  });

  it("la casse et les espaces ne sauvent pas le doublon", () => {
    // C'est la même normalisation que partout ailleurs dans ce chantier. Sans
    // elle, « Saumon » et « saumon » passeraient pour deux faits différents.
    const found = visibleDuplicates({
      items: [item({ text: "  Saumon " })],
      memo: [memoLine({ text: "saumon" })],
    });
    expect(found).toHaveLength(1);
  });

  it("⛔ ET IL NE MORD PAS SUR CE QUI N'EST PAS UN DOUBLON", () => {
    // ⚠️ SANS CETTE MOITIÉ, UNE FONCTION QUI RENDRAIT TOUT SERAIT VERTE — et
    // l'écran afficherait un avertissement permanent, que plus personne ne
    // lirait au bout de deux jours.
    expect(
      visibleDuplicates({
        items: [item({ text: "saumon", subject: TOM })],
        // la même phrase, une AUTRE bouche
        memo: [memoLine({ text: "saumon", subject: LEA })],
      }),
    ).toEqual([]);
    expect(
      visibleDuplicates({
        items: [item({ text: "saumon" })],
        // un AUTRE texte, la même bouche
        memo: [memoLine({ text: "cabillaud" })],
      }),
    ).toEqual([]);
    // ⛔ ET « laitue » n'est PAS « lait »: égalité, jamais ressemblance.
    expect(
      visibleDuplicates({
        items: [item({ text: "lait" })],
        memo: [memoLine({ text: "laitue" })],
      }),
    ).toEqual([]);
  });

  it("un magasin vide ne rend rien, et ne lève pas", () => {
    expect(visibleDuplicates({ items: [], memo: [] })).toEqual([]);
  });
});
