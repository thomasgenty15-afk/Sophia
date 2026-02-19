import { useEffect, useMemo, useState } from 'react';
import { 
  MessageCircle, 
  Save, 
  ChevronDown, 
  ChevronUp,
  Mic2,
  Zap,
  MessageSquare,
  AlignLeft,
  Layout,
  Target,
  Moon,
  Heart
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type PreferenceOption = { value: string; title: string; description: string };
type PreferenceDef = {
  key: string;
  icon: any;
  title: string;
  description: string;
  defaultValue: string;
  options: PreferenceOption[];
};

const FACT_SCOPE = 'global';

const PREFERENCES: PreferenceDef[] = [
  {
    key: 'coach.tone',
    icon: Mic2,
    title: 'Ton de coaching',
    description: 'Définit l\'ambiance générale de vos échanges. Préfères-tu une douceur enveloppante ou une énergie qui te pousse à l\'action ?',
    defaultValue: 'warm_direct',
    options: [
      { value: 'gentle', title: 'Bienveillant doux', description: 'Soutenant, calme, très empathique.' },
      { value: 'warm_direct', title: 'Bienveillant ferme', description: 'Chaleureux mais orienté action.' },
      { value: 'direct', title: 'Direct', description: 'Claire, concise, sans détour.' },
      { value: 'energetic', title: 'Énergique', description: 'Dynamique et motivante.' },
    ],
  },
  {
    key: 'coach.challenge_level',
    icon: Zap,
    title: 'Niveau de challenge',
    description: 'Ajuste l\'intensité de la responsabilisation. Sophia doit-elle être une observatrice bienveillante ou un coach exigeant qui ne laisse rien passer ?',
    defaultValue: 'balanced',
    options: [
      { value: 'light', title: 'Léger', description: 'Peu de pression, encouragements.' },
      { value: 'balanced', title: 'Équilibré', description: 'Bon compromis confort/progression.' },
      { value: 'high', title: 'Exigeant', description: 'Responsabilisation plus forte.' },
      { value: 'intense', title: 'Très exigeant', description: 'Accountability maximal.' },
    ],
  },
  {
    key: 'coach.feedback_style',
    icon: MessageSquare,
    title: 'Style de feedback',
    description: 'La manière dont Sophia te fait ses retours. Veux-tu d\'abord être validé émotionnellement, ou préfères-tu aller droit au but sur les points d\'amélioration ?',
    defaultValue: 'positive_then_fix',
    options: [
      { value: 'positive_then_fix', title: 'Positif puis amélioration', description: 'Valorise puis corrige.' },
      { value: 'fix_then_positive', title: 'Amélioration puis positif', description: 'Corrige d’abord.' },
      { value: 'radical_honesty', title: 'Honnêteté directe', description: 'Retour très frontal.' },
      { value: 'socratic', title: 'Socratique', description: 'Plus de questions guidées.' },
    ],
  },
  {
    key: 'coach.talk_propensity',
    icon: MessageCircle,
    title: 'Propension à parler',
    description: 'Définit si Sophia doit nourrir la conversation ou aller à l\'essentiel. Veux-tu qu\'elle rebondisse, pose des questions et creuse les sujets, ou qu\'elle réponde juste à ta demande ?',
    defaultValue: 'balanced',
    options: [
      { value: 'discrete', title: 'Discrète', description: 'Répond uniquement à la demande, ne relance pas.' },
      { value: 'balanced', title: 'Équilibrée', description: 'Pose une question de suivi si pertinent.' },
      { value: 'chatty', title: 'Engagée', description: 'Nourrit l\'échange, rebondit et creuse les sujets.' },
      { value: 'very_chatty', title: 'Très bavarde', description: 'Cherche toujours à prolonger la discussion.' },
    ],
  },
  {
    key: 'coach.message_length',
    icon: AlignLeft,
    title: 'Longueur des messages',
    description: 'La densité des réponses. Préfères-tu des messages courts et percutants pour une lecture rapide, ou des réponses détaillées qui explorent le sujet en profondeur ?',
    defaultValue: 'short',
    options: [
      { value: 'very_short', title: 'Ultra court', description: '1 à 3 lignes max.' },
      { value: 'short', title: 'Court', description: 'Réponses rapides et nettes.' },
      { value: 'medium', title: 'Moyen', description: 'Contexte + action.' },
      { value: 'detailed', title: 'Détaillé', description: 'Réponses complètes.' },
    ],
  },
  {
    key: 'coach.message_format',
    icon: Layout,
    title: 'Format préféré',
    description: 'La structure des réponses. Sophia doit-elle privilégier les listes d\'actions concrètes, les questions pour te faire réfléchir, ou des plans structurés ?',
    defaultValue: 'adaptive',
    options: [
      { value: 'questions', title: 'Questions guidées', description: 'Dialogue réflexif.' },
      { value: 'action_list', title: 'Liste d’actions', description: 'To-do clair et concret.' },
      { value: 'mini_plan', title: 'Mini plan', description: 'Étapes structurées.' },
      { value: 'adaptive', title: 'Mix adaptatif', description: 'Sophia choisit selon contexte.' },
    ],
  },
  {
    key: 'coach.primary_focus',
    icon: Target,
    title: 'Focus principal',
    description: 'L\'angle d\'attaque prioritaire. Sur quoi Sophia doit-elle insister ? L\'action immédiate, la clarté mentale, la régulation émotionnelle ou l\'hygiène de vie ?',
    defaultValue: 'discipline',
    options: [
      { value: 'discipline', title: 'Discipline / action', description: 'Passer à l’action vite.' },
      { value: 'emotional', title: 'Émotionnel', description: 'Régulation et clarté interne.' },
      { value: 'clarity', title: 'Clarté / décision', description: 'Prioriser et trancher.' },
      { value: 'energy', title: 'Énergie / routines', description: 'Rythme, sommeil, constance.' },
    ],
  },
  {
    key: 'coach.inactivity_response',
    icon: Moon,
    title: 'En cas d’inactivité',
    description: 'La réaction de Sophia si tu ne donnes plus de nouvelles. Doit-elle te relancer avec douceur, fermeté, ou respecter ton silence ?',
    defaultValue: 'neutral',
    options: [
      { value: 'soft', title: 'Empathique', description: 'Relance douce et compréhensive.' },
      { value: 'neutral', title: 'Neutre', description: 'Rappel simple.' },
      { value: 'firm', title: 'Ferme', description: 'Relance plus engageante.' },
      { value: 'quiet', title: 'Silence', description: 'Pas de relance proactive.' },
    ],
  },
  {
    key: 'coach.emotional_personalization',
    icon: Heart,
    title: 'Personnalisation émotionnelle',
    description: 'Le degré de chaleur humaine. Souhaites-tu une relation très personnelle et affective, ou un échange plus distancié et factuel ?',
    defaultValue: 'warm',
    options: [
      { value: 'factual', title: 'Sobre / factuel', description: 'Pragmatique, peu émotionnel.' },
      { value: 'warm', title: 'Chaleureux', description: 'Humain et soutenant.' },
      { value: 'very_human', title: 'Très humain', description: 'Relation proche et sensible.' },
      { value: 'introspective', title: 'Introspectif', description: 'Plus profondeur intérieure.' },
    ],
  },
];

const PREF_BY_KEY = new Map(PREFERENCES.map((p) => [p.key, p]));

export function PreferencesSection() {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const withDefaults = useMemo(() => {
    const seed: Record<string, string> = {};
    for (const pref of PREFERENCES) seed[pref.key] = pref.defaultValue;
    return seed;
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setStatusMsg(null);
      try {
        const keys = PREFERENCES.map((p) => p.key);
        const { data, error } = await supabase
          .from('user_profile_facts')
          .select('key,value')
          .eq('user_id', user.id)
          .eq('scope', FACT_SCOPE)
          .in('key', keys);
        if (error) throw error;
        const next = { ...withDefaults };
        for (const row of (data ?? []) as any[]) {
          const k = String(row?.key ?? '');
          const pref = PREF_BY_KEY.get(k);
          if (!pref) continue;
          const v = String(row?.value?.value ?? '').trim();
          if (pref.options.some((o) => o.value === v)) next[k] = v;
        }
        setValues(next);
      } catch (e) {
        console.error('[PreferencesSection] load failed', e);
        setValues(withDefaults);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id, withDefaults]);

  const setPrefValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleExpand = (key: string) => {
    setExpandedKey(prev => prev === key ? null : key);
  };

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const nowIso = new Date().toISOString();
      const rows = PREFERENCES.map((pref) => {
        const selected = pref.options.find((o) => o.value === values[pref.key]) ?? pref.options[0];
        return {
          user_id: user.id,
          scope: FACT_SCOPE,
          key: pref.key,
          value: { value: selected.value, label: selected.title },
          status: 'active',
          confidence: 1.0,
          source_type: 'ui',
          reason: 'Dashboard preferences',
          updated_at: nowIso,
        };
      });
      const { error } = await supabase
        .from('user_profile_facts')
        .upsert(rows as any, { onConflict: 'user_id,scope,key' });
      if (error) throw error;
      setStatusMsg('Préférences enregistrées.');
    } catch (e: any) {
      console.error('[PreferencesSection] save failed', e);
      setStatusMsg(e?.message || 'Impossible d’enregistrer les préférences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base min-[350px]:text-xl font-bold text-slate-900 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-violet-600" />
          Préférences coach
        </h2>
      </div>

      <div className="mb-6 bg-gradient-to-br from-violet-50 to-white border border-violet-100 rounded-2xl p-5 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-3 opacity-10">
            <MessageCircle className="w-24 h-24 text-violet-600 rotate-12" />
        </div>
        <div className="relative z-10 flex gap-4">
            <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center shrink-0 text-violet-600">
                <Mic2 className="w-5 h-5" />
            </div>
            <div>
                <h3 className="font-bold text-violet-900 text-sm md:text-base mb-1">Pose-moi toutes tes questions !</h3>
                <p className="text-xs md:text-sm text-violet-700/80 leading-relaxed max-w-xl">
                    Je ne suis pas là que pour te coacher. Tu peux me parler de tout : une idée qui te traverse l'esprit, un doute, une question technique ou juste envie de discuter. Je suis ta seconde mémoire, pensée pour toi.
                </p>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        {loading ? (
          <div className="text-sm text-slate-500">Chargement des préférences...</div>
        ) : (
          <div className="space-y-4">
            {PREFERENCES.map((pref) => {
              const Icon = pref.icon;
              return (
                <div key={pref.key} className="border border-gray-100 rounded-xl overflow-hidden transition-all hover:border-violet-100 hover:shadow-sm bg-white">
                  <button 
                      onClick={() => toggleExpand(pref.key)}
                      className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50/50 transition-colors text-left"
                  >
                      <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              expandedKey === pref.key ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-500'
                          }`}>
                              <Icon className="w-5 h-5" />
                          </div>
                          <div>
                              <h3 className={`font-bold text-sm md:text-base ${expandedKey === pref.key ? 'text-violet-900' : 'text-slate-900'}`}>
                                  {pref.title}
                              </h3>
                              <p className="text-xs text-slate-500 mt-0.5 max-w-[200px] md:max-w-none truncate md:whitespace-normal">
                                  {values[pref.key] 
                                      ? pref.options.find(o => o.value === values[pref.key])?.title 
                                      : "Non défini"}
                              </p>
                          </div>
                      </div>
                      <div className="text-slate-400">
                          {expandedKey === pref.key ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                  </button>

                  {expandedKey === pref.key && (
                      <div className="p-4 bg-slate-50/50 border-t border-gray-100 animate-in slide-in-from-top-2 duration-200">
                          <div className="bg-white/50 p-3 rounded-lg mb-4 text-xs text-slate-600 border border-slate-100 italic">
                              {pref.description}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {pref.options.map((opt) => {
                              const active = values[pref.key] === opt.value;
                              return (
                              <button
                                  key={opt.value}
                                  onClick={() => setPrefValue(pref.key, opt.value)}
                                  className={`text-left rounded-xl border p-3 transition-all relative ${
                                  active
                                      ? 'border-violet-500 bg-white ring-1 ring-violet-500 shadow-md z-10'
                                      : 'border-slate-200 bg-white hover:border-violet-200 hover:shadow-sm'
                                  }`}
                              >
                                  <div className="flex items-start justify-between gap-2">
                                      <div>
                                          <div className={`text-sm font-bold ${active ? 'text-violet-900' : 'text-slate-800'}`}>
                                              {opt.title}
                                          </div>
                                          <div className={`text-xs mt-1 leading-relaxed ${active ? 'text-violet-700' : 'text-slate-500'}`}>
                                              {opt.description}
                                          </div>
                                      </div>
                                      {active && (
                                          <div className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center shrink-0 mt-0.5">
                                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                          </div>
                                      )}
                                  </div>
                              </button>
                              );
                          })}
                          </div>
                      </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            onClick={save}
            disabled={saving || loading}
            className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60 shadow-md shadow-violet-200 hover:shadow-violet-300 transition-all"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          {statusMsg ? <span className="text-xs text-slate-500 font-medium animate-fade-in">{statusMsg}</span> : null}
        </div>
      </div>
    </section>
  );
}
