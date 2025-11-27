import React, { useState, useEffect } from 'react';
import { 
  X, 
  User, 
  CreditCard, 
  Settings, 
  LogOut, 
  Shield, 
  Zap,
  Mail,
  Bell,
  Check,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

interface UserProfileProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'action' | 'architecte';
}

type TabType = 'general' | 'subscription' | 'settings';

const UserProfile: React.FC<UserProfileProps> = ({ isOpen, onClose, mode }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [profile, setProfile] = useState<{ full_name: string | null } | null>(null);

  useEffect(() => {
    if (user) {
      // Fetch profile data
      const fetchProfile = async () => {
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        
        if (data) {
          setProfile(data);
        }
      };
      fetchProfile();
    }
  }, [user]);

  if (!isOpen) return null;

  const handleSignOut = async () => {
    await signOut();
    onClose();
    navigate('/auth');
  };

  // Get display values
  const displayName = profile?.full_name || user?.user_metadata?.full_name || "Utilisateur";
  const displayEmail = user?.email || "";
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const isArchitect = mode === 'architecte';

  // Styles dynamiques selon le mode
  const styles = {
    overlay: "fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in",
    container: `w-full max-w-md h-full shadow-2xl transform transition-transform duration-300 animate-slide-in-right ${
      isArchitect 
        ? "bg-emerald-950 text-emerald-50 border-l border-emerald-800" 
        : "bg-white text-slate-900 border-l border-slate-200"
    }`,
    header: `p-6 border-b flex items-center justify-between ${
      isArchitect ? "border-emerald-900 bg-emerald-950" : "border-slate-100 bg-slate-50"
    }`,
    closeBtn: `p-2 rounded-full transition-colors ${
      isArchitect ? "hover:bg-emerald-900 text-emerald-400" : "hover:bg-slate-200 text-slate-500"
    }`,
    sidebarItem: (isActive: boolean) => `flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${
      isActive 
        ? (isArchitect ? "bg-emerald-900 text-emerald-100 shadow-sm border border-emerald-800" : "bg-white text-blue-600 shadow-sm border border-slate-200") 
        : (isArchitect ? "text-emerald-600 hover:text-emerald-300 hover:bg-emerald-900/50" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100")
    }`,
    sectionTitle: `text-xs font-bold uppercase tracking-widest mb-4 ${
      isArchitect ? "text-emerald-600" : "text-slate-400"
    }`,
    card: `p-4 rounded-xl border mb-4 ${
      isArchitect ? "bg-emerald-900/30 border-emerald-800" : "bg-slate-50 border-slate-200"
    }`,
    input: `w-full p-3 rounded-lg text-sm outline-none border transition-all ${
      isArchitect 
        ? "bg-emerald-900/50 border-emerald-800 text-white focus:border-emerald-500 placeholder-emerald-700" 
        : "bg-white border-slate-200 text-slate-900 focus:border-blue-500 placeholder-slate-400"
    }`
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.container} onClick={e => e.stopPropagation()}>
        
        {/* HEADER */}
        <div className={styles.header}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg border-2 ${
              isArchitect ? "bg-emerald-900 text-emerald-100 border-emerald-700" : "bg-slate-200 text-slate-600 border-white shadow-sm"
            }`}>
              {initials}
            </div>
            <div>
              <h2 className="font-bold text-sm leading-tight">{displayName}</h2>
              <p className={`text-xs ${isArchitect ? "text-emerald-500" : "text-slate-500"}`}>{displayEmail}</p>
            </div>
          </div>
          <button onClick={onClose} className={styles.closeBtn}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col h-[calc(100%-80px)]">
          
          {/* NAVIGATION TABS (Horizontal pour mobile/desktop) */}
          <div className={`px-6 py-4 flex flex-col min-[350px]:flex-row gap-2 border-b overflow-x-auto ${isArchitect ? "border-emerald-900" : "border-slate-100"}`}>
            <button onClick={() => setActiveTab('general')} className={`${styles.sidebarItem(activeTab === 'general')} justify-center min-[350px]:justify-start`}>
              <User className="w-4 h-4" /> Compte
            </button>
            <button onClick={() => setActiveTab('subscription')} className={`${styles.sidebarItem(activeTab === 'subscription')} justify-center min-[350px]:justify-start`}>
              <CreditCard className="w-4 h-4" /> Plan
            </button>
            <button onClick={() => setActiveTab('settings')} className={`${styles.sidebarItem(activeTab === 'settings')} justify-center min-[350px]:justify-start`}>
              <Settings className="w-4 h-4" /> Options
            </button>
          </div>

          {/* CONTENT SCROLLABLE */}
          <div className="flex-1 overflow-y-auto p-6">
            
            {/* --- TAB: GENERAL --- */}
            {activeTab === 'general' && (
              <div className="animate-fade-in">
                <h3 className={styles.sectionTitle}>Informations Personnelles</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className={`block text-xs font-medium mb-1.5 ${isArchitect ? "text-emerald-400" : "text-slate-500"}`}>Nom complet</label>
                    <input type="text" defaultValue={displayName} className={styles.input} />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1.5 ${isArchitect ? "text-emerald-400" : "text-slate-500"}`}>Email</label>
                    <div className="relative">
                      <input type="email" defaultValue={displayEmail} className={styles.input} readOnly />
                      <div className="absolute right-3 top-3 text-emerald-500">
                        <Check className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`mt-8 p-4 rounded-xl flex items-center gap-4 border ${
                  isArchitect ? "bg-amber-900/20 border-amber-800/50" : "bg-amber-50 border-amber-100"
                }`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isArchitect ? "bg-amber-900/50 text-amber-400" : "bg-amber-100 text-amber-600"
                  }`}>
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className={`font-bold text-sm ${isArchitect ? "text-amber-200" : "text-amber-900"}`}>Niveau : Initié</h4>
                    <p className={`text-xs ${isArchitect ? "text-amber-500/80" : "text-amber-700/70"}`}>Membre depuis 12 jours</p>
                  </div>
                </div>
              </div>
            )}

            {/* --- TAB: SUBSCRIPTION --- */}
            {activeTab === 'subscription' && (
              <div className="animate-fade-in">
                <h3 className={styles.sectionTitle}>Abonnement Actif</h3>
                
                <div className={`relative overflow-hidden rounded-2xl p-6 border ${
                  isArchitect ? "bg-gradient-to-br from-emerald-900 to-emerald-950 border-emerald-700" : "bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 text-white"
                }`}>
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-white/10 backdrop-blur-md border border-white/20 text-white">
                          Premium
                        </span>
                        <h2 className="text-2xl font-serif font-bold mt-2 text-white">Sophia Architecte</h2>
                      </div>
                      <Zap className="w-8 h-8 text-amber-400" />
                    </div>
                    <p className="text-sm text-slate-300 mb-6">Accès illimité à la Forge, au Grimoire et aux Plans d'Action.</p>
                    
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                      <CreditCard className="w-3 h-3" />
                      •••• 4242
                    </div>
                  </div>
                  
                  {/* Background Decor */}
                  <div className="absolute right-[-20px] top-[-20px] w-32 h-32 bg-amber-500/20 blur-[50px] rounded-full pointer-events-none" />
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  <button className={`w-full py-3 rounded-lg font-bold text-sm transition-all ${
                    isArchitect 
                      ? "bg-emerald-800 hover:bg-emerald-700 text-emerald-100" 
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}>
                    Gérer la facturation
                  </button>
                </div>
              </div>
            )}

            {/* --- TAB: SETTINGS --- */}
            {activeTab === 'settings' && (
              <div className="animate-fade-in">
                <h3 className={styles.sectionTitle}>Préférences</h3>
                
                <div className={styles.card}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Bell className={`w-4 h-4 ${isArchitect ? "text-emerald-400" : "text-slate-400"}`} />
                      <span className="text-sm font-medium">Notifications Email</span>
                    </div>
                    <div className={`w-10 h-5 rounded-full p-1 cursor-pointer transition-colors ${isArchitect ? "bg-emerald-600" : "bg-blue-600"}`}>
                      <div className="w-3 h-3 bg-white rounded-full shadow-sm transform translate-x-5" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Mail className={`w-4 h-4 ${isArchitect ? "text-emerald-400" : "text-slate-400"}`} />
                      <span className="text-sm font-medium">Newsletter Hebdo</span>
                    </div>
                    <div className={`w-10 h-5 rounded-full p-1 cursor-pointer transition-colors ${isArchitect ? "bg-emerald-900 border border-emerald-700" : "bg-slate-200"}`}>
                      <div className="w-3 h-3 bg-white rounded-full shadow-sm" />
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleSignOut}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                  isArchitect 
                    ? "border-red-900/50 text-red-400 hover:bg-red-950/30" 
                    : "border-red-100 text-red-600 hover:bg-red-50"
                }`}>
                  <span className="font-bold text-sm flex items-center gap-2">
                    <LogOut className="w-4 h-4" /> Déconnexion
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

          </div>
          
          {/* FOOTER */}
          <div className={`p-4 text-center text-[10px] border-t ${
            isArchitect ? "border-emerald-900 text-emerald-700" : "border-slate-100 text-slate-400"
          }`}>
            Sophia v2.4.0 • Build 2025
          </div>

        </div>
      </div>
    </div>
  );
};

export default UserProfile;
