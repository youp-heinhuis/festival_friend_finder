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

const STORAGE_KEY = "rabbit-finder-final-v2";
const LOCAL_MEMBER_ID_KEY = "rabbit-finder-local-member-id";
const LOCAL_MAP_IMAGE_KEY = "rabbit-finder-local-map-image";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const PIN_TTL_HOURS = 2;

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
    id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    localStorage.setItem(LOCAL_MEMBER_ID_KEY, id);
  }

  return id;
}

function getInitialGroupCode() {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("group");
  const fromPath = url.pathname.match(/\/g\/([^/]+)/)?.[1];
  const fromStorage = localStorage.getItem("rabbit-finder-group");

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

  const [localMemberId] = useState(getLocalMemberId);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [groupInfo, setGroupInfo] = useState(null);

  const [groupCode, setGroupCode] = useState(getInitialGroupCode);
  const [joinName, setJoinName] = useState(
    () => localStorage.getItem("rabbit-finder-name") || "Youp"
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

  const shareLink = useMemo(
    () => `${window.location.origin}?group=${groupCode}`,
    [groupCode]
  );

  const zoomPercentage = Math.round(zoom * 100);

  useEffect(() => {
    localStorage.setItem("rabbit-finder-name", joinName);
  }, [joinName]);

  useEffect(() => {
    localStorage.setItem("rabbit-finder-group", groupCode);
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
    if (!hasSupabaseConfig || !currentUserId || !groupCode) {
      loadPins();
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

    await supabase
      .from("groups")
      .upsert(
        {
          code: groupCode,
          owner_id: groupInfo?.owner_id || currentUserId,
        },
        { onConflict: "code" }
      );

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

  const handleMapPointerDown = (event) => {
    if (event.target.closest?.("button")) return;

    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
    };
  };

  const handleMapPointerUp = (event) => {
    if (event.target.closest?.("button")) return;

    const start = pointerStartRef.current;
    if (!start) return;

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    const duration = Date.now() - start.time;

    pointerStartRef.current = null;

    if (distance > 10 || duration > 800) return;

    placePinFromPointer(event);
  };

  const deleteOwnPin = async () => {
    if (!hasSupabaseConfig) {
