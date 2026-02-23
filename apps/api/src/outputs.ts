import { query } from "./db";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { getStorage } from "./storage";
import { getLatestDecision } from "./decisions";

export interface OutputRecord {
  output_id: string;
  arn: string;
  output_type: string;
  artifact_type: string | null;
  template_id: string;
  output_number: string;
  storage_key: string;
  decision_id: string | null;
  valid_from: Date | null;
  valid_to: Date | null;
  generated_at: Date;
  qr_verification_code: string | null;
  signature_certificate: string | null;
}

// L1: Output directory managed by StorageAdapter — no direct fs calls needed

const SERVICE_OUTPUT_PREFIX: Record<string, string> = {
  no_due_certificate: "NDC",
  registration_of_architect: "ARC",
  sanction_of_water_supply: "WSC",
  sanction_of_sewerage_connection: "SWC",
};

const SERVICE_DISPLAY_NAME: Record<string, string> = {
  no_due_certificate: "No Due Certificate",
  registration_of_architect: "Registration of Architect",
  sanction_of_water_supply: "Sanction of Water Supply Connection",
  sanction_of_sewerage_connection: "Sanction of Sewerage Connection",
};

async function getOutputNumber(serviceKey: string): Promise<string> {
  const year = new Date().getFullYear();
  const seqResult = await query("SELECT nextval('arn_seq') as seq");
  const seq = String(seqResult.rows[0].seq).padStart(6, "0");
  const prefix = SERVICE_OUTPUT_PREFIX[serviceKey] || "OUT";
  return `PUDA/${prefix}/${year}/${seq}`;
}

function fillTemplate(html: string, data: Record<string, string>): string {
  let out = html;
  for (const [key, value] of Object.entries(data)) {
    out = out.replace(new RegExp(`{{${key}}}`, "g"), value || "");
  }
  return out;
}

// B2: Generate professional A4 PDF with header, tables, QR code using PDFKit
async function renderProfessionalPdf(params: {
  authorityName: string;
  serviceName: string;
  outputNumber: string;
  issueDate: string;
  applicantName: string;
  arn: string;
  decision: string;
  propertyUpn: string;
  dataFields: Array<{ label: string; value: string }>;
  qrDataUrl: string;
  digitalSignature: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 100; // margin 50 each side

    // PUDA logo mark + header
    doc.save();
    doc.circle(76, 70, 22).lineWidth(1.5).strokeColor("#0B5FFF").stroke();
    doc.fillColor("#0B5FFF").font("Helvetica-Bold").fontSize(11).text("PUDA", 57, 64, {
      width: 38,
      align: "center",
    });
    doc.restore();

    doc.fontSize(16).font("Helvetica-Bold").fillColor("#0f1f33").text(params.authorityName.toUpperCase(), {
      align: "center",
    });
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").fillColor("#334155").text("Government of Punjab", { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).stroke("#333");
    doc.moveDown(0.5);

    // Title
    doc.fontSize(14).font("Helvetica-Bold").text(params.serviceName, { align: "center" });
    doc.moveDown(0.2);
    const titleLabel = params.decision === "APPROVED" ? "CERTIFICATE" : "ORDER OF REJECTION";
    doc.fontSize(12).font("Helvetica-Bold").text(titleLabel, { align: "center" });
    doc.moveDown(0.5);

    // Output number and date
    doc.fontSize(10).font("Helvetica").fillColor("#0f1f33");
    doc.text(`Output No: ${params.outputNumber}`, 50);
    doc.text(`Date: ${params.issueDate}`, 50 + pageWidth - 150, doc.y - 12, { width: 150, align: "right" });
    doc.moveDown(0.5);
    doc.text(`Application Reference: ${params.arn}`, 50);
    doc.moveDown(1);

    // Applicant & property summary
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f1f33").text("Applicant & Property Details", 50);
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).stroke("#ccc");
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica");

    for (const field of params.dataFields) {
      const labelWidth = 200;
      const y = doc.y;
      doc.font("Helvetica-Bold").fillColor("#1e293b").text(field.label + ":", 50, y, { width: labelWidth, continued: false });
      doc.font("Helvetica").fillColor("#0f172a").text(field.value || "—", 50 + labelWidth, y, { width: pageWidth - labelWidth });
      doc.moveDown(0.2);
    }

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).stroke("#ccc");
    doc.moveDown(0.5);

    // Decision paragraph
    doc.fontSize(11).font("Helvetica").fillColor("#111827");
    if (params.decision === "APPROVED") {
      doc.text(
        `This is to certify that the application (${params.arn}) submitted by ${params.applicantName} ` +
        `for ${params.serviceName} has been duly examined and is hereby APPROVED.`,
        50, doc.y, { width: pageWidth, align: "justify" }
      );
    } else {
      doc.text(
        `The application (${params.arn}) submitted by ${params.applicantName} ` +
        `for ${params.serviceName} has been examined and is hereby REJECTED. ` +
        `Please refer to the remarks noted on the application for reasons.`,
        50, doc.y, { width: pageWidth, align: "justify" }
      );
    }

    doc.moveDown(2);

    // Digital signature block
    const signatureBlockX = 50 + pageWidth - 240;
    doc.fontSize(10).font("Helvetica").fillColor("#0f172a").text("Digitally Signed", signatureBlockX, doc.y, {
      width: 240,
      align: "center",
    });
    doc.fontSize(8).font("Helvetica").fillColor("#334155").text("PUDA eGovernance Workflow Engine", signatureBlockX, doc.y + 2, {
      width: 240,
      align: "center",
    });
    doc.fontSize(8).font("Helvetica").fillColor("#334155").text(`Signature ID: ${params.digitalSignature}`, signatureBlockX, doc.y + 2, {
      width: 240,
      align: "center",
    });
    doc.fontSize(8).font("Helvetica").fillColor("#334155").text(`Signed On: ${params.issueDate}`, signatureBlockX, doc.y + 2, {
      width: 240,
      align: "center",
    });
    doc.moveDown(1.4);
    doc.moveTo(50 + pageWidth - 200, doc.y).lineTo(50 + pageWidth, doc.y).stroke("#333");
    doc.moveDown(0.3);
    doc.fontSize(8).font("Helvetica").fillColor("#334155").text("(Authorized Digital Signatory)", 50 + pageWidth - 200, doc.y, { width: 200, align: "center" });

    // QR code at bottom-left
    if (params.qrDataUrl) {
      try {
        doc.image(params.qrDataUrl, 50, doc.page.height - 140, { width: 80, height: 80 });
        doc.fontSize(7).fillColor("#334155").text("Scan for certificate details", 50, doc.page.height - 55, { width: 80, align: "center" });
      } catch {
        // QR code rendering failed, skip
      }
    }

    // Footer
    doc.fontSize(7).font("Helvetica").text(
      `This is a digitally generated certificate. Output No: ${params.outputNumber}`,
      50, doc.page.height - 40, { width: pageWidth, align: "center" }
    );

    doc.end();
  });
}

export async function generateOutput(
  arn: string,
  templateId: string,
  serviceKey: string
): Promise<OutputRecord> {
  const appResult = await query(
    "SELECT a.arn, a.public_arn, a.data_jsonb, a.disposal_type, a.authority_id, au.name as authority_name FROM application a LEFT JOIN authority au ON a.authority_id = au.authority_id WHERE a.arn = $1",
    [arn]
  );
  if (appResult.rows.length === 0) {
    throw new Error("APPLICATION_NOT_FOUND");
  }
  const app = appResult.rows[0];
  const data = app.data_jsonb || {};
  const applicantName = data.applicant?.full_name || data.applicant?.name || "—";
  const propertyUpn = data.property?.upn || "—";
  const authorityName = app.authority_name || app.authority_id;
  const displayArn = app.public_arn || arn;
  const decision = app.disposal_type || (templateId.includes("rejection") ? "REJECTED" : "APPROVED");

  const outputNumber = await getOutputNumber(serviceKey);
  const issuedAt = new Date().toISOString().slice(0, 10);
  const signaturePayload = [
    authorityName,
    displayArn,
    applicantName,
    propertyUpn,
    outputNumber,
    decision,
    issuedAt,
  ].join("|");
  const digitalSignature = createHash("sha256")
    .update(signaturePayload)
    .digest("hex")
    .slice(0, 20)
    .toUpperCase();

  // Generate QR code containing certificate details for field verification.
  const qrPayload = JSON.stringify({
    authority: authorityName,
    service: SERVICE_DISPLAY_NAME[serviceKey] || serviceKey,
    outputNumber,
    arn: displayArn,
    applicantName,
    propertyUpn,
    issueDate: issuedAt,
    status: decision,
    signature: digitalSignature,
  });
  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 120, margin: 1 });
  } catch {}

  // Build data fields for the PDF table
  const dataFields: Array<{ label: string; value: string }> = [
    { label: "Applicant Name", value: applicantName },
    { label: "Property UPN", value: propertyUpn },
  ];
  if (data.property?.plot_no) dataFields.push({ label: "Plot No.", value: data.property.plot_no });
  if (data.property?.area_sqyd) dataFields.push({ label: "Area (sq. yd.)", value: String(data.property.area_sqyd) });
  if (data.property?.scheme_name) dataFields.push({ label: "Scheme", value: data.property.scheme_name });
  if (data.coa?.certificate_number) dataFields.push({ label: "COA Certificate", value: data.coa.certificate_number });
  if (data.water?.purpose) dataFields.push({ label: "Water Purpose", value: data.water.purpose });
  if (data.plumber?.name) dataFields.push({ label: "Plumber", value: data.plumber.name });

  const pdfBuffer = await renderProfessionalPdf({
    authorityName,
    serviceName: SERVICE_DISPLAY_NAME[serviceKey] || serviceKey,
    outputNumber,
    issueDate: issuedAt,
    applicantName,
    arn: displayArn,
    decision,
    propertyUpn,
    dataFields,
    qrDataUrl,
    digitalSignature,
  });

  // L1: Use StorageAdapter instead of direct fs
  const safeArn = arn.replace(/\//g, "_");
  const filename = `${safeArn}_${templateId}.pdf`;
  const storageKey = `outputs/${safeArn}/${filename}`;
  const storage = getStorage();
  await storage.write(storageKey, pdfBuffer);

  // Look up the formal decision record (if one exists)
  let decisionId: string | null = null;
  try {
    const decisionRecord = await getLatestDecision(arn);
    if (decisionRecord) {
      decisionId = decisionRecord.decision_id;
    }
  } catch {
    // Decision record may not exist for older applications
  }

  // Determine artifact type and validity
  const artifactType = decision === "APPROVED" ? "CERTIFICATE" : "ORDER";
  const validFrom = new Date().toISOString().slice(0, 10);
  // Certificates are valid for 1 year by default (can be overridden per service)
  const VALIDITY_YEARS: Record<string, number> = {
    no_due_certificate: 1,
    registration_of_architect: 3,
    sanction_of_water_supply: 0,         // no expiry for connection sanction
    sanction_of_sewerage_connection: 0,  // no expiry for connection sanction
  };
  const validityYears = VALIDITY_YEARS[serviceKey] ?? 1;
  const validTo = validityYears > 0
    ? new Date(new Date().setFullYear(new Date().getFullYear() + validityYears)).toISOString().slice(0, 10)
    : null;

  const qrVerificationCode = outputNumber.replace(/\//g, "-");

  const outputId = uuidv4();
  await query(
    `INSERT INTO output
       (output_id, arn, output_type, artifact_type, template_id, output_number,
        storage_key, decision_id, valid_from, valid_to, qr_verification_code, signature_certificate, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
    [
      outputId, arn, artifactType, artifactType, templateId, outputNumber,
      storageKey, decisionId, validFrom, validTo, qrVerificationCode, digitalSignature,
    ]
  );

  await query(
    "INSERT INTO audit_event (event_id, arn, event_type, actor_type, payload_jsonb) VALUES ($1, $2, 'OUTPUT_GENERATED', 'SYSTEM', $3)",
    [uuidv4(), arn, JSON.stringify({ outputId, templateId, outputNumber, decisionId, artifactType })]
  );

  return (await getOutputByIdFull(outputId))!;
}

const OUTPUT_COLUMNS = `output_id, arn, output_type, artifact_type, template_id, output_number,
  storage_key, decision_id, valid_from, valid_to, qr_verification_code, signature_certificate, generated_at`;

function rowToOutput(row: any): OutputRecord {
  return {
    output_id: row.output_id,
    arn: row.arn,
    output_type: row.output_type,
    artifact_type: row.artifact_type,
    template_id: row.template_id,
    output_number: row.output_number,
    storage_key: row.storage_key,
    decision_id: row.decision_id,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    generated_at: row.generated_at,
    qr_verification_code: row.qr_verification_code,
    signature_certificate: row.signature_certificate,
  };
}

async function getOutputByIdFull(outputId: string): Promise<OutputRecord | null> {
  const result = await query(
    `SELECT ${OUTPUT_COLUMNS} FROM output WHERE output_id = $1`,
    [outputId]
  );
  return result.rows.length > 0 ? rowToOutput(result.rows[0]) : null;
}

export async function getOutputByArn(arn: string): Promise<OutputRecord | null> {
  const result = await query(
    `SELECT ${OUTPUT_COLUMNS} FROM output WHERE arn = $1 ORDER BY generated_at DESC LIMIT 1`,
    [arn]
  );
  return result.rows.length > 0 ? rowToOutput(result.rows[0]) : null;
}

/** Get all outputs for an application. */
export async function getOutputsForApplication(arn: string): Promise<OutputRecord[]> {
  const result = await query(
    `SELECT ${OUTPUT_COLUMNS} FROM output WHERE arn = $1 ORDER BY generated_at DESC`,
    [arn]
  );
  return result.rows.map(rowToOutput);
}

export async function getOutputFile(outputId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const result = await query(
    "SELECT storage_key FROM output WHERE output_id = $1",
    [outputId]
  );
  if (result.rows.length === 0) return null;
  // L1: Use StorageAdapter
  const storage = getStorage();
  const buffer = await storage.read(result.rows[0].storage_key);
  if (!buffer) return null;
  return { buffer, mimeType: "application/pdf" };
}

export async function getOutputFileByArn(arn: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const out = await getOutputByArn(arn);
  if (!out) return null;
  return getOutputFile(out.output_id);
}
