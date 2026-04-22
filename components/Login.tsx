"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  onClose?: () => void;
};

export function LoginForm({ onClose }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGoogleLogin() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (error) {
        setErrorMessage(error.message);
      }
    } catch {
      setErrorMessage("Unable to start Google login. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Sign in</h1>
            <p className="mt-1 text-sm text-gray-600">Continue with your Google account.</p>
          </div>

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close login dialog"
            >
              ✕
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isLoading ? "Redirecting..." : "Continue with Google"}
        </button>

        {errorMessage ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
