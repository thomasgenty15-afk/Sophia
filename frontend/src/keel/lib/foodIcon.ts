/**
 * L'ICÔNE D'UN PLAT — tirée de son aliment principal (`GeneratedDish.main_food`,
 * choisi par le serveur dans `dish_main_food.ts`).
 *
 * Deux tables, lues dans cet ordre: la FAMILLE (« chicken »), puis le GROUPE
 * (« poultry »). Aucune des deux ⇒ `null`, et le plat s'affiche sans icône.
 *
 * ⛔ CORRESPONDANCE EXACTE, JAMAIS DE SOUS-CHAÎNE. Les clés sont les valeurs de
 * `food_composition_refs.family` et de `food_groups.slug`, pas des mots à
 * chercher dans un titre (« laitue » contient « lait »).
 *
 * Les dessins sont des emojis Unicode: aucun fichier à charger, et ils
 * s'affichent en couleur sur iOS, Android, macOS et Windows 11. Windows 10
 * n'a pas les plus récents (🫘 🫑 🫒 🫐 🫛 🫚) et les montre en carré vide.
 * Remplacer un emoji par un dessin maison ne change que la valeur, jamais la clé.
 */
import type { DishMainFood } from "../api/mealGeneration";

/** Par famille (`food_composition_refs.family`). */
export const FAMILY_ICONS: Readonly<Record<string, string>> = {
  // ── Volailles ──
  chicken: "🍗",
  turkey: "🍗",
  duck: "🍗",
  goose: "🍗",
  guinea_fowl: "🍗",
  poultry: "🍗",
  // ── Viandes ──
  beef: "🥩",
  veal: "🥩",
  lamb: "🥩",
  goat: "🥩",
  horse: "🥩",
  game: "🥩",
  meat: "🥩",
  offal: "🥩",
  pork: "🥩",
  rabbit: "🥩",
  meatballs: "🥩",
  ham: "🍖",
  cured_meat: "🍖",
  pate: "🍖",
  bacon: "🥓",
  sausage: "🌭",
  // ── Poissons et fruits de mer (les poissons tombent sur leur groupe) ──
  prawns: "🦐",
  crab: "🦀",
  squid: "🦑",
  mussels: "🦪",
  scallops: "🦪",
  // ── Œufs, légumineuses, protéines végétales ──
  eggs: "🥚",
  beans: "🫘",
  lentils: "🫘",
  chickpeas: "🫘",
  broad_beans: "🫘",
  lima_beans: "🫘",
  edamame: "🫛",
  tofu: "🌱",
  tempeh: "🌱",
  plant_based_meat: "🌱",
  // ── Féculents ──
  rice: "🍚",
  pasta: "🍝",
  bread: "🥖",
  croutons: "🥖",
  crispbread: "🥖",
  breadcrumbs: "🥖",
  wrap: "🌯",
  pizza_dough: "🍕",
  potato: "🥔",
  fries: "🍟",
  sweet_potato: "🍠",
  yam: "🍠",
  cassava: "🍠",
  taro: "🍠",
  couscous: "🌾",
  bulgur: "🌾",
  quinoa: "🌾",
  buckwheat: "🌾",
  barley: "🌾",
  flour: "🌾",
  oats: "🥣",
  cereal: "🥣",
  polenta: "🌽",
  corn: "🌽",
  squash: "🎃",
  peas: "🫛",
  plantain: "🍌",
  // ── Légumes ──
  broccoli: "🥦",
  cauliflower: "🥦",
  cabbage: "🥬",
  kale: "🥬",
  brussels_sprouts: "🥬",
  pak_choi: "🥬",
  lettuce: "🥬",
  spinach: "🥬",
  chard: "🥬",
  rocket: "🥬",
  watercress: "🥬",
  herbs: "🌿",
  tomato: "🍅",
  carrot: "🥕",
  courgette: "🥒",
  cucumber: "🥒",
  aubergine: "🍆",
  bell_pepper: "🫑",
  chilli: "🌶️",
  mushroom: "🍄",
  onion: "🧅",
  shallot: "🧅",
  leek: "🧅",
  garlic: "🧄",
  ginger: "🫚",
  green_beans: "🫛",
  snow_peas: "🫛",
  avocado: "🥑",
  olives: "🫒",
  mixed_vegetables: "🥗",
  // ── Fruits ──
  apple: "🍎",
  pear: "🍐",
  banana: "🍌",
  peach: "🍑",
  apricot: "🍑",
  // Pas d'emoji prune: le fruit à noyau le plus proche, plutôt que la pomme
  // du groupe, qui se lirait « pomme ».
  plum: "🍑",
  prune: "🍑",
  cherry: "🍒",
  strawberry: "🍓",
  raspberry: "🍓",
  blackberry: "🫐",
  blueberry: "🫐",
  mixed_berries: "🫐",
  orange: "🍊",
  clementine: "🍊",
  grapefruit: "🍊",
  lemon: "🍋",
  lime: "🍋",
  grapes: "🍇",
  raisins: "🍇",
  kiwi: "🥝",
  mango: "🥭",
  pineapple: "🍍",
  melon: "🍈",
  watermelon: "🍉",
};

/** Par groupe (`food_groups.slug`) — le repli quand la famille n'a pas d'icône. */
export const GROUP_ICONS: Readonly<Record<string, string>> = {
  poultry: "🍗",
  red_meat: "🥩",
  lean_protein: "🍖",
  fatty_fish: "🐟",
  white_fish: "🐟",
  shellfish: "🦐",
  eggs: "🥚",
  legumes: "🫘",
  tofu_tempeh: "🌱",
  whole_grain: "🌾",
  refined_grain: "🌾",
  starchy_veg: "🥔",
  cruciferous_veg: "🥦",
  leafy_greens: "🥬",
  non_starchy_veg: "🥗",
  berries: "🍓",
  citrus: "🍊",
  other_fruit: "🍎",
  dairy_yogurt: "🥛",
  dairy_cheese: "🧀",
};

export function foodIconOf(mainFood: DishMainFood | null | undefined): string | null {
  if (!mainFood) return null;
  // `Object.hasOwn`: une famille nommée « constructor » ne doit pas rendre
  // une fonction du prototype.
  if (Object.hasOwn(FAMILY_ICONS, mainFood.family)) return FAMILY_ICONS[mainFood.family];
  if (Object.hasOwn(GROUP_ICONS, mainFood.group)) return GROUP_ICONS[mainFood.group];
  return null;
}
