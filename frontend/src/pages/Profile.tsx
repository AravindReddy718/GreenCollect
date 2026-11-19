// src/pages/Profile.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Profile.css';
import { 
  FaUserCircle, FaEnvelope, FaCoins, FaEdit, FaBell, 
  FaShieldAlt, FaHistory, FaMedal, FaPhone, FaMapMarkerAlt, 
  FaTruck, FaExclamationTriangle 
} from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const Profile = ({ onTabChange }: { onTabChange?: (tab: string) => void }) => {
  const [mounted, setMounted] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [activities, setActivities] = useState<string[]>([]);
  const navigate = useNavigate();
  const { user, logout, loading, updateUser } = useAuth();

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

  // Load persisted avatar and activities
  useEffect(() => {
    if (user?.avatar) {
      setAvatarUrl(user.avatar);
    } else {
      try {
        const savedAvatar = localStorage.getItem('profile.avatar');
        if (savedAvatar) setAvatarUrl(savedAvatar);
      } catch {}
    }
  }, [user?.avatar]);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const res = await api.get('/api/waste-requests/my-requests');
        if (res.data?.success && Array.isArray(res.data.requests)) {
          const list = res.data.requests.slice(0, 5).map((r: any) =>
            `${r.status.toUpperCase()}: ${r.wasteType} pickup (${r.estimatedWeight} kg) on ${r.pickupDate}`
          );
          if (list.length > 0) setActivities(list);
        }
      } catch (e) {
        // ignore
      }
    };
    fetchActivities();
  }, []);

  const handleEditAvatar = async () => {
    const url = window.prompt('Enter image URL for your profile avatar:', avatarUrl || '');
    if (url && url.trim()) {
      try {
        await api.put('/api/auth/profile', { avatar: url.trim() });
        setAvatarUrl(url.trim());
        updateUser({ avatar: url.trim() });
        localStorage.setItem('profile.avatar', url.trim());
      } catch (err) {
        console.error('Failed to update avatar:', err);
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
              <FaHistory /> <span>Member since {user.memberSince || 'Jan 2024'}</span>
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
                <div className="setting-right"><button className="btn btn-outline" onClick={() => alert('Password change request sent')}>Change</button></div>
              </div>
              <div className="setting-row">
                <div className="setting-left"><FaBell /> Notifications</div>
                <div className="setting-right"><button className="btn btn-yellow" onClick={() => alert('Notifications enabled')}>Manage</button></div>
              </div>
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
                <>
                  <li className="activity-item">Joined Janatha Garage community</li>
                  <li className="activity-item">Account initialized with starter bonus</li>
                  <li className="activity-item">Ready to schedule your first waste pickup</li>
                </>
              )}
            </ul>
          </section>

          <section className="glass-card">
            <h3 className="section-title">Badges</h3>
            <div className="badges">
              <div className="badge"><FaMedal /> Starter</div>
              <div className="badge"><FaMedal /> Recycler</div>
              <div className="badge"><FaMedal /> Eco Hero</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Profile;