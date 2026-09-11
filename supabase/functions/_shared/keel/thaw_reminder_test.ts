import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  decideThawReminder,
  isEveOfCookDay,
  renderThawReminder,
  THAW_COPY_PACKS,
  THAW_EVE_DAYS,
  THAW_NOT_THE_EVE,
  THAW_REMINDER_PURPOSE,
  THAW_WINDOW_END_HOUR,
  THAW_WINDOW_START_HOUR,
} from "./thaw_reminder.ts";
import { frozenLinesForPreparations } from "./grocery_waves.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LE RAPPEL DE LA VEILLE — 2026-09-09
//
// ⛔ LE CAS RAPPORTÉ (poul, brouillon du 2026-09-08): dinde hachée achetée le
// mercredi, congelée à l'achat, cuisinée le dimanche. Rien ne rappelait de la
// sortir le samedi soir.
// ═══════════════════════════════════════════════════════════════════════════

const POUL = {
  sessionsTomorrow: [{ preparationIds: ["prep_turkey_meatballs", "prep_potatoes"] }],
  frozen: [{ term: "dinde hachée", quantity: "450 g" }],
  cookDay: "sun",
};

Deno.test("⛔ LE CAS RAPPORTÉ — la veille, dans la fenêtre, le rappel part avec la dinde", () => {
  const v = decideThawReminder({ localHour: 18, muted: false, plan: POUL, alreadySent: false });
  assert(v.ask);
  assertEquals(v.items, [{ term: "dinde hachée", quantity: "450 g" }]);
  assertEquals(v.cookDay, "sun");
});

Deno.test("la fenêtre d'abord, gratuite — 18h à 20h, la veille", () => {
  assertEquals(THAW_WINDOW_START_HOUR, 18);
  assertEquals(THAW_WINDOW_END_HOUR, 20);
  for (const h of [17, 20, 23, NaN]) {
    assertEquals(decideThawReminder({ localHour: h, muted: false, plan: POUL, alreadySent: false }), {
      ask: false,
      reason: "outside_window",
    });
  }
});

Deno.test("les refus, nommés — et chacun est une décision sur un élève regardé", () => {
  assertEquals(decideThawReminder({ localHour: 18, muted: true, plan: POUL, alreadySent: false }).ask, false);
  assertEquals(
    decideThawReminder({ localHour: 18, muted: false, plan: null, alreadySent: false }),
    { ask: false, reason: "no_plan" },
  );
  assertEquals(
    decideThawReminder({ localHour: 18, muted: false, plan: { ...POUL, sessionsTomorrow: [] }, alreadySent: false }),
    { ask: false, reason: "no_session_tomorrow" },
  );
  assertEquals(
    decideThawReminder({ localHour: 18, muted: false, plan: { ...POUL, frozen: [] }, alreadySent: false }),
    { ask: false, reason: "nothing_frozen" },
  );
  // ⛔ UNE FOIS PAR (PLAN, JOUR DE CUISINE): le balayage est horaire, la
  // fenêtre dure deux heures.
  assertEquals(
    decideThawReminder({ localHour: 19, muted: false, plan: POUL, alreadySent: true }),
    { ask: false, reason: "already_sent" },
  );
});

Deno.test("la phrase nomme l'article et sa quantité, dans les deux langues, sans question", () => {
  const fr = renderThawReminder({ locale: "fr-FR", items: POUL.frozen });
  assertStringIncludes(fr, "congélateur");
  assertStringIncludes(fr, "dinde hachée (450 g)");
  assert(!fr.includes("?"), fr);
  const en = renderThawReminder({ locale: "en-US", items: [...POUL.frozen, { term: "poisson", quantity: null }] });
  assertStringIncludes(en, "freezer");
  assertStringIncludes(en, "dinde hachée (450 g), poisson");
  assertEquals(Object.keys(THAW_COPY_PACKS).sort(), ["en", "fr"]);
});

Deno.test("frozenLinesForPreparations — la MÊME lecture que la carte de session et le PDF", () => {
  const lines = frozenLinesForPreparations({
    shoppingList: [
      { term: "dinde hachée", quantity: "450 g", freeze_on_purchase: true },
      { term: "cuisses de poulet désossées", quantity: "400 g", freeze_on_purchase: false },
      { term: "poisson", quantity: "300 g", freeze_on_purchase: true },
      { term: "persil", quantity: "1 bouquet" },
    ],
    preparations: [
      { id: "prep_turkey_meatballs", cookOn: "sun", ingredientTerms: ["Dinde hachée", "persil"] },
      { id: "prep_fish", cookOn: "fri", ingredientTerms: ["poisson"] },
    ],
    preparationIds: ["prep_turkey_meatballs"],
  });
  // Le poisson est congelé mais nourrit une AUTRE session; le persil n'est pas congelé.
  assertEquals(lines.map((l) => l.term), ["dinde hachée"]);
  assertEquals(frozenLinesForPreparations({ shoppingList: [], preparations: [], preparationIds: ["x"] }), []);
});

Deno.test("⛔ CÂBLAGE — le balayage horaire porte le canal, avec son `try`, son compte et son jeton `only`", async () => {
  const src = await Deno.readTextFile(new URL("../../keel-proactive-v1/index.ts", import.meta.url));
  assertStringIncludes(src, "runThawReminderStep(admin, common)");
  assertStringIncludes(src, 'only !== "thaw_reminder"');
  assertStringIncludes(src, "thaw_reminder: thawReminder,");
  assertStringIncludes(src, "failures.push(`thaw_reminder ${cursor}");
  // Et l'I/O livre sous SON purpose, avec la seconde horloge dans la métadonnée.
  const io = await Deno.readTextFile(new URL("./thaw_reminder_io.ts", import.meta.url));
  assertStringIncludes(io, "purpose: THAW_REMINDER_PURPOSE");
  assertStringIncludes(io, "for_date: tomorrow");
  assertEquals(THAW_REMINDER_PURPOSE, "keel_thaw_reminder");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ LE CAS RAPPORTÉ LE 2026-09-09 — LE RAPPEL LU CINQ JOURS TROP TÔT
//
// poul, plan du 2026-09-09 (mercredi), sessions wed/fri/sun, saumon congelé à
// l'achat et cuisiné le DIMANCHE. Un tir de `keel-proactive-v1` avec
// `body.now = 2026-09-12T16:30:00Z` a écrit un vrai message dans sa vraie
// conversation, daté du samedi, disant « demain, c'est ta session de cuisine ».
// Lu le mercredi — et un saumon sorti le mercredi pour le dimanche est perdu.
//
// La règle de CIBLAGE était juste (samedi → dimanche); c'est l'ÉCRITURE qui ne
// regardait aucune horloge réelle.
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LA VEILLE, SUR L'HORLOGE DU MUR — un jour, ni cinq ni zéro", () => {
  assertEquals(THAW_EVE_DAYS, 1);
  // Le cas nominal: on est samedi, ça se cuisine dimanche.
  assert(isEveOfCookDay({ realLocalDate: "2026-09-12", cookDate: "2026-09-13" }));
  // ⛔ LE DÉFAUT MESURÉ: on est mercredi, ça se cuisine dimanche. Quatre jours.
  assert(!isEveOfCookDay({ realLocalDate: "2026-09-09", cookDate: "2026-09-13" }));
  // Le jour même n'est pas la veille: sortir le matin pour le soir n'est pas
  // le geste que la phrase décrit («  ça décongèle au frigo pendant la nuit »).
  assert(!isEveOfCookDay({ realLocalDate: "2026-09-13", cookDate: "2026-09-13" }));
  // ⚠️ ET DANS L'AUTRE SENS. Une horloge en retard rappellerait de sortir un
  // aliment déjà cuisiné — aussi faux, et plus difficile à voir.
  assert(!isEveOfCookDay({ realLocalDate: "2026-09-14", cookDate: "2026-09-13" }));
  // Fail-closed: une date illisible refuse l'écriture, elle ne la laisse pas
  // passer par une exception avalée plus haut.
  assert(!isEveOfCookDay({ realLocalDate: "pas-une-date", cookDate: "2026-09-13" }));
  assert(!isEveOfCookDay({ realLocalDate: "2026-09-12", cookDate: "" }));
  // Le changement d'heure ne décale pas la veille: `daysBetween` ancre à midi.
  assert(isEveOfCookDay({ realLocalDate: "2026-10-24", cookDate: "2026-10-25" }));
});

Deno.test("⛔ CÂBLAGE — la garde d'horloge est APRÈS le `dry_run`, et se compte en `blocked`", async () => {
  const io = await Deno.readTextFile(new URL("./thaw_reminder_io.ts", import.meta.url));
  // L'horloge du mur est lue, et elle ne vient pas de `args.now`.
  assertStringIncludes(io, "const realToday = localDateInZone(zone, new Date());");
  assertStringIncludes(io, "isEveOfCookDay({ realLocalDate: realToday, cookDate: tomorrow })");
  assertStringIncludes(io, "deliveryReason: THAW_NOT_THE_EVE");

  // ⛔ L'ORDRE EST LA GARDE. Placée AVANT le `dry_run`, elle rendrait le banc
  // aveugle: plus aucune date ne pourrait s'éprouver. Placée après, elle ne
  // refuse que l'écriture.
  const atDryRun = io.indexOf('deliveryReason: "dry_run"');
  const atGuard = io.indexOf("isEveOfCookDay({ realLocalDate: realToday");
  assert(atDryRun > 0 && atGuard > atDryRun, `garde à ${atGuard}, dry_run à ${atDryRun}`);

  // Le verdict reste `ask: true`: l'appelant le range en `blocked`, pas en
  // `skipped`. Un rappel décidé dont l'écriture est refusée n'est pas un
  // rappel qui n'avait pas lieu d'être, et les confondre cacherait la panne.
  const src = await Deno.readTextFile(new URL("../../keel-proactive-v1/index.ts", import.meta.url));
  assertStringIncludes(src, 'bump(thawReminder.blocked, out.deliveryReason ?? "unknown")');
  assertEquals(THAW_NOT_THE_EVE, "not_the_eve");
});
