import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type SendRequest = {
  to?: string;
  subject?: string;
  body?: string;
};

type GmailSendResponse = {
  id?: string;
  threadId?: string;
  error?: {
    message?: string;
  };
};

const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

function toBase64Url(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildRawMessage({ to, subject, body }: { to: string; subject: string; body: string }) {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
  ];

  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendRequest;

    const to = body.to?.trim();
    const subject = body.subject?.trim();
    const messageBody = body.body?.trim();

    if (!to || !subject || !messageBody) {
      return NextResponse.json({ error: "to, subject, and body are required" }, { status: 400 });
    }

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

    const raw = toBase64Url(buildRawMessage({ to, subject, body: messageBody }));

    const response = await fetch(GMAIL_SEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
      cache: "no-store",
    });

    const data = (await response.json()) as GmailSendResponse;

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message ?? "Failed to send Gmail message" },
        { status: 400 }
      );
    }

    return NextResponse.json({ id: data.id, threadId: data.threadId, success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
