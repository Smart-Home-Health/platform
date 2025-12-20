import React, { useState, useEffect } from 'react';
import { userService } from '../../services/users';

const UserSettings = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  const [formData, setFormData] = useState({
    username: '',
    full_name: '',
    email: '',
    password: '',
    confirmPassword: '',
    pin: '',
    is_active: true,
    role_ids: []
  });

  useEffect(() => {
    loadUsers();
    loadRoles();
  }, []);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const usersData = await userService.getUsers();
      setUsers(usersData);
    } catch (err) {
      console.error('Failed to load users:', err);
      if (err.message.includes('fetch')) {
        setError('Unable to load users. Please check your connection.');
      } else {
        setError('Failed to load users. You may not have permission to view this page.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const rolesData = await userService.getRoles();
      setRoles(rolesData);
      setError(null);
    } catch (err) {
      console.error('Failed to load roles:', err);
      // Roles are needed for the form, but don't block the page
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError(null);

      // Validate passwords match
      if (!editingUser && formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      // Validate password length
      if (!editingUser && formData.password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }

      // Validate PIN if provided
      if (formData.pin && (formData.pin.length < 4 || formData.pin.length > 8)) {
        setError('PIN must be between 4 and 8 digits');
        return;
      }

      if (formData.pin && !/^\d+$/.test(formData.pin)) {
        setError('PIN must contain only numbers');
        return;
      }

      const userData = {
        username: formData.username,
        full_name: formData.full_name,
        email: formData.email || null,
        is_active: formData.is_active,
        pin: formData.pin || null,
      };

      // Only include password for new users or when updating password
      if (!editingUser) {
        userData.password = formData.password;
      }

      if (editingUser) {
        await userService.updateUser(editingUser.id, userData);
        
        // Update roles if changed
        const currentRoleIds = editingUser.roles.map(r => r.id);
        const newRoleIds = formData.role_ids;
        
        // Remove roles that are no longer selected
        for (const roleId of currentRoleIds) {
          if (!newRoleIds.includes(roleId)) {
            await userService.removeRole(editingUser.id, roleId);
          }
        }
        
        // Add new roles
        for (const roleId of newRoleIds) {
          if (!currentRoleIds.includes(roleId)) {
            await userService.assignRole(editingUser.id, roleId);
          }
        }
        
        setSuccess('User updated successfully');
      } else {
        const newUser = await userService.createUser(userData);
        
        // Assign roles to new user
        for (const roleId of formData.role_ids) {
          await userService.assignRole(newUser.id, roleId);
        }
        
        setSuccess('User created successfully');
      }

      resetForm();
      loadUsers();

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      username: '',
      full_name: '',
      email: '',
      password: '',
      confirmPassword: '',
      pin: '',
      is_active: true,
      role_ids: []
    });
    setShowAddForm(false);
    setEditingUser(null);
  };

  const handleEdit = (user) => {
    setFormData({
      username: user.username,
      full_name: user.full_name,
      email: user.email || '',
      password: '',
      confirmPassword: '',
      pin: user.has_pin ? '****' : '',
      is_active: user.is_active,
      role_ids: user.roles.map(r => r.id)
    });
    setEditingUser(user);
    setShowAddForm(true);
  };

  const handleDelete = async (userId) => {
    try {
      await userService.deleteUser(userId);
      setSuccess('User deleted successfully');
      loadUsers();
      setShowDeleteConfirm(null);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRoleToggle = (roleId) => {
    setFormData(prev => ({
      ...prev,
      role_ids: prev.role_ids.includes(roleId)
        ? prev.role_ids.filter(id => id !== roleId)
        : [...prev.role_ids, roleId]
    }));
  };

  const isAdminUser = (user) => {
    return user.is_system_admin || user.roles.some(r => r.name === 'system_admin');
  };

  if (isLoading) {
    return <div style={{ color: '#fff', padding: '20px' }}>Loading users...</div>;
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h3 style={{
          color: '#ffffff',
          fontSize: '1.25rem',
          margin: 0,
          fontWeight: '600'
        }}>User Management</h3>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              backgroundColor: '#28a745',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            + Add User
          </button>
        )}
      </div>

      {error && (
        <div style={{
          backgroundColor: 'rgba(254, 215, 215, 0.15)',
          color: '#fc8181',
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '16px',
          border: '1px solid #fc8181',
          fontSize: '14px'
        }}>{error}</div>
      )}

      {success && (
        <div style={{
          backgroundColor: 'rgba(198, 246, 213, 0.15)',
          color: '#68d391',
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '16px',
          border: '1px solid #68d391',
          fontSize: '14px'
        }}>{success}</div>
      )}

      {showAddForm ? (
        <form onSubmit={handleSubmit} style={{
          backgroundColor: '#1a202c',
          borderRadius: '8px',
          padding: '20px',
          border: '1px solid #4a5568',
          marginBottom: '20px'
        }}>
          <h4 style={{ color: '#ffffff', marginBottom: '16px', fontSize: '1.1rem' }}>
            {editingUser ? 'Edit User' : 'Add New User'}
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{
                color: '#e2e8f0',
                fontSize: '13px',
                fontWeight: '500',
                marginBottom: '6px',
                display: 'block'
              }}>Full Name *</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: '#2d3748',
                  border: '1px solid #4a5568',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{
                color: '#e2e8f0',
                fontSize: '13px',
                fontWeight: '500',
                marginBottom: '6px',
                display: 'block'
              }}>Username *</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
                disabled={editingUser !== null}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: editingUser ? '#1a202c' : '#2d3748',
                  border: '1px solid #4a5568',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  cursor: editingUser ? 'not-allowed' : 'text'
                }}
              />
            </div>

            <div>
              <label style={{
                color: '#e2e8f0',
                fontSize: '13px',
                fontWeight: '500',
                marginBottom: '6px',
                display: 'block'
              }}>Email (Optional)</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: '#2d3748',
                  border: '1px solid #4a5568',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{
                color: '#e2e8f0',
                fontSize: '13px',
                fontWeight: '500',
                marginBottom: '6px',
                display: 'block'
              }}>PIN (Optional - 4-8 digits)</label>
              <input
                type="text"
                value={formData.pin}
                onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                pattern="\d{4,8}"
                maxLength={8}
                placeholder={editingUser && formData.pin === '****' ? 'Leave blank to keep current' : ''}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  backgroundColor: '#2d3748',
                  border: '1px solid #4a5568',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {!editingUser && (
              <>
                <div>
                  <label style={{
                    color: '#e2e8f0',
                    fontSize: '13px',
                    fontWeight: '500',
                    marginBottom: '6px',
                    display: 'block'
                  }}>Password *</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingUser}
                    minLength={8}
                    placeholder="Minimum 8 characters"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: '#2d3748',
                      border: '1px solid #4a5568',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    color: '#e2e8f0',
                    fontSize: '13px',
                    fontWeight: '500',
                    marginBottom: '6px',
                    display: 'block'
                  }}>Confirm Password *</label>
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    required={!editingUser}
                    minLength={8}
                    placeholder="Re-enter password"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: '#2d3748',
                      border: '1px solid #4a5568',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              color: '#e2e8f0',
              fontSize: '13px',
              fontWeight: '500',
              marginBottom: '10px',
              display: 'block'
            }}>Roles</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {roles.map(role => (
                <label key={role.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px',
                  backgroundColor: '#2d3748',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: '1px solid #4a5568'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.role_ids.includes(role.id)}
                    onChange={() => handleRoleToggle(role.id)}
                    style={{
                      width: '16px',
                      height: '16px',
                      accentColor: '#007bff',
                      cursor: 'pointer'
                    }}
                  />
                  <div>
                    <div style={{ color: '#ffffff', fontSize: '14px', fontWeight: '500' }}>
                      {role.display_name || role.name}
                    </div>
                    {role.description && (
                      <div style={{ color: '#a0aec0', fontSize: '12px' }}>
                        {role.description}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px',
            backgroundColor: '#2d3748',
            borderRadius: '6px',
            border: '1px solid #4a5568',
            marginBottom: '16px'
          }}>
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              style={{
                width: '18px',
                height: '18px',
                accentColor: '#007bff',
                cursor: 'pointer'
              }}
            />
            <label style={{
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}>Active Account</label>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={resetForm}
              style={{
                backgroundColor: '#4a5568',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                backgroundColor: '#007bff',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              {editingUser ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      ) : null}

      <div style={{
        display: 'grid',
        gap: '12px'
      }}>
        {users.map(user => (
          <div key={user.id} style={{
            backgroundColor: '#1a202c',
            borderRadius: '8px',
            padding: '16px',
            border: '1px solid #4a5568',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  fontWeight: '600'
                }}>
                  {user.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{
                    color: '#ffffff',
                    fontSize: '16px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    {user.full_name}
                    {isAdminUser(user) && (
                      <span style={{
                        backgroundColor: '#9f7aea',
                        color: '#ffffff',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}>ADMIN</span>
                    )}
                    {!user.is_active && (
                      <span style={{
                        backgroundColor: '#fc8181',
                        color: '#ffffff',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}>INACTIVE</span>
                    )}
                  </div>
                  <div style={{ color: '#a0aec0', fontSize: '14px' }}>
                    @{user.username}
                    {user.email && ` • ${user.email}`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {user.roles.map(role => (
                  <span key={role.id} style={{
                    backgroundColor: '#2d3748',
                    color: '#cbd5e0',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    border: '1px solid #4a5568'
                  }}>
                    {role.display_name || role.name}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleEdit(user)}
                style={{
                  backgroundColor: '#007bff',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Edit
              </button>
              {!isAdminUser(user) && (
                <button
                  onClick={() => setShowDeleteConfirm(user.id)}
                  style={{
                    backgroundColor: '#dc3545',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showDeleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: '#1a202c',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            border: '1px solid #4a5568'
          }}>
            <h3 style={{ color: '#ffffff', marginBottom: '16px' }}>Confirm Delete</h3>
            <p style={{ color: '#cbd5e0', marginBottom: '20px' }}>
              Are you sure you want to delete this user? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                style={{
                  backgroundColor: '#4a5568',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                style={{
                  backgroundColor: '#dc3545',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserSettings;
