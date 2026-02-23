import React, { useState, useEffect, useCallback } from "react";

export interface CitizenProperty {
  property_id: string;
  unique_property_number: string | null;
  property_number: string | null;
  scheme_name: string | null;
  area_sqyd: number | null;
  usage_type: string | null;
  property_type: string | null;
  authority_id: string;
  location: string | null;
  sector: string | null;
  district: string | null;
}

export interface FieldDef {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  ui?: {
    widget?: string;
    options?: { value: string; label: string }[];
    readOnly?: boolean;
    fillFromProperty?: string;
  };
  validations?: any[];
}

export interface FormSection {
  sectionId: string;
  title: string;
  fields: FieldDef[];
}

export interface FormPage {
  pageId: string;
  title: string;
  sections: FormSection[];
}

export interface FormConfig {
  formId: string;
  version: string;
  pages: FormPage[];
}

interface FormRendererProps {
  config: FormConfig;
  initialData?: any;
  onChange?: (data: any) => void;
  onSubmit?: (data: any) => void;
  readOnly?: boolean;
  unlockedFields?: string[];
  /** Citizen-owned properties for UPN picker auto-population */
  citizenProperties?: CitizenProperty[];
  pageActions?: Array<{
    pageId: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
  }>;
  pageSupplements?: Record<string, React.ReactNode>;
  /** Override the Submit button label on the last page */
  submitLabel?: string;
  /** Disable the Submit button on the last page */
  submitDisabled?: boolean;
  /** Replace the Submit button entirely with custom content on a specific page */
  submitOverride?: React.ReactNode;
}

export function FormRenderer({
  config,
  initialData = {},
  onChange,
  onSubmit,
  readOnly = false,
  unlockedFields = [],
  citizenProperties = [],
  pageActions = [],
  pageSupplements = {},
  submitLabel = "Submit",
  submitDisabled = false,
  submitOverride,
}: FormRendererProps) {
  const [data, setData] = useState<any>(initialData);
  const [currentPage, setCurrentPage] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Helper: read a nested dot-key from form data
  const getFieldValue = useCallback((key: string): any => {
    const keys = key.split(".");
    let value = data;
    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) return undefined;
    }
    return value;
  }, [data]);

  // Helper: validate a single field value
  const validateField = useCallback((field: FieldDef, value: any): string | null => {
    if (field.required && (value === undefined || value === null || value === "")) {
      return `${field.label} is required`;
    }
    return null;
  }, []);

  // Helper: write a nested dot-key into form data
  const updateField = useCallback((key: string, value: any) => {
    const newData = { ...data };
    const keys = key.split(".");
    let current = newData;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    setData(newData);
    onChange?.(newData);
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: "" }));
    }
  }, [data, errors, onChange]);

  const handleBlur = useCallback((field: FieldDef) => {
    setTouched((prev) => ({ ...prev, [field.key]: true }));
    const value = getFieldValue(field.key);
    const err = validateField(field, value);
    if (err) {
      setErrors((prev) => ({ ...prev, [field.key]: err }));
    } else {
      setErrors((prev) => { const next = { ...prev }; delete next[field.key]; return next; });
    }
  }, [getFieldValue, validateField]);

  /**
   * When a UPN is selected from the picker, auto-populate all sibling
   * property.* fields that declare `ui.fillFromProperty`.
   */
  const handleUpnSelect = useCallback((selectedUpn: string) => {
    const property = citizenProperties.find(
      (p) => p.unique_property_number === selectedUpn
    );

    const newData = { ...data };
    const setNested = (key: string, value: any) => {
      const parts = key.split(".");
      let obj = newData;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
    };

    setNested("property.upn", selectedUpn);

    if (property && config?.pages) {
      for (const page of config.pages) {
        for (const section of page.sections) {
          for (const f of section.fields) {
            const fillKey = f.ui?.fillFromProperty;
            if (!fillKey) continue;
            const propValue = (property as any)[fillKey];
            if (propValue !== undefined && propValue !== null) {
              setNested(f.key, propValue);
            }
          }
        }
      }
    }

    setData(newData);
    onChange?.(newData);
  }, [citizenProperties, data, config?.pages, onChange]);

  // Guard: config must have at least one page
  if (!config?.pages?.length) {
    return <p className="form-renderer-error">Form configuration is invalid (no pages defined).</p>;
  }

  const validatePage = (): boolean => {
    const page = config.pages[currentPage];
    const newErrors: Record<string, string> = {};
    let isValid = true;

    page.sections.forEach((section) => {
      section.fields.forEach((field) => {
        const value = getFieldValue(field.key);
        const error = validateField(field, value);
        if (error) {
          newErrors[field.key] = error;
          isValid = false;
        }
      });
    });

    setErrors(newErrors);
    return isValid;
  };

  const isFieldEditable = (field: FieldDef): boolean => {
    if (field.key?.startsWith("applicant.")) return false;
    if (field.readOnly || field.ui?.readOnly) return false;
    if (readOnly) {
      return unlockedFields.includes(field.key);
    }
    return true;
  };

  const renderField = (field: FieldDef) => {
    const value = getFieldValue(field.key);
    const editable = isFieldEditable(field);
    const error = errors[field.key];

    const fieldId = `fr-${field.key.replace(/\./g, "-")}`;
    const errorId = error ? `${fieldId}-err` : undefined;
    const blurHandler = () => handleBlur(field);
    const ariaProps = { id: fieldId, "aria-invalid": error ? true as const : undefined, "aria-describedby": errorId };

    switch (field.type) {
      case "string":
      case "text":
        if (field.type === "string" && field.ui?.widget === "upn-picker" && citizenProperties.length > 0) {
          return (
            <div key={field.key} className="field">
              <label htmlFor={fieldId}>
                {field.label}
                {field.required && <span className="required">*</span>}
              </label>
              <select
                {...ariaProps}
                value={value || ""}
                onChange={(e) => handleUpnSelect(e.target.value)}
                onBlur={blurHandler}
                disabled={!editable}
                className={`upn-picker-select${error ? " error" : ""}`}
              >
                <option value="">— Select your property (UPN) —</option>
                {citizenProperties.map((p) => {
                  const upn = p.unique_property_number || "";
                  const label = [
                    upn,
                    p.scheme_name,
                    p.property_type,
                    p.area_sqyd ? `${p.area_sqyd} sq.yd` : null,
                  ].filter(Boolean).join(" · ");
                  return <option key={upn} value={upn}>{label}</option>;
                })}
              </select>
              {error && <span id={errorId} className="error-message" role="alert">{error}</span>}
              {value && (() => {
                const p = citizenProperties.find((x) => x.unique_property_number === value);
                if (!p) return null;
                return (
                  <div className="upn-selected-summary">
                    <dl className="property-summary">
                      {p.scheme_name && <><dt>Scheme</dt><dd>{p.scheme_name}</dd></>}
                      {p.property_number && <><dt>Plot No.</dt><dd>{p.property_number}</dd></>}
                      {p.area_sqyd && <><dt>Area</dt><dd>{p.area_sqyd} sq.yd</dd></>}
                      {p.usage_type && <><dt>Type</dt><dd>{p.usage_type}</dd></>}
                      {p.district && <><dt>District</dt><dd>{p.district}</dd></>}
                    </dl>
                  </div>
                );
              })()}
            </div>
          );
        }
        return (
          <div key={field.key} className="field">
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span className="required">*</span>}
            </label>
            {field.type === "text" ? (
              <textarea
                {...ariaProps}
                value={value || ""}
                onChange={(e) => updateField(field.key, e.target.value)}
                onBlur={blurHandler}
                placeholder={field.placeholder}
                disabled={!editable}
                className={error ? "error" : ""}
              />
            ) : (
              <input
                {...ariaProps}
                type="text"
                value={value || ""}
                onChange={(e) => updateField(field.key, e.target.value)}
                onBlur={blurHandler}
                placeholder={field.placeholder || (field.ui?.widget === "upn-picker" ? "e.g. PB-140-001-003-002301" : undefined)}
                disabled={!editable}
                className={error ? "error" : ""}
              />
            )}
            {error && <span id={errorId} className="error-message" role="alert">{error}</span>}
          </div>
        );

      case "number":
        return (
          <div key={field.key} className="field">
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span className="required">*</span>}
            </label>
            <input
              {...ariaProps}
              type="number"
              inputMode="decimal"
              value={value ?? ""}
              onChange={(e) => {
                if (e.target.value === "") {
                  updateField(field.key, undefined);
                } else {
                  updateField(field.key, parseFloat(e.target.value));
                }
              }}
              onBlur={blurHandler}
              placeholder={field.placeholder}
              disabled={!editable}
              className={error ? "error" : ""}
            />
            {error && <span id={errorId} className="error-message" role="alert">{error}</span>}
          </div>
        );

      case "date":
        return (
          <div key={field.key} className="field">
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span className="required">*</span>}
            </label>
            <input
              {...ariaProps}
              type="date"
              value={value || ""}
              onChange={(e) => updateField(field.key, e.target.value)}
              onBlur={blurHandler}
              placeholder={field.placeholder}
              disabled={!editable}
              className={error ? "error" : ""}
            />
            {error && <span id={errorId} className="error-message" role="alert">{error}</span>}
          </div>
        );

      case "email":
        return (
          <div key={field.key} className="field">
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span className="required">*</span>}
            </label>
            <input
              {...ariaProps}
              type="email"
              value={value || ""}
              onChange={(e) => updateField(field.key, e.target.value)}
              onBlur={blurHandler}
              placeholder={field.placeholder}
              disabled={!editable}
              className={error ? "error" : ""}
            />
            {error && <span id={errorId} className="error-message" role="alert">{error}</span>}
          </div>
        );

      case "phone":
        return (
          <div key={field.key} className="field">
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span className="required">*</span>}
            </label>
            <input
              {...ariaProps}
              type="tel"
              inputMode="tel"
              value={value || ""}
              onChange={(e) => updateField(field.key, e.target.value)}
              onBlur={blurHandler}
              placeholder={field.placeholder}
              disabled={!editable}
              className={error ? "error" : ""}
            />
            {error && <span id={errorId} className="error-message" role="alert">{error}</span>}
          </div>
        );

      case "aadhaar":
        return (
          <div key={field.key} className="field">
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span className="required">*</span>}
            </label>
            <input
              {...ariaProps}
              type="text"
              inputMode="numeric"
              pattern="\\d{12}"
              value={value || ""}
              onChange={(e) => updateField(field.key, e.target.value)}
              onBlur={blurHandler}
              placeholder={field.placeholder}
              disabled={!editable}
              className={error ? "error" : ""}
            />
            {error && <span id={errorId} className="error-message" role="alert">{error}</span>}
          </div>
        );

      case "boolean":
        return (
          <div key={field.key} className="field">
            <label>
              <input
                type="checkbox"
                checked={value || false}
                onChange={(e) => updateField(field.key, e.target.checked)}
                onBlur={blurHandler}
                disabled={!editable}
              />
              {field.label}
              {field.required && <span className="required">*</span>}
            </label>
            {error && <span id={errorId} className="error-message" role="alert">{error}</span>}
          </div>
        );

      case "enum":
        return (
          <div key={field.key} className="field">
            <label htmlFor={fieldId}>
              {field.label}
              {field.required && <span className="required">*</span>}
            </label>
            <select
              {...ariaProps}
              value={value || ""}
              onChange={(e) => updateField(field.key, e.target.value)}
              onBlur={blurHandler}
              disabled={!editable}
              className={error ? "error" : ""}
            >
              <option value="">Select...</option>
              {field.ui?.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {error && <span id={errorId} className="error-message" role="alert">{error}</span>}
          </div>
        );

      default:
        return null;
    }
  };

  const currentPageConfig = config.pages[currentPage];
  const isLastPage = currentPage === config.pages.length - 1;
  const currentPageAction = pageActions.find((action) => action.pageId === currentPageConfig.pageId);

  const totalPages = config.pages.length;

  return (
    <div className="form-renderer">
      {totalPages > 1 && (
        <div className="form-progress" role="progressbar" aria-valuenow={currentPage + 1} aria-valuemin={1} aria-valuemax={totalPages} aria-label={`Step ${currentPage + 1} of ${totalPages}`}>
          <div className="form-progress__label">Step {currentPage + 1} of {totalPages}</div>
          <div className="form-progress__track">
            <div className="form-progress__fill" style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }} />
          </div>
        </div>
      )}
      <div className="form-pages">
        {config.pages.map((page, idx) => (
          <button
            key={page.pageId}
            type="button"
            onClick={() => setCurrentPage(idx)}
            className={idx === currentPage ? "active" : idx < currentPage ? "completed" : ""}
            aria-current={idx === currentPage ? "step" : undefined}
          >
            {idx < currentPage && <span aria-hidden="true">&#10003; </span>}
            {page.title}
          </button>
        ))}
      </div>

      <div className="form-page">
        <h2>{currentPageConfig.title}</h2>
        {currentPageConfig.sections.map((section) => (
          <div key={section.sectionId} className="form-section">
            <h3>{section.title}</h3>
            {section.fields.map((field) => renderField(field))}
          </div>
        ))}
        {pageSupplements[currentPageConfig.pageId] ? (
          <div className="form-page-supplement">{pageSupplements[currentPageConfig.pageId]}</div>
        ) : null}
      </div>

      <div className="form-actions">
        <div className="form-actions__left">
          {currentPage > 0 && (
            <button type="button" onClick={() => setCurrentPage(currentPage - 1)} className="form-action-btn">
              Previous
            </button>
          )}
        </div>
        <div className="form-actions__right">
          {currentPageAction ? (
            <button
              type="button"
              onClick={currentPageAction.onClick}
              disabled={currentPageAction.disabled}
              className={`form-action-btn form-action-btn--secondary ${currentPageAction.className || ""}`.trim()}
            >
              {currentPageAction.label}
            </button>
          ) : null}
          {!isLastPage ? (
            <button
              type="button"
              className="form-action-btn form-action-btn--primary"
              onClick={() => {
                if (validatePage()) {
                  setCurrentPage(currentPage + 1);
                }
              }}
            >
              Next
            </button>
          ) : submitOverride != null ? (
            <>{submitOverride}</>
          ) : (
            <button
              type="button"
              className="form-action-btn form-action-btn--primary"
              disabled={submitDisabled}
              onClick={() => {
                if (!submitDisabled && validatePage()) {
                  onSubmit?.(data);
                }
              }}
            >
              {submitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
