import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield } from "lucide-react";

const LOGIN_DOMAIN = "@cms.local";

const BRANCH_NAMES: Record<string, string> = {
  arusha: "Arusha Cloud",
  mwanza: "Mwanza Cloud",
  dodoma: "Dodoma Cloud",
  mbeya: "Mbeya Cloud",
  premier: "Premier",
};

const BRANCH_LOGOS: Record<string, string> = {
  arusha: "/arusha-premier-logo.svg",
  mwanza: "/mwanza-premier-logo.png",
  dodoma: "/arusha-premier-logo.svg",
  mbeya: "/arusha-premier-logo.svg",
  premier: "/arusha-premier-logo.svg",
};

const GOLD = "#E8C688";

const Login = () => {
  const { signIn } = useAuth();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const email = login.includes("@") ? login : `${login.toLowerCase().trim()}${LOGIN_DOMAIN}`;
    const { error } = await signIn(email, password);
    if (error) setError("Invalid login or password");
    setLoading(false);
  };

  const hostLabel =
    typeof window !== "undefined"
      ? (window.location.hostname || "").toLowerCase().split(".")[0]
      : "";
  const branchName = BRANCH_NAMES[hostLabel] || null;
  const isBranded = branchName !== null;

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={isBranded ? { backgroundColor: "#000000" } : undefined}
    >
      <div className={isBranded ? "w-full" : "bg-background w-full"}>
        <div className="w-full max-w-sm mx-auto px-4">
          <div className="text-center mb-8">
            {isBranded ? (
              <>
                <img
                  src={BRANCH_LOGOS[hostLabel] || "/arusha-premier-logo.svg"}
                  alt={branchName}
                  className="mx-auto mb-3 h-28 w-auto"
                />
                <p
                  className="font-faberge text-xl uppercase tracking-[0.35em]"
                  style={{ color: GOLD }}
                >
                  {branchName}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Shield className="w-8 h-8 text-primary" />
                  <span className="text-2xl font-bold text-foreground">CMS</span>
                </div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Casino Management System
                </p>
              </>
            )}
          </div>

          <div
            className={isBranded ? "p-6 rounded-md border" : "cms-panel p-6"}
            style={
              isBranded
                ? { backgroundColor: "#0a0a0a", borderColor: `${GOLD}33` }
                : undefined
            }
          >
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label
                  className="text-xs font-medium uppercase tracking-wider mb-1.5 block"
                  style={isBranded ? { color: GOLD } : undefined}
                >
                  {isBranded ? "Login" : <span className="text-muted-foreground">Login</span>}
                </label>
                <Input
                  type="text"
                  placeholder="username"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                  className="font-mono"
                  style={
                    isBranded
                      ? { backgroundColor: "#000", color: GOLD, borderColor: `${GOLD}55` }
                      : undefined
                  }
                />
              </div>
              <div>
                <label
                  className="text-xs font-medium uppercase tracking-wider mb-1.5 block"
                  style={isBranded ? { color: GOLD } : undefined}
                >
                  {isBranded ? "Password" : <span className="text-muted-foreground">Password</span>}
                </label>
                <Input
                  type="password"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={
                    isBranded
                      ? { backgroundColor: "#000", color: GOLD, borderColor: `${GOLD}55` }
                      : undefined
                  }
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                style={
                  isBranded
                    ? { backgroundColor: GOLD, color: "#000", borderColor: GOLD }
                    : undefined
                }
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            {error && <p className="mt-3 text-xs text-destructive text-center">{error}</p>}

          </div>

          <div className="mt-12 text-center">
            <p className="text-[10px] font-sans text-primary">
              ©2026 Amaell Group LLC. All rights reserved.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Login;
