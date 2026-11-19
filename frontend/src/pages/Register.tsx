import './Register.css';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import api, { getErrorMessage } from '../services/api';
import {
  isValidEmail,
  normalizePhone,
  PHONE_MESSAGE,
  isValidName,
  normalizeName,
  NAME_MESSAGE,
  passwordError,
  normalizeVehicleNumber
} from '../utils/validation';
import { FaUser, FaEnvelope, FaLock, FaPhone, FaMapMarkerAlt, FaTruck, FaIdCard, FaClipboard, FaCheck, FaArrowRight, FaRecycle, FaUsers } from 'react-icons/fa';

type Field = 'name' | 'email' | 'password' | 'phone' | 'address' | 'vehicleType' | 'vehicleNumber' | 'experience';

// Server error field names -> form field names
const SERVER_FIELDS: Record<string, Field> = {
  name: 'name',
  email: 'email',
  password: 'password',
  phone: 'phone',
  address: 'address',
  vehicleType: 'vehicleType',
  vehicleNumberPlate: 'vehicleNumber',
  experience: 'experience'
};

const Register = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user'); // default role

  // Collector specific fields
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [experience, setExperience] = useState('');

  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Errors show for a field once it has been left (blur) or after a submit attempt
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});

  const isCollector = role === 'collector';

  // Same rules the server enforces (see src/utils/validation.ts)
  const fieldErrors: Partial<Record<Field, string>> = {};
  if (!isValidName(name)) fieldErrors.name = name.trim() ? NAME_MESSAGE : 'Please enter your full name';
  if (!isValidEmail(email)) {
    fieldErrors.email = email.trim() ? 'Please enter a valid email address (e.g. name@example.com)' : 'Please enter your email address';
  }
  const invalidPassword = passwordError(password);
  if (invalidPassword) fieldErrors.password = password ? invalidPassword : 'Please create a password';
  if (isCollector) {
    if (!normalizePhone(phone)) fieldErrors.phone = phone.trim() ? PHONE_MESSAGE : 'Please enter your mobile number';
    const trimmedAddress = address.trim();
    if (trimmedAddress.length < 5 || trimmedAddress.length > 200 || !/\p{L}/u.test(trimmedAddress)) {
      fieldErrors.address = trimmedAddress ? 'Address must be 5-200 characters and include letters' : 'Please enter your address';
    }
    if (!vehicleType) fieldErrors.vehicleType = 'Please choose a vehicle type';
    if (!normalizeVehicleNumber(vehicleNumber)) {
      fieldErrors.vehicleNumber = vehicleNumber.trim() ? 'Enter a valid vehicle number, e.g. KA01AB1234' : 'Please enter your vehicle number';
    }
    const trimmedExperience = experience.trim();
    if (trimmedExperience.length < 2 || trimmedExperience.length > 500) {
      fieldErrors.experience = trimmedExperience ? 'Experience must be 2-500 characters' : 'Please describe your experience';
    }
  }

  const errorFor = (field: Field): string | undefined =>
    serverErrors[field] || ((touched[field] || submitAttempted) ? fieldErrors[field] : undefined);

  const markTouched = (field: Field) => () => setTouched(prev => ({ ...prev, [field]: true }));

  const update = (field: Field, setter: (value: string) => void) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setter(e.target.value);
      if (serverErrors[field]) {
        setServerErrors(prev => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    };

  // Props shared by every validated input: id, label link, error styling and screen-reader hooks
  const fieldProps = (field: Field) => ({
    id: `register-${field}`,
    name: field,
    className: `form-input${errorFor(field) ? ' input-invalid' : ''}`,
    'aria-invalid': Boolean(errorFor(field)),
    'aria-describedby': errorFor(field) ? `register-${field}-error` : undefined,
    onBlur: markTouched(field)
  });

  const renderError = (field: Field) =>
    errorFor(field) ? (
      <p id={`register-${field}-error`} className="field-error" role="alert">{errorFor(field)}</p>
    ) : null;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setSubmitAttempted(true);

    const invalidFields = Object.keys(fieldErrors) as Field[];
    if (invalidFields.length > 0) {
      document.getElementById(`register-${invalidFields[0]}`)?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: {
        name: string;
        email: string;
        password: string;
        role: string;
        collectorInfo?: Record<string, string>;
      } = { name: normalizeName(name), email: email.trim(), password, role };

      if (isCollector) {
        payload.collectorInfo = {
          phone: normalizePhone(phone) ?? phone,
          address: address.trim(),
          vehicleType,
          vehicleNumberPlate: normalizeVehicleNumber(vehicleNumber) ?? vehicleNumber,
          experience: experience.trim()
        };
      }

      const res = await api.post('/api/auth/register', payload);

      if (res.status === 201) {
        if (isCollector) {
          alert(`Collector Registration Submitted!\n\nYour application will be reviewed by admin.`);
        } else {
          alert(`User Registration Successful!\n\nWelcome ${normalizeName(name)}! You can now login.`);
        }
        navigate('/login');
      }
    } catch (err) {
      // Show server-side field errors next to the field they belong to
      const serverField = axios.isAxiosError(err) ? (err.response?.data as { field?: string } | undefined)?.field : undefined;
      const field = serverField ? SERVER_FIELDS[serverField] : undefined;
      if (field) {
        setServerErrors({ [field]: getErrorMessage(err) });
        document.getElementById(`register-${field}`)?.focus();
      } else {
        setMessage(getErrorMessage(err, 'Registration failed'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="register-container">
      {/* Background Animation */}
      <div className="register-background">
        <div className="floating-shapes">
          <div className="shape shape-1"></div>
          <div className="shape shape-2"></div>
          <div className="shape shape-3"></div>
        </div>
      </div>

      <div className="register-content">
        {/* Left Side - Brand Section */}
        <div className="register-brand-section">
          <div className="brand-container">
            <div className="brand-icon">
              <FaRecycle className="icon" />
            </div>
            <h1 className="brand-title">Janatha Garage</h1>
            <p className="brand-tagline">the people workshop for sustainable tomorrow</p>
            <p className="brand-subtitle">
              Join our community and be part of the sustainable revolution
            </p>
            <div className="brand-features">
              <div className="feature">
                <FaRecycle className="feature-icon" />
                <span>Smart Waste Management</span>
              </div>
              <div className="feature">
                <FaUsers className="feature-icon" />
                <span>Community Driven</span>
              </div>
              <div className="feature">
                <FaCheck className="feature-icon" />
                <span>Instant Rewards</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Registration Form */}
        <div className="register-form-section">
          <div className="register-form-container">
            <div className="form-header">
              <h2>Join Janatha Garage</h2>
              <p>Create your account and start your sustainable journey</p>
            </div>

            <form onSubmit={handleRegister} className="register-form" noValidate>
              {/* Basic Information for all users */}
              <div className="form-section">
                <h3 className="section-title">
                  <FaUser className="section-icon" />
                  Basic Information
                </h3>
                <div className="form-group">
                  <label className="form-label" htmlFor="register-name">
                    <FaUser className="input-icon" />
                    Full Name
                  </label>
                  <input
                    {...fieldProps('name')}
                    type="text"
                    value={name}
                    onChange={update('name', setName)}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    maxLength={50}
                    required
                  />
                  {renderError('name')}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="register-email">
                    <FaEnvelope className="input-icon" />
                    Email Address
                  </label>
                  <input
                    {...fieldProps('email')}
                    type="email"
                    value={email}
                    onChange={update('email', setEmail)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    inputMode="email"
                    maxLength={254}
                    required
                  />
                  {renderError('email')}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="register-password">
                    <FaLock className="input-icon" />
                    Password
                  </label>
                  <input
                    {...fieldProps('password')}
                    type="password"
                    value={password}
                    onChange={update('password', setPassword)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    maxLength={72}
                    required
                  />
                  {renderError('password') || (
                    <p className="field-hint">8-72 characters, with at least one letter and one number</p>
                  )}
                </div>
              </div>

              {/* Role Selection */}
              <div className="form-section">
                <h3 className="section-title">
                  <FaUsers className="section-icon" />
                  Choose Your Role
                </h3>
                <div className="role-selection">
                  <div className={`role-option ${role === 'user' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      id="user-role"
                      name="role"
                      value="user"
                      checked={role === 'user'}
                      onChange={e => setRole(e.target.value)}
                      className="role-radio"
                    />
                    <label htmlFor="user-role" className="role-label">
                      <div className="role-icon">
                        <FaUser />
                      </div>
                      <div className="role-info">
                        <strong>Community Member</strong>
                        <span>Schedule pickups & earn eco-rewards</span>
                      </div>
                    </label>
                  </div>

                  <div className={`role-option ${role === 'collector' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      id="collector-role"
                      name="role"
                      value="collector"
                      checked={role === 'collector'}
                      onChange={e => setRole(e.target.value)}
                      className="role-radio"
                    />
                    <label htmlFor="collector-role" className="role-label">
                      <div className="role-icon">
                        <FaTruck />
                      </div>
                      <div className="role-info">
                        <strong>Eco Collector</strong>
                        <span>Collect waste & serve the community</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Collector Specific Fields */}
              {isCollector && (
                <div className="form-section collector-fields">
                  <h3 className="section-title">
                    <FaIdCard className="section-icon" />
                    Collector Details
                  </h3>
                  <p className="section-subtitle">
                    Help us serve the community better. Your application will be reviewed by our team.
                  </p>

                  <div className="form-group">
                    <label className="form-label" htmlFor="register-phone">
                      <FaPhone className="input-icon" />
                      Mobile Number
                    </label>
                    <input
                      {...fieldProps('phone')}
                      type="tel"
                      value={phone}
                      onChange={update('phone', setPhone)}
                      placeholder="10-digit mobile, e.g. 9876543210"
                      autoComplete="tel"
                      inputMode="tel"
                      maxLength={16}
                      required
                    />
                    {renderError('phone')}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="register-address">
                      <FaMapMarkerAlt className="input-icon" />
                      Address
                    </label>
                    <textarea
                      {...fieldProps('address')}
                      value={address}
                      onChange={update('address', setAddress)}
                      placeholder="Enter your complete address"
                      autoComplete="street-address"
                      rows={3}
                      maxLength={200}
                      required
                    />
                    {renderError('address')}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="register-vehicleType">
                        <FaTruck className="input-icon" />
                        Vehicle Type
                      </label>
                      <select
                        {...fieldProps('vehicleType')}
                        value={vehicleType}
                        onChange={update('vehicleType', setVehicleType)}
                        required
                      >
                        <option value="">Select Vehicle Type</option>
                        <option value="Three-wheeler">Three-wheeler</option>
                        <option value="Pickup Truck">Pickup Truck</option>
                        <option value="Mini Truck">Mini Truck</option>
                        <option value="Truck">Truck</option>
                        <option value="Other">Other</option>
                      </select>
                      {renderError('vehicleType')}
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="register-vehicleNumber">
                        <FaIdCard className="input-icon" />
                        Vehicle Number
                      </label>
                      <input
                        {...fieldProps('vehicleNumber')}
                        type="text"
                        value={vehicleNumber}
                        onChange={update('vehicleNumber', setVehicleNumber)}
                        placeholder="e.g., KA01AB1234"
                        autoCapitalize="characters"
                        maxLength={13}
                        required
                      />
                      {renderError('vehicleNumber')}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="register-experience">
                      <FaClipboard className="input-icon" />
                      Experience
                    </label>
                    <textarea
                      {...fieldProps('experience')}
                      value={experience}
                      onChange={update('experience', setExperience)}
                      placeholder="Tell us about your experience"
                      rows={3}
                      maxLength={500}
                      required
                    />
                    {renderError('experience')}
                  </div>

                  <div className="collector-notice">
                    <div className="notice-icon">⏳</div>
                    <div className="notice-content">
                      <strong>Verification Required</strong>
                      <p>An admin will review your application. You can sign in as soon as it is approved.</p>
                    </div>
                  </div>
                </div>
              )}

              <button type="submit" className="register-button" disabled={isSubmitting}>
                <span>
                  {isSubmitting ? 'Registering...' : (isCollector ? 'Submit Application' : 'Join Janatha Garage')}
                </span>
                <FaArrowRight className="button-icon" />
              </button>
            </form>

            {message && <p className="error-message" role="alert">{message}</p>}

            <div className="login-link">
              Already part of our community?
              <Link to="/login" className="login-text">
                Sign In
              </Link>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
