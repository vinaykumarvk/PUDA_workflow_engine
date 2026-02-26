import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./AuthContext";
import { Alert, Button, Card, Field, Input, Select, validateEmail, validateMobile, validatePincode, validateName, validateAadhaar, validatePan, PUNJAB_DISTRICTS, INDIAN_STATES } from "@puda/shared";
import { Bilingual } from "./Bilingual";
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
  const { t } = useTranslation();
  const labels = { aadhaar: t("profile.badge_aadhaar"), pan: t("profile.badge_pan"), self: t("profile.badge_self") };
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

  // Field-level validation errors (keyed by field name)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const hdrs = useCallback(
    () => ({ ...authHeaders(), "Content-Type": "application/json" }),
    [authHeaders]
  );

  // Blur-level field validation helper
  const onFieldBlur = useCallback((fieldName: string, value: string, validator: (v: string) => string | null) => {
    const err = validator(value);
    setFieldErrors((prev) => {
      if (err) return { ...prev, [fieldName]: err };
      const { [fieldName]: _, ...rest } = prev;
      return rest;
    });
  }, []);

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

    // Run validators at submit time (not just on blur)
    const submitErrors: Record<string, string> = {};
    const emailErr = validateEmail(manualFields.email);
    if (emailErr) submitErrors.email = emailErr;
    const mobileErr = validateMobile(manualFields.mobile);
    if (mobileErr) submitErrors.mobile = mobileErr;
    const fatherErr = validateName(manualFields.father_name);
    if (fatherErr) submitErrors.father_name = fatherErr;
    if (permanentAddr.pincode) {
      const pinErr = validatePincode(permanentAddr.pincode);
      if (pinErr) submitErrors.perm_pincode = pinErr;
    }
    if (!sameAsPermanent && commAddr.pincode) {
      const commPinErr = validatePincode(commAddr.pincode);
      if (commPinErr) submitErrors.comm_pincode = commPinErr;
    }
    if (Object.keys(submitErrors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...submitErrors }));
      return;
    }

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
            <Field label="Aadhaar Number" htmlFor="onb-aadhaar" required error={fieldErrors.aadhaar ? t(fieldErrors.aadhaar) : undefined}>
              <Input
                id="onb-aadhaar"
                value={aadhaarInput}
                onChange={(e) => setAadhaarInput(e.target.value.replace(/\D/g, "").slice(0, 12))}
                onBlur={() => onFieldBlur("aadhaar", aadhaarInput, validateAadhaar)}
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
          <Field label="PAN Number" htmlFor="onb-pan" required error={fieldErrors.pan ? t(fieldErrors.pan) : undefined}>
            <Input
              id="onb-pan"
              value={panInput}
              onChange={(e) => setPanInput(e.target.value.toUpperCase().slice(0, 10))}
              onBlur={() => onFieldBlur("pan", panInput, validatePan)}
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
        <Field label="Father's Name" htmlFor="onb-father" required error={fieldErrors.father_name ? t(fieldErrors.father_name) : undefined}>
          <Input
            id="onb-father"
            value={manualFields.father_name}
            onChange={(e) => setManualFields((p) => ({ ...p, father_name: e.target.value }))}
            onBlur={() => onFieldBlur("father_name", manualFields.father_name, validateName)}
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
        <Field label="Email" htmlFor="onb-email" required error={fieldErrors.email ? t(fieldErrors.email) : undefined}>
          <Input
            id="onb-email"
            type="email"
            value={manualFields.email}
            onChange={(e) => setManualFields((p) => ({ ...p, email: e.target.value }))}
            onBlur={() => onFieldBlur("email", manualFields.email, validateEmail)}
            placeholder="your@email.com"
          />
        </Field>
        <Field label="Mobile Number" htmlFor="onb-mobile" required error={fieldErrors.mobile ? t(fieldErrors.mobile) : undefined}>
          <div className="phone-input-row">
            <span className="phone-prefix" aria-hidden="true">+91</span>
            <Input
              id="onb-mobile"
              value={manualFields.mobile}
              onChange={(e) => setManualFields((p) => ({ ...p, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
              onBlur={() => onFieldBlur("mobile", manualFields.mobile, validateMobile)}
              placeholder="10-digit mobile"
              inputMode="numeric"
              maxLength={10}
            />
          </div>
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
            {aadhaarLocked ? (
              <Input
                id="onb-perm-district"
                value={permanentAddr.district || ""}
                readOnly
              />
            ) : (
              <Select
                id="onb-perm-district"
                value={permanentAddr.district || ""}
                onChange={(e) => setPermanentAddr((p) => ({ ...p, district: e.target.value }))}
              >
                <option value="">Select...</option>
                {PUNJAB_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            )}
          </Field>
          <Field label="State" htmlFor="onb-perm-state" required>
            {aadhaarLocked ? (
              <Input
                id="onb-perm-state"
                value={permanentAddr.state || ""}
                readOnly
              />
            ) : (
              <Select
                id="onb-perm-state"
                value={permanentAddr.state || "Punjab"}
                onChange={(e) => setPermanentAddr((p) => ({ ...p, state: e.target.value }))}
              >
                <option value="">Select...</option>
                {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Pincode" htmlFor="onb-perm-pin" required error={fieldErrors.perm_pincode ? t(fieldErrors.perm_pincode) : undefined}>
            <Input
              id="onb-perm-pin"
              value={permanentAddr.pincode || ""}
              onChange={(e) => setPermanentAddr((p) => ({ ...p, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
              onBlur={() => onFieldBlur("perm_pincode", permanentAddr.pincode || "", validatePincode)}
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
              <Select
                id="onb-comm-district"
                value={commAddr.district || ""}
                onChange={(e) => setCommAddr((p) => ({ ...p, district: e.target.value }))}
              >
                <option value="">Select...</option>
                {PUNJAB_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>
            <Field label="State" htmlFor="onb-comm-state" required>
              <Select
                id="onb-comm-state"
                value={commAddr.state || "Punjab"}
                onChange={(e) => setCommAddr((p) => ({ ...p, state: e.target.value }))}
              >
                <option value="">Select...</option>
                {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Pincode" htmlFor="onb-comm-pin" required error={fieldErrors.comm_pincode ? t(fieldErrors.comm_pincode) : undefined}>
              <Input
                id="onb-comm-pin"
                value={commAddr.pincode || ""}
                onChange={(e) => setCommAddr((p) => ({ ...p, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                onBlur={() => onFieldBlur("comm_pincode", commAddr.pincode || "", validatePincode)}
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
  onUpdate,
  onReVerifyAadhaar,
  onReVerifyPan,
}: {
  applicant: Record<string, any>;
  addresses: Record<string, any>;
  verification: VerificationData;
  completeness?: Completeness;
  onUpdate: (section: string) => void;
  onReVerifyAadhaar: () => void;
  onReVerifyPan: () => void;
}) {
  const { t } = useTranslation();

  const pct = completeness?.completionPercent ?? 0;
  const sections = completeness?.sections;
  const permAddr = addresses?.permanent || {};
  const commAddr = addresses?.communication || {};

  // Initials for avatar
  const initials = [applicant.first_name, applicant.last_name]
    .filter(Boolean)
    .map((n: string) => n[0]?.toUpperCase())
    .join("") || "?";

  // Progress ring geometry
  const RING_R = 41;
  const RING_C = 2 * Math.PI * RING_R;
  const ringOffset = RING_C - (pct / 100) * RING_C;
  const ringColor = pct >= 100 ? "var(--color-success)" : "var(--color-brand)";

  // Source badge helper
  const fieldBadge = (field: string): "aadhaar" | "pan" | "self" => {
    if (verification.aadhaar_verified && ["full_name", "date_of_birth", "gender", "aadhaar"].includes(field)) return "aadhaar";
    if (verification.pan_verified && field === "pan") return "pan";
    return "self";
  };

  // Section completion metadata
  const sectionMeta: Array<{ id: string; tKey: string; icon: string; complete: boolean; missing: number }> = [
    { id: "identity", tKey: "profile.section_identity", icon: "\uD83C\uDD94", complete: sections?.identity?.complete ?? false, missing: sections?.identity?.fields?.length ?? 0 },
    { id: "personal", tKey: "profile.section_personal", icon: "\uD83D\uDC64", complete: sections?.personal?.complete ?? false, missing: sections?.personal?.fields?.length ?? 0 },
    { id: "contact", tKey: "profile.section_contact", icon: "\uD83D\uDCDE", complete: sections?.contact?.complete ?? false, missing: sections?.contact?.fields?.length ?? 0 },
    { id: "address", tKey: "profile.section_address", icon: "\uD83C\uDFE0", complete: sections?.address?.complete ?? false, missing: sections?.address?.fields?.length ?? 0 },
  ];

  // View field renderer
  const viewField = (labelKey: string, value: any, field?: string) => {
    const isMissing = !value;
    return (
      <div className={`profile-field ${isMissing ? "profile-field--missing" : ""}`}>
        <div className="profile-field__label"><Bilingual tKey={labelKey} /></div>
        <div className="profile-field__value">
          {value || <span className="profile-field__empty">{t("profile.not_provided")}</span>}
          {field && value && <SourceBadge type={fieldBadge(field)} />}
        </div>
      </div>
    );
  };

  return (
    <div className="profile-page">
      {/* Hero: Progress Ring + Info */}
      <Card className="profile-hero">
        <div className="profile-hero__ring-wrap">
          <svg className="profile-hero__ring" viewBox="0 0 88 88" aria-hidden="true">
            <circle className="profile-hero__ring-bg" cx="44" cy="44" r={RING_R} />
            <circle
              className="profile-hero__ring-fill"
              cx="44" cy="44" r={RING_R}
              style={{ strokeDasharray: RING_C, strokeDashoffset: ringOffset, stroke: ringColor }}
            />
          </svg>
          <span className="profile-hero__initials" aria-hidden="true">{initials}</span>
        </div>
        <div className="profile-hero__info">
          <h2 className="profile-hero__name">
            {applicant.full_name || applicant.first_name || t("profile.full_name")}
          </h2>
          <div className="profile-hero__pct">
            {t("profile.completion_percent", { percent: Math.round(pct) })}
          </div>
          {(applicant.email || applicant.mobile) && (
            <div className="profile-hero__contact">
              {applicant.email && <span>{applicant.email}</span>}
              {applicant.mobile && <span>{applicant.mobile}</span>}
            </div>
          )}
          <div className="profile-hero__badges">
            {verification.aadhaar_verified && <SourceBadge type="aadhaar" />}
            {verification.pan_verified && <SourceBadge type="pan" />}
          </div>
        </div>
      </Card>

      {/* Section Completion Tiles */}
      <div className="profile-tiles">
        {sectionMeta.map((sec) => (
          <a
            key={sec.id}
            href={`#profile-${sec.id}`}
            className={`profile-tile-nav ${sec.complete ? "profile-tile-nav--done" : "profile-tile-nav--pending"}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`profile-${sec.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <span className="profile-tile-nav__icon" aria-hidden="true">
              {sec.complete ? "\u2713" : sec.icon}
            </span>
            <span className="profile-tile-nav__label">{t(sec.tKey)}</span>
            <span className={`profile-tile-nav__status ${sec.complete ? "profile-tile-nav__status--done" : "profile-tile-nav__status--pending"}`}>
              {sec.complete ? t("profile.section_complete") : t("profile.fields_missing", { count: sec.missing })}
            </span>
          </a>
        ))}
      </div>

      {/* Identity Section */}
      <Card className="profile-section-card" id="profile-identity">
        <div className="profile-section-card__header">
          <h3 className="profile-section-card__title"><Bilingual tKey="profile.section_identity" /></h3>
          <div className="profile-section-card__header-actions">
            <Button variant="ghost" size="sm" onClick={onReVerifyAadhaar}>
              {verification.aadhaar_verified ? t("profile.reverify_aadhaar") : t("profile.verify_aadhaar")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onReVerifyPan}>
              {verification.pan_verified ? t("profile.reverify_pan") : t("profile.verify_pan")}
            </Button>
          </div>
        </div>
        <div className="profile-section-card__body">
          {viewField("profile.aadhaar", applicant.aadhaar ? `XXXX XXXX ${applicant.aadhaar.slice(-4)}` : null, "aadhaar")}
          {viewField("profile.pan", applicant.pan, "pan")}
        </div>
      </Card>

      {/* Personal Details Section */}
      <Card className="profile-section-card" id="profile-personal">
        <div className="profile-section-card__header">
          <h3 className="profile-section-card__title"><Bilingual tKey="profile.section_personal" /></h3>
          <Button variant="ghost" size="sm" onClick={() => onUpdate("personal")}>
            {t("profile.update_section")}
          </Button>
        </div>
        <div className="profile-section-card__body">
          {viewField("profile.full_name", applicant.full_name, "full_name")}
          {viewField("profile.dob", applicant.date_of_birth, "date_of_birth")}
          {viewField("profile.gender", applicant.gender, "gender")}
          {viewField("profile.father_name", applicant.father_name, "father_name")}
          {viewField("profile.marital_status", applicant.marital_status, "marital_status")}
          {viewField("profile.salutation", applicant.salutation)}
        </div>
      </Card>

      {/* Contact Section */}
      <Card className="profile-section-card" id="profile-contact">
        <div className="profile-section-card__header">
          <h3 className="profile-section-card__title"><Bilingual tKey="profile.section_contact" /></h3>
          <Button variant="ghost" size="sm" onClick={() => onUpdate("contact")}>
            {t("profile.update_section")}
          </Button>
        </div>
        <div className="profile-section-card__body">
          {viewField("profile.email", applicant.email)}
          {viewField("profile.mobile", applicant.mobile)}
        </div>
      </Card>

      {/* Address Section */}
      <Card className="profile-section-card" id="profile-address">
        <div className="profile-section-card__header">
          <h3 className="profile-section-card__title"><Bilingual tKey="profile.section_address" /></h3>
          <Button variant="ghost" size="sm" onClick={() => onUpdate("address")}>
            {t("profile.update_section")}
          </Button>
        </div>
        <h4 className="profile-section-card__subheading">
          <Bilingual tKey="profile.permanent_address" />
          {verification.aadhaar_verified && <SourceBadge type="aadhaar" />}
        </h4>
        <div className="profile-section-card__body">
          {viewField("profile.address_line1", permAddr.line1)}
          {viewField("profile.address_line2", permAddr.line2)}
          {viewField("profile.city", permAddr.city)}
          {viewField("profile.district", permAddr.district)}
          {viewField("profile.state", permAddr.state)}
          {viewField("profile.pincode", permAddr.pincode)}
        </div>
        <h4 className="profile-section-card__subheading"><Bilingual tKey="profile.communication_address" /></h4>
        {commAddr.same_as_permanent ? (
          <p className="profile-section-card__note">{t("profile.same_as_permanent")}</p>
        ) : (
          <div className="profile-section-card__body">
            {viewField("profile.address_line1", commAddr.line1)}
            {viewField("profile.address_line2", commAddr.line2)}
            {viewField("profile.city", commAddr.city)}
            {viewField("profile.district", commAddr.district)}
            {viewField("profile.state", commAddr.state)}
            {viewField("profile.pincode", commAddr.pincode)}
          </div>
        )}
      </Card>
    </div>
  );
}
