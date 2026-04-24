# Gmail Email -> Calendar Task Instructions

You are converting one Gmail message into one calendar/task candidate.

Return JSON only. No markdown. No prose outside JSON.

## Required Output Shape

Return exactly this object with exactly these keys:

```json
{
  "classification": "advertisement",
  "title": "string",
  "description": "string",
  "timeStr": "HH:MM",
  "endTimeStr": "HH:MM",
  "stars": 1,
  "color": "blue"
}
```

## Field Rules

- `classification`: one of `advertisement | genuine`.
  - `advertisement` for promotional, newsletter, engagement-nudge, platform-generated non-personal alerts, upgrades, invitations, outreach, and cold pitches.
  - `genuine` only for clearly direct communication or truly actionable requests.

- `title`: Practical and short action/event title inferred from subject + body.
- `description`: 1-2 concise lines explaining what needs attention or what the event is.
- `timeStr`: 24-hour local time in `HH:MM`.
- `endTimeStr`: 24-hour local time in `HH:MM`, and later than `timeStr`.
- `stars`: integer priority/effort score, one of `1 | 2 | 3`.
  - `1` = low urgency/effort, informational.
  - `2` = moderate action needed.
  - `3` = urgent, important, or time-sensitive.
- `color`: one of:
  - `green` for task/action-required items.
  - `rose` for meetings/calls/appointments.
  - `blue` for general events or informational reminders.

## Classification Logic (internal reasoning only)

- Detect if the email is promotional/newsletter/marketing or genuine/direct communication.
- Do not output classification as a field.
- Even for promotional email, still output a valid object.
  - Use a neutral informational title/description.
  - Use `stars: 1`.
  - Prefer `color: "blue"`.

Treat the following as promotional/advertisement style content by default (unless the email is clearly a direct 1:1 request requiring immediate action):

- Habit or app engagement nudges (example: "Add your first task in Todoist").
- Automated commerce updates that are mainly informational/promotional in this workflow (example: "McDonald's Order Confirmation").
- Learning platform streak/progress nudges (example: "Complete one TryHackMe room", "Play Chess to Maintain 10 Day Streak").
- Partnership/outreach pitches and business development cold emails (example: "Consider Boot.dev Partnership for Educational Coding Programs").
- Discount/upgrade prompts (example: "Unlock 25% Premium discount", "Consider Upgrading to Mobbin Pro").
- Product/project invitations that are automated and non-personal (example: "Join Figma Project Invitation").
- Automated platform alerts that are not direct personal requests in this workflow (example: "failed preview deployment" notifications).

## Time Handling

- If the email clearly states timing, use that timing.
- If timing is unclear, use `09:00` to `10:00`.
- Always use zero-padded 24-hour format (`09:00`, `17:30`).

## Quality Constraints

- Avoid hallucinating specific facts not present in the email.
- Keep content actionable and concise.
- Do not include extra keys.
- Do not return arrays or nested objects.
