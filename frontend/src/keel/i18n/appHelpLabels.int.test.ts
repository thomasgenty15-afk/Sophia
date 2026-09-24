// FF-066 · L'AIDE SUR L'APP — UN BOUTON RENOMMÉ FAIT ÉCHOUER CE TEST, PAS UNE
// RÉPONSE DE SOPHIA.
//
// Les fiches (`supabase/functions/_shared/keel/app_help/cards.ts`) citent des
// boutons et des écrans. Le cerveau ne peut pas lire `fr.ts` / `en.ts` (Deno ne
// déploie pas le front): chaque fiche porte donc le TEXTE de ses libellés, avec
// leur clé. Ce fichier compare les deux. Quelqu'un qui renomme « Liste de
// courses » voit ce test rougir et nommer la fiche à reprendre (fiche R3).
//
// ⚠️ LE FRANÇAIS ATTENDU EST CELUI QUE L'ÉCRAN REND. Une clé hors du périmètre
// traduit s'affiche en anglais à un utilisateur français (`t()` retombe sur le
// seed): la fiche doit alors citer l'anglais, sinon Sophia nommerait un bouton
// que la personne ne voit pas.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  APP_HELP_CARDS,
  APP_HELP_TOPIC_IDS,
} from "../../../../supabase/functions/_shared/keel/app_help/cards.ts";
import { isTranslatedMessageKey } from "./catalog";
import { en } from "./en";
import { fr } from "./fr";

const APP_SOURCE = readFileSync(
  fileURLToPath(new URL("../../App.tsx", import.meta.url)),
  "utf8",
);
const ROUTES = new Set(
  [...APP_SOURCE.matchAll(/path="([^"]+)"/g)].map((match) => match[1]),
);

describe("FF-066 — les fiches d'aide citent les libellés tels que l'écran les rend", () => {
  it("chaque identifiant a sa fiche", () => {
    expect(APP_HELP_CARDS.map((card) => card.id).sort()).toEqual(
      [...APP_HELP_TOPIC_IDS].sort(),
    );
  });

  for (const card of APP_HELP_CARDS) {
    it(`${card.id} — libellés égaux à fr.ts / en.ts`, () => {
      for (const label of card.labels) {
        // ⚠️ UN LIBELLÉ HORS I18N (un e-mail écrit côté serveur) se désigne par
        // `file:<chemin depuis la racine du dépôt>`: les deux textes doivent y
        // figurer tels quels.
        if (label.key.startsWith("file:")) {
          const source = readFileSync(
            fileURLToPath(new URL(`../../../../${label.key.slice(5)}`, import.meta.url)),
            "utf8",
          );
          expect(source.includes(label.fr), `fiche ${card.id}: « ${label.fr} » absent de ${label.key}`)
            .toBe(true);
          expect(source.includes(label.en), `fiche ${card.id}: "${label.en}" absent de ${label.key}`)
            .toBe(true);
          continue;
        }
        const key = label.key as keyof typeof en;
        expect(en[key], `clé inconnue dans en.ts: ${label.key} (fiche ${card.id})`)
          .toBeDefined();
        expect(label.en, `fiche ${card.id}, clé ${label.key}, anglais`).toBe(en[key]);
        const shownToFrench = isTranslatedMessageKey(label.key)
          ? (fr as Record<string, string>)[label.key]
          : en[key];
        expect(label.fr, `fiche ${card.id}, clé ${label.key}, français`).toBe(shownToFrench);
      }
    });

    it(`${card.id} — routes présentes dans App.tsx`, () => {
      for (const route of card.routes) {
        expect(ROUTES.has(route), `route absente d'App.tsx: ${route} (fiche ${card.id})`)
          .toBe(true);
      }
    });
  }
});

// ⟳ 2026-09-24 — LES PHRASES DE RENVOI DU CHAT, MÊME GARDE. Elles envoyaient
// vers « Ce que Sophia sait de toi » (où l'on n'ajoute rien) et vers « tes
// réglages » (`/app/setup`, fermé dès qu'un plan existe). Chaque écran qu'elles
// citent entre guillemets doit être un texte que l'app affiche vraiment.
import { PROFILE_REDIRECT_SENTENCES } from "../../../../supabase/functions/_shared/keel/conversation_redirect.ts";

describe("FF-066 — les phrases de renvoi du chat citent des écrans qui existent", () => {
  const shownToFrench = new Set(
    Object.keys(en).map((key) =>
      isTranslatedMessageKey(key) ? (fr as Record<string, string>)[key] : (en as Record<string, string>)[key]
    ),
  );
  const shownToEnglish = new Set(Object.values(en as Record<string, string>));
  for (const [kind, pack] of Object.entries(PROFILE_REDIRECT_SENTENCES)) {
    it(`${kind} — chaque « … » est un texte de fr.ts, chaque “…” un texte de en.ts`, () => {
      const frQuoted = [...pack.fr.matchAll(/«[\s\u00a0\u202f]*([^»]+?)[\s\u00a0\u202f]*»/g)].map((m) => m[1]);
      const enQuoted = [...pack.en.matchAll(/“([^”]+)”/g)].map((m) => m[1]);
      expect(frQuoted.length, `${kind}: la phrase française ne nomme aucun écran`).toBeGreaterThan(0);
      expect(enQuoted.length, `${kind}: la phrase anglaise ne nomme aucun écran`).toBeGreaterThan(0);
      for (const label of frQuoted) {
        expect(shownToFrench.has(label), `${kind}: « ${label} » n'est affiché nulle part`).toBe(true);
      }
      for (const label of enQuoted) {
        expect(shownToEnglish.has(label), `${kind}: “${label}” is not shown anywhere`).toBe(true);
      }
    });
  }
});
