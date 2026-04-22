import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ItemPayload = {
  id?: number;
  title?: string;
  description?: string;
  dateStart?: string;
  dateEnd?: string;
  star?: number;
  type?: string;
  completed?: boolean;
};

function toIsoDate(value: string, field: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${field}`);
  }
  return date.toISOString();
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ItemPayload;
    const title = body.title?.trim();
    const description = body.description?.trim() ?? "";
    const dateStart = body.dateStart;
    const dateEnd = body.dateEnd;

    if (!title || !dateStart || !dateEnd) {
      return NextResponse.json(
        { error: "title, dateStart, and dateEnd are required" },
        { status: 400 }
      );
    }

    const star = body.star ?? 1;
    const type = body.type?.trim() || "task";
    const completed = body.completed ?? false;

    if (star < 1 || star > 3) {
      return NextResponse.json({ error: "star must be between 1 and 3" }, { status: 400 });
    }

    const payload = {
      ...(typeof body.id === "number" ? { id: body.id } : {}),
      title,
      description,
      dateStart: toIsoDate(dateStart, "dateStart"),
      dateEnd: toIsoDate(dateEnd, "dateEnd"),
      star,
      type,
      completed,
      userId: authData.user.id,
    };

    const { data, error } = await supabase
      .from("Item")
      .insert(payload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
