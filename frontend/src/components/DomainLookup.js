import React, { useState } from 'react';
import axios from 'axios';

export default function DomainLookup() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const lookup = async () => {
    if (!domain.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const { data } = await axios.post('/api/domain', { domain });
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
        <h2 style={s.title}>🌐 חיפוש דומיין / WHOIS</h2>
        <p style={s.desc}>מידע WHOIS מלא + רשומות DNS</p>
        <div style={s.row}>
          <input
            style={s.input}
            placeholder="example.com"
            value={domain}
            onChange={e => setDomain(e.target.value)}
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
        <div style={s.grid}>
          {result.whois && !result.whois.error && (
            <div style={s.section}>
              <h3 style={s.sectionTitle}>📋 WHOIS</h3>
              <table style={s.table}>
                <tbody>
                  {[
                    ['רשם', result.whois.registrar],
                    ['ארגון', result.whois.org],
                    ['מדינה', result.whois.country],
                    ['תאריך רישום', result.whois.creation_date],
                    ['תפוגה', result.whois.expiration_date],
                    ['עדכון אחרון', result.whois.updated_date],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <tr key={k}>
                      <td style={s.tdLabel}>{k}</td>
                      <td style={s.tdValue}>{String(v).split('T')[0]}</td>
                    </tr>
                  ))}
                  {result.whois.emails?.length > 0 && (
                    <tr>
                      <td style={s.tdLabel}>אימיילים</td>
                      <td style={s.tdValue}>{result.whois.emails.join(', ')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {result.whois.name_servers?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={s.subTitle}>Name Servers</div>
                  {result.whois.name_servers.map(ns => (
                    <div key={ns} style={s.nsItem}>{ns}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={s.section}>
            <h3 style={s.sectionTitle}>🔗 רשומות DNS</h3>
            {Object.entries(result.dns || {}).map(([type, records]) => (
              records.length > 0 && (
                <div key={type} style={{ marginBottom: 14 }}>
                  <div style={s.dnsType}>{type}</div>
                  {records.map(r => (
                    <div key={r} style={s.dnsRecord}>{r}</div>
                  ))}
                </div>
              )
            ))}
          </div>
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
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  section: { background: '#111827', border: '1px solid #1e3a5f', borderRadius: 12, padding: 20 },
  sectionTitle: { color: '#4fc3f7', fontSize: 16, fontWeight: 700, marginBottom: 16 },
  table: { width: '100%', borderCollapse: 'collapse' },
  tdLabel: { color: '#607d8b', fontSize: 13, padding: '6px 0', width: '40%', verticalAlign: 'top' },
  tdValue: { color: '#e0e6f0', fontSize: 13, padding: '6px 0', direction: 'ltr', wordBreak: 'break-all' },
  subTitle: { color: '#4fc3f7', fontSize: 13, fontWeight: 600, marginBottom: 8 },
  nsItem: { color: '#a0b0c0', fontSize: 13, padding: '4px 0', direction: 'ltr' },
  dnsType: { color: '#ffb300', fontSize: 13, fontWeight: 700, marginBottom: 6 },
  dnsRecord: { color: '#a0b0c0', fontSize: 13, padding: '3px 8px', background: '#0a0e1a', borderRadius: 4, marginBottom: 4, direction: 'ltr', fontFamily: 'monospace' },
};
