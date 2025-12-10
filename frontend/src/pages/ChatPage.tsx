import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatInterface } from '../components/ChatInterface';
import { useAuth } from '../context/AuthContext';

export const ChatPage: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center">Chargement...</div>;

  if (!user) return null; // Sera redirigé

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-bold text-slate-800 mb-8 text-center">Conversation avec Sophia</h1>
        <ChatInterface />
      </div>
    </div>
  );
};
