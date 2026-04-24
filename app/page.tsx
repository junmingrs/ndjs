import Calendar from "@/components/Calendar";
import { LoginForm } from "@/components/Login";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams?: Promise<{
    code?: string;
    next?: string;
  }>;
};

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;

  if (resolvedSearchParams?.code) {
    const next = resolvedSearchParams.next?.startsWith("/") ? resolvedSearchParams.next : "/";
    const callbackParams = new URLSearchParams({
      code: resolvedSearchParams.code,
      next,
    });
    redirect(`/auth/callback?${callbackParams.toString()}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <Calendar />
      {/* do popup here */}
      {!user ? <LoginForm /> : null}
    </>
  );
}
