import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1.0.0";

import {
  MEAL_TEXT_REDIRECT_PURPOSE,
  type MealRedirectSkip,
  renderMealTextRedirect,
  typedMealNeedsRedirect,
} from "./meal_text_redirect.ts";
import { slotKeyNamedIn } from "./slot_from_message.ts";
import {
  parseSlotMealButton,
  SLOT_MEAL_COPY_PACKS,
} from "./slot_meal_ask.ts";
import { SLOT_MEAL_PURPOSE } from "./slot_meal_io.ts";
import { EATING_OCCASIONS } from "./meal_generation.ts";

/**
 * LE REPAS TAPÉ DANS LE FIL — CE QUE CES ÉPREUVES TIENNENT.
 *
 * · les deux boutons sont LISIBLES par le gestionnaire qui existe déjà: un
 *   jeton que `parseSlotMealButton` refuse serait un tap perdu, offert;
 * · le créneau déduit de l'heure porte sa PORTE DE CORRECTION, et celui que
 *   la personne a nommé ne la porte pas — la déduction silencieuse est
 *   exactement ce que ce dépôt refuse;
 * · les libellés sont ceux de la question du soir, au mot près;
 * · l'étiquette de la bulle est DISJOINTE de celle de la question proactive.
 */

const DATE = "2026-09-13";

/**
 * LE TABLEAU DE PHRASES — c'est LUI le contrat de cette lane.
 *
 * Chaque ligne a été jouée à la main avant d'être écrite ici. Les quatre
 * « pourquoi pas » sont aussi importants que les « oui »: cette lane REMPLACE
 * la réponse, donc chaque redirection de trop est une conversation coupée.
 */
const SENTENCES: Array<[string, true | MealRedirectSkip]> = [
  // ── ON REND LA MAIN ───────────────────────────────────────────────────
  // 🔴 LA LIGNE QUI A MOTIVÉ LE LOT. « pizza » n'est dans AUCUNE entrée du
  // lexique fermé: `detectDeclaredMeal` rend `null` ici. C'est la porte, et
  // elle seule, qui rattrape le geste le plus courant du produit.
  ["j'ai mangé une pizza", true],
  ["j'ai mangé du poulet", true],
  ["I had a burrito", true],
  ["j'ai pris un yaourt", true],
  // Le hors-plan sans le moindre aliment: « j'ai commandé » EST une soirée.
  ["j'ai commandé", true],
  // Groupe nominal + créneau, avec des aliments reconnus: la porte faible
  // tient parce que le lexique la confirme.
  ["Poulet grillé, riz complet et brocolis à midi", true],
  ["Grilled salmon with quinoa and green beans for dinner", true],

  // ── ON NE REND PAS LA MAIN ────────────────────────────────────────────
  // Une question se répond. Voir le pavé de `typedMealNeedsRedirect`: le
  // désarme `/\?/` du plancher est mort (normalisation), celui-ci ne l'est pas.
  ["j'ai mangé une pizza, c'est grave ?", "question"],
  ["tu penses quoi de mon plan ?", "question"],
  // Les désarmes du plancher, qu'on hérite sans les réécrire.
  ["je n'ai rien mangé", "gate_closed"],
  ["ma fille a mangé des pâtes", "gate_closed"],
  ["si je mange du riz ce soir", "gate_closed"],
  ["je vais manger des pâtes ce soir", "gate_closed"],
  // La porte faible SANS aliment: un rendez-vous n'est pas un repas.
  ["j'ai eu une réunion à midi", "no_food_named"],
];

Deno.test("le tableau de phrases: qui rend la main, qui répond, et pourquoi", () => {
  for (const [text, expected] of SENTENCES) {
    const verdict = typedMealNeedsRedirect(text, slotKeyNamedIn(text));
    if (expected === true) {
      assert(
        verdict.redirect,
        `« ${text} » devait rendre la main — reçu: ${
          verdict.redirect ? "?" : verdict.reason
        }`,
      );
    } else {
      assert(!verdict.redirect, `« ${text} » ne devait PAS rendre la main`);
      assertEquals(verdict.reason, expected, `« ${text} »`);
    }
  }
});

Deno.test("un copier-coller n'est pas une déclaration — la garde du plancher tient", () => {
  const long = `j'ai mangé du poulet ${"et des légumes ".repeat(60)}`;
  assert(long.length > 600);
  const verdict = typedMealNeedsRedirect(long, null);
  assert(!verdict.redirect);
  assertEquals(verdict.reason, "gate_closed");
});

Deno.test("les deux boutons se relisent avec leur action, leur date et leur créneau", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    for (const slot of EATING_OCCASIONS) {
      const bubble = renderMealTextRedirect({
        locale,
        localDate: DATE,
        slot,
        slotInferred: true,
      });
      assertEquals(bubble.buttons.length, 2, `${locale}/${slot}`);
      const actions = bubble.buttons.map((b) => {
        const tap = parseSlotMealButton(b.payload);
        assert(tap, `jeton illisible: ${b.payload}`);
        // Le créneau et la date VOYAGENT: sans eux, le champ s'ouvrirait sur
        // un repas deviné une seconde fois, en aval.
        assertEquals(tap.slot, slot);
        assertEquals(tap.localDate, DATE);
        // Aucun segment de plan: ces deux actions n'en acceptent pas.
        assertEquals(tap.plan, null);
        return tap.action;
      });
      assertEquals(actions, ["photo", "describe"]);
    }
  }
});

Deno.test("un créneau DÉDUIT porte sa porte de correction; un créneau NOMMÉ ne la porte pas", () => {
  const inferredFr = renderMealTextRedirect({
    locale: "fr-FR",
    localDate: DATE,
    slot: "lunch",
    slotInferred: true,
  }).body;
  const namedFr = renderMealTextRedirect({
    locale: "fr-FR",
    localDate: DATE,
    slot: "lunch",
    slotInferred: false,
  }).body;

  assert(
    /si c'était un autre repas/i.test(inferredFr),
    `la déduction doit s'ouvrir à la correction — reçu: ${inferredFr}`,
  );
  assert(
    !/si c'était un autre repas/i.test(namedFr),
    "un créneau que la personne a nommé n'est pas une hypothèse à corriger",
  );

  const inferredEn = renderMealTextRedirect({
    locale: "en-US",
    localDate: DATE,
    slot: "dinner",
    slotInferred: true,
  }).body;
  const namedEn = renderMealTextRedirect({
    locale: "en-US",
    localDate: DATE,
    slot: "dinner",
    slotInferred: false,
  }).body;
  assert(/another meal/i.test(inferredEn), inferredEn);
  assert(!/another meal/i.test(namedEn), namedEn);
});

Deno.test("le créneau est NOMMÉ dans la phrase, dans les deux langues", () => {
  for (const pack of ["fr", "en"] as const) {
    const locale = pack === "fr" ? "fr-FR" : "en-US";
    for (const slot of EATING_OCCASIONS) {
      const body = renderMealTextRedirect({
        locale,
        localDate: DATE,
        slot,
        slotInferred: true,
      }).body;
      const name = SLOT_MEAL_COPY_PACKS[pack].slotName[slot];
      assert(
        body.includes(name),
        `${locale}/${slot}: la bulle doit dire de quel repas elle parle — ` +
          `attendu « ${name} », reçu: ${body}`,
      );
    }
  }
});

Deno.test("la bulle dit ce qui manque: les quantités et les calories", () => {
  const fr = renderMealTextRedirect({
    locale: "fr-FR",
    localDate: DATE,
    slot: "lunch",
    slotInferred: true,
  }).body;
  // C'est le MOTIF de la redirection. Une bulle qui demanderait la photo sans
  // dire pourquoi passerait pour un caprice, et la personne n'obéirait pas
  // deux fois.
  assert(/quantités/i.test(fr) && /calories/i.test(fr), fr);
  assert(/prends une photo/i.test(fr) && /écris ton plat/i.test(fr), fr);
  const en = renderMealTextRedirect({
    locale: "en-US",
    localDate: DATE,
    slot: "lunch",
    slotInferred: true,
  }).body;
  assert(/amounts/i.test(en) && /calories/i.test(en), en);
  assert(/take a photo/i.test(en) && /write out the dish/i.test(en), en);
});

Deno.test("les libellés DISENT LE GESTE — photo, ou écrire le plat", () => {
  const fr = renderMealTextRedirect({
    locale: "fr-FR",
    localDate: DATE,
    slot: "dinner",
    slotInferred: false,
  });
  assertEquals(fr.buttons[0].label, "Prendre une photo");
  assertEquals(fr.buttons[1].label, "Écrire ton plat");

  const en = renderMealTextRedirect({
    locale: "en-US",
    localDate: DATE,
    slot: "dinner",
    slotInferred: false,
  });
  assertEquals(en.buttons[0].label, "Take a photo");
  assertEquals(en.buttons[1].label, "Write your dish");
});

Deno.test("`slotInferred` est REQUIS — un défaut ferait taire la porte de correction", () => {
  assertThrows(
    () =>
      renderMealTextRedirect(
        {
          locale: "fr-FR",
          localDate: DATE,
          slot: "lunch",
        } as unknown as Parameters<typeof renderMealTextRedirect>[0],
      ),
    Error,
    "slotInferred",
  );
});

Deno.test("l'étiquette est DISJOINTE de celle de la question proactive", () => {
  // Les fondre ferait qu'une personne ayant tapé « j'ai mangé une pizza » à
  // midi ne recevrait plus la question de son déjeuner — `slotsAskedToday`
  // compte les bulles par `purpose`.
  //
  // `String(…)` ÉLARGIT LES DEUX LITTÉRAUX, exprès: sans ça le compilateur
  // tranche la comparaison lui-même (TS2367) et l'épreuve ne survit pas au
  // jour où l'un des deux est renommé vers l'autre.
  assert(String(MEAL_TEXT_REDIRECT_PURPOSE) !== String(SLOT_MEAL_PURPOSE));
});
