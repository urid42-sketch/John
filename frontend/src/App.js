import React, { useState } from 'react';
import UsernameSearch from './components/UsernameSearch';
import BreachCheck from './components/BreachCheck';
import DomainLookup from './components/DomainLookup';
import IPLookup from './components/IPLookup';
import ImageAnalysis from './components/ImageAnalysis';

const TABS = [
  { id: 'username', label: 'חיפוש משתמש', icon: '👤' },
  { id: 'breach', label: 'דליפות מידע', icon: '🔓' },
  { id: 'domain', label: 'דומיין / WHOIS', icon: '🌐' },
  { id: 'ip', label: 'חיפוש IP', icon: '📡' },
  { id: 'image', label: 'ניתוח תמונה', icon: '🖼️' },
];

export default function App() {
  const [tab, setTab] = useState('username');

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>🔍</span>
            <div>
              <div style={styles.logoTitle}>OSINT Platform</div>
              <div style={styles.logoSub}>Intelligence Gathering System</div>
            </div>
          </div>
          <div style={styles.badge}>v1.0</div>
        </div>
      </header>

      <nav style={styles.nav}>
        {TABS.map(t => (
          <button
            key={t.id}
            style={{ ...styles.navBtn, ...(tab === t.id ? styles.navBtnActive : {}) }}
            onClick={() => setTab(t.id)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <main style={styles.main}>
        {tab === 'username' && <UsernameSearch />}
        {tab === 'breach' && <BreachCheck />}
        {tab === 'domain' && <DomainLookup />}
        {tab === 'ip' && <IPLookup />}
        {tab === 'image' && <ImageAnalysis />}
      </main>

      <footer style={styles.footer}>
        OSINT Platform — לשימוש חוקי בלבד | For authorized use only
      </footer>
    </div>
  );
}

const styles = {
  app: { minHeight: '100vh', display: 'flex', flexDirection: 'column', direction: 'rtl' },
  header: { background: 'linear-gradient(135deg, #0d1b2a 0%, #1a2744 100%)', borderBottom: '1px solid #1e3a5f', padding: '16px 24px' },
  headerInner: { maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logo: { display: 'flex', alignItems: 'center', gap: 14 },
  logoIcon: { fontSize: 32 },
  logoTitle: { fontSize: 22, fontWeight: 700, color: '#4fc3f7', letterSpacing: 1 },
  logoSub: { fontSize: 11, color: '#607d8b', letterSpacing: 2, textTransform: 'uppercase' },
  badge: { background: '#1e3a5f', color: '#4fc3f7', padding: '4px 12px', borderRadius: 20, fontSize: 12, border: '1px solid #2a5280' },
  nav: { background: '#0d1b2a', borderBottom: '1px solid #1e3a5f', display: 'flex', gap: 4, padding: '8px 24px', overflowX: 'auto' },
  navBtn: { background: 'transparent', border: '1px solid transparent', color: '#8899aa', padding: '10px 18px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, whiteSpace: 'nowrap', transition: 'all 0.2s' },
  navBtnActive: { background: '#1a2744', border: '1px solid #2a5280', color: '#4fc3f7' },
  main: { flex: 1, padding: '24px', maxWidth: 1100, margin: '0 auto', width: '100%' },
  footer: { background: '#0d1b2a', borderTop: '1px solid #1e3a5f', padding: '12px 24px', textAlign: 'center', fontSize: 12, color: '#456' },
};
