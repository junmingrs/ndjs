import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
};

type GmailMessageResponse = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
};

type GmailEmail = {
  id: string;
  threadId: string;
  internalDate: string | null;
  subject: string | null;
  from: string | null;
  to: string | null;
  date: string | null;
  snippet: string;
  labelIds: string[];
};

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const LIST_MAX_RESULTS = 500;
const FETCH_CHUNK_SIZE = 20;

function toDayWindow(dateParam: string | null) {
  if (!dateParam) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();
    const start = Date.UTC(year, month, day, 0, 0, 0, 0);
    const end = Date.UTC(year, month, day + 1, 0, 0, 0, 0);

    return {
      date: new Date(start).toISOString().slice(0, 10),
      startEpochSec: Math.floor(start / 1000),
      endEpochSec: Math.floor(end / 1000),
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    throw new Error("date must use YYYY-MM-DD format");
  }

  const [yearRaw, monthRaw, dayRaw] = dateParam.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  const start = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const end = Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0);
  const isoDate = new Date(start).toISOString().slice(0, 10);

  if (isoDate !== dateParam) {
    throw new Error("date is invalid");
  }

  return {
    date: dateParam,
    startEpochSec: Math.floor(start / 1000),
    endEpochSec: Math.floor(end / 1000),
  };
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

function toEmail(message: GmailMessageResponse): GmailEmail {
  const headers = message.payload?.headers;

  return {
    id: message.id,
    threadId: message.threadId,
    internalDate: message.internalDate ?? null,
    subject: getHeader(headers, "Subject"),
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    date: getHeader(headers, "Date"),
    snippet: message.snippet ?? "",
    labelIds: message.labelIds ?? [],
  };
}

function chunkArray<T>(values: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
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
  const params = new URLSearchParams({
    format: "metadata",
    metadataHeaders: "Subject",
  });
  params.append("metadataHeaders", "From");
  params.append("metadataHeaders", "To");
  params.append("metadataHeaders", "Date");

  const response = await fetch(`${GMAIL_API_BASE}/messages/${id}?${params.toString()}`, {
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
    const { date, startEpochSec, endEpochSec } = toDayWindow(searchParams.get("date"));
    const gmailQuery = `after:${startEpochSec} before:${endEpochSec}`;

    const messageIds = await listMessageIds(accessToken, gmailQuery);

    if (messageIds.length === 0) {
      return NextResponse.json({
        date,
        total: 0,
        emails: [],
      });
    }

    const emails: GmailEmail[] = [];

    for (const chunk of chunkArray(messageIds, FETCH_CHUNK_SIZE)) {
      const messages = await Promise.all(chunk.map((id) => fetchMessage(accessToken, id)));
      emails.push(...messages.map(toEmail));
    }

    emails.sort((a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0));

    return NextResponse.json({
      date,
      total: emails.length,
      emails,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
