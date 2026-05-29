import { useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import { Loader } from 'lucide-react';
import { IS_DATABRICKS } from './lib/supabase';
import { installGlobalActivityTracking, ensureSession } from './lib/activityTracker';

function App() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!IS_DATABRICKS) {
      installGlobalActivityTracking();
      void ensureSession();
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading secure environment...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <Dashboard />;
}

export default App;
