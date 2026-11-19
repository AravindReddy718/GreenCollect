import { useEffect, useState } from 'react';
import './SchedulePickup.css';
import { API_BASE_URL, getErrorMessage } from '../services/api';
import { normalizePhone, PHONE_MESSAGE } from '../utils/validation';
import { estimateCoins } from '../utils/coins';
import { FaCalendar, FaTrash, FaMapMarkerAlt, FaCheckCircle, FaTimes, FaCoins, FaSpinner, FaPhone } from 'react-icons/fa';

interface SchedulePickupProps {
  onClose: () => void;
  userId?: string; // Add userId prop
  onPickupScheduled?: () => void | Promise<void>;
}

type Field = 'pickupDate' | 'wasteType' | 'weight' | 'address' | 'contactNumber' | 'specialInstructions';

// Server error field names -> form field names
const SERVER_FIELDS: Record<string, Field> = {
  pickupDate: 'pickupDate',
  wasteType: 'wasteType',
  estimatedWeight: 'weight',
  pickupAddress: 'address',
  contactNumber: 'contactNumber',
  instructions: 'specialInstructions'
};

const MAX_DAYS_AHEAD = 90;

// Local "YYYY-MM-DDTHH:MM" for datetime-local min/max
const localInputValue = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const SchedulePickup: React.FC<SchedulePickupProps> = ({ onClose, userId, onPickupScheduled }) => {
  const [formData, setFormData] = useState<Record<Field, string>>({
    pickupDate: '',
    wasteType: '',
    weight: '',
    address: '',
    specialInstructions: '',
    contactNumber: ''
  });
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  const wasteTypes = [
    { value: 'plastic', label: 'Plastic', color: '#ff9800' },
    { value: 'paper', label: 'Paper', color: '#ffb74d' },
    { value: 'electronics', label: 'Electronics', color: '#ffa726' },
    { value: 'metal', label: 'Metal', color: '#ff9800' },
    { value: 'glass', label: 'Glass', color: '#ffb74d' },
    { value: 'organic', label: 'Organic', color: '#ffa726' }
  ];

  const weightOptions = [
    { value: '1-2', label: '1-2 kg', numericWeight: 1.5 },
    { value: '3-5', label: '3-5 kg', numericWeight: 4 },
    { value: '5-10', label: '5-10 kg', numericWeight: 7.5 },
    { value: '10-20', label: '10-20 kg', numericWeight: 15 },
    { value: '20+', label: '20+ kg', numericWeight: 25 }
  ];

  // Every field is checked here and again on the server
  const fieldErrors: Partial<Record<Field, string>> = {};
  if (!formData.pickupDate) {
    fieldErrors.pickupDate = 'Please choose a pickup date and time';
  } else {
    const when = new Date(formData.pickupDate);
    if (Number.isNaN(when.getTime())) fieldErrors.pickupDate = 'Please choose a valid date and time';
    else if (when.getTime() <= Date.now()) fieldErrors.pickupDate = 'Pickup time must be in the future';
    else if (when.getTime() > Date.now() + MAX_DAYS_AHEAD * 86400000) fieldErrors.pickupDate = `Pickup must be within ${MAX_DAYS_AHEAD} days`;
  }
  if (!formData.wasteType) fieldErrors.wasteType = 'Please choose a waste type';
  if (!formData.weight) fieldErrors.weight = 'Please choose an estimated weight';
  const address = formData.address.trim();
  if (!address) fieldErrors.address = 'Please enter the pickup address';
  else if (address.length < 10 || address.length > 300 || !/\p{L}/u.test(address)) {
    fieldErrors.address = 'Address must be 10-300 characters and include letters (house, street, area)';
  }
  if (!formData.contactNumber.trim()) fieldErrors.contactNumber = 'Please enter a contact number for the collector';
  else if (!normalizePhone(formData.contactNumber)) fieldErrors.contactNumber = PHONE_MESSAGE;
  if (formData.specialInstructions.trim().length > 500) fieldErrors.specialInstructions = 'Instructions must be at most 500 characters';

  const errorFor = (field: Field) =>
    serverErrors[field] || ((touched[field] || submitAttempted) ? fieldErrors[field] : undefined);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const name = e.target.name as Field;
    const { value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (serverErrors[name]) setServerErrors(prev => ({ ...prev, [name]: undefined }));
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const name = e.target.name as Field;
    setTouched(prev => ({ ...prev, [name]: true }));
  };

  // Props shared by every validated field
  const fieldProps = (field: Field) => ({
    id: field,
    name: field,
    value: formData[field],
    onChange: handleChange,
    onBlur: handleBlur,
    disabled: loading,
    className: errorFor(field) ? 'input-invalid' : undefined,
    'aria-invalid': Boolean(errorFor(field)),
    'aria-describedby': errorFor(field) ? `${field}-error` : undefined
  });

  const renderError = (field: Field) =>
    errorFor(field) ? <p id={`${field}-error`} className="field-error" role="alert">{errorFor(field)}</p> : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userId) {
      setError('Please log in to schedule a pickup');
      return;
    }

    setSubmitAttempted(true);
    const invalidFields = Object.keys(fieldErrors) as Field[];
    if (invalidFields.length > 0) {
      document.getElementById(invalidFields[0])?.focus();
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Get numeric weight from selected option
      const weightOption = weightOptions.find(option => option.value === formData.weight);
      const estimatedWeight = weightOption ? weightOption.numericWeight : 0;

      // datetime-local gives local "YYYY-MM-DDTHH:MM"; send those parts as-is so the date never shifts to UTC
      const [datePart, timePart] = formData.pickupDate.split('T');
      const requestData = {
        pickupDate: datePart, // YYYY-MM-DD (local)
        pickupTime: timePart, // HH:MM (local)
        wasteType: formData.wasteType,
        estimatedWeight,
        pickupAddress: address,
        contactNumber: normalizePhone(formData.contactNumber),
        instructions: formData.specialInstructions.trim()
      };

      const token = localStorage.getItem('token') || sessionStorage.getItem('token');

      const response = await fetch(`${API_BASE_URL}/api/waste-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestData)
      });

      const result = await response.json();

      if (!response.ok) {
        // Show server-side field errors next to the field they belong to
        const field = result.field ? SERVER_FIELDS[result.field] : undefined;
        if (field) {
          setServerErrors({ [field]: result.message });
          document.getElementById(field)?.focus();
          return;
        }
        throw new Error(result.message || 'Failed to schedule pickup');
      }

      // Show success message
      alert('✅ Pickup scheduled successfully! Our collector will contact you soon.');

      if (onPickupScheduled) {
        try {
          await onPickupScheduled();
        } catch (e) {
          console.error('Error in onPickupScheduled callback:', e);
        }
      }

      // Close the modal
      onClose();

    } catch (err) {
      setError(getErrorMessage(err, 'Failed to schedule pickup. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  // Estimate uses the same formula the server uses when the pickup is completed
  const selectedWeight = weightOptions.find(option => option.value === formData.weight);
  const estimatedCoins = selectedWeight && formData.wasteType ? estimateCoins(selectedWeight.numericWeight, formData.wasteType) : 0;

  return (
    <div className="schedule-pickup-overlay">
      <div className="schedule-pickup-modal">
        <div className={`schedule-pickup-header ${mounted ? 'animate-in' : ''}`}>
          <div className="header-content">
            <FaCalendar className="header-icon" />
            <div>
              <h2>Schedule Waste Pickup</h2>
              <p>Fill in the details to schedule your collection</p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} disabled={loading} aria-label="Close">
            <FaTimes />
          </button>
        </div>

        <div className="schedule-pickup-content">
          {error && (
            <div className="error-banner" role="alert">
              <FaTimes />
              <span>{error}</span>
              <button onClick={() => setError('')} aria-label="Dismiss">×</button>
            </div>
          )}

          <form onSubmit={handleSubmit} className={`schedule-pickup-form ${mounted ? 'animate-in delay-1' : ''}`} noValidate>
            {/* Pickup Date */}
            <div className="form-group">
              <label htmlFor="pickupDate">
                <FaCalendar className="input-icon" />
                Pickup Date & Time
              </label>
              <input
                {...fieldProps('pickupDate')}
                type="datetime-local"
                required
                min={localInputValue(new Date())}
                max={localInputValue(new Date(Date.now() + MAX_DAYS_AHEAD * 86400000))}
              />
              {renderError('pickupDate')}
            </div>

            {/* Waste Type Dropdown */}
            <div className="form-group">
              <label htmlFor="wasteType">
                <FaTrash className="input-icon" />
                Waste Type
              </label>
              <select {...fieldProps('wasteType')} required>
                <option value="">Select waste type</option>
                {wasteTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              {renderError('wasteType')}
            </div>

            {/* Weight Selection */}
            <div className="form-group">
              <label htmlFor="weight">
                <FaTrash className="input-icon" />
                Estimated Weight
              </label>
              <select {...fieldProps('weight')} required>
                <option value="">Select weight range</option>
                {weightOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                    {formData.wasteType ? ` (+${estimateCoins(option.numericWeight, formData.wasteType)} coins)` : ''}
                  </option>
                ))}
              </select>
              {renderError('weight')}
            </div>

            {/* Address */}
            <div className="form-group">
              <label htmlFor="address">
                <FaMapMarkerAlt className="input-icon" />
                Pickup Address
              </label>
              <input
                {...fieldProps('address')}
                type="text"
                placeholder="House no., street, area, city"
                autoComplete="street-address"
                maxLength={300}
                required
              />
              {renderError('address')}
            </div>

            {/* Contact Number */}
            <div className="form-group">
              <label htmlFor="contactNumber">
                <FaPhone className="input-icon" />
                Contact Number
              </label>
              <input
                {...fieldProps('contactNumber')}
                type="tel"
                placeholder="10-digit mobile, e.g. 9876543210"
                autoComplete="tel"
                inputMode="tel"
                maxLength={16}
                required
              />
              {renderError('contactNumber')}
            </div>

            {/* Special Instructions */}
            <div className="form-group">
              <label htmlFor="specialInstructions">Special Instructions (Optional)</label>
              <textarea
                {...fieldProps('specialInstructions')}
                placeholder="Any special instructions for the collector..."
                rows={3}
                maxLength={500}
              />
              {renderError('specialInstructions')}
            </div>

            {/* Form Actions */}
            <div className="form-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="submit-btn"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <FaSpinner className="btn-icon spinning" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <FaCheckCircle className="btn-icon" />
                    Schedule Pickup
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Estimated Rewards Info */}
          <div className={`rewards-info ${mounted ? 'animate-in delay-2' : ''}`}>
            <div className="rewards-card">
              <div className="rewards-header">
                <FaCoins className="rewards-icon" />
                <h4>Estimated Rewards</h4>
              </div>
              <div className="rewards-details">
                <div className="reward-item">
                  <span className="reward-type">
                    {formData.wasteType ?
                      wasteTypes.find(w => w.value === formData.wasteType)?.label : 'Select waste type'
                    }
                  </span>
                  <span className="reward-coins">
                    {estimatedCoins ? `+${estimatedCoins} coins` : 'Select type and weight'}
                  </span>
                </div>
                <div className="reward-total">
                  <strong>Total Estimated:</strong>
                  <strong className="total-coins">
                    {estimatedCoins} coins
                  </strong>
                </div>
              </div>
              <div className="rewards-note">
                <p>🎉 You'll earn eco-coins that can be redeemed for sustainable products!</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchedulePickup;
