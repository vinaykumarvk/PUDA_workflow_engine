import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button } from "@puda/shared";
import { Bilingual } from "./Bilingual";
import "./declaration-form.css";

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

interface DeclarationFormPanelProps {
  template: DeclarationTemplate;
  applicationData: Record<string, any>;
  onSubmit: (filledFields: Record<string, string>) => void;
  onCancel: () => void;
  submitting: boolean;
}

/**
 * Resolve a dot-path like "applicant.full_name" against nested data.
 */
function resolveSource(data: any, path: string): string {
  const value = path.split(".").reduce((obj, key) => obj?.[key], data);
  return value != null ? String(value) : "";
}

/**
 * Replace {{placeholder}} tokens in text with display values.
 * Returns an array of segments: strings and field references.
 */
function parseTemplate(
  text: string
): Array<{ type: "text"; value: string } | { type: "field"; key: string }> {
  const segments: Array<
    { type: "text"; value: string } | { type: "field"; key: string }
  > = [];
  const regex = /\{\{(\w+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "field", key: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

export default function DeclarationFormPanel({
  template,
  applicationData,
  onSubmit,
  onCancel,
  submitting,
}: DeclarationFormPanelProps) {
  const { t } = useTranslation();

  // Pre-fill field values from application data
  const initialValues = useMemo(() => {
    const values: Record<string, string> = {};
    for (const [key, fieldDef] of Object.entries(template.fields)) {
      values[key] = resolveSource(applicationData, fieldDef.source);
    }
    return values;
  }, [template.fields, applicationData]);

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(initialValues);
  const [confirmed, setConfirmed] = useState(false);

  const updateField = (key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    if (!confirmed || submitting) return;
    onSubmit(fieldValues);
  };

  const today = new Date().toISOString().slice(0, 10);
  const place =
    applicationData?.property?.scheme_name ||
    applicationData?.applicant?.district ||
    "Punjab";

  // Render text with inline field inputs for {{placeholders}}
  const renderTextWithFields = (text: string) => {
    const segments = parseTemplate(text);
    return segments.map((seg, i) => {
      if (seg.type === "text") {
        return <span key={i}>{seg.value}</span>;
      }
      const value = fieldValues[seg.key] || "";
      const prefilled = initialValues[seg.key];
      const className = `decl-inline-field ${
        prefilled ? "decl-inline-field--prefilled" : "decl-inline-field--empty"
      }`;
      return (
        <input
          key={i}
          type="text"
          className={className}
          value={value}
          onChange={(e) => updateField(seg.key, e.target.value)}
          aria-label={template.fields[seg.key]?.label || seg.key}
          style={{ width: `${Math.max(value.length + 2, 8)}ch` }}
        />
      );
    });
  };

  return (
    <div className="decl-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="decl-panel" role="dialog" aria-modal="true" aria-label={template.title}>
        {/* Header */}
        <div className="decl-panel__header">
          <h2 className="decl-panel__title">
            <Bilingual tKey="declaration.title" />
          </h2>
          <button
            className="decl-panel__close"
            onClick={onCancel}
            aria-label={t("locker.close")}
            type="button"
          >
            &times;
          </button>
        </div>

        {/* Hint */}
        <Alert variant="info" className="decl-hint">
          {t("declaration.prefilled_hint")}
        </Alert>

        {/* Editable field grid */}
        <div className="decl-fields">
          {Object.entries(template.fields).map(([key, fieldDef]) => {
            const value = fieldValues[key] || "";
            const prefilled = initialValues[key];
            const inputClass = `decl-field__input ${
              prefilled
                ? "decl-field__input--prefilled"
                : "decl-field__input--empty"
            }`;
            return (
              <div key={key} className="decl-field">
                <label className="decl-field__label" htmlFor={`decl-${key}`}>
                  {fieldDef.label}
                </label>
                <input
                  id={`decl-${key}`}
                  type="text"
                  className={inputClass}
                  value={value}
                  onChange={(e) => updateField(key, e.target.value)}
                />
              </div>
            );
          })}
        </div>

        {/* Document body */}
        <div className="decl-body">
          {/* Title */}
          <h3 style={{ textAlign: "center", marginBottom: "var(--space-4)" }}>
            {template.title}
          </h3>

          {/* Preamble with inline fields */}
          <p className="decl-preamble">{renderTextWithFields(template.preamble)}</p>

          {/* Clauses */}
          <ol className="decl-clauses">
            {template.clauses.map((clause) => (
              <li key={clause.number} className="decl-clause">
                {renderTextWithFields(clause.text)}
              </li>
            ))}
          </ol>
        </div>

        {/* Date / Place */}
        <div className="decl-meta">
          <div className="decl-meta__item">
            <span className="decl-meta__label">{t("declaration.place")}:</span>
            <span>{place}</span>
          </div>
          <div className="decl-meta__item">
            <span className="decl-meta__label">{t("declaration.date")}:</span>
            <span>{today}</span>
          </div>
        </div>

        {/* Signature placeholder */}
        <div className="decl-signature">
          {t("declaration.signature_placeholder")}
        </div>

        {/* Confirmation checkbox */}
        <label className="decl-confirm">
          <input
            type="checkbox"
            className="decl-confirm__checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span className="decl-confirm__text">{template.confirmation}</span>
        </label>

        {/* Actions */}
        <div className="decl-actions">
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!confirmed || submitting}
          >
            {submitting ? t("declaration.submitting") : t("declaration.submit")}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            {t("cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
