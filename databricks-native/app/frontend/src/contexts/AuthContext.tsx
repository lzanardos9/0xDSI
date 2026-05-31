/**
 * Databricks-Native Authentication Context
 * Uses Databricks workspace SSO (the app inherits the user's Databricks session).
 * Identity is extracted server-side from App runtime headers.
 * Zero external auth dependencies.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  display_name: string;
  email: string;
  groups: string[];
  is_admin: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSession();
  }, []);

  async function fetchSession() {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setUser({
            id: data.user.id,
            username: data.user.username,
            display_name: data.user.display_name || data.user.username,
            email: data.user.email || '',
            groups: data.user.groups || [],
            is_admin: data.user.is_admin || false,
          });
        }
      }
    } catch {
      // Network error -- leave user as null, UI will show loading/error state
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    setUser(null);
    window.location.href = '/';
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
