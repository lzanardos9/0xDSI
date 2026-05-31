/**
 * Databricks-Native Authentication Context
 * Uses Databricks workspace SSO -- the app inherits the user's session.
 * No Supabase auth, no external dependencies.
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  full_name: string;
  email: string;
  groups: string[];
  is_admin: boolean;
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
    fetchSession();
  }, []);

  const fetchSession = async () => {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setUser({
            id: data.user.id,
            username: data.user.username || data.user.display_name || 'analyst',
            full_name: data.user.display_name || data.user.username || 'SOC Analyst',
            email: data.user.email || '',
            groups: data.user.groups || [],
            is_admin: data.user.is_admin || false,
          });
        }
      }
    } catch {
      // Network error - user stays null, UI shows appropriate state
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setUser(null);
    window.location.href = '/';
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
