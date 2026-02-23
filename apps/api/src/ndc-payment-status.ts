import { query } from "./db";
import { getPropertyByUPN, getPropertyForApplication, type PropertyRow } from "./properties";

type DueKind = "INSTALLMENT" | "DELAYED_COMPLETION_FEE" | "ADDITIONAL_AREA";
type DueStatus = "PAID" | "PENDING" | "PARTIALLY_PAID";

type SeedPayment = {
  dueCode: string;
  paymentDate: string;
  amount: number;
};

export interface NdcPaymentPostingResult {
  paymentPosted: {
    propertyId: string;
    propertyUpn: string | null;
    dueCode: string;
    label: string;
    amount: number;
    paymentDate: string;
  };
  paymentStatus: NdcPaymentStatus;
}

type NdcDuesSeed = {
  propertyValue?: number;
  annualInterestRatePct?: number;
  dcfRatePct?: number;
  additionalAreaSqyd?: number;
  additionalAreaRatePerSqyd?: number;
  constructionCompletedAt?: string | null;
  installmentAmounts?: number[];
  payments?: SeedPayment[];
};

export interface NdcDueLine {
  dueCode: string;
  label: string;
  dueKind: DueKind;
  dueDate: string;
  baseAmount: number;
  interestAmount: number;
  totalDueAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: DueStatus;
  paymentDate: string | null;
  daysDelayed: number;
}

export interface NdcPaymentStatus {
  propertyId: string;
  propertyUpn: string | null;
  authorityId: string;
  allotmentDate: string | null;
  propertyValue: number;
  annualInterestRatePct: number;
  dcfRatePct: number;
  dues: NdcDueLine[];
  totals: {
    baseAmount: number;
    interestAmount: number;
    totalDueAmount: number;
    paidAmount: number;
    balanceAmount: number;
  };
  allDuesPaid: boolean;
  certificateEligible: boolean;
  generatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseDateOnly(input?: string | null): Date | null {
  if (!input) return null;
  const date = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonths(base: Date, months: number): Date {
  const copy = new Date(base.getTime());
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

function addYears(base: Date, years: number): Date {
  const copy = new Date(base.getTime());
  copy.setUTCFullYear(copy.getUTCFullYear() + years);
  return copy;
}

function daysBetween(start: Date, end: Date): number {
  const utcStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const utcEnd = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(0, Math.floor((utcEnd - utcStart) / 86_400_000));
}

function pickSeed(property: PropertyRow): NdcDuesSeed {
  const planning = isRecord(property.planning_controls_jsonb)
    ? property.planning_controls_jsonb
    : {};
  const seedRaw = isRecord(planning.ndc_dues_seed) ? planning.ndc_dues_seed : {};
  const paymentsRaw = Array.isArray(seedRaw.payments) ? seedRaw.payments : [];
  const payments: SeedPayment[] = paymentsRaw
    .filter((item): item is SeedPayment => {
      if (!isRecord(item)) return false;
      return (
        typeof item.dueCode === "string" &&
        typeof item.paymentDate === "string" &&
        typeof item.amount === "number" &&
        Number.isFinite(item.amount)
      );
    })
    .map((item) => ({
      dueCode: item.dueCode.trim().toUpperCase(),
      paymentDate: item.paymentDate,
      amount: round2(Number(item.amount)),
    }));

  const installmentAmounts =
    Array.isArray(seedRaw.installmentAmounts) &&
    seedRaw.installmentAmounts.every((value) => typeof value === "number" && value >= 0)
      ? seedRaw.installmentAmounts.map((value) => Number(value))
      : undefined;

  return {
    propertyValue:
      typeof seedRaw.propertyValue === "number" && seedRaw.propertyValue > 0
        ? Number(seedRaw.propertyValue)
        : undefined,
    annualInterestRatePct:
      typeof seedRaw.annualInterestRatePct === "number" && seedRaw.annualInterestRatePct >= 0
        ? Number(seedRaw.annualInterestRatePct)
        : undefined,
    dcfRatePct:
      typeof seedRaw.dcfRatePct === "number" && seedRaw.dcfRatePct >= 0
        ? Number(seedRaw.dcfRatePct)
        : undefined,
    additionalAreaSqyd:
      typeof seedRaw.additionalAreaSqyd === "number" && seedRaw.additionalAreaSqyd > 0
        ? Number(seedRaw.additionalAreaSqyd)
        : undefined,
    additionalAreaRatePerSqyd:
      typeof seedRaw.additionalAreaRatePerSqyd === "number" && seedRaw.additionalAreaRatePerSqyd > 0
        ? Number(seedRaw.additionalAreaRatePerSqyd)
        : undefined,
    constructionCompletedAt:
      typeof seedRaw.constructionCompletedAt === "string" || seedRaw.constructionCompletedAt === null
        ? seedRaw.constructionCompletedAt
        : undefined,
    installmentAmounts,
    payments,
  };
}

function paymentMap(payments: SeedPayment[]): Map<string, SeedPayment> {
  const map = new Map<string, SeedPayment>();
  for (const payment of payments) {
    const parsedDate = parseDateOnly(payment.paymentDate);
    if (!parsedDate) continue;
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) continue;
    const code = payment.dueCode.trim().toUpperCase();
    if (!code) continue;
    const existing = map.get(code);
    if (!existing) {
      map.set(code, {
        dueCode: code,
        paymentDate: toDateOnly(parsedDate),
        amount: round2(payment.amount),
      });
      continue;
    }
    map.set(code, {
      dueCode: code,
      paymentDate: existing.paymentDate >= toDateOnly(parsedDate) ? existing.paymentDate : toDateOnly(parsedDate),
      amount: round2(existing.amount + payment.amount),
    });
  }
  return map;
}

function computeInterest(
  baseAmount: number,
  annualInterestRatePct: number,
  dueDate: Date,
  paymentDate: Date | null,
  asOf: Date
): { interestAmount: number; daysDelayed: number } {
  const interestStart = paymentDate ?? asOf;
  const delayedDays = daysBetween(dueDate, interestStart);
  if (delayedDays <= 0) {
    return { interestAmount: 0, daysDelayed: 0 };
  }
  const yearlyRate = annualInterestRatePct / 100;
  const interestAmount = round2((baseAmount * yearlyRate * delayedDays) / 365);
  return { interestAmount, daysDelayed: delayedDays };
}

function buildDueLine(params: {
  dueCode: string;
  label: string;
  dueKind: DueKind;
  dueDate: Date;
  baseAmount: number;
  annualInterestRatePct: number;
  payment: SeedPayment | undefined;
  asOf: Date;
}): NdcDueLine {
  const paymentDate = parseDateOnly(params.payment?.paymentDate);
  const paidAmount = round2(params.payment?.amount ?? 0);
  const { interestAmount, daysDelayed } = computeInterest(
    params.baseAmount,
    params.annualInterestRatePct,
    params.dueDate,
    paymentDate,
    params.asOf
  );
  const totalDueAmount = round2(params.baseAmount + interestAmount);
  const balanceAmount = round2(Math.max(totalDueAmount - paidAmount, 0));
  const status: DueStatus =
    balanceAmount <= 0.01 ? "PAID" : paidAmount > 0 ? "PARTIALLY_PAID" : "PENDING";

  return {
    dueCode: params.dueCode,
    label: params.label,
    dueKind: params.dueKind,
    dueDate: toDateOnly(params.dueDate),
    baseAmount: round2(params.baseAmount),
    interestAmount,
    totalDueAmount,
    paidAmount,
    balanceAmount,
    status,
    paymentDate: paymentDate ? toDateOnly(paymentDate) : null,
    daysDelayed,
  };
}

export function buildNdcPaymentStatusFromProperty(
  property: PropertyRow,
  asOfDate = new Date()
): NdcPaymentStatus {
  const seed = pickSeed(property);
  const allotmentDate = parseDateOnly(property.allotment_date) ?? new Date("2018-01-01T00:00:00.000Z");
  const annualInterestRatePct = seed.annualInterestRatePct ?? 12;
  const dcfRatePct = seed.dcfRatePct ?? 2.5;
  const propertyValue =
    seed.propertyValue ??
    round2((property.area_sqyd ?? 150) * (property.usage_type === "COMMERCIAL" ? 22000 : 14000));

  const installmentAmounts =
    seed.installmentAmounts && seed.installmentAmounts.length >= 6
      ? seed.installmentAmounts.slice(0, 6)
      : Array.from({ length: 6 }, () => round2(propertyValue * 0.1));

  const payments = paymentMap(seed.payments ?? []);
  const dues: NdcDueLine[] = [];

  for (let index = 0; index < 6; index++) {
    const dueCode = `INSTALLMENT_${index + 1}`;
    const dueDate = addMonths(allotmentDate, (index + 1) * 6);
    dues.push(
      buildDueLine({
        dueCode,
        label: `Installment ${index + 1}`,
        dueKind: "INSTALLMENT",
        dueDate,
        baseAmount: installmentAmounts[index] ?? round2(propertyValue * 0.1),
        annualInterestRatePct,
        payment: payments.get(dueCode),
        asOf: asOfDate,
      })
    );
  }

  const additionalAreaSqyd = seed.additionalAreaSqyd ?? 0;
  const additionalAreaRatePerSqyd = seed.additionalAreaRatePerSqyd ?? 1800;
  if (additionalAreaSqyd > 0) {
    const dueCode = "ADDITIONAL_AREA";
    dues.push(
      buildDueLine({
        dueCode,
        label: "Payment for Additional Area",
        dueKind: "ADDITIONAL_AREA",
        dueDate: addMonths(allotmentDate, 24),
        baseAmount: round2(additionalAreaSqyd * additionalAreaRatePerSqyd),
        annualInterestRatePct,
        payment: payments.get(dueCode),
        asOf: asOfDate,
      })
    );
  }

  const constructionCompletedAt = parseDateOnly(seed.constructionCompletedAt ?? null);
  const completionDeadline = addYears(allotmentDate, 3);
  const delayedCompletion =
    !constructionCompletedAt || constructionCompletedAt.getTime() > completionDeadline.getTime();
  if (delayedCompletion) {
    const dueCode = "DELAYED_COMPLETION_FEE";
    dues.push(
      buildDueLine({
        dueCode,
        label: "Delayed Completion Fee (DCF)",
        dueKind: "DELAYED_COMPLETION_FEE",
        dueDate: completionDeadline,
        baseAmount: round2((propertyValue * dcfRatePct) / 100),
        annualInterestRatePct,
        payment: payments.get(dueCode),
        asOf: asOfDate,
      })
    );
  }

  dues.sort((left, right) => {
    if (left.dueDate === right.dueDate) return left.dueCode.localeCompare(right.dueCode);
    return left.dueDate.localeCompare(right.dueDate);
  });

  const totals = dues.reduce(
    (acc, due) => {
      acc.baseAmount += due.baseAmount;
      acc.interestAmount += due.interestAmount;
      acc.totalDueAmount += due.totalDueAmount;
      acc.paidAmount += due.paidAmount;
      acc.balanceAmount += due.balanceAmount;
      return acc;
    },
    {
      baseAmount: 0,
      interestAmount: 0,
      totalDueAmount: 0,
      paidAmount: 0,
      balanceAmount: 0,
    }
  );

  const roundedTotals = {
    baseAmount: round2(totals.baseAmount),
    interestAmount: round2(totals.interestAmount),
    totalDueAmount: round2(totals.totalDueAmount),
    paidAmount: round2(totals.paidAmount),
    balanceAmount: round2(totals.balanceAmount),
  };

  const allDuesPaid = roundedTotals.balanceAmount <= 0.01;

  return {
    propertyId: property.property_id,
    propertyUpn: property.unique_property_number,
    authorityId: property.authority_id,
    allotmentDate: property.allotment_date,
    propertyValue: round2(propertyValue),
    annualInterestRatePct,
    dcfRatePct,
    dues,
    totals: roundedTotals,
    allDuesPaid,
    certificateEligible: allDuesPaid,
    generatedAt: new Date().toISOString(),
  };
}

export async function getNdcPaymentStatusForApplication(
  arn: string
): Promise<NdcPaymentStatus | null> {
  const property = await resolvePropertyForApplication(arn);
  if (!property) return null;
  return buildNdcPaymentStatusFromProperty(property);
}

async function resolvePropertyForApplication(arn: string): Promise<PropertyRow | null> {
  let property = await getPropertyForApplication(arn);
  if (property) return property;

  const appResult = await query(
    "SELECT authority_id, data_jsonb->'property'->>'upn' AS upn FROM application WHERE arn = $1 LIMIT 1",
    [arn]
  );
  if (appResult.rows.length === 0) return null;
  const authorityId = appResult.rows[0].authority_id as string;
  const upn = appResult.rows[0].upn as string | null;
  if (!upn) return null;
  property = await getPropertyByUPN(authorityId, upn);
  return property;
}

function validatePaymentDate(input?: string): Date {
  if (!input) return new Date();
  const parsed = parseDateOnly(input);
  if (!parsed) throw new Error("INVALID_PAYMENT_DATE");
  return parsed;
}

function upsertSeedPayment(
  property: PropertyRow,
  payment: SeedPayment
): Record<string, unknown> {
  const planning = isRecord(property.planning_controls_jsonb)
    ? { ...property.planning_controls_jsonb }
    : {};
  const seedRaw = isRecord(planning.ndc_dues_seed) ? { ...planning.ndc_dues_seed } : {};
  const existingPayments = pickSeed(property).payments ?? [];
  const nextPayments = [...existingPayments, payment];
  planning.ndc_dues_seed = {
    ...seedRaw,
    payments: nextPayments,
  };
  return planning;
}

export async function postNdcPaymentForProperty(
  property: PropertyRow,
  input: { dueCode: string; paymentDate?: string }
): Promise<NdcPaymentPostingResult> {
  const dueCode = String(input.dueCode || "").trim().toUpperCase();
  if (!dueCode) throw new Error("DUE_CODE_REQUIRED");

  const paymentDate = validatePaymentDate(input.paymentDate);
  const paymentDateOnly = toDateOnly(paymentDate);

  // Calculate settlement amount at posting date.
  const ledgerAtPaymentDate = buildNdcPaymentStatusFromProperty(property, paymentDate);
  const due = ledgerAtPaymentDate.dues.find((line) => line.dueCode === dueCode);
  if (!due) throw new Error("DUE_NOT_FOUND");
  const dueDate = parseDateOnly(due.dueDate);
  if (!dueDate) throw new Error("DUE_NOT_FOUND");
  const delayedDays = daysBetween(dueDate, paymentDate);
  const yearlyRate = ledgerAtPaymentDate.annualInterestRatePct / 100;
  const interestAtPaymentDate = round2((due.baseAmount * yearlyRate * delayedDays) / 365);
  const totalDueAtPaymentDate = round2(due.baseAmount + interestAtPaymentDate);
  const existingPaidTotal = round2(
    (pickSeed(property).payments || [])
      .filter((payment) => payment.dueCode === dueCode)
      .reduce((sum, payment) => sum + payment.amount, 0)
  );
  const amount = round2(Math.max(totalDueAtPaymentDate - existingPaidTotal, 0));
  if (amount <= 0.01) throw new Error("DUE_ALREADY_PAID");
  const updatedPlanning = upsertSeedPayment(property, {
    dueCode,
    paymentDate: paymentDateOnly,
    amount,
  });

  await query(
    `UPDATE property
     SET planning_controls_jsonb = $2::jsonb,
         updated_at = NOW()
     WHERE property_id = $1`,
    [property.property_id, JSON.stringify(updatedPlanning)]
  );

  const refreshed = {
    ...property,
    planning_controls_jsonb: updatedPlanning,
  } as PropertyRow;
  const paymentStatus = buildNdcPaymentStatusFromProperty(refreshed);

  return {
    paymentPosted: {
      propertyId: property.property_id,
      propertyUpn: property.unique_property_number,
      dueCode,
      label: due.label,
      amount,
      paymentDate: paymentDateOnly,
    },
    paymentStatus,
  };
}

export async function postNdcPaymentForApplication(
  arn: string,
  input: { dueCode: string; paymentDate?: string }
): Promise<NdcPaymentPostingResult> {
  const property = await resolvePropertyForApplication(arn);
  if (!property) throw new Error("PROPERTY_NOT_FOUND");
  return postNdcPaymentForProperty(property, input);
}

export async function postNdcPaymentByUpn(
  authorityId: string,
  upn: string,
  input: { dueCode: string; paymentDate?: string }
): Promise<NdcPaymentPostingResult> {
  const property = await getPropertyByUPN(authorityId, upn);
  if (!property) throw new Error("PROPERTY_NOT_FOUND");
  return postNdcPaymentForProperty(property, input);
}
