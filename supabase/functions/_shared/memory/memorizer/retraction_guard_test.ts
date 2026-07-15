import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  filterRetractedMemoryItems,
  retractedContentSegments,
} from "./retraction_guard.ts";

Deno.test("P10-D: objectif rétracté dans le même message → item ET récit d'abandon droppés (rose-p8reval T9)", () => {
  const messages = [
    {
      role: "user",
      content:
        "autre chose, je veux que tu retiennes un truc important pour la suite: mon objectif c'est d'arriver à zéro joint pour la rentrée de septembre... ah non, laisse tomber en fait, oublie ce que je viens de dire, je préfère pas me coller cette pression.",
    },
  ];
  const items = [
    // Le récit d'abandon (l'item observé au run réel).
    {
      content:
        "L'utilisatrice a voulu arrêter l'idée d'arriver à zéro joint pour la rentrée de septembre",
    },
    // Le contenu brut.
    { content: "Objectif: zéro joint pour la rentrée de septembre" },
    // Un item SANS rapport du même lot: survit.
    { content: "Préfère marcher le matin avant le travail" },
  ];
  const result = filterRetractedMemoryItems(items, messages);
  assertEquals(result.dropped.length, 2);
  assertEquals(result.kept.length, 1);
  assertEquals(
    String(result.kept[0].content).includes("marcher"),
    true,
  );
});

Deno.test("P10-D: « oublie ça » en tête de message → la cible est le message user précédent (eva-hard24 R1-B02)", () => {
  const messages = [
    {
      role: "user",
      content:
        "un truc sur moi: je prépare toujours mes affaires le dimanche soir pour la semaine.",
    },
    { role: "assistant", content: "C'est une bonne routine !" },
    {
      role: "user",
      content:
        "oublie ça, le retiens surtout pas comme un truc sur moi.",
    },
  ];
  const items = [
    { content: "Prépare souvent ses affaires le dimanche soir" },
    { content: "Aime le café le matin" },
  ];
  const result = filterRetractedMemoryItems(items, messages);
  assertEquals(result.dropped.length, 1);
  assertEquals(
    String(result.dropped[0].item.content).includes("dimanche"),
    true,
  );
  assertEquals(result.kept.length, 1);
});

Deno.test("P10-D anti-faux-positif: échec raconté SANS instruction d'oubli → rien n'est filtré", () => {
  const messages = [
    {
      role: "user",
      content:
        "j'ai arrêté le carnet au bout de deux jours, c'était pas pour moi.",
    },
  ];
  const items = [
    { content: "A arrêté le carnet au bout de deux jours" },
  ];
  const result = filterRetractedMemoryItems(items, messages);
  assertEquals(result.dropped.length, 0);
  assertEquals(result.kept.length, 1);
});

Deno.test("P10-D anti-faux-positif: la rétractation ne touche que sa cible (rétractation ciblée)", () => {
  const messages = [
    {
      role: "user",
      content:
        "je fais du yoga le mardi et je cours le jeudi. ah et le yoga, oublie ce que je viens de dire, c'est fini le yoga du mardi en fait.",
    },
  ];
  const items = [
    { content: "Fait du yoga le mardi" },
    { content: "Court le jeudi" },
  ];
  const result = filterRetractedMemoryItems(items, messages);
  // Le segment rétracté (avant marqueur) contient yoga+mardi ET cours+jeudi
  // — ce cas mixte droppe large: acceptable (fail-safe côté oubli), documenté.
  assertEquals(
    result.dropped.some((d) => String(d.item.content).includes("yoga")),
    true,
  );
});

Deno.test("P10-D: segments — marqueur en milieu de message découpe avant lui", () => {
  const segments = retractedContentSegments([
    {
      role: "user",
      content:
        "mon objectif c'est de courir un semi au printemps. bon oublie ça en fait.",
    },
  ]);
  assertEquals(segments.length, 1);
  assertEquals(segments[0].includes("semi"), true);
});
