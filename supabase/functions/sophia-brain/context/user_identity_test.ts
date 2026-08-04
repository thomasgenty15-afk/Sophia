import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildUserIdentityPack,
  userIdentityVisiblePromptLines,
} from "./user_identity.ts";
import { visibleRecentMessages } from "../skills/_shared/visible_history.ts";

Deno.test("user identity pack derives first name, age and gender from profile row", () => {
  const now = new Date("2026-07-02T12:00:00.000Z");
  assertEquals(
    buildUserIdentityPack({
      full_name: "Alex Martin",
      birth_date: "1999-03-15",
      gender: "male",
    }, now),
    { first_name: "Alex", age: 27, gender: "male" },
  );
  // Anniversaire pas encore passe cette annee.
  assertEquals(
    buildUserIdentityPack({ birth_date: "1999-09-15" }, now)?.age,
    26,
  );
  // Genre inconnu ou invalide -> null (jamais devine).
  assertEquals(
    buildUserIdentityPack({ full_name: "Rose", gender: "autre" }, now),
    { first_name: "Rose", age: null, gender: null },
  );
  // Ligne vide -> pack null.
  assertEquals(buildUserIdentityPack({}, now), null);
  assertEquals(buildUserIdentityPack(null, now), null);
});

Deno.test("user identity visible doctrine forbids gendered agreements without a known gender", () => {
  const lines = userIdentityVisiblePromptLines().join("\n");
  assertEquals(
    lines.includes(
      "uniquement si user_identity.gender est male ou female",
    ),
    true,
  );
  assertEquals(
    lines.includes("formulation neutre sans accord genre"),
    true,
  );
  assertEquals(
    lines.includes("phrases a la premiere personne destinees a etre repetees"),
    true,
  );
  assertEquals(lines.includes("prenom avec parcimonie"), true);
});

Deno.test("identity pack: Sophia s'accorde au feminin sur elle-meme (P12-G, rose-hard25 R1-B06)", () => {
  const lines = userIdentityVisiblePromptLines().join("\n");
  // « Content que ça t'ait aidée » observé en run réel: l'accord réflexif
  // de Sophia est du féminin, indépendamment du genre du user.
  assertEquals(
    lines.includes("Sophia (toi) parle d'elle-meme au FEMININ"),
    true,
  );
  assertEquals(
    lines.includes("jamais 'content' en parlant de toi"),
    true,
  );
  assertEquals(
    lines.includes("quel que soit le genre du user"),
    true,
  );
});

Deno.test("visible history keeps both roles with the subskill limit", () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `m${index}`,
  }));
  const trimmed = visibleRecentMessages({
    recent_messages: history,
    user_message: "dernier message",
  });
  // Limite subskillHistory=8, dernier message user inclus.
  assertEquals(trimmed.length, 8);
  assertEquals(trimmed[trimmed.length - 1], {
    role: "user",
    content: "dernier message",
  });
  assertEquals(trimmed.some((message) => message.role === "assistant"), true);

  // Pas de doublon si le message courant est deja le dernier de l'historique.
  const noDup = visibleRecentMessages({
    recent_messages: [{ role: "user", content: "coucou" }],
    user_message: "coucou",
  });
  assertEquals(noDup, [{ role: "user", content: "coucou" }]);
});
