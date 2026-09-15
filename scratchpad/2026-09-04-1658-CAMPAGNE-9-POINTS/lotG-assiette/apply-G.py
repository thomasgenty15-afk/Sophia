#!/usr/bin/env python3
# LOT G — L'ASSIETTE PÈSE CE QU'ELLE NOURRIT (2026-09-05)
#
# Mesuré sur C03 (quatre bouches, 7 jours, plan post-ancre) :
#   table : cible 8 571 kcal/j · servi 3 192 kcal/j (37 %)
#   Paul  : déjeuner 652 g = EXACTEMENT le plafond de masse (880 kcal / 1,35) → 386 kcal
#   densité réelle des plats : 0,55–0,60 kcal/g contre 1,35 supposé
# La phrase du prompt système « one adult portion is roughly a palm of protein, a fist
# of starch, and vegetables on top » compose un tiers de repas. Aucun étage aval (ancre
# bornée ×3 puis par la masse, densifieur à plancher légumes 70 %) ne répare une
# assiette d'eau : le levier est dans le tronc, sur les DEUX lanes.
#
# Idempotent sur les anchors (assert count==1), s'arrête avant d'écrire si un anchor manque.
import io, re, sys, glob
ROOT = "supabase/functions/_shared/keel/"
S = ROOT + "meal_generation.ts"
T = ROOT + "meal_generation_test.ts"
OLD_V = "meal.en.v26_the_cooking_style_sets_the_sessions"
NEW_V = "meal.en.v27_a_plate_weighs_what_it_feeds"

writes = {}
def load(p): return io.open(p, encoding="utf-8").read()
def sub(p, old, new, label):
    s = writes.get(p) or load(p)
    n = s.count(old); assert n == 1, f"{label} @ {p}: {n} occurrence(s)"
    writes[p] = s.replace(old, new)

OLD_PARA = """Sanity, before you write a quantity: one adult portion is roughly a palm of
protein, a fist of starch, and vegetables on top. Scale from there. You never
tell the student those figures; you use them so the numbers you DO write are
believable."""
NEW_PARA = """Sanity, before you write a quantity: a full lunch or dinner for one adult is a
plate of roughly 600 to 750 g of cooked food, and most of that weight is food
that carries energy — about 200 to 250 g of cooked grains, pasta, potatoes or
pulses, about 120 to 180 g of the protein food, and a fat (oil, butter, cheese,
nuts, avocado) — with vegetables ON TOP of it, never instead of it. Breakfast is
about two thirds of that. Measured failure, and it is the quiet one: a palm of
chicken on a bed of courgettes and salad looks like a meal and carries a third
of one — a whole week composed that way left the table hungry. If the method
takes the starch off the plate, that weight moves to the protein food, the
pulses and the fat; it does not vanish. Scale from there for children and for
what you are told about the person. You never tell the student those figures;
you use them so the numbers you DO write are believable — each named portion is
sized afterwards by the app, from these."""
sub(S, OLD_PARA, NEW_PARA, "paragraphe")
sub(S, f'export const MEAL_PROMPT_VERSION = "{OLD_V}";',
       f'export const MEAL_PROMPT_VERSION = "{NEW_V}";', "version")
# Deux commentaires citent la phrase morte comme « ce que le prompt demande ».
sub(S, "dimensionner (« one adult portion is roughly a palm of protein ») et rien",
       "dimensionner (« a full lunch or dinner for one adult is a plate of roughly\n   * 600 to 750 g ») et rien", "commentaire 3420")
sub(S, "lui DEMANDE de dimensionner (« one adult portion is roughly a palm of\n    // protein ») sans jamais dire de qui.",
       "lui DEMANDE de dimensionner (« a full lunch or dinner for one adult is a\n    // plate of roughly 600 to 750 g ») sans jamais dire de qui.", "commentaire 4296")

# Les huit littéraux de version dans les tests.
for p in sorted(glob.glob(ROOT + "*_test.ts")):
    s = load(p)
    if OLD_V in s:
        writes[p] = s.replace(OLD_V, NEW_V)

# Le test qui épingle le lot — et la mutation évidente (remettre la paume) rougit.
sub(T, "  MEAL_SYSTEM_PROMPT,\n  MEAL_TOKEN_FIELDS,", "  MEAL_PROMPT_VERSION,\n  MEAL_SYSTEM_PROMPT,\n  MEAL_TOKEN_FIELDS,", "import")
PIN = '''
Deno.test("le prompt système dit ce que PÈSE un repas complet — plus une paume et un poing (lot G, 2026-09-05)", () => {
  // Mesuré sur C03 (quatre bouches, 7 jours): 3 192 kcal/jour servis pour une
  // table qui en demande 8 571 — la boîte de Paul, 652 g, pile au plafond de
  // masse, portait 386 kcal. « A palm of protein, a fist of starch » composait
  // un tiers de repas à 0,6 kcal/g, et aucun étage aval (ancre bornée par la
  // masse, densifieur à plancher légumes) ne répare une assiette d'eau.
  assertStringIncludes(MEAL_SYSTEM_PROMPT, "roughly 600 to 750 g of cooked food");
  assertStringIncludes(MEAL_SYSTEM_PROMPT, "about 200 to 250 g of cooked grains");
  assertStringIncludes(MEAL_SYSTEM_PROMPT, "about 120 to 180 g of the protein food");
  assertStringIncludes(MEAL_SYSTEM_PROMPT, "vegetables ON TOP of it, never instead of it");
  // Une méthode sans féculent déplace le poids, elle ne le retire pas — sinon la
  // consigne recréerait l'assiette d'eau chez tout coach low-carb.
  assertStringIncludes(MEAL_SYSTEM_PROMPT, "it does not vanish");
  assert(!MEAL_SYSTEM_PROMPT.includes("a fist of starch"), "la paume et le poing composaient un tiers de repas");
  // En GRAMMES, jamais en kcal: clause C5 du contrat TCA, le prompt ne porte
  // aucune énergie chiffrée. Bornée à la section, pour rougir sur CE paragraphe.
  const from = MEAL_SYSTEM_PROMPT.indexOf("== A PORTION IS ONE PERSON'S PLATE ==");
  const to = MEAL_SYSTEM_PROMPT.indexOf("== THE STRETCH STARTS TODAY ==");
  assert(from >= 0 && to > from, "sections déplacées");
  assert(!/\\bkcal\\b|calorie/i.test(MEAL_SYSTEM_PROMPT.slice(from, to)), "un kcal dans la consigne de taille");
  // La version AVANCE avec le texte: un cache qui servirait v26 sous ce nom
  // servirait la paume à un élève de plus.
  assertEquals(MEAL_PROMPT_VERSION, "meal.en.v27_a_plate_weighs_what_it_feeds");
});
'''
writes[T] = writes.get(T, load(T)).rstrip("\n") + "\n" + PIN

for p, s in writes.items():
    io.open(p, "w", encoding="utf-8").write(s)
print(f"écrit: {len(writes)} fichiers")
for p in writes: print("  ", p)
