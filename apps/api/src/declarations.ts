import { query } from "./db";
import { v4 as uuidv4 } from "uuid";
import PDFDocument from "pdfkit";
import { getStorage } from "./storage";
import {
  uploadCitizenDocument,
  reuseDocumentForApplication,
} from "./documents";

interface DeclarationField {
  source: string;
  label: string;
}

interface DeclarationTemplate {
  title: string;
  preamble: string;
  clauses: Array<{ number: number; text: string }>;
  fields: Record<string, DeclarationField>;
  confirmation: string;
}

/**
 * Resolve a dot-path like "applicant.full_name" against a data object.
 */
function resolveSource(data: any, path: string): string {
  const value = path.split(".").reduce((obj, key) => obj?.[key], data);
  return value != null ? String(value) : "";
}

/**
 * Replace all {{placeholder}} tokens in text with field values.
 */
function fillPlaceholders(
  text: string,
  filledFields: Record<string, string>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => filledFields[key] || "___");
}

/**
 * Generate an A4 PDF for the filled declaration using PDFKit.
 * Follows the same pattern as renderProfessionalPdf() in outputs.ts.
 */
async function renderDeclarationPdf(params: {
  title: string;
  preamble: string;
  clauses: Array<{ number: number; text: string }>;
  fields: Record<string, { label: string; value: string }>;
  confirmation: string;
  applicantName: string;
  arn: string;
  date: string;
  place: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 100; // 50px margin each side

    // ── PUDA Header ──
    doc.save();
    doc
      .circle(76, 70, 22)
      .lineWidth(1.5)
      .strokeColor("#0B5FFF")
      .stroke();
    doc
      .fillColor("#0B5FFF")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("PUDA", 57, 64, { width: 38, align: "center" });
    doc.restore();

    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .fillColor("#0f1f33")
      .text("PUNJAB URBAN DEVELOPMENT AUTHORITY", { align: "center" });
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#334155")
      .text("Government of Punjab", { align: "center" });
    doc.moveDown(0.5);
    doc
      .moveTo(50, doc.y)
      .lineTo(50 + pageWidth, doc.y)
      .stroke("#333");
    doc.moveDown(0.5);

    // ── Title ──
    doc
      .fontSize(13)
      .font("Helvetica-Bold")
      .fillColor("#0f1f33")
      .text(params.title.toUpperCase(), { align: "center" });
    doc.moveDown(0.8);

    // ── Field Summary Table ──
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#0f1f33")
      .text("Declaration Details", 50);
    doc.moveDown(0.3);
    doc
      .moveTo(50, doc.y)
      .lineTo(50 + pageWidth, doc.y)
      .stroke("#ccc");
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica");

    for (const [, field] of Object.entries(params.fields)) {
      const labelWidth = 200;
      const y = doc.y;
      doc
        .font("Helvetica-Bold")
        .fillColor("#1e293b")
        .text(field.label + ":", 50, y, { width: labelWidth });
      doc
        .font("Helvetica")
        .fillColor("#0f172a")
        .text(field.value || "—", 50 + labelWidth, y, {
          width: pageWidth - labelWidth,
        });
      doc.moveDown(0.2);
    }

    doc.moveDown(0.5);
    doc
      .moveTo(50, doc.y)
      .lineTo(50 + pageWidth, doc.y)
      .stroke("#ccc");
    doc.moveDown(0.8);

    // ── Preamble ──
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#111827")
      .text(params.preamble, 50, doc.y, {
        width: pageWidth,
        align: "justify",
      });
    doc.moveDown(0.8);

    // ── Clauses ──
    for (const clause of params.clauses) {
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#111827")
        .text(`${clause.number}.  ${clause.text}`, 50, doc.y, {
          width: pageWidth,
          align: "justify",
          indent: 20,
        });
      doc.moveDown(0.5);
    }

    doc.moveDown(0.5);

    // ── Confirmation ──
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#0f1f33")
      .text("Confirmation:", 50);
    doc.moveDown(0.2);
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#111827")
      .text(params.confirmation, 50, doc.y, {
        width: pageWidth,
        align: "justify",
      });
    doc.moveDown(1.5);

    // ── Date, Place, Signature ──
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#0f172a")
      .text(`Place: ${params.place}`, 50);
    doc.text(`Date: ${params.date}`, 50);
    doc.moveDown(2);

    // Signature placeholder
    const sigBlockX = 50 + pageWidth - 240;
    doc
      .moveTo(sigBlockX, doc.y)
      .lineTo(sigBlockX + 200, doc.y)
      .stroke("#333");
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#334155")
      .text("Signature of Applicant", sigBlockX, doc.y, {
        width: 200,
        align: "center",
      });
    doc
      .fontSize(8)
      .text("(e-sign coming soon)", sigBlockX, doc.y + 2, {
        width: 200,
        align: "center",
      });
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#0f172a")
      .text(params.applicantName, sigBlockX, doc.y, {
        width: 200,
        align: "center",
      });

    // ── Footer ──
    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor("#64748b")
      .text(
        `Generated via PUDA eGovernance Portal | Application: ${params.arn} | ${params.date}`,
        50,
        doc.page.height - 40,
        { width: pageWidth, align: "center" }
      );

    doc.end();
  });
}

/**
 * Submit a filled declaration form.
 *
 * 1. Validate template exists in service config
 * 2. Merge filledFields into template
 * 3. Generate PDF
 * 4. Upload to citizen document locker with origin='declaration'
 * 5. Link to application
 */
export async function submitDeclaration(
  arn: string,
  docTypeId: string,
  filledFields: Record<string, string>,
  userId: string
): Promise<{ citizenDocId: string; appDocId: string }> {
  // 1. Load application and service config
  const appResult = await query(
    `SELECT a.arn, a.public_arn, a.data_jsonb, a.state_id, a.service_key, a.service_version, a.applicant_user_id
     FROM application a WHERE a.arn = $1`,
    [arn]
  );
  if (appResult.rows.length === 0) throw new Error("APPLICATION_NOT_FOUND");
  const app = appResult.rows[0];

  // Validate state
  if (app.state_id !== "DRAFT" && app.state_id !== "QUERY_PENDING") {
    throw new Error("INVALID_APPLICATION_STATE");
  }

  // Validate ownership
  if (app.applicant_user_id !== userId) {
    throw new Error("FORBIDDEN");
  }

  // 2. Load service config to get declaration template
  const configResult = await query(
    "SELECT config_jsonb FROM service_version WHERE service_key = $1 AND version = $2",
    [app.service_key, app.service_version]
  );
  if (configResult.rows.length === 0) throw new Error("SERVICE_CONFIG_NOT_FOUND");

  const config = configResult.rows[0].config_jsonb;
  const docTypes: any[] = config?.documents?.documentTypes || [];
  const docType = docTypes.find((dt: any) => dt.docTypeId === docTypeId);
  if (!docType?.declarationTemplate) {
    throw new Error("DECLARATION_TEMPLATE_NOT_FOUND");
  }

  const template: DeclarationTemplate = docType.declarationTemplate;

  // 3. Validate filledFields keys match template
  const templateFieldKeys = new Set(Object.keys(template.fields));
  for (const key of Object.keys(filledFields)) {
    if (!templateFieldKeys.has(key)) {
      throw new Error(`UNKNOWN_FIELD: ${key}`);
    }
  }

  // Merge: start from pre-filled (application data), override with citizen edits
  const appData = app.data_jsonb || {};
  const mergedFields: Record<string, string> = {};
  for (const [key, fieldDef] of Object.entries(template.fields)) {
    mergedFields[key] =
      filledFields[key] !== undefined
        ? filledFields[key]
        : resolveSource(appData, fieldDef.source);
  }

  // 4. Fill template text with merged values
  const filledPreamble = fillPlaceholders(template.preamble, mergedFields);
  const filledClauses = template.clauses.map((c) => ({
    number: c.number,
    text: fillPlaceholders(c.text, mergedFields),
  }));

  // Build field display map for the PDF table
  const fieldDisplay: Record<string, { label: string; value: string }> = {};
  for (const [key, fieldDef] of Object.entries(template.fields)) {
    fieldDisplay[key] = {
      label: fieldDef.label,
      value: mergedFields[key] || "—",
    };
  }

  const displayArn = app.public_arn || arn;
  const today = new Date().toISOString().slice(0, 10);
  const place =
    appData.property?.scheme_name ||
    appData.applicant?.district ||
    "Punjab";

  // 5. Generate PDF
  const pdfBuffer = await renderDeclarationPdf({
    title: template.title,
    preamble: filledPreamble,
    clauses: filledClauses,
    fields: fieldDisplay,
    confirmation: template.confirmation,
    applicantName: mergedFields.applicant_name || "Applicant",
    arn: displayArn,
    date: today,
    place,
  });

  // 6. Upload to citizen document locker
  const citizenDoc = await uploadCitizenDocument(
    userId,
    docTypeId,
    `declaration_${docTypeId}_${today}.pdf`,
    "application/pdf",
    pdfBuffer
  );

  // Update origin to 'declaration' (uploadCitizenDocument defaults to 'uploaded')
  await query(
    "UPDATE citizen_document SET origin = 'declaration' WHERE citizen_doc_id = $1",
    [citizenDoc.citizen_doc_id]
  );

  // 7. Link to application
  const { app_doc_id: appDocId } = await reuseDocumentForApplication(
    userId,
    citizenDoc.citizen_doc_id,
    arn,
    docTypeId
  );

  // 8. Audit event
  await query(
    "INSERT INTO audit_event (event_id, arn, event_type, actor_type, actor_id, payload_jsonb) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      uuidv4(),
      arn,
      "DECLARATION_SUBMITTED",
      "CITIZEN",
      userId,
      JSON.stringify({
        citizenDocId: citizenDoc.citizen_doc_id,
        appDocId,
        docTypeId,
        declarationId: (template as any).declarationId || docTypeId,
        filledFields: mergedFields,
      }),
    ]
  );

  return {
    citizenDocId: citizenDoc.citizen_doc_id,
    appDocId,
  };
}
