"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: username.trim(), password }),
    });
    setBusy(false);
    if (res.ok) {
      router.replace(params.get("from") ?? "/");
      router.refresh();
    } else {
      setError("Wrong username or password");
    }
  }

  return (
    <div className="grid h-dvh place-items-center bg-ink">
      <form onSubmit={submit} className="w-[300px]">
        <h1 className="text-center text-[20px] font-bold tracking-[0.14em]">
          STAY<span className="text-accent">.</span>
        </h1>
        <input
          type="text"
          autoComplete="username"
          autoFocus
          className="field mt-6"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-label="Username"
        />
        <input
          type="password"
          autoComplete="current-password"
          className="field mt-2"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Password"
        />
        {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
        <button className="btn btn-accent mt-3 w-full" disabled={busy || !password || !username.trim()}>
          {busy ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  );
}
