import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../services/api';
import './AdminDashboard.css';

interface RequestContact {
  _id: string | null;
  name?: string;
  email?: string;
  phone?: string;
}

interface ApiWasteRequest {
  _id: string;
  userId?: RequestContact;
  isOrganisationRequest?: boolean;
  pickupAddress: string;
  wasteType: string;
  estimatedWeight: number;
  pickupDate: string | null;
  pickupTime?: string;
  status?: string;
  collectorStatus?: string;
  createdAt?: string;
}

interface OrgRequest {
  _id: string;
  userId?: RequestContact;
  pickupAddress: string;
  wasteType: string;
  estimatedWeight: number;
  pickupDate: string | null;
  pickupTime?: string;
  status?: string;
  createdAt?: string;
}

interface ApprovedCollector {
  _id: string;
  name: string;
}

const AdminOrganisations: React.FC = () => {
  const [requests, setRequests] = useState<OrgRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectors, setCollectors] = useState<ApprovedCollector[]>([]);
  const [selectedCollector, setSelectedCollector] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchOrgRequests();
    fetchCollectors();
  }, []);

  const fetchCollectors = async () => {
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/admin/collector-requests`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error(`Failed to fetch collectors (${res.status})`);
      const data: Array<{ _id: string; name: string; collectorInfo?: { isApproved?: boolean } }> = await res.json();
      setCollectors(data.filter(c => c.collectorInfo?.isApproved).map(c => ({ _id: c._id, name: c.name })));
    } catch (err) {
      console.error('Error fetching collectors:', err);
    }
  };

  const fetchOrgRequests = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/waste-requests`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        }
      });

      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);

      const data = await res.json();

      // backend returns an array for this endpoint
      const arr = Array.isArray(data) ? data : (data.requests || []);

      const orgs = arr.filter((r: ApiWasteRequest) => {
        // backend formatted request may include userId.name as organisationName
        return r.userId && (r.userId.name && r.userId._id === null || r.isOrganisationRequest || r.userId.name && /organisation/i.test(String(r.userId.name)));
      }).map((r: ApiWasteRequest) => ({
        _id: r._id,
        userId: r.userId,
        pickupAddress: r.pickupAddress,
        wasteType: r.wasteType,
        estimatedWeight: r.estimatedWeight,
        pickupDate: r.pickupDate,
        pickupTime: r.pickupTime,
        status: r.status || r.collectorStatus,
        createdAt: r.createdAt
      }));

      setRequests(orgs);
    } catch (err) {
      console.error('Error fetching organisation requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (id: string) => {
    const collectorId = selectedCollector[id];
    if (!collectorId) {
      alert('Choose a collector to assign before accepting.');
      return;
    }
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/admin/organisation-requests/${id}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ collectorId })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed');
      }
      // optimistically update
      setRequests(prev => prev.map(r => r._id === id ? { ...r, status: 'accepted' } : r));
    } catch (err) {
      console.error('Accept error', err);
      alert(err instanceof Error && err.message !== 'Failed' ? err.message : 'Failed to accept request');
    }
  };

  const handleReject = async (id: string) => {
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/admin/organisation-requests/${id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        }
      });
      if (!res.ok) throw new Error('Failed');
      setRequests(prev => prev.map(r => r._id === id ? { ...r, status: 'rejected' } : r));
    } catch (err) {
      console.error('Reject error', err);
      alert('Failed to reject request');
    }
  };

  if (loading) return <div className="admin-section"><p>Loading organisation requests...</p></div>;

  return (
    <div className="admin-section">
      <div className="section-header">
        <h3>Organisation Collection Requests</h3>
        <span className="badge">{requests.length}</span>
      </div>

      {requests.length === 0 && (
        <div className="empty-state-small"><p>No organisation requests found</p></div>
      )}

      <div className="org-list">
        {requests.map(req => (
          <div className={`org-card ${req.status === 'pending' ? 'org-card-warning' : ''}`} key={req._id}>
            <div className="org-main">
              <h4>{req.userId?.name || 'Organisation'}</h4>
              <p className="muted">{req.userId?.email || 'No contact email'}</p>
              <p>Address: {req.pickupAddress}</p>
              <p>Waste Types: {req.wasteType}</p>
              <p>Estimated Weight: {req.estimatedWeight} kg</p>
            </div>
            <div className="org-meta">
              <span className={`status-badge ${req.status === 'accepted' ? 'approved' : req.status === 'rejected' ? 'rejected' : ''}`}>{req.status || 'pending'}</span>
              <small>{req.pickupDate || ''} {req.pickupTime || ''}</small>
            </div>
            <div className="request-actions" style={{ marginTop: 12 }}>
              {req.status === 'pending' && (
                <>
                  <select
                    aria-label="Assign collector"
                    value={selectedCollector[req._id] || ''}
                    onChange={(e) => setSelectedCollector(prev => ({ ...prev, [req._id]: e.target.value }))}
                  >
                    <option value="">{collectors.length ? 'Assign collector…' : 'No approved collectors'}</option>
                    {collectors.map(c => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                  <button className="btn btn-success btn-sm" onClick={() => handleAccept(req._id)}>Accept</button>
                </>
              )}
              {req.status !== 'rejected' && (
                <button className="btn btn-danger btn-sm" onClick={() => handleReject(req._id)}>Reject</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminOrganisations;
