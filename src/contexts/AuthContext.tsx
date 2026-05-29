import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, IS_DATABRICKS } from '../lib/supabase';
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
    const fallbackUser: User = {
      id: 'databricks-sso-user',
      username: 'analyst',
      full_name: 'SOC Analyst',
      email: 'analyst@workspace.databricks.com',
    };

    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const data = await response.json();
        const raw = data.user;
        const u: User = {
          id: raw?.id || fallbackUser.id,
          username: raw?.username || raw?.display_name || fallbackUser.username,
          full_name: raw?.full_name || raw?.display_name || raw?.username || fallbackUser.full_name,
          email: raw?.email || fallbackUser.email,
        };
        setUser(u);
        setActivityUser({ id: u.id, username: u.username });
      } else {
        setUser(fallbackUser);
        setActivityUser({ id: fallbackUser.id, username: fallbackUser.username });
      }
    } catch {
      setUser(fallbackUser);
      setActivityUser({ id: fallbackUser.id, username: fallbackUser.username });
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
