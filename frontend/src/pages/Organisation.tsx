import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, getErrorMessage } from '../services/api';
import './Organisation.css';

const Organisation: React.FC = () => {
  const navigate = useNavigate();
  const [organisationName, setOrganisationName] = useState('');
  const [type, setType] = useState('school');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [wasteTypes, setWasteTypes] = useState('plastic,paper');
  const [estimatedWeight, setEstimatedWeight] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const body = {
        organisationName,
        organisationType: type,
        contactName,
        contactEmail: email,
        contactPhone: phone,
        pickupAddress: address,
        wasteTypes: wasteTypes.split(',').map(s => s.trim()),
        estimatedWeight: Number(estimatedWeight) || 0,
        pickupDate: preferredDate,
        pickupTime: preferredTime,
        instructions,
        isOrganisationRequest: true
      };

      const res = await fetch(`${API_BASE_URL}/api/waste-requests/organisation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      // Read text first to avoid double-reading the body stream
      const text = await res.text();
      let data: { success?: boolean; message?: string } | null = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          // not JSON — keep raw text for message
          console.error('Non-JSON response from organisation endpoint:', text);
          data = { success: false, message: text };
        }
      } else {
        data = { success: false, message: `Empty response (status ${res.status})` };
      }

      if (res.ok && data && data.success) {
        setMessage('Request submitted successfully. We will contact you soon.');
        setTimeout(() => navigate('/dashboard'), 1500);
      } else {
        setMessage((data && data.message) || `Request failed (status ${res.status})`);
      }
    } catch (err) {
      setMessage(getErrorMessage(err, 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="organisation-page">
      <div className="page-header">
        <h1>Organisation Collection Request</h1>
        <p>Schools, companies or other organisations can request a dedicated recyclable waste collection.</p>
      </div>

      <form className="org-form" onSubmit={handleSubmit}>
        <label htmlFor="org-organisation-name">Organisation Name</label>
        <input id="org-organisation-name" value={organisationName} onChange={(e) => setOrganisationName(e.target.value)} required />

        <label htmlFor="org-type">Type</label>
        <select id="org-type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="school">School</option>
          <option value="company">Company</option>
          <option value="ngo">NGO</option>
          <option value="other">Other</option>
        </select>

        <label htmlFor="org-contact-person">Contact Person</label>
        <input id="org-contact-person" value={contactName} onChange={(e) => setContactName(e.target.value)} required />

        <label htmlFor="org-contact-email">Contact Email</label>
        <input id="org-contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label htmlFor="org-contact-phone">Contact Phone</label>
        <input id="org-contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />

        <label htmlFor="org-pickup-address">Pickup Address</label>
        <input id="org-pickup-address" value={address} onChange={(e) => setAddress(e.target.value)} required />

        <label htmlFor="org-waste-types-comma-separated">Waste Types (comma separated)</label>
        <input id="org-waste-types-comma-separated" value={wasteTypes} onChange={(e) => setWasteTypes(e.target.value)} placeholder="plastic, paper, metal" />

        <label htmlFor="org-estimated-weight-kg">Estimated Weight (kg)</label>
        <input id="org-estimated-weight-kg" type="number" value={estimatedWeight} onChange={(e) => setEstimatedWeight(e.target.value)} />

        <label htmlFor="org-preferred-date">Preferred Date</label>
        <input id="org-preferred-date" type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />

        <label htmlFor="org-preferred-time">Preferred Time</label>
        <input id="org-preferred-time" type="time" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} />

        <label htmlFor="org-special-instructions">Special Instructions</label>
        <textarea id="org-special-instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} />

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Submit Request'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/dashboard')}>Cancel</button>
        </div>

        {message && <div className="form-message">{message}</div>}
      </form>
    </div>
  );
};

export default Organisation;
