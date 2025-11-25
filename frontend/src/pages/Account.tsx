import React from 'react';
import { ArrowLeft, User, Settings, LogOut, Bell, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Account = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 md:px-6 md:py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3 md:gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-1.5 md:p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"
          >
            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <h1 className="text-lg min-[350px]:text-xl font-bold">Mon Compte</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 md:px-6 md:py-8">
        
        {/* Profile Section */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6 mb-6 flex flex-col min-[350px]:flex-row items-center gap-4 md:gap-6 shadow-sm text-center min-[350px]:text-left">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gray-900 text-white flex items-center justify-center text-xl md:text-2xl font-bold shadow-md shrink-0">
            Ah
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold text-gray-900">Ahmed Amara</h2>
            <p className="text-sm md:text-base text-gray-500">Membre depuis Nov. 2025</p>
            <div className="mt-2 inline-flex items-center px-2 py-0.5 md:px-3 md:py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] md:text-xs font-bold uppercase tracking-wider">
              Architecte Niveau 3
            </div>
          </div>
        </div>

        {/* Settings List */}
        <div className="space-y-4">
          
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-3 md:p-4 border-b border-gray-100 flex items-center gap-3 hover:bg-gray-50 cursor-pointer transition-colors">
              <User className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
              <span className="font-medium text-sm md:text-base">Informations personnelles</span>
            </div>
            <div className="p-3 md:p-4 border-b border-gray-100 flex items-center gap-3 hover:bg-gray-50 cursor-pointer transition-colors">
              <Bell className="w-4 h-4 md:w-5 md:h-5 text-amber-600" />
              <span className="font-medium text-sm md:text-base">Notifications</span>
            </div>
            <div className="p-3 md:p-4 flex items-center gap-3 hover:bg-gray-50 cursor-pointer transition-colors">
              <Shield className="w-4 h-4 md:w-5 md:h-5 text-emerald-600" />
              <span className="font-medium text-sm md:text-base">Sécurité & Confidentialité</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
             <div className="p-3 md:p-4 flex items-center gap-3 text-gray-500 hover:text-gray-900 hover:bg-gray-50 cursor-pointer transition-colors">
              <Settings className="w-4 h-4 md:w-5 md:h-5" />
              <span className="font-medium text-sm md:text-base">Préférences de l'application</span>
            </div>
          </div>

          <button className="w-full bg-white border border-red-200 text-red-600 rounded-xl p-3 md:p-4 flex items-center justify-center gap-2 font-bold hover:bg-red-50 transition-colors mt-6 md:mt-8 text-sm md:text-base">
            <LogOut className="w-4 h-4 md:w-5 md:h-5" />
            Se déconnecter
          </button>

        </div>
      </main>
    </div>
  );
};

export default Account;

