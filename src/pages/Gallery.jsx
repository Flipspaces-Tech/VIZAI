// src/pages/Gallery.jsx
import React, { useEffect, useState, useMemo } from "react";

// ====== same Apps Script URL here ======
const GDRIVE_API_URL = "https://script.google.com/macros/s/AKfycbxJ7sU_-iTC08xY46PrZnE3Z3-N5s_Ntqw7IMp_jYvOxYIONmM2CWaLJMKIuobpZTAN/exec";

function useQuery() {
  return useMemo(() => new URLSearchParams(window.location.search), []);
}

export default function Gallery() {
  const q = useQuery();
  const build   = q.get("build")   || "Build";
  const session = q.get("session") || "";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    (async ()=>{
      try {
        const url = `${GDRIVE_API_URL}?build=${encodeURIComponent(build)}${session ? `&session=${encodeURIComponent(session)}`:''}`;
        const res = await fetch(url, { cache: "no-store" }).then(r=>r.json());
        if (res?.ok) {
          const mapped = res.files.map(f => ({
            id: f.id,
            name: f.name,
            // high-res thumbnail:
            thumb: `https://lh3.googleusercontent.com/d/${f.id}=w1200-h800-no`,
            view:  `https://drive.google.com/uc?export=view&id=${f.id}`
          }));
          setItems(mapped);
        } else {
          setItems([]);
        }
      } catch(e){
        console.error(e);
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [build, session]);

  if (loading) return <div style={s.page}>Loading…</div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>{build}</div>
          <div style={s.subtitle}>Session: {session || "latest"}</div>
        </div>
        <a
          href={`https://drive.google.com/drive/search?q=${encodeURIComponent(build)}%20${encodeURIComponent(session)}`}
          target="_blank" rel="noreferrer"
          style={s.driveBtn}
        >
          Open in Drive
        </a>
      </div>

      <div style={s.tabs}>
        <button style={{...s.tab, ...s.tabActive}}>Screenshots</button>
        <button style={s.tab} disabled> Saves </button>
        <button style={s.tab} disabled> Video Walkthrough </button>
      </div>

      <div style={s.sectionTitle}>UnAssigned</div>

      <div style={s.grid}>
        {items.map(img => (
          <a key={img.id} href={img.view} target="_blank" rel="noreferrer" style={s.card} title={img.name}>
            <img src={img.thumb} alt={img.name} style={s.image}/>
          </a>
        ))}
      </div>
    </div>
  );
}

const s = {
  page: { padding: 24, background: '#e9e9e9', minHeight: '100vh', fontFamily: 'Inter, system-ui, Arial, sans-serif' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12 },
  title: { fontSize: 28, fontWeight: 800 },
  subtitle: { fontSize: 16, opacity: .8, marginTop: 4 },
  driveBtn: { background:'#111', color:'#fff', padding:'10px 14px', borderRadius:8, textDecoration:'none', fontWeight:800 },
  tabs: { display:'flex', gap: 8, margin: '12px 0 16px' },
  tab: { padding:'10px 16px', border:'1px solid #bbb', borderRadius:6, background:'#f7f7f7', cursor:'pointer', fontWeight:700 },
  tabActive: { background:'#ffb300', borderColor:'#e19a00' },
  sectionTitle: { fontSize:18, fontWeight:800, margin:'8px 0' },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:16 },
  card: { display:'block', background:'#fff', border:'1px solid #ddd', borderRadius:12, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,.08)' },
  image: { width:'100%', height:200, objectFit:'cover', display:'block' },
};
