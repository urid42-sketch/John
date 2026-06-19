import React, { useState } from 'react';
import axios from 'axios';

export default function UsernameSearch() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const search = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const { data } = await axios.post('/api/username', { username });
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
        <h2 style={s.title}>👤 חיפוש שם משתמש ברשתות חברתיות</h2>
        <p style={s.desc}>בדיקת קיום שם משתמש ב-{Object.keys({github:1,twitter:1,instagram:1,tiktok:1,reddit:1,pinterest:1,medium:1,devto:1,gitlab:1,steam:1,twitch:1,youtube:1,linkedin:1,snapchat:1,telegram:1}).length}+ פלטפורמות</p>
        <div style={s.row}>
          <input
            style={s.input}
            placeholder="הכנס שם משתמש..."
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            dir="ltr"
          />
          <button style={s.btn} onClick={search} disabled={loading}>
            {loading ? '⏳ מחפש...' : '🔍 חפש'}
          </button>
        </div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {loading && (
        <div style={s.loadingBox}>
          <div style={s.spinner} />
          <span>בודק {15} פלטפורמות... זה עשוי לקחת כ-10 שניות</span>
        </div>
      )}

      {result && (
        <div>
          <div style={s.statsRow}>
            <Stat label="נמצא" value={result.total_found} color="#4caf50" />
            <Stat label="לא נמצא" value={result.not_found?.length} color="#ef5350" />
            <Stat label="סה״כ נבדק" value={(result.found?.length || 0) + (result.not_found?.length || 0)} color="#4fc3f7" />
          </div>

          {result.found?.length > 0 && (
            <div style={s.section}>
              <h3 style={{ ...s.sectionTitle, color: '#4caf50' }}>✅ נמצא ({result.found.length})</h3>
              <div style={s.grid}>
                {result.found.map(r => (
                  <a key={r.platform} href={r.url} target="_blank" rel="noreferrer" style={s.foundCard}>
                    <span style={s.platformName}>{r.platform}</span>
                    <span style={s.foundBadge}>נמצא</span>
                    <span style={s.url}>{r.url}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {result.not_found?.length > 0 && (
            <div style={s.section}>
              <h3 style={{ ...s.sectionTitle, color: '#607d8b' }}>❌ לא נמצא ({result.not_found.length})</h3>
              <div style={s.grid}>
                {result.not_found.map(r => (
                  <div key={r.platform} style={s.notFoundCard}>
                    <span style={s.platformName}>{r.platform}</span>
                    <span style={s.notFoundBadge}>לא נמצא</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ ...s.stat, borderColor: color }}>
      <div style={{ ...s.statNum, color }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
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
  btn: { background: '#1565c0', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', cursor: 'pointer', fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' },
  error: { background: '#1a0a0a', border: '1px solid #ef5350', borderRadius: 8, padding: 16, color: '#ef9a9a' },
  loadingBox: { background: '#111827', border: '1px solid #1e3a5f', borderRadius: 12, padding: 32, display: 'flex', alignItems: 'center', gap: 16, color: '#607d8b' },
  spinner: { width: 24, height: 24, border: '3px solid #1e3a5f', borderTop: '3px solid #4fc3f7', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  statsRow: { display: 'flex', gap: 16, marginBottom: 20 },
  stat: { flex: 1, background: '#111827', border: '1px solid', borderRadius: 10, padding: 16, textAlign: 'center' },
  statNum: { fontSize: 32, fontWeight: 700 },
  statLabel: { color: '#607d8b', fontSize: 13, marginTop: 4 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 600, marginBottom: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 },
  foundCard: { background: '#0a1a0a', border: '1px solid #2e7d32', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s' },
  notFoundCard: { background: '#111827', border: '1px solid #263238', borderRadius: 8, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  platformName: { color: '#e0e6f0', fontWeight: 600, fontSize: 14, textTransform: 'capitalize' },
  url: { color: '#4fc3f7', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  foundBadge: { background: '#1b5e20', color: '#81c784', padding: '2px 8px', borderRadius: 10, fontSize: 11, width: 'fit-content' },
  notFoundBadge: { color: '#546e7a', fontSize: 12 },
};
