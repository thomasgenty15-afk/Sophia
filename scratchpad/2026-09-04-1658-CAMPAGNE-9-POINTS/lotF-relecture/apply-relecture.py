#!/usr/bin/env python3
# LOT F · RELECTURE — à poser quand la lane serveur est libre. Anchors exigés ×1.
import io,shutil,re
def patch(path, subs):
    s=io.open(path,encoding='utf-8').read()
    for old,new,label in subs:
        n=s.count(old); assert n==1, f"{path} · {label}: {n}"
        s=s.replace(old,new)
    io.open(path,'w',encoding='utf-8').write(s); print("ok ·",path)
S="scratchpad/2026-09-04-1658-CAMPAGNE-9-POINTS/lotF-relecture"
K="supabase/functions/_shared/keel"
shutil.copy(f"{S}/box_energy_decision.ts", f"{K}/box_energy_decision.ts")
shutil.copy(f"{S}/box_energy_decision_test.ts", f"{K}/box_energy_decision_test.ts")
print("ok · module pur + test copiés sous _shared/keel/")

# ── index.ts : la lane LIT, puis appelle le module pur ──
I="supabase/functions/meal-energy-v1/index.ts"
s=io.open(I,encoding='utf-8').read()
a=s.index("/**\n * LE COMPTEUR DE LA PORTE PAR BOÎTE")
b=s.index("Deno.serve(async (req) => {")
assert a<b
NEW_HELPER = '''/**
 * ⟳ RELECTURE (2026-09-05) — LA LANE LIT, LE MODULE DÉCIDE. La décision par
 * boîte vit dans `box_energy_decision.ts` (pure, testée, mutée). Ici on ne fait
 * que résoudre ce qu'elle exige: le roster du foyer, les planchers et les
 * interrupteurs des bouches qui ont un compte — en cache dans la requête —, et
 * l'appartenance du LECTEUR à ce foyer.
 *
 * ⛔ `viewerIsMember` EST LE FAIT DE LECTURE DE LA RELECTURE: le roster se lit
 * sur `row.household_id`, et un lecteur sorti du foyer qui garde une ligne non
 * retirée recevait les kcal de ses anciens co-membres. Rien ne sort s'il n'est
 * pas (plus) membre, et le compteur le dit.
 */
interface HouseholdMouthRow {
  member_id: string;
  user_id: string | null;
  birth_date: string | null;
  goal: string | null;
}

async function boxEnergyByPlan(args: {
  admin: SupabaseClient;
  rows: readonly PlanRow[];
  index: Awaited<ReturnType<typeof loadCompositionIndex>>;
  today: string;
  coachCounting: CountingStance;
  viewerMemberId: string | null;
  requestId: string;
}): Promise<Map<string, { boxes: EmittedBox[]; gate: BoxGateCounts }>> {
  const out = new Map<string, { boxes: EmittedBox[]; gate: BoxGateCounts }>();
  const floors = new Map<string, boolean>();
  const switches = new Map<string, boolean | null>();

  const readFloor = async (userId: string) => {
    if (floors.has(userId)) return;
    let flag = true; // fail-closed tant qu'on n'a pas LU
    try {
      const floor = await evaluateRestrictionForStudent(args.admin as never, {
        userId,
        asOfLocalDate: args.today,
      });
      flag = floor.restriction_flag === true;
    } catch (error) {
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId: args.requestId,
        error,
        metadata: { source: "box_gate_floor" },
      });
    }
    floors.set(userId, flag);
  };
  const readSwitch = async (userId: string) => {
    if (switches.has(userId)) return;
    const res = await args.admin
      .from("profiles")
      .select("energy_display_enabled")
      .eq("id", userId)
      .maybeSingle();
    // ⚠️ UNE LECTURE EN PANNE VAUT « ÉTEINT », pas « personne n'a choisi »:
    // `null` laisserait la direction rallumer un interrupteur qu'on n'a pas su
    // lire — la mauvaise direction d'erreur.
    switches.set(
      userId,
      res.error ? false : readTriState((res.data as Record<string, unknown> | null)?.energy_display_enabled),
    );
  };

  for (const row of args.rows) {
    if (row.plan_kind !== "household" || !row.household_id) {
      out.set(row.id, { boxes: [], gate: boxGateZero() });
      continue;
    }
    const membersRes = await args.admin
      .from("household_members")
      .select("member_id, user_id, birth_date, goal")
      .eq("household_id", row.household_id);
    const mouths = (membersRes.error ? [] : ((membersRes.data ?? []) as HouseholdMouthRow[])).map((m) => ({
      memberId: String(m.member_id),
      userId: m.user_id ? String(m.user_id) : null,
      birthDate: m.birth_date === null || m.birth_date === undefined ? null : String(m.birth_date),
      goal: m.goal === null || m.goal === undefined ? null : String(m.goal),
    }));
    for (const m of mouths) {
      if (m.userId) {
        await readFloor(m.userId);
        await readSwitch(m.userId);
      }
    }
    const decided = decideBoxEnergy({
      perBox: boxEnergies({
        index: args.index,
        dishes: readEnergyBoxDishes(row.dishes),
        preparations: readPreparations(row.preparations),
      }),
      mouths,
      floors,
      switches,
      coachCounting: args.coachCounting,
      today: args.today,
      viewer: args.viewerMemberId === null
        ? "unattached"
        : (mouths.some((m) => m.memberId === args.viewerMemberId) ? "member" : "not_member"),
    });
    // ⟳ RELECTURE — LE COMPTEUR SE JOURNALISE. Un champ déclaré a besoin d'un
    // compteur, et un compteur a besoin d'un lecteur: sans cette ligne,
    // `boxes_gate` n'était lu par personne, et deux mutations dessus restaient
    // vertes.
    console.log(JSON.stringify({
      tag: "keel.meal_energy.box_gate",
      request_id: args.requestId,
      plan_id: row.id,
      ...decided.gate,
    }));
    out.set(row.id, decided);
  }
  return out;
}

'''
s=s[:a]+NEW_HELPER+s[b:]
# imports : le module pur remplace les portes appelées ici
s=s.replace('''import {
  BOX_ENERGY_REASONS,
  canEmitBoxEnergy,
  canShowEnergy,
  canShowTarget,
  type CountingStance,
  type EnergyGateReason,
  type EnergySwitchSource,
  energySafetyGates,
  energySwitchFrom,
} from "../_shared/keel/energy_gate.ts";''','''import {
  canShowEnergy,
  canShowTarget,
  type CountingStance,
  type EnergyGateReason,
  type EnergySwitchSource,
} from "../_shared/keel/energy_gate.ts";
import {
  type BoxGateCounts,
  boxGateZero,
  decideBoxEnergy,
  type EmittedBox,
} from "../_shared/keel/box_energy_decision.ts";''',1)
assert "decideBoxEnergy," in s
s=s.replace('import { ACTIVITY_LEVELS, type ActivityLevel, GOAL_TOKENS } from "../_shared/keel/tokens.ts";','import { ACTIVITY_LEVELS, type ActivityLevel } from "../_shared/keel/tokens.ts";',1)
s=s.replace('import { assessBirthDate, type BirthDateVerdict, usableAge } from "../_shared/keel/student_age.ts";','import { type BirthDateVerdict, usableAge } from "../_shared/keel/student_age.ts";',1)
# l'appel : passer le lecteur
old_call='''    const boxesByPlan = await boxEnergyByPlan({
      admin,
      rows,
      index,
      today,
      coachCounting,
      requestId,
    });'''
assert s.count(old_call)==1
s=s.replace(old_call,'''    const boxesByPlan = await boxEnergyByPlan({
      admin,
      rows,
      index,
      today,
      coachCounting,
      viewerMemberId,
      requestId,
    });''')
# le solo en maintenance sans plan garde `student_off / switch_offerable: true`
old_np='    if (rows.length === 0) return closed(req, requestId, "no_plan");'
assert s.count(old_np)==1
s=s.replace(old_np,'''    // ⟳ RELECTURE — SANS PLAN, LE MOTIF DU LECTEUR SURVIT. Avant le lot F, un
    // lecteur fermé par défaut rendait `student_off` AVANT la lecture des plans,
    // donc `switch_offerable: true`, et l'écran lui offrait l'interrupteur.
    // Rendre `no_plan` ici le lui aurait retiré en silence.
    if (rows.length === 0) {
      return closed(req, requestId, readerClosedByDefault ? "student_off" : "no_plan");
    }''')
io.open(I,'w',encoding='utf-8').write(s); print("ok ·",I)

# ── keel_properties : deux gardes adaptées à ce que le code fait vraiment ──
P="supabase/functions/sophia-brain/test_harness/keel_properties/no_calorie_to_student_property_test.ts"
patch(P, [
('''      ["studentSwitch", "energySwitchFrom({"],''',
'''      // ⟳ LOT F (2026-09-05) — LA RÉDUCTION PEUT ÊTRE HISSÉE. `energy_gate_io.ts`
      // réduit l'interrupteur UNE fois dans `const displaySwitch = energySwitchFrom({`
      // et passe `displaySwitch.on`, parce que l'appelant a aussi besoin de sa
      // `.source`. Le garde accepte cette forme si et seulement si la variable
      // vient bien de `energySwitchFrom` — vérifié juste après la boucle.
      ["studentSwitch", "displaySwitch.on"],'''),
('''  assertStringIncludes(io, "await evaluateRestrictionForStudent(");''',
'''  assertStringIncludes(io, "await evaluateRestrictionForStudent(");
  // ⟳ LOT F — la variable hissée vient de la SEULE écriture de la règle.
  assertStringIncludes(io, "const displaySwitch = energySwitchFrom({");'''),
('''  assertStringIncludes(body, "show: false");
  assertStringIncludes(body, "reason");
});''',
'''  assertStringIncludes(body, "show: false");
  assertStringIncludes(body, "reason");
  // ⟳ LOT F (2026-09-05) — LA SEULE FERMETURE QUI PORTE QUELQUE CHOSE, gardée
  // à part. Quand le lecteur est fermé PAR DÉFAUT (maintenance, rien choisi),
  // la réponse porte les boîtes des bouches à objectif — et RIEN du lecteur:
  // ni plat, ni jour, ni cible, ni base. Cette branche ne passe pas par
  // `closed()`, donc le garde ci-dessus ne la voyait pas (relecture croisée).
  const soft = fn.indexOf("if (readerClosedByDefault) {");
  assertEquals(soft >= 0, true, "la fermeture douce a bougé — relis ce garde");
  const softBody = fn.slice(soft, fn.indexOf("\\n    }\\n", soft));
  for (const banned of ["dishes:", "days:", "target:", "basis:", "kcal:", "_kcal", "eating_out_advice"]) {
    assertEquals(softBody.includes(banned), false, `la fermeture douce porte "${banned}"`);
  }
  assertStringIncludes(softBody, "boxes:");
  assertStringIncludes(softBody, "boxes_gate:");
  // ⛔ ET ELLE NE S'OUVRE QUE SUR LA FERMETURE PAR DÉFAUT — jamais sur un
  // lecteur qui a EXPLICITEMENT éteint (R7). Mutation M4 de la relecture.
  const cond = fn.slice(fn.indexOf("const readerClosedByDefault ="), fn.indexOf(";", fn.indexOf("const readerClosedByDefault =")));
  assertStringIncludes(cond, 'readerSwitchSource === "no_direction"');
  assertEquals(cond.includes("explicit_off"), false, `la fermeture douce laisse passer un lecteur qui a éteint: ${cond}`);
});'''),
])

# ── les pins de câblage et la liste des appelants relus ──
M=f"{K}/energy_gate_mouth_test.ts"
patch(M, [
('''  assertStringIncludes(src, "canEmitBoxEnergy({");
  // ⛔ UN NOM, ET UN SEUL: la ligne exacte qui écarte le bac partagé.
  assertStringIncludes(src, "if (box.memberIds.length !== 1) continue;");
  // La ceinture est celle de la BOUCHE: son âge lu sur sa ligne de foyer.
  assertStringIncludes(src, "ageVerdict: assessBirthDate(mouth.birth_date, args.today),");''',
'''  // ⟳ RELECTURE (2026-09-05) — LA DÉCISION EST DANS LE MODULE PUR, la lane
  // ne fait que la nourrir. Ce qu'on épingle ici est le CÂBLAGE: la lane
  // appelle le module, lui passe l'appartenance du lecteur, et lit le roster
  // par compte avant d'appeler.
  assertStringIncludes(src, "decideBoxEnergy({");
  assertStringIncludes(src, 'viewer: args.viewerMemberId === null');
  assertStringIncludes(src, 'mouths.some((m) => m.memberId === args.viewerMemberId) ? "member" : "not_member"');
  assertStringIncludes(src, "await readFloor(m.userId);");
  const pure = await Deno.readTextFile(new URL("./box_energy_decision.ts", import.meta.url));
  assertStringIncludes(pure, "canEmitBoxEnergy({");
  // ⛔ UN NOM, ET UN SEUL: la ligne exacte qui écarte le bac partagé.
  assertStringIncludes(pure, "if (box.memberIds.length !== 1) continue;");
  // La ceinture est celle de la BOUCHE: son âge lu sur sa ligne de foyer, son
  // plancher lu sur SON compte — jamais un `false` en dur (mutation M7).
  assertStringIncludes(pure, "ageVerdict: assessBirthDate(mouth.birthDate, args.today),");
  assertStringIncludes(pure, "args.floors.get(userId) ?? true");'''),
('''      // ⟳ LOT F (2026-09-04) — RELU: la lane d'énergie juge chaque boîte à un
      // nom sous la chaîne ①②③ de SA bouche (`boxEnergyByPlan`), puis
      // `canEmitBoxEnergy`. C'est le seul endroit où un kcal PAR BOUCHE sort
      // vers un écran, et il ne sort que par cette porte.
      "meal-energy-v1/index.ts",''',
'''      // ⟳ LOT F (2026-09-04, déplacé le 05) — RELU: la décision par boîte vit
      // dans `box_energy_decision.ts`, pure et mutée; c'est elle qui appelle la
      // chaîne ①②③ sur la bouche, puis `canEmitBoxEnergy`. La lane d'énergie ne
      // l'appelle plus directement.
      "keel/box_energy_decision.ts",'''),
])
print("RELECTURE POSÉE — lancer: deno test box_energy_decision_test + energy_gate_mouth_test + keel_properties, puis gate")
