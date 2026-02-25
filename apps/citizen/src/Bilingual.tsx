import { useTranslation } from "react-i18next";
import { useSecondaryLanguage } from "./SecondaryLanguageContext";
import "./bilingual.css";

type Props = {
  tKey: string;
  values?: Record<string, unknown>;
  variant?: "stacked" | "inline";
  className?: string;
};

export function Bilingual({ tKey, values, variant = "stacked", className }: Props) {
  const { t } = useTranslation();
  const secondaryLang = useSecondaryLanguage();
  const en = t(tKey, { ...(values || {}), lng: "en" });

  if (secondaryLang === "none") return <>{en}</>;

  const sec = t(tKey, { ...(values || {}), lng: secondaryLang });
  const hasSecondary = sec && sec !== en && sec !== tKey;

  if (!hasSecondary) return <>{en}</>;

  return (
    <span className={`bilingual bilingual--${variant}${className ? ` ${className}` : ""}`}>
      <span className="bilingual__primary">{en}</span>
      <span className="bilingual__secondary" lang={secondaryLang}>{sec}</span>
    </span>
  );
}
