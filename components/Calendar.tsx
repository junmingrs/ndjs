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
        cursor: "pointer",
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
        if (parsedEndMins > startMins) {
          endMins = parsedEndMins;
        }
      }

      return {
        task,
        startMins,
        endMins,
      };
    })
    .sort((a, b) => a.startMins - b.startMins || a.endMins - b.endMins);

  const clusterLaneCount = new Map<number, number>();
  const laidOutTasks: Array<{
    task: Task;
    startMins: number;
    endMins: number;
    lane: number;
    clusterId: number;
  }> = [];

  let active: Array<{ endMins: number; lane: number }> = [];
  let laneEnds: number[] = [];
  let clusterId = -1;

  for (const entry of positionedTasks) {
    active = active.filter((item) => item.endMins > entry.startMins);

    if (active.length === 0) {
      clusterId += 1;
      laneEnds = [];
    }

    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > entry.startMins) {
      lane += 1;
    }

    if (lane === laneEnds.length) {
      laneEnds.push(entry.endMins);
    } else {
      laneEnds[lane] = entry.endMins;
    }

    active.push({ endMins: entry.endMins, lane });

    laidOutTasks.push({
      ...entry,
      lane,
      clusterId,
    });

    const currentMax = clusterLaneCount.get(clusterId) ?? 0;
    clusterLaneCount.set(clusterId, Math.max(currentMax, lane + 1));
  }

  return (
    <div style={{ flex: 1, borderRight: "1px solid rgba(255,255,255,.08)", position: "relative", minWidth: 0 }}>
      {/* Hour grid lines */}
      {HOUR_LABELS.map((_, h) => (
        <div key={h} style={{ height: CELL_HEIGHT, borderBottom: "1px solid rgba(255,255,255,.06)" }} />
      ))}

      {/* Absolutely positioned event blocks spanning full duration */}
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
              position: "absolute",
              top,
              left,
              width,
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
              cursor: "pointer",
            }}
          >
            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t.done ? "rgba(255,255,255,.4)" : "rgba(255,255,255,.9)", textDecoration: t.done ? "line-through" : "none" }}>
              {t.title}
            </div>
            {height > 56 && t.description && (
              <div style={{
                marginTop: 2,
                fontSize: 10,
                color: t.done ? "rgba(255,255,255,.25)" : "rgba(229,231,235,.75)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {t.description}
              </div>
            )}
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
  const [editDescription, setEditDescription] = useState("");
  const [editDate,  setEditDate]  = useState("");
  const [editTime,  setEditTime]  = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editStars, setEditStars] = useState<StarLevel>(1);
  const [editColor, setEditColor] = useState<TagColor>("blue");

  // Form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDate,  setTaskDate]  = useState(todayStr());
  const [taskTime,  setTaskTime]  = useState("09:00");
  const [taskEndTime, setTaskEndTime] = useState("10:00");
  const [taskStars, setTaskStars] = useState<StarLevel>(1);
  const [taskColor, setTaskColor] = useState<TagColor>("blue");

  const [itemsLoading, setItemsLoading] = useState(true);
  const [gmailImporting, setGmailImporting] = useState(false);
  const [gmailImportStatus, setGmailImportStatus] = useState<string | null>(null);
  const [calendarImporting, setCalendarImporting] = useState(false);
  const [calendarImportStatus, setCalendarImportStatus] = useState<string | null>(null);
  const [gmailTaskIds, setGmailTaskIds] = useState<Set<string>>(new Set());

  // Gmail completion popup state
  const [completionPopupTask, setCompletionPopupTask] = useState<Task | null>(null);
  const [selectedRelationshipTag, setSelectedRelationshipTag] = useState<RelationshipTag | null>(null);
  const [relationshipDescription, setRelationshipDescription] = useState("");
  const [completionDetails, setCompletionDetails] = useState("");
  const [formattedDraft, setFormattedDraft] = useState<FormattedDraft | null>(null);
  const [formattingEmail, setFormattingEmail] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [popupError, setPopupError] = useState<string | null>(null);
  const [popupSuccess, setPopupSuccess] = useState<string | null>(null);

  // Calendar-item popup edit state (double-click on calendar blocks)
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

  useEffect(() => {
    let isMounted = true;

    async function loadItems() {
      try {
        const response = await fetch("/api/items", { method: "GET" });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { items?: DbItem[] };
        if (!isMounted) {
          return;
        }

        setTasks((data.items ?? []).map(fromDbItem));
      } finally {
        if (isMounted) {
          setItemsLoading(false);
        }
      }
    }

    loadItems();

    return () => {
      isMounted = false;
    };
  }, []);

  // ── Task helpers ──────────────────────────────────────────────────────
  async function addTask() {
    if (!taskTitle.trim() || !taskDate) return;
    const [hour, minute] = taskTime.split(":").map(Number);
    const newTask: Task = {
      id: crypto.randomUUID(),
      title: taskTitle.trim(),
      description: taskDescription.trim(),
      date: taskDate,
      timeStr: taskTime,
      endTimeStr: taskEndTime,
      hour,
      minute,
      stars: taskStars,
      color: taskColor,
      done: false,
    };

    setTasks(prev => [newTask, ...prev]);

    try {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toDbPayload(newTask)),
      });

      if (!response.ok) {
        setTasks(prev => prev.filter(t => t.id !== newTask.id));
      }
    } catch {
      setTasks(prev => prev.filter(t => t.id !== newTask.id));
    }

    setTaskTitle("");
    setTaskDescription("");
  }

  async function deleteTask(id: string) {
    const previous = tasks;
    setTasks(prev => prev.filter(t => t.id !== id));

    try {
      const response = await fetch(`/api/items?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setTasks(previous);
      }
    } catch {
      setTasks(previous);
    }
  }

  function startEdit(t: Task) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditDescription(t.description ?? "");
    setEditDate(t.date);
    setEditTime(t.timeStr);
    setEditEndTime(t.endTimeStr);
    setEditStars(t.stars);
    setEditColor(t.color);
  }

  async function saveEdit() {
    if (!editingId || !editTitle.trim()) return;
    const [hour, minute] = editTime.split(":").map(Number);
    const updatedTasks = tasks.map(t =>
      t.id === editingId
        ? { ...t, title: editTitle.trim(), description: editDescription.trim(), date: editDate, timeStr: editTime, endTimeStr: editEndTime, hour, minute, stars: editStars, color: editColor, done: t.done }
        : t
    );
    setTasks(updatedTasks);

    const updated = updatedTasks.find(t => t.id === editingId);
    if (updated) {
      try {
        const response = await fetch("/api/items", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toDbPayload(updated)),
        });

        if (!response.ok) {
          setTasks(tasks);
        }
      } catch {
        setTasks(tasks);
      }
    }

    setEditingId(null);
  }

  function cancelEdit() { setEditingId(null); }

  function openCalendarItemEdit(task: Task) {
    setCalendarEditTaskId(task.id);
    setCalendarEditTitle(task.title);
    setCalendarEditDescription(task.description ?? "");
    setCalendarEditDate(task.date);
    setCalendarEditTime(task.timeStr);
    setCalendarEditEndTime(task.endTimeStr);
    setCalendarEditStars(task.stars);
    setCalendarEditColor(task.color);
  }

  function closeCalendarItemEdit() {
    setCalendarEditTaskId(null);
  }

  async function saveCalendarItemEdit() {
    if (!calendarEditTaskId || !calendarEditTitle.trim()) {
      return;
    }

    const [hour, minute] = calendarEditTime.split(":").map(Number);
    const updatedTasks = tasks.map((task) =>
      task.id === calendarEditTaskId
        ? {
            ...task,
            title: calendarEditTitle.trim(),
            description: calendarEditDescription.trim(),
            date: calendarEditDate,
            timeStr: calendarEditTime,
            endTimeStr: calendarEditEndTime,
            hour,
            minute,
            stars: calendarEditStars,
            color: calendarEditColor,
          }
        : task
    );

    setTasks(updatedTasks);

    const updated = updatedTasks.find((task) => task.id === calendarEditTaskId);
    if (updated) {
      try {
        const response = await fetch("/api/items", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toDbPayload(updated)),
        });

        if (!response.ok) {
          setTasks(tasks);
          return;
        }
      } catch {
        setTasks(tasks);
        return;
      }
    }

    closeCalendarItemEdit();
  }

  async function toggleDone(id: string) {
    const existing = tasks.find(t => t.id === id);
    if (!existing) {
      return;
    }

    const nextDone = !existing.done;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: nextDone } : t));

    try {
      const response = await fetch("/api/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, complete: nextDone }),
      });

      if (!response.ok) {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, done: existing.done } : t));
        return;
      }

      if (nextDone && gmailTaskIds.has(id)) {
        setCompletionPopupTask({ ...existing, done: true });
        setSelectedRelationshipTag(null);
        setRelationshipDescription("");
        setCompletionDetails("");
        setFormattedDraft(null);
        setPopupError(null);
        setPopupSuccess(null);
      }
    } catch {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, done: existing.done } : t));
    }
  }

  function closeCompletionPopup() {
    setCompletionPopupTask(null);
    setSelectedRelationshipTag(null);
    setRelationshipDescription("");
    setCompletionDetails("");
    setFormattedDraft(null);
    setPopupError(null);
    setPopupSuccess(null);
  }

  async function formatCompletionDetails() {
    if (!completionPopupTask) {
      return;
    }

    if (!completionDetails.trim()) {
      setPopupError("Please describe what you have done before formatting.");
      return;
    }

    setFormattingEmail(true);
    setPopupError(null);
    setPopupSuccess(null);

    try {
      const response = await fetch("/api/gmail/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskName: completionPopupTask.title,
          relationshipTag: selectedRelationshipTag ?? "Recipient",
          relationshipDescription,
          completionDetails,
        }),
      });

      const data = (await response.json()) as { subject?: string; body?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to format email draft");
      }

      setFormattedDraft((prev) => ({
        recipient: prev?.recipient?.trim() ? prev.recipient : completionPopupTask.senderEmail ?? "",
        subject: data.subject ?? prev?.subject ?? "",
        body: data.body ?? prev?.body ?? "",
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to format email draft";
      setPopupError(message);
    } finally {
      setFormattingEmail(false);
    }
  }

  async function sendFormattedEmail() {
    if (!formattedDraft) {
      return;
    }

    if (!formattedDraft.recipient.trim() || !formattedDraft.subject.trim() || !formattedDraft.body.trim()) {
      setPopupError("Recipient, subject, and body are required before sending.");
      return;
    }

    setSendingEmail(true);
    setPopupError(null);
    setPopupSuccess(null);

    try {
      const response = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: formattedDraft.recipient,
          subject: formattedDraft.subject,
          body: formattedDraft.body,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to send email");
      }

      closeCompletionPopup();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send email";
      setPopupError(message);
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function importGmailTasks() {
    if (gmailImporting) {
      return;
    }

    setGmailImporting(true);
    setGmailImportStatus(null);

    try {
      const base = new Date(viewYear, viewMonth, viewDay);
      const startOfWeek = new Date(base);
      startOfWeek.setDate(base.getDate() - base.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

      const params = new URLSearchParams({
        timeMin: startOfWeek.toISOString(),
        timeMax: endOfWeek.toISOString(),
      });

      const response = await fetch(`/api/gmail/today/tasks?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as GmailTasksResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to import tasks from Gmail");
      }

      const importedTasks = data.tasks ?? [];
      const toSignature = (task: Pick<Task, "title" | "date" | "timeStr" | "endTimeStr">) =>
        `${task.date}|${task.timeStr}|${task.endTimeStr}|${task.title.trim().toLowerCase()}`;

      const existingSignatures = new Set(tasks.map((task) => toSignature(task)));
      const seenImportSignatures = new Set<string>();

      const newTasks = importedTasks
        .filter((task) => {
          const signature = toSignature(task);
          if (existingSignatures.has(signature) || seenImportSignatures.has(signature)) {
            return false;
          }
          seenImportSignatures.add(signature);
          return true;
        })
        .map((task) => ({ ...task, id: crypto.randomUUID() }));

      if (newTasks.length === 0) {
        setGmailImportStatus("No new Gmail events found for this week.");
        return;
      }

      setTasks((prev) => [...newTasks, ...prev]);

      const results = await Promise.all(
        newTasks.map(async (task) => {
          const saveResponse = await fetch("/api/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(toDbPayload(task)),
          });

          return { id: task.id, ok: saveResponse.ok };
        })
      );

      const failedIds = new Set(results.filter((result) => !result.ok).map((result) => result.id));
      if (failedIds.size > 0) {
        setTasks((prev) => prev.filter((task) => !failedIds.has(task.id)));
      }

      const successfulIds = newTasks
        .filter((task) => !failedIds.has(task.id))
        .map((task) => task.id);
      if (successfulIds.length > 0) {
        setGmailTaskIds((prev) => {
          const next = new Set(prev);
          successfulIds.forEach((id) => next.add(id));
          return next;
        });
      }

      const savedCount = newTasks.length - failedIds.size;
      if (savedCount === 0) {
        setGmailImportStatus("Could not save Gmail events. Please try again.");
        return;
      }

      if (failedIds.size > 0) {
        setGmailImportStatus(`Added ${savedCount} Gmail events (${failedIds.size} failed).`);
        return;
      }

      setGmailImportStatus(`Added ${savedCount} Gmail events for this week.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import tasks from Gmail";
      setGmailImportStatus(message);
    } finally {
      setGmailImporting(false);
    }
  }

  async function importGoogleCalendarTasks() {
    if (calendarImporting) {
      return;
    }

    setCalendarImporting(true);
    setCalendarImportStatus(null);

    try {
      const base = new Date(viewYear, viewMonth, viewDay);
      const startOfWeek = new Date(base);
      startOfWeek.setDate(base.getDate() - base.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

      const params = new URLSearchParams({
        timeMin: startOfWeek.toISOString(),
        timeMax: endOfWeek.toISOString(),
      });

      const response = await fetch(`/api/google-calendar/today?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as CalendarTasksResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to import Google Calendar events");
      }

      const importedTasks = data.tasks ?? [];
      const toSignature = (task: Pick<Task, "title" | "date" | "timeStr" | "endTimeStr">) =>
        `${task.date}|${task.timeStr}|${task.endTimeStr}|${task.title.trim().toLowerCase()}`;

      const existingSignatures = new Set(tasks.map((task) => toSignature(task)));
      const seenImportSignatures = new Set<string>();

      const newTasks = importedTasks
        .filter((task) => {
          const signature = toSignature(task);
          if (existingSignatures.has(signature) || seenImportSignatures.has(signature)) {
            return false;
          }
          seenImportSignatures.add(signature);
          return true;
        })
        .map((task) => ({ ...task, id: crypto.randomUUID() }));

      if (newTasks.length === 0) {
        setCalendarImportStatus("No new Google Calendar events found for this week.");
        return;
      }

      setTasks((prev) => [...newTasks, ...prev]);

      const results = await Promise.all(
        newTasks.map(async (task) => {
          const saveResponse = await fetch("/api/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(toDbPayload(task)),
          });

          return { id: task.id, ok: saveResponse.ok };
        })
      );

      const failedIds = new Set(results.filter((result) => !result.ok).map((result) => result.id));
      if (failedIds.size > 0) {
        setTasks((prev) => prev.filter((task) => !failedIds.has(task.id)));
      }

      const savedCount = newTasks.length - failedIds.size;
      if (savedCount === 0) {
        setCalendarImportStatus("Could not save Google Calendar events. Please try again.");
        return;
      }

      if (failedIds.size > 0) {
        setCalendarImportStatus(`Added ${savedCount} calendar events (${failedIds.size} failed).`);
        return;
      }

      setCalendarImportStatus(`Added ${savedCount} Google Calendar events for this week.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import Google Calendar events";
      setCalendarImportStatus(message);
    } finally {
      setCalendarImporting(false);
    }
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
          <button
            onClick={importGmailTasks}
            disabled={gmailImporting}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid rgba(165,180,252,0.35)",
              background: gmailImporting ? "rgba(99,102,241,.25)" : "rgba(99,102,241,.18)",
              color: "#c7d2fe",
              fontSize: 12,
              fontWeight: 500,
              cursor: gmailImporting ? "not-allowed" : "pointer",
              transition: "all .15s",
            }}
          >
            {gmailImporting ? "Importing Gmail events..." : "Import Gmail events with AI"}
          </button>
          {gmailImportStatus && (
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>{gmailImportStatus}</p>
          )}
          <button
            onClick={importGoogleCalendarTasks}
            disabled={calendarImporting}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid rgba(56,189,248,0.35)",
              background: calendarImporting ? "rgba(14,165,233,.24)" : "rgba(14,165,233,.16)",
              color: "#bae6fd",
              fontSize: 12,
              fontWeight: 500,
              cursor: calendarImporting ? "not-allowed" : "pointer",
              transition: "all .15s",
            }}
          >
            {calendarImporting ? "Importing Google Calendar events..." : "Import Google Calendar events"}
          </button>
          {calendarImportStatus && (
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>{calendarImportStatus}</p>
          )}
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
          <textarea
            style={{ ...S.input, minHeight: 74, resize: "vertical", paddingTop: 8 }}
            value={taskDescription}
            onChange={e => setTaskDescription(e.target.value)}
            placeholder="Task description..."
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
          {!itemsLoading && displayedTasks.length === 0 && (
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
                  <textarea
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    placeholder="Task description"
                    style={{ width: "100%", minHeight: 72, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "7px 10px", fontSize: 12, color: "#e5e7eb", outline: "none", resize: "vertical" }}
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
                    {t.description && (
                      <div style={{
                        marginTop: 3,
                        fontSize: 11,
                        color: t.done && t.color === "green" ? "#6b7280" : "#cbd5e1",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        textDecoration: t.done && t.color === "green" ? "line-through" : "none",
                      }}>
                        {t.description}
                      </div>
                    )}
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
                    {cellTasks.slice(0, 3).map(t => (
                      <Chip key={t.id} task={t} onDoubleClick={openCalendarItemEdit} />
                    ))}
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
                  <DayColumn
                    key={i}
                    tasks={tasks}
                    dateStr={ds}
                    onTaskDoubleClick={openCalendarItemEdit}
                  />
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
                <DayColumn
                  tasks={tasks}
                  dateStr={currentDayStr}
                  onTaskDoubleClick={openCalendarItemEdit}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {calendarEditTaskId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10, 12, 20, 0.5)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 1250,
          }}
        >
          <div
            style={{
              width: "min(560px, 100%)",
              background: "#1f2437",
              border: "1px solid rgba(255,255,255,.14)",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 20px 40px rgba(0,0,0,.5)",
              color: "#e5e7eb",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "#c7d2fe", marginBottom: 2 }}>
              Edit calendar item
            </div>
            <input
              value={calendarEditTitle}
              onChange={(e) => setCalendarEditTitle(e.target.value)}
              placeholder="Task title"
              style={{ width: "100%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#e5e7eb", outline: "none" }}
            />
            <textarea
              value={calendarEditDescription}
              onChange={(e) => setCalendarEditDescription(e.target.value)}
              placeholder="Task description"
              style={{ width: "100%", minHeight: 80, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#e5e7eb", outline: "none", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="date"
                value={calendarEditDate}
                onChange={(e) => setCalendarEditDate(e.target.value)}
                style={{ flex: 1, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "7px 8px", fontSize: 12, color: "#e5e7eb", outline: "none", colorScheme: "dark" as const }}
              />
              <input
                type="time"
                value={calendarEditTime}
                onChange={(e) => setCalendarEditTime(e.target.value)}
                style={{ flex: 1, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "7px 8px", fontSize: 12, color: "#e5e7eb", outline: "none", colorScheme: "dark" as const }}
              />
              <input
                type="time"
                value={calendarEditEndTime}
                onChange={(e) => setCalendarEditEndTime(e.target.value)}
                style={{ flex: 1, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "7px 8px", fontSize: 12, color: "#e5e7eb", outline: "none", colorScheme: "dark" as const }}
              />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {([1, 2, 3] as StarLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setCalendarEditStars(lvl)}
                  style={{
                    flex: 1,
                    padding: "6px 0",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 11,
                    border: calendarEditStars === lvl ? "1px solid rgba(251,191,36,.8)" : "1px solid rgba(255,255,255,.12)",
                    background: calendarEditStars === lvl ? "rgba(251,191,36,.15)" : "rgba(255,255,255,.05)",
                    color: calendarEditStars === lvl ? "#fcd34d" : "#6b7280",
                  }}
                >
                  {"★".repeat(lvl)}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["blue", "rose", "green"] as TagColor[]).map((color) => {
                const cs = COLOR_STYLES[color];
                const active = calendarEditColor === color;
                return (
                  <button
                    key={color}
                    onClick={() => setCalendarEditColor(color)}
                    style={{
                      flex: 1,
                      padding: "7px 0",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: cs.bg,
                      border: `1px solid ${cs.border}`,
                      opacity: active ? 1 : 0.45,
                      outline: active ? `2px solid ${cs.border}` : "none",
                      outlineOffset: 1,
                    }}
                  >
                    <span style={{ fontSize: 10, color: "#cbd5e1" }}>{COLOR_LABELS[color]}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 2 }}>
              <button
                onClick={closeCalendarItemEdit}
                style={{ padding: "7px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "#9ca3af" }}
              >
                Cancel
              </button>
              <button
                onClick={saveCalendarItemEdit}
                style={{ padding: "7px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, background: "#6366f1", color: "#fff" }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {completionPopupTask && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10, 12, 20, 0.45)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 1200,
          }}
        >
          <div
            style={{
              width: "min(980px, 100%)",
              background: "#1f2437",
              border: "1px solid rgba(255,255,255,.14)",
              borderRadius: 12,
              padding: 20,
              boxShadow: "0 20px 40px rgba(0,0,0,.5)",
              color: "#e5e7eb",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: formattedDraft ? "1fr 1fr" : "1fr",
                gap: 14,
              }}
            >
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {RELATIONSHIP_TAGS.map((tag) => {
                    const active = selectedRelationshipTag === tag;
                    return (
                      <button
                        key={tag}
                        onClick={() => setSelectedRelationshipTag(tag)}
                        style={{
                          borderRadius: 8,
                          border: active ? "1px solid #a5b4fc" : "1px solid rgba(255,255,255,.2)",
                          background: active ? "rgba(99,102,241,.25)" : "rgba(255,255,255,.05)",
                          color: active ? "#c7d2fe" : "#cbd5e1",
                          fontSize: 12,
                          padding: "6px 10px",
                          cursor: "pointer",
                        }}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>

                <input
                  value={relationshipDescription}
                  onChange={(e) => setRelationshipDescription(e.target.value)}
                  placeholder="Description of relation with recipient"
                  style={{
                    width: "100%",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "rgba(255,255,255,.06)",
                    color: "#e5e7eb",
                    padding: "8px 10px",
                    fontSize: 12,
                    marginBottom: 10,
                    outline: "none",
                  }}
                />

                <textarea
                  value={completionDetails}
                  onChange={(e) => setCompletionDetails(e.target.value)}
                  placeholder={`What you have done for ${completionPopupTask.title}`}
                  style={{
                    width: "100%",
                    minHeight: 260,
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "rgba(255,255,255,.06)",
                    color: "#e5e7eb",
                    padding: "10px 12px",
                    fontSize: 12,
                    resize: "vertical",
                    outline: "none",
                  }}
                />

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                  <button
                    onClick={closeCompletionPopup}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,.2)",
                      background: "rgba(255,255,255,.06)",
                      color: "#cbd5e1",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={formatCompletionDetails}
                    disabled={formattingEmail}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 8,
                      border: "1px solid rgba(99,102,241,.6)",
                      background: formattingEmail ? "rgba(99,102,241,.6)" : "#6366f1",
                      color: "#fff",
                      fontSize: 12,
                      cursor: formattingEmail ? "not-allowed" : "pointer",
                    }}
                  >
                    {formattingEmail ? "Formatting..." : "Format"}
                  </button>
                </div>
              </div>

              {formattedDraft && (
                <div
                  style={{
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "rgba(255,255,255,.04)",
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                  }}
                >
                  <input
                    value={formattedDraft.recipient}
                    onChange={(e) =>
                      setFormattedDraft((prev) =>
                        prev ? { ...prev, recipient: e.target.value } : prev
                      )
                    }
                    placeholder="Add recipients"
                    style={{
                      width: "100%",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,.18)",
                      background: "rgba(255,255,255,.06)",
                      color: "#e5e7eb",
                      padding: "8px 10px",
                      fontSize: 12,
                      marginBottom: 8,
                      outline: "none",
                    }}
                  />

                  <input
                    value={formattedDraft.subject}
                    onChange={(e) =>
                      setFormattedDraft((prev) =>
                        prev ? { ...prev, subject: e.target.value } : prev
                      )
                    }
                    placeholder="Email subject"
                    style={{
                      width: "100%",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,.18)",
                      background: "rgba(255,255,255,.06)",
                      color: "#e5e7eb",
                      padding: "8px 10px",
                      fontSize: 12,
                      marginBottom: 8,
                      outline: "none",
                    }}
                  />

                  <textarea
                    value={formattedDraft.body}
                    onChange={(e) =>
                      setFormattedDraft((prev) =>
                        prev ? { ...prev, body: e.target.value } : prev
                      )
                    }
                    placeholder="Formatted email body"
                    style={{
                      width: "100%",
                      minHeight: 194,
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,.18)",
                      background: "rgba(255,255,255,.06)",
                      color: "#e5e7eb",
                      padding: "10px 12px",
                      fontSize: 12,
                      resize: "vertical",
                      outline: "none",
                      marginBottom: 8,
                    }}
                  />

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={sendFormattedEmail}
                      disabled={sendingEmail}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 8,
                        border: "1px solid rgba(16,185,129,.6)",
                        background: sendingEmail ? "rgba(16,185,129,.55)" : "#10b981",
                        color: "#fff",
                        fontSize: 12,
                        cursor: sendingEmail ? "not-allowed" : "pointer",
                      }}
                    >
                      {sendingEmail ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {popupError && (
              <p style={{ marginTop: 10, fontSize: 12, color: "#fda4af" }}>{popupError}</p>
            )}
            {popupSuccess && (
              <p style={{ marginTop: 10, fontSize: 12, color: "#6ee7b7" }}>{popupSuccess}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
