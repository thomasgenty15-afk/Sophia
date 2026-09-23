// FF-066 — LE CONTENU DES FICHES. La mécanique est testée par `block_test.ts`;
// l'égalité des libellés avec `fr.ts` / `en.ts` par
// `frontend/src/keel/i18n/appHelpLabels.int.test.ts` (le cerveau ne lit pas le
// front). Ce fichier tient le reste: la forme, la parité des deux langues, les
// mots interdits, et le fait qu'un bouton cité est un bouton VÉRIFIÉ.

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  APP_HELP_CARDS,
  APP_HELP_LOCALES,
  APP_HELP_TOPIC_IDS,
  APP_HELP_UNKNOWN_TOPIC,
  type AppHelpCard,
  type AppHelpText,
} from "./cards.ts";
import {
  appHelpContextBlock,
  appHelpDispatcherLines,
  UNKNOWN_APP_HELP_VIEWER,
} from "./block.ts";

/** Plafond de lignes d'une réponse: au-delà, la fiche en couvre deux. */
const MAX_LINES = 6;
/** Plafond d'un bloc de trois fiches (≈ 800 tokens). Fiche R1. */
const MAX_BLOCK_CHARS = 3_200;
/** Plafond de la liste envoyée au dispatcher à chaque tour. Fiche R8. */
const MAX_DISPATCHER_LIST_CHARS = 7_000;

function textsOf(card: AppHelpCard): AppHelpText[] {
  return [
    card.answer,
    ...(card.variants ?? []).map((variant) => variant.answer),
    ...(card.doesNotExist ? [card.doesNotExist] : []),
  ];
}

function allVisibleStrings(card: AppHelpCard): string[] {
  return [
    card.title.fr,
    card.title.en,
    ...textsOf(card).flatMap((text) => [...text.fr, ...text.en]),
    ...card.labels.flatMap((label) => [label.fr, label.en]),
  ];
}

/** Les segments cités: « … » en français, “ … ” en anglais. */
function quoted(line: string, locale: "fr" | "en"): string[] {
  const pattern = locale === "fr" ? /«[\s  ]*([^»]+?)[\s  ]*»/g : /“([^”]+)”/g;
  return [...line.matchAll(pattern)].map((match) => match[1]);
}

Deno.test("une fiche par identifiant, aucune de plus", () => {
  assertEquals(APP_HELP_CARDS.map((card) => card.id), [...APP_HELP_TOPIC_IDS]);
});

for (const card of APP_HELP_CARDS) {
  Deno.test(`${card.id} — forme, parité des langues, mots interdits`, () => {
    assert(card.title.fr.trim() && card.title.en.trim(), "titre manquant");
    assert(card.dispatcherHint.trim(), "indication du dispatcher manquante");
    // Le prompt du dispatcher est écrit sans accent: une indication accentuée y
    // détonnerait, et elle se lit dans la partie fixe, partagée par tous.
    assert(/^[\x20-\x7e]+$/.test(card.dispatcherHint), `indication non ASCII: ${card.dispatcherHint}`);
    assert(card.dispatcherHint.length <= 140, "indication trop longue");

    if (card.id !== APP_HELP_UNKNOWN_TOPIC) {
      for (const text of [card.answer, ...(card.variants ?? []).map((v) => v.answer)]) {
        for (const locale of APP_HELP_LOCALES) {
          assert(text[locale].length > 0, `réponse ${locale} vide`);
          assert(text[locale].length <= MAX_LINES, `réponse ${locale} de plus de ${MAX_LINES} lignes`);
        }
        // T9 — LES DEUX LANGUES DISENT LA MÊME CHOSE, ligne pour ligne.
        assertEquals(text.fr.length, text.en.length, "fr et en n'ont pas le même nombre de lignes");
      }
    }
    if (card.doesNotExist) {
      assertEquals(card.doesNotExist.fr.length, card.doesNotExist.en.length);
    }

    for (const value of allVisibleStrings(card)) {
      // Le nom de code interne n'apparaît sur aucune surface lue par un
      // utilisateur — et le texte injecté au modèle en est une (CLAUDE.md).
      assert(!/keel/i.test(value), `nom de code interne dans: ${value}`);
      // Le monde pro est masqué: aucune fiche ne fait attendre un coach.
      assert(!/\bcoach/i.test(value), `« coach » dans: ${value}`);
    }
  });

  Deno.test(`${card.id} — un bouton cité est un bouton vérifié (R3)`, () => {
    for (const locale of APP_HELP_LOCALES) {
      const declared = new Set(card.labels.map((label) => label[locale]));
      const lines = textsOf(card).flatMap((text) => [...text[locale]]);
      const cited = new Set(lines.flatMap((line) => quoted(line, locale)));
      for (const segment of cited) {
        assert(
          declared.has(segment),
          `${locale}: « ${segment} » est cité sans figurer dans labels[] — ` +
            "le test des libellés ne peut pas le vérifier",
        );
      }
      // Et l'inverse: un libellé déclaré mais jamais cité est un libellé que
      // personne ne relira quand il changera.
      for (const label of card.labels) {
        assert(cited.has(label[locale]), `${locale}: libellé déclaré jamais cité: ${label.key}`);
      }
    }
  });
}

Deno.test("le pire bloc de trois fiches reste sous le plafond (R1)", () => {
  for (const locale of ["fr-FR", "en-GB"]) {
    const sized = APP_HELP_CARDS
      .filter((card) => card.id !== APP_HELP_UNKNOWN_TOPIC)
      .map((card) => {
        const viewers = [
          UNKNOWN_APP_HELP_VIEWER,
          ...(card.variants ?? []).map((variant) => ({
            role: variant.when.roles?.[0] ?? null,
            goal: variant.when.goals?.[0] ?? null,
          })),
        ];
        return Math.max(
          ...viewers.map((viewer) =>
            appHelpContextBlock({ topics: [card.id], locale, viewer })?.length ?? 0
          ),
        );
      })
      .sort((a, b) => b - a);
    const worst = sized[0] + sized[1] + sized[2];
    assert(worst <= MAX_BLOCK_CHARS, `${locale}: pire bloc de 3 fiches = ${worst} caractères`);
    const unknown = appHelpContextBlock({
      topics: [APP_HELP_UNKNOWN_TOPIC],
      locale,
      viewer: UNKNOWN_APP_HELP_VIEWER,
    });
    assert(unknown && unknown.length <= MAX_BLOCK_CHARS, `${locale}: bloc unknown_feature trop long`);
  }
});

Deno.test("la liste du dispatcher reste sous son plafond (R8)", () => {
  const size = appHelpDispatcherLines().join("\n").length;
  assert(size <= MAX_DISPATCHER_LIST_CHARS, `liste du dispatcher = ${size} caractères`);
});
