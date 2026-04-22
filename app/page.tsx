import Calendar from "@/components/Calendar";
import { LoginForm } from "@/components/Login";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
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
