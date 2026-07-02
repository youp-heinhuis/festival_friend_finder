import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  Copy,
  ImageUp,
  Link as LinkIcon,
  MapPin,
  MessageSquare,
  Minus,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "./supabaseClient";
import "./styles.css";

const STORAGE_KEY = "waar-zijn-mijn-maatjes-v1";
const LOCAL_MEMBER_ID_KEY = "waar-zijn-mijn-maatjes-local-member-id";
const LOCAL_MAP_IMAGE_KEY = "waar-zijn-mijn-maatjes-local-map-image";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const PIN_TTL_HOURS = 2;
const MAX_MAP_SIZE_MB = 5;

const colourClass = {
  blue: "pin-blue",
  rose: "pin-rose",
  emerald: "pin-emerald",
  violet: "pin-violet",
  amber: "pin-amber",
  pink: "pin-pink",
  cyan: "pin-cyan",
};

const colourNames = ["blue", "rose", "emerald", "violet", "amber", "pink", "cyan"];

const demoPins = [
  {
    id: "lotte",
    member_id: "lotte",
    name: "Lotte",
    x: 21,
    y: 35,
    time: "15:39",
    message: "At Rex, front left",
    colour: "rose",
  },
  {
    id: "sam",
    member_id: "sam",
    name: "Sam",
    x: 75,
    y: 42,
    time: "15:34",
    message: "Getting food at Eden",
    colour: "emerald",
  },
  {
    id: "mila",
    member_id: "mila",
    name: "Mila",
    x: 44,
    y: 73,
    time: "15:28",
    message: "Waiting near Hotot",
    colour: "violet",
  },
];

const landmarkData = [
  ["Entrance", 11, 25, 14, 7, "#e2e8f0", "#334155"],
  ["Rex", 18, 38, 14, 10, "#c7d2fe", "#3730a3"],
  ["Fuzzy Lop", 38, 42, 18, 10, "#ddd6fe", "#5b21b6"],
  ["HOLDING", 57, 38, 15, 8, "#fecaca", "#991b1b"],
  ["Hotot", 39, 70, 22, 12, "#fde68a", "#78350f"],
  ["Teddy Widder", 18, 14, 23, 9, "#fed7aa", "#7c2d12"],
  ["The Bizarre", 61, 57, 21, 11, "#fbcfe8", "#831843"],
  ["Eden", 76, 34, 13, 8, "#d9f99d", "#365314"],
  ["Beach", 68, 78, 20, 9, "#a5f3fc", "#164e63"],
  ["Toilets", 28, 55, 12, 6, "#f1f5f9", "#334155"],
  ["First aid", 60, 72, 12, 6, "#fee2e2", "#b91c1c"],
];

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function makeGroupCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getLocalMemberId() {
  let id = localStorage.getItem(LOCAL_MEMBER_ID_KEY);

  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

    localStorage.setItem(LOCAL_MEMBER_ID_KEY, id);
  }

  return id;
}

function getInitialGroupCode() {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("group");
  const fromPath = url.pathname.match(/\/g\/([^/]+)/)?.[1];
  const fromStorage = localStorage.getItem("waar-zijn-mijn-maatjes-group");

  return (fromQuery || fromPath || fromStorage || "DTRH26").toUpperCase();
}

function PlaceholderMap() {
  return (
    <svg viewBox="0 0 100 75" className="placeholder-map" preserveAspectRatio="none">
      <path
        d="M5 25 C18 12, 34 9, 49 18 C62 26, 80 20, 94 32"
        stroke="#64748b"
        strokeWidth="1.2"
        fill="none"
        strokeDasharray="2 2"
      />
      <path
        d="M12 62 C29 55, 35 48, 49 54 C66 61, 80 54, 91 45"
        stroke="#38bdf8"
        strokeWidth="2.2"
        fill="none"
        opacity="0.45"
      />
      <ellipse cx="78" cy="63" rx="17" ry="8" fill="#0891b2" opacity="0.33" />
      <path
        d="M30 10 L38 30 L31 49 L44 67"
        stroke="#a3e635"
        strokeWidth="1.6"
        fill="none"
        opacity="0.45"
      />
      <path
        d="M18 25 L36 43 L55 42 L75 58"
        stroke="#f8fafc"
        strokeWidth="1.4"
        fill="none"
        opacity="0.35"
      />

      {landmarkData.map(([name, x, y, w, h, fill, text]) => (
        <g key={name}>
          <rect x={x} y={y} width={w} height={h} rx="2.5" fill={fill} opacity="0.92" />
          <text
            x={x + w / 2}
            y={y + h / 2 + 1.2}
            textAnchor="middle"
            fontSize="2.45"
            fontWeight="700"
            fill={text}
          >
            {name}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function App() {
  const fileInputRef = useRef(null);
  const mapScrollRef = useRef(null);
  const mapContentRef = useRef(null);
  const pointerStartRef = useRef(null);
  const activePointersRef = useRef(new Map());
  const pinchStartRef = useRef(null);

  const [localMemberId] = useState(getLocalMemberId);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [groupInfo, setGroupInfo] = useState(null);

  const [groupCode, setGroupCode] = useState(getInitialGroupCode);
  const [joinName, setJoinName] = useState(
    () => localStorage.getItem("waar-zijn-mijn-maatjes-name") || "Youp"
  );
  const [message, setMessage] = useState("");
  const [mapImage, setMapImage] = useState(
    () => localStorage.getItem(LOCAL_MAP_IMAGE_KEY) || ""
  );
  const [pins, setPins] = useState([]);
  const [selectedPin, setSelectedPin] = useState(null);
  const [copied, setCopied] = useState(false);
  const [helperOpen, setHelperOpen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState(
    hasSupabaseConfig ? "Connecting to live sync" : "Local demo mode"
  );

  const activeMemberId = currentUserId || localMemberId;

  const isOwner = Boolean(
    hasSupabaseConfig &&
      currentUserId &&
      groupInfo?.owner_id &&
      currentUserId === groupInfo.owner_id
  );

  const canChangeMap = !hasSupabaseConfig || isOwner;

  const canCreateGroup =
    !hasSupabaseConfig || Boolean(currentUserId && (!groupInfo || isOwner));

  const shareLink = useMemo(
    () => `${window.location.origin}?group=${groupCode}`,
    [groupCode]
  );

  useEffect(() => {
    document.title = "Waar zijn mijn maatjes";
  }, []);

  useEffect(() => {
    localStorage.setItem("waar-zijn-mijn-maatjes-name", joinName);
  }, [joinName]);

  useEffect(() => {
    localStorage.setItem("waar-zijn-mijn-maatjes-group", groupCode);
  }, [groupCode]);

  useEffect(() => {
    const initialiseAuth = async () => {
      if (!hasSupabaseConfig) return;

      const { data: sessionData } = await supabase.auth.getSession();
      let session = sessionData?.session;

      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();

        if (error) {
          setStatus(`Auth error: ${error.message}`);
          return;
        }

        session = data.session;
      }

      setCurrentUserId(session?.user?.id || null);
      setStatus("Live sync enabled");
    };

    initialiseAuth();
  }, []);

  const normalizePin = (pin) => ({
    id: pin.member_id || pin.id,
    member_id: pin.member_id || pin.id,
    name: pin.name,
    x: Number(pin.x),
    y: Number(pin.y),
    time:
      pin.time ||
      new Date(pin.updated_at || Date.now()).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    message: pin.message || "No message",
    colour: pin.colour || "blue",
  });

  const loadGroup = async () => {
    if (!hasSupabaseConfig || !currentUserId || !groupCode) return;

    const { data, error } = await supabase
      .from("groups")
      .select("code, owner_id, map_image, map_updated_at, created_at")
      .eq("code", groupCode)
      .maybeSingle();

    if (error) {
      setStatus(`Could not load group: ${error.message}`);
      return;
    }

    if (!data) {
      const { data: created, error: createError } = await supabase
        .from("groups")
        .insert({
          code: groupCode,
          owner_id: currentUserId,
          map_image: null,
          map_updated_at: new Date().toISOString(),
        })
        .select("code, owner_id, map_image, map_updated_at, created_at")
        .single();

      if (createError) {
        setStatus(`Could not create group: ${createError.message}`);
        return;
      }

      setGroupInfo(created);
      setMapImage(created.map_image || "");
      setStatus("Live sync enabled. You are the group owner.");
      return;
    }

    setGroupInfo(data);
    setMapImage(data.map_image || "");

    if (data.owner_id === currentUserId) {
      setStatus("Live sync enabled. You are the group owner.");
    } else {
      setStatus("Live sync enabled. You are a group member.");
    }
  };

  const loadPins = async () => {
    if (!hasSupabaseConfig) {
      const stored = localStorage.getItem(`${STORAGE_KEY}-${groupCode}`);
      setPins(stored ? JSON.parse(stored) : []);
      return;
    }

    const { data, error } = await supabase
      .from("pins")
      .select("*")
      .eq("group_code", groupCode)
      .gt("expires_at", new Date().toISOString())
      .order("updated_at", { ascending: false });

    if (error) {
      setStatus(`Could not load pins: ${error.message}`);
      return;
    }

    setPins((data || []).map(normalizePin));
  };

  useEffect(() => {
    if (!hasSupabaseConfig) {
      loadPins();
      return;
    }

    if (!currentUserId || !groupCode) {
      return;
    }

    loadGroup();
    loadPins();

    const groupChannel = supabase
      .channel(`group-${groupCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "groups",
          filter: `code=eq.${groupCode}`,
        },
        () => {
          loadGroup();
        }
      )
      .subscribe();

    const pinsChannel = supabase
      .channel(`pins-${groupCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pins",
          filter: `group_code=eq.${groupCode}`,
        },
        () => {
          loadPins();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(groupChannel);
      supabase.removeChannel(pinsChannel);
    };
  }, [currentUserId, groupCode]);

  const localSavePins = (nextPins) => {
    localStorage.setItem(`${STORAGE_KEY}-${groupCode}`, JSON.stringify(nextPins));
    setPins(nextPins);
  };

  const savePin = async (pin) => {
    if (!hasSupabaseConfig) {
      localSavePins([
        pin,
        ...pins.filter((existingPin) => existingPin.member_id !== activeMemberId),
      ]);
      return;
    }

    if (!currentUserId) {
      setStatus("Still connecting to Supabase. Try again in a moment.");
      return;
    }

    const expiresAt = new Date(
      Date.now() + PIN_TTL_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { error } = await supabase.from("pins").upsert(
      {
        group_code: groupCode,
        member_id: currentUserId,
        name: pin.name,
        x: pin.x,
        y: pin.y,
        message: pin.message,
        colour: pin.colour,
        updated_at: new Date().toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: "group_code,member_id" }
    );

    if (error) {
      setStatus(`Could not save pin: ${error.message}`);
      return;
    }

    loadPins();
  };

  const placePinFromPointer = (event) => {
    if (!mapContentRef.current) return;

    if (hasSupabaseConfig && !currentUserId) {
      setStatus("Still connecting to Supabase. Try again in a moment.");
      return;
    }

    const rect = mapContentRef.current.getBoundingClientRect();

    const pin = {
      id: activeMemberId,
      member_id: activeMemberId,
      name: joinName.trim() || "Me",
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 2, 98),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 2, 98),
      time: nowTime(),
      message: message.trim() || "No message",
      colour: "blue",
    };

    savePin(pin);
    setSelectedPin(null);
    setHelperOpen(false);
  };

  const getPointerDistance = (first, second) => {
    return Math.hypot(first.x - second.x, first.y - second.y);
  };

  const getActivePointers = () => {
    return Array.from(activePointersRef.current.values());
  };

  const handleMapPointerDown = (event) => {
    if (event.target.closest?.("button")) return;

    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (mapContentRef.current?.setPointerCapture) {
      try {
        mapContentRef.current.setPointerCapture(event.pointerId);
      } catch {
        // Some browsers may not allow pointer capture in every situation.
      }
    }

    const activePointers = getActivePointers();

    if (activePointers.length === 1) {
      pointerStartRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: Date.now(),
        scrollLeft: mapScrollRef.current?.scrollLeft || 0,
        scrollTop: mapScrollRef.current?.scrollTop || 0,
        moved: false,
      };
    }

    if (activePointers.length === 2) {
      const distance = getPointerDistance(activePointers[0], activePointers[1]);

      pinchStartRef.current = {
        distance,
        zoom,
      };

      pointerStartRef.current = null;
      setSelectedPin(null);
    }
  };

  const handleMapPointerMove = (event) => {
    if (!activePointersRef.current.has(event.pointerId)) return;

    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const activePointers = getActivePointers();

    if (activePointers.length === 2 && pinchStartRef.current) {
      event.preventDefault();

      const distance = getPointerDistance(activePointers[0], activePointers[1]);
      const scale = distance / pinchStartRef.current.distance;
      const nextZoom = clamp(pinchStartRef.current.zoom * scale, MIN_ZOOM, MAX_ZOOM);

      setZoom(Number(nextZoom.toFixed(2)));
      return;
    }

    if (activePointers.length === 1 && pointerStartRef.current && zoom > 1) {
      const dx = event.clientX - pointerStartRef.current.x;
      const dy = event.clientY - pointerStartRef.current.y;
      const distance = Math.hypot(dx, dy);

      if (distance > 6) {
        pointerStartRef.current.moved = true;

        if (mapScrollRef.current) {
          mapScrollRef.current.scrollLeft = pointerStartRef.current.scrollLeft - dx;
          mapScrollRef.current.scrollTop = pointerStartRef.current.scrollTop - dy;
        }
      }
    }
  };

  const handleMapPointerUp = (event) => {
    const hadMultiplePointers = activePointersRef.current.size > 1;

    activePointersRef.current.delete(event.pointerId);

    if (hadMultiplePointers) {
      pinchStartRef.current = null;
      pointerStartRef.current = null;
      return;
    }

    if (event.target.closest?.("button")) {
      pointerStartRef.current = null;
      return;
    }

    const start = pointerStartRef.current;
    if (!start) return;

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    const duration = Date.now() - start.time;

    pointerStartRef.current = null;

    if (start.moved || distance > 10 || duration > 800) return;

    placePinFromPointer(event);
  };

  const handleMapPointerCancel = (event) => {
    activePointersRef.current.delete(event.pointerId);
    pointerStartRef.current = null;
    pinchStartRef.current = null;
  };

  const deleteOwnPin = async () => {
    if (!hasSupabaseConfig) {
      localSavePins(pins.filter((pin) => pin.member_id !== activeMemberId));
      setSelectedPin(null);
      return;
    }

    if (!currentUserId) return;

    const { error } = await supabase
      .from("pins")
      .delete()
      .eq("group_code", groupCode)
      .eq("member_id", currentUserId);

    if (error) {
      setStatus(`Could not delete pin: ${error.message}`);
      return;
    }

    setSelectedPin(null);
    loadPins();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
    } catch {
      // Clipboard may be blocked in some browsers.
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const createGroup = async () => {
    const code = makeGroupCode();

    setGroupCode(code);
    setPins([]);
    setSelectedPin(null);
    setHelperOpen(true);
    setZoom(1);
    setMapImage("");

    if (!hasSupabaseConfig || !currentUserId) return;

    const { data, error } = await supabase
      .from("groups")
      .insert({
        code,
        owner_id: currentUserId,
        map_image: null,
        map_updated_at: new Date().toISOString(),
      })
      .select("code, owner_id, map_image, map_updated_at, created_at")
      .single();

    if (error) {
      setStatus(`Could not create group: ${error.message}`);
      return;
    }

    setGroupInfo(data);
    setStatus("Live sync enabled. You are the group owner.");
  };

  const addDemoFriend = () => {
    const existingIds = new Set(pins.map((pin) => pin.member_id));
    const nextFriend = demoPins.find((friend) => !existingIds.has(friend.member_id));

    const next =
      nextFriend || {
        id: `friend-${pins.length + 1}`,
        member_id: `friend-${pins.length + 1}`,
        name: `Friend ${pins.length + 1}`,
        x: 12 + Math.random() * 76,
        y: 18 + Math.random() * 62,
        time: nowTime(),
        message: "Demo location",
        colour: colourNames[pins.length % colourNames.length],
      };

    const updated = { ...next, time: nowTime() };

    if (!hasSupabaseConfig) {
      localSavePins([...pins, updated]);
      return;
    }

    setPins((current) => [...current, updated]);
  };

  const uploadMapImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const maxMapSizeBytes = MAX_MAP_SIZE_MB * 1024 * 1024;

    if (file.size > maxMapSizeBytes) {
      alert(`Please upload a map smaller than ${MAX_MAP_SIZE_MB} MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (!canChangeMap) {
      alert("Only the group owner can change the map.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (!hasSupabaseConfig) {
      const reader = new FileReader();

      reader.onload = () => {
        const value = String(reader.result);
        setMapImage(value);
        localStorage.setItem(LOCAL_MAP_IMAGE_KEY, value);
        setZoom(1);
        setHelperOpen(false);
      };

      reader.readAsDataURL(file);
      return;
    }

    if (!currentUserId) {
      setStatus("Still connecting to Supabase. Try again in a moment.");
      return;
    }

    setStatus("Uploading map...");

    const rawExtension = file.name.split(".").pop() || "webp";
    const safeExtension = rawExtension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "webp";
    const mapPath = `${groupCode}/map-${Date.now()}.${safeExtension}`;

    const { error: uploadError } = await supabase.storage
      .from("group-maps")
      .upload(mapPath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "image/webp",
      });

    if (uploadError) {
      setStatus(`Could not upload map: ${uploadError.message}`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("group-maps")
      .getPublicUrl(mapPath);

    const publicUrl = publicUrlData?.publicUrl;

    if (!publicUrl) {
      setStatus("Could not create public map URL.");
      return;
    }

    const { error: updateError } = await supabase
      .from("groups")
      .update({
        map_image: publicUrl,
        map_updated_at: new Date().toISOString(),
      })
      .eq("code", groupCode);

    if (updateError) {
      setStatus(`Could not update group map: ${updateError.message}`);
      return;
    }

    setMapImage(publicUrl);
    setZoom(1);
    setSelectedPin(null);
    setHelperOpen(false);
    setStatus("Map updated.");
  };

  const removeMapImage = async () => {
    if (!canChangeMap) {
      alert("Only the group owner can remove the map.");
      return;
    }

    if (!hasSupabaseConfig) {
      setMapImage("");
      localStorage.removeItem(LOCAL_MAP_IMAGE_KEY);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const { error } = await supabase
      .from("groups")
      .update({
        map_image: null,
        map_updated_at: new Date().toISOString(),
      })
      .eq("code", groupCode);

    if (error) {
      setStatus(`Could not remove map: ${error.message}`);
      return;
    }

    setMapImage("");
    setSelectedPin(null);
    setZoom(1);

    if (fileInputRef.current) fileInputRef.current.value = "";

    setStatus("Map removed.");
  };

  const resetView = () => {
    setMessage("");
    setSelectedPin(null);
    setZoom(1);
    setHelperOpen(true);

    if (!hasSupabaseConfig) {
      localSavePins([]);
    }

    if (mapScrollRef.current) {
      mapScrollRef.current.scrollTop = 0;
      mapScrollRef.current.scrollLeft = 0;
    }
  };

  const setZoomLevel = (nextZoom) => {
    setZoom(clamp(Number(nextZoom.toFixed(2)), MIN_ZOOM, MAX_ZOOM));
    setSelectedPin(null);
  };

  const selectedPinIsOwnPin = selectedPin?.member_id === activeMemberId;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <section className="panel">
          <div className="badge">
            <Smartphone size={14} /> Phone browser app
          </div>

          <h1>Waar zijn mijn maatjes</h1>
          <p className="muted">
            Drop timed pins on the festival map so your group can find each other quickly.
          </p>

          <p className="sync-status">
            <ShieldCheck size={14} /> {status}
          </p>

          {helperOpen && (
            <div className="help-box">
              <strong>How to use it</strong>
              <ol>
                <li>Create a group. The creator becomes the owner.</li>
                <li>Only the owner can upload or change the map.</li>
                <li>Share the group link with friends.</li>
                <li>Everyone can tap the map to set their own pin.</li>
                <li>Tap a pin to read the message.</li>
              </ol>
            </div>
          )}

          <label>
            Name
            <input value={joinName} onChange={(event) => setJoinName(event.target.value)} />
          </label>

          <label>
            <span>
              <MessageSquare size={14} /> Optional message
            </span>
            <input
              placeholder="e.g. left of Hotot sound desk"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>

          <label>
            <span>
              <ImageUp size={14} /> Festival map image
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={uploadMapImage}
              disabled={!canChangeMap}
              className="file-input"
            />
            <p className="owner-note">
              {hasSupabaseConfig
                ? isOwner
                  ? "You are the group owner. You can change the map."
                  : "Only the group owner can change the map."
                : "Local demo mode. Map changes only apply on this device."}
            </p>
          </label>

          <div className="button-row">
            {canCreateGroup && (
              <button onClick={createGroup}>
                <Users size={16} />
                New group
              </button>
            )}

            <button onClick={copyLink} className={!canCreateGroup ? "full-span" : ""}>
              <Copy size={16} />
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>

          {import.meta.env.DEV && (
            <button className="secondary full" onClick={addDemoFriend}>
              <Plus size={16} />
              Add demo friend
            </button>
          )}

          <div className="link-box">
            <div>
              <LinkIcon size={16} />
              Group link
            </div>
            <p>{shareLink}</p>
          </div>

          {mapImage && canChangeMap && (
            <button className="secondary full" onClick={removeMapImage}>
              Remove map image
            </button>
          )}

          <button className="secondary full" onClick={resetView}>
            Reset view
          </button>
        </section>

        <section className="panel">
          <div className="panel-title">
            <h2>Group members</h2>
            <span>
              {pins.length} pin{pins.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="member-list">
            {pins.length === 0 ? (
              <p className="empty">No pins yet. Tap the map to add yours.</p>
            ) : (
              pins.map((pin) => (
                <button
                  key={pin.member_id}
                  onClick={() => setSelectedPin(pin)}
                  className="member"
                >
                  <span className={`dot ${colourClass[pin.colour] || "pin-blue"}`} />
                  <span>
                    <strong>{pin.name}</strong>
                    <small>{pin.message}</small>
                  </span>
                  <em>
                    <Clock size={12} />
                    {pin.time}
                  </em>
                </button>
              ))
            )}
          </div>
        </section>
      </aside>

      <main className="main">
        <section className="map-card">
          <div className="map-header">
            <div>
              <h2>Festival map</h2>
              <p>Tap the map to set your pin. Tap a pin to show its message.</p>
            </div>
            <span>Group {groupCode}</span>
          </div>

          <div className="map-scroll" ref={mapScrollRef}>
            <div
              className="zoom-controls"
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
            >
              <button
                onClick={() => setZoomLevel(zoom - ZOOM_STEP)}
                disabled={zoom <= MIN_ZOOM}
              >
                <Minus size={16} />
              </button>
              <button onClick={() => setZoomLevel(1)}>{Math.round(zoom * 100)}%</button>
              <button
                onClick={() => setZoomLevel(zoom + ZOOM_STEP)}
                disabled={zoom >= MAX_ZOOM}
              >
                <Plus size={16} />
              </button>
            </div>

            <div
              ref={mapContentRef}
              className="map-content"
              style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
              onPointerDown={handleMapPointerDown}
              onPointerMove={handleMapPointerMove}
              onPointerUp={handleMapPointerUp}
              onPointerCancel={handleMapPointerCancel}
            >
              
              {mapImage ? (
                <img src={mapImage} alt="Uploaded festival map" className="map-image" />
              ) : (
                <PlaceholderMap />
              )}

              {!mapImage && (
                <div className="map-note">
                  No group map has been set yet. The owner can upload the real map.
                </div>
              )}

              {pins.map((pin) => (
                <button
                  key={pin.member_id}
                  className="pin"
                  style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    setSelectedPin(pin);
                  }}
                >
                  <span className={colourClass[pin.colour] || "pin-blue"}>
                    <MapPin size={20} />
                  </span>
                  <b>{pin.name}</b>
                </button>
              ))}

              {selectedPin && (
                <div
                  className="pin-card"
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                >
                  <div className="pin-card-body">
                    <h3>
                      <span className={`dot ${colourClass[selectedPin.colour] || "pin-blue"}`} />
                      {selectedPin.name}
                    </h3>

                    <div className="message">
                      <small>Message</small>
                      <p>{selectedPin.message || "No message"}</p>
                    </div>

                    <p className="time">
                      <Clock size={13} />
                      Dropped at {selectedPin.time}
                    </p>
                  </div>

                  <div className="pin-card-actions">
                    <button onClick={() => setSelectedPin(null)}>
                      <X size={16} />
                    </button>

                    {selectedPinIsOwnPin && (
                      <button onClick={deleteOwnPin}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
