import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type StarLevel = 1 | 2 | 3;
type TagColor = "blue" | "rose" | "green";

type Task = {
  id: string;
  title: string;
  description: string;
  message?: string;
  date: string;
  timeStr: string;
  endTimeStr: string;
  hour: number;
  minute: number;
  stars: StarLevel;
  color: TagColor;
  done: boolean;
  senderEmail?: string;
};

type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
};

type GmailMessagePart = {
  mimeType?: string;
  body?: {
    data?: string;
  };
  parts?: GmailMessagePart[];
};

type GmailMessageResponse = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: GmailMessagePart[];
  };
};

type OpenAIResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type TaskCandidate = {
  classification: "advertisement" | "genuine";
  title: string;
  description: string;
  timeStr: string;
  endTimeStr: string;
  stars: StarLevel;
  color: TagColor;
};

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const LIST_MAX_RESULTS = 500;
const FETCH_CHUNK_SIZE = 20;

function toWindow(searchParams: URLSearchParams) {
  const timeMinParam = searchParams.get("timeMin");
  const timeMaxParam = searchParams.get("timeMax");

  if (timeMinParam || timeMaxParam) {
    if (!timeMinParam || !timeMaxParam) {
      throw new Error("timeMin and timeMax must be provided together");
    }

    const start = new Date(timeMinParam);
    const end = new Date(timeMaxParam);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("timeMin/timeMax must be valid ISO datetimes");
    }

    if (start >= end) {
      throw new Error("timeMin must be earlier than timeMax");
    }

    return {
      defaultDate: start.toISOString().slice(0, 10),
      startEpochSec: Math.floor(start.getTime() / 1000),
      endEpochSec: Math.floor(end.getTime() / 1000),
    };
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const start = Date.UTC(year, month, day, 0, 0, 0, 0);
  const end = Date.UTC(year, month, day + 1, 0, 0, 0, 0);

  return {
    defaultDate: new Date(start).toISOString().slice(0, 10),
    startEpochSec: Math.floor(start / 1000),
    endEpochSec: Math.floor(end / 1000),
  };
}

function chunkArray<T>(values: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function findPartByMimeType(part: GmailMessagePart, mimeType: string): string | null {
  if (part.mimeType === mimeType && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  if (!part.parts) {
    return null;
  }

  for (const child of part.parts) {
    const content = findPartByMimeType(child, mimeType);
    if (content) {
      return content;
    }
  }

  return null;
}

function getHeader(
  headers: Array<{ name: string; value: string }> | undefined,
  key: string
) {
  if (!headers) {
    return null;
  }

  const match = headers.find((header) => header.name.toLowerCase() === key.toLowerCase());
  return match?.value ?? null;
}

function extractEmailAddress(value: string | null) {
  if (!value) {
    return null;
  }

  const angleMatch = value.match(/<([^>]+)>/);
  if (angleMatch?.[1]) {
    return angleMatch[1].trim().toLowerCase();
  }

  const directMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (directMatch?.[0]) {
    return directMatch[0].trim().toLowerCase();
  }

  return null;
}

function toMessageContext(message: GmailMessageResponse) {
  const payload = message.payload;
  const headers = payload?.headers;

  let bodyText = "";

  if (payload?.body?.data) {
    bodyText = decodeBase64Url(payload.body.data);
  }

  if (!bodyText && payload) {
    const plainText = findPartByMimeType(payload, "text/plain");
    if (plainText) {
      bodyText = plainText;
    }
  }

  if (!bodyText && payload) {
    const htmlText = findPartByMimeType(payload, "text/html");
    if (htmlText) {
      bodyText = stripHtml(htmlText);
    }
  }

  return {
    id: message.id,
    threadId: message.threadId,
    subject: getHeader(headers, "Subject"),
    from: getHeader(headers, "From"),
    fromEmail: extractEmailAddress(getHeader(headers, "From")),
    to: getHeader(headers, "To"),
    dateHeader: getHeader(headers, "Date"),
    internalDate: message.internalDate ?? null,
    snippet: message.snippet ?? "",
    bodyText: bodyText.trim(),
  };
}

async function readEmailInstructions() {
  const instructionsPath = path.join(process.cwd(), "Emailinstructions.md");
  return readFile(instructionsPath, "utf8");
}

async function listMessageIds(accessToken: string, query: string) {
  const messageIds: string[] = [];
  let nextPageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(LIST_MAX_RESULTS),
      includeSpamTrash: "true",
    });

    if (nextPageToken) {
      params.set("pageToken", nextPageToken);
    }

    const response = await fetch(`${GMAIL_API_BASE}/messages?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const data = (await response.json()) as GmailListResponse & { error?: { message?: string } };

    if (!response.ok) {
      throw new Error(data.error?.message ?? "Failed to list Gmail messages");
    }

    if (data.messages) {
      messageIds.push(...data.messages.map((message) => message.id));
    }

    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  return messageIds;
}

async function fetchMessage(accessToken: string, id: string) {
  const response = await fetch(`${GMAIL_API_BASE}/messages/${id}?format=full`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const data = (await response.json()) as GmailMessageResponse & { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(data.error?.message ?? `Failed to fetch Gmail message ${id}`);
  }

  return data;
}

async function convertEmailToTask(
  email: ReturnType<typeof toMessageContext>,
  fallbackDate: string,
  instructions: string
): Promise<Task | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "gmail_task",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
              properties: {
               classification: {
                 type: "string",
                 enum: ["advertisement", "genuine"],
               },
               title: { type: "string", minLength: 1 },
               description: { type: "string", minLength: 1 },
               timeStr: {
                 type: "string",
                 pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$",
              },
              endTimeStr: {
                type: "string",
                pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$",
              },
              stars: { type: "integer", enum: [1, 2, 3] },
               color: { type: "string", enum: ["blue", "rose", "green"] },
             },
             required: [
               "classification",
               "title",
               "description",
               "timeStr",
               "endTimeStr",
               "stars",
               "color",
             ],
           },
         },
       },
      messages: [
        {
          role: "system",
            content: `${instructions}\n\nAdditional hard requirements:\n- Return JSON only (schema enforced).\n- Set classification to advertisement for promotional, engagement-nudge, platform-generated, upgrade, invitation, outreach, and non-personal automated alerts.\n- Set classification to genuine only for clear direct communication or truly actionable requests.\n- Infer a practical task title from the email.\n- Add a concise description (1-2 lines) summarizing what needs to be done.\n- If timing is unclear, use 09:00 to 10:00.\n- Use stars to estimate effort/priority (1 low, 3 high).\n- Use color from interface enum: green for task/action, rose for meeting/call, blue for generic event.`,
        },
          {
            role: "user",
            content: JSON.stringify({
              targetDate: fallbackDate,
              email,
            }),
          },
      ],
    }),
    cache: "no-store",
  });

  const data = (await response.json()) as OpenAIResponse;

  if (!response.ok) {
    throw new Error(data.error?.message ?? "OpenAI request failed");
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response");
  }

  const parsed = JSON.parse(content) as TaskCandidate;

  if (parsed.classification === "advertisement") {
    return null;
  }

  const [hour, minute] = parsed.timeStr.split(":").map(Number);

  let taskDate = fallbackDate;
  if (email.internalDate) {
    const internalDateMs = Number(email.internalDate);
    if (!Number.isNaN(internalDateMs)) {
      const parsedDate = new Date(internalDateMs);
      const y = parsedDate.getFullYear();
      const m = String(parsedDate.getMonth() + 1).padStart(2, "0");
      const d = String(parsedDate.getDate()).padStart(2, "0");
      taskDate = `${y}-${m}-${d}`;
    }
  }

  return {
    id: email.id,
    title: parsed.title,
    description: parsed.description,
    message: email.bodyText,
    date: taskDate,
    timeStr: parsed.timeStr,
    endTimeStr: parsed.endTimeStr,
    hour,
    minute,
    stars: parsed.stars,
    color: parsed.color,
    done: false,
    senderEmail: email.fromEmail ?? undefined,
  } as Task;
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const [{ data: authData, error: authError }, { data: sessionData, error: sessionError }] =
      await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (sessionError || !sessionData.session) {
      return NextResponse.json({ error: "Unable to load session" }, { status: 401 });
    }

    const provider = sessionData.session.user.app_metadata?.provider;
    if (provider !== "google") {
      return NextResponse.json(
        { error: "Current session is not authenticated with Google" },
        { status: 400 }
      );
    }

    const accessToken = sessionData.session.provider_token;
    if (!accessToken) {
      return NextResponse.json(
        {
          error:
            "Missing Google provider token. Sign out and sign in with Google again so Gmail scope consent is applied (https://www.googleapis.com/auth/gmail.readonly).",
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const { defaultDate, startEpochSec, endEpochSec } = toWindow(searchParams);
    const gmailQuery = `after:${startEpochSec} before:${endEpochSec}`;

    const messageIds = await listMessageIds(accessToken, gmailQuery);
    if (messageIds.length === 0) {
      return NextResponse.json({
        date: defaultDate,
        totalEmails: 0,
        totalTasks: 0,
        tasks: [],
      });
    }

    const messages: GmailMessageResponse[] = [];
    for (const chunk of chunkArray(messageIds, FETCH_CHUNK_SIZE)) {
      const chunkMessages = await Promise.all(chunk.map((id) => fetchMessage(accessToken, id)));
      messages.push(...chunkMessages);
    }

    const instructions = await readEmailInstructions();
    const contexts = messages.map(toMessageContext);

    const parsedTasks = await Promise.all(
      contexts.map((email) => convertEmailToTask(email, defaultDate, instructions))
    );

    const tasks = parsedTasks.filter((task): task is Task => Boolean(task));

    return NextResponse.json({
      date: defaultDate,
      totalEmails: contexts.length,
      totalTasks: tasks.length,
      tasks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
