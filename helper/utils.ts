export type Importance = 0 | 1 | 2;
export type CalendarView = "day" | "week" | "month" | "year";
export type SortBy = "importance" | "dateEnd";

export type Task = {
  id: string;
  title: string;
  description: string;
  importance: Importance;
  dateStart: string;
  dateEnd: string;
  estimatedTime: number;
  completed: boolean;
};

export type EmailDraft = {
  id: string;
  taskId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: "draft" | "sent";
  createdAt: string;
  sentAt?: string;
};

export type PriorityInsight = {
  taskId: string;
  score: number;
  reasons: string[];
};

export type TaskFormState = {
  title: string;
  description: string;
  importance: Importance;
  dateStart: string;
  dateEnd: string;
  estimatedTime: number;
  completed: boolean;
};

export const importanceLabels: Record<Importance, string> = {
  0: "Low",
  1: "Medium",
  2: "High",
};

export function importanceToLabel(importance: Importance) {
  return importanceLabels[importance];
}

export function createEmptyTaskForm(): TaskFormState {
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);

  return {
    title: "",
    description: "",
    importance: 1,
    dateStart: toDateTimeLocal(now),
    dateEnd: toDateTimeLocal(later),
    estimatedTime: 30,
    completed: false,
  };
}

export function toDateTimeLocal(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateShort(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function dateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function sortTasks(tasks: Task[], sortBy: SortBy) {
  const visible = tasks;
  const importanceRank: Record<Importance, number> = { 0: 0, 1: 1, 2: 2 };

  return [...visible].sort((a, b) => {
    if (sortBy === "importance") {
      if (importanceRank[b.importance] !== importanceRank[a.importance]) {
        return importanceRank[b.importance] - importanceRank[a.importance];
      }
    } else if (sortBy === "dateEnd") {
      const timeDiff = new Date(a.dateEnd).getTime() - new Date(b.dateEnd).getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
    }

    const dueDiff = new Date(a.dateEnd).getTime() - new Date(b.dateEnd).getTime();
    if (dueDiff !== 0) {
      return dueDiff;
    }

    if (importanceRank[b.importance] !== importanceRank[a.importance]) {
      return importanceRank[b.importance] - importanceRank[a.importance];
    }

    const titleDiff = a.title.localeCompare(b.title);
    if (titleDiff !== 0) {
      return titleDiff;
    }

    return a.id.localeCompare(b.id);
  });
}

export function buildPriorityInsights(tasks: Task[], now = new Date()) {
  return tasks
    .filter((task) => !task.completed)
    .map((task) => {
      const due = new Date(task.dateEnd);
      const hoursUntilDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
      const importanceScore = task.importance * 35;
      const urgencyScore = hoursUntilDue <= 0 ? 50 : Math.max(0, 24 - hoursUntilDue) * 2;
      const effortScore = Math.max(0, 90 - task.estimatedTime);
      const score = Math.round(importanceScore + urgencyScore + effortScore / 4);

      const reasons = [
        task.importance === 2 ? "High importance" : task.importance === 1 ? "Medium importance" : "Lower priority",
        hoursUntilDue <= 0
          ? "Overdue"
          : hoursUntilDue < 24
            ? "Due within a day"
            : hoursUntilDue < 72
              ? "Due soon"
              : "Room to schedule later",
        task.estimatedTime <= 30 ? "Quick win" : "Needs focused time",
      ];

      return { taskId: task.id, score, reasons };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.taskId.localeCompare(b.taskId);
    });
}

export function generateEmailDraft({
  task,
  recipientEmail,
  relationshipTag,
  relationshipDetails,
  completedNotes,
}: {
  task: Task;
  recipientEmail: string;
  relationshipTag: string;
  relationshipDetails: string;
  completedNotes: string;
}) {
  const now = new Date().toISOString();
  const subject = `Update on ${task.title}`;
  const relationship = relationshipTag || "recipient";
  const details = relationshipDetails.trim();

  const body = [
    `Hi ${relationship},`,
    "",
    `I wanted to share a quick update that I have completed ${task.title.toLowerCase()}.`,
    completedNotes.trim() ? `What I handled: ${completedNotes.trim()}.` : "",
    details ? `I kept your context in mind given our ${details}.` : "",
    "",
    "Thanks for your time, and let me know if you'd like any follow-up from my side.",
    "",
    "Best,",
    "[Your name]",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: `draft-${task.id}-${Date.now()}`,
    taskId: task.id,
    recipientEmail,
    subject,
    body,
    status: "draft" as const,
    createdAt: now,
  } satisfies EmailDraft;
}

export function startOfWeek(date: Date) {
  const value = new Date(date);
  const day = value.getDay();
  value.setDate(value.getDate() - day);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function addDays(date: Date, amount: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + amount);
  return value;
}

export function addMonths(date: Date, amount: number) {
  const value = new Date(date);
  value.setMonth(value.getMonth() + amount);
  return value;
}

export function addYears(date: Date, amount: number) {
  const value = new Date(date);
  value.setFullYear(value.getFullYear() + amount);
  return value;
}

export function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function getMonthMatrix(date: Date) {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = addDays(firstOfMonth, -firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function getWeekDates(date: Date) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function getYearMonths(date: Date) {
  return Array.from({ length: 12 }, (_, index) => new Date(date.getFullYear(), index, 1));
}
