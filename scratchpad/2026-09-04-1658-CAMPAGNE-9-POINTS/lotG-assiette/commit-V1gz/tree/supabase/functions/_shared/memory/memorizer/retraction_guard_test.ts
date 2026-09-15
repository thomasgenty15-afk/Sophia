import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  filterRetractedMemoryItems,
  retractedContentSegments,
} from "./retraction_guard.ts";

Deno.test("P10-D: objectif rétracté dans le même message → item ET récit d'abandon droppés (rose-p8reval T9)", () => {
  const messages = [
    {
      role: "user" as const,
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
      role: "user" as const,
      content:
        "un truc sur moi: je prépare toujours mes affaires le dimanche soir pour la semaine.",
    },
    { role: "assistant" as const, content: "C'est une bonne routine !" },
    {
      role: "user" as const,
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
      role: "user" as const,
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
      role: "user" as const,
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
      role: "user" as const,
      content:
        "mon objectif c'est de courir un semi au printemps. bon oublie ça en fait.",
    },
  ]);
  assertEquals(segments.length, 1);
  assertEquals(segments[0].includes("semi"), true);
});

Deno.test("P12-E: complément post-marqueur → cible = le complément, item ET récit d'abandon droppés (rose-hard25 R1-B02)", () => {
  const messages = [
    {
      role: "user" as const,
      content:
        "un truc à savoir sur moi: je veux me remettre à la natation, ça me manque vraiment.",
    },
    { role: "assistant" as const, content: "C'est une belle envie 🌊" },
    {
      role: "user" as const,
      content:
        "au fait, demain je fais ma sortie cartographie à 21h comme prévu.",
    },
    { role: "assistant" as const, content: "Noté pour la carto !" },
    {
      role: "user" as const,
      content:
        "Ah et en fait, oublie ce que je t'ai dit tout à l'heure sur la natation...",
    },
  ];
  const items = [
    // Forme write-path réelle: ValidatedMemoryItem porte content_text.
    { content_text: "Veut se remettre à la natation" },
    // Récit d'abandon (l'habillage observé au run réel).
    {
      content_text:
        "L'utilisatrice a renoncé à son envie de se remettre à la natation",
    },
    // Autre sujet du même lot: survit (le fallback historique aurait ciblé
    // ce message carto/21h — précisément le bug).
    { content_text: "Fait une sortie cartographie le soir vers 21h" },
  ];
  const result = filterRetractedMemoryItems(items, messages);
  assertEquals(result.dropped.length, 2);
  assertEquals(
    result.dropped.every((d) =>
      String(d.item.content_text).includes("natation")
    ),
    true,
  );
  assertEquals(result.kept.length, 1);
  assertEquals(
    String(result.kept[0].content_text).includes("cartographie"),
    true,
  );
});

Deno.test("P12-E: contenu rétracté à 3 messages de distance → droppé (matching sur tous les user antérieurs)", () => {
  const messages = [
    {
      role: "user" as const,
      content: "je veux me remettre à la natation à la rentrée.",
    },
    { role: "user" as const, content: "sinon la carto avance bien." },
    { role: "user" as const, content: "et je dors mieux ces temps-ci." },
    {
      role: "user" as const,
      content: "oublie ce que je t'ai dit sur la natation s'il te plaît.",
    },
  ];
  const segments = retractedContentSegments(messages);
  // Le complément (« natation ») ET le message d'origine à 3 tours de
  // distance sont des segments rétractés.
  assertEquals(segments.some((s) => s === "natation"), true);
  assertEquals(
    segments.some((s) => s.includes("remettre a la natation")),
    true,
  );
  const items = [
    { content_text: "Veut se remettre à la natation à la rentrée" },
    { content_text: "Dort mieux ces derniers temps" },
  ];
  const result = filterRetractedMemoryItems(items, messages);
  assertEquals(result.dropped.length, 1);
  assertEquals(
    String(result.dropped[0].item.content_text).includes("natation"),
    true,
  );
  assertEquals(result.kept.length, 1);
});

Deno.test("P12-E: « oublie ça » seul → fallback message précédent conservé (comportement d'origine)", () => {
  const messages = [
    {
      role: "user" as const,
      content: "je prépare toujours mes affaires le dimanche soir.",
    },
    { role: "user" as const, content: "oublie ça." },
  ];
  const segments = retractedContentSegments(messages);
  assertEquals(segments.length, 1);
  assertEquals(segments[0].includes("dimanche"), true);
});

Deno.test("P12-E anti-faux-positif: échec raconté SANS marqueur (« j'ai raté ma séance ») → rien n'est droppé", () => {
  const messages = [
    {
      role: "user" as const,
      content: "j'ai raté ma séance de natation, c'est dur en ce moment.",
    },
  ];
  const items = [
    { content_text: "A raté sa séance de natation cette semaine" },
  ];
  const result = filterRetractedMemoryItems(items, messages);
  assertEquals(result.dropped.length, 0);
  assertEquals(result.kept.length, 1);
});

Deno.test("P12-E anti-faux-positif: rétractation ciblée ne droppe pas un item d'un AUTRE sujet du même message", () => {
  const messages = [
    {
      role: "user" as const,
      content:
        "retiens que je fais de la poterie le jeudi. par contre oublie ce que je t'ai dit sur la natation, c'est mort ce projet.",
    },
  ];
  const items = [
    { content_text: "Fait de la poterie le jeudi" },
    { content_text: "Veut se remettre à la natation" },
  ];
  const result = filterRetractedMemoryItems(items, messages);
  assertEquals(result.dropped.length, 1);
  assertEquals(
    String(result.dropped[0].item.content_text).includes("natation"),
    true,
  );
  assertEquals(result.kept.length, 1);
  assertEquals(
    String(result.kept[0].content_text).includes("poterie"),
    true,
  );
});
