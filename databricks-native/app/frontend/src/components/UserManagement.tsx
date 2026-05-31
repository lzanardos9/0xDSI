import { useState, useEffect } from 'react';
import { callFunction } from '../lib/llmGateway';
import { Users, Plus, CreditCard as Edit, Trash2, Shield, Lock, Unlock, Clock, Search, Filter, X, Check, AlertTriangle, Eye, EyeOff, UserCog, History, Award, Network, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import UserActivityLineage from './UserActivityLineage';

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  department: string;
  title: string;
  role: string;
  security_clearance: string;
  clearance_compartments: string[];
  account_status: string;
  account_approved_at: string | null;
  require_mfa: boolean;
  last_login: string | null;
  max_concurrent_sessions: number;
  session_timeout_minutes: number;
  account_expires_at: string | null;
  supervisor_id: string | null;
  emergency_contact: string | null;
  notes: string | null;
  created_at: string;
}

interface UserRole {
  role_name: string;
  display_name: string;
  description: string;
  max_clearance_level: string;
}

interface AuditLogEntry {
  id: string;
  action_type: string;
  timestamp: string;
  performed_by: string;
  details: any;
}

const UserManagement = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'users' | 'audit' | 'lineage'>('users');

  const [formData, setFormData] = useState({
    user_id: '',
    full_name: '',
    email: '',
    password: '',
    department: '',
    title: '',
    role: 'analyst',
    security_clearance: 'unclassified',
    clearance_compartments: [] as string[],
    account_status: 'pending',
    require_mfa: true,
    max_concurrent_sessions: 3,
    session_timeout_minutes: 30,
    emergency_contact: '',
    notes: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadUsers();
    loadRoles();
    loadAuditLogs();
  }, []);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .order('role_name');

      if (error) throw error;
      setRoles(data || []);
    } catch (error) {
      console.error('Error loading roles:', error);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('user_audit_log')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) throw error;
      setAuditLogs(data || []);
    } catch (error) {
      console.error('Error loading audit logs:', error);
    }
  };

  const handleCreateUser = async () => {
    try {
      const { password, ...profileData } = formData;
      const { error } = await supabase
        .from('user_profiles')
        .insert([profileData]);

      if (error) throw error;

      if (password) {
        await setUserPassword(formData.email || `${formData.user_id}@soc.local`, password, formData.full_name, formData.user_id);
      }

      setShowCreateModal(false);
      loadUsers();
      resetForm();
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Failed to create user');
    }
  };

  const setUserPassword = async (email: string, password: string, fullName: string, userId: string) => {
    const { data, error } = await callFunction('create-user', {
      email,
      password,
      full_name: fullName,
      user_id: userId,
      username: userId
    });

    if (error) {
      console.error('Password set failed:', error);
    }

    return data || { error };
  };

  const handleSetPassword = async () => {
    if (!selectedUser || !formData.password) return;
    setPasswordLoading(true);
    setPasswordMessage(null);
    try {
      const result = await setUserPassword(
        selectedUser.email,
        formData.password,
        selectedUser.full_name,
        selectedUser.user_id
      );
      if (result.success) {
        setPasswordMessage({ type: 'success', text: 'Password updated successfully' });
        setFormData({ ...formData, password: '' });
      } else {
        setPasswordMessage({ type: 'error', text: result.error || 'Failed to set password' });
      }
    } catch (error: any) {
      setPasswordMessage({ type: 'error', text: error.message || 'Failed to set password' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update(formData)
        .eq('id', selectedUser.id);

      if (error) throw error;

      setShowEditModal(false);
      setSelectedUser(null);
      loadUsers();
      resetForm();
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Failed to update user');
    }
  };

  const handleSuspendUser = async (userId: string) => {
    if (!confirm('Are you sure you want to suspend this user?')) return;

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ account_status: 'suspended' })
        .eq('id', userId);

      if (error) throw error;
      loadUsers();
    } catch (error) {
      console.error('Error suspending user:', error);
    }
  };

  const handleActivateUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ account_status: 'active', account_approved_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;
      loadUsers();
    } catch (error) {
      console.error('Error activating user:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;
      loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      user_id: '',
      full_name: '',
      email: '',
      password: '',
      department: '',
      title: '',
      role: 'analyst',
      security_clearance: 'unclassified',
      clearance_compartments: [],
      account_status: 'pending',
      require_mfa: true,
      max_concurrent_sessions: 3,
      session_timeout_minutes: 30,
      emergency_contact: '',
      notes: '',
    });
    setShowPassword(false);
    setPasswordMessage(null);
  };

  const openEditModal = (user: UserProfile) => {
    setSelectedUser(user);
    setFormData({
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      department: user.department || '',
      title: user.title || '',
      role: user.role,
      security_clearance: user.security_clearance,
      clearance_compartments: user.clearance_compartments || [],
      account_status: user.account_status,
      require_mfa: user.require_mfa,
      max_concurrent_sessions: user.max_concurrent_sessions,
      session_timeout_minutes: user.session_timeout_minutes,
      emergency_contact: user.emergency_contact || '',
      notes: user.notes || '',
    });
    setShowEditModal(true);
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.user_id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const matchesStatus = filterStatus === 'all' || user.account_status === filterStatus;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      viewer: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      analyst: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      engineer: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      admin: 'bg-red-500/10 text-red-400 border-red-500/20',
      ciso: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      auditor: 'bg-green-500/10 text-green-400 border-green-500/20',
    };
    return colors[role] || colors.viewer;
  };

  const getClearanceBadgeColor = (clearance: string) => {
    const colors: Record<string, string> = {
      unclassified: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      confidential: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      secret: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      top_secret: 'bg-red-500/10 text-red-400 border-red-500/20',
      sci: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
    };
    return colors[clearance] || colors.unclassified;
  };

  const getStatusBadgeColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      suspended: 'bg-red-500/10 text-red-400 border-red-500/20',
      investigation: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      terminated: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      locked: 'bg-red-500/10 text-red-400 border-red-500/20',
    };
    return colors[status] || colors.pending;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center space-x-3">
            <UserCog className="w-8 h-8 text-blue-400" />
            <span>Platform User Management</span>
          </h2>
          <p className="text-slate-400 mt-1">Manage users, roles, clearances, and access controls</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center space-x-2 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Create User</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-700">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'users'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4" />
            <span>Users</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'audit'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4" />
            <span>Audit Log</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('lineage')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'lineage'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Network className="w-4 h-4" />
            <span>Activity Lineage</span>
          </div>
        </button>
      </div>

      {activeTab === 'lineage' && (
        <div className="h-[calc(100vh-220px)] -mx-6 -mb-6 border-t border-slate-800 overflow-hidden">
          <UserActivityLineage />
        </div>
      )}

      {activeTab === 'users' && (
        <>
          {/* Filters */}
          <div className="enterprise-card p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-800/50 text-slate-200 pl-10 pr-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Roles</option>
                {roles.map((role) => (
                  <option key={role.role_name} value={role.role_name}>
                    {role.display_name}
                  </option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="investigation">Investigation</option>
                <option value="terminated">Terminated</option>
                <option value="locked">Locked</option>
              </select>
            </div>
          </div>

          {/* Users Table */}
          <div className="enterprise-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Clearance</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Department</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Last Login</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-slate-200">{user.full_name}</div>
                          <div className="text-sm text-slate-500">{user.email}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>
                          {user.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${getClearanceBadgeColor(user.security_clearance)}`}>
                          {user.security_clearance.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusBadgeColor(user.account_status)}`}>
                          {user.account_status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{user.department || '-'}</td>
                      <td className="px-4 py-3 text-slate-400 text-sm">
                        {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-1 hover:bg-slate-700 rounded text-blue-400"
                            title="Edit User"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {user.account_status === 'active' && (
                            <button
                              onClick={() => handleSuspendUser(user.id)}
                              className="p-1 hover:bg-slate-700 rounded text-amber-400"
                              title="Suspend User"
                            >
                              <Lock className="w-4 h-4" />
                            </button>
                          )}
                          {user.account_status === 'pending' && (
                            <button
                              onClick={() => handleActivateUser(user.id)}
                              className="p-1 hover:bg-slate-700 rounded text-emerald-400"
                              title="Approve & Activate"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          {user.account_status === 'suspended' && (
                            <button
                              onClick={() => handleActivateUser(user.id)}
                              className="p-1 hover:bg-slate-700 rounded text-emerald-400"
                              title="Reactivate User"
                            >
                              <Unlock className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="p-1 hover:bg-slate-700 rounded text-red-400"
                            title="Delete User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'audit' && (
        <div className="enterprise-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Performed By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-300 text-sm">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-slate-700 text-slate-300">
                        {log.action_type.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{log.performed_by || 'System'}</td>
                    <td className="px-4 py-3 text-slate-400 text-sm">
                      {JSON.stringify(log.details).substring(0, 100)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-100">Create New User</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">User ID</label>
                  <input
                    type="text"
                    value={formData.user_id}
                    onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Set login password"
                      className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 pr-10 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  >
                    {roles.map((role) => (
                      <option key={role.role_name} value={role.role_name}>
                        {role.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Security Clearance</label>
                  <select
                    value={formData.security_clearance}
                    onChange={(e) => setFormData({ ...formData, security_clearance: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="unclassified">Unclassified</option>
                    <option value="confidential">Confidential</option>
                    <option value="secret">Secret</option>
                    <option value="top_secret">Top Secret</option>
                    <option value="sci">SCI</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Max Concurrent Sessions</label>
                  <input
                    type="number"
                    value={formData.max_concurrent_sessions}
                    onChange={(e) => setFormData({ ...formData, max_concurrent_sessions: parseInt(e.target.value) })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Session Timeout (minutes)</label>
                  <input
                    type="number"
                    value={formData.session_timeout_minutes}
                    onChange={(e) => setFormData({ ...formData, session_timeout_minutes: parseInt(e.target.value) })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Emergency Contact</label>
                  <input
                    type="text"
                    value={formData.emergency_contact}
                    onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.require_mfa}
                  onChange={(e) => setFormData({ ...formData, require_mfa: e.target.checked })}
                  className="rounded"
                />
                <label className="text-sm text-slate-300">Require Multi-Factor Authentication</label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-700 flex justify-end space-x-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-100">Edit User</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  >
                    {roles.map((role) => (
                      <option key={role.role_name} value={role.role_name}>
                        {role.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Security Clearance</label>
                  <select
                    value={formData.security_clearance}
                    onChange={(e) => setFormData({ ...formData, security_clearance: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="unclassified">Unclassified</option>
                    <option value="confidential">Confidential</option>
                    <option value="secret">Secret</option>
                    <option value="top_secret">Top Secret</option>
                    <option value="sci">SCI</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Account Status</label>
                  <select
                    value={formData.account_status}
                    onChange={(e) => setFormData({ ...formData, account_status: e.target.value })}
                    className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="investigation">Investigation</option>
                    <option value="terminated">Terminated</option>
                    <option value="locked">Locked</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.require_mfa}
                  onChange={(e) => setFormData({ ...formData, require_mfa: e.target.checked })}
                  className="rounded"
                />
                <label className="text-sm text-slate-300">Require Multi-Factor Authentication</label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="border-t border-slate-700 pt-4 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <label className="text-sm font-medium text-slate-200">Set / Reset Password</label>
                </div>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Enter new password"
                      className="w-full bg-slate-800/50 text-slate-200 px-4 py-2 pr-10 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    onClick={handleSetPassword}
                    disabled={!formData.password || passwordLoading}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors whitespace-nowrap"
                  >
                    {passwordLoading ? 'Setting...' : 'Set Password'}
                  </button>
                </div>
                {passwordMessage && (
                  <p className={`mt-2 text-sm ${passwordMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {passwordMessage.text}
                  </p>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-slate-700 flex justify-end space-x-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateUser}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                Update User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
