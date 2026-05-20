import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { trackLogin, trackLogout, setActivityUser, ensureSession } from '../lib/activityTracker';

interface User {
  id: string;
  username: string;
  full_name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IS_DATABRICKS = import.meta.env.VITE_DATABRICKS_MODE === 'true' ||
  (!import.meta.env.VITE_SUPABASE_URL && typeof window !== 'undefined' && window.location.pathname !== '/');

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (IS_DATABRICKS) {
      checkDatabricksSession();
      return;
    }
    void ensureSession();
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkDatabricksSession = async () => {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const data = await response.json();
        const u = data.user || {
          id: 'databricks-sso-user',
          username: 'analyst',
          full_name: 'SOC Analyst',
          email: 'analyst@workspace.databricks.com',
        };
        setUser(u);
        setActivityUser({ id: u.id, username: u.username });
      } else {
        setUser({
          id: 'databricks-sso-user',
          username: 'analyst',
          full_name: 'SOC Analyst',
          email: 'analyst@workspace.databricks.com',
        });
      }
    } catch {
      setUser({
        id: 'databricks-sso-user',
        username: 'analyst',
        full_name: 'SOC Analyst',
        email: 'analyst@workspace.databricks.com',
      });
    } finally {
      setLoading(false);
    }
  };

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await loadUserProfile(session.user.id);
    } else {
      setLoading(false);
    }
  };

  const loadUserProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession) {
      setLoading(false);
      return;
    }

    if (data && !error) {
      const { data: authUser } = await supabase.auth.getUser();
      const u = {
        id: data.id,
        username: data.username,
        full_name: data.full_name,
        email: authUser.user?.email || ''
      };
      setUser(u);
      setActivityUser({ id: u.id, username: u.username });
      trackLogin(u.id, u.username);
    }
    setLoading(false);
  };

  const signOut = async () => {
    if (IS_DATABRICKS) {
      setUser(null);
      window.location.href = '/';
      return;
    }
    trackLogout();
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
