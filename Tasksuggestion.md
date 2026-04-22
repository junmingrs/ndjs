1) After the tasks are created
- Suggest what tasks to do first (depending deadline and level of difficulty) [Input: All tasks for the day in JSON with .md file] [Output: Ordered tasks in JSON, following the Task interface format]


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