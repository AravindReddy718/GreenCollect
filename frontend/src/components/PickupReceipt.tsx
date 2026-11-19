import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaCoins, FaPrint, FaRecycle, FaTimes } from 'react-icons/fa';
import api, { getErrorMessage } from '../services/api';
import './PickupReceipt.css';

interface Receipt {
  receiptNumber: string;
  requestId: string;
  issuedTo: { name: string; email: string };
  pickupAddress: string;
  contactNumber: string;
  wasteType: string;
  estimatedWeight: number;
  pickupDate: string | null;
  pickupTime: string;
  completedAt: string;
  collectorName: string | null;
  coinsEarned: number;
}

interface PickupReceiptProps {
  requestId: string;
  onClose: () => void;
}

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Receipt for a completed pickup, loaded from the server; printable or savable as PDF from the browser
const PickupReceipt = ({ requestId, onClose }: PickupReceiptProps) => {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/api/waste-requests/${requestId}/receipt`)
      .then(res => setReceipt(res.data.receipt))
      .catch(err => setError(getErrorMessage(err, 'Could not load the receipt.')));
  }, [requestId]);

  // Close with the Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows: Array<[string, string]> = receipt ? [
    ['Receipt no.', receipt.receiptNumber],
    ['Issued to', `${receipt.issuedTo.name} (${receipt.issuedTo.email})`],
    ['Waste type', receipt.wasteType.charAt(0).toUpperCase() + receipt.wasteType.slice(1)],
    ['Estimated weight', `${receipt.estimatedWeight} kg`],
    ['Scheduled for', `${receipt.pickupDate ?? ''} ${receipt.pickupTime ?? ''}`.trim()],
    ['Completed on', formatDateTime(receipt.completedAt)],
    ['Collected by', receipt.collectorName || 'Janatha Garage collector'],
    ['Pickup address', receipt.pickupAddress],
    ['Contact number', receipt.contactNumber]
  ] : [];

  // Rendered on <body> so it covers the screen even when opened from an animated (transformed) card
  return createPortal(
    <div className="receipt-overlay" role="dialog" aria-modal="true" aria-labelledby="receipt-title" onClick={onClose}>
      <div className="receipt-modal" onClick={e => e.stopPropagation()}>
        <button className="receipt-close" onClick={onClose} aria-label="Close receipt"><FaTimes /></button>

        <div className="receipt-brand">
          <FaRecycle className="receipt-logo" />
          <div>
            <h2 id="receipt-title">Pickup Receipt</h2>
            <p>Janatha Garage · e-waste collection</p>
          </div>
        </div>

        {!receipt && !error && <p className="receipt-status">Loading receipt...</p>}
        {error && <p className="receipt-status receipt-error" role="alert">{error}</p>}

        {receipt && (
          <>
            <dl className="receipt-details">
              {rows.map(([label, value]) => (
                <div className="receipt-row" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="receipt-total">
              <span>Eco coins earned</span>
              <strong><FaCoins /> {receipt.coinsEarned}</strong>
            </div>
            <p className="receipt-note">Thank you for recycling responsibly.</p>
          </>
        )}

        <div className="receipt-actions">
          {receipt && (
            <button className="receipt-btn receipt-btn-primary" onClick={() => window.print()}>
              <FaPrint /> Print / Save as PDF
            </button>
          )}
          <button className="receipt-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PickupReceipt;
