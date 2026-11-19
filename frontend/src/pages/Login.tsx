// src/pages/Login.tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../services/api';
import { FaEnvelope, FaLock, FaEye, FaEyeSlash, FaArrowRight, FaRecycle, FaLeaf, FaUsers } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import { isValidEmail } from '../utils/validation';
import './Login.css';

const Login = ({ onLogin }: { onLogin?: () => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Same email rule as sign-up and the server
  const fieldErrors: { email?: string; password?: string } = {};
  if (!isValidEmail(email)) {
    fieldErrors.email = email.trim() ? 'Please enter a valid email address (e.g. name@example.com)' : 'Please enter your email address';
  }
  if (!password) fieldErrors.password = 'Please enter your password';
  const errorFor = (field: 'email' | 'password') => (touched[field] || submitAttempted ? fieldErrors[field] : undefined);
  
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSubmitAttempted(true);
    if (fieldErrors.email || fieldErrors.password) {
      document.getElementById(fieldErrors.email ? 'email' : 'password')?.focus();
      return;
    }
    setLoading(true);

    try {
      
      const res = await api.post('/api/auth/login', {
        email: email.trim(),
        password
      });
      
      
      const { user, token } = res.data;

      if (!user || !token) {
        throw new Error('Invalid response from server');
      }

  // Use the auth context to login
  login(user, token, rememberMe);
      
  // Notify parent (optional) and redirect to dashboard
  if (onLogin) onLogin();
  navigate('/dashboard');
      
    } catch (err) {
      // Shown on the page; no console noise for expected errors such as a wrong password
      setErrorMessage(getErrorMessage(err, 'Login failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => setShowPassword(!showPassword);

  return (
    <div className="login-container">
      <div className="login-background">
        <div className="floating-shapes">
          <div className="shape shape-1"></div>
          <div className="shape shape-2"></div>
          <div className="shape shape-3"></div>
        </div>
      </div>

      <div className="login-content">
        <div className="login-brand-section">
          <div className="brand-container">
            <div className="brand-icon"><FaRecycle className="icon" /></div>
            <h1 className="brand-title">Janatha Garage</h1>
            <p className="brand-tagline">the people workshop for sustainable tomorrow</p>
            <p className="brand-subtitle">
              Transforming waste into resources, building a cleaner future together
            </p>
            <div className="brand-features">
              <div className="feature"><FaRecycle className="feature-icon" /><span>Smart Waste Collection</span></div>
              <div className="feature"><FaLeaf className="feature-icon" /><span>Eco-Rewards System</span></div>
              <div className="feature"><FaUsers className="feature-icon" /><span>Community Driven</span></div>
            </div>
          </div>
        </div>

        <div className="login-form-section">
          <div className="login-form-container">
            <div className="form-header">
              <h2>Welcome Back</h2>
              <p>Sign in to your Janatha Garage account</p>
            </div>

            <form onSubmit={handleLogin} className="login-form" noValidate>
              <div className="form-group">
                <label htmlFor="email" className="form-label">
                  <FaEnvelope className="input-icon" /> Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onBlur={() => setTouched(prev => ({ ...prev, email: true }))}
                  className={`form-input${errorFor('email') ? ' input-invalid' : ''}`}
                  placeholder="name@example.com"
                  autoComplete="email"
                  inputMode="email"
                  maxLength={254}
                  aria-invalid={Boolean(errorFor('email'))}
                  aria-describedby={errorFor('email') ? 'email-error' : undefined}
                  required
                  disabled={loading}
                />
                {errorFor('email') && <p id="email-error" className="field-error" role="alert">{errorFor('email')}</p>}
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  <FaLock className="input-icon" /> Password
                </label>
                <div className="password-input-container">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    name="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onBlur={() => setTouched(prev => ({ ...prev, password: true }))}
                    className={`form-input password-input${errorFor('password') ? ' input-invalid' : ''}`}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    maxLength={72}
                    aria-invalid={Boolean(errorFor('password'))}
                    aria-describedby={errorFor('password') ? 'password-error' : undefined}
                    required
                    disabled={loading}
                  />
                  <button 
                    type="button" 
                    className="password-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'} 
                    onClick={togglePasswordVisibility}
                    disabled={loading}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                {errorFor('password') && <p id="password-error" className="field-error" role="alert">{errorFor('password')}</p>}
              </div>

              <div className="form-options">
                <label className="checkbox-container">
                  <input 
                    type="checkbox" 
                    checked={rememberMe} 
                    onChange={e => setRememberMe(e.target.checked)}
                    disabled={loading}
                  />
                  <span className="checkmark"></span>
                  Remember me
                </label>
                <Link to="/forgot-password" className="forgot-password">
                  Forgot Password?
                </Link>
              </div>

              {errorMessage && (
                <div className="error-message">
                  <strong>Error:</strong> {errorMessage}
                </div>
              )}

              <button 
                type="submit" 
                className="login-button" 
                disabled={loading}
              >
                <span>
                  {loading ? 'Signing In...' : 'Sign In to Janatha Garage'}
                </span>
                {!loading && <FaArrowRight className="button-icon" />}
              </button>
            </form>

            <div className="login-divider">
              <span>New to Janatha Garage?</span>
            </div>
            <div className="signup-link">
              Join our mission for sustainable tomorrow 
              <Link to="/register" className="signup-text">Create Account</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;