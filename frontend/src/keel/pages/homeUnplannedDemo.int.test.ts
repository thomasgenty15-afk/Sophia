import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « CE QUE TU ENVOIES » — UNE IMAGE DU COMPOSEUR, PAS UN PARCOURS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La boîte de l'imprévu jouait un scénario: un bouton « Comptabiliser »
 * révélait trois phrases de résultat, avec un « Recommencer ». Retiré.
 * Ce qui reste est ce qu'on ENVOIE — une description ou une photo — et le
 * bouton d'envoi du composeur, DESSINÉ.
 *
 * ── CE QUE CE FICHIER TIENT ──────────────────────────────────────────────
 * ① les cinq clés du parcours ont quitté les DEUX packs. Une clé traduite que
 *   rien ne rend est de la copie morte, et ce dépôt a la cicatrice inverse
 *   (`tracking.describe.done`: présente partout, jamais rendue, et qui
 *   affirmait le contraire de ce que son chemin faisait);
 * ② « Envoyer » n'est PAS un bouton. Sur une page de vente, un `<button>`
 *   inerte est pire qu'un dessin: on clique, et rien ne répond;
 * ③ la photo ne se rend que s'il y a un fichier. Un `<img>` pointé sur un
 *   fichier absent afficherait une image cassée en plein argumentaire.
 */

const SRC = resolve(__dirname, "../..");

function code(rel: string): string {
  return readFileSync(resolve(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const HOME = code("keel/pages/HomePage.tsx");

/** Le corps du composant, et lui seul: le reste de la page ne le concerne pas. */
const DEMO = (() => {
  const from = HOME.indexOf("function UnplannedMealDemo()");
  expect(from, "le composant a été renommé — l'ancre du test est morte")
    .toBeGreaterThan(0);
  return HOME.slice(from);
})();

describe("① le parcours a quitté les deux packs", () => {
  it.each([
    "home.life.demo.button",
    "home.life.demo.result",
    "home.life.demo.result_detail",
    "home.life.demo.untouched",
    "home.life.demo.reset",
  ])("`%s` n'existe plus", (key) => {
    expect(fr, `${key} traîne dans le pack français`).not.toHaveProperty(key);
    expect(en, `${key} traîne dans le pack anglais`).not.toHaveProperty(key);
    expect(HOME, `${key} est encore rendue`).not.toContain(key);
  });

  it("et rien dans la boîte ne garde d'état de scénario", () => {
    // `sent` était la mémoire du parcours. Sans lui, la boîte ne peut plus
    // révéler quoi que ce soit — c'est l'épreuve structurelle du retrait.
    expect(DEMO).not.toContain("setSent");
  });

  it("les deux options se nomment par ce qu'elles SONT", () => {
    expect(fr["home.life.demo.describe"]).toBe("Une description");
    expect(fr["home.life.demo.photo"]).toBe("Une photo");
  });

  it("« Envoyer » est traduit dans les deux packs", () => {
    expect(fr["home.life.demo.send"]).toBeTruthy();
    expect(en["home.life.demo.send"]).toBeTruthy();
  });
});

describe("② « Envoyer » est un dessin, pas un bouton", () => {
  it("il est rendu dans un `<span aria-hidden>`", () => {
    const at = DEMO.indexOf('t("home.life.demo.send")');
    expect(at, "« Envoyer » n'est plus rendu").toBeGreaterThan(-1);
    // Les 400 caractères qui précèdent portent la balise ouvrante.
    const tag = DEMO.slice(Math.max(0, at - 400), at);
    expect(tag, "« Envoyer » a été remis dans un <button>")
      .not.toMatch(/<button[^>]*$/);
    expect(tag, "« Envoyer » n'est plus masqué aux lecteurs d'écran")
      .toContain('aria-hidden="true"');
  });

  it("les DEUX onglets, eux, restent de vrais contrôles", () => {
    // Ils changent ce qu'on regarde: les retirer du clavier rendrait la moitié
    // de la boîte inatteignable.
    expect(DEMO).toContain("aria-pressed={mode === id}");
  });
});

describe("③ la photo ne se rend que si le fichier existe", () => {
  it("le `<img>` est gardé par la constante", () => {
    expect(DEMO).toMatch(/\{UNPLANNED_PHOTO_SRC\s*\n?\s*\?/);
    expect(DEMO).toContain("src={UNPLANNED_PHOTO_SRC}");
  });

  it("et la constante déclare qu'elle peut être absente", () => {
    // ⛔ Sans `| null`, un jour quelqu'un écrira `= \"\"` et l'`<img>` partira
    // chercher la page elle-même — une image cassée en plein argumentaire.
    expect(HOME).toMatch(/const UNPLANNED_PHOTO_SRC: string \| null/);
  });
});
