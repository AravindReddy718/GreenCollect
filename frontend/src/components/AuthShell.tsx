import type { ReactNode } from 'react';
import { FaRecycle, FaLeaf, FaUsers } from 'react-icons/fa';
import '../pages/Login.css';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

// Shared layout for the forgot-password and reset-password pages (same look as the login page)
const AuthShell = ({ title, subtitle, children }: AuthShellProps) => (
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
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  </div>
);

export default AuthShell;
