// src/pages/Profile.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Profile.css';
import { 
  FaUserCircle, FaEnvelope, FaCoins, FaEdit, FaBell, 
  FaShieldAlt, FaHistory, FaMedal, FaPhone, FaMapMarkerAlt, 
  FaTruck, FaExclamationTriangle 
} from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import api, { getErrorMessage } from '../services/api';
import { passwordError } from '../utils/validation';

type PasswordField = 'currentPassword' | 'newPassword' | 'confirmPassword';

const Profile = ({ onTabChange }: { onTabChange?: (tab: string) => void }) => {
  const [mounted, setMounted] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [activities, setActivities] = useState<string[]>([]);
  const [completedPickups, setCompletedPickups] = useState(0);
  const navigate = useNavigate();
  const { user, logout, loading, updateUser, updateToken } = useAuth();

  // Change password
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwords, setPasswords] = useState<Record<PasswordField, string>>({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordTouched, setPasswordTouched] = useState<Partial<Record<PasswordField, boolean>>>({});
  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const [passwordServerErrors, setPasswordServerErrors] = useState<Partial<Record<PasswordField, string>>>({});
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');

  // Notifications
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [notificationMessage, setNotificationMessage] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  // Set active tab to 'profile' when component mounts
  useEffect(() => {
    if (onTabChange) {
      onTabChange('profile');
    }
  }, [onTabChange]);

  // The avatar comes from the logged-in user's record only
  useEffect(() => {
    setAvatarUrl(user?.avatar || null);
  }, [user?.avatar]);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const res = await api.get('/api/waste-requests/my-requests');
        if (res.data?.success && Array.isArray(res.data.requests)) {
          setCompletedPickups(res.data.requests.filter((r: { status: string }) => r.status === 'completed').length);
          const list = res.data.requests.slice(0, 5).map((r: { status: string; wasteType: string; estimatedWeight: number; pickupDate: string }) =>
            `${r.status.toUpperCase()}: ${r.wasteType} pickup (${r.estimatedWeight} kg) on ${r.pickupDate}`
          );
          if (list.length > 0) setActivities(list);
        }
      } catch {
        // Recent activity is optional; the profile still shows without it
      }
    };
    fetchActivities();
  }, []);

  useEffect(() => {
    api.get('/api/notifications')
      .then(res => setUnreadCount((res.data?.items || []).filter((n: { read: boolean }) => !n.read).length))
      .catch(() => setUnreadCount(null));
  }, []);

  const passwordErrors: Partial<Record<PasswordField, string>> = {};
  if (!passwords.currentPassword) passwordErrors.currentPassword = 'Please enter your current password';
  const invalidNew = passwordError(passwords.newPassword);
  if (invalidNew) passwordErrors.newPassword = passwords.newPassword ? invalidNew : 'Please choose a new password';
  else if (passwords.newPassword === passwords.currentPassword) passwordErrors.newPassword = 'New password must be different from your current password';
  if (!passwords.confirmPassword) passwordErrors.confirmPassword = 'Please type the new password again';
  else if (passwords.confirmPassword !== passwords.newPassword) passwordErrors.confirmPassword = 'Passwords do not match';

  const passwordErrorFor = (field: PasswordField) =>
    passwordServerErrors[field] || (passwordTouched[field] || passwordSubmitted ? passwordErrors[field] : undefined);

  const setPasswordField = (field: PasswordField) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasswords(prev => ({ ...prev, [field]: e.target.value }));
    setPasswordServerErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const closePasswordForm = () => {
    setShowPasswordForm(false);
    setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordTouched({});
    setPasswordSubmitted(false);
    setPasswordServerErrors({});
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage('');
    setPasswordSubmitted(true);
    const firstInvalid = (Object.keys(passwordErrors) as PasswordField[])[0];
    if (firstInvalid) {
      document.getElementById(`profile-${firstInvalid}`)?.focus();
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await api.put('/api/auth/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword
      });
      // The old token stops working after the change; keep this device signed in with the new one
      if (res.data?.token) updateToken(res.data.token);
      closePasswordForm();
      setPasswordMessage(res.data?.message || 'Password changed.');
    } catch (err) {
      const field = axios.isAxiosError(err) ? (err.response?.data as { field?: string } | undefined)?.field : undefined;
      if (field === 'currentPassword' || field === 'newPassword') {
        setPasswordServerErrors({ [field]: getErrorMessage(err) });
        document.getElementById(`profile-${field}`)?.focus();
      } else {
        setPasswordServerErrors({ currentPassword: getErrorMessage(err, 'Could not change your password. Please try again.') });
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleMarkNotificationsRead = async () => {
    try {
      await api.post('/api/notifications/clear');
      setUnreadCount(0);
      setNotificationMessage('All notifications marked as read');
    } catch (err) {
      setNotificationMessage(getErrorMessage(err, 'Could not update notifications.'));
    }
  };

  const renderPasswordInput = (field: PasswordField, label: string, autoComplete: string) => (
    <div className="form-row">
      <label htmlFor={`profile-${field}`}>{label}</label>
      <input
        type="password"
        id={`profile-${field}`}
        name={field}
        value={passwords[field]}
        onChange={setPasswordField(field)}
        onBlur={() => setPasswordTouched(prev => ({ ...prev, [field]: true }))}
        className={passwordErrorFor(field) ? 'input-invalid' : ''}
        autoComplete={autoComplete}
        maxLength={72}
        aria-invalid={Boolean(passwordErrorFor(field))}
        aria-describedby={passwordErrorFor(field) ? `profile-${field}-error` : undefined}
        disabled={passwordSaving}
      />
      {passwordErrorFor(field) && (
        <p id={`profile-${field}-error`} className="field-error" role="alert">{passwordErrorFor(field)}</p>
      )}
    </div>
  );

  // Real join date from the account record
  const memberSinceLabel = user?.memberSince && !Number.isNaN(new Date(user.memberSince).getTime())
    ? new Date(user.memberSince).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : 'recently';

  // Badges are earned from completed pickups
  const badges = [
    { name: 'Starter', rule: 'joined the community', earned: true },
    { name: 'Recycler', rule: '1 completed pickup', earned: completedPickups >= 1 },
    { name: 'Eco Hero', rule: '10 completed pickups', earned: completedPickups >= 10 }
  ];

  const handleEditAvatar = async () => {
    const url = window.prompt('Enter image URL for your profile avatar:', avatarUrl || '');
    if (url && url.trim()) {
      try {
        await api.put('/api/auth/profile', { avatar: url.trim() });
        setAvatarUrl(url.trim());
        updateUser({ avatar: url.trim() });
      } catch (err) {
        alert(getErrorMessage(err, 'Could not update your avatar.'));
      }
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleLoginRedirect = () => {
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="container">
          <div className="loading-state">
            <p>Loading your profile...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile-page">
        <div className="container">
          <div className="error-state">
            <FaExclamationTriangle />
            <h3>Authentication Required</h3>
            <p>Please log in to view your profile</p>
            <button className="btn btn-primary" onClick={handleLoginRedirect}>
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Format role for display
  const getRoleDisplay = () => {
    if (user.role === 'collector') {
      return user.collectorInfo?.isApproved ? 'Approved Collector' : 'Pending Collector';
    }
    return user.role.charAt(0).toUpperCase() + user.role.slice(1);
  };

  // Get role badge color
  const getRoleBadgeClass = () => {
    if (!user) return 'role-badge user';
    
    switch (user.role) {
      case 'admin': return 'role-badge admin';
      case 'collector': 
        return user.collectorInfo?.isApproved 
          ? 'role-badge collector approved' 
          : 'role-badge collector pending';
      default: return 'role-badge user';
    }
  };

  return (
    <div className="profile-page">
      <div className="container">
        {/* Header */}
        <div className={`profile-header ${mounted ? 'animate-in' : ''}`}>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">Manage your account, preferences, and see your activity</p>
        </div>

        {/* Overview Card */}
        <div className={`overview-card ${mounted ? 'animate-in delay-1' : ''}`}>
          <div className="avatar-block">
            <div className="avatar-wrapper" title="Change profile picture">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="avatar-img" />
              ) : (
                <FaUserCircle className="avatar-icon" />
              )}
              <button className="avatar-edit-btn" onClick={handleEditAvatar}>
                <FaEdit /> Edit
              </button>
            </div>
            <div className={`role-badge ${getRoleBadgeClass()}`}>
              {getRoleDisplay()}
            </div>
          </div>
          <div className="user-meta">
            <h2 className="user-name">{user.name}</h2>
            <div className="user-line">
              <FaEnvelope /> <span>{user.email}</span>
            </div>
            <div className="user-line">
              <FaHistory /> <span>Member since {memberSinceLabel}</span>
            </div>
            
            {/* Collector-specific info */}
            {user.role === 'collector' && user.collectorInfo && (
              <>
                {user.collectorInfo.phone && (
                  <div className="user-line">
                    <FaPhone /> <span>{user.collectorInfo.phone}</span>
                  </div>
                )}
                {user.collectorInfo.address && (
                  <div className="user-line">
                    <FaMapMarkerAlt /> <span>{user.collectorInfo.address}</span>
                  </div>
                )}
                {user.collectorInfo.vehicleType && (
                  <div className="user-line">
                    <FaTruck /> <span>{user.collectorInfo.vehicleType} - {user.collectorInfo.vehicleNumberPlate}</span>
                  </div>
                )}
                {user.collectorInfo.experience && (
                  <div className="user-line">
                    <FaMedal /> <span>{user.collectorInfo.experience}</span>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="user-stats">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ffcc00', fontWeight: 'bold', fontSize: '1.1rem' }}>
              <FaCoins /> <span>{user.points || 0} Eco Coins</span>
            </div>
            <button className="edit-btn" onClick={handleLogout}>
              <FaShieldAlt /> Logout
            </button>
          </div>
        </div>

        {/* Grid sections */}
        <div className={`profile-grid ${mounted ? 'animate-in delay-2' : ''}`}>
          <section className="glass-card">
            <h3 className="section-title">Account Settings</h3>
            <div className="settings-list">
              <div className="setting-row">
                <div className="setting-left"><FaEnvelope /> Email</div>
                <div className="setting-right">{user.email}</div>
              </div>
              <div className="setting-row">
                <div className="setting-left"><FaShieldAlt /> Password</div>
                <div className="setting-right">
                  {!showPasswordForm && (
                    <button className="btn btn-outline" onClick={() => { setPasswordMessage(''); setShowPasswordForm(true); }}>Change</button>
                  )}
                </div>
              </div>
              {showPasswordForm && (
                <form className="modal-form password-form" onSubmit={handleChangePassword} noValidate>
                  {renderPasswordInput('currentPassword', 'Current password', 'current-password')}
                  {renderPasswordInput('newPassword', 'New password', 'new-password')}
                  {!passwordErrorFor('newPassword') && (
                    <p className="field-hint">8-72 characters, with at least one letter and one number</p>
                  )}
                  {renderPasswordInput('confirmPassword', 'Confirm new password', 'new-password')}
                  <div className="password-form-actions">
                    <button type="submit" className="btn btn-yellow" disabled={passwordSaving}>
                      {passwordSaving ? 'Saving...' : 'Update password'}
                    </button>
                    <button type="button" className="btn btn-outline" onClick={closePasswordForm} disabled={passwordSaving}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              {passwordMessage && <p className="form-success" role="status">{passwordMessage}</p>}
              <div className="setting-row">
                <div className="setting-left"><FaBell /> Notifications</div>
                <div className="setting-right">
                  <span className="setting-note">{unreadCount === null ? '' : `${unreadCount} unread`}</span>
                  <button className="btn btn-yellow" onClick={handleMarkNotificationsRead} disabled={!unreadCount}>
                    Mark all read
                  </button>
                </div>
              </div>
              {notificationMessage && <p className="field-hint" role="status">{notificationMessage}</p>}
            </div>
          </section>

          <section className="glass-card">
            <h3 className="section-title">Recent Activity</h3>
            <ul className="activity-list">
              {activities.length > 0 ? (
                activities.map((act, idx) => (
                  <li key={idx} className="activity-item">{act}</li>
                ))
              ) : (
                <li className="activity-item">No activity yet. Schedule your first pickup to start earning coins.</li>
              )}
            </ul>
          </section>

          <section className="glass-card">
            <h3 className="section-title">Badges</h3>
            <div className="badges">
              {badges.map(badge => (
                <div key={badge.name} className={`badge${badge.earned ? '' : ' badge-locked'}`} title={badge.rule}>
                  <FaMedal /> {badge.name}{!badge.earned && ` (${badge.rule})`}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Profile;