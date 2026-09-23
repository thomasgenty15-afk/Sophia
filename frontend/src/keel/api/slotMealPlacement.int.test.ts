import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { describeSlotFromTap } from "./slotMeal";

const ROOT = resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

/**
 * ⚠️ LES COMMENTAIRES PARTENT D'ABORD. Les fichiers visés CITENT
 * `slot_meal_ask_enabled` et le « + » en toutes lettres dans leurs pavés: un
 * test naïf serait vert — ou rouge — sur la seule foi de leur prose.
 */
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const CHAT = "frontend/src/keel/pages/ChatPage.tsx";
const SETUP = "frontend/src/keel/pages/SetupPage.tsx";
const ONBOARDING = "frontend/src/keel/api/onboarding.ts";

describe("l'interrupteur de la question par repas — où il est, et où il n'est pas", () => {
  it("⛔ IL N'EST PAS DANS L'ONBOARDING, ET C'EST STRUCTUREL", () => {
    // Deux moitiés tiennent « hors onboarding », et celle-ci est la seconde.
    //
    // La première est la COLONNE: `profiles.slot_meal_ask_enabled` n'a ni
    // défaut ni `NOT NULL`, donc quelqu'un qui n'a jamais vu l'interrupteur
    // porte `null` — « personne n'a choisi » — et l'objectif décide. Il n'y a
    // littéralement RIEN à régler avant d'avoir vécu la chose.
    //
    // Celle-ci empêche qu'on l'y ajoute « pour être complet ». Un réglage
    // proposé avant d'avoir reçu une seule question demande de trancher sur
    // une chose qu'on n'a pas encore vécue — et la réponse la plus fréquente à
    // une question qu'on ne comprend pas est de couper.
    for (const file of [SETUP, ONBOARDING]) {
      const src = strip(read(file));
      expect(src, `${file} nomme la colonne`).not.toContain(
        "slot_meal_ask_enabled",
      );
      expect(src, `${file} nomme la clé du réglage`).not.toContain(
        "chat.settings.slotmeal",
      );
    }
  });

  // ⟳ 2026-09-23 — L'INTERRUPTEUR DÉDIÉ EST PARTI. Il n'y a plus qu'un
  // interrupteur de notifications, qui écrit aussi `slot_meal_ask_enabled`.
  it("le panneau de la bulle n'a plus qu'un interrupteur", () => {
    const src = strip(read(CHAT));
    expect(src).not.toContain('testId="setting-slotmeal"');
    expect(src).not.toContain('testId="setting-checkins"');
    expect(src.split("<SettingSwitch").length - 1).toBe(1);
    const at = src.indexOf('testId="setting-notifications"');
    expect(at, "l'interrupteur unique est introuvable").toBeGreaterThan(-1);
    // ⛔ ALLUMÉ = RIEN N'EST COUPÉ. Afficher « activées » sur le seul mute
    // mentirait à qui a coupé la question depuis le bouton sous une question.
    expect(src).toContain("const notificationsOn = muted === false && asksOn;");
    expect(src).toContain("slotMealAskSwitchFrom({ stored: slotMealStored, goal }).on");
  });
});

describe("le geste « + » du composeur", () => {
  it("c'est un « + », jamais une icône d'appareil photo", () => {
    const src = strip(read(CHAT));
    const at = src.indexOf('data-testid="chat-compose-add"');
    expect(at, "le bouton « + » est introuvable").toBeGreaterThan(-1);
    // ⚠️ ON REGARDE DES DEUX CÔTÉS: `aria-label` et `aria-haspopup` sont écrits
    // AVANT `data-testid` dans le JSX. Ne slicer que vers l'avant faisait
    // rougir ce test sur un bouton parfaitement formé.
    const block = src.slice(Math.max(0, at - 400), at + 400);
    // Une icône d'appareil photo promet « photographie tout »; deux des trois
    // options ne sont pas des photos.
    expect(block).toContain('t("chat.compose.add")');
    expect(block).toContain('aria-haspopup="menu"');
  });

  it("il porte les TROIS options", () => {
    const src = strip(read(CHAT));
    for (const id of ["chat-add-photo", "chat-add-describe", "chat-add-weight"]) {
      expect(src, id).toContain(`data-testid="${id}"`);
    }
  });

  it("⛔ IL EST GATÉ SUR L'OBJECTIF, JAMAIS SUR L'OPT-OUT", () => {
    // L'interrupteur éteint les QUESTIONS; le « + » est le geste qui leur
    // survit. C'est ce que promet le libellé du bouton d'extinction — « tes
    // repas restent cochables […] et le « + » reste là » — et une garde sur
    // l'opt-out ferait mentir cette phrase au pire moment.
    const src = strip(read(CHAT));
    const at = src.indexOf('data-testid="chat-compose-add"');
    const before = src.slice(Math.max(0, at - 600), at);
    expect(before).toContain("slotMealSwitchOfferable(goal)");
    expect(before).not.toContain("slotMealAskSwitchFrom(");
  });

  it("« décrire » demande le MOMENT avant le champ", () => {
    // Le composeur ne peut pas deviner de quel repas on parle: sans choix, la
    // déclaration tomberait au dernier créneau écoulé — juste par accident, et
    // faux dès qu'on répond le soir. C'est la même raison qui met le créneau
    // DANS le jeton de la question (R6).
    const src = strip(read(CHAT));
    expect(src).toContain("setAddSlotPicker(true)");
    expect(src).toContain("SLOT_ORDER.map(");
    expect(src).toContain("setDescribeSlot(slot)");
  });

  it("il monte LE dialogue de description, pas une copie", () => {
    // Il porte déjà les huit refus nommés, le plancher déterministe et la garde
    // de fuseau. En écrire un second les ferait diverger au premier correctif.
    const src = strip(read(CHAT));
    expect(src).toContain("<TrackingDescribeDialog");
    // ⚠️ ET L'APPEL EST DANS LE DIALOGUE, PAS DANS LA PAGE — c'est justement
    // ce qui fait qu'il n'y en a qu'un. Une page qui appellerait
    // `describeMissedMeal` elle-même serait la seconde implémentation.
    expect(src, "la page appelle l'API en direct").not.toContain(
      "describeMissedMeal(",
    );
    expect(read("frontend/src/keel/components/TrackingDescribeDialog.tsx"))
      .toContain("describeMissedMeal(");
  });
});

describe("« Te dire » ouvre le champ, au bon créneau", () => {
  it("le créneau vient du JETON, jamais d'une inférence", () => {
    // Il y est déjà (R6), précisément pour que rien en aval n'ait à le
    // deviner: une déclaration rangée au dernier créneau écoulé tombe juste par
    // accident, et faux dès qu'on répond le soir.
    expect(describeSlotFromTap("KEEL_SLOTMEAL_describe|2026-03-10|dinner"))
      .toBe("dinner");
    // ⛔ ET SEULEMENT SUR SON ACTION. « Photo » arme le créneau de la photo,
    // « Passer » n'ouvre rien, et l'extinction encore moins.
    for (const a of ["photo", "skip", "mute"]) {
      expect(describeSlotFromTap(`KEEL_SLOTMEAL_${a}|2026-03-10|dinner`), a)
        .toBeNull();
    }
    expect(describeSlotFromTap("KEEL_WEIGHIN_2026-03-10")).toBeNull();
  });

  it("un créneau qu'on ne sait pas NOMMER n'ouvre rien", () => {
    // Le dialogue affiche le libellé du créneau. Un slug brut sous les yeux de
    // quelqu'un est pire que le repli sur le chemin d'avant.
    expect(describeSlotFromTap("KEEL_SLOTMEAL_describe|2026-03-10|brunch"))
      .toBeNull();
  });

  it("« Photo » ouvre le sélecteur, au créneau déjà nommé", () => {
    // Le tap de la redirection (et celui de la question du soir) DIT le geste.
    // Sans `click()` ici, la personne appuie sur « Prendre une photo » et
    // rien ne s'ouvre — il lui resterait à retrouver le « + ».
    const src = strip(read(CHAT));
    const at = src.indexOf("forcedSlotFromPhotoTap(payload)");
    expect(at, "le tap photo est introuvable").toBeGreaterThan(-1);
    const after = src.slice(at, at + 500);
    expect(after).toContain("setForcedPhotoSlot(photoSlot)");
    expect(after).toContain("photoInputRef.current?.click()");
    // ⛔ ET IL PART QUAND MÊME AU SERVEUR. Même règle que « Te dire ».
    expect(after).toContain('send({ kind: "button", payload, label }');
    expect(after.slice(0, after.indexOf("send("))).not.toContain("return;");
  });

  it("le tap part QUAND MÊME au serveur", () => {
    // Sans quoi R13 désarmerait la question au message suivant, et le tap
    // n'aurait laissé aucune trace. Même règle que « Photo ».
    const src = strip(read(CHAT));
    const at = src.indexOf("describeSlotFromTap(payload)");
    expect(at).toBeGreaterThan(-1);
    const after = src.slice(at, at + 600);
    expect(after).toContain('send({ kind: "button", payload, label }');
    // ⛔ ET IL NE RETOURNE PAS TÔT. Un `return` ici avalerait l'envoi.
    expect(after.slice(0, after.indexOf("send("))).not.toContain("return;");
  });
});
