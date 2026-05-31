import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BookOpen, Code, Cpu, Package, Layers, Zap, CheckCircle, AlertCircle } from 'lucide-react';

interface Service {
  name: string;
  type: string;
  status: string;
  count: number;
  icon: any;
  color: string;
}

export default function InternalServicesHub() {
  const [services, setServices] = useState<Service[]>([]);
  const [notebooks, setNotebooks] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [trainJobs, setTrainJobs] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);

  useEffect(() => {
    loadAllServices();
  }, []);

  const loadAllServices = async () => {
    const [notebooksRes, modelsRes, trainingRes, appsRes] = await Promise.all([
      supabase.from('cowboy_notebooks').select('*').limit(10),
      supabase.from('hedwick_model_registry').select('*').limit(10),
      supabase.from('bolt_gpu_training').select('*').limit(10),
      supabase.from('db_apps_registry').select('*').limit(10)
    ]);

    if (notebooksRes.data) setNotebooks(notebooksRes.data);
    if (modelsRes.data) setModels(modelsRes.data);
    if (trainingRes.data) setTrainJobs(trainingRes.data);
    if (appsRes.data) setApps(appsRes.data);

    setServices([
      {
        name: 'Turi',
        type: 'Metadata Registry',
        status: 'active',
        count: 150,
        icon: BookOpen,
        color: 'blue'
      },
      {
        name: 'Cowboy',
        type: 'Notebook Service',
        status: 'active',
        count: notebooksRes.data?.length || 0,
        icon: Code,
        color: 'green'
      },
      {
        name: 'Alkami',
        type: 'Model Inference',
        status: 'active',
        count: 12,
        icon: Zap,
        color: 'yellow'
      },
      {
        name: 'Hedwick',
        type: 'Model Registry',
        status: 'active',
        count: modelsRes.data?.length || 0,
        icon: Package,
        color: 'purple'
      },
      {
        name: 'Bolt',
        type: 'GPU Training',
        status: 'active',
        count: trainingRes.data?.length || 0,
        icon: Cpu,
        color: 'red'
      },
      {
        name: 'DB Apps',
        type: 'App Hosting',
        status: 'active',
        count: appsRes.data?.length || 0,
        icon: Layers,
        color: 'indigo'
      }
    ]);
  };

  const getStatusIcon = (status: string) => {
    return status === 'active' || status === 'running' || status === 'healthy' || status === 'production'
      ? <CheckCircle className="w-5 h-5 text-green-500" />
      : <AlertCircle className="w-5 h-5 text-yellow-500" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Internal Services Hub</h2>
        <p className="text-slate-400 mt-1">Databricks-style internal platform services (Turi, Cowboy, Alkami, Hedwick, Bolt)</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {services.map((service) => {
          const Icon = service.icon;
          return (
            <div key={service.name} className="bg-slate-900 rounded-lg shadow p-6 hover:shadow-lg transition">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 bg-${service.color}-100 rounded-lg`}>
                  <Icon className={`w-8 h-8 text-${service.color}-600`} />
                </div>
                {getStatusIcon(service.status)}
              </div>
              <h3 className="text-xl font-bold text-white">{service.name}</h3>
              <p className="text-sm text-slate-400 mt-1">{service.type}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-2xl font-bold text-white">{service.count}</span>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                  {service.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-lg shadow">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Cowboy Notebooks</h3>
              <p className="text-sm text-slate-400">Jupyter/AWS Managed</p>
            </div>
            <Code className="w-6 h-6 text-green-600" />
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {notebooks.slice(0, 5).map((nb) => (
                <div key={nb.notebook_id} className="border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-white">{nb.notebook_name}</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      nb.status === 'running' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'
                    }`}>
                      {nb.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-400">
                    <span className="flex items-center gap-1">
                      <Cpu className="w-4 h-4" />
                      {nb.cpu_cores} cores, {nb.memory_gb}GB
                    </span>
                    {nb.gpu_count > 0 && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                        {nb.gpu_count} GPU
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg shadow">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Hedwick Model Registry</h3>
              <p className="text-sm text-slate-400">MLflow-based</p>
            </div>
            <Package className="w-6 h-6 text-purple-600" />
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {models.slice(0, 5).map((model) => (
                <div key={model.model_id} className="border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-white">{model.model_name}</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      model.model_stage === 'production' ? 'bg-green-100 text-green-800' :
                      model.model_stage === 'staging' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-slate-100 text-slate-800'
                    }`}>
                      {model.model_stage}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-400">
                    <span>v{model.model_version}</span>
                    <span className="flex items-center gap-1">
                      <span className="font-mono">{model.model_size_mb?.toFixed(1)} MB</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg shadow">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Bolt GPU Training</h3>
              <p className="text-sm text-slate-400">Training job abstraction</p>
            </div>
            <Cpu className="w-6 h-6 text-red-600" />
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {trainJobs.slice(0, 5).map((job) => (
                <div key={job.training_job_id} className="border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-white">{job.job_name}</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      job.status === 'running' ? 'bg-blue-100 text-blue-800' :
                      job.status === 'completed' ? 'bg-green-100 text-green-800' :
                      'bg-slate-100 text-slate-800'
                    }`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-sm text-slate-400 mb-1">
                      <span>Progress</span>
                      <span className="font-semibold">{job.progress_percent}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${job.progress_percent}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-400">
                    <span>{job.gpu_count}x {job.gpu_type}</span>
                    <span>Epoch {job.current_epoch}/{job.total_epochs}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg shadow">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">DB Apps (Serverless)</h3>
              <p className="text-sm text-slate-400">Dash, Gradio, Streamlit hosting</p>
            </div>
            <Layers className="w-6 h-6 text-indigo-600" />
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {apps.map((app) => (
                <div key={app.app_id} className="border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-white">{app.app_name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        app.health_status === 'healthy' ? 'bg-green-500' : 'bg-yellow-500'
                      }`} />
                      <span className="text-xs text-slate-400">{app.health_status}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                      {app.app_type}
                    </span>
                    <span className="text-slate-400">{app.active_users} active users</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span>{app.total_requests.toLocaleString()} requests</span>
                    <span>{app.avg_response_time_ms?.toFixed(0)}ms avg</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Platform Architecture</h3>
        <div className="grid grid-cols-6 gap-4">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <div key={service.name} className="text-center">
                <div className="bg-slate-900 rounded-lg p-4 mb-2 shadow">
                  <Icon className={`w-8 h-8 mx-auto text-${service.color}-600`} />
                </div>
                <p className="text-sm font-medium text-white">{service.name}</p>
                <p className="text-xs text-slate-400">{service.type}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}