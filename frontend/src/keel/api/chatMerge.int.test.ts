// LA FUSION DE LA BULLE — les tests qui pinnent un défaut trouvé AU NAVIGATEUR.
//
// Le doublon d'affichage naît de la rencontre entre un état React et une
// livraison Realtime : aucun test unitaire écrit avant ne pouvait le voir,
// parce que la fusion vivait dans le composant. Elle est sortie pour ça.
//
// Ce que chaque test protège :
//   * « la ligne réelle chasse son écho » — le défaut mesuré : le message tapé
//     s'affichait DEUX fois ;
//   * « deux livraisons du même INSERT ne doublent pas » — deux onglets ouverts
//     sur le même compte (edge case n°1) ;
//   * « un écho encore en vol survit au refetch » — sinon le message qu'on
//     vient de taper clignote à chaque reconnexion (edge case n°2).

import { describe, expect, it } from "vitest";

import {
  type ChatMessage,
  mergeHistoryPage,
  mergeMessage,
  toChatMessage,
} from "./chat";

function msg(over: Partial<ChatMessage> & { id: string }): ChatMessage {
  return {
    role: "user",
    content: "hello",
    createdAt: "2026-08-04T12:00:00.000Z",
    buttons: [],
    proactive: false,
    ...over,
  };
}

describe("toChatMessage", () => {
  it("remonte client_message_id depuis les metadata", () => {
    // LA ligne qui manquait. Sans elle, la ligne réelle n'a aucun moyen de se
    // reconnaître dans son propre écho.
    const m = toChatMessage({
      id: "row-1",
      role: "user",
      content: "hi",
      created_at: "2026-08-04T12:00:00.000Z",
      metadata: { client_message_id: "c-1", channel: "in_app" },
    });
    expect(m.clientMessageId).toBe("c-1");
  });

  it("sans client_message_id, le champ reste absent (jamais une chaîne vide)", () => {
    const m = toChatMessage({
      id: "row-1",
      role: "assistant",
      content: "hi",
      created_at: "2026-08-04T12:00:00.000Z",
      metadata: {},
    });
    expect(m.clientMessageId).toBeUndefined();
  });

  it("lit `is_proactive` — le champ que le serveur écrivait pour personne", () => {
    // `delivery.ts` pose `is_proactive` sur CHAQUE livraison depuis le premier
    // jour du canal in-app, et aucun code client ne le lisait: une relance
    // arrivée seule à 21h était rendue exactement comme une réponse. Le champ
    // existait, le sens se perdait entre la base et l'œil.
    const m = toChatMessage({
      id: "row-1",
      role: "assistant",
      content: "How was today?",
      created_at: "2026-08-04T20:10:00.000Z",
      metadata: { is_proactive: true, purpose: "keel_daily_pulse" },
    });
    expect(m.proactive).toBe(true);
  });

  it("une réponse n'est pas proactive, et un message de l'élève jamais", () => {
    const reply = toChatMessage({
      id: "row-2",
      role: "assistant",
      content: "Got it.",
      created_at: "2026-08-04T20:11:00.000Z",
      metadata: { is_proactive: false },
    });
    expect(reply.proactive).toBe(false);

    // Le drapeau vient de la décision de LIVRAISON, qui ne concerne que les
    // sortants. Le lire sur un entrant serait lire un champ sans sens de ce
    // côté-là — et l'élève se verrait étiqueté « Sophia a écrit ».
    const inbound = toChatMessage({
      id: "row-3",
      role: "user",
      content: "rough day",
      created_at: "2026-08-04T20:12:00.000Z",
      metadata: { is_proactive: true },
    });
    expect(inbound.proactive).toBe(false);
  });

  it("lit les boutons, et ignore ceux qui sont mal formés", () => {
    const m = toChatMessage({
      id: "row-1",
      role: "assistant",
      content: "How was today?",
      created_at: "2026-08-04T12:00:00.000Z",
      metadata: {
        buttons: [
          { payload: "KEEL_PULSE_GOOD", label: "All good" },
          { payload: "", label: "vide" },
          { label: "sans payload" },
          "pas un objet",
          null,
        ],
      },
    });
    expect(m.buttons).toEqual([{ payload: "KEEL_PULSE_GOOD", label: "All good" }]);
  });

  it("metadata null ou boutons non-tableau: aucune exception", () => {
    const base = {
      id: "r",
      role: "assistant",
      content: "x",
      created_at: "2026-08-04T12:00:00.000Z",
    };
    expect(toChatMessage({ ...base, metadata: null }).buttons).toEqual([]);
    expect(toChatMessage({ ...base, metadata: { buttons: "nope" } }).buttons).toEqual([]);
  });
});

describe("mergeMessage", () => {
  it("LA LIGNE RÉELLE CHASSE SON ÉCHO (le défaut mesuré au navigateur)", () => {
    const echo = msg({
      id: "pending-c1",
      clientMessageId: "c1",
      pending: true,
      content: "Hi Sophia",
    });
    const real = msg({ id: "row-1", clientMessageId: "c1", content: "Hi Sophia" });
    const merged = mergeMessage([echo], real);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("row-1");
    expect(merged[0].pending).toBeUndefined();
  });

  it("deux livraisons Realtime du MÊME insert ne doublent pas", () => {
    const real = msg({ id: "row-1", clientMessageId: "c1" });
    expect(mergeMessage([real], real)).toHaveLength(1);
    // Et sans client_message_id non plus (un message assistant n'en a pas).
    const reply = msg({ id: "row-2", role: "assistant", content: "ok" });
    expect(mergeMessage([reply], reply)).toHaveLength(1);
  });

  it("un message d'un AUTRE tour n'est pas chassé", () => {
    const other = msg({ id: "row-0", clientMessageId: "c0", content: "précédent" });
    const real = msg({ id: "row-1", clientMessageId: "c1", content: "nouveau" });
    expect(mergeMessage([other], real)).toHaveLength(2);
  });

  it("le résultat reste trié chronologiquement", () => {
    const later = msg({ id: "b", createdAt: "2026-08-04T12:00:02.000Z", content: "2" });
    const earlier = msg({ id: "a", createdAt: "2026-08-04T12:00:01.000Z", content: "1" });
    expect(mergeMessage([later], earlier).map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("mergeHistoryPage", () => {
  it("un écho dont la ligne réelle est ARRIVÉE disparaît", () => {
    const echo = msg({ id: "pending-c1", clientMessageId: "c1", pending: true });
    const page = [msg({ id: "row-1", clientMessageId: "c1" })];
    const merged = mergeHistoryPage([echo], page);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("row-1");
  });

  it("un écho ENCORE EN VOL survit au refetch", () => {
    // Sinon le message qu'on vient de taper clignote à chaque reconnexion.
    const echo = msg({
      id: "pending-c2",
      clientMessageId: "c2",
      pending: true,
      createdAt: "2026-08-04T12:00:05.000Z",
    });
    const page = [msg({ id: "row-1", clientMessageId: "c1" })];
    const merged = mergeHistoryPage([echo], page);
    expect(merged.map((m) => m.id)).toEqual(["row-1", "pending-c2"]);
  });

  it("un envoi ÉCHOUÉ survit aussi: l'élève doit pouvoir le voir et réessayer", () => {
    const failed = msg({
      id: "pending-c3",
      clientMessageId: "c3",
      failed: true,
      createdAt: "2026-08-04T12:00:06.000Z",
    });
    expect(mergeHistoryPage([failed], []).map((m) => m.id)).toEqual(["pending-c3"]);
  });

  it("les messages déjà confirmés ne sont PAS dupliqués par le refetch", () => {
    // `previous` porte la ligne réelle; la page la porte aussi. Seule la page
    // compte — sinon chaque refetch doublerait tout l'historique.
    const real = msg({ id: "row-1", clientMessageId: "c1" });
    expect(mergeHistoryPage([real], [real])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// LA PHOTO DANS LA BULLE
//
// Ce que ces tests protègent, et c'est un défaut qui a été livré: la photo
// voyageait déjà dans `metadata.media_ref` et PERSONNE ne la lisait. L'élève
// envoyait son assiette et voyait « [photo] » en texte.
//
// Le second défaut est plus subtil et n'apparaît qu'à l'exécution: la ligne
// réelle porte un CHEMIN de bucket, pas une URL. Si la fusion jette l'aperçu
// local, l'image disparaît à la seconde où le serveur confirme et revient
// après l'aller-retour de signature — un clignotement pile au mauvais moment.
// ---------------------------------------------------------------------------

describe("la photo du message", () => {
  it("toChatMessage lit media_ref", () => {
    const m = toChatMessage({
      id: "row-1",
      role: "user",
      content: "[photo]",
      created_at: "2026-08-04T12:00:00.000Z",
      metadata: {
        kind: "media",
        media_ref: {
          path: "user-1/2026-08-04/abc.jpg",
          content_type: "image/jpeg",
          size_bytes: 1234,
        },
      },
    });
    expect(m.media).toEqual({
      path: "user-1/2026-08-04/abc.jpg",
      contentType: "image/jpeg",
    });
  });

  it("un media_ref sans chemin n'est pas une photo", () => {
    // Un chemin vide produirait une <img src=""> — une icône cassée dans la
    // conversation, ce qui est pire que pas d'image du tout.
    for (const media_ref of [{ path: "" }, { path: "   " }, {}, null, "nope"]) {
      const m = toChatMessage({
        id: "row-1",
        role: "user",
        content: "[photo]",
        created_at: "2026-08-04T12:00:00.000Z",
        metadata: { media_ref },
      });
      expect(m.media).toBeUndefined();
    }
  });

  it("un message sans photo n'a pas de champ media", () => {
    const m = toChatMessage({
      id: "row-1",
      role: "assistant",
      content: "Got it 👌",
      created_at: "2026-08-04T12:00:00.000Z",
      metadata: {},
    });
    expect(m.media).toBeUndefined();
  });

  it("mergeMessage: l'aperçu local survit à la ligne réelle", () => {
    const echo = msg({
      id: "pending-c1",
      clientMessageId: "c1",
      pending: true,
      media: { path: "", contentType: "image/jpeg", previewUrl: "blob:local" },
    });
    const real = msg({
      id: "row-1",
      clientMessageId: "c1",
      media: { path: "user-1/2026-08-04/abc.jpg", contentType: "image/jpeg" },
    });
    const merged = mergeMessage([echo], real);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("row-1");
    // Le chemin de la ligne réelle ET l'aperçu de l'écho: c'est le chemin qui
    // sera signé, et l'aperçu qui empêche le trou visuel entre les deux.
    expect(merged[0].media).toEqual({
      path: "user-1/2026-08-04/abc.jpg",
      contentType: "image/jpeg",
      previewUrl: "blob:local",
    });
  });

  it("mergeHistoryPage: l'aperçu survit aussi au refetch", () => {
    // C'est CE chemin que la photo emprunte en pratique — `onPickPhoto` finit
    // par un refetch, pas par une livraison Realtime.
    const echo = msg({
      id: "pending-c1",
      clientMessageId: "c1",
      pending: true,
      media: { path: "", contentType: "image/jpeg", previewUrl: "blob:local" },
    });
    const page = [msg({
      id: "row-1",
      clientMessageId: "c1",
      media: { path: "user-1/2026-08-04/abc.jpg", contentType: "image/jpeg" },
    })];
    const merged = mergeHistoryPage([echo], page);
    expect(merged.map((m) => m.id)).toEqual(["row-1"]);
    expect(merged[0].media?.previewUrl).toBe("blob:local");
    expect(merged[0].media?.path).toBe("user-1/2026-08-04/abc.jpg");
  });

  it("un message sans aperçu n'invente pas de previewUrl", () => {
    const echo = msg({ id: "pending-c1", clientMessageId: "c1", pending: true });
    const real = msg({
      id: "row-1",
      clientMessageId: "c1",
      media: { path: "user-1/2026-08-04/abc.jpg", contentType: null },
    });
    expect(mergeMessage([echo], real)[0].media?.previewUrl).toBeUndefined();
  });
});
