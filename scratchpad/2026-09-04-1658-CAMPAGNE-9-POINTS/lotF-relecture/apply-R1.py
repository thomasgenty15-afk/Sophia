#!/usr/bin/env python3
# R1 — point 1 : pour une bouche AVEC compte, l'objectif et l'âge se lisent sur SON profil
# (`student_goals.goal`, `profiles.birth_date`), pas sur la copie de `household_members`.
import io
I="supabase/functions/meal-energy-v1/index.ts"
s=io.open(I,encoding='utf-8').read()
def sub(old,new,label):
    global s
    n=s.count(old); assert n==1, f"{label}: {n}"
    s=s.replace(old,new)
sub("""    const mouths = (membersRes.error ? [] : ((membersRes.data ?? []) as HouseholdMouthRow[])).map((m) => ({
      memberId: String(m.member_id),
      userId: m.user_id ? String(m.user_id) : null,
      birthDate: m.birth_date === null || m.birth_date === undefined ? null : String(m.birth_date),
      goal: m.goal === null || m.goal === undefined ? null : String(m.goal),
    }));""",
"""    const rawMouths = membersRes.error ? [] : ((membersRes.data ?? []) as HouseholdMouthRow[]);
    // ⟳ R1 (2026-09-05) — POUR UNE BOUCHE AVEC COMPTE, L'AUTORITÉ EST SON PROFIL.
    // `household_members.goal` et `.birth_date` sont des COPIES prises à la
    // réclamation, jamais resynchronisées: l'autorité SQL dit `student_goals.goal`
    // (20260814110000) et `profiles.birth_date` (20260812180000), et c'est ce
    // que lit le générateur. Lu sur la copie, un titulaire passé en maintenance
    // sur son compte gardait sa boîte chiffrée; un mineur par profil, adulte par
    // fiche, recevait un kcal. Relecture croisée R1, point 1.
    const accountIds = rawMouths.map((m) => m.user_id).filter((u): u is string => !!u);
    const profileByUser = new Map<string, { birth_date: string | null }>();
    const goalByUser = new Map<string, string | null>();
    if (accountIds.length > 0) {
      const [profRes, goalRes] = await Promise.all([
        args.admin.from("profiles").select("id, birth_date").in("id", accountIds),
        args.admin.from("student_goals").select("user_id, goal").in("user_id", accountIds),
      ]);
      for (const p of (profRes.error ? [] : (profRes.data ?? [])) as Array<Record<string, unknown>>) {
        profileByUser.set(String(p.id), { birth_date: p.birth_date === null || p.birth_date === undefined ? null : String(p.birth_date) });
      }
      for (const g of (goalRes.error ? [] : (goalRes.data ?? [])) as Array<Record<string, unknown>>) {
        goalByUser.set(String(g.user_id), g.goal === null || g.goal === undefined ? null : String(g.goal));
      }
    }
    const mouths = rawMouths.map((m) => {
      const userId = m.user_id ? String(m.user_id) : null;
      const fromRoster = {
        birthDate: m.birth_date === null || m.birth_date === undefined ? null : String(m.birth_date),
        goal: m.goal === null || m.goal === undefined ? null : String(m.goal),
      };
      if (userId === null) return { memberId: String(m.member_id), userId, ...fromRoster };
      // ⛔ UN COMPTE DONT LE PROFIL N'A PAS ÉTÉ LU SE FERME: `birthDate: null` ⇒
      // `age_unknown`. On ne retombe pas sur la copie de la fiche — c'est
      // exactement la source que ce correctif retire.
      const prof = profileByUser.get(userId);
      return {
        memberId: String(m.member_id),
        userId,
        birthDate: prof ? prof.birth_date : null,
        goal: goalByUser.has(userId) ? goalByUser.get(userId) ?? null : null,
      };
    });""", "autorité profil")
io.open(I,'w',encoding='utf-8').write(s); print("ok · meal-energy-v1 : autorité profil pour les comptes")

# pin de câblage dans le filet du gate (R1 point 3 : R7 n'était gardée que hors filet)
M="supabase/functions/_shared/keel/energy_gate_mouth_test.ts"
s=io.open(M,encoding='utf-8').read()
old="""  assertStringIncludes(src, "await readFloor(m.userId);");"""
assert s.count(old)==1
s=s.replace(old, old+"""
  // ⟳ R1 — POUR UN COMPTE, L'AUTORITÉ EST SON PROFIL, pas la copie du roster.
  assertStringIncludes(src, 'from("profiles").select("id, birth_date").in("id", accountIds)');
  assertStringIncludes(src, 'from("student_goals").select("user_id, goal").in("user_id", accountIds)');
  // ⟳ R1 — R7 DANS LE FILET DU GATE. `keel_properties/` n'est pas lancé par le
  // gate; la garde vivait donc là seulement. Ici aussi: la fermeture douce ne
  // s'ouvre que sur `no_direction`, jamais sur `explicit_off`.
  const cond = src.slice(src.indexOf("const readerClosedByDefault ="), src.indexOf(";", src.indexOf("const readerClosedByDefault =")));
  assertStringIncludes(cond, 'readerSwitchSource === "no_direction"');
  assertEquals(cond.includes("explicit_off"), false, cond);""")
io.open(M,'w',encoding='utf-8').write(s); print("ok · pins R1 dans le filet")
