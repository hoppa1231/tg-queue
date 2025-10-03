/*
  Telegram Queue WebApp - React single-file component
  - Designed for Telegram Web Apps (bots -> web_app)
  - Works in demo mode (localStorage) when backend API is unavailable
  - Backend API (if provided via VITE_API_BASE or window.API_BASE):
      GET    /api/queues                -> { queues: [{ id, name, size, avgServiceMinutes, createdAt }] }
      POST   /api/queues                -> { ok:true, queue }
      GET    /api/queues/:queueId      -> { id, name, queue, avgServiceMinutes }
      POST   /api/queues/:queueId/join -> { ok:true, position }
      POST   /api/queues/:queueId/leave
      POST   /api/queues/:queueId/clear
*/

import React, { useEffect, useMemo, useState } from "react";
import {
  Users,
  Clock3,
  PlusCircle,
  LogOut,
  RefreshCw,
  Sparkles,
  Trash2,
  Moon,
  Sun,
} from "lucide-react";

const API_BASE =
  (typeof window !== "undefined" && (window.API_BASE || window.VITE_API_BASE)) ||
  (import.meta?.env?.VITE_API_BASE ?? "");

function useTelegram() {
  const [tg, setTg] = useState(null);
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState({});

  useEffect(() => {
    const w = typeof window !== "undefined" ? window : undefined;
    const webApp = w?.Telegram?.WebApp;
    if (webApp) {
      try {
        webApp.ready();
      } catch (_) {}
      setTg(webApp);
      const u = webApp.initDataUnsafe?.user;
      if (!u) {
        setUser({ id: `guest-${Date.now()}`, name: "Гость", username: null, language_code: "" });
      } else {
        setUser({
          id: u.id,
          name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || `user_${u.id}`,
          username: u.username || null,
          language_code: u.language_code || "",
        });
      }
      setTheme(webApp.themeParams || {});
      try {
        webApp.expand();
      } catch (_) {}
      const setVH = () => {
        const h = webApp.viewportHeight || window.innerHeight;
        document.documentElement.style.setProperty("--tg-viewport-height", `${h}px`);
      };
      setVH();
      const handleTheme = () => setTheme({ ...(webApp.themeParams || {}) });
      webApp.onEvent?.("themeChanged", handleTheme);
      webApp.onEvent?.("viewportChanged", setVH);
      return () => {
        webApp.offEvent?.("themeChanged", handleTheme);
        webApp.offEvent?.("viewportChanged", setVH);
      };
    }
    setUser({ id: "dev-1", name: "Dev User", username: "dev" });
  }, []);

  return { tg, user, theme };
}

function applyTheme(theme) {
  const root = document.documentElement;
  const map = {
    "--tg-bg": theme.bg_color || "#0b1020",
    "--tg-text": theme.text_color || "#e5e7eb",
    "--tg-hint": theme.hint_color || "#9aa4b2",
    "--tg-link": theme.link_color || "#82cfff",
    "--tg-button": theme.button_color || "#0ea5e9",
    "--tg-button-text": theme.button_text_color || "#0b1020",
    "--card": theme.card_color || "rgba(255,255,255,0.05)",
    "--border": theme.border_color || "rgba(255,255,255,0.08)",
    "--row-highlight": theme.row_highlight_color || "rgba(255,255,255,0.05)",
  };
  Object.entries(map).forEach(([key, value]) => root.style.setProperty(key, value));
}

const DEFAULT_AVG_MINUTES = 5;
const MAX_DURATION_SAMPLES = 50;
const DEFAULT_QUEUE_ID = "default";
const DEFAULT_QUEUE_NAME = "Основная очередь";
const storageKey = "twa-queue-demo";

const DARK_THEME_PRESET = {
  bg_color: "#0b1020",
  text_color: "#e5e7eb",
  hint_color: "#9aa4b2",
  link_color: "#82cfff",
  button_color: "#0ea5e9",
  button_text_color: "#0b1020",
  card_color: "rgba(255,255,255,0.05)",
  border_color: "rgba(255,255,255,0.08)",
  row_highlight_color: "rgba(255,255,255,0.05)",
};

const LIGHT_THEME_PRESET = {
  bg_color: "#f9fafb",
  text_color: "#0f172a",
  hint_color: "#4b5563",
  link_color: "#2563eb",
  button_color: "#2563eb",
  button_text_color: "#ffffff",
  card_color: "#ffffff",
  border_color: "rgba(15, 23, 42, 0.08)",
  row_highlight_color: "rgba(37, 99, 235, 0.08)",
};

function computeAverageMinutes(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return DEFAULT_AVG_MINUTES;
  const total = samples.reduce((sum, value) => sum + value, 0);
  const average = total / samples.length;
  if (!Number.isFinite(average)) return DEFAULT_AVG_MINUTES;
  const rounded = Number(average.toFixed(1));
  return Number.isFinite(rounded) ? Math.max(0.1, rounded) : DEFAULT_AVG_MINUTES;
}

function createDemoQueue(id = DEFAULT_QUEUE_ID, name = DEFAULT_QUEUE_NAME) {
  return {
    id,
    name,
    createdAt: Date.now(),
    queue: [],
    durations: [],
    avgServiceMinutes: DEFAULT_AVG_MINUTES,
  };
}

function loadDemoState() {
  if (typeof window === "undefined") {
    const queue = createDemoQueue();
    return { queues: { [queue.id]: queue }, selectedQueueId: queue.id };
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey));
    if (parsed && typeof parsed === "object") {
      const queuesRecord = parsed.queues && typeof parsed.queues === "object" ? { ...parsed.queues } : {};
      if (Object.keys(queuesRecord).length === 0) {
        const queue = createDemoQueue();
        queuesRecord[queue.id] = queue;
      } else {
        Object.entries(queuesRecord).forEach(([key, value]) => {
          queuesRecord[key] = {
            id: value?.id ?? key,
            name: value?.name ?? key,
            createdAt: value?.createdAt ?? Date.now(),
            queue: Array.isArray(value?.queue) ? value.queue : [],
            durations: Array.isArray(value?.durations) ? value.durations : [],
            avgServiceMinutes:
              typeof value?.avgServiceMinutes === "number"
                ? value.avgServiceMinutes
                : computeAverageMinutes(value?.durations || []),
          };
        });
      }
      const fallbackId = Object.keys(queuesRecord)[0];
      const selectedQueueId =
        parsed.selectedQueueId && queuesRecord[parsed.selectedQueueId]
          ? parsed.selectedQueueId
          : fallbackId;
      return { queues: queuesRecord, selectedQueueId };
    }
  } catch (_) {}
  const queue = createDemoQueue();
  return { queues: { [queue.id]: queue }, selectedQueueId: queue.id };
}

function saveDemoState(state) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (_) {}
}

function ensureDemoQueue(state, queueId, queueName) {
  if (!state.queues[queueId]) {
    state.queues[queueId] = createDemoQueue(queueId, queueName || queueId);
  } else if (queueName && !state.queues[queueId].name) {
    state.queues[queueId].name = queueName;
  }
  return state.queues[queueId];
}

function listDemoQueues(state) {
  return Object.values(state.queues).map((queue) => ({
    id: queue.id,
    name: queue.name,
    size: Array.isArray(queue.queue) ? queue.queue.length : 0,
    avgServiceMinutes:
      typeof queue.avgServiceMinutes === "number" ? queue.avgServiceMinutes : DEFAULT_AVG_MINUTES,
    createdAt: queue.createdAt,
  }));
}

function deleteDemoQueue(state, queueId) {
  if (!state.queues[queueId]) return false;
  delete state.queues[queueId];
  if (Object.keys(state.queues).length === 0) {
    const queue = createDemoQueue();
    state.queues[queue.id] = queue;
    state.selectedQueueId = queue.id;
  } else if (state.selectedQueueId === queueId) {
    state.selectedQueueId = Object.keys(state.queues)[0];
  }
  return true;
}

function recordDemoDuration(queueState, durationMinutes) {
  if (!queueState || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return;
  if (!Array.isArray(queueState.durations)) queueState.durations = [];
  queueState.durations.push(durationMinutes);
  if (queueState.durations.length > MAX_DURATION_SAMPLES) {
    queueState.durations = queueState.durations.slice(-MAX_DURATION_SAMPLES);
  }
  queueState.avgServiceMinutes = computeAverageMinutes(queueState.durations);
}

function getDemoUser(user) {
  return user ?? { id: "guest-local", name: "Гость", username: null };
}

function slugifyName(value) {
  const base = (value || "").toString().trim().toLowerCase();
  if (!base) return "";
  return base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function apiRequest(path, opts = {}) {
  const base = API_BASE || "";
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    credentials: "include",
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function secondsToHuman(mins) {
  if (mins <= 0) return "скоро";
  if (mins < 60) return `${Math.ceil(mins)} мин`;
  const hours = Math.floor(mins / 60);
  const rest = Math.ceil(mins % 60);
  return `${hours} ч ${rest} мин`;
}

export default function TelegramQueueWebApp() {
  const { tg, user, theme } = useTelegram();
  const [queue, setQueue] = useState([]);
  const [queueList, setQueueList] = useState([]);
  const [selectedQueueId, setSelectedQueueId] = useState(DEFAULT_QUEUE_ID);
  const [selectedQueueName, setSelectedQueueName] = useState(DEFAULT_QUEUE_NAME);
  const [avgServiceMinutes, setAvgServiceMinutes] = useState(DEFAULT_AVG_MINUTES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isDemo, setIsDemo] = useState(!API_BASE);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creatingQueue, setCreatingQueue] = useState(false);
  const [deletingQueue, setDeletingQueue] = useState(false);
  const [colorMode, setColorMode] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem("twa-color-mode");
        if (stored === "light" || stored === "dark") return stored;
        if (window.matchMedia?.("(prefers-color-scheme: light)")?.matches) return "light";
      } catch (_) {}
    }
    return "dark";
  });

  const themeOverrides = useMemo(
    () => (colorMode === "light" ? LIGHT_THEME_PRESET : DARK_THEME_PRESET),
    [colorMode]
  );
  const effectiveTheme = useMemo(() => ({ ...theme, ...themeOverrides }), [theme, themeOverrides]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("twa-color-mode", colorMode);
      } catch (_) {}
    }
  }, [colorMode]);

  useEffect(() => {
    applyTheme(effectiveTheme);
  }, [effectiveTheme]);

  const toggleColorMode = () => setColorMode((prev) => (prev === "light" ? "dark" : "light"));

  useEffect(() => {
    if (user?.username) {
      const admins = new Set(["maksimkim005", "admin"]);
      setIsAdmin(admins.has(user.username));
    }
  }, [user]);

  const myPosition = useMemo(
    () => queue.findIndex((entry) => String(entry.id) === String(user?.id)) + 1,
    [queue, user]
  );

  const etaMinutes = useMemo(
    () => (myPosition > 0 ? (myPosition - 1) * avgServiceMinutes : 0),
    [myPosition, avgServiceMinutes]
  );

  async function refresh(targetQueueId = selectedQueueId || DEFAULT_QUEUE_ID, options = {}) {
    const { forceDemo = false, initial = false } = options;
    const desiredId = targetQueueId || DEFAULT_QUEUE_ID;
    setError("");
    setLoading(true);

    if (!forceDemo) {
      try {
        const listResponse = await apiRequest("/api/queues");
        const list = Array.isArray(listResponse.queues) ? listResponse.queues : [];
        setQueueList(list);
        let resolvedId = desiredId;
        if (list.length > 0 && !list.some((item) => item.id === resolvedId)) {
          resolvedId = list[0].id;
        }
        const detail = await apiRequest(`/api/queues/${encodeURIComponent(resolvedId)}`);
        setQueue(Array.isArray(detail.queue) ? detail.queue : []);
        setAvgServiceMinutes(
          typeof detail.avgServiceMinutes === "number" ? detail.avgServiceMinutes : DEFAULT_AVG_MINUTES
        );
        setSelectedQueueId(detail.id || resolvedId);
        setSelectedQueueName(detail.name || detail.id || resolvedId);
        setIsDemo(false);
        setLoading(false);
        return;
      } catch (err) {
        console.error("refresh API failed", err);
      }
    }

    try {
      const demoState = loadDemoState();
      const list = listDemoQueues(demoState);
      setQueueList(list);
      let resolvedId = desiredId;
      if (!demoState.queues[resolvedId]) {
        resolvedId =
          (demoState.selectedQueueId && demoState.queues[demoState.selectedQueueId])
            ? demoState.selectedQueueId
            : Object.keys(demoState.queues)[0];
      }
      if (!resolvedId) {
        const fallbackQueue = createDemoQueue();
        demoState.queues[fallbackQueue.id] = fallbackQueue;
        resolvedId = fallbackQueue.id;
      }
      demoState.selectedQueueId = resolvedId;
      saveDemoState(demoState);
      const queueState = demoState.queues[resolvedId];
      setQueue(Array.isArray(queueState.queue) ? queueState.queue : []);
      setAvgServiceMinutes(
        typeof queueState.avgServiceMinutes === "number" ? queueState.avgServiceMinutes : DEFAULT_AVG_MINUTES
      );
      setSelectedQueueId(queueState.id);
      setSelectedQueueName(queueState.name || queueState.id);
      setIsDemo(true);
      if (!initial) {
        setError("Работаем в демо-режиме (нет связи с API). Изменения сохраняются только локально.");
      }
    } catch (err) {
      console.error("refresh demo failed", err);
      setQueue([]);
      setQueueList([]);
      setSelectedQueueId(DEFAULT_QUEUE_ID);
      setSelectedQueueName(DEFAULT_QUEUE_NAME);
      setAvgServiceMinutes(DEFAULT_AVG_MINUTES);
      setError("Не удалось загрузить данные очереди.");
    }

    setLoading(false);
  }

  useEffect(() => {
    refresh(DEFAULT_QUEUE_ID, { initial: true });
  }, []);

  const handleQueueSelectionChange = (event) => {
    const nextId = event.target.value;
    if (!nextId || nextId === selectedQueueId || busy || deletingQueue) return;
    const meta = queueList.find((item) => item.id === nextId);
    setSelectedQueueId(nextId);
    setSelectedQueueName(meta?.name || nextId);
    refresh(nextId);
  };

  async function handleCreateQueue() {
    if (busy || creatingQueue || deletingQueue) return;
    const name = typeof window !== "undefined" ? window.prompt("Введите название очереди") : null;
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreatingQueue(true);
    setError("");
    try {
      const response = await apiRequest("/api/queues", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      const meta = response.queue;
      const newId = meta?.id || slugifyName(trimmed) || `queue-${Date.now().toString(36)}`;
      setSelectedQueueId(newId);
      setSelectedQueueName(meta?.name || trimmed);
      await refresh(newId);
      setIsDemo(false);
    } catch (err) {
      console.error("create queue API failed", err);
      try {
        const demoState = loadDemoState();
        const baseSlug = slugifyName(trimmed) || `queue-${Date.now().toString(36)}`;
        let queueId = baseSlug;
        let attempt = 1;
        while (demoState.queues[queueId]) {
          queueId = `${baseSlug}-${attempt++}`;
        }
        demoState.queues[queueId] = createDemoQueue(queueId, trimmed);
        demoState.selectedQueueId = queueId;
        saveDemoState(demoState);
        setSelectedQueueId(queueId);
        setSelectedQueueName(trimmed);
        setIsDemo(true);
        await refresh(queueId, { forceDemo: true });
      } catch (fallbackErr) {
        console.error("create queue demo failed", fallbackErr);
        setError("Не удалось создать очередь.");
      }
    }
    setCreatingQueue(false);
  }

  async function handleDeleteQueue() {
    if (!selectedQueueId || selectedQueueId === DEFAULT_QUEUE_ID) {
      setError("Основную очередь нельзя удалить.");
      return;
    }
    if (deletingQueue || busy) return;
    const queueLabel = selectedQueueName || selectedQueueId;
    const confirmed = typeof window === "undefined"
      ? false
      : window.confirm(`Delete queue "${queueLabel}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingQueue(true);
    setError("");
    try {
      await apiRequest(`/api/queues/${encodeURIComponent(selectedQueueId)}`, { method: "DELETE" });
      setIsDemo(false);
      await refresh(DEFAULT_QUEUE_ID);
      setDeletingQueue(false);
      return;
    } catch (err) {
      console.error("delete queue API failed", err);
    }

    try {
      const demoState = loadDemoState();
      const removed = deleteDemoQueue(demoState, selectedQueueId);
      if (!removed) {
        setError("Очередь не найдена в локальном хранилище.");
      } else {
        saveDemoState(demoState);
        const nextId = demoState.selectedQueueId;
        setSelectedQueueId(nextId);
        setSelectedQueueName(demoState.queues[nextId]?.name || nextId);
        setIsDemo(true);
        await refresh(nextId, { forceDemo: true });
      }
    } catch (fallbackErr) {
      console.error("delete queue demo failed", fallbackErr);
      setError("Не удалось удалить очередь.");
    }
    setDeletingQueue(false);
  }

  async function joinQueue() {
    if (!selectedQueueId) {
      setError("Сначала выберите очередь.");
      return;
    }
    const member = getDemoUser(user);
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/queues/${encodeURIComponent(selectedQueueId)}/join`, {
        method: "POST",
        body: JSON.stringify({
          userId: member.id,
          name: member.name,
          username: member.username,
        }),
      });
      setIsDemo(false);
      await refresh(selectedQueueId);
      try {
        tg?.HapticFeedback?.impactOccurred?.("light");
      } catch (_) {}
      setBusy(false);
      return;
    } catch (err) {
      console.error("join API failed", err);
    }

    try {
      const demoState = loadDemoState();
      const queueState = ensureDemoQueue(demoState, selectedQueueId, selectedQueueName);
      const exists = queueState.queue.some((entry) => String(entry.id) === String(member.id));
      if (!exists) {
        queueState.queue.push({
          id: member.id,
          name: member.name,
          username: member.username,
          joinedAt: Date.now(),
        });
      }
      demoState.selectedQueueId = selectedQueueId;
      saveDemoState(demoState);
      setIsDemo(true);
      await refresh(selectedQueueId, { forceDemo: true });
      try {
        tg?.HapticFeedback?.impactOccurred?.("light");
      } catch (_) {}
    } catch (err) {
      console.error("join demo failed", err);
      setError("Не удалось встать в очередь.");
    }
    setBusy(false);
  }

  async function leaveQueue() {
    if (!selectedQueueId) {
      setError("Сначала выберите очередь.");
      return;
    }
    const member = getDemoUser(user);
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/queues/${encodeURIComponent(selectedQueueId)}/leave`, {
        method: "POST",
        body: JSON.stringify({ userId: member.id }),
      });
      setIsDemo(false);
      await refresh(selectedQueueId);
      try {
        tg?.HapticFeedback?.impactOccurred?.("soft");
      } catch (_) {}
      setBusy(false);
      return;
    } catch (err) {
      console.error("leave API failed", err);
    }

    try {
      const demoState = loadDemoState();
      const queueState = ensureDemoQueue(demoState, selectedQueueId, selectedQueueName);
      const uid = String(member.id);
      const index = queueState.queue.findIndex((entry) => String(entry.id) === uid);
      if (index !== -1) {
        const [removed] = queueState.queue.splice(index, 1);
        const joinedAt = Number(removed?.joinedAt);
        if (Number.isFinite(joinedAt) && joinedAt > 0) {
          const durationMinutes = (Date.now() - joinedAt) / 60000;
          recordDemoDuration(queueState, durationMinutes);
        }
      }
      saveDemoState(demoState);
      setIsDemo(true);
      await refresh(selectedQueueId, { forceDemo: true });
      try {
        tg?.HapticFeedback?.impactOccurred?.("soft");
      } catch (_) {}
    } catch (err) {
      console.error("leave demo failed", err);
      setError("Не удалось покинуть очередь.");
    }
    setBusy(false);
  }

  async function clearQueue() {
    if (!selectedQueueId) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/queues/${encodeURIComponent(selectedQueueId)}/clear`, { method: "POST" });
      setIsDemo(false);
      await refresh(selectedQueueId);
      setBusy(false);
      return;
    } catch (err) {
      console.error("clear API failed", err);
    }

    try {
      const demoState = loadDemoState();
      const queueState = ensureDemoQueue(demoState, selectedQueueId, selectedQueueName);
      queueState.queue = [];
      queueState.durations = [];
      queueState.avgServiceMinutes = DEFAULT_AVG_MINUTES;
      saveDemoState(demoState);
      setIsDemo(true);
      await refresh(selectedQueueId, { forceDemo: true });
    } catch (err) {
      console.error("clear demo failed", err);
      setError("Не удалось очистить очередь.");
    }
    setBusy(false);
  }

  return (
    <div
      className="px-4 py-6"
      style={{
        minHeight: "var(--tg-viewport-height, 100vh)",
        background: "var(--tg-bg)",
        color: "var(--tg-text)",
      }}
    >
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header className="rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-wide" style={{ color: "var(--tg-hint)" }}> Очередь
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedQueueId || ""}
                    onChange={handleQueueSelectionChange}
                    className="rounded-xl border px-3 py-2 bg-transparent text-sm"
                    style={{ borderColor: "var(--border)", color: "var(--tg-text)", maxWidth: "8rem" }}
                    disabled={loading || busy || deletingQueue}
                  >
                    {queueList.length === 0 ? (
                      <option value={selectedQueueId || DEFAULT_QUEUE_ID}> Нет очередей</option>
                    ) : (
                      queueList.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name || item.id} ({item.size ?? 0})
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={handleCreateQueue}
                    disabled={creatingQueue || deletingQueue}
                    className="rounded-xl px-3 py-2 border text-sm hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
                    style={{ borderColor: "var(--border)", background: "transparent" }}
                  > + Очередь
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteQueue}
                    disabled={
                      deletingQueue || busy || selectedQueueId === DEFAULT_QUEUE_ID || queueList.length === 0
                    }
                    className="rounded-xl px-3 py-2 border text-sm flex items-center gap-2 hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
                    style={{ borderColor: "var(--border)", background: "transparent" }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2 border"
                  style={{ borderColor: "var(--border)", background: "transparent" }}
                >
                  <Users className="w-4 h-4" />
                  <span className="text-sm">{queue.length}</span>
                </div>
                <button
                  onClick={toggleColorMode}
                  className="rounded-xl px-3 py-2 border text-sm flex items-center gap-2 hover:opacity-90 active:scale-[0.98]"
                  style={{ borderColor: "var(--border)", background: "transparent" }}
                  aria-label={`Switch to ${colorMode === "light" ? "dark" : "light"} theme`}
                >
                  {colorMode === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  <span className="capitalize">{colorMode === "light" ? "Dark" : "Light"}</span>
                </button>
                <button
                  onClick={() => refresh(selectedQueueId)}
                  disabled={loading}
                  className="rounded-xl px-3 py-2 border text-sm flex items-center gap-2 hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
                  style={{ borderColor: "var(--border)", background: "transparent" }}
                >
                  <RefreshCw className="w-4 h-4" /> Обновить
                </button>
              </div>
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> {selectedQueueName}
                {isDemo && (
                  <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--tg-hint)" }}> Демо
                  </span>
                )}
              </h1>
              <p className="text-sm mt-1" style={{ color: "var(--tg-hint)" }}>
                {isDemo ? "Демо-режим (локальное хранение)" : "Онлайн"}
              </p>
            </div>
          </div>
          {error && (
            <div className="px-5 pb-4 text-sm" style={{ color: "var(--tg-link)" }}>
              {error}
            </div>
          )}
        </header>

        <section className="rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm" style={{ color: "var(--tg-hint)" }}> Ваш статус
                </div>
                <div className="text-2xl font-bold mt-1">{myPosition > 0 ? `#${myPosition}` : "Вы не в очереди"}</div>
                {myPosition > 0 && (
                  <div className="mt-1 flex items-center gap-2 text-sm" style={{ color: "var(--tg-hint)" }}>
                    <Clock3 className="w-4 h-4" /> Ожидание: {secondsToHuman(etaMinutes)}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {myPosition > 0 ? (
                  <button
                    onClick={leaveQueue}
                    disabled={busy}
                    className="disabled:opacity-60 disabled:pointer-events-none rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 border hover:opacity-90 active:scale-[0.98]"
                    style={{ borderColor: "var(--border)", background: "transparent" }}
                  >
                    <LogOut className="w-4 h-4" /> Выйти
                  </button>
                ) : (
                  <button
                    onClick={joinQueue}
                    disabled={busy}
                    className="disabled:opacity-60 disabled:pointer-events-none rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2"
                    style={{ background: "var(--tg-button)", color: "var(--tg-button-text)" }}
                  >
                    <PlusCircle className="w-4 h-4" /> Встать
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="p-5 flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" /> Участники очереди
            </h2>
            <div className="text-sm" style={{ color: "var(--tg-hint)" }}>
              Среднее время ожидания: {avgServiceMinutes} мин
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {loading ? (
              <div className="p-5 text-sm" style={{ color: "var(--tg-hint)" }}> Загрузка...</div>
            ) : queue.length === 0 ? (
              <div className="p-5 text-sm" style={{ color: "var(--tg-hint)" }}> Очередь пуста. Будь первым!
              </div>
            ) : (
              queue.map((entry, index) => (
                <Row key={entry.id} idx={index} item={entry} meId={user?.id} />
              ))
            )}
          </div>
          <div className="p-4 flex items-center justify-between">
            <div className="text-xs" style={{ color: "var(--tg-hint)" }}> Очередь обновляется одновременно для всех.
            </div>
            {isAdmin && (
              <button
                onClick={clearQueue}
                disabled={busy}
                className="disabled:opacity-60 disabled:pointer-events-none rounded-xl px-3 py-2 text-xs font-medium flex items-center gap-2 border hover:opacity-90 active:scale-[0.98]"
                style={{ borderColor: "var(--border)", background: "transparent" }}
              >
                <Trash2 className="w-4 h-4" /> Очистить очередь
              </button>
            )}
          </div>
        </section>

        <footer className="py-2 text-center text-xs" style={{ color: "var(--tg-hint)" }}>
          {isDemo
            ? "Демо-режим: изменения сохраняются на этом устройстве."
            : "Авторизация через Telegram."}
        </footer>
      </div>
    </div>
  );
}

function Row({ idx, item, meId }) {
  const isMe = String(item.id) === String(meId);
  const initials = (item.name || item.username || "?")
    .toString()
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const since = item.joinedAt ? new Date(item.joinedAt) : null;
  const highlightStyle = isMe ? { background: "var(--row-highlight)" } : undefined;

  return (
    <div className="px-5 py-3 flex items-center gap-3" style={highlightStyle}>
      <div className="w-7 text-sm font-mono opacity-80">{idx + 1}</div>
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold"
        style={{ background: "var(--border)" }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium">
          {item.name || (item.username ? `@${item.username}` : `ID ${item.id}`)}
          {isMe && (
            <span
              className="ml-2 text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: "var(--border)" }}
            >
              You
            </span>
          )}
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--tg-hint)" }}>
          {item.username ? `@${item.username}` : `ID: ${item.id}`} - {since ? since.toLocaleTimeString() : "только что"}
        </div>
      </div>
    </div>
  );
}
