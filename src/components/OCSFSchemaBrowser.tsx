import { useState, useEffect } from 'react';
import { Shield, Search, Database, Tag, List, Filter, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface OCSFCategory {
  id: string;
  category_uid: number;
  category_name: string;
  description: string;
}

interface OCSFEventClass {
  id: string;
  class_uid: number;
  class_name: string;
  category_uid: number;
  description: string;
  caption: string;
}

interface OCSFAttribute {
  id: string;
  attribute_name: string;
  attribute_type: string;
  description: string;
  requirement: string;
}

interface OCSFMapping {
  id: string;
  source_vendor: string;
  source_type: string;
  source_event_type: string;
  ocsf_class_uid: number;
  confidence_score: number;
}

interface EventStats {
  ocsf_class_uid: number;
  ocsf_class_name: string;
  count: number;
}

export default function OCSFSchemaBrowser() {
  const [categories, setCategories] = useState<OCSFCategory[]>([]);
  const [eventClasses, setEventClasses] = useState<OCSFEventClass[]>([]);
  const [attributes, setAttributes] = useState<OCSFAttribute[]>([]);
  const [mappings, setMappings] = useState<OCSFMapping[]>([]);
  const [eventStats, setEventStats] = useState<EventStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'classes' | 'mappings' | 'attributes' | 'stats'>('classes');

  useEffect(() => {
    loadOCSFData();
  }, []);

  const loadOCSFData = async () => {
    try {
      const [categoriesRes, classesRes, attributesRes, mappingsRes, statsRes] = await Promise.all([
        supabase.from('ocsf_categories').select('*').order('category_uid'),
        supabase.from('ocsf_event_classes').select('*').order('class_uid'),
        supabase.from('ocsf_attributes').select('*').order('attribute_name'),
        supabase.from('ocsf_source_mappings').select('*').order('source_vendor'),
        supabase.rpc('get_ocsf_event_stats') as any
      ]);

      if (categoriesRes.data) setCategories(categoriesRes.data);
      if (classesRes.data) setEventClasses(classesRes.data);
      if (attributesRes.data) setAttributes(attributesRes.data);
      if (mappingsRes.data) setMappings(mappingsRes.data);

      if (!statsRes.error && statsRes.data) {
        setEventStats(statsRes.data);
      } else {
        const manualStats = await supabase
          .from('events')
          .select('ocsf_class_uid, ocsf_class_name')
          .not('ocsf_class_uid', 'is', null);

        if (manualStats.data) {
          const grouped = manualStats.data.reduce((acc: any, event) => {
            const key = event.ocsf_class_uid;
            if (!acc[key]) {
              acc[key] = {
                ocsf_class_uid: event.ocsf_class_uid,
                ocsf_class_name: event.ocsf_class_name,
                count: 0
              };
            }
            acc[key].count++;
            return acc;
          }, {});
          setEventStats(Object.values(grouped));
        }
      }
    } catch (error) {
      console.error('Error loading OCSF data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredClasses = eventClasses.filter(cls => {
    const matchesCategory = !selectedCategory || cls.category_uid === selectedCategory;
    const matchesSearch = !searchTerm ||
      cls.class_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cls.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const filteredMappings = mappings.filter(mapping => {
    const matchesClass = !selectedClass || mapping.ocsf_class_uid === selectedClass;
    const matchesSearch = !searchTerm ||
      mapping.source_vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mapping.source_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mapping.source_event_type.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesClass && matchesSearch;
  });

  const filteredAttributes = attributes.filter(attr =>
    !searchTerm ||
    attr.attribute_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    attr.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading OCSF Schema...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-900/50 to-slate-900/50 border border-blue-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-8 h-8 text-blue-400" />
          <div>
            <h2 className="text-2xl font-bold text-white">OCSF Schema Browser</h2>
            <p className="text-slate-400">Open Cybersecurity Schema Framework v1.1.0</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="bg-slate-800/50 rounded p-3">
            <div className="text-slate-400 text-sm">Categories</div>
            <div className="text-2xl font-bold text-white">{categories.length}</div>
          </div>
          <div className="bg-slate-800/50 rounded p-3">
            <div className="text-slate-400 text-sm">Event Classes</div>
            <div className="text-2xl font-bold text-white">{eventClasses.length}</div>
          </div>
          <div className="bg-slate-800/50 rounded p-3">
            <div className="text-slate-400 text-sm">Source Mappings</div>
            <div className="text-2xl font-bold text-white">{mappings.length}</div>
          </div>
          <div className="bg-slate-800/50 rounded p-3">
            <div className="text-slate-400 text-sm">Classified Events</div>
            <div className="text-2xl font-bold text-white">
              {eventStats.reduce((sum, stat) => sum + stat.count, 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('classes')}
          className={`px-4 py-2 rounded flex items-center gap-2 transition-all ${
            activeTab === 'classes'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          <List className="w-4 h-4" />
          Event Classes
        </button>
        <button
          onClick={() => setActiveTab('mappings')}
          className={`px-4 py-2 rounded flex items-center gap-2 transition-all ${
            activeTab === 'mappings'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          <Database className="w-4 h-4" />
          Source Mappings
        </button>
        <button
          onClick={() => setActiveTab('attributes')}
          className={`px-4 py-2 rounded flex items-center gap-2 transition-all ${
            activeTab === 'attributes'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          <Tag className="w-4 h-4" />
          Attributes
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 rounded flex items-center gap-2 transition-all ${
            activeTab === 'stats'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          <FileText className="w-4 h-4" />
          Event Statistics
        </button>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          {activeTab === 'classes' && (
            <select
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value ? Number(e.target.value) : null)}
              className="px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.category_uid}>
                  {cat.category_name}
                </option>
              ))}
            </select>
          )}
          {activeTab === 'mappings' && selectedClass && (
            <button
              onClick={() => setSelectedClass(null)}
              className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition-all"
            >
              Clear Filter
            </button>
          )}
        </div>

        {activeTab === 'classes' && (
          <div className="space-y-3">
            {filteredClasses.map(cls => {
              const category = categories.find(c => c.category_uid === cls.category_uid);
              const stats = eventStats.find(s => s.ocsf_class_uid === cls.class_uid);

              return (
                <div
                  key={cls.id}
                  className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-blue-600 transition-all cursor-pointer"
                  onClick={() => {
                    setSelectedClass(cls.class_uid);
                    setActiveTab('mappings');
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-mono rounded border border-blue-500/30">
                          {cls.class_uid}
                        </span>
                        <span className="text-white font-semibold">{cls.class_name}</span>
                        <span className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded">
                          {category?.category_name}
                        </span>
                      </div>
                      <p className="text-slate-400 text-sm">{cls.description}</p>
                    </div>
                    {stats && (
                      <div className="ml-4 text-right">
                        <div className="text-sm text-slate-400">Events</div>
                        <div className="text-lg font-bold text-white">{stats.count.toLocaleString()}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'mappings' && (
          <div className="space-y-3">
            {filteredMappings.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <div>No source mappings found</div>
              </div>
            ) : (
              filteredMappings.map(mapping => {
                const eventClass = eventClasses.find(c => c.class_uid === mapping.ocsf_class_uid);

                return (
                  <div
                    key={mapping.id}
                    className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded border border-green-500/30">
                            {mapping.source_vendor}
                          </span>
                          <span className="text-slate-400">/</span>
                          <span className="text-slate-300">{mapping.source_type}</span>
                          <span className="text-slate-400">/</span>
                          <span className="text-white font-medium">{mapping.source_event_type}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-slate-400">Maps to:</span>
                          <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-mono rounded border border-blue-500/30">
                            {mapping.ocsf_class_uid}
                          </span>
                          <span className="text-white">{eventClass?.class_name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          mapping.confidence_score >= 95 ? 'bg-green-400' :
                          mapping.confidence_score >= 80 ? 'bg-yellow-400' :
                          'bg-orange-400'
                        }`} />
                        <span className="text-slate-400 text-sm">{mapping.confidence_score}%</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'attributes' && (
          <div className="space-y-2">
            {filteredAttributes.map(attr => (
              <div
                key={attr.id}
                className="bg-slate-800/50 rounded-lg p-3 border border-slate-700 hover:border-slate-600 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-mono">{attr.attribute_name}</span>
                      <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">
                        {attr.attribute_type}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        attr.requirement === 'required'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-slate-700 text-slate-400'
                      }`}>
                        {attr.requirement}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm">{attr.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-3">
            {eventStats.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <div>No classified events found</div>
                <div className="text-sm mt-1">Events will appear here once OCSF classification is applied</div>
              </div>
            ) : (
              eventStats
                .sort((a, b) => b.count - a.count)
                .map(stat => {
                  const eventClass = eventClasses.find(c => c.class_uid === stat.ocsf_class_uid);
                  const category = categories.find(c => c.category_uid === eventClass?.category_uid);
                  const total = eventStats.reduce((sum, s) => sum + s.count, 0);
                  const percentage = ((stat.count / total) * 100).toFixed(1);

                  return (
                    <div
                      key={stat.ocsf_class_uid}
                      className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-mono rounded border border-blue-500/30">
                            {stat.ocsf_class_uid}
                          </span>
                          <span className="text-white font-medium">{stat.ocsf_class_name}</span>
                          {category && (
                            <span className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded">
                              {category.category_name}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-white font-bold">{stat.count.toLocaleString()}</div>
                          <div className="text-slate-400 text-xs">{percentage}%</div>
                        </div>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
