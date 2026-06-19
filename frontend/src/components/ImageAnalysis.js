import React, { useState, useRef } from 'react';
import axios from 'axios';

export default function ImageAnalysis() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef();

  const onFile = (f) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const analyze = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await axios.post('/api/image/metadata', form);
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <h2 style={s.title}>🖼️ ניתוח מטא-דאטה של תמונה</h2>
        <p style={s.desc}>חילוץ EXIF data, נתוני GPS, ומידע על מצלמה</p>

        <div
          style={s.dropzone}
          onClick={() => inputRef.current.click()}
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
        >
          {preview ? (
            <img src={preview} alt="preview" style={s.preview} />
          ) : (
            <div style={s.dropText}>
              <div style={{ fontSize: 40 }}>📂</div>
              <div>גרור תמונה לכאן או לחץ לבחירה</div>
              <div style={{ color: '#456', fontSize: 12 }}>JPG, PNG, TIFF, HEIC</div>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => onFile(e.target.files[0])}
          />
        </div>

        {file && (
          <div style={s.fileInfo}>
            <span>{file.name}</span>
            <span style={{ color: '#607d8b' }}>{(file.size / 1024).toFixed(1)} KB</span>
          </div>
        )}

        <button style={s.btn} onClick={analyze} disabled={!file || loading}>
          {loading ? '⏳ מנתח...' : '🔍 נתח תמונה'}
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {result && (
        <div style={s.results}>
          <div style={s.section}>
            <h3 style={s.sectionTitle}>📊 מידע בסיסי</h3>
            <div style={s.infoGrid}>
              {[
                ['שם קובץ', result.filename],
                ['גודל', `${(result.size_bytes / 1024).toFixed(1)} KB`],
                ['פורמט', result.format],
                ['מצב צבע', result.mode],
                ['מימדים', result.dimensions ? `${result.dimensions.width} × ${result.dimensions.height}` : null],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} style={s.infoItem}>
                  <div style={s.infoLabel}>{k}</div>
                  <div style={s.infoValue}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {result.gps && (
            <div style={s.gpsBox}>
              <h3 style={s.sectionTitle}>📍 נתוני GPS — מיקום!</h3>
              <div style={s.gpsData}>
                <div>קו רוחב: <span style={{ color: '#ffb300' }}>{result.gps.latitude}</span></div>
                <div>קו אורך: <span style={{ color: '#ffb300' }}>{result.gps.longitude}</span></div>
              </div>
              <a href={result.gps.maps_url} target="_blank" rel="noreferrer" style={s.mapLink}>
                🗺️ הצג במפה
              </a>
            </div>
          )}

          {result.exif && Object.keys(result.exif).length > 0 && (
            <div style={s.section}>
              <h3 style={s.sectionTitle}>🔧 EXIF Data</h3>
              <div style={s.exifTable}>
                {Object.entries(result.exif)
                  .filter(([k]) => k !== 'GPSInfo' && k !== 'MakerNote' && k !== 'UserComment')
                  .slice(0, 40)
                  .map(([k, v]) => (
                    <div key={k} style={s.exifRow}>
                      <span style={s.exifKey}>{k}</span>
                      <span style={s.exifVal}>{String(v).slice(0, 100)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {(!result.gps && (!result.exif || Object.keys(result.exif).length === 0)) && (
            <div style={s.noExif}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
              <div style={{ color: '#607d8b' }}>לא נמצא EXIF data בתמונה זו</div>
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
  dropzone: { border: '2px dashed #2a5280', borderRadius: 10, padding: 32, cursor: 'pointer', textAlign: 'center', marginBottom: 12, minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  dropText: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#607d8b' },
  preview: { maxHeight: 200, maxWidth: '100%', borderRadius: 8 },
  fileInfo: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#a0b0c0', marginBottom: 12 },
  btn: { background: '#1565c0', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', cursor: 'pointer', fontSize: 15, fontWeight: 600, width: '100%' },
  error: { background: '#1a0a0a', border: '1px solid #ef5350', borderRadius: 8, padding: 16, color: '#ef9a9a' },
  results: { display: 'flex', flexDirection: 'column', gap: 16 },
  section: { background: '#111827', border: '1px solid #1e3a5f', borderRadius: 12, padding: 20 },
  sectionTitle: { color: '#4fc3f7', fontSize: 16, fontWeight: 700, marginBottom: 14 },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 },
  infoItem: { background: '#0a0e1a', borderRadius: 8, padding: 12 },
  infoLabel: { color: '#607d8b', fontSize: 11, marginBottom: 4 },
  infoValue: { color: '#e0e6f0', fontSize: 14, fontWeight: 500 },
  gpsBox: { background: '#0a1500', border: '2px solid #e65100', borderRadius: 12, padding: 20 },
  gpsData: { display: 'flex', gap: 24, fontSize: 15, color: '#a0b0c0', marginBottom: 14 },
  mapLink: { display: 'inline-block', color: '#4fc3f7', textDecoration: 'none', background: '#0a1525', padding: '8px 18px', borderRadius: 8, border: '1px solid #2a5280', fontSize: 14 },
  exifTable: { display: 'flex', flexDirection: 'column', gap: 4 },
  exifRow: { display: 'flex', gap: 16, padding: '6px 0', borderBottom: '1px solid #0d1b2a' },
  exifKey: { color: '#607d8b', fontSize: 12, width: 180, flexShrink: 0 },
  exifVal: { color: '#a0b0c0', fontSize: 12, wordBreak: 'break-all', direction: 'ltr' },
  noExif: { background: '#111827', border: '1px solid #1e3a5f', borderRadius: 12, padding: 32, textAlign: 'center' },
};
