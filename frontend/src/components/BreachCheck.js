import React, { useState } from 'react';
import axios from 'axios';

export default function BreachCheck() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const check = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const { data } = await axios.post('/api/breach', { email });
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
        <h2 style={s.title}>🔓 בדיקת דליפות מידע</h2>
        <p style={s.desc}>בדיקת אימייל מול מאגרי דליפות מידע ידועים (Have I Been Pwned)</p>
        <div style={s.row}>
          <input
            style={s.input}
            placeholder="הכנס כתובת אימייל..."
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && check()}
            type="email"
            dir="ltr"
          />
          <button style={s.btn} onClick={check} disabled={loading}>
            {loading ? '⏳ בודק...' : '🔍 בדוק'}
          </button>
        </div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {result && (
        <div style={s.result}>
          {result.breached === null && (
            <div style={s.warningBox}>
              <div style={s.warningTitle}>⚠️ נדרש API Key</div>
              <p style={s.warningText}>{result.note}</p>
              <a href={result.hibp_url} target="_blank" rel="noreferrer" style={s.link}>
                בדוק ידנית ב-HaveIBeenPwned →
              </a>
            </div>
          )}

          {result.breached === false && (
            <div style={s.safeBox}>
              <div style={s.safeIcon}>✅</div>
              <div style={s.safeTitle}>לא נמצאו דליפות</div>
              <div style={s.safeDesc}>{result.email} לא נמצא במאגרי דליפות ידועים</div>
            </div>
          )}

          {result.breached === true && (
            <div>
              <div style={s.dangerBox}>
                <div style={s.dangerIcon}>⚠️</div>
                <div>
                  <div style={s.dangerTitle}>נמצאו {result.count} דליפות!</div>
                  <div style={s.dangerDesc}>{result.email} נמצא ב-{result.count} דליפות מידע</div>
                </div>
              </div>
              <div style={s.breachList}>
                {result.breaches.map((b, i) => (
                  <div key={i} style={s.breachCard}>
                    <div style={s.breachHeader}>
                      <span style={s.breachName}>{b.name}</span>
                      <span style={s.breachDate}>{b.date}</span>
                    </div>
                    {b.data_classes?.length > 0 && (
                      <div style={s.dataClasses}>
                        {b.data_classes.map(dc => (
                          <span key={dc} style={s.dataTag}>{dc}</span>
                        ))}
                      </div>
                    )}
                    {b.description && (
                      <p style={s.breachDesc} dangerouslySetInnerHTML={{ __html: b.description }} />
                    )}
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

const s = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 20 },
  card: { background: '#111827', border: '1px solid #1e3a5f', borderRadius: 12, padding: 24 },
  title: { fontSize: 20, fontWeight: 700, color: '#4fc3f7', marginBottom: 6 },
  desc: { color: '#607d8b', fontSize: 13, marginBottom: 16 },
  row: { display: 'flex', gap: 10 },
  input: { flex: 1, background: '#0a0e1a', border: '1px solid #2a5280', borderRadius: 8, padding: '12px 16px', color: '#e0e6f0', fontSize: 15, outline: 'none' },
  btn: { background: '#1565c0', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', cursor: 'pointer', fontSize: 15, fontWeight: 600 },
  error: { background: '#1a0a0a', border: '1px solid #ef5350', borderRadius: 8, padding: 16, color: '#ef9a9a' },
  result: {},
  warningBox: { background: '#1a1500', border: '1px solid #f57f17', borderRadius: 12, padding: 24 },
  warningTitle: { color: '#ffb300', fontSize: 18, fontWeight: 700, marginBottom: 10 },
  warningText: { color: '#a0a0a0', marginBottom: 14 },
  link: { color: '#4fc3f7', textDecoration: 'none', fontSize: 14 },
  safeBox: { background: '#0a1a0a', border: '1px solid #2e7d32', borderRadius: 12, padding: 32, textAlign: 'center' },
  safeIcon: { fontSize: 48, marginBottom: 12 },
  safeTitle: { color: '#4caf50', fontSize: 22, fontWeight: 700, marginBottom: 8 },
  safeDesc: { color: '#607d8b' },
  dangerBox: { background: '#1a0a0a', border: '1px solid #c62828', borderRadius: 12, padding: 24, display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16 },
  dangerIcon: { fontSize: 40 },
  dangerTitle: { color: '#ef5350', fontSize: 20, fontWeight: 700, marginBottom: 4 },
  dangerDesc: { color: '#a0a0a0', fontSize: 14 },
  breachList: { display: 'flex', flexDirection: 'column', gap: 12 },
  breachCard: { background: '#111827', border: '1px solid #2a1515', borderRadius: 10, padding: 16 },
  breachHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: 10 },
  breachName: { color: '#ef9a9a', fontWeight: 700, fontSize: 15 },
  breachDate: { color: '#607d8b', fontSize: 13 },
  dataClasses: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  dataTag: { background: '#2a1515', color: '#ef9a9a', padding: '3px 10px', borderRadius: 12, fontSize: 12, border: '1px solid #4a2020' },
  breachDesc: { color: '#607d8b', fontSize: 13, lineHeight: 1.5 },
};
