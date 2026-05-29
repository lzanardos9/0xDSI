import { useAuth } from './contexts/AuthContext';
import Dashboard from './components/Dashboard';
import { Loader } from 'lucide-react';

function App() {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading secure environment...</p>
        </div>
      </div>
    );
  }

  return <Dashboard />;
}

export default App;
