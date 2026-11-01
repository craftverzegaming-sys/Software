import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  Fingerprint,
  Globe2,
  IndianRupee,
  LockKeyhole,
  LogOut,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  Zap,
} from 'lucide-react';

const initialConfig = { merchantName: 'CRAFTVERZE PAY', upiId: '', qrImageUrl: null };

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

function money(value, digits = 2) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function dateLabel(value) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function StatusPill({ status }) {
  const labels = { verified: 'Verified', pending: 'Pending', failed: 'Failed' };
  return (
    <span className={`status-pill status-${status}`}>
      <span className="status-dot" />
      {labels[status] || status}
    </span>
  );
}

function App() {
  const [page, setPage] = useState('home');
  const [config, setConfig] = useState(initialConfig);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState('qr');
  const [checkout, setCheckout] = useState(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminData, setAdminData] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [settings, setSettings] = useState(initialConfig);
  const [uploading, setUploading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const qrRef = useRef(null);

  useEffect(() => {
    api('/api/public/config')
      .then(setConfig)
      .catch(() => setToast('Payment details are temporarily unavailable.'));
  }, []);

  useEffect(() => {
    if (toast === '') return undefined;
    const timer = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (page !== 'admin' || adminData) return;
    api('/api/admin/overview')
      .then((data) => {
        setAdminData(data);
        setSettings(data.settings);
      })
      .catch(() => {});
  }, [page, adminData]);

  const validAmount = /^\d+(\.\d{0,2})?$/.test(amount) && Number(amount) > 0;
  const canPreparePayment = validAmount && Boolean(config.upiId) && !busy;

  function openPage(nextPage) {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateAmount(value) {
    if (/^\d*(\.\d{0,2})?$/.test(value)) {
      setAmount(value);
      setCheckout(null);
    }
  }

  async function copyUpiId() {
    if (!config.upiId) return;
    try {
      await navigator.clipboard.writeText(config.upiId);
      setToast('UPI ID copied to clipboard.');
    } catch {
      setToast('Could not access the clipboard. Select and copy the UPI ID instead.');
    }
  }

  async function preparePayment(event) {
    event.preventDefault();
    if (!validAmount) {
      setToast('Enter a valid amount to continue.');
      return;
    }
    if (!config.upiId) {
      setToast('Ask the merchant to configure a UPI ID first.');
      return;
    }
    setBusy(true);
    try {
      const data = await api('/api/payments', {
        method: 'POST',
        body: JSON.stringify({ amount, description }),
      });
      setCheckout(data);
      setToast('Payment request created. Its status is still pending.');
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy(false);
    }
  }

  function downloadQr() {
    if (checkout && qrRef.current) {
      const svg = qrRef.current.querySelector('svg');
      if (!svg) return;
      const source = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `craftverze-payment-${checkout.paymentId.slice(0, 8)}.svg`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (config.qrImageUrl) {
      const anchor = document.createElement('a');
      anchor.href = config.qrImageUrl;
      anchor.download = 'craftverze-merchant-qr';
      anchor.click();
    }
  }

  async function refreshPaymentStatus() {
    if (!checkout?.paymentId) return;
    setCheckingPayment(true);
    try {
      const result = await api(`/api/payments/${checkout.paymentId}`);
      setCheckout((current) => ({ ...current, status: result.status }));
      setToast(result.status === 'verified'
        ? 'Payment verified by the provider.'
        : result.status === 'failed'
          ? 'The payment provider reported a failed payment.'
          : 'No provider confirmation yet. This payment is still pending.');
    } catch (error) {
      setToast(error.message);
    } finally {
      setCheckingPayment(false);
    }
  }

  async function signIn(event) {
    event.preventDefault();
    setAdminLoading(true);
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: adminPassword }),
      });
      setAdminPassword('');
      const data = await api('/api/admin/overview');
      setAdminData(data);
      setSettings(data.settings);
      setToast('Signed in to your dashboard.');
    } catch (error) {
      setToast(error.message);
    } finally {
      setAdminLoading(false);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSavingSettings(true);
    try {
      const result = await api('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify({ merchantName: settings.merchantName, upiId: settings.upiId }),
      });
      setSettings(result.settings);
      setConfig(result.settings);
      setAdminData((current) => ({ ...current, settings: result.settings }));
      setCheckout(null);
      setToast('Payment settings saved.');
    } catch (error) {
      setToast(error.message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function uploadQr(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const input = event.currentTarget;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('qr', file);
      const result = await api('/api/admin/qr', { method: 'POST', body: formData });
      setSettings(result.settings);
      setConfig(result.settings);
      setAdminData((current) => ({ ...current, settings: result.settings }));
      setCheckout(null);
      setToast('Merchant QR image updated.');
    } catch (error) {
      setToast(error.message);
    } finally {
      setUploading(false);
      input.value = '';
    }
  }

  async function signOut() {
    await api('/api/admin/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => {});
    setAdminData(null);
    setSettings(config);
    setToast('You have signed out.');
  }

  const verifiedTotal = adminData?.verifiedTotal || 0;

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <button className="brand" type="button" onClick={() => openPage('home')} aria-label="CRAFTVERZE PAY home">
          <span className="brand-mark"><span>C</span><span className="brand-mark-cut" /></span>
          <span className="brand-wordmark">CRAFTVERZE <span>PAY</span></span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={page === 'home' ? 'nav-link active' : 'nav-link'} onClick={() => openPage('home')} type="button">Overview</button>
          <button className={page === 'payment' || page === 'pending' ? 'nav-link active' : 'nav-link'} onClick={() => openPage('payment')} type="button">Make a payment</button>
        </nav>
        <button className="admin-nav" type="button" onClick={() => openPage('admin')}>
          <LockKeyhole size={15} />
          <span>Merchant login</span>
          <ArrowUpRight size={14} className="admin-nav-arrow" />
        </button>
      </header>

      <main className="main-content">
        {page === 'home' && (
          <section className="hero-layout page-enter">
            <div className="hero-copy">
              <div className="eyebrow"><span className="eyebrow-dot" /> YOUR EVERYDAY CHECKOUT, REFINED</div>
              <h1>Payments<br />made <span>simple.</span></h1>
              <p className="hero-description">A faster, more thoughtful way to pay. Send money directly using your favourite UPI app.</p>
              <button className="button button-primary hero-button" type="button" onClick={() => openPage('payment')}>
                <span>Make a payment</span><ArrowRight size={18} />
              </button>
              <div className="hero-trust">
                <span className="trust-icon"><ShieldCheck size={17} /></span>
                <div><strong>Direct UPI payments</strong><span>Pay in your own trusted app</span></div>
              </div>
            </div>
            <div className="hero-visual">
              <div className="visual-topline"><span>CRAFTVERZE CHECKOUT</span><span className="live-dot"><i /> LIVE</span></div>
              <div className="visual-content">
                <div className="visual-orbit orbit-outer" />
                <div className="visual-orbit orbit-inner" />
                <div className="visual-center"><span className="visual-c"><span>C</span></span><Sparkles size={16} className="sparkle" /></div>
                <div className="visual-label label-top"><span className="label-icon"><QrCode size={16} /></span><span><b>Scan & pay</b><small>Instant UPI checkout</small></span></div>
                <div className="visual-label label-bottom"><span className="label-icon label-icon-green"><IndianRupee size={16} /></span><span><b>Direct to merchant</b><small>No wallet. No middleman.</small></span></div>
              </div>
              <div className="visual-footer">
                <span><span className="footer-check"><Check size={11} /></span> Secure UPI intent</span>
                <span>01 <i /> 03</span>
              </div>
            </div>
            <div className="hero-bottom">
              <div className="payment-methods">
                <span className="section-label">PAY WITH YOUR FAVOURITE APP</span>
                <div className="app-list">
                  <span><b className="app-gpay">G</b> Google Pay</span>
                  <span><b className="app-phonepe">पे</b> PhonePe</span>
                  <span><b className="app-paytm">P</b> Paytm</span>
                  <span><b className="app-bhim">BH</b> BHIM UPI</span>
                </div>
              </div>
              <div className="hero-note"><span className="note-line" /> Payments are completed in your UPI app</div>
            </div>
          </section>
        )}

        {page === 'payment' && (
          <section className="checkout-page page-enter">
            <div className="page-heading">
              <button className="back-link" type="button" onClick={() => openPage('home')}><ArrowLeft size={15} /> Overview</button>
              <div className="eyebrow"><span className="eyebrow-dot" /> FAST. DIRECT. YOUR WAY.</div>
              <h1>Make a payment<span className="heading-period">.</span></h1>
              <p>Choose how you’d like to pay with UPI.</p>
            </div>
            <div className="checkout-grid">
              <section className="checkout-form-panel">
                <div className="panel-heading"><div><span className="step-label">01 / PAYMENT DETAILS</span><h2>Enter an amount</h2></div><span className="secure-label"><ShieldCheck size={15} /> UPI protected</span></div>
                <form id="payment-form" onSubmit={preparePayment}>
                  <label className="field-label" htmlFor="amount">Amount</label>
                  <div className="amount-input-wrap"><IndianRupee size={20} /><input id="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(event) => updateAmount(event.target.value)} aria-label="Payment amount in Indian rupees" /><span>INR</span></div>
                  <label className="field-label description-label" htmlFor="description">What’s this for? <span>OPTIONAL</span></label>
                  <input className="text-input" id="description" maxLength={80} placeholder="e.g. Custom order" value={description} onChange={(event) => { setDescription(event.target.value); setCheckout(null); }} />
                  <div className="amount-hint"><CircleHelp size={14} /> Your payment is completed directly in your UPI app.</div>
                  {!config.upiId && <div className="configuration-alert"><CircleHelp size={16} /><span>Merchant UPI details aren’t set yet. <button type="button" onClick={() => openPage('admin')}>Open merchant login</button></span></div>}
                  <div className="method-heading"><span className="step-label">02 / PAYMENT METHOD</span><span>Choose one</span></div>
                  <div className="method-tabs" role="tablist" aria-label="Payment method">
                    <button className={method === 'qr' ? 'method-tab selected' : 'method-tab'} type="button" role="tab" aria-selected={method === 'qr'} onClick={() => setMethod('qr')}><QrCode size={17} /> Scan QR</button>
                    <button className={method === 'upi' ? 'method-tab selected' : 'method-tab'} type="button" role="tab" aria-selected={method === 'upi'} onClick={() => setMethod('upi')}><Fingerprint size={17} /> UPI ID</button>
                  </div>
                  {method === 'upi' && (
                    <div className="upi-copy-row">
                      <div><span>PAYING TO</span><strong>{config.upiId || 'UPI ID not configured'}</strong></div>
                      <button className="icon-button" type="button" onClick={copyUpiId} disabled={!config.upiId} aria-label="Copy UPI ID" title="Copy UPI ID"><Copy size={17} /></button>
                    </div>
                  )}
                  {checkout ? (
                    <a className="button button-primary button-wide app-launch" href={checkout.paymentUri} onClick={() => openPage('pending')}>
                      <ArrowUpRight size={17} /> Open UPI app
                    </a>
                  ) : (
                    <button className="button button-primary button-wide prepare-button" type="submit" disabled={!canPreparePayment}>
                      {busy ? <RefreshCw className="spin" size={17} /> : <Zap size={17} />}
                      {busy ? 'Preparing payment…' : 'Generate payment QR'}
                    </button>
                  )}
                  <div className="powered-by"><span className="powered-dot" /> Your payment is not marked complete until verified</div>
                </form>
              </section>

              <section className="qr-panel">
                <div className="qr-panel-header"><span className="step-label">03 / SCAN TO PAY</span><span className="qr-secure"><LockKeyhole size={13} /> PRIVATE</span></div>
                <div className="qr-display" ref={qrRef}>
                  {checkout?.paymentUri ? (
                    <QRCodeSVG value={checkout.paymentUri} size={224} level="M" marginSize={3} bgColor="#ffffff" fgColor="#09150f" title="Scan to pay with UPI" />
                  ) : config.qrImageUrl ? (
                    <img className="uploaded-qr" src={config.qrImageUrl} alt="Merchant's uploaded UPI QR code" />
                  ) : (
                    <div className="qr-placeholder"><QrCode size={68} strokeWidth={1.2} /><span>YOUR QR WILL APPEAR HERE</span></div>
                  )}
                </div>
                <div className="qr-caption">
                  <span className="qr-caption-icon">{checkout ? <CheckCircle2 size={16} /> : <Banknote size={16} />}</span>
                  <div><strong>{checkout ? 'Ready to scan' : config.qrImageUrl ? 'Merchant UPI QR' : 'Secure UPI checkout'}</strong><span>{checkout ? `${money(Number(amount))} · ${config.merchantName}` : config.qrImageUrl ? 'Scan the static QR, then enter your amount.' : 'Enter an amount to generate your payment QR.'}</span></div>
                </div>
                <div className="qr-actions">
                  {(checkout || config.qrImageUrl) && <button className="download-button" type="button" onClick={downloadQr} aria-label="Download QR code"><ArrowDownToLine size={17} /><span>Download QR</span></button>}
                </div>
                {checkout && <div className="pending-inline"><Clock3 size={14} /> Payment request created · awaiting provider verification</div>}
                <div className="qr-panel-foot"><ShieldCheck size={15} /><span>Never share your UPI PIN or OTP with anyone.</span></div>
              </section>
            </div>
            <div className="checkout-bottom-note"><span className="bottom-note-mark"><LockKeyhole size={15} /></span><span><strong>Payments stay in your app.</strong> CRAFTVERZE PAY never asks for your UPI PIN, OTP or banking password.</span><ChevronDown size={16} className="note-chevron" /></div>
          </section>
        )}

        {page === 'pending' && (
          <section className="pending-page page-enter">
            <button className="back-link" type="button" onClick={() => openPage('payment')}><ArrowLeft size={15} /> Back to payment</button>
            <div className="pending-card">
              <div className="pending-icon"><Clock3 size={30} /></div>
              <span className="step-label">PAYMENT STATUS</span>
              <h1>{checkout?.status === 'verified' ? 'Payment verified.' : checkout?.status === 'failed' ? 'Payment not completed.' : 'Payment pending.'}</h1>
              <p>{checkout?.status === 'verified'
                ? 'A trusted payment provider confirmed this transaction.'
                : checkout?.status === 'failed'
                  ? 'The payment provider reported that this attempt did not complete.'
                  : 'We haven’t received a verified confirmation for this payment yet. Opening a UPI app does not mean your payment succeeded.'}</p>
              <div className="pending-amount"><span>AMOUNT</span><strong>{money(Number(amount || 0))}</strong></div>
              {checkout?.paymentId && <div className="pending-reference"><span>PAYMENT REFERENCE</span><code>{checkout.paymentId}</code></div>}
              {checkout?.status === 'pending' && <StatusPill status="pending" />}
              <div className="pending-actions">
                {checkout?.status === 'pending' && <button className="button button-primary" type="button" onClick={refreshPaymentStatus} disabled={checkingPayment}>{checkingPayment ? <RefreshCw className="spin" size={16} /> : <RefreshCw size={16} />} Refresh status</button>}
                {checkout?.status === 'pending' && <a className="button button-secondary" href={checkout.paymentUri}><ArrowUpRight size={16} /> Open UPI app</a>}
                <button className="text-action" type="button" onClick={() => openPage('payment')}>Return to checkout <ArrowRight size={15} /></button>
              </div>
              <div className="provider-note"><ShieldCheck size={16} /><span>Only a trusted provider confirmation can change this status to verified. This demo is not connected to a payment provider.</span></div>
            </div>
          </section>
        )}

        {page === 'admin' && (
          <section className="admin-page page-enter">
            {!adminData ? (
              <div className="admin-login-layout">
                <div className="admin-login-aside"><span className="login-mark"><LockKeyhole size={23} /></span><span className="step-label">CRAFTVERZE MERCHANT</span><h1>Your business,<br /><span>in focus.</span></h1><p>Manage your UPI details, QR code and payment activity from one quiet place.</p><div className="login-assurance"><ShieldCheck size={16} /> Private server-side sign-in</div></div>
                <form className="login-panel" onSubmit={signIn}>
                  <span className="step-label">MERCHANT ACCESS</span><h2>Welcome back</h2><p>Sign in to your payment dashboard.</p>
                  <label className="field-label" htmlFor="admin-password">Admin password</label>
                  <input className="text-input password-input" id="admin-password" type="password" autoComplete="current-password" placeholder="Enter your password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} required />
                  <button className="button button-primary button-wide" type="submit" disabled={adminLoading}>{adminLoading ? <RefreshCw className="spin" size={17} /> : <LockKeyhole size={16} />}{adminLoading ? 'Signing in…' : 'Sign in securely'}</button>
                  <div className="login-private"><LockKeyhole size={14} /> Credentials stay on your server.</div>
                  <button className="text-action login-back" type="button" onClick={() => openPage('home')}><ArrowLeft size={15} /> Back to payments</button>
                </form>
              </div>
            ) : (
              <div className="admin-dashboard">
                <div className="dashboard-header"><div><span className="eyebrow"><span className="eyebrow-dot" /> MERCHANT WORKSPACE</span><h1>Good to see you<span className="heading-period">.</span></h1><p>Here’s what’s happening with your payments.</p></div><button className="button button-secondary signout-button" type="button" onClick={signOut}><LogOut size={15} /> Sign out</button></div>
                <div className="demo-banner"><span className="demo-banner-icon"><Sparkles size={16} /></span><span><strong>Development data</strong> Sample transactions are marked and are not real payments.</span><span className="demo-chip">DEMO MODE</span></div>
                <div className="metric-grid">
                  <article className="metric-card metric-primary"><div className="metric-top"><span>VERIFIED PAYMENTS</span><span className="metric-icon"><BadgeCheck size={17} /></span></div><strong>{adminData.verifiedCount}</strong><span className="metric-foot"><span className="metric-positive"><Check size={12} /> Provider confirmed</span> · Includes sample records</span></article>
                  <article className="metric-card"><div className="metric-top"><span>VERIFIED TOTAL</span><span className="metric-icon"><IndianRupee size={17} /></span></div><strong>{money(verifiedTotal, 0)}</strong><span className="metric-foot">Verified transactions only</span></article>
                  <article className="metric-card"><div className="metric-top"><span>AWAITING CONFIRMATION</span><span className="metric-icon metric-icon-amber"><Clock3 size={17} /></span></div><strong>{adminData.transactions.filter((transaction) => transaction.status === 'pending').length}</strong><span className="metric-foot">Never treated as successful</span></article>
                </div>
                <div className="dashboard-columns">
                  <section className="dashboard-panel history-panel"><div className="dashboard-panel-heading"><div><span className="step-label">RECENT ACTIVITY</span><h2>Transactions</h2></div><span className="count-chip">{adminData.transactions.length} total</span></div>
                    <div className="table-scroll"><table><thead><tr><th>PAYMENT</th><th>REFERENCE</th><th>STATUS</th><th>AMOUNT</th></tr></thead><tbody>
                      {adminData.transactions.map((transaction) => <tr key={transaction.id}><td><strong>{transaction.customerName}</strong><span>{transaction.description || 'UPI payment'} · {dateLabel(transaction.createdAt)}</span></td><td><code>{transaction.customerReference || transaction.providerReference || transaction.id.slice(0, 12)}</code>{transaction.isMock && <small className="table-demo">SAMPLE</small>}</td><td><StatusPill status={transaction.status} /></td><td className="table-amount">{money(transaction.amount)}</td></tr>)}
                    </tbody></table></div>
                    <div className="history-foot"><ShieldCheck size={14} /> A payment is verified only after provider confirmation.</div>
                  </section>
                  <section className="dashboard-panel settings-panel"><div className="dashboard-panel-heading"><div><span className="step-label">CHECKOUT DETAILS</span><h2>Payment settings</h2></div><span className="settings-state"><span /> LIVE</span></div>
                    <form onSubmit={saveSettings}>
                      <label className="field-label" htmlFor="merchant-name">Business name</label><input className="text-input" id="merchant-name" maxLength={60} value={settings.merchantName} onChange={(event) => setSettings((current) => ({ ...current, merchantName: event.target.value }))} required />
                      <label className="field-label settings-field-label" htmlFor="merchant-upi">UPI ID</label><input className="text-input" id="merchant-upi" placeholder="yourname@bank" value={settings.upiId} onChange={(event) => setSettings((current) => ({ ...current, upiId: event.target.value }))} />
                      <button className="button button-primary settings-save" type="submit" disabled={savingSettings}>{savingSettings ? <RefreshCw className="spin" size={15} /> : <Check size={16} />}{savingSettings ? 'Saving…' : 'Save payment details'}</button>
                    </form>
                    <div className="qr-upload-section"><div className="upload-copy"><span className="field-label">Merchant QR code</span><span>PNG, JPEG or WebP · up to 5 MB</span></div><label className={`upload-button ${uploading ? 'uploading' : ''}`}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadQr} disabled={uploading} /><Upload size={15} />{uploading ? 'Uploading…' : settings.qrImageUrl ? 'Replace QR' : 'Upload QR'}</label>
                    </div>
                    {settings.qrImageUrl && <div className="uploaded-preview"><img src={settings.qrImageUrl} alt="Current merchant QR code" /><span><CheckCircle2 size={14} /> QR active on checkout</span></div>}
                    <div className="settings-security"><LockKeyhole size={14} /> Settings are stored on this server. Configure a payment provider before accepting live payments.</div>
                  </section>
                </div>
                <div className="dashboard-disclaimer"><CircleHelp size={15} /><span>Demo records are for development only. No provider connection, automated settlement or live payment verification is configured.</span></div>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="site-footer"><div className="footer-brand"><span className="footer-monogram">C</span><span>CRAFTVERZE <b>PAY</b></span></div><span className="footer-copy">UPI payments, made thoughtful.</span><span className="footer-meta"><Globe2 size={14} /> Made for India <i /> INR</span></footer>
      {toast && <div className="toast-message" role="status"><CheckCircle2 size={17} />{toast}<button type="button" onClick={() => setToast('')} aria-label="Dismiss message"><X size={15} /></button></div>}
    </div>
  );
}

export default App;
