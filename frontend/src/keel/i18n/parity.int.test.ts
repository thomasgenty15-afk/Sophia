// KEEL — ce que le TYPE ne peut pas dire sur le pack français.
//
// `PublicMessages` garantit déjà qu'aucune clé publique ne manque: `fr.public.ts`
// ne compile pas sans elles. Ces ceintures-ci gardent le reste — et le reste
// est ce qui casse en silence.

import { describe, expect, it } from "vitest";
import { en } from "./en";
import { fr } from "./fr.public";
import {
  isPublicMessageKey,
  PUBLIC_NAMESPACES,
  PUBLIC_NAMESPACES_PENDING_TRANSLATION,
} from "./catalog";

/** `{date}`, `{count}` — les trous que `t()` remplit à l'appel. */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("pack français de la vitrine", () => {
  it("porte exactement les clés publiques, ni plus ni moins", () => {
    // Le type couvre le « ni moins ». Le « ni plus » compte aussi: une clé
    // française orpheline est du travail de traduction payé pour un écran qui
    // ne l'affiche plus, et elle survit aux suppressions sans bruit.
    const frKeys = Object.keys(fr).sort();
    const publicKeys = Object.keys(en).filter(isPublicMessageKey).sort();
    expect(frKeys).toEqual(publicKeys);
  });

  it("garde les MÊMES trous d'interpolation que l'anglais", () => {
    // LA ceinture de plus forte valeur du lot. Si `en` porte `{date}` et que la
    // traduction écrit `{jour}`, le type est content, le test de clés est
    // content, et `t()` lève au rendu — en DEV chez nous si on ouvre la page,
    // sinon chez un visiteur. Rien d'autre ne l'attrape.
    const mismatches: string[] = [];
    for (const key of Object.keys(fr) as Array<keyof typeof fr>) {
      const a = placeholders(en[key]);
      const b = placeholders(fr[key]);
      if (a.join(",") !== b.join(",")) {
        mismatches.push(`${key}: en={${a.join(",")}} fr={${b.join(",")}}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("ne recopie pas l'anglais pour faire verdir la CI", () => {
    // Une valeur identique à l'anglais est presque toujours une clé oubliée.
    // Les exceptions sont réelles mais rares, et chacune est une ligne VISIBLE
    // en diff — c'est tout l'intérêt d'une liste explicite plutôt que d'un
    // seuil de tolérance.
    const legitimatelyIdentical = new Set<string>([
      "brand.wordmark", // un nom de marque
      "public.footer.contact_email", // une adresse
      "public.footer.contact", // « Contact » s'écrit pareil dans les deux langues
      "public.locale.en", // un sélecteur nomme chaque langue DANS sa langue
      "public.locale.fr",
      "public.locale.switch_to_en",
      "public.locale.switch_to_fr",
      // ── LES CITATIONS D'ÉCRAN PRODUIT ────────────────────────────────────
      // ⚠️ CELLES-CI NE SONT PAS DES TRADUCTIONS OUBLIÉES, ET LES TRADUIRE
      // SERAIT LE BUG. Une maquette de page de vente annonce qu'elle reprend
      // le vrai champ MOT POUR MOT (règle S10 du dépôt: « on ne montre pas un
      // écran qu'on n'a pas »). Or l'app authentifiée est ANGLAISE PAR CHOIX —
      // `PUBLIC_NAMESPACES` s'arrête à la vitrine. Traduire la citation
      // montrerait donc au lecteur français un écran qui n'existe dans aucune
      // langue, ce qui est exactement la faute que la maquette existe pour
      // éviter. La frontière se voit à l'œil sur la page, et c'est voulu.
      //
      // La règle pour ajouter une clé ici: elle doit être une CHAÎNE RENDUE
      // PAR L'APP, vérifiable dans le code. Pas une phrase de vente qu'on n'a
      // pas eu le temps de traduire.
      "coaches.fig.chat.sophia",
      "coaches.fig.chat.question", // daily_pulse: « How was today? »
      "coaches.fig.chat.tap_good", // « All good »
      "coaches.fig.chat.tap_mixed", // « So-so »
      "coaches.fig.chat.tap_rough", // « Rough »
      "coaches.fig.lock.sign",
      "coaches.fig.monday.app_title",
      "coaches.fig.monday.week_label",
      "coaches.fig.monday.week_to",
      "coaches.fig.monday.line1", // coach_synthesis.ts:538-541, verbatim
      "coaches.fig.monday.line3", // « built themselves a week », :566-568
      "coaches.fig.monday.flagged_label",
      "coaches.fig.monday.s1_name",
      "coaches.fig.monday.s1_reason",
      "coaches.fig.monday.s1_state",
      "coaches.fig.monday.s2_name",
      "coaches.fig.monday.s2_reason",
      "coaches.fig.monday.s2_state",
      "coaches.fig.monday.s3_name",
      "coaches.fig.monday.s3_reason",
      "coaches.fig.monday.s3_none",
      "coaches.fig.monday.numbers_label",
      "coaches.fig.monday.n1_label",
      "coaches.fig.monday.n2_label",
      "coaches.fig.monday.n3_label",
      "gyms.fig.thread_app",
      "gyms.fig.thread_sub",
      "gyms.fig.thread_q1",
      "gyms.fig.thread_b1",
      "gyms.fig.thread_b2",
      "gyms.fig.thread_b3",
      "gyms.fig.thread_q2",
      "gyms.fig.thread_a1",
      "gyms.fig.thread_a2",
      "gyms.fig.thread_a3",
      "gyms.fig.thread_composer",
      "gyms.fig.thread_send",
      "gyms.fig.monday_app",
      "gyms.fig.monday_worth",
      "gyms.fig.monday_n1",
      "gyms.fig.monday_r1",
      "gyms.fig.monday_s1",
      "gyms.fig.monday_n2",
      "gyms.fig.monday_r2",
      "gyms.fig.monday_s2",
      "gyms.fig.monday_n3",
      "gyms.fig.monday_r3",
      "gyms.fig.monday_s3",
      "families.fig_gate.code", // `safety_constraints_unreadable`, un identifiant
      // ── LES CHIFFRES ET LES MOTS COMMUNS AUX DEUX LANGUES ────────────────
      // Un prix est un fait commercial, pas de la langue.
      "gyms.price.seat",
      "gyms.fig.money_in_value",
      "gyms.fig.money_out_value",
      "gyms.fig.money_keep_value",
      "mealprep.start.ask_allergies", // « Allergies » s'écrit pareil
      "families.fig_pot.col_allergies",
      "families.fig_pot.m4",
      "families.fig_sheet.f4",
    ]);
    const copied = (Object.keys(fr) as Array<keyof typeof fr>)
      .filter((key) => !legitimatelyIdentical.has(key))
      .filter((key) => fr[key].trim() === en[key].trim());
    expect(copied).toEqual([]);
  });

  it("n'a ni valeur vide ni espace de bord", () => {
    const bad = (Object.keys(fr) as Array<keyof typeof fr>)
      .filter((key) => fr[key] !== fr[key].trim() || fr[key] === "");
    expect(bad).toEqual([]);
  });

  it("la frontière déclarée est cohérente: aucun namespace des deux côtés", () => {
    // `PUBLIC_NAMESPACES` est la promesse « traduit »; la liste d'attente est la
    // promesse « pas encore ». Un namespace dans les deux serait une frontière
    // qui ment, et c'est exactement ce qu'on refuse de livrer.
    const overlap = PUBLIC_NAMESPACES_PENDING_TRANSLATION
      .filter((ns) => (PUBLIC_NAMESPACES as readonly string[]).includes(ns));
    expect(overlap).toEqual([]);
  });

  it("chaque namespace en attente existe VRAIMENT dans le seed", () => {
    // Sans ça, la liste d'attente vieillit: un namespace renommé ou supprimé y
    // resterait comme une dette qu'on croit avoir, et personne ne le saurait.
    const missing = PUBLIC_NAMESPACES_PENDING_TRANSLATION.filter((ns) =>
      !Object.keys(en).some((key) => key.startsWith(`${ns}.`))
    );
    expect(missing).toEqual([]);
  });
});
