import { useEffect, useMemo, useState } from 'react';
import { 
  MessageCircle, 
  Save, 
  ChevronDown, 
  ChevronUp,
  Mic2,
  MessageSquare,
  Lock,
  Crown
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
    key: 'coach.coaching_style',
    icon: Mic2,
    title: 'Style de coaching',
    description: 'La façon dont Sophia te pousse vers l\'action: douce, équilibrée ou plus challengeante.',
    defaultValue: 'normal',
    options: [
      { value: 'gentle', title: 'Doux', description: 'Soutenant et apaisant, sans pression forte.' },
      { value: 'normal', title: 'Normal', description: 'Équilibré entre soutien et progression.' },
      { value: 'challenging', title: 'Challengeant', description: 'Plus direct et exigeant pour accélérer.' },
    ],
  },
  {
    key: 'coach.chatty_level',
    icon: MessageCircle,
    title: 'Niveau de bavardage',
    description: 'Définit à quel point Sophia prolonge la conversation au-delà de la demande initiale.',
    defaultValue: 'normal',
    options: [
      { value: 'light', title: 'Léger', description: 'Réponses concises, peu de relances.' },
      { value: 'normal', title: 'Normal', description: 'Conversation naturelle, relances si utile.' },
      { value: 'high', title: 'Élevé', description: 'Échange plus nourri, rebonds fréquents.' },
    ],
  },
  {
    key: 'coach.question_tendency',
    icon: MessageSquare,
    title: 'Tendance à poser des questions',
    description: 'Règle la fréquence des questions de Sophia pour approfondir ou laisser plus d\'espace.',
    defaultValue: 'normal',
    options: [
      { value: 'low', title: 'Faible', description: 'Peu de questions, plus de réponses directes.' },
      { value: 'normal', title: 'Normale', description: 'Questions de suivi quand c\'est pertinent.' },
      { value: 'high', title: 'Élevée', description: 'Questionne davantage pour creuser.' },
    ],
  },
];

const PREF_BY_KEY = new Map(PREFERENCES.map((p) => [p.key, p]));

type PreferencesSectionProps = {
  isLocked?: boolean;
  onUnlockRequest?: () => void;
};

export function PreferencesSection({ isLocked = false, onUnlockRequest }: PreferencesSectionProps) {
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
    if (isLocked) return;
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleExpand = (key: string) => {
    if (isLocked) return;
    setExpandedKey(prev => prev === key ? null : key);
  };

  const save = async () => {
    if (isLocked) return;
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
      {isLocked && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-col min-[450px]:flex-row min-[450px]:items-center min-[450px]:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">Fonctionnalité WhatsApp verrouillée</p>
              <p className="text-xs text-amber-700">
                Les préférences du coach WhatsApp sont disponibles avec le plan Alliance ou Architecte.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onUnlockRequest?.()}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold flex items-center justify-center gap-2 shrink-0"
          >
            <Crown className="w-4 h-4" />
            Passer à Alliance / Architecte
          </button>
        </div>
      )}

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
                    Je ne suis pas là que pour te coacher. Tu peux me parler de tout : une idée qui te traverse l'esprit, un doute, une question sur quoi que ce soit, ou on peut simplement discuter. Je suis ton amie, pensée pour toi.
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
                      disabled={isLocked}
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
            disabled={isLocked || saving || loading}
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
