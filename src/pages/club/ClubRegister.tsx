import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { clubApi, setClubSession, getClubToken } from "@/lib/club-api";
import ClubBackdrop from "@/components/club/ClubBackdrop";
import ClubFooter from "@/components/club/ClubFooter";
import ClubCard from "@/components/club/ClubCard";
import PhoneInput, { buildE164 } from "@/components/club/PhoneInput";

const GOLD = "#E8C688";
const GOLD_DEEP = "#A68E61";

type Step = "phone" | "code" | "profile" | "done";

const inputStyle: React.CSSProperties = {
  backgroundColor: "rgba(0,0,0,0.55)",
  borderColor: `${GOLD}55`,
  color: GOLD,
};

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="block">
    <span
      className="block text-[10px] tracking-[0.3em] uppercase mb-1.5 font-faberge"
      style={{ color: GOLD_DEEP }}
    >
      {label}
    </span>
    {children}
  </label>
);

const TextInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => {
  const isDate = props.type === "date";
  return (
    <input
      {...props}
      className={`w-full h-12 rounded-md border px-3 outline-none transition-colors focus:border-[${GOLD}] min-w-0 ${props.className ?? ""}`}
      style={{
        ...inputStyle,
        ...(isDate
          ? { fontSize: "14px", textAlign: "left", WebkitAppearance: "none", appearance: "none" as any }
          : {}),
        ...(props.style || {}),
      }}
    />
  );
};

export default function ClubRegister() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(() => {
    if (getClubToken()) return "profile";
    try {
      const raw = sessionStorage.getItem("club:otp-pending");
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.phone && p?.sentAt && Date.now() - p.sentAt < 5 * 60_000) {
          return "code";
        }
        sessionStorage.removeItem("club:otp-pending");
      }
    } catch {}
    return "phone";
  });
  const [busy, setBusy] = useState(false);

  const [phoneLocal, setPhoneLocal] = useState("");
  const [code, setCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [password, setPassword] = useState("");

  const phone = buildE164(phoneLocal);

  const sendOtp = async () => {
    if (phoneLocal.length < 8) return;
    setBusy(true);
    try {
      await clubApi.sendOtp(phone);
      toast.success("Code sent to your phone");
      setStep("code");
    } catch (e: any) {
      toast.error(e.message || "Failed to send code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const res = await clubApi.verifyOtp(phone, code);
      setClubSession(res.token, res.phone);
      if (res.player_exists) {
        toast.success("Welcome back!");
        navigate("/club/wallet", { replace: true });
      } else {
        setStep("profile");
      }
    } catch (e: any) {
      toast.error(e.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const submitProfile = async () => {
    if (!firstName.trim() || !lastName.trim() || !dob) {
      toast.error("Please fill all required fields");
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      toast.error("Password must be at least 8 characters and include letters and numbers");
      return;
    }
    setBusy(true);
    try {
      await clubApi.registerMinimal({
        first_name: firstName,
        last_name: lastName,
        dob,
        password,
      });
      setStep("done");
    } catch (e: any) {
      toast.error(e.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col text-white" style={{ backgroundColor: "#A0000D" }}>
      <ClubBackdrop />

      <header className="relative px-5 pt-6 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs tracking-[0.25em] uppercase"
          style={{ color: GOLD }}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <span
          className="font-faberge text-xs tracking-[0.3em]"
          style={{ color: GOLD }}
        >
          PREMIER CLUB
        </span>
        <span className="w-12" />
      </header>

      <main className="relative flex-1 flex items-start justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <h1
              className="font-faberge text-3xl leading-tight"
              style={{ color: GOLD }}
            >
              {step === "done" ? "Welcome" : "Join the Club"}
            </h1>
            <p
              className="text-[10px] tracking-[0.4em] uppercase mt-2"
              style={{ color: GOLD_DEEP }}
            >
              {step === "phone" && "Step 1 of 3 · Phone"}
              {step === "code" && "Step 2 of 3 · Verify"}
              {step === "profile" && "Step 3 of 3 · Your details"}
              {step === "done" && "All set"}
            </p>
          </div>

          <ClubCard className="p-6 space-y-4">
            {step === "phone" && (
              <>
                <Field label="Phone number">
                  <PhoneInput value={phoneLocal} onChange={setPhoneLocal} autoFocus onEnter={sendOtp} />
                </Field>
                <button
                  onClick={sendOtp}
                  disabled={phoneLocal.length < 8 || busy}
                  className="w-full h-12 rounded-md font-faberge text-sm tracking-[0.3em] uppercase disabled:opacity-50"
                  style={{ backgroundColor: GOLD, color: "#0a0a0a" }}
                >
                  {busy ? "Sending…" : "Send Code"}
                </button>
              </>
            )}

            {step === "code" && (
              <>
                <Field label="6-digit code">
                  <TextInput
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                    autoFocus
                  />
                </Field>
                <button
                  onClick={verify}
                  disabled={code.length !== 6 || busy}
                  className="w-full h-12 rounded-md font-faberge text-sm tracking-[0.3em] uppercase disabled:opacity-50"
                  style={{ backgroundColor: GOLD, color: "#0a0a0a" }}
                >
                  {busy ? "Verifying…" : "Verify"}
                </button>
                <button
                  onClick={() => setStep("phone")}
                  className="w-full text-xs tracking-[0.25em] uppercase"
                  style={{ color: GOLD_DEEP }}
                >
                  Change phone
                </button>
              </>
            )}

            {step === "profile" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name">
                    <TextInput
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoFocus
                    />
                  </Field>
                  <Field label="Last name">
                    <TextInput
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Date of birth">
                  <TextInput
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                  />
                </Field>
                <Field label="Password">
                  <TextInput
                    type="password"
                    placeholder="Min 8 chars, letters + numbers"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <p
                  className="text-[10px] tracking-[0.2em] uppercase text-center pt-1"
                  style={{ color: GOLD_DEEP }}
                >
                  By joining you confirm you are 18+ and accept the club rules.
                </p>
                <button
                  onClick={submitProfile}
                  disabled={busy}
                  className="w-full h-12 rounded-md font-faberge text-sm tracking-[0.3em] uppercase disabled:opacity-50"
                  style={{ backgroundColor: GOLD, color: "#0a0a0a" }}
                >
                  {busy ? "Creating account…" : "Complete Registration"}
                </button>
              </>
            )}

            {step === "done" && (
              <div className="text-center py-4">
                <div
                  className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-5"
                  style={{ backgroundColor: GOLD }}
                >
                  <Check className="w-8 h-8" style={{ color: "#0a0a0a" }} />
                </div>
                <h2 className="font-faberge text-2xl mb-2" style={{ color: GOLD }}>
                  You're in.
                </h2>
                <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.75)" }}>
                  Welcome to Premier Club, {firstName}.<br />
                  Visit any branch to start earning credits.
                </p>
                <button
                  onClick={() => navigate("/club/wallet", { replace: true })}
                  className="w-full h-12 rounded-md font-faberge text-sm tracking-[0.3em] uppercase"
                  style={{ backgroundColor: GOLD, color: "#0a0a0a" }}
                >
                  Open My Wallet
                </button>
              </div>
            )}
          </ClubCard>

          {step === "phone" && (
            <p className="text-center text-xs mt-6" style={{ color: GOLD_DEEP }}>
              Already a member?{" "}
              <Link to="/club/login" className="underline" style={{ color: GOLD }}>
                Sign in
              </Link>
            </p>
          )}
        </div>
      </main>
      <ClubFooter />
    </div>
  );
}
