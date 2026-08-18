import React from "react";

import { supabase } from "../../lib/supabase";
import { t } from "../i18n/t";
import type { MessageKey } from "../i18n/t";
import {
  initialKitchenSelection,
  KITCHEN_TOOLS,
  type KitchenTool,
  planKitchenEquipmentWrite,
  saveKitchenEquipment,
  toggleKitchenTool,
} from "../api/kitchenEquipment";
import type { PracticalConstraints } from "../api/practicalConstraints";
import { Button } from "./ui/Button";
import { Card, SectionLabel } from "./ui/Card";
import { Field } from "./ui/Field";

// AVEC QUOI CE FOYER CUISINE — la question que le moteur ne posait à personne.
//
// Conception: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.1
//
// ── CE QUE ÇA OUVRE ────────────────────────────────────────────────────────
// Vérifié le 2026-08-18: aucune occurrence de four, de micro-ondes ou de
// congélateur dans le moteur. Le plan propose des cuissons SANS SAVOIR si
// elles sont possibles. Trois cases changent vraiment ce qu'il produit — le
// congélateur (sans lui, « une seule course, je congèle » n'existe pas), le
// micro-ondes (le geste « à réchauffer » suppose un moyen de réchauffer) et le
// four (l'essentiel du batch cooking en dépend).
//
// ── SA PLACE: AVANT LES DISPONIBILITÉS ─────────────────────────────────────
// On demande AVEC QUOI on cuisine avant de demander QUAND — sinon on planifie
// des cuissons impossibles, puis on demande à quelqu'un de trouver le temps de
// les faire. Le montage à l'étape `table` appartient au lot L6, qui réorganise
// cette étape; cette carte est écrite pour être posée telle quelle, en tête.
//
// ── ⛔ RIEN N'EST PRÉ-COCHÉ ────────────────────────────────────────────────
// La maquette du §2.1 dessine « ☑ Four ☑ Plaques »: c'est un formulaire
// REMPLI, pas un défaut. Pré-cocher écrirait un four que personne n'a déclaré
// au premier Enregistrer d'un foyer qui n'a pas lu la ligne — et l'étape où
// cette carte atterrit porte déjà la règle, mot pour mot, pour le régime, les
// moments et la taille. Ne rien pré-cocher ne coûte rien: tant que rien n'est
// enregistré, le moteur se comporte exactement comme avant ce lot (lecture à
// trois valeurs, `api/kitchenEquipment.ts`).
//
// ── LES CASES SONT DES `Button`, ET C'EST LE VOCABULAIRE DE L'ÉCRAN ────────
// `cook_days` et les tailles de repas se cochent déjà comme ça dans
// `SetupPage`: une pastille pleine = coché, un contour = décoché. Une vraie
// `<input type="checkbox">` aurait introduit un troisième dialecte de
// sélection dans le même formulaire. On ajoute en revanche `aria-pressed`, que
// les rangées existantes n'ont pas: sans lui, un lecteur d'écran annonce sept
// boutons dont aucun ne dit s'il est actif — et la couleur seule ne porte
// jamais un état.

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

export interface KitchenEquipmentCardProps {
  /** Ce que la colonne porte déjà — les autres clés ne sont pas écrasées. */
  practicalConstraints: PracticalConstraints | null;
  /** `false` tant qu'aucune ligne `student_goals` n'existe: rien à mettre à jour. */
  hasGoal: boolean;
  /** Dans une étape du tunnel: sans cadre ni titre, le parent les porte. */
  embedded?: boolean;
  onSaved: () => void | Promise<void>;
}

export default function KitchenEquipmentCard(props: KitchenEquipmentCardProps) {
  /**
   * ⚠️ LE FORMULAIRE EST FIGÉ AU MONTAGE, DONC IL LUI FAUT UNE PORTE.
   * `React.useState(() => …)` ne relit jamais: monté pendant que la lecture
   * court, il afficherait sept cases décochées, puis les écrirait telles
   * quelles au premier Enregistrer — cicatrice
   * `mount-snapshot-forms-need-a-loading-gate`. La porte ici est le PARENT:
   * `practicalConstraints === null` veut dire « pas encore lu », et la carte ne
   * rend alors aucun contrôle.
   */
  const [selection, setSelection] = React.useState<readonly KitchenTool[]>(
    () => initialKitchenSelection(props.practicalConstraints),
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);

  const loaded = props.practicalConstraints !== null;

  async function save() {
    setError(null);
    setFlash(null);
    // LE REFUS AVANT LE RÉSEAU, ET SOUS LE BOUTON QUI L'A DÉCLENCHÉ.
    const plan = planKitchenEquipmentWrite(selection);
    if (!plan.ok) {
      setError(t("setup.equipment.error_empty"));
      return;
    }
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("not signed in");
      // ⚠️ `props.practicalConstraints` N'EST PAS PASSÉ, ET C'EST LA GARDE.
      // Cette prop est la photo prise au montage de la page; l'écrivain relit
      // la colonne lui-même. Voir le pavé de `api/kitchenEquipment.ts`: sur
      // cette étape, le « Continuer » écrit `diet_asked` dans la MÊME colonne,
      // et fusionner sur une photo périmée l'efface — mesuré deux fois.
      await saveKitchenEquipment({ userId: uid, selection });
      setFlash(t("setup.equipment.saved"));
      await props.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const editor = (
    <div className="space-y-4">
      <Field
        label={t("setup.equipment.legend")}
        hint={t("setup.equipment.hint")}
      >
        {loaded
          ? (
            // `flex-wrap` + `gap`: sept pastilles tiennent sur une colonne de
            // 320 px en se repliant, sans qu'aucune ne pousse la page — la
            // rangée de `cook_days` se mesure déjà comme ça.
            <div className="flex flex-wrap gap-2">
              {KITCHEN_TOOLS.map((tool) => {
                const on = selection.includes(tool);
                return (
                  <Button
                    key={tool}
                    size="sm"
                    variant={on ? "primary" : "secondary"}
                    aria-pressed={on}
                    disabled={busy}
                    onClick={() =>
                      setSelection((prev) => toggleKitchenTool(prev, tool))}
                  >
                    {t(TOOL_LABEL[tool])}
                  </Button>
                );
              })}
            </div>
          )
          : <p className="text-sm text-ink-soft">{t("setup.equipment.loading")}</p>}
      </Field>

      {!props.hasGoal && (
        <p className="text-sm text-ink-soft">{t("setup.equipment.no_goal")}</p>
      )}

      {/* ROUGE = ÉCHEC OU REFUS, et c'est la seule teinte d'état qui parle ici.
          `red-700` sur `paper` = 6,13:1, la valeur de `Field`. */}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {flash && <p className="text-sm text-emerald-700">{flash}</p>}

      {/* ⛔ LE BOUTON N'EST PAS DÉSACTIVÉ QUAND RIEN N'EST COCHÉ, ET C'EST UNE
          DÉCISION. Un bouton gris ne dit pas POURQUOI il est gris; on appuie,
          on lit le refus juste en dessous, et on sait quoi faire. « Un refus
          loin du geste se lit comme un bouton mort » — trois fois dans
          `SetupPage`. Il est désactivé pendant l'écriture et sans ligne
          d'objectif, qui sont deux impossibilités, pas des refus. */}
      <Button
        variant="secondary"
        onClick={() => void save()}
        disabled={busy || !props.hasGoal || !loaded}
      >
        {busy ? t("setup.equipment.saving") : t("setup.equipment.save")}
      </Button>
    </div>
  );

  if (props.embedded) return editor;

  return (
    <Card>
      <SectionLabel>{t("setup.equipment.title")}</SectionLabel>
      <p className="mt-2 text-sm text-ink-soft">{t("setup.equipment.intro")}</p>
      <div className="mt-4">{editor}</div>
    </Card>
  );
}
