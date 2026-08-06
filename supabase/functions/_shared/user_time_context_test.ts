import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildNamedDayCalendar } from "./user_time_context.ts";

/**
 * LE CALENDRIER DES JOURS NOMMÉS.
 *
 * Il existe parce qu'un run réel du 2026-08-06 — un JEUDI — a écrit
 * `local_date = 2026-08-07` (vendredi) pour « Jeudi soir je mange au
 * restaurant », une passe sur deux. Le modèle recevait le jour courant
 * uniquement en prose et devait faire l'arithmétique lui-même.
 */

Deno.test("aujourd'hui est offset 0, et il porte le bon nom de jour", () => {
  // 2026-08-06 18:07 UTC — un jeudi.
  const cal = buildNamedDayCalendar(
    new Date("2026-08-06T18:07:00.000Z"),
    "Europe/Paris",
    "fr-FR",
  );
  assertEquals(cal[0].iso, "2026-08-06");
  assertEquals(cal[0].offset, 0);
  assert(cal[0].names.includes("jeudi"), `noms: ${cal[0].names.join(",")}`);
  assert(cal[0].names.includes("thursday"), "l'anglais doit y etre aussi");
  assertEquals(cal[1].iso, "2026-08-07");
  assert(cal[1].names.includes("vendredi"));
});

Deno.test("les deux langues, parce qu'un eleve fr-FR ecrit parfois « Thursday »", () => {
  const fr = buildNamedDayCalendar(
    new Date("2026-08-06T18:07:00.000Z"),
    "Europe/Paris",
    "fr-FR",
  );
  const en = buildNamedDayCalendar(
    new Date("2026-08-06T18:07:00.000Z"),
    "Europe/London",
    "en-GB",
  );
  // Le fr-FR porte les DEUX; l'en-GB n'a qu'un nom parce que les deux locales
  // rendent le meme mot — c'est un dedup, pas une langue manquante.
  assert(fr[0].names.includes("jeudi") && fr[0].names.includes("thursday"));
  assertEquals(en[0].names, ["thursday"]);
});

Deno.test("le soir tard, le jour reste celui de l'ELEVE et pas celui d'UTC", () => {
  // 22h30 UTC le 6 août = 00h30 le 7 août à Paris (UTC+2 en été).
  // Un calendrier ancré sur UTC dirait « jeudi »; l'élève, lui, est vendredi.
  const cal = buildNamedDayCalendar(
    new Date("2026-08-06T22:30:00.000Z"),
    "Europe/Paris",
    "fr-FR",
  );
  assertEquals(cal[0].iso, "2026-08-07");
  assert(cal[0].names.includes("vendredi"));
});

Deno.test("un changement d'heure ne fait ni sauter ni repeter un jour", () => {
  // L'HEURE D'ETE EUROPEENNE FINIT LE 25 OCTOBRE 2026. Le 25 octobre dure 25 h
  // a Paris. `now + offset * 86_400_000` retomberait donc sur le meme jour
  // civil quelque part dans la serie — c'est-a-dire exactement le decalage de
  // ±1 jour que ce bloc existe pour supprimer.
  const cal = buildNamedDayCalendar(
    new Date("2026-10-23T12:00:00.000Z"),
    "Europe/Paris",
    "fr-FR",
  );
  assertEquals(
    cal.map((d) => d.iso),
    [
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ],
  );
  // Aucun doublon, aucun trou: huit jours consécutifs et distincts.
  assertEquals(new Set(cal.map((d) => d.iso)).size, 8);
});

Deno.test("un mois et une annee se franchissent sans arithmetique speciale", () => {
  const cal = buildNamedDayCalendar(
    new Date("2026-12-29T12:00:00.000Z"),
    "Europe/Paris",
    "fr-FR",
  );
  assertEquals(cal[0].iso, "2026-12-29");
  assertEquals(cal[3].iso, "2027-01-01");
  assertEquals(cal[7].iso, "2027-01-05");
});

Deno.test("une timezone illisible ne fait pas tomber le tour", () => {
  const cal = buildNamedDayCalendar(
    new Date("2026-08-06T18:07:00.000Z"),
    "Pas/Une/Timezone",
    "fr-FR",
  );
  // Rien plutot qu'un calendrier faux: un tableau vide ne pousse aucune ligne
  // au prompt, et le modele retombe sur `user_local_human` comme avant.
  assertEquals(cal, []);
});

Deno.test("huit entrees: aujourd'hui plus sept jours", () => {
  const cal = buildNamedDayCalendar(
    new Date("2026-08-06T18:07:00.000Z"),
    "Europe/Paris",
    "fr-FR",
  );
  assertEquals(cal.length, 8);
  assertEquals(cal.map((d) => d.offset), [0, 1, 2, 3, 4, 5, 6, 7]);
});
