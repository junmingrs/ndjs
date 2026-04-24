"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────
type StarLevel = 1 | 2 | 3;
type TagColor = "blue" | "rose" | "green";
type ViewMode = "month" | "week" | "day";

interface Task {
  id: string;
  title: string;
  description: string;
  date: string;        // "YYYY-MM-DD"
  timeStr: string;     // "HH:MM" start
  endTimeStr: string;  // "HH:MM" end
  hour: number;
  minute: number;
  stars: StarLevel;
  color: TagColor;
  done: boolean;
  senderEmail?: string;
}

type DbItem = {
  id: string;
  title: string;
  description?: string;
  dateStart: string;
  dateEnd: string;
  star: number;
  type: string;
  complete?: boolean;
  completed?: boolean;
  userId: string;
};

type GmailTasksResponse = {
  tasks?: Task[];
  error?: string;
};

type CalendarTasksResponse = {
  tasks?: Task[];
  error?: string;
};

type FormattedDraft = {
  recipient: string;
  subject: string;
  body: string;
};

const RELATIONSHIP_TAGS = ["Direct Manager", "Senior Colleague", "Peer", "Client"] as const;
type RelationshipTag = (typeof RELATIONSHIP_TAGS)[number];

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
  blue:  { bg: "rgba(59,130,246,0.12)",  border: "rgba(96,165,250,0.5)",  dot: "#3b82f6" },
  rose:  { bg: "rgba(244,63,94,0.10)",   border: "rgba(251,113,133,0.5)", dot: "#f43f5e" },
  green: { bg: "rgba(16,185,129,0.10)",  border: "rgba(52,211,153,0.5)",  dot: "#10b981" },
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

function fromDbItem(item: DbItem): Task {
  const start = new Date(item.dateStart);
  const end = new Date(item.dateEnd);

  const date = toDateStr(start.getFullYear(), start.getMonth(), start.getDate());
  const timeStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const endTimeStr = `${pad(end.getHours())}:${pad(end.getMinutes())}`;

  const stars: StarLevel = item.star === 3 ? 3 : item.star === 2 ? 2 : 1;
  const color: TagColor = item.type === "meeting" ? "rose" : item.type === "task" ? "green" : "blue";

  return {
    id: item.id,
    title: item.title,
    description: item.description ?? "",
    date,
    timeStr,
    endTimeStr,
    hour: start.getHours(),
    minute: start.getMinutes(),
    stars,
    color,
    done: item.complete ?? item.completed ?? false,
  };
}

function toDbPayload(task: Task) {
  const dateStart = new Date(`${task.date}T${task.timeStr}`);
  const dateEnd = new Date(`${task.date}T${task.endTimeStr}`);

  const type = task.color === "rose" ? "meeting" : task.color === "green" ? "task" : "event";

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    dateStart: dateStart.toISOString(),
    dateEnd: dateEnd.toISOString(),
    star: task.stars,
    type,
    complete: task.done,
  };
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
function Chip({ task, onDoubleClick }: { task: Task; onDoubleClick?: (task: Task) => void }) {
  const c = COLOR_STYLES[task.color];
  return (
    <div
      onDoubleClick={() => onDoubleClick?.(task)}
      style={{
        background: task.done ? "#f3f4f6" : c.bg,
        borderColor: task.done ? "#e5e7eb" : c.border,
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
        cursor: "pointer",
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: task.done ? "#9ca3af" : c.dot, flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1, color: task.done ? "#9ca3af" : "#374151", textDecoration: task.done ? "line-through" : "none" }}>
        {task.title}
      </span>
      <span style={{ flexShrink: 0, color: task.done ? "#d1d5db" : "#f59e0b", marginLeft: "auto" }}>
        {"★".repeat(task.stars)}
      </span>
    </div>
  );
}

// ── Time-view day column ──────────────────────────────────────────────────
const CELL_HEIGHT = 48; // px per hour

function DayColumn({
  tasks,
  dateStr: ds,
  onTaskDoubleClick,
}: {
  tasks: Task[];
  dateStr: string;
  onTaskDoubleClick?: (task: Task) => void;
}) {
  const now = new Date();
  const isToday = ds === todayStr();
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * CELL_HEIGHT;
  const dayTasks = tasks.filter(t => t.date === ds);

  const positionedTasks = dayTasks
    .map((task) => {
      const startMins = task.hour * 60 + task.minute;
      let endMins = startMins + 60;
      if (task.endTimeStr) {
        const [eh, em] = task.endTimeStr.split(":").map(Number);
        const parsedEndMins = eh * 60 + em;
        if (parsedEndMins > startMins) endMins = parsedEndMins;
      }
      return { task, startMins, endMins };
    })
    .sort((a, b) => a.startMins - b.startMins || a.endMins - b.endMins);

  const clusterLaneCount = new Map<number, number>();
  const laidOutTasks: Array<{ task: Task; startMins: number; endMins: number; lane: number; clusterId: number }> = [];
  let active: Array<{ endMins: number; lane: number }> = [];
  let laneEnds: number[] = [];
  let clusterId = -1;

  for (const entry of positionedTasks) {
    active = active.filter((item) => item.endMins > entry.startMins);
    if (active.length === 0) { clusterId += 1; laneEnds = []; }
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > entry.startMins) lane += 1;
    if (lane === laneEnds.length) laneEnds.push(entry.endMins);
    else laneEnds[lane] = entry.endMins;
    active.push({ endMins: entry.endMins, lane });
    laidOutTasks.push({ ...entry, lane, clusterId });
    const currentMax = clusterLaneCount.get(clusterId) ?? 0;
    clusterLaneCount.set(clusterId, Math.max(currentMax, lane + 1));
  }

  return (
    <div style={{ flex: 1, borderRight: "1px solid #e5e7eb", position: "relative", minWidth: 0 }}>
      {/* Hour grid lines */}
      {HOUR_LABELS.map((_, h) => (
        <div key={h} style={{ height: CELL_HEIGHT, borderBottom: "1px solid #f3f4f6" }} />
      ))}

      {laidOutTasks.map(({ task: t, startMins, endMins, lane, clusterId }) => {
        const c = COLOR_STYLES[t.color];
        const durationMins = endMins - startMins;
        const top = (startMins / 60) * CELL_HEIGHT;
        const height = Math.max((durationMins / 60) * CELL_HEIGHT, 22);
        const laneCount = clusterLaneCount.get(clusterId) ?? 1;
        const laneWidth = 100 / laneCount;
        const left = laneCount === 1 ? "2px" : `calc(${laneWidth * lane}% + 2px)`;
        const width = laneCount === 1 ? "calc(100% - 4px)" : `calc(${laneWidth}% - 4px)`;

        return (
          <div
            key={t.id}
            onDoubleClick={() => onTaskDoubleClick?.(t)}
            style={{
              position: "absolute", top, left, width, height,
              borderRadius: 4, padding: "4px 7px", fontSize: 11, fontWeight: 500, overflow: "hidden",
              background: t.done ? "#f9fafb" : c.bg,
              borderLeft: `3px solid ${t.done ? "#d1d5db" : c.dot}`,
              borderTop: `1px solid ${t.done ? "#e5e7eb" : c.border}`,
              borderRight: `1px solid ${t.done ? "#e5e7eb" : c.border}`,
              borderBottom: `1px solid ${t.done ? "#e5e7eb" : c.border}`,
              opacity: t.done ? 0.6 : 1, zIndex: 2, boxSizing: "border-box", cursor: "pointer",
            }}
          >
            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t.done ? "#9ca3af" : "#1f2937", textDecoration: t.done ? "line-through" : "none" }}>
              {t.title}
            </div>
            {height > 56 && t.description && (
              <div style={{ marginTop: 2, fontSize: 10, color: t.done ? "#d1d5db" : "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.description}
              </div>
            )}
            {height > 28 && (
              <div style={{ fontSize: 10, color: t.done ? "#d1d5db" : "#6b7280", marginTop: 1, textDecoration: t.done ? "line-through" : "none" }}>
                {fmt12(t.timeStr)}{t.endTimeStr ? ` – ${fmt12(t.endTimeStr)}` : ""}
              </div>
            )}
            {height > 44 && (
              <div style={{ fontSize: 9, color: t.done ? "#d1d5db" : "#f59e0b", marginTop: 1 }}>
                {"★".repeat(t.stars)}
              </div>
            )}
          </div>
        );
      })}

      {isToday && (
        <div style={{ position: "absolute", left: 0, right: 0, top: nowTop, height: 2, background: "#ef4444", zIndex: 10, pointerEvents: "none" }}>
          <div style={{ position: "absolute", left: -4, top: -4, width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
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
        <div key={i} style={{ height: CELL_HEIGHT, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 8, paddingTop: 4, fontSize: 10, color: "#9ca3af", userSelect: "none" }}>
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
  const [editDescription, setEditDescription] = useState("");
  const [editDate,  setEditDate]  = useState("");
  const [editTime,  setEditTime]  = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editStars, setEditStars] = useState<StarLevel>(1);
  const [editColor, setEditColor] = useState<TagColor>("blue");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDate,  setTaskDate]  = useState(todayStr());
  const [taskTime,  setTaskTime]  = useState("09:00");
  const [taskEndTime, setTaskEndTime] = useState("10:00");
  const [taskStars, setTaskStars] = useState<StarLevel>(1);
  const [taskColor, setTaskColor] = useState<TagColor>("blue");
  const [createTaskPopupOpen, setCreateTaskPopupOpen] = useState(false);

  const [itemsLoading, setItemsLoading] = useState(true);
  const [gmailImporting, setGmailImporting] = useState(false);
  const [gmailImportStatus, setGmailImportStatus] = useState<string | null>(null);
  const [calendarImporting, setCalendarImporting] = useState(false);
  const [calendarImportStatus, setCalendarImportStatus] = useState<string | null>(null);
  const [gmailTaskIds, setGmailTaskIds] = useState<Set<string>>(new Set());

  const [completionPopupTask, setCompletionPopupTask] = useState<Task | null>(null);
  const [selectedRelationshipTag, setSelectedRelationshipTag] = useState<RelationshipTag | null>(null);
  const [relationshipDescription, setRelationshipDescription] = useState("");
  const [completionDetails, setCompletionDetails] = useState("");
  const [formattedDraft, setFormattedDraft] = useState<FormattedDraft | null>(null);
  const [formattingEmail, setFormattingEmail] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [popupError, setPopupError] = useState<string | null>(null);
  const [popupSuccess, setPopupSuccess] = useState<string | null>(null);

  const [calendarEditTaskId, setCalendarEditTaskId] = useState<string | null>(null);
  const [calendarEditTitle, setCalendarEditTitle] = useState("");
  const [calendarEditDescription, setCalendarEditDescription] = useState("");
  const [calendarEditDate, setCalendarEditDate] = useState("");
  const [calendarEditTime, setCalendarEditTime] = useState("");
  const [calendarEditEndTime, setCalendarEditEndTime] = useState("");
  const [calendarEditStars, setCalendarEditStars] = useState<StarLevel>(1);
  const [calendarEditColor, setCalendarEditColor] = useState<TagColor>("blue");

  const weekScrollRef = useRef<HTMLDivElement>(null);
  const dayScrollRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = viewMode === "week" ? weekScrollRef.current : dayScrollRef.current;
    if (target) setTimeout(() => { target.scrollTop = 7 * CELL_HEIGHT; }, 0);
  }, [viewMode, viewYear, viewMonth, viewDay]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) setViewMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function loadItems() {
      try {
        const response = await fetch("/api/items", { method: "GET" });
        if (!response.ok) return;
        const data = (await response.json()) as { items?: DbItem[] };
        if (!isMounted) return;
        setTasks((data.items ?? []).map(fromDbItem));
      } finally {
        if (isMounted) setItemsLoading(false);
      }
    }
    loadItems();
    return () => { isMounted = false; };
  }, []);

  async function addTask() {
    if (!taskTitle.trim() || !taskDate) return false;
    const [hour, minute] = taskTime.split(":").map(Number);
    const newTask: Task = {
      id: crypto.randomUUID(), title: taskTitle.trim(), description: taskDescription.trim(),
      date: taskDate, timeStr: taskTime, endTimeStr: taskEndTime, hour, minute,
      stars: taskStars, color: taskColor, done: false,
    };
    setTasks(prev => [newTask, ...prev]);
    try {
      const response = await fetch("/api/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toDbPayload(newTask)) });
      if (!response.ok) setTasks(prev => prev.filter(t => t.id !== newTask.id));
    } catch { setTasks(prev => prev.filter(t => t.id !== newTask.id)); }
    setTaskTitle(""); setTaskDescription("");
    return true;
  }

  async function deleteTask(id: string) {
    const previous = tasks;
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      const response = await fetch(`/api/items?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) setTasks(previous);
    } catch { setTasks(previous); }
  }

  function startEdit(t: Task) {
    setEditingId(t.id); setEditTitle(t.title); setEditDescription(t.description ?? "");
    setEditDate(t.date); setEditTime(t.timeStr); setEditEndTime(t.endTimeStr);
    setEditStars(t.stars); setEditColor(t.color);
  }

  async function saveEdit() {
    if (!editingId || !editTitle.trim()) return;
    const [hour, minute] = editTime.split(":").map(Number);
    const updatedTasks = tasks.map(t =>
      t.id === editingId ? { ...t, title: editTitle.trim(), description: editDescription.trim(), date: editDate, timeStr: editTime, endTimeStr: editEndTime, hour, minute, stars: editStars, color: editColor, done: t.done } : t
    );
    setTasks(updatedTasks);
    const updated = updatedTasks.find(t => t.id === editingId);
    if (updated) {
      try {
        const response = await fetch("/api/items", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toDbPayload(updated)) });
        if (!response.ok) setTasks(tasks);
      } catch { setTasks(tasks); }
    }
    setEditingId(null);
  }

  function cancelEdit() { setEditingId(null); }

  function openCalendarItemEdit(task: Task) {
    setCalendarEditTaskId(task.id); setCalendarEditTitle(task.title);
    setCalendarEditDescription(task.description ?? ""); setCalendarEditDate(task.date);
    setCalendarEditTime(task.timeStr); setCalendarEditEndTime(task.endTimeStr);
    setCalendarEditStars(task.stars); setCalendarEditColor(task.color);
  }

  function closeCalendarItemEdit() { setCalendarEditTaskId(null); }

  async function saveCalendarItemEdit() {
    if (!calendarEditTaskId || !calendarEditTitle.trim()) return;
    const [hour, minute] = calendarEditTime.split(":").map(Number);
    const updatedTasks = tasks.map((task) =>
      task.id === calendarEditTaskId
        ? { ...task, title: calendarEditTitle.trim(), description: calendarEditDescription.trim(), date: calendarEditDate, timeStr: calendarEditTime, endTimeStr: calendarEditEndTime, hour, minute, stars: calendarEditStars, color: calendarEditColor }
        : task
    );
    setTasks(updatedTasks);
    const updated = updatedTasks.find((task) => task.id === calendarEditTaskId);
    if (updated) {
      try {
        const response = await fetch("/api/items", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toDbPayload(updated)) });
        if (!response.ok) { setTasks(tasks); return; }
      } catch { setTasks(tasks); return; }
    }
    closeCalendarItemEdit();
  }

  async function toggleDone(id: string) {
    const existing = tasks.find(t => t.id === id);
    if (!existing) return;
    const nextDone = !existing.done;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: nextDone } : t));
    try {
      const response = await fetch("/api/items", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, complete: nextDone }) });
      if (!response.ok) { setTasks(prev => prev.map(t => t.id === id ? { ...t, done: existing.done } : t)); return; }
      if (nextDone && gmailTaskIds.has(id)) {
        setCompletionPopupTask({ ...existing, done: true });
        setSelectedRelationshipTag(null); setRelationshipDescription(""); setCompletionDetails("");
        setFormattedDraft(null); setPopupError(null); setPopupSuccess(null);
      }
    } catch { setTasks(prev => prev.map(t => t.id === id ? { ...t, done: existing.done } : t)); }
  }

  function closeCompletionPopup() {
    setCompletionPopupTask(null); setSelectedRelationshipTag(null); setRelationshipDescription("");
    setCompletionDetails(""); setFormattedDraft(null); setPopupError(null); setPopupSuccess(null);
  }

  async function formatCompletionDetails() {
    if (!completionPopupTask) return;
    if (!completionDetails.trim()) { setPopupError("Please describe what you have done before formatting."); return; }
    setFormattingEmail(true); setPopupError(null); setPopupSuccess(null);
    try {
      const response = await fetch("/api/gmail/format", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskName: completionPopupTask.title, relationshipTag: selectedRelationshipTag ?? "Recipient", relationshipDescription, completionDetails }),
      });
      const data = (await response.json()) as { subject?: string; body?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to format email draft");
      setFormattedDraft((prev) => ({
        recipient: prev?.recipient?.trim() ? prev.recipient : completionPopupTask.senderEmail ?? "",
        subject: data.subject ?? prev?.subject ?? "",
        body: data.body ?? prev?.body ?? "",
      }));
    } catch (error) {
      setPopupError(error instanceof Error ? error.message : "Failed to format email draft");
    } finally { setFormattingEmail(false); }
  }

  async function sendFormattedEmail() {
    if (!formattedDraft) return;
    if (!formattedDraft.recipient.trim() || !formattedDraft.subject.trim() || !formattedDraft.body.trim()) {
      setPopupError("Recipient, subject, and body are required before sending."); return;
    }
    setSendingEmail(true); setPopupError(null); setPopupSuccess(null);
    try {
      const response = await fetch("/api/gmail/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: formattedDraft.recipient, subject: formattedDraft.subject, body: formattedDraft.body }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to send email");
      closeCompletionPopup();
    } catch (error) {
      setPopupError(error instanceof Error ? error.message : "Failed to send email");
    } finally { setSendingEmail(false); }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function importGmailTasks() {
    if (gmailImporting) return;
    setGmailImporting(true); setGmailImportStatus(null);
    try {
      const base = new Date(viewYear, viewMonth, viewDay);
      const startOfWeek = new Date(base);
      startOfWeek.setDate(base.getDate() - base.getDay()); startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 7);
      const params = new URLSearchParams({ timeMin: startOfWeek.toISOString(), timeMax: endOfWeek.toISOString() });
      const response = await fetch(`/api/gmail/today/tasks?${params.toString()}`, { method: "GET", cache: "no-store" });
      const data = (await response.json()) as GmailTasksResponse;
      if (!response.ok) throw new Error(data.error ?? "Failed to import tasks from Gmail");
      const importedTasks = data.tasks ?? [];
      const toSignature = (task: Pick<Task, "title" | "date" | "timeStr" | "endTimeStr">) =>
        `${task.date}|${task.timeStr}|${task.endTimeStr}|${task.title.trim().toLowerCase()}`;
      const existingSignatures = new Set(tasks.map((task) => toSignature(task)));
      const seenImportSignatures = new Set<string>();
      const newTasks = importedTasks.filter((task) => {
        const signature = toSignature(task);
        if (existingSignatures.has(signature) || seenImportSignatures.has(signature)) return false;
        seenImportSignatures.add(signature); return true;
      }).map((task) => ({ ...task, id: crypto.randomUUID() }));
      if (newTasks.length === 0) { setGmailImportStatus("No new Gmail events found for this week."); return; }
      setTasks((prev) => [...newTasks, ...prev]);
      const results = await Promise.all(newTasks.map(async (task) => {
        const saveResponse = await fetch("/api/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toDbPayload(task)) });
        return { id: task.id, ok: saveResponse.ok };
      }));
      const failedIds = new Set(results.filter((result) => !result.ok).map((result) => result.id));
      if (failedIds.size > 0) setTasks((prev) => prev.filter((task) => !failedIds.has(task.id)));
      const successfulIds = newTasks.filter((task) => !failedIds.has(task.id)).map((task) => task.id);
      if (successfulIds.length > 0) setGmailTaskIds((prev) => { const next = new Set(prev); successfulIds.forEach((id) => next.add(id)); return next; });
      const savedCount = newTasks.length - failedIds.size;
      if (savedCount === 0) { setGmailImportStatus("Could not save Gmail events. Please try again."); return; }
      if (failedIds.size > 0) { setGmailImportStatus(`Added ${savedCount} Gmail events (${failedIds.size} failed).`); return; }
      setGmailImportStatus(`Added ${savedCount} Gmail events for this week.`);
    } catch (error) {
      setGmailImportStatus(error instanceof Error ? error.message : "Failed to import tasks from Gmail");
    } finally { setGmailImporting(false); }
  }

  async function importGoogleCalendarTasks() {
    if (calendarImporting) return;
    setCalendarImporting(true); setCalendarImportStatus(null);
    try {
      const base = new Date(viewYear, viewMonth, viewDay);
      const startOfWeek = new Date(base);
      startOfWeek.setDate(base.getDate() - base.getDay()); startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 7);
      const params = new URLSearchParams({ timeMin: startOfWeek.toISOString(), timeMax: endOfWeek.toISOString() });
      const response = await fetch(`/api/google-calendar/today?${params.toString()}`, { method: "GET", cache: "no-store" });
      const data = (await response.json()) as CalendarTasksResponse;
      if (!response.ok) throw new Error(data.error ?? "Failed to import Google Calendar events");
      const importedTasks = data.tasks ?? [];
      const toSignature = (task: Pick<Task, "title" | "date" | "timeStr" | "endTimeStr">) =>
        `${task.date}|${task.timeStr}|${task.endTimeStr}|${task.title.trim().toLowerCase()}`;
      const existingSignatures = new Set(tasks.map((task) => toSignature(task)));
      const seenImportSignatures = new Set<string>();
      const newTasks = importedTasks.filter((task) => {
        const signature = toSignature(task);
        if (existingSignatures.has(signature) || seenImportSignatures.has(signature)) return false;
        seenImportSignatures.add(signature); return true;
      }).map((task) => ({ ...task, id: crypto.randomUUID() }));
      if (newTasks.length === 0) { setCalendarImportStatus("No new Google Calendar events found for this week."); return; }
      setTasks((prev) => [...newTasks, ...prev]);
      const results = await Promise.all(newTasks.map(async (task) => {
        const saveResponse = await fetch("/api/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toDbPayload(task)) });
        return { id: task.id, ok: saveResponse.ok };
      }));
      const failedIds = new Set(results.filter((result) => !result.ok).map((result) => result.id));
      if (failedIds.size > 0) setTasks((prev) => prev.filter((task) => !failedIds.has(task.id)));
      const savedCount = newTasks.length - failedIds.size;
      if (savedCount === 0) { setCalendarImportStatus("Could not save Google Calendar events. Please try again."); return; }
      if (failedIds.size > 0) { setCalendarImportStatus(`Added ${savedCount} calendar events (${failedIds.size} failed).`); return; }
      setCalendarImportStatus(`Added ${savedCount} Google Calendar events for this week.`);
    } catch (error) {
      setCalendarImportStatus(error instanceof Error ? error.message : "Failed to import Google Calendar events");
    } finally { setCalendarImporting(false); }
  }

  const displayedTasks = sortByPriority ? [...tasks].sort((a, b) => b.stars - a.stars) : tasks;

  function goNext() {
    if (viewMode === "month") {
      if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1);
    } else if (viewMode === "week") {
      const d = new Date(viewYear, viewMonth, viewDay); d.setDate(d.getDate() + 7);
      setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); setViewDay(d.getDate());
    } else {
      const d = new Date(viewYear, viewMonth, viewDay); d.setDate(d.getDate() + 1);
      setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); setViewDay(d.getDate());
    }
  }
  function goPrev() {
    if (viewMode === "month") {
      if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1);
    } else if (viewMode === "week") {
      const d = new Date(viewYear, viewMonth, viewDay); d.setDate(d.getDate() - 7);
      setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); setViewDay(d.getDate());
    } else {
      const d = new Date(viewYear, viewMonth, viewDay); d.setDate(d.getDate() - 1);
      setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); setViewDay(d.getDate());
    }
  }
  function goToday() { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); setViewDay(today.getDate()); }

  function buildTitle() {
    if (viewMode === "month") return <>{MONTHS[viewMonth]} <span style={{ color: "#6366f1" }}>{viewYear}</span></>;
    if (viewMode === "week") {
      const base = new Date(viewYear, viewMonth, viewDay);
      const sun = new Date(base); sun.setDate(base.getDate() - base.getDay());
      const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
      const same = sun.getMonth() === sat.getMonth();
      return same
        ? <>{MONTHS[sun.getMonth()]} <span style={{ color: "#6366f1" }}>{sun.getFullYear()}</span></>
        : <>{MONTHS[sun.getMonth()]} – {MONTHS[sat.getMonth()]} <span style={{ color: "#6366f1" }}>{sat.getFullYear()}</span></>;
    }
    return <>{MONTHS[viewMonth]} {viewDay}, <span style={{ color: "#6366f1" }}>{viewYear}</span></>;
  }

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

  function getWeekDays() {
    const base = new Date(viewYear, viewMonth, viewDay);
    const sun = new Date(base); sun.setDate(base.getDate() - base.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sun); d.setDate(sun.getDate() + i);
      return { date: d, ds: toDateStr(d.getFullYear(), d.getMonth(), d.getDate()) };
    });
  }

  // ── Light theme style tokens ──────────────────────────────────────────
  const S: Record<string, React.CSSProperties> = {
    root: { height: "100vh", width: "100vw", display: "flex", background: "#f8fafc", color: "#1e293b", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", overflow: "hidden" },
    aside: { width: 280, minWidth: 280, display: "flex", flexDirection: "column", background: "#ffffff", borderRight: "1px solid #e2e8f0", boxShadow: "2px 0 8px rgba(0,0,0,0.02)" },
    panelHead: { padding: "20px 18px 16px", borderBottom: "1px solid #e2e8f0" },
    label: { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", display: "block", marginBottom: 5, fontWeight: 600 },
    input: { width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: "#1e293b", outline: "none", transition: "all 0.15s" },
    main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" },
    calHeader: { display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid #e2e8f0", background: "#ffffff", flexShrink: 0 },
  };

  const weekDays = getWeekDays();
  const monthCells = buildMonthCells();
  const currentDayStr = toDateStr(viewYear, viewMonth, viewDay);

  // Shared input style for popups
  const popupInput: React.CSSProperties = { width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#1e293b", outline: "none" };
  const darkInput: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#e5e7eb", outline: "none", colorScheme: "dark" as const };

  return (
    <div style={S.root}>
      {/* ── LEFT PANEL ──────────────────────────────────────────────── */}
      <aside style={S.aside}>
        <div style={S.panelHead}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 14 }}>✦</span>
            </div>
            <h2 style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6366f1", fontWeight: 700 }}>
              Task Manager
            </h2>
          </div>
          <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 14 }}>Add tasks directly to your calendar</p>
          
          {/* Button 1: Gmail Import - Purple/Indigo theme */}
          <button
            onClick={importGmailTasks} disabled={gmailImporting}
            style={{ marginTop: 4, width: "100%", padding: "9px 12px", borderRadius: 10, border: "none", background: gmailImporting ? "#c7d2fe" : "#eef2ff", color: gmailImporting ? "#6366f1" : "#4f46e5", fontSize: 12, fontWeight: 600, cursor: gmailImporting ? "not-allowed" : "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            onMouseEnter={e => { if (!gmailImporting) { e.currentTarget.style.background = "#e0e7ff"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
            onMouseLeave={e => { if (!gmailImporting) { e.currentTarget.style.background = "#eef2ff"; e.currentTarget.style.transform = "translateY(0)"; } }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 6L12 13 2 6M22 6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6l10 7 10-7z"/></svg>
            {gmailImporting ? "Importing Gmail events..." : "Import Gmail events"}
          </button>
          {gmailImportStatus && <p style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>{gmailImportStatus}</p>}
          
          {/* Button 2: Google Calendar Import - Blue/Azure theme */}
          <button
            onClick={importGoogleCalendarTasks} disabled={calendarImporting}
            style={{ marginTop: 8, width: "100%", padding: "9px 12px", borderRadius: 10, border: "none", background: calendarImporting ? "#bae6fd" : "#f0f9ff", color: calendarImporting ? "#0284c7" : "#0ea5e9", fontSize: 12, fontWeight: 600, cursor: calendarImporting ? "not-allowed" : "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            onMouseEnter={e => { if (!calendarImporting) { e.currentTarget.style.background = "#e0f2fe"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
            onMouseLeave={e => { if (!calendarImporting) { e.currentTarget.style.background = "#f0f9ff"; e.currentTarget.style.transform = "translateY(0)"; } }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {calendarImporting ? "Importing Calendar events..." : "Import Google Calendar"}
          </button>
          {calendarImportStatus && <p style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>{calendarImportStatus}</p>}
          
          {/* Button 3: Create Task - Green/Teal theme */}
          <button
            onClick={() => setCreateTaskPopupOpen(true)}
            style={{ marginTop: 8, width: "100%", padding: "9px 12px", borderRadius: 10, border: "none", background: "#ecfdf5", color: "#059669", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            onMouseEnter={e => { e.currentTarget.style.background = "#d1fae5"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#ecfdf5"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            Create task
          </button>
        </div>

        {/* Sort bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px 8px", flexShrink: 0 }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", fontWeight: 600 }}>My Tasks</span>
          <button onClick={() => setSortByPriority(v => !v)} style={{
            display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "5px 12px", borderRadius: 20, cursor: "pointer", transition: "all 0.2s",
            border: sortByPriority ? "1px solid #fbbf24" : "1px solid #e2e8f0",
            background: sortByPriority ? "rgba(251,191,36,0.1)" : "#f8fafc",
            color: sortByPriority ? "#d97706" : "#64748b",
          }}>
            <SortIcon /> Sort by priority
          </button>
        </div>

        {/* Task list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {!itemsLoading && displayedTasks.length === 0 && (
            <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", marginTop: 32 }}>No tasks yet. Create one above.</p>
          )}
          {displayedTasks.map(t => {
            const cs = COLOR_STYLES[t.color];
            const isEditing = editingId === t.id;

            if (isEditing) {
              const ecs = COLOR_STYLES[editColor];
              return (
                <div key={t.id} style={{ borderRadius: 12, border: `1px solid ${ecs.border}`, padding: "12px", background: ecs.bg, display: "flex", flexDirection: "column", gap: 8 }}>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                    autoFocus style={{ ...darkInput }} />
                  <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Task description"
                    style={{ ...darkInput, minHeight: 72, resize: "vertical" }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{ flex: 1, ...darkInput }} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>Start</div>
                      <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} style={{ width: "100%", ...darkInput }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>End</div>
                      <input type="time" value={editEndTime} onChange={e => setEditEndTime(e.target.value)} style={{ width: "100%", ...darkInput }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {([1, 2, 3] as StarLevel[]).map(lvl => (
                      <button key={lvl} onClick={() => setEditStars(lvl)} style={{ flex: 1, padding: "4px 0", borderRadius: 6, cursor: "pointer", fontSize: 11, border: editStars === lvl ? "1px solid #fbbf24" : "1px solid rgba(255,255,255,.12)", background: editStars === lvl ? "rgba(251,191,36,.15)" : "rgba(255,255,255,.05)", color: editStars === lvl ? "#fcd34d" : "#6b7280" }}>{"★".repeat(lvl)}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["blue","rose","green"] as TagColor[]).map(c => {
                      const ccs = COLOR_STYLES[c];
                      return (
                        <button key={c} onClick={() => setEditColor(c)} style={{ flex: 1, padding: "5px 0", borderRadius: 6, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: ccs.bg, border: `1px solid ${ccs.border}`, opacity: editColor === c ? 1 : 0.4, outline: editColor === c ? `2px solid ${ccs.border}` : "none", outlineOffset: 1 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: ccs.dot }} />
                          <span style={{ fontSize: 9, color: "#9ca3af" }}>{COLOR_LABELS[c]}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={saveEdit} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: "#6366f1", color: "#fff" }}>Save</button>
                    <button onClick={cancelEdit} style={{ flex: 1, padding: "6px 0", borderRadius: 8, cursor: "pointer", fontSize: 12, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#64748b" }}>Cancel</button>
                  </div>
                </div>
              );
            }

            return (
              <div key={t.id} style={{ borderRadius: 12, border: `1px solid ${cs.border}`, padding: "12px", position: "relative", background: t.done && t.color === "green" ? "#f8fafc" : cs.bg, opacity: t.done && t.color === "green" ? 0.75 : 1, transition: "all 0.2s" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  {t.color === "green" && (
                    <button onClick={() => toggleDone(t.id)} title={t.done ? "Mark incomplete" : "Mark complete"} style={{ flexShrink: 0, marginTop: 2, width: 18, height: 18, borderRadius: 6, cursor: "pointer", border: t.done ? `2px solid ${cs.dot}` : "2px solid #cbd5e1", background: t.done ? cs.dot : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", padding: 0 }}>
                      {t.done && <svg width="10" height="10" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>}
                    </button>
                  )}
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 44 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.done && t.color === "green" ? "#94a3b8" : "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: t.done && t.color === "green" ? "line-through" : "none" }}>
                      {t.title}
                    </div>
                    {t.description && (
                      <div style={{ marginTop: 4, fontSize: 11, color: t.done && t.color === "green" ? "#94a3b8" : "#64748b", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", textDecoration: t.done && t.color === "green" ? "line-through" : "none" }}>
                        {t.description}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>{t.date}</span>
                      {t.timeStr && <span style={{ marginLeft: "auto", fontSize: 10, color: "#94a3b8" }}>{fmt12(t.timeStr)}{t.endTimeStr ? ` – ${fmt12(t.endTimeStr)}` : ""}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.done && t.color === "green" ? "#cbd5e1" : cs.dot }} />
                      <span style={{ color: t.done && t.color === "green" ? "#cbd5e1" : "#f59e0b", fontSize: 11 }}>{"★".repeat(t.stars)}{"☆".repeat(3 - t.stars)}</span>
                    </div>
                  </div>
                </div>
                <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6 }}>
                  <button onClick={() => startEdit(t)} title="Edit" style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 13, padding: "2px 4px", borderRadius: 4, transition: "color 0.2s" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#6366f1")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#94a3b8")}
                  >✎</button>
                  <button onClick={() => deleteTask(t.id)} title="Delete" style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 13, padding: "2px 4px", borderRadius: 4, transition: "color 0.2s" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#94a3b8")}
                  >✕</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── LOGOUT ── */}
        <div style={{ padding: "14px 18px", borderTop: "1px solid #e2e8f0", flexShrink: 0 }}>
          <button
            onClick={handleLogout}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, cursor: "pointer", background: "#fef2f2", border: "1px solid #fee2e2", color: "#ef4444", fontSize: 13, fontWeight: 600, transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#fee2e2"; e.currentTarget.style.borderColor = "#fecaca"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#fee2e2"; }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
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
        <div style={S.calHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 4 }}>
            <button onClick={goPrev} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex", transition: "background 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.background = "#e2e8f0"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            ><ChevronLeft /></button>
            <button onClick={goNext} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex", transition: "background 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.background = "#e2e8f0"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            ><ChevronRight /></button>
          </div>

          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.01em" }}>{buildTitle()}</h1>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={goToday} style={{ fontSize: 12, padding: "7px 16px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b", cursor: "pointer", fontWeight: 500, transition: "all 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
            >
              Today
            </button>
            <div ref={viewMenuRef} style={{ position: "relative" }}>
              <button onClick={() => setViewMenuOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "7px 16px", borderRadius: 10, background: "#eef2ff", border: "1px solid #c7d2fe", color: "#4f46e5", cursor: "pointer", whiteSpace: "nowrap", fontWeight: 500, transition: "all 0.2s" }}>
                {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
                <ChevronDown size={10} />
              </button>
              {viewMenuOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", zIndex: 1000, minWidth: 140, boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }}>
                  {(["month","week","day"] as ViewMode[]).map(v => (
                    <div key={v} onClick={() => { setViewMode(v); setViewMenuOpen(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", fontSize: 13, cursor: "pointer", color: viewMode === v ? "#4f46e5" : "#475569", background: viewMode === v ? "#eef2ff" : "transparent", transition: "background 0.15s" }}
                      onMouseEnter={e => { if (viewMode !== v) e.currentTarget.style.background = "#f8fafc"; }}
                      onMouseLeave={e => { if (viewMode !== v) e.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{ opacity: viewMode === v ? 1 : 0 }}><CheckIcon /></span>
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
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", background: "#ffffff" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid #e2e8f0", flexShrink: 0, background: "#fafbfc" }}>
              {DAYS_SHORT.map(d => (
                <div key={d} style={{ padding: "12px 8px", textAlign: "center", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8" }}>
                  {d}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridTemplateRows: "repeat(6,1fr)", overflow: "hidden" }}>
              {monthCells.map((cell, idx) => {
                const ds = toDateStr(cell.y, cell.m, cell.d);
                const isToday = ds === todayStr();
                const cellTasks = tasks.filter(t => t.date === ds);
                const isCurrentMonth = cell.cur;
                return (
                  <div key={idx} style={{ 
                    borderBottom: "1px solid #f1f5f9", 
                    borderRight: "1px solid #f1f5f9", 
                    padding: "8px 6px", 
                    display: "flex", 
                    flexDirection: "column", 
                    overflow: "hidden", 
                    background: isCurrentMonth ? "#ffffff" : "#fafbfc",
                    transition: "background 0.15s",
                  }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      fontSize: 13,
                      fontWeight: isToday ? 600 : 400,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 6,
                      background: isToday ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "transparent",
                      color: isToday ? "#ffffff" : isCurrentMonth ? "#334155" : "#cbd5e1",
                      boxShadow: isToday ? "0 2px 8px rgba(99,102,241,0.3)" : "none",
                    }}>
                      {cell.d}
                    </div>
                    {cellTasks.slice(0, 3).map(t => (
                      <Chip key={t.id} task={t} onDoubleClick={openCalendarItemEdit} />
                    ))}
                    {cellTasks.length > 3 && (
                      <span style={{ fontSize: 9, color: "#94a3b8", padding: "2px 4px" }}>+{cellTasks.length - 3} more</span>
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
            <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", flexShrink: 0, background: "#ffffff" }}>
              <div style={{ width: 56, minWidth: 56, flexShrink: 0, borderRight: "1px solid #e2e8f0", padding: "8px 0" }}>
                <div style={{ fontSize: 9, color: "#94a3b8", textAlign: "right", paddingRight: 8, paddingTop: 2 }}>GMT+08</div>
              </div>
              {weekDays.map(({ date, ds }, i) => {
                const isToday = ds === todayStr();
                return (
                  <div key={i} style={{ flex: 1, textAlign: "center", padding: "10px 4px 12px", borderRight: "1px solid #f1f5f9" }}>
                    <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: isToday ? "#6366f1" : "#94a3b8", fontWeight: 600, marginBottom: 6 }}>
                      {DAYS_SHORT[i]}
                    </div>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 20, fontWeight: 500, background: isToday ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "transparent", color: isToday ? "#ffffff" : "#334155", boxShadow: isToday ? "0 2px 8px rgba(99,102,241,0.3)" : "none" }}>
                      {date.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
            <div ref={weekScrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", minHeight: 0, background: "#ffffff" }}>
              <TimeLabels />
              <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
                {weekDays.map(({ ds }, i) => (
                  <DayColumn key={i} tasks={tasks} dateStr={ds} onTaskDoubleClick={openCalendarItemEdit} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── DAY VIEW ── */}
        {viewMode === "day" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
            <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", flexShrink: 0, background: "#ffffff" }}>
              <div style={{ width: 56, minWidth: 56, flexShrink: 0, borderRight: "1px solid #e2e8f0", padding: "8px 0" }}>
                <div style={{ fontSize: 9, color: "#94a3b8", textAlign: "right", paddingRight: 8, paddingTop: 2 }}>GMT+08</div>
              </div>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 4px 12px", borderRight: "1px solid #f1f5f9" }}>
                <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: currentDayStr === todayStr() ? "#6366f1" : "#94a3b8", fontWeight: 600, marginBottom: 6 }}>
                  {DAYS_SHORT[new Date(viewYear, viewMonth, viewDay).getDay()]}
                </div>
                <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 20, fontWeight: 500, background: currentDayStr === todayStr() ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "transparent", color: currentDayStr === todayStr() ? "#ffffff" : "#334155", boxShadow: currentDayStr === todayStr() ? "0 2px 8px rgba(99,102,241,0.3)" : "none" }}>
                  {viewDay}
                </div>
              </div>
            </div>
            <div ref={dayScrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", minHeight: 0, background: "#ffffff" }}>
              <TimeLabels />
              <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
                <DayColumn tasks={tasks} dateStr={currentDayStr} onTaskDoubleClick={openCalendarItemEdit} />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── CREATE TASK POPUP ── */}
      {createTaskPopupOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1220 }}>
          <div style={{ width: "min(520px, 100%)", maxHeight: "min(90vh, 780px)", overflowY: "auto", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 20, padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.15)", color: "#1e293b", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Create new task</div>
              <button onClick={() => setCreateTaskPopupOpen(false)} style={{ border: "none", background: "#f1f5f9", color: "#64748b", cursor: "pointer", fontSize: 18, width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            <input style={popupInput} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)}
              onKeyDown={async (e) => { if (e.key !== "Enter") return; const created = await addTask(); if (created) setCreateTaskPopupOpen(false); }}
              placeholder="Task title..." autoFocus />
            <textarea style={{ ...popupInput, minHeight: 80, resize: "vertical" }} value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="Task description..." />
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={S.label}>DATE</label>
                <input style={popupInput} type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={S.label}>START</label>
                <input style={popupInput} type="time" value={taskTime} onChange={(e) => setTaskTime(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={S.label}>END</label>
                <input style={popupInput} type="time" value={taskEndTime} onChange={(e) => setTaskEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <label style={S.label}>PRIORITY</label>
              <div style={{ display: "flex", gap: 8 }}>
                {([1, 2, 3] as StarLevel[]).map((lvl) => (
                  <button key={lvl} onClick={() => setTaskStars(lvl)} style={{ flex: 1, padding: "8px 0", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s", border: taskStars === lvl ? "1px solid #f59e0b" : "1px solid #e2e8f0", background: taskStars === lvl ? "rgba(245,158,11,0.1)" : "#f8fafc", color: taskStars === lvl ? "#d97706" : "#64748b" }}>{"★".repeat(lvl)}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={S.label}>CATEGORY</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["blue", "rose", "green"] as TagColor[]).map((color) => {
                  const cs = COLOR_STYLES[color];
                  const active = taskColor === color;
                  return (
                    <button key={color} onClick={() => setTaskColor(color)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transition: "all 0.2s", opacity: active ? 1 : 0.6, background: cs.bg, border: `1px solid ${cs.border}`, outline: active ? `2px solid ${cs.border}` : "none", outlineOffset: 2 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: cs.dot }} />
                      <span style={{ fontSize: 10, color: "#64748b" }}>{COLOR_LABELS[color]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <button onClick={() => setCreateTaskPopupOpen(false)} style={{ padding: "9px 18px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 500, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b" }}>Cancel</button>
              <button onClick={async () => { const created = await addTask(); if (created) setCreateTaskPopupOpen(false); }} disabled={!taskTitle.trim()}
                style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: taskTitle.trim() ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "#cbd5e1", color: "#fff", fontSize: 12, fontWeight: 600, cursor: taskTitle.trim() ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT CALENDAR ITEM POPUP ── */}
      {calendarEditTaskId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1250 }}>
          <div style={{ width: "min(560px, 100%)", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 20, padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.15)", color: "#1e293b", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Edit calendar item</div>
            <input value={calendarEditTitle} onChange={(e) => setCalendarEditTitle(e.target.value)} placeholder="Task title" style={popupInput} />
            <textarea value={calendarEditDescription} onChange={(e) => setCalendarEditDescription(e.target.value)} placeholder="Task description" style={{ ...popupInput, minHeight: 80, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <input type="date" value={calendarEditDate} onChange={(e) => setCalendarEditDate(e.target.value)} style={{ flex: 1, ...popupInput }} />
              <input type="time" value={calendarEditTime} onChange={(e) => setCalendarEditTime(e.target.value)} style={{ flex: 1, ...popupInput }} />
              <input type="time" value={calendarEditEndTime} onChange={(e) => setCalendarEditEndTime(e.target.value)} style={{ flex: 1, ...popupInput }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {([1, 2, 3] as StarLevel[]).map((lvl) => (
                <button key={lvl} onClick={() => setCalendarEditStars(lvl)} style={{ flex: 1, padding: "8px 0", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 600, border: calendarEditStars === lvl ? "1px solid #f59e0b" : "1px solid #e2e8f0", background: calendarEditStars === lvl ? "rgba(245,158,11,0.1)" : "#f8fafc", color: calendarEditStars === lvl ? "#d97706" : "#64748b" }}>{"★".repeat(lvl)}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["blue", "rose", "green"] as TagColor[]).map((color) => {
                const cs = COLOR_STYLES[color];
                const active = calendarEditColor === color;
                return (
                  <button key={color} onClick={() => setCalendarEditColor(color)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer", background: cs.bg, border: `1px solid ${cs.border}`, opacity: active ? 1 : 0.55, outline: active ? `2px solid ${cs.border}` : "none", outlineOffset: 2 }}>
                    <span style={{ fontSize: 11, color: "#475569", fontWeight: 500 }}>{COLOR_LABELS[color]}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <button onClick={closeCalendarItemEdit} style={{ padding: "9px 18px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 500, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b" }}>Cancel</button>
              <button onClick={saveCalendarItemEdit} style={{ padding: "9px 20px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff" }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPLETION / EMAIL POPUP ── */}
      {completionPopupTask && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1200 }}>
          <div style={{ width: "min(980px, 100%)", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 20, padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.15)", color: "#1e293b" }}>
            <div style={{ display: "grid", gridTemplateColumns: formattedDraft ? "1fr 1fr" : "1fr", gap: 20 }}>
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                  {RELATIONSHIP_TAGS.map((tag) => {
                    const active = selectedRelationshipTag === tag;
                    return (
                      <button key={tag} onClick={() => setSelectedRelationshipTag(tag)} style={{ borderRadius: 20, border: active ? "1px solid #6366f1" : "1px solid #e2e8f0", background: active ? "#eef2ff" : "#f8fafc", color: active ? "#4f46e5" : "#475569", fontSize: 12, padding: "6px 14px", cursor: "pointer", fontWeight: 500 }}>
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <input value={relationshipDescription} onChange={(e) => setRelationshipDescription(e.target.value)} placeholder="Description of relation with recipient"
                  style={{ width: "100%", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#1e293b", padding: "10px 12px", fontSize: 13, marginBottom: 12, outline: "none" }} />
                <textarea value={completionDetails} onChange={(e) => setCompletionDetails(e.target.value)} placeholder={`What you have done for ${completionPopupTask.title}`}
                  style={{ width: "100%", minHeight: 260, borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#1e293b", padding: "12px", fontSize: 13, resize: "vertical", outline: "none" }} />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                  <button onClick={closeCompletionPopup} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Cancel</button>
                  <button onClick={formatCompletionDetails} disabled={formattingEmail} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: formattingEmail ? "#a5b4fc" : "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 12, cursor: formattingEmail ? "not-allowed" : "pointer", fontWeight: 600 }}>
                    {formattingEmail ? "Formatting..." : "Format Email"}
                  </button>
                </div>
              </div>

              {formattedDraft && (
                <div style={{ borderRadius: 16, border: "1px solid #e2e8f0", background: "#f8fafc", padding: 16, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <input value={formattedDraft.recipient} onChange={(e) => setFormattedDraft((prev) => prev ? { ...prev, recipient: e.target.value } : prev)} placeholder="Recipient email"
                    style={{ width: "100%", borderRadius: 10, border: "1px solid #e2e8f0", background: "#ffffff", color: "#1e293b", padding: "10px 12px", fontSize: 13, marginBottom: 10, outline: "none" }} />
                  <input value={formattedDraft.subject} onChange={(e) => setFormattedDraft((prev) => prev ? { ...prev, subject: e.target.value } : prev)} placeholder="Email subject"
                    style={{ width: "100%", borderRadius: 10, border: "1px solid #e2e8f0", background: "#ffffff", color: "#1e293b", padding: "10px 12px", fontSize: 13, marginBottom: 10, outline: "none" }} />
                  <textarea value={formattedDraft.body} onChange={(e) => setFormattedDraft((prev) => prev ? { ...prev, body: e.target.value } : prev)} placeholder="Formatted email body"
                    style={{ width: "100%", minHeight: 194, borderRadius: 10, border: "1px solid #e2e8f0", background: "#ffffff", color: "#1e293b", padding: "12px", fontSize: 13, resize: "vertical", outline: "none", marginBottom: 12 }} />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={sendFormattedEmail} disabled={sendingEmail} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: sendingEmail ? "#6ee7b7" : "linear-gradient(135deg, #10b981, #34d399)", color: "#fff", fontSize: 12, cursor: sendingEmail ? "not-allowed" : "pointer", fontWeight: 600 }}>
                      {sendingEmail ? "Sending..." : "Send Email"}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {popupError && <p style={{ marginTop: 12, fontSize: 12, color: "#ef4444" }}>{popupError}</p>}
            {popupSuccess && <p style={{ marginTop: 12, fontSize: 12, color: "#10b981" }}>{popupSuccess}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
