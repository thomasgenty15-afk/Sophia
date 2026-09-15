// LE CHAMP QUE LA PERSONNE VOIT — lot M5.
//
// Ce que ces tests existent pour empêcher, dans l'ordre où ça coûte:
//
//   1. UN CHAMP CHANGÉ SANS SA VALEUR D'AVANT. Un scalaire ne se « retire »
//      pas: sans `previous`, défaire voudrait dire « retape ce que tu avais »,
//      c'est-à-dire réclamer à la personne un nombre que le produit vient de
//      lui effacer.
//   2. UN JOURNAL SANS PLAFOND. C'est la seule chose de ce chantier qui
//      grossisse sans que la personne l'ait demandé, dans une colonne que cinq
//      lecteurs traversent.
//   3. UN PORT QUI ÉCRIT N'IMPORTE QUELLE CLÉ. La liste est fermée; sans elle
//      un producteur écrirait `food_preferences` ou une clé de sécurité sans
//      qu'aucune matrice ne l'ait autorisé.
//   4. UN `null` QUI DEVIENT UNE DÉCLARATION. « Le champ n'était pas
//      renseigné » et « renseigné à rien » se relisent différemment, et
//      plusieurs lecteurs de cette colonne les distinguent.
//
// env purgé: env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
//   deno test --allow-read --allow-env --no-check \
//   supabase/functions/_shared/keel/field_change_test.ts

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  FIELD_CHANGES_KEY,
  FIELD_CHANGES_MAX,
  type FieldChange,
  fieldChangesFrom,
  fieldChangeToJson,
  parseFieldChange,
  parseFieldChanges,
  parseWritableField,
  patchOf,
  undoFieldChange,
  WRITABLE_FIELDS,
  withFieldChanges,
} from "./field_change.ts";
import { LOGISTICS_FIELDS } from "./retained_item.ts";

function change(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    field: "cooking_time_min",
    previous: 45,
    next: 30,
    at: "2026-09-01",
    source: "questionnaire",
    quote: "« Tu as pu cuisiner ce plan ? » → « Non »",
    ...over,
  };
}

function parsed(over: Record<string, unknown> = {}): FieldChange {
  const out = parseFieldChange(change(over));
  if (!out) throw new Error(`fixture illisible: ${JSON.stringify(over)}`);
  return out;
}

// ===========================================================================
// 1. LA LISTE FERMÉE
// ===========================================================================

Deno.test("les champs écrivables sont ceux de la logistique, PLUS le rythme", () => {
  // ⛔ DÉRIVÉE DE `LOGISTICS_FIELDS`, PAS RETAPÉE: une seconde liste serait
  // celle qu'on oublierait, et un sixième champ logistique deviendrait
  // écrivable sans que personne ne l'ait décidé.
  //
  // ⟳ A2 (2026-09-03) — DEUX CLÉS S'AJOUTENT **APRÈS** LA DÉRIVATION, et cette
  // égalité les nomme au lieu de les laisser passer. `cooking_style` et
  // `grocery_runs` ne sont PAS dans `LOGISTICS_FIELDS` exprès: cette liste-là
  // est celle qu'une note de brouillon peut poser (`logistics.set`), et y
  // ranger le style apprendrait au modèle à l'écrire depuis une phrase libre.
  assertEquals(
    [...WRITABLE_FIELDS],
    [...LOGISTICS_FIELDS, "eating_rhythm", "cooking_style", "grocery_runs"],
  );
  // ⛔ ET ELLES NE SONT PAS ENTRÉES DANS `LOGISTICS_FIELDS` PAR LA BANDE.
  for (const field of ["cooking_style", "grocery_runs"]) {
    assert(
      !(LOGISTICS_FIELDS as readonly string[]).includes(field),
      `${field} ne doit pas être posable par une note de brouillon`,
    );
  }
  for (const field of WRITABLE_FIELDS) {
    assertEquals(parseWritableField(field), field);
  }
});

Deno.test("⛔ aucune clé de sécurité, aucune clé de préférence n'est écrivable", () => {
  // Une allergie a sa table, chargée à chaque tour et VÉRIFIÉE SUR LA SORTIE.
  // Un champ de préférence est une consigne de prompt sans contrôle en sortie:
  // y ranger une allergie lui retirerait sa ceinture.
  for (
    const forbidden of [
      "food_preferences",
      "food_preferences_origin",
      "away_days",
      "allergy_check",
      "diet_asked",
      "fixed_intakes",
      "retained_items",
      "",
      null,
      42,
    ]
  ) {
    assertEquals(parseWritableField(forbidden), null, String(forbidden));
  }
});

// ===========================================================================
// 2. ⛔ `previous` — CE QUI REND « DÉFAIRE » POSSIBLE
// ===========================================================================

Deno.test("une entrée SANS `previous` est refusée, pas repliée", () => {
  // ⛔ SANS LA VALEUR D'AVANT, LE BOUTON MENT. Replier sur `null` ferait pire
  // que refuser: défaire RETIRERAIT le champ, alors qu'il avait une valeur.
  const noKey = change();
  delete noKey.previous;
  assertEquals(parseFieldChange(noKey), null);
  const noNext = change();
  delete noNext.next;
  assertEquals(parseFieldChange(noNext), null);
});

Deno.test("`previous: null` est LÉGITIME — « le champ n'était pas renseigné »", () => {
  const first = parsed({ previous: null });
  assertEquals(first.previous, null);
  // Et défaire RETIRE la clé au lieu d'écrire `null`: écrire `null` inventerait
  // une déclaration que la personne n'a jamais faite.
  const stored = withFieldChanges({ cooking_time_min: 30 }, [first]);
  const undone = undoFieldChange(stored, 0)!;
  assertEquals("cooking_time_min" in undone, false, "la clé a été mise à null");
});

Deno.test("une entrée SANS CITATION est refusée — lot M2, même règle", () => {
  // *« Sans la citation, "Défaire" est un pari. »* Ici c'est pire qu'ailleurs:
  // le geste ne retire pas une ligne, il REMET un nombre. Sans savoir pourquoi
  // il a bougé, la personne ne peut pas décider s'il devait bouger.
  assertEquals(parseFieldChange(change({ quote: "" })), null);
  assertEquals(parseFieldChange(change({ quote: "   " })), null);
  assertEquals(parseFieldChange(change({ quote: null })), null);
});

Deno.test("⛔ `written` n'entre JAMAIS dans le journal", () => {
  // La personne qui édite son propre champ n'a rien à se faire notifier, et une
  // entrée `written` mettrait dans le fil un « défaire » sur un geste qu'elle
  // vient de faire exprès. Le refus est aussi la garde du contournement: un
  // producteur serveur déguisé en `written` passerait toute la matrice.
  assertEquals(parseFieldChange(change({ source: "written" })), null);
  // Et les producteurs légitimes passent.
  for (const source of ["questionnaire", "draft_note", "conversation"]) {
    assert(parseFieldChange(change({ source })), source);
  }
});

Deno.test("un jour illisible, un champ inconnu: REFUS, jamais un repli", () => {
  assertEquals(parseFieldChange(change({ at: "hier" })), null);
  assertEquals(parseFieldChange(change({ at: "" })), null);
  assertEquals(parseFieldChange(change({ field: "food_preferences" })), null);
  assertEquals(parseFieldChange(null), null);
  assertEquals(parseFieldChange([]), null);
});

Deno.test("une entrée difforme TOMBE SEULE et laisse ses voisines", () => {
  const list = [change(), { field: "nawak" }, change({ field: "variety", next: "varied" })];
  assertEquals(parseFieldChanges(list).length, 2);
  assertEquals(parseFieldChanges("pas une liste"), []);
});

// ===========================================================================
// 3. LE JOURNAL — les neuves devant, et un plafond qui jette
// ===========================================================================

Deno.test("les neuves DEVANT — sinon le plafond jette ce qu'on vient d'écrire", () => {
  // ⚠️ C'EST CE QUI REND LE PLAFOND SÛR. Avec les neuves derrière,
  // `slice(0, MAX)` jetterait l'entrée que la personne a le plus de chances de
  // vouloir défaire — celle qui vient d'apparaître sous ses yeux.
  const old = parsed({ at: "2026-08-01", quote: "vieille" });
  const fresh = parsed({ at: "2026-09-01", quote: "neuve" });
  const out = withFieldChanges(
    withFieldChanges({}, [old]),
    [fresh],
  );
  const kept = fieldChangesFrom(out);
  assertEquals(kept[0].quote, "neuve");
  assertEquals(kept[1].quote, "vieille");
});

Deno.test("le journal est PLAFONNÉ, et c'est un plafond de CONSERVATION", () => {
  // Différence avec le fil de M2, qui est une VUE: là on coupe l'affichage et
  // rien ne se perd. Ici on jette vraiment, parce que ce journal est la seule
  // chose de ce chantier qui grossisse sans que la personne l'ait demandé.
  let pc: Record<string, unknown> = {};
  for (let i = 0; i < FIELD_CHANGES_MAX + 7; i += 1) {
    pc = withFieldChanges(pc, [parsed({ quote: `n°${i}` })]);
  }
  const kept = fieldChangesFrom(pc);
  assertEquals(kept.length, FIELD_CHANGES_MAX);
  // Ce qui tombe est le plus ANCIEN.
  assertEquals(kept[0].quote, `n°${FIELD_CHANGES_MAX + 6}`);
});

Deno.test("⛔ le journal ne DÉDOUBLONNE pas", () => {
  // Deux bilans qui baissent le temps de cuisine sont deux changements réels.
  // Les fondre ferait perdre la valeur intermédiaire — donc la possibilité de
  // revenir au point de départ.
  const pc = withFieldChanges(
    withFieldChanges({}, [parsed({ previous: 60, next: 45 })]),
    [parsed({ previous: 45, next: 30 })],
  );
  assertEquals(fieldChangesFrom(pc).length, 2);
});

Deno.test("le patch prend le DERNIER quand un champ bouge deux fois", () => {
  const patch = patchOf([
    parsed({ next: 40 }),
    parsed({ next: 30 }),
    parsed({ field: "variety", previous: "some", next: "varied" }),
  ]);
  assertEquals(patch, { cooking_time_min: 30, variety: "varied" });
});

Deno.test("l'aller-retour jsonb est une identité", () => {
  const item = parsed();
  assertEquals(parseFieldChange(fieldChangeToJson(item)), item);
  assertEquals(Object.keys(withFieldChanges({}, [item])), [FIELD_CHANGES_KEY]);
});

// ===========================================================================
// 4. DÉFAIRE
// ===========================================================================

Deno.test("défaire remet la valeur d'avant ET retire l'entrée", () => {
  const pc = withFieldChanges({ cooking_time_min: 30 }, [parsed()]);
  const undone = undoFieldChange(pc, 0)!;
  assertEquals(undone.cooking_time_min, 45);
  assertEquals(fieldChangesFrom(undone).length, 0);
});

Deno.test("défaire DEUX changements les remonte un par un, dans l'ordre", () => {
  // ⛔ AUCUNE RECHERCHE PAR VALEUR: l'entrée est désignée par sa POSITION.
  // Deux changements du même champ le même jour sont indiscernables autrement,
  // et défaire le mauvais remettrait un nombre que la personne n'a jamais eu.
  let pc: Record<string, unknown> = { cooking_time_min: 60 };
  pc = withFieldChanges({ ...pc, cooking_time_min: 45 }, [
    parsed({ previous: 60, next: 45 }),
  ]);
  pc = withFieldChanges({ ...pc, cooking_time_min: 30 }, [
    parsed({ previous: 45, next: 30 }),
  ]);
  const step1 = undoFieldChange(pc, 0)!;
  assertEquals(step1.cooking_time_min, 45);
  const step2 = undoFieldChange(step1, 0)!;
  assertEquals(step2.cooking_time_min, 60);
  assertEquals(fieldChangesFrom(step2).length, 0);
});

Deno.test("un index hors bornes est un REFUS, jamais un repli", () => {
  const pc = withFieldChanges({ cooking_time_min: 30 }, [parsed()]);
  for (const bad of [-1, 1, 99, 0.5, NaN]) {
    assertEquals(undoFieldChange(pc, bad), null, String(bad));
  }
  assertEquals(undoFieldChange({}, 0), null);
});

Deno.test("défaire ne touche AUCUNE autre clé", () => {
  const pc = withFieldChanges(
    { cooking_time_min: 30, away_days: ["mon"], food_preferences: ["x"] },
    [parsed()],
  );
  const undone = undoFieldChange(pc, 0)!;
  assertEquals(undone.away_days, ["mon"]);
  assertEquals(undone.food_preferences, ["x"]);
});

// ===========================================================================
// 5. LA PARITÉ AVEC LA MIGRATION — la liste fermée est écrite DEUX FOIS
// ===========================================================================

Deno.test("⛔ la liste fermée du SQL est celle du TypeScript", async () => {
  // ⚠️ LA RECOPIE EST ASSUMÉE — un port SQL qui irait lire sa liste
  // d'autorisation ailleurs ne serait plus une garde. Le prix de la recopie est
  // CE test: sans lui, ouvrir un champ côté TS le laisserait refusé par le SQL
  // (une écriture qui échoue sans qu'on sache pourquoi), et le fermer côté TS
  // le laisserait ouvert côté SQL (une garde qu'on croit avoir).
  //
  // ⟳ A2 (2026-09-03) — CE TEST LISAIT UN NOM DE FICHIER EN DUR
  // (`20260901180000_…`) et il est devenu FAUX le jour où une seconde migration
  // a réécrit le port: il aurait continué de comparer le TypeScript d'aujourd'hui
  // à la liste d'avant-hier, et serait resté VERT sur une garde qui ne ferme
  // plus. Il cherche maintenant la DERNIÈRE migration qui porte la boucle —
  // c'est-à-dire l'autorité, qui se déplace à chaque réécriture du port.
  const dir = new URL("../../../migrations/", import.meta.url);
  const LOOP = "for v_key in select jsonb_object_keys(p_patch) loop";
  const files: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && entry.name.endsWith(".sql")) files.push(entry.name);
  }
  files.sort();
  let sql = "";
  let from = "";
  for (const name of files) {
    const body = await Deno.readTextFile(new URL(name, dir));
    if (body.includes(LOOP)) {
      sql = body;
      from = name;
    }
  }
  assert(sql !== "", "aucune migration ne porte la boucle de garde");
  const at = sql.indexOf(LOOP);
  assert(at > -1, "la boucle de garde a disparu de la migration");
  // ⚠️ ON DÉCOUPE LA SEULE LISTE `not in (…)`, PAS LE CORPS DE LA BOUCLE. Le
  // corps porte aussi le `jsonb_build_object('ok', …, 'reason', …)` du refus,
  // et les compter comme des clés autorisées ferait rougir ce test sur une
  // migration parfaitement correcte — un faux positif qu'on « réparerait » en
  // affaiblissant la garde.
  const listAt = sql.indexOf("not in (", at);
  assert(listAt > -1, "la liste fermée a disparu de la boucle");
  const guard = sql.slice(listAt, sql.indexOf(")", listAt));
  for (const field of WRITABLE_FIELDS) {
    assert(guard.includes(`'${field}'`), `${from} ne nomme pas ${field}`);
  }
  // ⛔ ET PAS UN DE PLUS. Une clé en trop côté SQL est une porte ouverte que le
  // TypeScript ne montre pas.
  const named = [...guard.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assertEquals(
    [...new Set(named)].sort(),
    [...WRITABLE_FIELDS].sort(),
    "le SQL nomme des clés que le socle n'autorise pas",
  );
});
