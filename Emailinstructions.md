### 1) Email-to-Task Workflow
- After receiving email, summarise the email's task, find a suitable name for the task 
- Summarise this email and return in json
- format:

```ts
interface Task {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  timeStr: string; // "HH:MM" start
  endTimeStr: string; // "HH:MM" end
  hour: number;
  minute: number;
  stars: StarLevel;
  color: TagColor;
  done: boolean;
  source?: "gmail"; // present only for tasks imported from Gmail
}
```

