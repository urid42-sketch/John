import React, { useState } from 'react';
import axios from 'axios';

export default function IPLookup() {
  const [ip, setIp] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const lookup = async () => {
    if (!ip.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const { data } = await axios.post('/api/ip', { ip });
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <h2 style={s.title}>📡 חיפוש IP</h2>
        <p style={s.desc}>גיאולוקציה, ASN, ספק אינטרנט ועוד</p>
        <div style={s.row}>
          <input
            style={s.input}
            placeholder="8.8.8.8"
            value={ip}
            onChange={e => setIp(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookup()}
            dir="ltr"
          />
          <button style={s.btn} onClick={lookup} disabled={loading}>
            {loading ? '⏳...' : '🔍 בדוק'}
          </button>
        </div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {result && (
        <div style={s.resultCard}>
          <div style={s.ipHeader}>
            <span style={s.ipAddr}>{result.ip}</span>
            <span style={s.country}>{result.country_code} {result.country}</span>
          </div>
          <div style={s.infoGrid}>
            {[
              ['🏙️ עיר', result.city],
              ['🗺️ אזור', result.region],
              ['🏢 ספק', result.org],
              ['🔢 ASN', result.asn],
              ['🕐 אזור זמן', result.timezone],
              ['📮 מיקוד', result.postal],
              ['💰 מטבע', result.currency],
              ['📍 קואורדינטות', result.latitude && result.longitude ? `${result.latitude}, ${result.longitude}` : null],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} style={s.infoItem}>
                <div style={s.infoLabel}>{k}</div>
                <div style={s.infoValue}>{v}</div>
              </div>
            ))}
          </div>
          {result.latitude && result.longitude && (
            <a
              href={`https://www.google.com/maps?q=${result.latitude},${result.longitude}`}
              target="_blank"
              rel="noreferrer"
              style={s.mapLink}
            >
              🗺️ הצג במפה
            </a>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 20 },
  card: { background: '#111827', border: '1px solid #1e3a5f', borderRadius: 12, padding: 24 },
  title: { fontSize: 20, fontWeight: 700, color: '#4fc3f7', marginBottom: 6 },
  desc: { color: '#607d8b', fontSize: 13, marginBottom: 16 },
  row: { display: 'flex', gap: 10 },
  input: { flex: 1, background: '#0a0e1a', border: '1px solid #2a5280', borderRadius: 8, padding: '12px 16px', color: '#e0e6f0', fontSize: 15, outline: 'none' },
  btn: { background: '#1565c0', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', cursor: 'pointer', fontSize: 15, fontWeight: 600 },
  error: { background: '#1a0a0a', border: '1px solid #ef5350', borderRadius: 8, padding: 16, color: '#ef9a9a' },
  resultCard: { background: '#111827', border: '1px solid #1e3a5f', borderRadius: 12, padding: 24 },
  ipHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #1e3a5f' },
  ipAddr: { fontSize: 24, fontWeight: 700, color: '#4fc3f7', fontFamily: 'monospace', direction: 'ltr' },
  country: { color: '#a0b0c0', fontSize: 16 },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 },
  infoItem: { background: '#0a0e1a', borderRadius: 8, padding: 14 },
  infoLabel: { color: '#607d8b', fontSize: 12, marginBottom: 4 },
  infoValue: { color: '#e0e6f0', fontSize: 15, fontWeight: 500 },
  mapLink: { display: 'inline-block', marginTop: 16, color: '#4fc3f7', textDecoration: 'none', background: '#0a1525', padding: '10px 20px', borderRadius: 8, border: '1px solid #2a5280' },
};
