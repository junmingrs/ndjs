"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addYears,
  buildPriorityInsights,
  CalendarView,
  createEmptyTaskForm,
  dateKey,
  EmailDraft,
  formatDateOnly,
  formatDateShort,
  generateEmailDraft,
  getMonthMatrix,
  getWeekDates,
  getYearMonths,
  isSameDay,
  PriorityInsight,
  sortTasks,
  SortBy,
  Task,
  TaskFormState,
  toDateTimeLocal,
} from "@/helper/utils";

const STORAGE_KEY = "ndjs-calendar-view";
const relationshipOptions = ["", "Direct manager", "Senior colleague", "Client", "Peer"];

const seedTasks: Task[] = [
  {
    id: "task-1",
    title: "Review project proposal",
    description: "Prepare notes and mark open questions before the client review.",
    importance: 2,
    dateStart: "2026-04-22T09:00",
    dateEnd: "2026-04-22T11:00",
    estimatedTime: 60,
    completed: false,
  },
  {
    id: "task-2",
    title: "Team meeting prep",
    description: "Outline agenda and capture blockers for the weekly sync.",
    importance: 1,
    dateStart: "2026-04-23T13:00",
    dateEnd: "2026-04-23T14:00",
    estimatedTime: 30,
    completed: false,
  },
  {
    id: "task-3",
    title: "Send client follow-up",
    description: "Share the completion update and next steps.",
    importance: 2,
    dateStart: "2026-04-21T16:00",
    dateEnd: "2026-04-21T17:00",
    estimatedTime: 20,
    completed: true,
  },
  {
    id: "task-4",
    title: "Update documentation",
    description: "Refresh onboarding notes and capture the latest decisions.",
    importance: 0,
    dateStart: "2026-04-25T10:00",
    dateEnd: "2026-04-25T12:00",
    estimatedTime: 45,
    completed: false,
  },
  {
    id: "task-5",
    title: "Plan next sprint",
    description: "Translate the backlog into focused next actions.",
    importance: 1,
    dateStart: "2026-04-26T15:00",
    dateEnd: "2026-04-26T16:30",
    estimatedTime: 45,
    completed: false,
  },
];

function formatViewLabel(view: CalendarView) {
  return view.charAt(0).toUpperCase() + view.slice(1);
}

function createTaskFromForm(form: TaskFormState): Task {
  return {
    id: `task-${Date.now()}`,
    title: form.title.trim(),
    description: form.description.trim(),
    importance: form.importance,
    dateStart: form.dateStart,
    dateEnd: form.dateEnd,
    estimatedTime: form.estimatedTime,
    completed: form.completed,
  };
}

function groupTasksByDate(tasks: Task[]) {
  return tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const key = dateKey(task.dateEnd);
    acc[key] = [...(acc[key] ?? []), task];
    return acc;
  }, {});
}

function loadInitialView(): CalendarView {
  if (typeof window === "undefined") return "month";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "day" || raw === "week" || raw === "month" || raw === "year" ? raw : "month";
}

export default function PlannerApp() {
  const [tasks, setTasks] = useState<Task[]>(seedTasks);
  const [sortBy, setSortBy] = useState<SortBy>("dateEnd");
  const [view, setView] = useState<CalendarView>(() => loadInitialView());
  const [anchorDate, setAnchorDate] = useState(() => new Date("2026-04-22T12:00:00"));
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editorTaskId, setEditorTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState>(createEmptyTaskForm());
  const [priorityInsights, setPriorityInsights] = useState<PriorityInsight[]>(() => buildPriorityInsights(seedTasks));
  const [emailModalTaskId, setEmailModalTaskId] = useState<string | null>(null);
  const [relationshipTag, setRelationshipTag] = useState("");
  const [relationshipDetails, setRelationshipDetails] = useState("");
  const [completedNotes, setCompletedNotes] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("client@example.com");
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [notice, setNotice] = useState("Ready to prioritize the day.");

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, view);
  }, [view]);

  const sortedTasks = useMemo(() => sortTasks(tasks, sortBy), [tasks, sortBy]);
  const taskMap = useMemo(() => groupTasksByDate(sortedTasks), [sortedTasks]);
  const priorityList = useMemo(() => priorityInsights.slice(0, 4), [priorityInsights]);
  const priorityTaskIds = useMemo(() => new Set(priorityList.map((item) => item.taskId)), [priorityList]);
  const upcomingTasks = useMemo(() => sortedTasks.filter((task) => !priorityTaskIds.has(task.id)), [sortedTasks, priorityTaskIds]);
  const activeDraft = drafts.find((draft) => draft.id === activeDraftId) ?? drafts[drafts.length - 1];
  const emailTask = tasks.find((task) => task.id === emailModalTaskId) ?? null;

  function syncInsights(nextTasks: Task[]) {
    setPriorityInsights(buildPriorityInsights(nextTasks));
  }

  function openTaskModal(task?: Task) {
    if (task) {
      setEditorTaskId(task.id);
      setTaskForm({
        title: task.title,
        description: task.description,
        importance: task.importance,
        dateStart: task.dateStart,
        dateEnd: task.dateEnd,
        estimatedTime: task.estimatedTime,
        completed: task.completed,
      });
      setNotice("Editing task details.");
    } else {
      setEditorTaskId(null);
      setTaskForm(createEmptyTaskForm());
      setNotice("Create a task and confirm before saving.");
    }
    setTaskModalOpen(true);
  }

  function saveTask() {
    if (!taskForm.title.trim()) {
      setNotice("Add a title first.");
      return;
    }

    const nextTasks = editorTaskId
      ? tasks.map((task) =>
          task.id === editorTaskId
            ? {
                ...task,
                ...taskForm,
                dateStart: toDateTimeLocal(taskForm.dateStart),
                dateEnd: toDateTimeLocal(taskForm.dateEnd),
              }
            : task,
        )
      : [...tasks, createTaskFromForm(taskForm)];

    setTasks(nextTasks);
    syncInsights(nextTasks);
    setTaskModalOpen(false);
    setNotice(editorTaskId ? "Task updated." : "Task created.");
  }

  function moveDate(amount: number) {
    setAnchorDate((current) => {
      if (view === "day") return addDays(current, amount);
      if (view === "week") return addDays(current, amount * 7);
      if (view === "month") return addMonths(current, amount);
      return addYears(current, amount);
    });
  }

  function commitDraft() {
    if (!emailModalTaskId) return;
    const task = tasks.find((item) => item.id === emailModalTaskId);
    if (!task) return;

    const draft = generateEmailDraft({
      task,
      recipientEmail,
      relationshipTag,
      relationshipDetails,
      completedNotes,
    });

    setDrafts((current) => [...current, draft]);
    setActiveDraftId(draft.id);
    setNotice("Draft created. Review before sending.");
  }

  function sendDraft(draftId: string) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === draftId ? { ...draft, status: "sent" as const, sentAt: new Date().toISOString() } : draft,
      ),
    );
    setNotice("Email sent after confirmation.");
  }

  function renderCalendar() {
    if (view === "day") {
      return <DayView date={anchorDate} tasks={taskMap[dateKey(anchorDate)] ?? []} onEdit={openTaskModal} />;
    }

    if (view === "week") {
      return <WeekView date={anchorDate} taskMap={taskMap} onEdit={openTaskModal} />;
    }

    if (view === "year") {
      return <YearView date={anchorDate} tasks={tasks} />;
    }

      return <MonthView date={anchorDate} taskMap={taskMap} onEdit={openTaskModal} />;
  }

  return (
    <div className="calendar-page">
      <header className="page-header">
        <div className="header-left">
          <div className="calendar-toolbar compact">
            <button className="nav-btn" onClick={() => moveDate(-1)} aria-label="Previous">‹</button>
            <h2>{formatDateOnly(anchorDate.toISOString())}</h2>
            <button className="nav-btn" onClick={() => moveDate(1)} aria-label="Next">›</button>
          </div>
          <div className="view-chips">
            {(["day", "week", "month", "year"] as CalendarView[]).map((item) => (
              <button key={item} className={view === item ? "view-chip active" : "view-chip"} onClick={() => setView(item)}>
                {formatViewLabel(item)}
              </button>
            ))}
          </div>
        </div>

        <div className="header-right">
          <button className="add-task-btn" onClick={() => openTaskModal()}>
            <span>＋</span>
            Add Task
          </button>
        </div>

      </header>

      <div className="layout-shell">
        <section className="calendar-panel glass-card">
          <div className="calendar-stage">{renderCalendar()}</div>
        </section>

        <aside className="sidebar-stack">
          <section className="glass-card sidebar-card">
            <h3>Sort Tasks By</h3>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)}>
              <option value="dateEnd">Due Date</option>
              <option value="importance">Importance</option>
            </select>
          </section>

          <section className="glass-card sidebar-card">
            <h3>Upcoming Tasks</h3>
            {priorityList.length ? (
              <div className="upcoming-list">
                {priorityList.map((item) => {
                  const task = tasks.find((entry) => entry.id === item.taskId);
                  if (!task) return null;

                  return (
                    <button key={task.id} className={`task-mini upcoming-button ${task.completed ? "completed" : ""}`} onClick={() => openTaskModal(task)}>
                      <span className={`mini-bar importance-${task.importance}`} />
                      <div>
                        <strong>{task.title}</strong>
                        <p>{task.completed ? "Completed" : formatDateShort(task.dateEnd)}</p>
                      </div>
                      <span className="task-mini-action">Open</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">No upcoming tasks</div>
            )}

            <div className="task-feed">
              {upcomingTasks.map((task) => (
                <TaskMini key={task.id} task={task} onEdit={openTaskModal} />
              ))}
            </div>
          </section>
        </aside>
      </div>

      {emailTask?.completed ? (
        <section className="glass-card email-card inline-email-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Follow-up email</p>
              <h3>Draft after completion</h3>
            </div>
            <button className="secondary-btn" onClick={commitDraft} disabled={!emailModalTaskId}>Generate draft</button>
          </div>

          <div className="email-grid">
            <label>
              Completed task
              <select value={emailModalTaskId ?? ""} onChange={(event) => setEmailModalTaskId(event.target.value || null)}>
                <option value="">Select a completed task</option>
                {tasks.filter((task) => task.completed).map((task) => (
                  <option key={task.id} value={task.id}>{task.title}</option>
                ))}
              </select>
            </label>
            <label>
              Recipient email
              <input value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} />
            </label>
            <label>
              Relationship tag
              <select value={relationshipTag} onChange={(event) => setRelationshipTag(event.target.value)}>
                {relationshipOptions.map((option) => (
                  <option key={option || "none"} value={option}>{option || "None"}</option>
                ))}
              </select>
            </label>
            <label>
              Relationship detail
              <input value={relationshipDetails} onChange={(event) => setRelationshipDetails(event.target.value)} placeholder="Short context" />
            </label>
            <label className="span-2">
              What you completed
              <textarea value={completedNotes} onChange={(event) => setCompletedNotes(event.target.value)} placeholder="Briefly describe what you did" />
            </label>
          </div>

          {activeDraft ? (
            <div className="draft-preview">
              <div className="draft-preview-head">
                <strong>{activeDraft.subject}</strong>
                <button className="primary-btn small" onClick={() => sendDraft(activeDraft.id)} disabled={activeDraft.status === "sent"}>Send</button>
              </div>
              <p className="muted">To: {activeDraft.recipientEmail}</p>
              <pre>{activeDraft.body}</pre>
              <p className="muted">Status: {activeDraft.status}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <p className="sr-only" aria-live="polite">{notice}</p>

      {taskModalOpen ? (
        <Modal title={editorTaskId ? "Edit task" : "Create task"} onClose={() => setTaskModalOpen(false)}>
          <div className="email-grid modal-grid">
            <label className="span-2">
              Title
              <input value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="span-2">
              Description
              <textarea value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} />
            </label>
            <label>
              Importance
              <select value={taskForm.importance} onChange={(event) => setTaskForm((current) => ({ ...current, importance: Number(event.target.value) as 0 | 1 | 2 }))}>
                <option value={0}>Low</option>
                <option value={1}>Medium</option>
                <option value={2}>High</option>
              </select>
            </label>
            <label>
              Estimated time
              <input type="number" min={5} step={5} value={taskForm.estimatedTime} onChange={(event) => setTaskForm((current) => ({ ...current, estimatedTime: Number(event.target.value) }))} />
            </label>
            <label>
              Start
              <input type="datetime-local" value={taskForm.dateStart} onChange={(event) => setTaskForm((current) => ({ ...current, dateStart: event.target.value }))} />
            </label>
            <label>
              End
              <input type="datetime-local" value={taskForm.dateEnd} onChange={(event) => setTaskForm((current) => ({ ...current, dateEnd: event.target.value }))} />
            </label>
            <label className="switch-row span-2">
              <input type="checkbox" checked={taskForm.completed} onChange={(event) => setTaskForm((current) => ({ ...current, completed: event.target.checked }))} />
              Completed
            </label>
          </div>

          <div className="modal-actions">
            <button className="secondary-btn" onClick={() => setTaskModalOpen(false)}>Cancel</button>
            <button className="primary-btn" onClick={saveTask}>Save task</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function TaskMini({ task, onEdit, description }: { task: Task; onEdit: (task: Task) => void; description?: string }) {
  return (
    <button className={`task-mini ${task.completed ? "completed" : ""}`} onClick={() => onEdit(task)}>
      <span className={`mini-bar importance-${task.importance}`} />
      <div>
        <strong>{task.title}</strong>
        <p>{task.completed ? "Completed" : formatDateShort(task.dateEnd)}</p>
        {description ? <p className="task-mini-description">{description}</p> : null}
      </div>
      <span className="task-mini-action">{task.completed ? "Completed" : "Open"}</span>
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="card-head">
          <div>
            <p className="eyebrow">Popup</p>
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MonthView({ date, taskMap, onEdit }: { date: Date; taskMap: Record<string, Task[]>; onEdit: (task: Task) => void }) {
  const days = getMonthMatrix(date);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="month-layout">
      <div className="weekday-row">
        {weekdays.map((day) => <div key={day}>{day}</div>)}
      </div>

      <div className="month-grid">
        {days.map((day) => {
          const key = dateKey(day);
          const dayTasks = taskMap[key] ?? [];
          const inMonth = day.getMonth() === date.getMonth();

          return (
            <div key={key} className={`day-cell ${inMonth ? "" : "muted-month"} ${isSameDay(day, new Date()) ? "today" : ""}`}>
              <div className="day-cell-head">
                <span>{day.getDate()}</span>
              </div>
              <div className="day-cell-tasks">
                {dayTasks.slice(0, 3).map((task) => (
                  <button key={task.id} className={`day-pill importance-${task.importance} ${task.completed ? "completed" : ""}`} onClick={() => onEdit(task)}>
                    {task.title}
                  </button>
                ))}
                {dayTasks.length > 3 ? <span className="muted small">+{dayTasks.length - 3} more</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({ date, tasks, onEdit }: { date: Date; tasks: Task[]; onEdit: (task: Task) => void }) {
  return (
    <div className="view-stack">
      <div className="day-summary">
        <div>
          <p className="eyebrow">Day view</p>
          <h3>{formatDateOnly(date.toISOString())}</h3>
        </div>
      </div>
      {tasks.length ? (
        <div className="task-feed">
              {tasks.map((task) => (
            <TaskMini key={task.id} task={task} onEdit={onEdit} description={task.description} />
          ))}
        </div>
      ) : (
        <p className="empty-state">Use the task rail to add something here.</p>
      )}
    </div>
  );
}

function WeekView({ date, taskMap, onEdit }: { date: Date; taskMap: Record<string, Task[]>; onEdit: (task: Task) => void }) {
  return (
    <div className="week-layout">
      {getWeekDates(date).map((day) => {
        const key = dateKey(day);
        const items = taskMap[key] ?? [];

        return (
          <div key={key} className="week-column">
            <div className="week-column-head">
              <strong>{day.toLocaleDateString("en", { weekday: "short" })}</strong>
              <span>{day.getDate()}</span>
            </div>
            <div className="week-list">
              {items.length ? (
                items.map((task) => <TaskMini key={task.id} task={task} onEdit={onEdit} />)
              ) : (
                <p className="empty-state compact">No tasks.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function YearView({ date, tasks }: { date: Date; tasks: Task[] }) {
  return (
    <div className="year-layout">
      {getYearMonths(date).map((month) => {
        const count = tasks.filter((task) => task.dateEnd.slice(0, 7) === month.toISOString().slice(0, 7)).length;

        return (
          <div key={month.getMonth()} className="year-card">
            <p className="eyebrow">{month.toLocaleDateString("en", { month: "long" })}</p>
            <strong>{count} tasks</strong>
          </div>
        );
      })}
    </div>
  );
}
