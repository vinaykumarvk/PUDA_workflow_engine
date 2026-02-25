import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthContext";
import { Alert, Button, Field, Input, Select } from "@puda/shared";
import "./onboarding.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

interface VerificationData {
  aadhaar_verified?: boolean;
  aadhaar_verified_at?: string;
  pan_verified?: boolean;
  pan_verified_at?: string;
  onboarding_completed_at?: string;
}

interface CompletenessSection {
  complete: boolean;
  fields: string[];
}

interface Completeness {
  isComplete: boolean;
  completionPercent: number;
  missingFields: string[];
  sections: {
    identity: CompletenessSection;
    personal: CompletenessSection;
    contact: CompletenessSection;
    address: CompletenessSection;
  };
}

interface OnboardingProps {
  applicant: Record<string, any>;
  addresses: Record<string, any>;
  verification: VerificationData;
  completeness?: Completeness;
  onComplete: (updatedProfile: any) => void;
  onSkip: () => void;
}

type StepId = 1 | 2 | 3 | 4;

const STEPS = [
  { id: 1 as StepId, label: "Aadhaar eKYC" },
  { id: 2 as StepId, label: "PAN Verify" },
  { id: 3 as StepId, label: "Details" },
  { id: 4 as StepId, label: "Address" },
];

function SourceBadge({ type }: { type: "aadhaar" | "pan" | "self" }) {
  const labels = { aadhaar: "Aadhaar Verified", pan: "PAN Verified", self: "Self-declared" };
  return <span className={`badge-source badge-source--${type}`}>{labels[type]}</span>;
}

export default function Onboarding({
  applicant: initialApplicant,
  addresses: initialAddresses,
  verification: initialVerification,
  completeness: initialCompleteness,
  onComplete,
  onSkip,
}: OnboardingProps) {
  const { t } = useTranslation();
  const { authHeaders } = useAuth();

  const [step, setStep] = useState<StepId>(1);
  const [applicant, setApplicant] = useState<Record<string, any>>({ ...initialApplicant });
  const [addresses, setAddresses] = useState<Record<string, any>>({ ...initialAddresses });
  const [verification, setVerification] = useState<VerificationData>({ ...initialVerification });
  const [completeness, setCompleteness] = useState<Completeness | undefined>(initialCompleteness);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [aadhaarInput, setAadhaarInput] = useState(applicant.aadhaar || "");
  const [otpSent, setOtpSent] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [txnId, setTxnId] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingAadhaar, setVerifyingAadhaar] = useState(false);
  const [aadhaarDemographics, setAadhaarDemographics] = useState<any>(null);

  // Step 2 state
  const [panInput, setPanInput] = useState(applicant.pan || "");
  const [verifyingPan, setVerifyingPan] = useState(false);
  const [panResult, setPanResult] = useState<{ registered_name?: string; name_match_score?: number } | null>(null);

  // Step 3 state
  const [manualFields, setManualFields] = useState({
    father_name: applicant.father_name || "",
    marital_status: applicant.marital_status || "",
    email: applicant.email || "",
    mobile: applicant.mobile || "",
    salutation: applicant.salutation || "",
  });

  // Step 4 state
  const [permanentAddr, setPermanentAddr] = useState<Record<string, any>>(addresses.permanent || {});
  const [commAddr, setCommAddr] = useState<Record<string, any>>(addresses.communication || {});
  const [sameAsPermanent, setSameAsPermanent] = useState(
    addresses.communication?.same_as_permanent ?? true
  );

  const hdrs = useCallback(
    () => ({ ...authHeaders(), "Content-Type": "application/json" }),
    [authHeaders]
  );

  // Step 1: Send OTP
  const sendOtp = useCallback(async () => {
    setError(null);
    setSendingOtp(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/profile/ekyc/aadhaar/send-otp`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ aadhaar: aadhaarInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send OTP");
      setTxnId(data.txnId);
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setSendingOtp(false);
    }
  }, [aadhaarInput, hdrs]);

  // Step 1: Verify OTP
  const verifyAadhaar = useCallback(async () => {
    setError(null);
    setVerifyingAadhaar(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/profile/ekyc/aadhaar/verify`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ aadhaar: aadhaarInput, otp: otpInput, txnId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Verification failed");

      setAadhaarDemographics(data.demographics);
      setApplicant((prev) => ({ ...prev, ...data.applicant }));
      setAddresses((prev) => ({ ...prev, ...data.addresses }));
      setPermanentAddr(data.addresses?.permanent || {});
      setVerification(data.verification || {});
      if (data.completeness) setCompleteness(data.completeness);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifyingAadhaar(false);
    }
  }, [aadhaarInput, otpInput, txnId, hdrs]);

  // Step 2: Verify PAN
  const verifyPan = useCallback(async () => {
    setError(null);
    setVerifyingPan(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/profile/verify/pan`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ pan: panInput.toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "PAN verification failed");

      setPanResult({ registered_name: data.registered_name, name_match_score: data.name_match_score });
      setApplicant((prev) => ({ ...prev, pan: panInput.toUpperCase() }));
      setVerification(data.verification || {});
      if (data.completeness) setCompleteness(data.completeness);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PAN verification failed");
    } finally {
      setVerifyingPan(false);
    }
  }, [panInput, hdrs]);

  // Final: Save all and complete
  const completeOnboarding = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      const commAddressPayload = sameAsPermanent
        ? { same_as_permanent: true, line1: null, line2: null, city: null, state: null, district: null, pincode: null }
        : { same_as_permanent: false, ...commAddr };

      const res = await fetch(`${apiBaseUrl}/api/v1/profile/me`, {
        method: "PATCH",
        headers: hdrs(),
        body: JSON.stringify({
          applicant: {
            father_name: manualFields.father_name,
            marital_status: manualFields.marital_status,
            email: manualFields.email,
            mobile: manualFields.mobile,
            salutation: manualFields.salutation,
          },
          addresses: {
            permanent: permanentAddr,
            communication: commAddressPayload,
          },
          verification: {
            onboarding_completed_at: new Date().toISOString(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Failed to save profile");
      onComplete(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }, [manualFields, permanentAddr, commAddr, sameAsPermanent, hdrs, onComplete]);

  const goNext = () => setStep((s) => Math.min(s + 1, 4) as StepId);
  const goBack = () => setStep((s) => Math.max(s - 1, 1) as StepId);

  const renderStepper = () => (
    <div className="onboarding__stepper" role="navigation" aria-label="Onboarding steps">
      {STEPS.map((s, i) => {
        const isDone = step > s.id;
        const isActive = step === s.id;
        return (
          <div key={s.id} style={{ display: "contents" }}>
            {i > 0 && (
              <div className={`onboarding__step-connector${isDone ? " onboarding__step-connector--done" : ""}`} />
            )}
            <div className={`onboarding__step${isActive ? " onboarding__step--active" : ""}${isDone ? " onboarding__step--done" : ""}`}>
              <span className="onboarding__step-number" aria-current={isActive ? "step" : undefined}>
                {isDone ? "\u2713" : s.id}
              </span>
              <span className="onboarding__step-label">{s.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Step 1: Aadhaar eKYC
  const renderStep1 = () => (
    <div className="onboarding__card">
      <h2>Aadhaar eKYC Verification</h2>
      <p className="onboarding__card-subtitle">
        Verify your Aadhaar to auto-populate your name, date of birth, gender, and address.
      </p>

      {error && <Alert variant="error">{error}</Alert>}

      {verification.aadhaar_verified && aadhaarDemographics ? (
        <div className="onboarding__fetched">
          <h3>Details Fetched from Aadhaar <SourceBadge type="aadhaar" /></h3>
          <div className="onboarding__fetched-grid">
            <div>
              <div className="onboarding__fetched-label">Full Name</div>
              <div className="onboarding__fetched-value">{aadhaarDemographics.full_name}</div>
            </div>
            <div>
              <div className="onboarding__fetched-label">Date of Birth</div>
              <div className="onboarding__fetched-value">{aadhaarDemographics.date_of_birth}</div>
            </div>
            <div>
              <div className="onboarding__fetched-label">Gender</div>
              <div className="onboarding__fetched-value">{aadhaarDemographics.gender}</div>
            </div>
            <div>
              <div className="onboarding__fetched-label">Address</div>
              <div className="onboarding__fetched-value">
                {aadhaarDemographics.address?.line1}, {aadhaarDemographics.address?.city}, {aadhaarDemographics.address?.state} - {aadhaarDemographics.address?.pincode}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="onboarding__field-group">
            <Field label="Aadhaar Number" htmlFor="onb-aadhaar" required>
              <Input
                id="onb-aadhaar"
                value={aadhaarInput}
                onChange={(e) => setAadhaarInput(e.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="Enter 12-digit Aadhaar"
                inputMode="numeric"
                maxLength={12}
                disabled={otpSent}
              />
            </Field>
            {!otpSent ? (
              <Button
                variant="primary"
                onClick={() => void sendOtp()}
                disabled={aadhaarInput.length !== 12 || sendingOtp}
              >
                {sendingOtp ? "Sending OTP..." : "Send OTP"}
              </Button>
            ) : (
              <div className="onboarding__otp-row">
                <Field label="Enter OTP" htmlFor="onb-otp" required>
                  <Input
                    id="onb-otp"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6-digit OTP"
                    inputMode="numeric"
                    maxLength={6}
                  />
                </Field>
                <Button
                  variant="primary"
                  onClick={() => void verifyAadhaar()}
                  disabled={otpInput.length < 4 || verifyingAadhaar}
                >
                  {verifyingAadhaar ? "Verifying..." : "Verify"}
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <div className="onboarding__nav">
        <Button variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
        <div className="onboarding__nav-right">
          {!verification.aadhaar_verified && (
            <Button
              variant="ghost"
              onClick={() => { setError(null); goNext(); }}
            >
              I'll enter details manually
            </Button>
          )}
          {verification.aadhaar_verified && (
            <Button variant="primary" onClick={() => { setError(null); goNext(); }}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  // Step 2: PAN Verification
  const renderStep2 = () => (
    <div className="onboarding__card">
      <h2>PAN Verification</h2>
      <p className="onboarding__card-subtitle">
        Verify your PAN card for identity confirmation.
      </p>

      {error && <Alert variant="error">{error}</Alert>}

      {verification.pan_verified && panResult ? (
        <>
          <div className="onboarding__fetched">
            <h3>PAN Verified <SourceBadge type="pan" /></h3>
            <div className="onboarding__fetched-grid">
              <div>
                <div className="onboarding__fetched-label">PAN</div>
                <div className="onboarding__fetched-value">{applicant.pan}</div>
              </div>
              <div>
                <div className="onboarding__fetched-label">Registered Name</div>
                <div className="onboarding__fetched-value">{panResult.registered_name}</div>
              </div>
            </div>
          </div>
          {panResult.name_match_score !== undefined && (
            <div className={`onboarding__match ${panResult.name_match_score >= 50 ? "onboarding__match--good" : "onboarding__match--warn"}`}>
              {panResult.name_match_score >= 50
                ? `Name matches Aadhaar record (${panResult.name_match_score}% match)`
                : `Name mismatch with Aadhaar record (${panResult.name_match_score}% match). Please verify.`}
            </div>
          )}
        </>
      ) : (
        <div className="onboarding__field-group">
          <Field label="PAN Number" htmlFor="onb-pan" required>
            <Input
              id="onb-pan"
              value={panInput}
              onChange={(e) => setPanInput(e.target.value.toUpperCase().slice(0, 10))}
              placeholder="AAAAA9999A"
              maxLength={10}
              style={{ textTransform: "uppercase" }}
            />
          </Field>
          <Button
            variant="primary"
            onClick={() => void verifyPan()}
            disabled={panInput.length !== 10 || verifyingPan}
          >
            {verifyingPan ? "Verifying..." : "Verify PAN"}
          </Button>
        </div>
      )}

      <div className="onboarding__nav">
        <Button variant="ghost" onClick={() => { setError(null); goBack(); }}>
          Back
        </Button>
        <div className="onboarding__nav-right">
          {!verification.pan_verified && (
            <Button variant="ghost" onClick={() => { setError(null); goNext(); }}>
              I'll add PAN later
            </Button>
          )}
          <Button variant="primary" onClick={() => { setError(null); goNext(); }}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );

  // Step 3: Additional Details
  const renderStep3 = () => (
    <div className="onboarding__card">
      <h2>Additional Details</h2>
      <p className="onboarding__card-subtitle">
        Complete the remaining personal details. <SourceBadge type="self" />
      </p>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="onboarding__field-group onboarding__field-group--two-col">
        <Field label="Salutation" htmlFor="onb-salutation">
          <Select
            id="onb-salutation"
            value={manualFields.salutation}
            onChange={(e) => setManualFields((p) => ({ ...p, salutation: e.target.value }))}
          >
            <option value="">Select</option>
            <option value="MR">Mr</option>
            <option value="MS">Ms</option>
            <option value="MRS">Mrs</option>
          </Select>
        </Field>
        <Field label="Father's Name" htmlFor="onb-father" required>
          <Input
            id="onb-father"
            value={manualFields.father_name}
            onChange={(e) => setManualFields((p) => ({ ...p, father_name: e.target.value }))}
            placeholder="Father's full name"
          />
        </Field>
        <Field label="Marital Status" htmlFor="onb-marital" required>
          <Select
            id="onb-marital"
            value={manualFields.marital_status}
            onChange={(e) => setManualFields((p) => ({ ...p, marital_status: e.target.value }))}
          >
            <option value="">Select</option>
            <option value="SINGLE">Single</option>
            <option value="MARRIED">Married</option>
          </Select>
        </Field>
        <Field label="Email" htmlFor="onb-email" required>
          <Input
            id="onb-email"
            type="email"
            value={manualFields.email}
            onChange={(e) => setManualFields((p) => ({ ...p, email: e.target.value }))}
            placeholder="your@email.com"
          />
        </Field>
        <Field label="Mobile Number" htmlFor="onb-mobile" required>
          <Input
            id="onb-mobile"
            value={manualFields.mobile}
            onChange={(e) => setManualFields((p) => ({ ...p, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
            placeholder="10-digit mobile"
            inputMode="numeric"
            maxLength={10}
          />
        </Field>
      </div>

      <div className="onboarding__nav">
        <Button variant="ghost" onClick={() => { setError(null); goBack(); }}>
          Back
        </Button>
        <div className="onboarding__nav-right">
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
          <Button
            variant="primary"
            onClick={() => { setError(null); goNext(); }}
            disabled={!manualFields.father_name || !manualFields.marital_status || !manualFields.email || !manualFields.mobile}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );

  // Step 4: Address Confirmation
  const renderStep4 = () => {
    const aadhaarLocked = Boolean(verification.aadhaar_verified);
    return (
      <div className="onboarding__card">
        <h2>Address Confirmation</h2>
        <p className="onboarding__card-subtitle">
          Confirm your permanent and communication addresses.
        </p>

        {error && <Alert variant="error">{error}</Alert>}

        <h3 style={{ fontSize: "0.95rem", marginBottom: "var(--space-3)" }}>
          Permanent Address {aadhaarLocked && <SourceBadge type="aadhaar" />}
        </h3>
        <div className="onboarding__field-group onboarding__field-group--two-col">
          <Field label="Address Line 1" htmlFor="onb-perm-line1" required>
            <Input
              id="onb-perm-line1"
              value={permanentAddr.line1 || ""}
              onChange={(e) => setPermanentAddr((p) => ({ ...p, line1: e.target.value }))}
              readOnly={aadhaarLocked}
            />
          </Field>
          <Field label="Address Line 2" htmlFor="onb-perm-line2">
            <Input
              id="onb-perm-line2"
              value={permanentAddr.line2 || ""}
              onChange={(e) => setPermanentAddr((p) => ({ ...p, line2: e.target.value }))}
              readOnly={aadhaarLocked}
            />
          </Field>
          <Field label="City" htmlFor="onb-perm-city" required>
            <Input
              id="onb-perm-city"
              value={permanentAddr.city || ""}
              onChange={(e) => setPermanentAddr((p) => ({ ...p, city: e.target.value }))}
              readOnly={aadhaarLocked}
            />
          </Field>
          <Field label="District" htmlFor="onb-perm-district" required>
            <Input
              id="onb-perm-district"
              value={permanentAddr.district || ""}
              onChange={(e) => setPermanentAddr((p) => ({ ...p, district: e.target.value }))}
              readOnly={aadhaarLocked}
            />
          </Field>
          <Field label="State" htmlFor="onb-perm-state" required>
            <Input
              id="onb-perm-state"
              value={permanentAddr.state || ""}
              onChange={(e) => setPermanentAddr((p) => ({ ...p, state: e.target.value }))}
              readOnly={aadhaarLocked}
            />
          </Field>
          <Field label="Pincode" htmlFor="onb-perm-pin" required>
            <Input
              id="onb-perm-pin"
              value={permanentAddr.pincode || ""}
              onChange={(e) => setPermanentAddr((p) => ({ ...p, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
              readOnly={aadhaarLocked}
              inputMode="numeric"
              maxLength={6}
            />
          </Field>
        </div>

        <h3 style={{ fontSize: "0.95rem", margin: "var(--space-5) 0 var(--space-3)" }}>
          Communication Address
        </h3>
        <label className="onboarding__checkbox-row">
          <input
            type="checkbox"
            checked={sameAsPermanent}
            onChange={(e) => setSameAsPermanent(e.target.checked)}
          />
          Same as permanent address
        </label>

        {!sameAsPermanent && (
          <div className="onboarding__field-group onboarding__field-group--two-col">
            <Field label="Address Line 1" htmlFor="onb-comm-line1" required>
              <Input
                id="onb-comm-line1"
                value={commAddr.line1 || ""}
                onChange={(e) => setCommAddr((p) => ({ ...p, line1: e.target.value }))}
              />
            </Field>
            <Field label="Address Line 2" htmlFor="onb-comm-line2">
              <Input
                id="onb-comm-line2"
                value={commAddr.line2 || ""}
                onChange={(e) => setCommAddr((p) => ({ ...p, line2: e.target.value }))}
              />
            </Field>
            <Field label="City" htmlFor="onb-comm-city" required>
              <Input
                id="onb-comm-city"
                value={commAddr.city || ""}
                onChange={(e) => setCommAddr((p) => ({ ...p, city: e.target.value }))}
              />
            </Field>
            <Field label="District" htmlFor="onb-comm-district" required>
              <Input
                id="onb-comm-district"
                value={commAddr.district || ""}
                onChange={(e) => setCommAddr((p) => ({ ...p, district: e.target.value }))}
              />
            </Field>
            <Field label="State" htmlFor="onb-comm-state" required>
              <Input
                id="onb-comm-state"
                value={commAddr.state || ""}
                onChange={(e) => setCommAddr((p) => ({ ...p, state: e.target.value }))}
              />
            </Field>
            <Field label="Pincode" htmlFor="onb-comm-pin" required>
              <Input
                id="onb-comm-pin"
                value={commAddr.pincode || ""}
                onChange={(e) => setCommAddr((p) => ({ ...p, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                inputMode="numeric"
                maxLength={6}
              />
            </Field>
          </div>
        )}

        <div className="onboarding__nav">
          <Button variant="ghost" onClick={() => { setError(null); goBack(); }}>
            Back
          </Button>
          <div className="onboarding__nav-right">
            <Button variant="ghost" onClick={onSkip}>
              Skip for now
            </Button>
            <Button
              variant="primary"
              onClick={() => void completeOnboarding()}
              disabled={saving || !permanentAddr.line1 || !permanentAddr.city || !permanentAddr.pincode}
            >
              {saving ? "Saving..." : "Complete Profile"}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="onboarding">
      {renderStepper()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
    </div>
  );
}

// Exported: Profile Summary View (post-onboarding)
export function ProfileSummary({
  applicant,
  addresses,
  verification,
  completeness,
  onEdit,
  onReVerifyAadhaar,
  onReVerifyPan,
}: {
  applicant: Record<string, any>;
  addresses: Record<string, any>;
  verification: VerificationData;
  completeness?: Completeness;
  onEdit: () => void;
  onReVerifyAadhaar: () => void;
  onReVerifyPan: () => void;
}) {
  const pct = completeness?.completionPercent ?? 0;
  const permAddr = addresses?.permanent || {};
  const commAddr = addresses?.communication || {};

  const fieldBadge = (field: string): "aadhaar" | "pan" | "self" => {
    if (verification.aadhaar_verified && ["full_name", "date_of_birth", "gender", "aadhaar"].includes(field)) return "aadhaar";
    if (verification.pan_verified && field === "pan") return "pan";
    return "self";
  };

  const renderField = (label: string, value: any, field?: string) => (
    <div className="profile-summary__field">
      <div className="profile-summary__field-label">{label}</div>
      <div className="profile-summary__field-value">
        {value || "—"}
        {field && <SourceBadge type={fieldBadge(field)} />}
      </div>
    </div>
  );

  return (
    <div className="profile-summary">
      <div className="profile-summary__header">
        <h2 style={{ margin: 0 }}>My Profile</h2>
        <div className="profile-summary__percent">
          <div className="profile-summary__bar">
            <div className="profile-summary__bar-fill" style={{ width: `${pct}%` }} />
          </div>
          {pct}% complete
        </div>
      </div>

      {/* Identity Section */}
      <div className="profile-summary__section">
        <div className="profile-summary__section-header">
          <span className="profile-summary__section-title">Identity</span>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            {verification.aadhaar_verified ? (
              <Button variant="ghost" onClick={onReVerifyAadhaar} style={{ fontSize: "0.8rem" }}>Re-verify Aadhaar</Button>
            ) : (
              <Button variant="ghost" onClick={onReVerifyAadhaar} style={{ fontSize: "0.8rem" }}>Verify Aadhaar</Button>
            )}
            {verification.pan_verified ? (
              <Button variant="ghost" onClick={onReVerifyPan} style={{ fontSize: "0.8rem" }}>Re-verify PAN</Button>
            ) : (
              <Button variant="ghost" onClick={onReVerifyPan} style={{ fontSize: "0.8rem" }}>Verify PAN</Button>
            )}
          </div>
        </div>
        <div className="profile-summary__grid">
          {renderField("Aadhaar", applicant.aadhaar ? `XXXX XXXX ${applicant.aadhaar.slice(-4)}` : null, "aadhaar")}
          {renderField("PAN", applicant.pan, "pan")}
        </div>
      </div>

      {/* Personal Section */}
      <div className="profile-summary__section">
        <div className="profile-summary__section-header">
          <span className="profile-summary__section-title">Personal Details</span>
          <Button variant="ghost" onClick={onEdit} style={{ fontSize: "0.8rem" }}>Edit</Button>
        </div>
        <div className="profile-summary__grid">
          {renderField("Full Name", applicant.full_name, "full_name")}
          {renderField("Date of Birth", applicant.date_of_birth, "date_of_birth")}
          {renderField("Gender", applicant.gender, "gender")}
          {renderField("Father's Name", applicant.father_name, "father_name")}
          {renderField("Marital Status", applicant.marital_status, "marital_status")}
          {renderField("Salutation", applicant.salutation)}
        </div>
      </div>

      {/* Contact Section */}
      <div className="profile-summary__section">
        <div className="profile-summary__section-header">
          <span className="profile-summary__section-title">Contact</span>
          <Button variant="ghost" onClick={onEdit} style={{ fontSize: "0.8rem" }}>Edit</Button>
        </div>
        <div className="profile-summary__grid">
          {renderField("Email", applicant.email, "email")}
          {renderField("Mobile", applicant.mobile, "mobile")}
        </div>
      </div>

      {/* Address Section */}
      <div className="profile-summary__section">
        <div className="profile-summary__section-header">
          <span className="profile-summary__section-title">Addresses</span>
          {!verification.aadhaar_verified && (
            <Button variant="ghost" onClick={onEdit} style={{ fontSize: "0.8rem" }}>Edit</Button>
          )}
        </div>
        <h4 style={{ margin: "0 0 var(--space-2)", fontSize: "0.85rem", color: "var(--color-text-subtle)" }}>
          Permanent {verification.aadhaar_verified && <SourceBadge type="aadhaar" />}
        </h4>
        <div className="profile-summary__grid" style={{ marginBottom: "var(--space-4)" }}>
          {renderField("Line 1", permAddr.line1)}
          {renderField("Line 2", permAddr.line2)}
          {renderField("City", permAddr.city)}
          {renderField("District", permAddr.district)}
          {renderField("State", permAddr.state)}
          {renderField("Pincode", permAddr.pincode)}
        </div>
        <h4 style={{ margin: "0 0 var(--space-2)", fontSize: "0.85rem", color: "var(--color-text-subtle)" }}>
          Communication
        </h4>
        {commAddr.same_as_permanent ? (
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-subtle)" }}>Same as permanent address</p>
        ) : (
          <div className="profile-summary__grid">
            {renderField("Line 1", commAddr.line1)}
            {renderField("Line 2", commAddr.line2)}
            {renderField("City", commAddr.city)}
            {renderField("District", commAddr.district)}
            {renderField("State", commAddr.state)}
            {renderField("Pincode", commAddr.pincode)}
          </div>
        )}
      </div>
    </div>
  );
}
