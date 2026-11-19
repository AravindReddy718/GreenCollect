import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaEnvelope, FaArrowRight } from 'react-icons/fa';
import api, { getErrorMessage } from '../services/api';
import { isValidEmail } from '../utils/validation';
import AuthShell from '../components/AuthShell';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sentMessage, setSentMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const emailError = isValidEmail(email)
    ? undefined
    : email.trim()
      ? 'Please enter a valid email address (e.g. name@example.com)'
      : 'Please enter your email address';
  const visibleEmailError = touched || submitAttempted ? emailError : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSubmitAttempted(true);
    if (emailError) {
      document.getElementById('forgot-email')?.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/api/auth/forgot-password', { email: email.trim() });
      setSentMessage(res.data?.message || 'If an account exists for that email, a password reset link has been sent.');
    } catch (err) {
      setErrorMessage(getErrorMessage(err, 'Could not send the reset link. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter the email you signed up with and we'll send you a link to reset it."
    >
      {sentMessage ? (
        <div className="form-success" role="status">
          <p>{sentMessage}</p>
          <p>The link is valid for 30 minutes. If you don't see the email, check your spam folder.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="form-group">
            <label htmlFor="forgot-email" className="form-label">
              <FaEnvelope className="input-icon" /> Email Address
            </label>
            <input
              type="email"
              id="forgot-email"
              name="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              className={`form-input${visibleEmailError ? ' input-invalid' : ''}`}
              placeholder="name@example.com"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              aria-invalid={Boolean(visibleEmailError)}
              aria-describedby={visibleEmailError ? 'forgot-email-error' : undefined}
              required
              disabled={loading}
            />
            {visibleEmailError && <p id="forgot-email-error" className="field-error" role="alert">{visibleEmailError}</p>}
          </div>

          {errorMessage && (
            <div className="error-message" role="alert">
              <strong>Error:</strong> {errorMessage}
            </div>
          )}

          <button type="submit" className="login-button" disabled={loading}>
            <span>{loading ? 'Sending link...' : 'Send reset link'}</span>
            {!loading && <FaArrowRight className="button-icon" />}
          </button>
        </form>
      )}

      <div className="signup-link">
        Remembered your password?
        <Link to="/login" className="signup-text">Back to Sign In</Link>
      </div>
    </AuthShell>
  );
};

export default ForgotPassword;
