import { redirect } from "next/navigation";

import LoginForm from "./login-form";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-gray-900">Supabase Auth</h1>
          <p className="mt-2 text-sm text-gray-600">
            Create an account or log in to continue.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
