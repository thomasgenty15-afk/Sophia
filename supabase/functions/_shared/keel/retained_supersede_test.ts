/**
 * ══════════════════════════════════════════════════════════════════════════
 * CE QU'UNE PHRASE NEUVE DÉMENT — la seule règle de ce dépôt qui RETIRE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QU'ELLE FERME, MESURÉ SUR LE SEUL COMPTE RÉEL (2026-09-22) ──
 * Neuf souvenirs durables en trois jours, et rien ne pouvait en retirer un:
 * `next_plan` expire, `durable` jamais. « Plus de poisson » puis, deux jours
 * plus tard, « finalement du poisson le matin ça me va » laissait LES DEUX
 * lignes en base, servies ensemble au modèle. Une mémoire qui ne se dément
 * jamais n'apprend pas: elle accumule.
 *
 * ── ⛔ ET C'EST POURQUOI CE FICHIER EST LE PLUS PARANOÏAQUE DU LOT ────────
 * Toutes les autres règles AJOUTENT. Celle-ci EFFACE un souvenir que la
 * personne a donné. Un faux positif ici ne se rattrape pas — elle ne saura
 * même pas ce qui a disparu. Chaque cas « ça ne supersède PAS » compte donc
 * autant que les cas qui supersèdent, et il y en a délibérément plus.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  parseRetainedItem,
  type RetainedItem,
  type RetainedKind,
  supersedes,
} from "./retained_item.ts";

const ZOE = "member:33333333-3333-4333-8333-333333333333";
const MARC = "member:44444444-4444-4444-8444-444444444444";

function line(args: {
  kind: RetainedKind;
  text: string;
  subject?: string;
  occasion?: string | null;
  force?: "never" | "less";
  at?: string;
}): RetainedItem {
  const kind = args.kind;
  const wants = kind === "food.prefer" || kind === "method.prefer";
  const parsed = parseRetainedItem({
    kind,
    scope: "durable",
    subject: args.subject ?? ZOE,
    text: args.text,
    value: null,
    source: "draft_note",
    at: args.at ?? "2026-09-22",
    item: "",
    confidence: null,
    quote: args.text,
    occasion: args.occasion ?? null,
    ...(wants ? {} : { force: args.force ?? "never" }),
  });
  assert(parsed !== null, `item illisible: ${kind} / ${args.text}`);
  return parsed;
}

// ===========================================================================
// CE QUI DÉMENT
// ===========================================================================

Deno.test("⛔ LA POLARITÉ OPPOSÉE DÉMENT — « je n'en veux plus » puis « j'en veux »", () => {
  const prior = line({ kind: "food.exclude", text: "poisson", at: "2026-09-20" });
  const next = line({ kind: "food.prefer", text: "poisson", at: "2026-09-22" });
  assert(supersedes(next, prior), "les deux lignes contraires s'empilent encore");
});

Deno.test("⛔ ET DANS L'AUTRE SENS — « j'en veux » puis « je n'en veux plus »", () => {
  // Les deux moitiés: une règle qui ne mordrait que dans un sens laisserait la
  // moitié des contradictions en base.
  const prior = line({ kind: "food.prefer", text: "poisson", at: "2026-09-20" });
  const next = line({ kind: "food.exclude", text: "poisson", at: "2026-09-22" });
  assert(supersedes(next, prior));
});

Deno.test("les PRÉPARATIONS suivent la même règle", () => {
  const prior = line({ kind: "method.avoid", text: "friture", at: "2026-09-20" });
  const next = line({ kind: "method.prefer", text: "friture", at: "2026-09-22" });
  assert(supersedes(next, prior));
});

Deno.test("⛔ UNE FORCE QUI CHANGE DÉMENT — « plus jamais » devenu « un peu moins »", () => {
  // Garder les deux ferait mordre la ceinture sur la règle FORTE alors que la
  // personne vient de l'adoucir — c'est-à-dire que l'adoucissement n'aurait
  // aucun effet, et elle le découvrirait en remarquant une absence.
  const prior = line({ kind: "food.exclude", text: "fromage", force: "never", at: "2026-09-20" });
  const next = line({ kind: "food.exclude", text: "fromage", force: "less", at: "2026-09-22" });
  assert(supersedes(next, prior));
  assert(supersedes(
    line({ kind: "food.exclude", text: "fromage", force: "never", at: "2026-09-22" }),
    line({ kind: "food.exclude", text: "fromage", force: "less", at: "2026-09-20" }),
  ));
});

Deno.test("la casse et les espaces ne séparent pas deux fois le même aliment", () => {
  const prior = line({ kind: "food.exclude", text: "  Poisson ", at: "2026-09-20" });
  const next = line({ kind: "food.prefer", text: "poisson", at: "2026-09-22" });
  assert(supersedes(next, prior));
});

// ===========================================================================
// ⛔ CE QUI NE DÉMENT PAS — et c'est la moitié qui protège
// ===========================================================================

Deno.test("⛔ UNE AUTRE BOUCHE NE DÉMENT RIEN", () => {
  // Le pire faux positif possible: le goût de Marc effacerait celui de Zoé, et
  // personne ne saurait que la ligne a existé.
  const prior = line({ kind: "food.exclude", text: "poisson", subject: ZOE, at: "2026-09-20" });
  const next = line({ kind: "food.prefer", text: "poisson", subject: MARC, at: "2026-09-22" });
  assertEquals(supersedes(next, prior), false);
});

Deno.test("⛔ UN AUTRE MOMENT NE DÉMENT RIEN — deux règles qui COEXISTENT", () => {
  // « Pas de poisson le matin » et « du poisson le soir ça me va » ne se
  // contredisent pas: les fondre effacerait la moitié de ce qu'elle a dit.
  const prior = line({
    kind: "food.exclude", text: "poisson", occasion: "breakfast", at: "2026-09-20",
  });
  const next = line({
    kind: "food.prefer", text: "poisson", occasion: "dinner", at: "2026-09-22",
  });
  assertEquals(supersedes(next, prior), false);
});

Deno.test("⛔ « toute la journée » NE DÉMENT PAS une règle d'un moment", () => {
  // `null` est un moment à part entière dans l'identité, pas un joker.
  const prior = line({
    kind: "food.exclude", text: "poisson", occasion: "breakfast", at: "2026-09-20",
  });
  const next = line({ kind: "food.prefer", text: "poisson", occasion: null, at: "2026-09-22" });
  assertEquals(supersedes(next, prior), false);
});

Deno.test("⛔ UN AUTRE ALIMENT NE DÉMENT RIEN — « laitue » n'est pas « lait »", () => {
  // La cicatrice chiffrée du dépôt: 12 faux positifs sur 12 le jour où
  // quelqu'un a cru savoir. Ici un faux positif EFFACE.
  for (const [a, b] of [
    ["lait", "laitue"],
    ["poisson", "poissons"],
    ["pain", "pain complet"],
    ["thé", "the"],
  ]) {
    assertEquals(
      supersedes(
        line({ kind: "food.prefer", text: b, at: "2026-09-22" }),
        line({ kind: "food.exclude", text: a, at: "2026-09-20" }),
      ),
      false,
      `« ${b} » a effacé « ${a} »`,
    );
  }
});

Deno.test("⛔ JAMAIS À REBOURS — une ligne PLUS RÉCENTE survit", () => {
  // Sans ce garde-fou, rejouer une vieille note (une relance, un import) ferait
  // tomber ce que la personne a dit depuis: la mémoire apprendrait à l'envers.
  const prior = line({ kind: "food.exclude", text: "poisson", at: "2026-09-22" });
  const next = line({ kind: "food.prefer", text: "poisson", at: "2026-09-20" });
  assertEquals(supersedes(next, prior), false);
  // Le MÊME jour, en revanche, dément: deux phrases d'une même journée se
  // lisent dans l'ordre où elles arrivent.
  assert(supersedes(
    line({ kind: "food.prefer", text: "poisson", at: "2026-09-22" }),
    line({ kind: "food.exclude", text: "poisson", at: "2026-09-22" }),
  ));
});

Deno.test("⛔ UN DOUBLON N'EST PAS UN DÉMENTI", () => {
  // Deux fois la même chose est refusé en amont (`alreadyStored`). Le traiter
  // ici en ferait une ligne qui s'efface elle-même.
  const prior = line({ kind: "food.exclude", text: "poisson", force: "never", at: "2026-09-20" });
  const next = line({ kind: "food.exclude", text: "poisson", force: "never", at: "2026-09-22" });
  assertEquals(supersedes(next, prior), false);
});

Deno.test("⛔ UNE ENVIE NE DÉMENT AUCUNE PRÉFÉRENCE", () => {
  // `craving` est `next_plan` et expire seul. Lui donner le pouvoir d'effacer
  // un durable ferait d'une envie d'une semaine une décision permanente.
  const prior = line({ kind: "food.exclude", text: "fajitas", at: "2026-09-20" });
  const next = parseRetainedItem({
    kind: "craving", scope: "next_plan", subject: ZOE, text: "fajitas", value: null,
    source: "draft_note", at: "2026-09-22", item: "", confidence: null, quote: "fajitas",
  })!;
  assertEquals(supersedes(next, prior), false);
});

Deno.test("⛔ UNE PART NE DÉMENT RIEN, ET RIEN NE LA DÉMENT", () => {
  const portion = parseRetainedItem({
    kind: "portion.adjust", scope: "durable", subject: ZOE, text: "un peu trop",
    value: { direction: "down", magnitude: "slight" }, source: "questionnaire",
    at: "2026-09-22", item: "", confidence: null, quote: "« Les portions » → « Un peu trop »",
  })!;
  const food = line({ kind: "food.exclude", text: "un peu trop", at: "2026-09-20" });
  assertEquals(supersedes(portion, food), false);
  assertEquals(supersedes(food, portion), false);
});

// ===========================================================================
// LA PROPRIÉTÉ QUI TIENT LE TOUT
// ===========================================================================

Deno.test("PROPRIÉTÉ — rien ne se dément SOI-MÊME", () => {
  // Une règle réflexive viderait le magasin à la première réécriture.
  for (const kind of ["food.exclude", "food.prefer", "method.avoid", "method.prefer"] as const) {
    const it = line({ kind, text: "poisson" });
    assertEquals(supersedes(it, it), false, kind);
  }
});
