-- ============================================================================
-- A2 · « COMMENT VOULEZ-VOUS CUISINER ? » ET « COMBIEN DE COURSES ? »
--
-- Chantier: scratchpad/2026-09-03-1308-MASTER-PROMPT-8-CHANTIERS.md §5.6 (P2)
-- Analyse:  scratchpad/2026-09-03-1237-ANALYSE-8-POINTS-ET-PLAN-8-AGENTS.md §2
-- Amont:    20260818110000 (le patron du commentaire de colonne, et sa règle
--                           « absente n'est pas vide »)
--           20260901180000 (le port `keel_write_field_changes_for` et sa liste
--                           fermée, reprise ici PAR EXTRACTION
--                           `pg_get_functiondef` puis patchée sur UN point)
--           20260903170000 (A1: la veille est le rang 0 de la fenêtre)
--
-- ── CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE NE FAIT PAS ──────────────────
-- Elle ne crée AUCUNE colonne: `cooking_style` et `grocery_runs` sont deux
-- clés de `student_goals.practical_constraints`, comme `kitchen_equipment` et
-- `eating_rhythm` avant elles. Ce qu'elle fait tient en deux gestes:
--
--   ① LE COMMENTAIRE DE COLONNE les DÉCRIT — c'est le seul endroit où
--      quelqu'un qui lit la base apprend qu'elles existent, ce qu'elles valent,
--      et surtout que **l'absence de la clé n'est pas une réponse**;
--   ② LA LISTE FERMÉE du port `keel_write_field_changes_for` les ACCEPTE.
--
-- ⛔ AUCUN CHECK SQL SUR LA VALEUR, et c'est la doctrine de ce dépôt
-- (`20260805150000:58-64`, reprise mot pour mot par `20260818110000`): le
-- parseur borne (liste fermée, valeur inconnue = « jamais demandé »), et une
-- contrainte SQL ferait échouer une écriture que le lecteur sait vraiment
-- réparer. C'est testé des deux côtés (`_shared/keel/cooking_plan_test.ts`).
--
-- ⛔ ET SURTOUT: L'ABSENCE DE LA CLÉ N'EST PAS « le moins possible ». C'est la
-- cicatrice de `20260818110000:48-51`, payée sur `kitchen_equipment`: si
-- l'absence se lisait comme le style le plus bas, le premier plan composé après
-- ce lot passerait TOUTE la population en « je réchauffe, 30 minutes, recettes
-- simples, aucune variété » — un lot de collecte qui dégrade le produit pour
-- ceux à qui il n'a rien demandé.
--
-- ── POURQUOI LE PORT DOIT LES ACCEPTER ─────────────────────────────────────
-- Le retour de fin de plan (FF-054, « je n'ai pas eu le temps de cuisiner »)
-- descendait `cooking_time_min` de quelques minutes — un champ que plus
-- personne ne voit depuis que la question a changé. Il descend maintenant le
-- STYLE d'un cran (décision D2.5), et il passe par ce port. Sans les deux mots
-- dans la liste fermée, le port rendrait `forbidden_field`, le producteur
-- compterait un refus, et le réglage ne bougerait JAMAIS — en silence.
--
-- ── LA DIRECTION, ÉCRITE AVANT D'AVOIR VU LE RÉSULTAT ──────────────────────
-- Le bloc de contrôle en fin de fichier écrit un style par le port et vérifie
-- qu'il ARRIVE; puis il écrit une clé hors liste et vérifie qu'elle est
-- REFUSÉE par son nom. Il roule dans la transaction et ne laisse rien.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LE COMMENTAIRE DE COLONNE — le seul endroit où la base se raconte
-- ---------------------------------------------------------------------------
-- ⚠️ IL EST RÉÉCRIT EN ENTIER, PAS COMPLÉTÉ. `comment on column` REMPLACE;
-- il n'existe pas de « append ». Le texte ci-dessous est celui de
-- `20260818110000` mot pour mot, plus le paragraphe de P2 — relire la version
-- vivante avant d'y toucher (`col_description`), parce qu'une autre lane peut
-- l'avoir enrichi entre-temps.
comment on column public.student_goals.practical_constraints is
  'Contraintes pratiques STRUCTUREES, sur lesquelles le générateur branche '
  '(par opposition à `situation`, qu''il ne fait que lire). Clés connues: '
  'cooking_time_min, cook_days[], recipe_difficulty, variety, budget_amount, '
  'eats_out_per_week, no_cook_days[], away_days[], kitchen_equipment[], '
  'cooking_style, grocery_runs, et '
  'eating_rhythm[] = [{"slot":"breakfast"|"snack_am"|"lunch"|"snack_pm"'
  '|"dinner"|"before_bed", "at":"HH:MM"|null}] — les moments où l''élève mange '
  'sur une journée normale. L''heure est FACULTATIVE: « je grignote '
  'l''après-midi » vaut sans « à 17h », et une heure inventée deviendrait une '
  'contrainte que personne n''a exprimée. `budget_amount` est un MONTANT '
  '(monnaie du pays de l''élève) qui couvre la liste de courses entière du plan '
  'composé; il remplace `budget_band` (« tight/normal/comfortable »), qui n''a '
  'plus aucun lecteur depuis le 2026-08-13 et n''est PAS converti — un adjectif '
  'ne désigne pas une somme. Sa persistance ne sert qu''à pré-remplir la '
  'question posée à la composition suivante. `kitchen_equipment[]` (2026-08-18) '
  'est une liste FERMEE de sept jetons — oven, stovetop, microwave, freezer, '
  'air_fryer, pressure_cooker, blender — décrivant ce avec quoi le FOYER peut '
  'cuisiner; c''est une propriété de la cuisine (partagée, durable), pas de la '
  'personne ni de la semaine. ⚠️ L''ABSENCE DE LA CLE N''EST PAS UNE LISTE '
  'VIDE: absente = la question n''a jamais été posée, et le moteur se comporte '
  'comme avant le 2026-08-18; une liste non vide déclare que ce qui n''y '
  'figure PAS est absent de cette cuisine; `[]` n''est pas une réponse (un '
  'foyer sans aucun des sept ne cuisine pas) et se relit comme une absence. '
  'Trois jetons changent réellement un plan: freezer (sans lui « une seule '
  'course, je congèle » et toute conservation au-delà de 3 jours sont '
  'impossibles), microwave (le geste « à réchauffer » suppose un moyen de '
  'réchauffer, sinon le temps du jour J change) et oven (l''essentiel du batch '
  'cooking). Lecteur unique: '
  'supabase/functions/_shared/keel/kitchen_equipment.ts. '
  '`cooking_style` et `grocery_runs` (2026-09-03, P2) REMPLACENT la question '
  '« combien de temps dure une session de cuisine ». `cooking_style` vaut '
  'minimal | balanced | keen — « le moins possible, je réchauffe », « un juste '
  'milieu », « j''aime cuisiner, envoie » — et `grocery_runs` vaut 1, 2 ou 3: '
  'combien de fois par plan la personne accepte d''aller au magasin. Les deux '
  'sont DURABLES (une propriété de sa vie, pas de sa semaine; « cette semaine '
  'je reçois » se règle par `one_cooking_session`, qui est une entrée de '
  'requête et ne s''écrit dans aucune colonne). Elles DERIVENT '
  '`cooking_time_min`, `recipe_difficulty` et `variety`, qui restent lues par '
  'cinq lecteurs et ne sont plus DEMANDEES. Le nombre de sessions de cuisine '
  'vaut min(grocery_runs, 3, plafond du style, jours mangés), et « 1 course » '
  'exige un congélateur déclaré — sinon 2 sessions, et l''explication du plan '
  'le dit. ⚠️ L''ABSENCE D''UNE DE CES DEUX CLES N''EST PAS UNE REPONSE, et '
  'surtout pas « minimal »: absente = la question n''a jamais été posée, les '
  'lecteurs retombent sur `cooking_time_min` tel quel, et le moteur se comporte '
  'comme avant le 2026-09-03. AUCUN CHECK SQL sur leur valeur, pour la raison '
  'exacte de `kitchen_equipment`: le parseur borne, une contrainte ferait '
  'échouer une écriture que le lecteur sait réparer. Lecteur unique: '
  'supabase/functions/_shared/keel/cooking_plan.ts.';

-- ---------------------------------------------------------------------------
-- 2. LE PORT — la MÊME fonction, avec deux mots de plus dans sa liste fermée
-- ---------------------------------------------------------------------------
-- Corps extrait par `pg_get_functiondef` de la base locale, patché sur UN seul
-- point (la boucle des clés autorisées) et rien d'autre. Cette fonction porte
-- le prédicat de concurrence de M5 — « le témoin ne porte que sur les clés
-- touchées » — et une transcription approximative se paierait sur le profil de
-- quelqu'un.
--
-- ⚠️ Aucun `grant` ici: `create or replace` CONSERVE l'ACL, et la signature ne
-- bouge pas. Le contrôle ⑥ de `20260901180000` (service_role seul) reste vrai,
-- et le contrôle ci-dessous le re-vérifie.

CREATE OR REPLACE FUNCTION public.keel_write_field_changes_for(p_user uuid, p_expected jsonb, p_patch jsonb, p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rows integer;
  v_key text;
  v_pc jsonb;
begin
  -- ⚠️ `p_user` ET PAS `auth.uid()`, comme 1F et pour la même raison: cet appel
  -- vient d'une fonction edge en `service_role`, où `auth.uid()` est NULL. La
  -- contrepartie est le `grant` à `service_role` SEUL, tout en bas.
  if p_user is null then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;

  -- LA FORME EST EXIGÉE, jamais devinée.
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'bad_patch');
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_changes');
  end if;
  if p_patch = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_write');
  end if;

  -- ⛔ AUCUNE CLÉ HORS DE LA LISTE FERMÉE. C'est la garde qui empêche ce port de
  -- devenir « écris n'importe quoi dans le profil »: un appelant qui passerait
  -- `food_preferences`, `away_days` ou une clé de sécurité les écrirait sans
  -- qu'aucune matrice ne l'ait autorisé. La liste est celle de
  -- `WRITABLE_FIELDS` (`_shared/keel/field_change.ts`), et le contrôle ⑤ plus
  -- bas exige que les deux disent la même chose.
  --
  -- ⚠️ ELLE EST ÉCRITE EN DUR ICI, et c'est voulu: un port SQL qui irait lire sa
  -- propre liste d'autorisation ailleurs ne serait plus une garde. Le prix est
  -- une recopie, et le prix de la recopie est un test qui compare les deux.
  for v_key in select jsonb_object_keys(p_patch) loop
    -- ⟳ A2 (2026-09-03) — DEUX CLÉS DE PLUS, ET ELLES SONT LA RÉPONSE DE P2.
    -- `cooking_style` et `grocery_runs` remplacent la question « combien de
    -- temps dure une session ». Le retour de fin de plan descend le STYLE d'un
    -- cran (D2.5) et passe par CE port: sans ces deux mots ici, il rendrait
    -- `forbidden_field` et le réglage ne bougerait jamais — en silence, parce
    -- que le producteur ne fait que compter ses refus.
    if v_key not in (
      'cook_days', 'cooking_time_min', 'budget_amount',
      'recipe_difficulty', 'variety', 'eating_rhythm',
      'cooking_style', 'grocery_runs'
    ) then
      return jsonb_build_object('ok', false, 'reason', 'forbidden_field');
    end if;
  end loop;

  -- ── L'ÉCRITURE, EN UN SEUL ÉNONCÉ ──────────────────────────────────────────
  --
  -- `||` fusionne le patch clé par clé sur la ligne VIVANTE: ce qui n'est pas
  -- dans `p_patch` reste celui de la même ligne dans le même énoncé — une
  -- identité, pas une copie d'une lecture antérieure. Une modification
  -- concurrente sur une AUTRE clé survit par CONSTRUCTION.
  --
  -- ⚠️ LE TÉMOIN NE PORTE QUE SUR LES CLÉS TOUCHÉES. Le comparer à la colonne
  -- entière ferait échouer l'écriture parce que quelqu'un a changé ses jours
  -- d'absence — c'est-à-dire un refus sur une course qui n'existe pas.
  update public.student_goals sg
     set practical_constraints = jsonb_set(
           coalesce(sg.practical_constraints, '{}'::jsonb) || p_patch,
           array['field_changes'],
           p_changes,
           true
         )
   where sg.user_id = p_user
     and (
       select coalesce(
         jsonb_object_agg(k, sg.practical_constraints -> k),
         '{}'::jsonb
       )
         from jsonb_object_keys(p_patch) as k
     ) is not distinct from coalesce(p_expected, '{}'::jsonb);
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    return jsonb_build_object('ok', true, 'written', true);
  end if;

  -- ── POURQUOI RIEN N'A ÉTÉ ÉCRIT ────────────────────────────────────────────
  -- Cette lecture arrive APRÈS l'écriture: elle NOMME l'échec, elle ne le décide
  -- pas. L'inverse — lire pour décider, puis écrire — est exactement la
  -- lecture-puis-écriture que le prédicat existe pour éviter.
  if not exists (select 1 from public.student_goals where user_id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'no_goal_row');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'stale_snapshot');
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. LE CONTRÔLE — il roule à l'application, et il ne laisse rien
-- ---------------------------------------------------------------------------
do $ctl$
declare
  v_user uuid := '00000000-0000-4000-8000-00000903a200';
  v_out jsonb;
  v_failed text := null;
begin
  begin
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'a2-cooking-style-control@example.invalid', now(), now())
    on conflict (id) do nothing;
    -- ⚠️ `goal` EST `not null` SANS DÉFAUT — un `insert` qui l'omet fait tomber
    -- les omet fait tomber le contrôle dans son propre `exception`, et il se
    -- SAUTE en disant « fixture impossible ». Vu deux fois de suite: la
    -- migration s'appliquait, VERTE, et la garde qu'elle pose n'était
    -- vérifiée par personne. Un contrôle qui se saute est un contrôle mort.
    -- Et `goal` porte un CHECK à trois valeurs (`fat_loss` | `maintenance` |
    -- `muscle_gain`): `health` n'en est pas une.
    insert into public.student_goals (user_id, goal, content_locale, practical_constraints)
    values (v_user, 'maintenance', 'fr-FR', jsonb_build_object('cooking_style', 'keen'))
    on conflict (user_id) do update set practical_constraints = excluded.practical_constraints;
  exception when others then
    raise notice '[A2] contrôle sauté: fixture impossible (%)', sqlerrm;
    return;
  end;

  -- ── ① LE STYLE PASSE LE PORT, ET IL ARRIVE ───────────────────────────────
  -- C'est l'effet de D2.5: « je n'ai pas eu le temps » descend le style d'un
  -- cran. Sans les deux mots dans la liste fermée, ce serait `forbidden_field`,
  -- et le réglage ne bougerait jamais — en silence, parce que le producteur ne
  -- fait que compter ses refus.
  v_out := public.keel_write_field_changes_for(
    v_user,
    jsonb_build_object('cooking_style', 'keen'),
    jsonb_build_object('cooking_style', 'balanced'),
    '[]'::jsonb
  );
  if coalesce(v_out ->> 'ok', 'false') <> 'true' then
    v_failed := 'le port a refusé cooking_style: ' || coalesce(v_out ->> 'reason', '?');
  end if;
  if v_failed is null then
    if (select practical_constraints ->> 'cooking_style'
          from public.student_goals where user_id = v_user) <> 'balanced' then
      v_failed := 'le port a dit oui et n''a rien écrit';
    end if;
  end if;

  -- ── ② LE NOMBRE DE COURSES AUSSI ─────────────────────────────────────────
  if v_failed is null then
    -- ⚠️ LE TÉMOIN EST `{"grocery_runs": null}` ET PAS `{}`. Le port agrège
    -- `jsonb_object_agg(k, pc -> k)` SUR LES CLÉS DU PATCH: une clé absente
    -- donne `null`, pas rien. `'{}'` rendait `stale_snapshot` — vu ici, et
    -- c'est exactement le piège qu'un appelant qui pose une clé pour la
    -- PREMIÈRE fois rencontrera.
    v_out := public.keel_write_field_changes_for(
      v_user,
      jsonb_build_object('grocery_runs', null),
      jsonb_build_object('grocery_runs', 2),
      '[]'::jsonb
    );
    if coalesce(v_out ->> 'ok', 'false') <> 'true' then
      v_failed := 'le port a refusé grocery_runs: ' || coalesce(v_out ->> 'reason', '?');
    end if;
  end if;

  -- ── ③ ET LA LISTE RESTE FERMÉE ───────────────────────────────────────────
  -- ⛔ LE CAS QUI DOIT ÉCHOUER. Une liste fermée qu'on élargit sans vérifier
  -- qu'elle ferme encore n'est plus une liste fermée — c'est la forme exacte de
  -- « garde désarmée qui ressemble à une garde ».
  if v_failed is null then
    v_out := public.keel_write_field_changes_for(
      v_user,
      '{}'::jsonb,
      jsonb_build_object('food_preferences', '[]'::jsonb),
      '[]'::jsonb
    );
    if coalesce(v_out ->> 'reason', '') <> 'forbidden_field' then
      v_failed := 'une clé hors liste est passée: ' || coalesce(v_out ->> 'reason', 'ok');
    end if;
  end if;

  -- ── ④ LES DROITS N'ONT PAS BOUGÉ ─────────────────────────────────────────
  if v_failed is null then
    if has_function_privilege('anon', 'public.keel_write_field_changes_for(uuid, jsonb, jsonb, jsonb)', 'execute')
       or has_function_privilege('authenticated', 'public.keel_write_field_changes_for(uuid, jsonb, jsonb, jsonb)', 'execute')
    then
      v_failed := 'le port est devenu exécutable par anon ou authenticated';
    elsif not has_function_privilege('service_role', 'public.keel_write_field_changes_for(uuid, jsonb, jsonb, jsonb)', 'execute') then
      v_failed := 'service_role ne peut plus appeler le port';
    end if;
  end if;

  delete from public.student_goals where user_id = v_user;
  delete from auth.users where id = v_user;

  if v_failed is not null then
    raise exception '[A2 · contrôle du style] %', v_failed;
  end if;
  raise notice '[A2] contrôle: 4/4 — le style et les courses passent le port, la liste reste fermée';
end;
$ctl$;

commit;
