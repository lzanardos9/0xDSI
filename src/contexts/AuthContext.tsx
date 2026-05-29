import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
    checkDatabricksSession();
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
        setUser({
          id: raw?.id || fallbackUser.id,
          username: raw?.username || raw?.display_name || fallbackUser.username,
          full_name: raw?.full_name || raw?.display_name || raw?.username || fallbackUser.full_name,
          email: raw?.email || fallbackUser.email,
        });
      } else {
        setUser(fallbackUser);
      }
    } catch {
      setUser(fallbackUser);
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
