"use client";
import React, { useMemo, useState } from "react";

// Types
type Task = {
  id: string;
  title: string;
  urgency: "low" | "medium" | "high";
  importance: "low" | "medium" | "high";
  dueDate: string;
  estimatedTime: number;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  formattedTime?: string;
};

function monthName(month: number) {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return months[month];
}

function getCalendarMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const matrix: { date: Date; inMonth: boolean }[] = [];

  for (let i = startDay - 1; i >= 0; i--) {
    matrix.push({ date: new Date(year, month - 1, prevMonthDays - i), inMonth: false });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    matrix.push({ date: new Date(year, month, d), inMonth: true });
  }

  const remaining = (7 - (matrix.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    matrix.push({ date: new Date(year, month + 1, i), inMonth: false });
  }

  return matrix;
}

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

export default function Calendar() {
  const [today, setToday] = useState<string>("");
  const [visible, setVisible] = useState(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: "1",
      title: "Review project proposal",
      urgency: "high",
      importance: "high",
      dueDate: "2026-04-22",
      estimatedTime: 60,
      completed: false,
      createdAt: "2026-04-20T10:00:00Z",
      updatedAt: "2026-04-20T10:00:00Z",
    },
    {
      id: "2",
      title: "Team meeting preparation",
      urgency: "medium",
      importance: "medium",
      dueDate: "2026-04-23",
      estimatedTime: 30,
      completed: false,
      createdAt: "2026-04-20T10:00:00Z",
      updatedAt: "2026-04-20T10:00:00Z",
    },
    {
      id: "3",
      title: "Update documentation",
      urgency: "low",
      importance: "low",
      dueDate: "2026-04-25",
      estimatedTime: 45,
      completed: false,
      createdAt: "2026-04-20T10:00:00Z",
      updatedAt: "2026-04-20T10:00:00Z",
    },
  ]);
  const [showCompleted, setShowCompleted] = useState(true);
  const [sortBy, setSortBy] = useState<"urgency" | "importance" | "dueDate">("urgency");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskUrgency, setNewTaskUrgency] = useState<"low" | "medium" | "high">("medium");
  const [newTaskImportance, setNewTaskImportance] = useState<"low" | "medium" | "high">("medium");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskTime, setNewTaskTime] = useState(30);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm your AI assistant. I can help you add tasks, prioritize your day, or generate email drafts. How can I help you today?",
      timestamp: "2026-04-20T10:00:00Z",
      formattedTime: "10:00 AM",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Set today's date string on client only to avoid hydration mismatch
  React.useEffect(() => {
    setToday(new Date().toDateString());
  }, []);

  const year = visible.getFullYear();
  const month = visible.getMonth();
  const matrix = useMemo(() => getCalendarMatrix(year, month), [year, month]);

  const sortedTasks = useMemo(() => {
    let filtered = showCompleted ? tasks : tasks.filter((t) => !t.completed);
    return [...filtered].sort((a, b) => {
      const urgencyOrder = { high: 3, medium: 2, low: 1 };
      const importanceOrder = { high: 3, medium: 2, low: 1 };
      
      if (sortBy === "urgency") {
        return urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
      } else if (sortBy === "importance") {
        return importanceOrder[b.importance] - importanceOrder[a.importance];
      } else {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
    });
  }, [tasks, showCompleted, sortBy]);

  function prev() {
    setVisible((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function next() {
    setVisible((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  function addTask() {
    if (!newTaskTitle.trim() || !newTaskDueDate) return;
    
    const newTask: Task = {
      id: generateId(),
      title: newTaskTitle,
      urgency: newTaskUrgency,
      importance: newTaskImportance,
      dueDate: newTaskDueDate,
      estimatedTime: newTaskTime,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    setTasks([...tasks, newTask]);
    setNewTaskTitle("");
    setNewTaskDueDate("");
    setNewTaskTime(30);
    setIsAddingTask(false);
  }

  function toggleComplete(id: string) {
    setTasks(tasks.map((t) => 
      t.id === id ? { ...t, completed: !t.completed, updatedAt: new Date().toISOString() } : t
    ));
  }

  function deleteTask(id: string) {
    setTasks(tasks.filter((t) => t.id !== id));
  }

  function updateTask(id: string, updates: Partial<Task>) {
    setTasks(tasks.map((t) => 
      t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
    ));
    setEditingTaskId(null);
  }

  function handleChatSubmit() {
    if (!chatInput.trim()) return;
    
    const now = new Date();
    const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    
    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: chatInput,
      timestamp: now.toISOString(),
      formattedTime: formatTime(now),
    };
    
    setChatMessages([...chatMessages, userMessage]);
    setChatInput("");
    setIsChatLoading(true);
    
    // Simulate AI response
    setTimeout(() => {
      const aiNow = new Date();
      const aiResponse: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: "I understand you're asking about tasks. Based on your current workload, I recommend prioritizing 'Review project proposal' as it's both high urgency and high importance. Would you like me to help you create a task or generate an email draft?",
        timestamp: aiNow.toISOString(),
        formattedTime: formatTime(aiNow),
      };
      setChatMessages((prev) => [...prev, aiResponse]);
      setIsChatLoading(false);
    }, 1000);
  }

  return (
    <div className="app-container">
      {/* Left Sidebar - Task List */}
      <div className="sidebar left-sidebar">
        <div className="sidebar-header">
          <h2>Tasks</h2>
          <button className="add-task-btn" onClick={() => setIsAddingTask(!isAddingTask)}>
            {isAddingTask ? "✕" : "+"}
          </button>
        </div>
        
        {/* Add Task Form */}
        {isAddingTask && (
          <div className="add-task-form">
            <input
              type="text"
              placeholder="Task title"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="task-input"
            />
            <div className="form-row">
              <select
                value={newTaskUrgency}
                onChange={(e) => setNewTaskUrgency(e.target.value as "low" | "medium" | "high")}
                className="task-select"
              >
                <option value="low">Low Urgency</option>
                <option value="medium">Medium Urgency</option>
                <option value="high">High Urgency</option>
              </select>
              <select
                value={newTaskImportance}
                onChange={(e) => setNewTaskImportance(e.target.value as "low" | "medium" | "high")}
                className="task-select"
              >
                <option value="low">Low Importance</option>
                <option value="medium">Medium Importance</option>
                <option value="high">High Importance</option>
              </select>
            </div>
            <div className="form-row">
              <input
                type="date"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
                className="task-input"
              />
              <input
                type="number"
                placeholder="Minutes"
                value={newTaskTime}
                onChange={(e) => setNewTaskTime(parseInt(e.target.value) || 0)}
                className="task-input time-input"
                min="1"
              />
            </div>
            <button onClick={addTask} className="submit-task-btn">Add Task</button>
          </div>
        )}
        
        {/* Filters */}
        <div className="task-filters">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "urgency" | "importance" | "dueDate")}
            className="filter-select"
          >
            <option value="urgency">Sort by Urgency</option>
            <option value="importance">Sort by Importance</option>
            <option value="dueDate">Sort by Due Date</option>
          </select>
          <label className="toggle-completed">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            Show Completed
          </label>
        </div>
        
        {/* Task List */}
        <div className="task-list">
          {sortedTasks.map((task) => (
            <div key={task.id} className={`task-item ${task.completed ? "completed" : ""}`}>
              {editingTaskId === task.id ? (
                <div className="edit-task-form">
                  <input
                    type="text"
                    defaultValue={task.title}
                    onBlur={(e) => updateTask(task.id, { title: e.target.value })}
                    className="task-input"
                    autoFocus
                  />
                  <div className="task-meta">
                    <select
                      defaultValue={task.urgency}
                      onChange={(e) => updateTask(task.id, { urgency: e.target.value as Task["urgency"] })}
                      className="task-select"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <select
                      defaultValue={task.importance}
                      onChange={(e) => updateTask(task.id, { importance: e.target.value as Task["importance"] })}
                      className="task-select"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <button onClick={() => setEditingTaskId(null)} className="save-btn">Save</button>
                </div>
              ) : (
                <>
                  <div className="task-main">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleComplete(task.id)}
                      className="task-checkbox"
                    />
                    <span className="task-title">{task.title}</span>
                  </div>
                  <div className="task-details">
                    <span className={`badge urgency-${task.urgency}`}>{task.urgency}</span>
                    <span className={`badge importance-${task.importance}`}>{task.importance}</span>
                    <span className="task-due">{task.dueDate}</span>
                    <span className="task-time">{task.estimatedTime}min</span>
                  </div>
                  <div className="task-actions">
                    <button onClick={() => setEditingTaskId(task.id)} className="edit-btn">Edit</button>
                    <button onClick={() => deleteTask(task.id)} className="delete-btn">Delete</button>
                  </div>
                </>
              )}
            </div>
          ))}
          {sortedTasks.length === 0 && (
            <div className="no-tasks">No tasks yet. Add one above!</div>
          )}
        </div>
      </div>

      {/* Center - Calendar */}
      <div className="calendar-container">
        <div className="calendar">
          <div className="calendar-header">
            <button onClick={prev} aria-label="Previous month">◀</button>
            <div className="calendar-title">{monthName(month)} {year}</div>
            <button onClick={next} aria-label="Next month">▶</button>
          </div>

          <div className="calendar-weekdays">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="weekday">{d}</div>
            ))}
          </div>

          <div className="calendar-grid">
            {matrix.map(({ date, inMonth }, idx) => {
              const dayTasks = tasks.filter(
                (t) => !t.completed && t.dueDate === date.toISOString().split("T")[0]
              );
              const isToday = today && date.toDateString() === today;
              return (
                <div
                  key={idx}
                  className={"calendar-day" + (inMonth ? "" : " other-month") + (isToday ? " today" : "")}
                >
                  <div className="date-number">{date.getDate()}</div>
                  <div className="day-tasks">
                    {dayTasks.slice(0, 2).map((task) => (
                      <div key={task.id} className="day-task" title={task.title}>
                        {task.title.substring(0, 15)}...
                      </div>
                    ))}
                    {dayTasks.length > 2 && (
                      <div className="more-tasks">+{dayTasks.length - 2} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Sidebar - AI Chat */}
      <div className="sidebar right-sidebar">
        <div className="sidebar-header">
          <h2>AI Assistant</h2>
          <span className="ai-icon">🤖</span>
        </div>
        
        <div className="chat-container">
          <div className="chat-messages">
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`chat-message ${msg.role}`}>
                <div className="message-content">{msg.content}</div>
                <div className="message-time">
                  {msg.formattedTime}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="chat-message assistant">
                <div className="message-content typing">Thinking...</div>
              </div>
            )}
          </div>
          
          <div className="chat-input-container">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleChatSubmit()}
              placeholder="Ask AI for help..."
              className="chat-input"
            />
            <button onClick={handleChatSubmit} className="chat-send-btn" disabled={isChatLoading}>
              Send
            </button>
          </div>
        </div>
        
        <div className="ai-features">
          <h3>AI Features</h3>
          <ul>
            <li>📝 Smart Task Capture</li>
            <li>🎯 Intelligent Prioritization</li>
            <li>📧 Email Draft Generator</li>
            <li>📅 Routine Recommendations</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
