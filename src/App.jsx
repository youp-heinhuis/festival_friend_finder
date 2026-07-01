
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Copy, ImageUp, Link as LinkIcon, MapPin, MessageSquare, Minus, Plus, ShieldCheck, Smartphone, Trash2, Users, X } from 'lucide-react';
import { hasSupabaseConfig, supabase } from './supabaseClient';

const STORAGE_KEY = 'rabbit-finder-final-v1';
const MEMBER_ID_KEY = 'rabbit-finder-member-id';
const MAP_IMAGE_KEY = 'rabbit-finder-map-image';
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const PIN_TTL_HOURS = 2;

const demoPins = [
  { id: 'lotte', member_id: 'lotte', name: 'Lotte', x: 21, y: 35, time: '15:39', message: 'At Rex, front left', colour: 'rose' },
  { id: 'sam', member_id: 'sam', name: 'Sam', x: 75, y: 42, time: '15:34', message: 'Getting food at Eden', colour: 'emerald' },
  { id: 'mila', member_id: 'mila', name: 'Mila', x: 44, y: 73, time: '15:28', message: 'Waiting near Hotot', colour: 'violet' },
];

const landmarkData = [
  ['Entrance', 11, 25, 14, 7, '#e2e8f0', '#334155'],
  ['Rex', 18, 38, 14, 10, '#c7d2fe', '#3730a3'],
  ['Fuzzy Lop', 38, 42, 18, 10, '#ddd6fe', '#5b21b6'],
  ['HOLDING', 57, 38, 15, 8, '#fecaca', '#991b1b'],
  ['Hotot', 39, 70, 22, 12, '#fde68a', '#78350f'],
  ['Teddy Widder', 18, 14, 23, 9, '#fed7aa', '#7c2d12'],
  ['The Bizarre', 61, 57, 21, 11, '#fbcfe8', '#831843'],
  ['Eden', 76, 34, 13, 8, '#d9f99d', '#365314'],
  ['Beach', 68, 78, 20, 9, '#a5f3fc', '#164e63'],
  ['Toilets', 28, 55, 12, 6, '#f1f5f9', '#334155'],
  ['First aid', 60, 72, 12, 6, '#fee2e2', '#b91c1c'],
];

const colourClass = {
  blue: 'pin-blue', rose: 'pin-rose', emerald: 'pin-emerald', violet: 'pin-violet', amber: 'pin-amber', pink: 'pin-pink', cyan: 'pin-cyan'
};
const colourNames = ['blue', 'rose', 'emerald', 'violet', 'amber', 'pink', 'cyan'];

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function makeGroupCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getMemberId() {
  let id = localStorage.getItem(MEMBER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    localStorage.setItem(MEMBER_ID_KEY, id);
  }
  return id;
}

function getInitialGroupCode() {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get('group');
  const fromPath = url.pathname.match(/\/g\/([^/]+)/)?.[1];
  return (fromQuery || fromPath || localStorage.getItem('rabbit-finder-group') || 'DTRH26').toUpperCase();
}

function PlaceholderMap() {
  return (
    <svg viewBox="0 0 100 75" className="placeholder-map" preserveAspectRatio="none">
      <path d="M5 25 C18 12, 34 9, 49 18 C62 26, 80 20, 94 32" stroke="#64748b" strokeWidth="1.2" fill="none" strokeDasharray="2 2" />
      <path d="M12 62 C29 55, 35 48, 49 54 C66 61, 80 54, 91 45" stroke="#38bdf8" strokeWidth="2.2" fill="none" opacity="0.45" />
      <ellipse cx="78" cy="63" rx="17" ry="8" fill="#0891b2" opacity="0.33" />
      <path d="M30 10 L38 30 L31 49 L44 67" stroke="#a3e635" strokeWidth="1.6" fill="none" opacity="0.45" />
      <path d="M18 25 L36 43 L55 42 L75 58" stroke="#f8fafc" strokeWidth="1.4" fill="none" opacity="0.35" />
      {landmarkData.map(([name, x, y, w, h, fill, text]) => (
        <g key={name}>
          <rect x={x} y={y} width={w} height={h} rx="2.5" fill={fill} opacity="0.92" />
          <text x={x + w / 2} y={y + h / 2 + 1.2} textAnchor="middle" fontSize="2.45" fontWeight="700" fill={text}>{name}</text>
        </g>
      ))}
    </svg>
  );
}

function App() {
  const fileInputRef = useRef(null);
  const mapScrollRef = useRef(null);
  const mapContentRef = useRef(null);

  const [memberId] = useState(getMemberId);
  const [groupCode, setGroupCode] = useState(getInitialGroupCode);
  const [joinName, setJoinName] = useState(() => localStorage.getItem('rabbit-finder-name') || 'Youp');
  const [message, setMessage] = useState('');
  const [mapImage, setMapImage] = useState(() => localStorage.getItem(MAP_IMAGE_KEY) || '');
  const [pins, setPins] = useState([]);
  const [selectedPin, setSelectedPin] = useState(null);
  const [copied, setCopied] = useState(false);
  const [autoExpire, setAutoExpire] = useState(true);
  const [helperOpen, setHelperOpen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState(hasSupabaseConfig ? 'Live sync enabled' : 'Local demo mode');

  const shareLink = useMemo(() => `${window.location.origin}?group=${groupCode}`, [groupCode]);
  const zoomPercentage = Math.round(zoom * 100);

  useEffect(() => { localStorage.setItem('rabbit-finder-name', joinName); }, [joinName]);
  useEffect(() => { localStorage.setItem('rabbit-finder-group', groupCode); }, [groupCode]);

  const normalizePin = (pin) => ({
    id: pin.member_id || pin.id,
    member_id: pin.member_id || pin.id,
    name: pin.name,
    x: Number(pin.x),
    y: Number(pin.y),
    time: pin.time || new Date(pin.updated_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    message: pin.message || 'No message',
    colour: pin.colour || 'blue',
  });

  const loadPins = async () => {
    if (!hasSupabaseConfig) {
      const stored = localStorage.getItem(`${STORAGE_KEY}-${groupCode}`);
      setPins(stored ? JSON.parse(stored) : []);
      return;
    }
    const { data, error } = await supabase
      .from('pins')
      .select('*')
      .eq('group_code', groupCode)
      .gt('expires_at', new Date().toISOString())
      .order('updated_at', { ascending: false });
    if (error) {
      setStatus(`Could not load pins: ${error.message}`);
      return;
    }
    setPins((data || []).map(normalizePin));
  };

  useEffect(() => {
    loadPins();
    if (!hasSupabaseConfig) return;
    const channel = supabase
      .channel(`pins-${groupCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pins', filter: `group_code=eq.${groupCode}` }, loadPins)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupCode]);

  const localSavePins = (nextPins) => {
    localStorage.setItem(`${STORAGE_KEY}-${groupCode}`, JSON.stringify(nextPins));
    setPins(nextPins);
  };

  const savePin = async (pin) => {
    if (!hasSupabaseConfig) {
      localSavePins([pin, ...pins.filter((p) => p.member_id !== memberId)]);
      return;
    }
    await supabase.from('groups').upsert({ code: groupCode }, { onConflict: 'code' });
    const expiresAt = new Date(Date.now() + PIN_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('pins').upsert({
      group_code: groupCode,
      member_id: memberId,
      name: pin.name,
      x: pin.x,
      y: pin.y,
      message: pin.message,
      colour: pin.colour,
      updated_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: 'group_code,member_id' });
    if (error) setStatus(`Could not save pin: ${error.message}`);
    else loadPins();
  };

  const placePin = (event) => {
    if (!mapContentRef.current) return;
    const rect = mapContentRef.current.getBoundingClientRect();
    const pin = {
      id: memberId,
      member_id: memberId,
      name: joinName.trim() || 'Me',
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 2, 98),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 2, 98),
      time: nowTime(),
      message: message.trim() || 'No message',
      colour: 'blue',
    };
    savePin(pin);
    setSelectedPin(null);
    setHelperOpen(false);
  };

  const deleteOwnPin = async () => {
    if (!hasSupabaseConfig) {
      localSavePins(pins.filter((pin) => pin.member_id !== memberId));
    } else {
      await supabase.from('pins').delete().eq('group_code', groupCode).eq('member_id', memberId);
      loadPins();
    }
    setSelectedPin(null);
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareLink); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const createGroup = async () => {
    const code = makeGroupCode();
    setGroupCode(code);
    setPins([]);
    setSelectedPin(null);
    setZoom(1);
    if (hasSupabaseConfig) await supabase.from('groups').upsert({ code }, { onConflict: 'code' });
  };

  const addDemoFriend = () => {
    const existingIds = new Set(pins.map((pin) => pin.member_id));
    const nextFriend = demoPins.find((friend) => !existingIds.has(friend.member_id));
    const next = nextFriend || {
      id: `friend-${pins.length + 1}`,
      member_id: `friend-${pins.length + 1}`,
      name: `Friend ${pins.length + 1}`,
      x: 12 + Math.random() * 76,
      y: 18 + Math.random() * 62,
      time: nowTime(),
      message: 'Demo location',
      colour: colourNames[pins.length % colourNames.length],
    };
    const updated = { ...next, time: nowTime() };
    if (!hasSupabaseConfig) localSavePins([...pins, updated]);
    else setPins((current) => [...current, updated]);
  };

  const uploadMapImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result);
      setMapImage(value);
      localStorage.setItem(MAP_IMAGE_KEY, value);
      setZoom(1);
      setHelperOpen(false);
    };
    reader.readAsDataURL(file);
  };

  const removeMapImage = () => {
    setMapImage('');
    localStorage.removeItem(MAP_IMAGE_KEY);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetApp = () => {
    setMessage('');
    setSelectedPin(null);
    setZoom(1);
    setHelperOpen(true);
    if (!hasSupabaseConfig) localSavePins([]);
  };

  const setZoomLevel = (nextZoom) => {
    setZoom(clamp(Number(nextZoom.toFixed(2)), MIN_ZOOM, MAX_ZOOM));
    setSelectedPin(null);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <section className="panel">
          <div className="badge"><Smartphone size={14} /> Phone browser app</div>
          <h1>Rabbit Finder</h1>
          <p className="muted">Drop timed pins on the festival map so your group can find each other quickly.</p>
          <p className="sync-status"><ShieldCheck size={14} /> {status}</p>

          {helperOpen && <div className="help-box"><strong>How to use it</strong><ol><li>Upload the official map image.</li><li>Enter your name and optional message.</li><li>Tap the map to set your pin.</li><li>Tap someone else’s pin to read their message.</li><li>Use zoom to inspect details.</li></ol></div>}

          <label>Name<input value={joinName} onChange={(e) => setJoinName(e.target.value)} /></label>
          <label><span><MessageSquare size={14} /> Optional message</span><input placeholder="e.g. left of Hotot sound desk" value={message} onChange={(e) => setMessage(e.target.value)} /></label>
          <label><span><ImageUp size={14} /> Festival map image</span><input ref={fileInputRef} type="file" accept="image/*" onChange={uploadMapImage} className="file-input" /></label>
          <div className="button-row"><button onClick={createGroup}><Users size={16} />New group</button><button onClick={copyLink}><Copy size={16} />{copied ? 'Copied' : 'Copy link'}</button></div>
          <button className="secondary full" onClick={addDemoFriend}><Plus size={16} />Add demo friend</button>
          <div className="link-box"><div><LinkIcon size={16} />Group link</div><p>{shareLink}</p></div>
          {mapImage && <button className="secondary full" onClick={removeMapImage}>Remove map image</button>}
          <button className="secondary full" onClick={resetApp}>Reset app</button>
        </section>

        <section className="panel">
          <div className="panel-title"><h2>Group members</h2><span>{pins.length} pin{pins.length === 1 ? '' : 's'}</span></div>
          <div className="member-list">{pins.length === 0 ? <p className="empty">No pins yet. Tap the map to add yours.</p> : pins.map((pin) => <button key={pin.member_id} onClick={() => setSelectedPin(pin)} className="member"><span className={`dot ${colourClass[pin.colour] || 'pin-blue'}`} /><span><strong>{pin.name}</strong><small>{pin.message}</small></span><em><Clock size={12} />{pin.time}</em></button>)}</div>
        </section>
      </aside>

      <main className="main">
        <section className="map-card">
          <div className="map-header"><div><h2>Festival map</h2><p>Tap the map to set your pin. Tap a pin to show its message.</p></div><span>Group {groupCode}</span></div>
          <div className="map-scroll" ref={mapScrollRef}>
            <div className="zoom-controls" onClick={(e) => e.stopPropagation()}><button onClick={() => setZoomLevel(zoom - ZOOM_STEP)} disabled={zoom <= MIN_ZOOM}><Minus size={16}/></button><button onClick={() => setZoomLevel(1)}>{Math.round(zoom*100)}%</button><button onClick={() => setZoomLevel(zoom + ZOOM_STEP)} disabled={zoom >= MAX_ZOOM}><Plus size={16}/></button></div>
            <div ref={mapContentRef} className="map-content" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }} onClick={placePin}>
              {mapImage ? <img src={mapImage} alt="Uploaded festival map" className="map-image" /> : <PlaceholderMap />}
              {!mapImage && <div className="map-note">Placeholder map. Upload the real festival map image from the left panel.</div>}
              {pins.map((pin) => <button key={pin.member_id} className="pin" style={{ left: `${pin.x}%`, top: `${pin.y}%` }} onClick={(e) => { e.stopPropagation(); setSelectedPin(pin); }}><span className={colourClass[pin.colour] || 'pin-blue'}><MapPin size={20}/></span><b>{pin.name}</b></button>)}
              {selectedPin && <div className="pin-card" onClick={(e) => e.stopPropagation()}><div className="pin-card-body"><h3><span className={`dot ${colourClass[selectedPin.colour] || 'pin-blue'}`} />{selectedPin.name}</h3><div className="message"><small>Message</small><p>{selectedPin.message || 'No message'}</p></div><p className="time"><Clock size={13}/>Dropped at {selectedPin.time}</p></div><div className="pin-card-actions"><button onClick={() => setSelectedPin(null)}><X size={16}/></button>{selectedPin.member_id === memberId && <button onClick={deleteOwnPin}><Trash2 size={16}/></button>}</div></div>}
            </div>
          </div>
        </section>
        <section className="info-grid"><div><strong>Map first</strong><p>Upload a JPG, PNG or screenshot of the festival map.</p></div><div><strong>No clutter</strong><p>Pin details only appear after tapping a pin.</p></div><div><strong>Privacy focused</strong><p>Only name, pin position, time, group and message are needed.</p></div></section>
      </main>
    </div>
  );
}

export default App;
