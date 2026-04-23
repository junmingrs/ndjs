import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type FormatRequest = {
  taskName?: string;
  relationshipTag?: string;
  relationshipDescription?: string;
  completionDetails?: string;
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

type DraftResponse = {
  subject: string;
  body: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as FormatRequest;
    const taskName = body.taskName?.trim();
    const completionDetails = body.completionDetails?.trim();

    if (!taskName) {
      return NextResponse.json({ error: "taskName is required" }, { status: 400 });
    }

    if (!completionDetails) {
      return NextResponse.json({ error: "completionDetails is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
    }

    const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

    const promptPayload = {
      taskName,
      relationshipTag: body.relationshipTag?.trim() || "Recipient",
      relationshipDescription: body.relationshipDescription?.trim() || "",
      completionDetails,
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "gmail_update_email",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                subject: { type: "string", minLength: 3, maxLength: 120 },
                body: { type: "string", minLength: 10, maxLength: 4000 },
              },
              required: ["subject", "body"],
            },
          },
        },
        messages: [
          {
            role: "system",
            content:
              "You are an assistant that writes concise professional update emails. Return JSON only with subject and body. Body must be plain text with line breaks and no markdown.",
          },
          {
            role: "user",
            content: JSON.stringify(promptPayload),
          },
        ],
      }),
      cache: "no-store",
    });

    const data = (await response.json()) as OpenAIResponse;

    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message ?? "OpenAI request failed" }, { status: 400 });
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "OpenAI returned an empty response" }, { status: 400 });
    }

    const parsed = JSON.parse(content) as DraftResponse;

    return NextResponse.json({
      subject: parsed.subject,
      body: parsed.body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
