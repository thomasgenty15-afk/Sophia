-- RETRAIT DES CARTES D'ATTAQUE ET DES POTIONS — lot 3 du retrait des résidus
-- grand public.
--
-- Les cartes d'attaque (scripts d'élan avant une action) et les potions
-- (sessions guidées de changement d'état) sont des surfaces du produit grand
-- public. `user_support_cards` part avec elles : famille voisine des cartes,
-- ZÉRO référence dans le code (déjà constaté au retrait de la carte de
-- défense), 0 ligne.
--
-- POURQUOI ELLES PARTENT — les preuves, pas l'intuition :
--
--   1. DÉCISION HUMAINE du 2026-08-08, explicite et spécifique : « Retirer les
--      deux » — la question posée portait précisément sur le travail récent
--      non déployé (mots-clés d'attaque, sas d'admission des potions).
--      S'ajoute la décision de périmètre : 0 utilisateur grand public.
--      Ceci renverse la consigne « NE PAS SUPPRIMER SANS DÉCISION HUMAINE »
--      posée par 20260808060000 — la décision est arrivée.
--
--   2. LE SAS POTION ÉTAIT DÉJÀ SUPPRIMÉ. W2.A/W2.B (démolition B2C,
--      2026-08-06) ont retiré le skill du sas et le catalogue de potions de la
--      lane coaching_recommendation. Il ne restait AUCUN écrivain des deux
--      tables.
--
--   3. LES MOTS-CLÉS D'ATTAQUE : l'import de `attack-keyword-support.ts` dans
--      `run.ts` n'avait PLUS AUCUN site d'appel (import mort, vérifié
--      commentaires exclus). Le module, son test et son helper QA partent dans
--      le commit qui porte cette migration.
--
--   4. CODE RETIRÉ D'ABORD : lectures du récap durable (loader.ts), teaser et
--      segments potion du catalogue de messages (zéro appelant), source
--      « potion » de checkin_scope, mentions dans les prompts companion FR —
--      des LIGNES VIVANTES : la sélection du corps de prompt est par locale,
--      un élève KEEL francophone recevait encore « Ressources: cartes
--      d'attaque/défense, potions/état ».
--
--   5. DONNÉES : 0 ligne dans les trois tables en local. prosrc : zéro
--      fonction. Vues : zéro. Crons : aucun job ne les nomme (vérifié sur les
--      21 actifs). Export RGPD : jamais exportées par account-export-v1.
--
-- CE QUI N'EST **PAS** TOUCHÉ (garde-fou anti-zèle) :
--   - Les GARDES écrites à cause de ces concepts : la ceinture
--     artefact≠rappel du routeur one_shot (P8-B), les gardes de
--     direct_effect_local_context, response_visibility_formatting, la
--     write_policy du memorizer, les familles de coût llm-usage, la purge des
--     clés temp_memory legacy d'active_flow_state et le lecteur
--     session_decisions. Elles protègent contre une classe de défaut ou
--     nettoient de l'état persisté — les retirer est le bug.
--   - `AttackCardContent` et le tissu de types potion de v2-types : vocabulaire
--     du système de plan (lab-surfaces), il part avec les lots plans/colonne
--     vertébrale.
--
-- ORDRE — la colonne étrangère d'abord, les tables ensuite, RESTRICT partout.

begin;

-- `user_plan_items` (lot plans, encore en place) référençait la carte
-- d'attaque liée à un item. Plus aucun code n'écrit ni ne lit cette colonne
-- après ce lot (v2-phase1 et v2-plan-distribution n'écrivent plus la clé).
alter table public.user_plan_items
  drop column if exists attack_card_id;

drop table public.user_attack_cards;
drop table public.user_support_cards;
drop table public.user_potion_sessions;

do $$
declare
  leftover text;
begin
  select string_agg(t, ', ') into leftover
  from unnest(array['user_attack_cards','user_support_cards','user_potion_sessions']) as t
  where to_regclass('public.' || t) is not null;
  if leftover is not null then
    raise exception 'drop_attack_potions: table(s) encore présente(s): %', leftover;
  end if;
end $$;

commit;
