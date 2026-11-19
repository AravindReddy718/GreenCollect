import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { FaLock, FaEye, FaEyeSlash, FaArrowRight } from 'react-icons/fa';
import api, { getErrorMessage } from '../services/api';
import { passwordError } from '../utils/validation';
import AuthShell from '../components/AuthShell';

const TOKEN_FORMAT = /^[a-f0-9]{64}$/;

const ResetPassword = () => {
  // Read the token once, then remove it from the address bar
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<{ password?: boolean; confirm?: boolean }>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState('');
  const [linkInvalid, setLinkInvalid] = useState(!TOKEN_FORMAT.test(token));
  const [serverPasswordError, setServerPasswordError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const errors: { password?: string; confirm?: string } = {};
  const invalidPassword = passwordError(password);
  if (invalidPassword) errors.password = password ? invalidPassword : 'Please choose a new password';
  if (!confirm) errors.confirm = 'Please type the new password again';
  else if (confirm !== password) errors.confirm = 'Passwords do not match';

  const errorFor = (field: 'password' | 'confirm') =>
    (field === 'password' && serverPasswordError) || (touched[field] || submitAttempted ? errors[field] : undefined);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSubmitAttempted(true);
    if (errors.password || errors.confirm) {
      document.getElementById(errors.password ? 'reset-password' : 'reset-confirm')?.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/api/auth/reset-password', { token, password });
      setDone(res.data?.message || 'Your password has been reset. Please log in with your new password.');
    } catch (err) {
      const field = axios.isAxiosError(err) ? (err.response?.data as { field?: string } | undefined)?.field : undefined;
      if (field === 'token') setLinkInvalid(true);
      else if (field === 'password') setServerPasswordError(getErrorMessage(err));
      else setErrorMessage(getErrorMessage(err, 'Could not reset your password. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="You can now sign in with your new password.">
        <div className="form-success" role="status">
          <p>{done}</p>
          <p>For your security, any devices that were signed in have been signed out.</p>
        </div>
        <Link to="/login" className="login-button reset-link-button">
          <span>Go to Sign In</span>
          <FaArrowRight className="button-icon" />
        </Link>
      </AuthShell>
    );
  }

  if (linkInvalid) {
    return (
      <AuthShell title="Link not valid" subtitle="This password reset link is invalid or has expired.">
        <div className="error-message" role="alert">
          Reset links work once and expire after 30 minutes. Please request a new one.
        </div>
        <Link to="/forgot-password" className="login-button reset-link-button">
          <span>Request a new link</span>
          <FaArrowRight className="button-icon" />
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 8 characters with a letter and a number.">
      <form onSubmit={handleSubmit} className="login-form" noValidate>
        <div className="form-group">
          <label htmlFor="reset-password" className="form-label">
            <FaLock className="input-icon" /> New Password
          </label>
          <div className="password-input-container">
            <input
              type={showPassword ? 'text' : 'password'}
              id="reset-password"
              name="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setServerPasswordError(''); }}
              onBlur={() => setTouched(prev => ({ ...prev, password: true }))}
              className={`form-input password-input${errorFor('password') ? ' input-invalid' : ''}`}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              maxLength={72}
              aria-invalid={Boolean(errorFor('password'))}
              aria-describedby={errorFor('password') ? 'reset-password-error' : undefined}
              required
              disabled={loading}
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(!showPassword)}
              disabled={loading}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
          {errorFor('password')
            ? <p id="reset-password-error" className="field-error" role="alert">{errorFor('password')}</p>
            : <p className="field-hint">8-72 characters, with at least one letter and one number</p>}
        </div>

        <div className="form-group">
          <label htmlFor="reset-confirm" className="form-label">
            <FaLock className="input-icon" /> Confirm New Password
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            id="reset-confirm"
            name="confirm"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onBlur={() => setTouched(prev => ({ ...prev, confirm: true }))}
            className={`form-input${errorFor('confirm') ? ' input-invalid' : ''}`}
            placeholder="Type it again"
            autoComplete="new-password"
            maxLength={72}
            aria-invalid={Boolean(errorFor('confirm'))}
            aria-describedby={errorFor('confirm') ? 'reset-confirm-error' : undefined}
            required
            disabled={loading}
          />
          {errorFor('confirm') && <p id="reset-confirm-error" className="field-error" role="alert">{errorFor('confirm')}</p>}
        </div>

        {errorMessage && (
          <div className="error-message" role="alert">
            <strong>Error:</strong> {errorMessage}
          </div>
        )}

        <button type="submit" className="login-button" disabled={loading}>
          <span>{loading ? 'Saving...' : 'Reset password'}</span>
          {!loading && <FaArrowRight className="button-icon" />}
        </button>
      </form>

      <div className="signup-link">
        Remembered your password?
        <Link to="/login" className="signup-text">Back to Sign In</Link>
      </div>
    </AuthShell>
  );
};

export default ResetPassword;
