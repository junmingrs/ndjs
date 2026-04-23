import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ItemPayload = {
  id?: string;
  title?: string;
  description?: string;
  dateStart?: string;
  dateEnd?: string;
  star?: number;
  type?: string;
  complete?: boolean;
  completed?: boolean;
};

type ItemUpdatePayload = ItemPayload & { id: string };

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
    const dateStart = body.dateStart;
    const dateEnd = body.dateEnd;
    const description = typeof body.description === "string" ? body.description.trim() : "";

    if (!title || !dateStart || !dateEnd) {
      return NextResponse.json(
        { error: "title, dateStart, and dateEnd are required" },
        { status: 400 }
      );
    }

    const star = body.star ?? 1;
    const type = body.type?.trim() || "task";
    const completed = body.complete ?? body.completed ?? false;

    if (star < 1 || star > 3) {
      return NextResponse.json({ error: "star must be between 1 and 3" }, { status: 400 });
    }

    const payload = {
      ...(typeof body.id === "string" ? { id: body.id } : {}),
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

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("Item")
      .select("*")
      .eq("userId", authData.user.id)
      .order("dateStart", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ItemUpdatePayload;
    const id = body.id;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
      }
      updates.title = title;
    }

    if (typeof body.description === "string") {
      updates.description = body.description.trim();
    }

    if (typeof body.dateStart === "string") {
      updates.dateStart = toIsoDate(body.dateStart, "dateStart");
    }

    if (typeof body.dateEnd === "string") {
      updates.dateEnd = toIsoDate(body.dateEnd, "dateEnd");
    }

    if (typeof body.star === "number") {
      if (body.star < 1 || body.star > 3) {
        return NextResponse.json({ error: "star must be between 1 and 3" }, { status: 400 });
      }
      updates.star = body.star;
    }

    if (typeof body.type === "string") {
      updates.type = body.type.trim() || "task";
    }

    if (typeof body.complete === "boolean") {
      updates.completed = body.complete;
    }

    if (typeof body.completed === "boolean") {
      updates.completed = body.completed;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("Item")
      .update(updates)
      .eq("id", id)
      .eq("userId", authData.user.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("Item")
      .delete()
      .eq("id", id)
      .eq("userId", authData.user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
