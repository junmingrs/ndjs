"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────
type StarLevel = 1 | 2 | 3;
type TagColor = "blue" | "rose" | "green";
type ViewMode = "month" | "week" | "day";

interface Task {
  id: string;
  title: string;
  date: string;        // "YYYY-MM-DD"
  timeStr: string;     // "HH:MM" start
  endTimeStr: string;  // "HH:MM" end
  hour: number;
  minute: number;
  stars: StarLevel;
  color: TagColor;
  done: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAYS_SHORT = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const HOUR_LABELS = [
  "12 AM","1 AM","2 AM","3 AM","4 AM","5 AM","6 AM","7 AM",
  "8 AM","9 AM","10 AM","11 AM","12 PM","1 PM","2 PM","3 PM",
  "4 PM","5 PM","6 PM","7 PM","8 PM","9 PM","10 PM","11 PM",
];

const COLOR_STYLES: Record<TagColor, { bg: string; border: string; dot: string }> = {
  blue:  { bg: "rgba(59,130,246,0.2)",  border: "rgba(96,165,250,0.6)",  dot: "#60a5fa" },
  rose:  { bg: "rgba(244,63,94,0.2)",   border: "rgba(251,113,133,0.6)", dot: "#fb7185" },
  green: { bg: "rgba(16,185,129,0.2)",  border: "rgba(52,211,153,0.6)",  dot: "#34d399" },
};

const COLOR_LABELS: Record<TagColor, string> = {
  blue: "Events", rose: "Meetings", green: "Tasks",
};

// ── Helpers ────────────────────────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, "0"); }
function toDateStr(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function todayStr() {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
}
function fmt12(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${pad(m)} ${ampm}`;
}
function getDaysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
function getFirstDay(y: number, m: number) {
  return new Date(y, m, 1).getDay();
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ChevronDown({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
function ChevronLeft() {
  return (
    <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
function SortIcon() {
  return (
    <svg width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path d="M3 6h18M7 12h10M11 18h2" />
    </svg>
  );
}

// ── Chip (month-view event pill) ──────────────────────────────────────────
function Chip({ task }: { task: Task }) {
  const c = COLOR_STYLES[task.color];
  return (
    <div
      style={{
        background: task.done ? "rgba(255,255,255,.04)" : c.bg,
        borderColor: task.done ? "rgba(255,255,255,.12)" : c.border,
        borderWidth: 1,
        borderStyle: "solid",
        borderRadius: 4,
        padding: "2px 6px",
        fontSize: 9,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 4,
        marginBottom: 2,
        whiteSpace: "nowrap",
        overflow: "hidden",
        opacity: task.done ? 0.55 : 1,
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: task.done ? "rgba(255,255,255,.2)" : c.dot, flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1, color: "rgba(255,255,255,.85)", textDecoration: task.done ? "line-through" : "none" }}>
        {task.title}
      </span>
      <span style={{ flexShrink: 0, color: task.done ? "rgba(255,255,255,.2)" : "rgba(251,191,36,.8)", marginLeft: "auto" }}>
        {"★".repeat(task.stars)}
      </span>
    </div>
  );
}

// ── Time-view day column ──────────────────────────────────────────────────
const CELL_HEIGHT = 48; // px per hour

function DayColumn({ tasks, dateStr: ds }: { tasks: Task[]; dateStr: string }) {
  const now = new Date();
  const isToday = ds === todayStr();
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * CELL_HEIGHT;
  const totalHeight = HOUR_LABELS.length * CELL_HEIGHT;

  const dayTasks = tasks.filter(t => t.date === ds);

  return (
    <div style={{ flex: 1, borderRight: "1px solid rgba(255,255,255,.08)", position: "relative", minWidth: 0 }}>
      {/* Hour grid lines */}
      {HOUR_LABELS.map((_, h) => (
        <div key={h} style={{ height: CELL_HEIGHT, borderBottom: "1px solid rgba(255,255,255,.06)" }} />
      ))}

      {/* Absolutely positioned event blocks spanning full duration */}
      {dayTasks.map((t, i) => {
        const c = COLOR_STYLES[t.color];
        const startMins = t.hour * 60 + t.minute;
        let endMins = startMins + 60; // default 1hr if no end time
        if (t.endTimeStr) {
          const [eh, em] = t.endTimeStr.split(":").map(Number);
          const calc = eh * 60 + em;
          if (calc > startMins) endMins = calc;
        }
        const durationMins = endMins - startMins;
        const top = (startMins / 60) * CELL_HEIGHT;
        const height = Math.max((durationMins / 60) * CELL_HEIGHT, 22);

        return (
          <div
            key={t.id}
            style={{
              position: "absolute",
              top,
              left: 2 + i * 4, // slight offset for overlapping tasks
              right: 2,
              height,
              borderRadius: 4,
              padding: "4px 7px",
              fontSize: 11,
              fontWeight: 500,
              overflow: "hidden",
              background: t.done ? "rgba(255,255,255,.04)" : c.bg,
              borderLeft: `3px solid ${t.done ? "rgba(255,255,255,.2)" : c.dot}`,
              borderTop: `1px solid ${t.done ? "rgba(255,255,255,.1)" : c.border}`,
              borderRight: `1px solid ${t.done ? "rgba(255,255,255,.1)" : c.border}`,
              borderBottom: `1px solid ${t.done ? "rgba(255,255,255,.1)" : c.border}`,
              opacity: t.done ? 0.55 : 1,
              zIndex: 2,
              boxSizing: "border-box",
            }}
          >
            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t.done ? "rgba(255,255,255,.4)" : "rgba(255,255,255,.9)", textDecoration: t.done ? "line-through" : "none" }}>
              {t.title}
            </div>
            {height > 28 && (
              <div style={{ fontSize: 10, color: t.done ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.55)", marginTop: 1, textDecoration: t.done ? "line-through" : "none" }}>
                {fmt12(t.timeStr)}{t.endTimeStr ? ` – ${fmt12(t.endTimeStr)}` : ""}
              </div>
            )}
            {height > 44 && (
              <div style={{ fontSize: 9, color: t.done ? "rgba(255,255,255,.2)" : "rgba(251,191,36,.8)", marginTop: 1 }}>
                {"★".repeat(t.stars)}
              </div>
            )}
          </div>
        );
      })}

      {/* Current time indicator */}
      {isToday && (
        <div style={{
          position: "absolute", left: 0, right: 0, top: nowTop,
          height: 2, background: "#ef4444", zIndex: 10, pointerEvents: "none",
        }}>
          <div style={{
            position: "absolute", left: -4, top: -4,
            width: 10, height: 10, borderRadius: "50%", background: "#ef4444",
          }} />
        </div>
      )}
    </div>
  );
}

// ── Time labels ───────────────────────────────────────────────────────────
function TimeLabels() {
  return (
    <div style={{ width: 56, minWidth: 56, flexShrink: 0 }}>
      {HOUR_LABELS.map((label, i) => (
        <div
          key={i}
          style={{
            height: CELL_HEIGHT,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "flex-end",
            paddingRight: 8,
            paddingTop: 4,
            fontSize: 10,
            color: "#5f6368",
            userSelect: "none",
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

// ── Main Calendar Component ────────────────────────────────────────────────
export default function Calendar() {
  const today = new Date();
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewDay, setViewDay]     = useState(today.getDate());
  const [viewMode, setViewMode]   = useState<ViewMode>("month");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [sortByPriority, setSortByPriority] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate,  setEditDate]  = useState("");
  const [editTime,  setEditTime]  = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editStars, setEditStars] = useState<StarLevel>(1);
  const [editColor, setEditColor] = useState<TagColor>("blue");

  // Form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate,  setTaskDate]  = useState(todayStr());
  const [taskTime,  setTaskTime]  = useState("09:00");
  const [taskEndTime, setTaskEndTime] = useState("10:00");
  const [taskStars, setTaskStars] = useState<StarLevel>(1);
  const [taskColor, setTaskColor] = useState<TagColor>("blue");

  const weekScrollRef = useRef<HTMLDivElement>(null);
  const dayScrollRef  = useRef<HTMLDivElement>(null);

  // Scroll to 7 AM on view change
  useEffect(() => {
    const target = viewMode === "week" ? weekScrollRef.current : dayScrollRef.current;
    if (target) {
      setTimeout(() => { target.scrollTop = 7 * CELL_HEIGHT; }, 0);
    }
  }, [viewMode, viewYear, viewMonth, viewDay]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setViewMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Task helpers ──────────────────────────────────────────────────────
  function addTask() {
    if (!taskTitle.trim() || !taskDate) return;
    const [hour, minute] = taskTime.split(":").map(Number);
    setTasks(prev => [{
      id: crypto.randomUUID(),
      title: taskTitle.trim(),
      date: taskDate,
      timeStr: taskTime,
      endTimeStr: taskEndTime,
      hour,
      minute,
      stars: taskStars,
      color: taskColor,
      done: false,
    }, ...prev]);
    setTaskTitle("");
  }

  function deleteTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  function startEdit(t: Task) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditDate(t.date);
    setEditTime(t.timeStr);
    setEditEndTime(t.endTimeStr);
    setEditStars(t.stars);
    setEditColor(t.color);
  }

  function saveEdit() {
    if (!editingId || !editTitle.trim()) return;
    const [hour, minute] = editTime.split(":").map(Number);
    setTasks(prev => prev.map(t =>
      t.id === editingId
        ? { ...t, title: editTitle.trim(), date: editDate, timeStr: editTime, endTimeStr: editEndTime, hour, minute, stars: editStars, color: editColor, done: t.done }
        : t
    ));
    setEditingId(null);
  }

  function cancelEdit() { setEditingId(null); }

  function toggleDone(id: string) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const displayedTasks = sortByPriority
    ? [...tasks].sort((a, b) => b.stars - a.stars)
    : tasks;

  // ── Nav helpers ───────────────────────────────────────────────────────
  function goNext() {
    if (viewMode === "month") {
      if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
      else setViewMonth(m => m + 1);
    } else if (viewMode === "week") {
      const d = new Date(viewYear, viewMonth, viewDay);
      d.setDate(d.getDate() + 7);
      setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); setViewDay(d.getDate());
    } else {
      const d = new Date(viewYear, viewMonth, viewDay);
      d.setDate(d.getDate() + 1);
      setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); setViewDay(d.getDate());
    }
  }
  function goPrev() {
    if (viewMode === "month") {
      if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
      else setViewMonth(m => m - 1);
    } else if (viewMode === "week") {
      const d = new Date(viewYear, viewMonth, viewDay);
      d.setDate(d.getDate() - 7);
      setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); setViewDay(d.getDate());
    } else {
      const d = new Date(viewYear, viewMonth, viewDay);
      d.setDate(d.getDate() - 1);
      setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); setViewDay(d.getDate());
    }
  }
  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setViewDay(today.getDate());
  }

  // ── Calendar title ────────────────────────────────────────────────────
  function buildTitle() {
    if (viewMode === "month") {
      return <>{MONTHS[viewMonth]} <span style={{ color: "#818cf8" }}>{viewYear}</span></>;
    }
    if (viewMode === "week") {
      const base = new Date(viewYear, viewMonth, viewDay);
      const sun = new Date(base); sun.setDate(base.getDate() - base.getDay());
      const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
      const same = sun.getMonth() === sat.getMonth();
      return same
        ? <>{MONTHS[sun.getMonth()]} <span style={{ color: "#818cf8" }}>{sun.getFullYear()}</span></>
        : <>{MONTHS[sun.getMonth()]} – {MONTHS[sat.getMonth()]} <span style={{ color: "#818cf8" }}>{sat.getFullYear()}</span></>;
    }
    return <>{MONTHS[viewMonth]} {viewDay}, <span style={{ color: "#818cf8" }}>{viewYear}</span></>;
  }

  // ── Month grid cells ──────────────────────────────────────────────────
  function buildMonthCells() {
    const daysInM = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDay(viewYear, viewMonth);
    const prevDays = getDaysInMonth(viewYear, viewMonth - 1);
    const cells: { y: number; m: number; d: number; cur: boolean }[] = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      cells.push({ y, m, d: prevDays - i, cur: false });
    }
    for (let d = 1; d <= daysInM; d++) cells.push({ y: viewYear, m: viewMonth, d, cur: true });
    while (cells.length < 42) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      cells.push({ y, m, d: cells.length - firstDay - daysInM + 1, cur: false });
    }
    return cells;
  }

  // ── Week days ─────────────────────────────────────────────────────────
  function getWeekDays() {
    const base = new Date(viewYear, viewMonth, viewDay);
    const sun = new Date(base); sun.setDate(base.getDate() - base.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sun); d.setDate(sun.getDate() + i);
      return { date: d, ds: toDateStr(d.getFullYear(), d.getMonth(), d.getDate()) };
    });
  }

  const S: Record<string, React.CSSProperties> = {
    root: { height: "100vh", width: "100vw", display: "flex", background: "#1a1a2e", color: "#e5e7eb", fontFamily: "'Segoe UI', system-ui, sans-serif", overflow: "hidden" },
    aside: { width: 272, minWidth: 272, display: "flex", flexDirection: "column", background: "#16213e", borderRight: "1px solid rgba(255,255,255,.12)" },
    panelHead: { padding: "18px 18px 14px", borderBottom: "1px solid rgba(255,255,255,.12)" },
    formArea: { padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.12)", display: "flex", flexDirection: "column", gap: 10 },
    label: { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280", display: "block", marginBottom: 5 },
    input: { width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#e5e7eb", outline: "none", colorScheme: "dark" as const },
    main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" },
    calHeader: { display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,.12)", background: "#1e2033", flexShrink: 0 },
  };

  const weekDays = getWeekDays();
  const monthCells = buildMonthCells();
  const currentDayStr = toDateStr(viewYear, viewMonth, viewDay);

  return (
    <div style={S.root}>
      {/* ── LEFT PANEL ──────────────────────────────────────────────── */}
      <aside style={S.aside}>
        {/* Header */}
        <div style={S.panelHead}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span>✦</span>
            <h2 style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#a5b4fc", fontWeight: 600 }}>
              Task Manager
            </h2>
          </div>
          <p style={{ fontSize: 11, color: "#6b7280" }}>Add tasks directly to your calendar</p>
        </div>

        {/* Form */}
        <div style={S.formArea}>
          <input
            style={S.input}
            value={taskTitle}
            onChange={e => setTaskTitle(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addTask()}
            placeholder="Task title..."
          />
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={S.label}>Date</label>
              <input style={S.input} type="date" value={taskDate} onChange={e => setTaskDate(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={S.label}>Start Time</label>
              <input style={S.input} type="time" value={taskTime} onChange={e => setTaskTime(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={S.label}>End Time</label>
              <input style={S.input} type="time" value={taskEndTime} onChange={e => setTaskEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={S.label}>Importance</label>
            <div style={{ display: "flex", gap: 6 }}>
              {([1, 2, 3] as StarLevel[]).map(lvl => (
                <button key={lvl} onClick={() => setTaskStars(lvl)} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "6px 0", borderRadius: 8, cursor: "pointer", fontSize: 11, transition: "all .15s",
                  border: taskStars === lvl ? "1px solid rgba(251,191,36,.8)" : "1px solid rgba(255,255,255,.12)",
                  background: taskStars === lvl ? "rgba(251,191,36,.15)" : "rgba(255,255,255,.05)",
                  color: taskStars === lvl ? "#fcd34d" : "#6b7280",
                }}>
                  {"★".repeat(lvl)}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
              {["Low","Med","High"].map(l => (
                <span key={l} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#6b7280" }}>{l}</span>
              ))}
            </div>
          </div>
          <div>
            <label style={S.label}>Color Tag</label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["blue","rose","green"] as TagColor[]).map(c => {
                const cs = COLOR_STYLES[c];
                const active = taskColor === c;
                return (
                  <button key={c} onClick={() => setTaskColor(c)} style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                    transition: "all .15s", opacity: active ? 1 : 0.45,
                    background: cs.bg, border: `1px solid ${cs.border}`,
                    outline: active ? `2px solid ${cs.border}` : "none", outlineOffset: 2,
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: cs.dot }} />
                    <span style={{ fontSize: 10, color: "#9ca3af" }}>{COLOR_LABELS[c]}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <button onClick={addTask} disabled={!taskTitle.trim()} style={{
            width: "100%", padding: 10, borderRadius: 8, border: "none",
            background: taskTitle.trim() ? "#6366f1" : "rgba(99,102,241,.3)",
            color: "#fff", fontSize: 13, fontWeight: 500, cursor: taskTitle.trim() ? "pointer" : "not-allowed",
            transition: "all .15s",
          }}>
            + Add Task
          </button>
        </div>

        {/* Sort bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 2px", flexShrink: 0 }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280" }}>Tasks</span>
          <button onClick={() => setSortByPriority(v => !v)} style={{
            display: "flex", alignItems: "center", gap: 5, fontSize: 11,
            padding: "4px 10px", borderRadius: 7, cursor: "pointer", transition: "all .15s",
            border: sortByPriority ? "1px solid rgba(251,191,36,.5)" : "1px solid rgba(255,255,255,.12)",
            background: sortByPriority ? "rgba(251,191,36,.1)" : "rgba(255,255,255,.04)",
            color: sortByPriority ? "#fcd34d" : "#9ca3af",
          }}>
            <SortIcon /> Sort by priority
          </button>
        </div>

        {/* Task list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {displayedTasks.length === 0 && (
            <p style={{ textAlign: "center", fontSize: 12, color: "#6b7280", marginTop: 32 }}>
              No tasks yet. Add one above!
            </p>
          )}
          {displayedTasks.map(t => {
            const cs = COLOR_STYLES[t.color];
            const isEditing = editingId === t.id;

            if (isEditing) {
              const ecs = COLOR_STYLES[editColor];
              return (
                <div key={t.id} style={{ borderRadius: 10, border: `1px solid ${ecs.border}`, padding: "12px 12px 10px", background: ecs.bg, display: "flex", flexDirection: "column", gap: 8 }}>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                    autoFocus
                    style={{ width: "100%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#e5e7eb", outline: "none", colorScheme: "dark" as const }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                      style={{ flex: 1, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 6, padding: "5px 8px", fontSize: 11, color: "#e5e7eb", outline: "none", colorScheme: "dark" as const }} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>Start</div>
                      <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)}
                        style={{ width: "100%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 6, padding: "5px 8px", fontSize: 11, color: "#e5e7eb", outline: "none", colorScheme: "dark" as const }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>End</div>
                      <input type="time" value={editEndTime} onChange={e => setEditEndTime(e.target.value)}
                        style={{ width: "100%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 6, padding: "5px 8px", fontSize: 11, color: "#e5e7eb", outline: "none", colorScheme: "dark" as const }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {([1, 2, 3] as StarLevel[]).map(lvl => (
                      <button key={lvl} onClick={() => setEditStars(lvl)} style={{
                        flex: 1, padding: "4px 0", borderRadius: 6, cursor: "pointer", fontSize: 11,
                        border: editStars === lvl ? "1px solid rgba(251,191,36,.8)" : "1px solid rgba(255,255,255,.12)",
                        background: editStars === lvl ? "rgba(251,191,36,.15)" : "rgba(255,255,255,.05)",
                        color: editStars === lvl ? "#fcd34d" : "#6b7280",
                      }}>{"★".repeat(lvl)}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["blue","rose","green"] as TagColor[]).map(c => {
                      const ccs = COLOR_STYLES[c];
                      return (
                        <button key={c} onClick={() => setEditColor(c)} style={{
                          flex: 1, padding: "5px 0", borderRadius: 6, cursor: "pointer",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                          background: ccs.bg, border: `1px solid ${ccs.border}`,
                          opacity: editColor === c ? 1 : 0.4,
                          outline: editColor === c ? `2px solid ${ccs.border}` : "none", outlineOffset: 1,
                        }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: ccs.dot }} />
                          <span style={{ fontSize: 9, color: "#9ca3af" }}>{COLOR_LABELS[c]}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={saveEdit} style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, background: "#6366f1", color: "#fff" }}>Save</button>
                    <button onClick={cancelEdit} style={{ flex: 1, padding: "6px 0", borderRadius: 7, cursor: "pointer", fontSize: 12, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "#9ca3af" }}>Cancel</button>
                  </div>
                </div>
              );
            }

            return (
              <div key={t.id} style={{
                borderRadius: 10, border: `1px solid ${cs.border}`, padding: "10px 12px",
                position: "relative", background: t.done && t.color === "green" ? "rgba(255,255,255,.03)" : cs.bg,
                opacity: t.done && t.color === "green" ? 0.65 : 1, transition: "opacity .2s, background .2s",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                  {t.color === "green" && (
                    <button onClick={() => toggleDone(t.id)} title={t.done ? "Mark incomplete" : "Mark complete"} style={{
                      flexShrink: 0, marginTop: 1, width: 16, height: 16, borderRadius: 4, cursor: "pointer",
                      border: t.done ? `2px solid ${cs.dot}` : "2px solid rgba(255,255,255,.25)",
                      background: t.done ? cs.dot : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all .18s", padding: 0,
                    }}>
                      {t.done && (
                        <svg width="9" height="9" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7"/>
                        </svg>
                      )}
                    </button>
                  )}
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 44 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 500, color: t.done && t.color === "green" ? "#6b7280" : "#e5e7eb",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      textDecoration: t.done && t.color === "green" ? "line-through" : "none", transition: "all .2s",
                    }}>
                      {t.title}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: "#6b7280" }}>{t.date}</span>
                      {t.timeStr && <span style={{ marginLeft: "auto", fontSize: 10, color: "#9ca3af" }}>{fmt12(t.timeStr)}{t.endTimeStr ? ` – ${fmt12(t.endTimeStr)}` : ""}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.done && t.color === "green" ? "#4b5563" : cs.dot, transition: "background .2s" }} />
                      <span style={{ color: t.done && t.color === "green" ? "#4b5563" : "#fbbf24", fontSize: 11, transition: "color .2s" }}>{"★".repeat(t.stars)}{"☆".repeat(3 - t.stars)}</span>
                    </div>
                  </div>
                </div>
                <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }}>
                  <button onClick={() => startEdit(t)} title="Edit" style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 12, padding: "2px 4px", borderRadius: 4, transition: "color .15s" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#a5b4fc")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}
                  >✎</button>
                  <button onClick={() => deleteTask(t.id)} title="Delete" style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 12, padding: "2px 4px", borderRadius: 4, transition: "color .15s" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#fb7185")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}
                  >✕</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── LOGOUT BUTTON ── */}
        <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,.08)", flexShrink: 0 }}>
          <button
            onClick={handleLogout}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "9px 14px", borderRadius: 10, cursor: "pointer",
              background: "rgba(251,113,133,.06)", border: "1px solid rgba(251,113,133,.18)",
              color: "#9ca3af", fontSize: 13, fontWeight: 500,
              transition: "all .18s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(251,113,133,.14)";
              e.currentTarget.style.borderColor = "rgba(251,113,133,.45)";
              e.currentTarget.style.color = "#fb7185";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "rgba(251,113,133,.06)";
              e.currentTarget.style.borderColor = "rgba(251,113,133,.18)";
              e.currentTarget.style.color = "#9ca3af";
            }}
          >
            {/* Logout icon */}
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>
      </aside>

      {/* ── MAIN CALENDAR ───────────────────────────────────────────── */}
      <main style={S.main}>
        {/* Header */}
        <div style={S.calHeader}>
          {/* Nav arrows */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, padding: 3 }}>
            <button onClick={goPrev} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex" }}>
              <ChevronLeft />
            </button>
            <button onClick={goNext} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex" }}>
              <ChevronRight />
            </button>
          </div>

          {/* Title */}
          <h1 style={{ fontSize: 19, fontWeight: 700, color: "#e5e7eb" }}>{buildTitle()}</h1>

          {/* Today + View dropdown */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={goToday} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", color: "#9ca3af", cursor: "pointer" }}>
              Today
            </button>

            {/* View dropdown — uses ref-based outside click, NOT stopPropagation */}
            <div ref={viewMenuRef} style={{ position: "relative" }}>
              <button
                onClick={() => setViewMenuOpen(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 12px",
                  borderRadius: 8, background: "rgba(99,102,241,.15)", border: "1px solid rgba(99,102,241,.4)",
                  color: "#a5b4fc", cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
                <span style={{ transform: viewMenuOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s", display: "flex" }}>
                  <ChevronDown />
                </span>
              </button>
              {viewMenuOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0,
                  background: "#1e2340", border: "1px solid rgba(255,255,255,.15)",
                  borderRadius: 10, overflow: "hidden", zIndex: 1000, minWidth: 130,
                  boxShadow: "0 8px 24px rgba(0,0,0,.6)",
                }}>
                  {(["month","week","day"] as ViewMode[]).map(v => (
                    <div
                      key={v}
                      onClick={() => { setViewMode(v); setViewMenuOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
                        fontSize: 13, cursor: "pointer",
                        color: viewMode === v ? "#a5b4fc" : "#9ca3af",
                        background: viewMode === v ? "rgba(99,102,241,.1)" : "transparent",
                      }}
                    >
                      <span style={{ opacity: viewMode === v ? 1 : 0, display: "flex" }}><CheckIcon /></span>
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── MONTH VIEW ── */}
        {viewMode === "month" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid rgba(255,255,255,.12)", flexShrink: 0 }}>
              {DAYS_SHORT.map(d => (
                <div key={d} style={{ padding: 8, textAlign: "center", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280" }}>
                  {d}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridTemplateRows: "repeat(6,1fr)", overflow: "hidden" }}>
              {monthCells.map((cell, idx) => {
                const ds = toDateStr(cell.y, cell.m, cell.d);
                const isToday = ds === todayStr();
                const cellTasks = tasks.filter(t => t.date === ds);
                return (
                  <div key={idx} style={{
                    borderBottom: "1px solid rgba(255,255,255,.08)", borderRight: "1px solid rgba(255,255,255,.08)",
                    padding: 6, display: "flex", flexDirection: "column", overflow: "hidden",
                    background: !cell.cur ? "rgba(255,255,255,.005)" : "transparent",
                  }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%", fontSize: 12, fontWeight: 500,
                      display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4,
                      background: isToday ? "#6366f1" : "transparent",
                      color: isToday ? "#fff" : !cell.cur ? "#6b7280" : "#9ca3af",
                    }}>
                      {cell.d}
                    </div>
                    {cellTasks.slice(0, 3).map(t => <Chip key={t.id} task={t} />)}
                    {cellTasks.length > 3 && (
                      <span style={{ fontSize: 9, color: "#6b7280", padding: "1px 4px" }}>+{cellTasks.length - 3} more</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── WEEK VIEW ── */}
        {viewMode === "week" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
            {/* Sticky day headers */}
            <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.1)", flexShrink: 0, background: "#1e2033" }}>
              {/* Corner cell */}
              <div style={{ width: 56, minWidth: 56, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,.08)", padding: "8px 0" }}>
                <div style={{ fontSize: 9, color: "#5f6368", textAlign: "right", paddingRight: 8, paddingTop: 2 }}>GMT+08</div>
              </div>
              {weekDays.map(({ date, ds }, i) => {
                const isToday = ds === todayStr();
                return (
                  <div key={i} style={{ flex: 1, textAlign: "center", padding: "8px 4px 10px", borderRight: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: isToday ? "#a5b4fc" : "#5f6368", fontWeight: 600, marginBottom: 4 }}>
                      {DAYS_SHORT[i]}
                    </div>
                    <div style={{
                      width: 34, height: 34, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      margin: "0 auto",
                      fontSize: 20, fontWeight: 400,
                      background: isToday ? "#4f8ef7" : "transparent",
                      color: isToday ? "#fff" : "#c9cdd4",
                    }}>
                      {date.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scrollable time grid */}
            <div ref={weekScrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", minHeight: 0 }}>
              <TimeLabels />
              <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
                {weekDays.map(({ ds }, i) => (
                  <DayColumn key={i} tasks={tasks} dateStr={ds} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── DAY VIEW ── */}
        {viewMode === "day" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
            {/* Sticky day header */}
            <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.1)", flexShrink: 0, background: "#1e2033" }}>
              {/* Corner cell */}
              <div style={{ width: 56, minWidth: 56, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,.08)", padding: "8px 0" }}>
                <div style={{ fontSize: 9, color: "#5f6368", textAlign: "right", paddingRight: 8, paddingTop: 2 }}>GMT+08</div>
              </div>
              <div style={{ flex: 1, textAlign: "center", padding: "8px 4px 10px", borderRight: "1px solid rgba(255,255,255,.06)" }}>
                <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: currentDayStr === todayStr() ? "#a5b4fc" : "#5f6368", fontWeight: 600, marginBottom: 4 }}>
                  {DAYS_SHORT[new Date(viewYear, viewMonth, viewDay).getDay()]}
                </div>
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto",
                  fontSize: 20, fontWeight: 400,
                  background: currentDayStr === todayStr() ? "#4f8ef7" : "transparent",
                  color: currentDayStr === todayStr() ? "#fff" : "#c9cdd4",
                }}>
                  {viewDay}
                </div>
              </div>
            </div>

            {/* Scrollable time grid */}
            <div ref={dayScrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", minHeight: 0 }}>
              <TimeLabels />
              <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
                <DayColumn tasks={tasks} dateStr={currentDayStr} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
