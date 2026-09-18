import { t } from "../i18n/t";
import type { MessageKey } from "../i18n/t";
import type { KitchenTool } from "../api/kitchenEquipment";

// ⟳ 2026-09-16 — SORTI DE `KitchenEquipmentCard.tsx`, pas déplacé vers
// `api/`. Le titre replié de `/app/plan` résume les outils déclarés et a
// besoin du même libellé que les pastilles; un export de fonction dans un
// fichier de composant casse le rafraîchissement à chaud (règle
// `react-refresh/only-export-components`), et le pavé ci-dessous dit
// pourquoi la table ne peut pas vivre dans le module d'API.
/**
 * LES MOTS VIVENT ICI, PAS DANS LE MODULE D'API.
 *
 * Règle mesurée sur `api/cookingShape.ts` (2026-08-15): `pageSeams.int.test.ts`
 * attribue chaque littéral de clé à TOUTES les pages qui atteignent le module,
 * et un module d'API atteint par `/join-household` y ferait entrer un
 * namespace que cette page ne déclare pas. Les jetons voyagent, les mots
 * restent.
 *
 * ⚠️ UN LITTÉRAL PAR OUTIL, ET PAS UNE CLÉ FABRIQUÉE (`setup.equipment.tool_${
 * tool}`): une clé calculée est invisible au scanner statique, donc à la garde
 * de langue — c'est ce qui a laissé passer des écrans à moitié anglais.
 */
const TOOL_LABEL: Record<KitchenTool, MessageKey> = {
  oven: "setup.equipment.tool_oven",
  stovetop: "setup.equipment.tool_stovetop",
  microwave: "setup.equipment.tool_microwave",
  freezer: "setup.equipment.tool_freezer",
  air_fryer: "setup.equipment.tool_air_fryer",
  pressure_cooker: "setup.equipment.tool_pressure_cooker",
  blender: "setup.equipment.tool_blender",
};

/** Le libellé d'un outil — les pastilles de la carte et le titre replié de
 *  `/app/plan` lisent la même table. */
export function kitchenToolLabel(tool: KitchenTool): string {
  return t(TOOL_LABEL[tool]);
}
