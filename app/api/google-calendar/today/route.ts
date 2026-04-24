import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type CalendarEventItem = {
  id?: string;
  iCalUID?: string;
  summary?: string;
  description?: string;
  start?: {
    dateTime?: string;
    date?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
  };
};

type CalendarEventsResponse = {
  items?: CalendarEventItem[];
  error?: {
    message?: string;
  };
};

type CalendarListItem = {
  id?: string;
  summary?: string;
};

type CalendarListResponse = {
  items?: CalendarListItem[];
  nextPageToken?: string;
  error?: {
    message?: string;
  };
};

type CalendarTask = {
  id: string;
  title: string;
  description: string;
  date: string;
  timeStr: string;
  endTimeStr: string;
  hour: number;
  minute: number;
  stars: 1 | 2 | 3;
  color: "blue" | "rose" | "green";
  done: boolean;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeStr(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseEventDate(value: { dateTime?: string; date?: string } | undefined, fallbackHour: number) {
  if (!value) {
    return null;
  }

  if (value.dateTime) {
    const parsed = new Date(value.dateTime);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (value.date) {
    const parsed = new Date(`${value.date}T${pad(fallbackHour)}:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

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
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    };
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const start = Date.UTC(year, month, day, 0, 0, 0, 0);
  const end = Date.UTC(year, month, day + 1, 0, 0, 0, 0);

  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
  };
}

function toTask(event: CalendarEventItem, calendarId: string): CalendarTask | null {
  const title = event.summary?.trim() || "Google Calendar event";

  const start = parseEventDate(event.start, 9);
  const end = parseEventDate(event.end, 10);
  if (!start || !end) {
    return null;
  }

  return {
    id: `${calendarId}:${event.id ?? event.iCalUID ?? crypto.randomUUID()}`,
    title,
    description: event.description?.trim() ?? "",
    date: toDateStr(start),
    timeStr: toTimeStr(start),
    endTimeStr: toTimeStr(end),
    hour: start.getHours(),
    minute: start.getMinutes(),
    stars: 1,
    color: "blue",
    done: false,
  };
}

async function listUserCalendars(accessToken: string) {
  const calendars: Array<{ id: string; summary: string }> = [];
  let nextPageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      maxResults: "250",
      minAccessRole: "reader",
    });

    if (nextPageToken) {
      params.set("pageToken", nextPageToken);
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/users/me/calendarList?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }
    );

    const data = (await response.json()) as CalendarListResponse;
    if (!response.ok) {
      throw new Error(data.error?.message ?? "Failed to list Google Calendars");
    }

    for (const calendar of data.items ?? []) {
      if (!calendar.id) {
        continue;
      }

      calendars.push({
        id: calendar.id,
        summary: calendar.summary?.trim() || "Calendar",
      });
    }

    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  return calendars;
}

async function fetchCalendarEvents(
  accessToken: string,
  calendarId: string,
  startIso: string,
  endIso: string
) {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: startIso,
    timeMax: endIso,
    maxResults: "250",
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  const data = (await response.json()) as CalendarEventsResponse;
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Failed to fetch events for calendar ${calendarId}`);
  }

  return data.items ?? [];
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
            "Missing Google provider token. Sign out and sign in with Google again so Calendar scope consent is applied (https://www.googleapis.com/auth/calendar.readonly).",
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const { startIso, endIso } = toWindow(searchParams);

    const calendars = await listUserCalendars(accessToken);

    if (calendars.length === 0) {
      return NextResponse.json({
        timeMin: startIso,
        timeMax: endIso,
        totalCalendars: 0,
        totalEvents: 0,
        tasks: [],
      });
    }

    const eventsByCalendar = await Promise.all(
      calendars.map(async (calendar) => ({
        calendar,
        events: await fetchCalendarEvents(accessToken, calendar.id, startIso, endIso),
      }))
    );

    const tasks = eventsByCalendar
      .flatMap(({ calendar, events }) => events.map((event) => toTask(event, calendar.id)))
      .filter((task): task is CalendarTask => Boolean(task));

    return NextResponse.json({
      timeMin: startIso,
      timeMax: endIso,
      totalCalendars: calendars.length,
      totalEvents: tasks.length,
      tasks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
