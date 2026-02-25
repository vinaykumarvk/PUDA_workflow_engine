import { logWarn } from "../logger";

export interface PanVerifyResult {
  valid: boolean;
  registered_name?: string;
  name_match_score?: number; // 0-100
  error?: string;
}

export interface PanVerifyAdapter {
  readonly name: string;
  verify(pan: string, profileName?: string): Promise<PanVerifyResult>;
}

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// Simple name-similarity score: case-insensitive token overlap
function computeNameMatchScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokensA = a.toLowerCase().split(/\s+/).filter(Boolean);
  const tokensB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (tokensA.length === 0) return 0;
  let matches = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) matches++;
  }
  return Math.round((matches / Math.max(tokensA.length, tokensB.size)) * 100);
}

// Mock registered names derived from PAN prefix
const MOCK_PAN_NAMES: Record<string, string> = {
  ABCDE: "Rajesh Kumar",
  BCDEF: "Priya Sharma",
  CDEFG: "Amit Singh",
  DEFGH: "Sunita Devi",
  EFGHI: "Vikram Mehta",
  PUDAT: "Test User",
};

class StubPanVerifyAdapter implements PanVerifyAdapter {
  readonly name = "STUB_PAN_VERIFY";

  async verify(pan: string, profileName?: string): Promise<PanVerifyResult> {
    const upperPan = pan.toUpperCase();
    if (!PAN_REGEX.test(upperPan)) {
      return { valid: false, error: "Invalid PAN format. Must be AAAAA9999A." };
    }
    const prefix = upperPan.slice(0, 5);
    const registeredName = MOCK_PAN_NAMES[prefix] || "Registered User";
    const nameMatchScore = profileName ? computeNameMatchScore(profileName, registeredName) : undefined;
    return { valid: true, registered_name: registeredName, name_match_score: nameMatchScore };
  }
}

let cachedAdapter: PanVerifyAdapter | null = null;

export function resolvePanVerifyAdapter(): PanVerifyAdapter {
  if (cachedAdapter) return cachedAdapter;

  const configuredProvider = (process.env.PAN_VERIFY_PROVIDER || "stub").trim().toLowerCase();
  switch (configuredProvider) {
    case "stub":
      cachedAdapter = new StubPanVerifyAdapter();
      break;
    default:
      logWarn("Unknown PAN_VERIFY_PROVIDER configured, using stub adapter", {
        provider: configuredProvider,
      });
      cachedAdapter = new StubPanVerifyAdapter();
      break;
  }
  return cachedAdapter;
}
