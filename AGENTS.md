# AGENTS.md

## Product Context

This project is an AI-powered calendar web app that helps people manage work and life tasks with less cognitive overload.

### Problem Statement
How might we reduce cognitive overload for users juggling multiple responsibilities, deadlines, and communication tasks?

### Target Audience
Working adults managing multiple roles and deadlines (for example: software engineers, freelancers, tutors, and project leads).

## Product Goals

- Give users a clear view of what needs attention now.
- Help users prioritize tasks based on urgency, importance, deadline, and effort.
- Reduce planning friction through AI-assisted task capture, prioritization, and rescheduling.
- Assist with completion workflows by generating professional email drafts from user input.

## Core Features

### 1) Calendar Views
- Support `day`, `week`, `month`, and `year` display modes.
- Allow fast switching between views.
- Persist selected view during session.

### 2) Task Management
- Users can add tasks with:
  - `urgency`
  - `importance`
  - `dueDate`
  - `estimatedTime`
- Users can edit tasks, including metadata and completion state.
- Users can mark tasks complete and undo completion.

### 3) Task Sorting and Filtering
- Sort tasks by:
  - `urgency`
  - `importance`
  - `dueDate`
- Toggle visibility of completed tasks.

## AI Features

### 1) Smart Capture
- User can provide text content.
- AI reads and summarizes the content.
- AI proposes structured calendar tasks from the summary.
- User confirms before tasks are added.

### 2) Intelligent Prioritization
- AI suggests what tasks to do first based on:
  - deadline proximity
  - estimated difficulty/effort (`estimatedTime`)
  - urgency and importance

### 3) Adaptive Reorganization
- AI automatically reorganizes task order based on user behavior over time.
- Behavior signals can include:
  - completion timing
  - postponement frequency
  - overdue patterns
  - preferred working windows

### 4) Completion-to-Email Workflow
- When completing a task with email follow-up, show a popup text box.
- User enters what they have done.
- AI generates a professional email draft in-app, adapted to sender/recipient context.
- User reviews and edits the draft.
- User presses send.
- Email account integration sends the final message.

### 5) Routine Recommendation Engine
- Detect recurring patterns of incomplete tasks.
- AI recommends a routine tailored to the user's behavior and history.

## UX Requirements

- Keep UI clear and non-overwhelming.
- Make key actions obvious: add task, edit task, complete task, switch view, send email draft.
- Keep prioritization suggestions explainable and easy to scan.
- Require user confirmation for high-impact AI actions (task creation, email send).
- Minimize clicks for frequent workflows.

## Data Model (Minimum)

```ts
type Task = {
  id: string
  title: string
  urgency: number | "low" | "medium" | "high"
  importance: number | "low" | "medium" | "high"
  dueDate: string
  estimatedTime: number
  completed: boolean
  aiSuggestedOrder?: number
  createdAt: string
  updatedAt: string
}

type TaskBehavior = {
  taskId: string
  postponedCount: number
  completedLateCount: number
  averageCompletionDeltaMinutes: number
  preferredCompletionWindow?: string
}

type EmailDraft = {
  id: string
  taskId: string
  recipient: string
  subject: string
  body: string
  status: "draft" | "sent"
  createdAt: string
  sentAt?: string
}
```

## Engineering Notes

- Build responsive web UI (desktop first, mobile usable).
- Keep sorting/filtering/prioritization logic separate from presentation components.
- Use deterministic sorting when values tie.
- Keep AI features human-in-the-loop for user trust and safety.
- Treat email sending as explicit, user-confirmed action.

## Non-Goals (for now)

- Team collaboration and multi-user shared planning.
- Fully autonomous email sending without user review.
- Advanced enterprise workflow integrations beyond core email linking.

## Definition of Done

Implementation is complete when users can:

1. Switch calendar between day/week/month/year views.
2. Create, edit, complete, and uncomplete tasks with urgency, importance, due date, and estimated time.
3. Sort tasks by urgency, importance, and due date.
4. Toggle display of completed tasks.
5. Submit text for AI summarization and task suggestions, then add approved tasks to calendar.
6. Receive AI recommendations on task priority order.
7. See task order adapt based on behavior patterns.
8. Complete a task with email follow-up via popup input, AI-generated professional draft, user edit, and send.
9. Receive tailored routine recommendations when recurring incomplete-task patterns are detected.
