import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Kinetic OS" }] }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/campaigns" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/campaigns" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Auth failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/campaigns" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2 bg-background">
      {/* Left: form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-10 animate-in-up">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-md bg-foreground grid place-items-center">
              <div className="size-2 rounded-full bg-background" />
            </div>
            <span className="font-semibold tracking-tight text-sm">KINETIC OS</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight leading-tight">
              {mode === "signin" ? "Welcome back" : "Create your workspace"}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {mode === "signin"
                ? "Sign in to continue running your outreach operations."
                : "Start in under a minute. No credit card required."}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-11 font-medium"
            onClick={google}
            disabled={loading}
          >
            <GoogleIcon />
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-mono">
              <span className="bg-background px-3 text-muted-foreground">Or with email</span>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-11"
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className="h-11"
                placeholder={mode === "signup" ? "Minimum 8 characters" : "••••••••"}
              />
            </div>
            {error && (
              <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            {mode === "signin" ? "New to Kinetic OS?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-4 hover:text-ai"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>

      {/* Right: brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-foreground text-background relative overflow-hidden">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest opacity-60">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          system_online
        </div>
        <div className="space-y-8 max-w-md">
          <h2 className="text-4xl font-semibold tracking-tight leading-[1.1] text-balance">
            The outreach operating system for serious operators.
          </h2>
          <p className="text-sm text-background/60 leading-relaxed">
            Import leads, enrich with AI, build multi-step sequences, and watch every action run
            with human-grade pacing and full transparency into why each message was sent.
          </p>
          <div className="grid grid-cols-3 gap-px bg-background/10 border border-background/10 rounded-md overflow-hidden">
            {[
              ["Leads", "12.4k"],
              ["Sent", "1.2M"],
              ["Reply rate", "8.4%"],
            ].map(([k, v]) => (
              <div key={k} className="bg-foreground p-4">
                <div className="font-mono text-[10px] uppercase tracking-widest text-background/40">
                  {k}
                </div>
                <div className="mt-1 text-lg font-semibold">{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="font-mono text-[10px] text-background/40 uppercase tracking-widest">
          v1.0 / production_grade
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="mr-2 size-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
