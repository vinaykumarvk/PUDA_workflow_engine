import { logWarn } from "../logger";

export interface AadhaarEkycSendOtpResult {
  success: boolean;
  message: string;
  txnId: string;
}

export interface AadhaarDemographics {
  full_name: string;
  date_of_birth: string; // YYYY-MM-DD
  gender: "MALE" | "FEMALE" | "OTHER";
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    district: string;
    pincode: string;
  };
  photo_base64?: string;
}

export interface AadhaarEkycVerifyResult {
  verified: boolean;
  demographics?: AadhaarDemographics;
  error?: string;
}

export interface AadhaarEkycAdapter {
  readonly name: string;
  sendOtp(aadhaar: string): Promise<AadhaarEkycSendOtpResult>;
  verifyOtpAndFetchDemographics(
    aadhaar: string,
    otp: string,
    txnId: string
  ): Promise<AadhaarEkycVerifyResult>;
}

// Pool of 5 mock profiles for the stub adapter
const MOCK_PROFILES: AadhaarDemographics[] = [
  {
    full_name: "Rajesh Kumar",
    date_of_birth: "1985-02-10",
    gender: "MALE",
    address: { line1: "H.No. 2301, Sector 20", city: "Mohali", state: "Punjab", district: "SAS Nagar", pincode: "160020" },
  },
  {
    full_name: "Priya Sharma",
    date_of_birth: "1990-07-21",
    gender: "FEMALE",
    address: { line1: "H.No. 1147, Sarabha Nagar", city: "Ludhiana", state: "Punjab", district: "Ludhiana", pincode: "141001" },
  },
  {
    full_name: "Amit Singh",
    date_of_birth: "1982-11-05",
    gender: "MALE",
    address: { line1: "H.No. 3278, Block C, Ranjit Avenue", city: "Amritsar", state: "Punjab", district: "Amritsar", pincode: "143001" },
  },
  {
    full_name: "Sunita Devi",
    date_of_birth: "1988-03-14",
    gender: "FEMALE",
    address: { line1: "H.No. 2156, Model Town Extension", city: "Jalandhar", state: "Punjab", district: "Jalandhar", pincode: "144003" },
  },
  {
    full_name: "Vikram Mehta",
    date_of_birth: "1992-09-30",
    gender: "MALE",
    address: { line1: "Flat No. 1089, Sector 4, Leela Bhawan", city: "Patiala", state: "Punjab", district: "Patiala", pincode: "147001" },
  },
];

class StubAadhaarEkycAdapter implements AadhaarEkycAdapter {
  readonly name = "STUB_AADHAAR_EKYC";

  async sendOtp(aadhaar: string): Promise<AadhaarEkycSendOtpResult> {
    if (!/^\d{12}$/.test(aadhaar)) {
      return { success: false, message: "Invalid Aadhaar number. Must be 12 digits.", txnId: "" };
    }
    const txnId = `stub_txn_${aadhaar.slice(-4)}_${Date.now()}`;
    return { success: true, message: "OTP sent successfully (stub)", txnId };
  }

  async verifyOtpAndFetchDemographics(
    aadhaar: string,
    otp: string,
    txnId: string
  ): Promise<AadhaarEkycVerifyResult> {
    if (!txnId) {
      return { verified: false, error: "Missing transaction ID" };
    }
    if (otp !== "123456") {
      return { verified: false, error: "Invalid OTP" };
    }
    // Deterministic profile selection based on last 4 digits
    const seed = parseInt(aadhaar.slice(-4), 10);
    const profileIndex = seed % MOCK_PROFILES.length;
    const demographics = { ...MOCK_PROFILES[profileIndex] };
    return { verified: true, demographics };
  }
}

let cachedAdapter: AadhaarEkycAdapter | null = null;

export function resolveAadhaarEkycAdapter(): AadhaarEkycAdapter {
  if (cachedAdapter) return cachedAdapter;

  const configuredProvider = (process.env.AADHAAR_EKYC_PROVIDER || "stub").trim().toLowerCase();
  switch (configuredProvider) {
    case "stub":
      cachedAdapter = new StubAadhaarEkycAdapter();
      break;
    default:
      logWarn("Unknown AADHAAR_EKYC_PROVIDER configured, using stub adapter", {
        provider: configuredProvider,
      });
      cachedAdapter = new StubAadhaarEkycAdapter();
      break;
  }
  return cachedAdapter;
}
