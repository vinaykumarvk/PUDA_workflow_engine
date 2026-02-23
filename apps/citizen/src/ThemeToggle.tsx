import type { ThemePreference, ResolvedTheme } from "./theme";

type ThemeToggleProps = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  onThemeChange: (next: ThemePreference) => void;
  idSuffix?: string;
};

export default function ThemeToggle({ theme, resolvedTheme, onThemeChange, idSuffix = "global" }: ThemeToggleProps) {
  const id = `theme-select-${idSuffix}`;
  return (
    <label htmlFor={id} className="theme-toggle" aria-label="Theme selector">
      <span className="theme-toggle__label">Theme</span>
      <select
        id={id}
        className="theme-select"
        value={theme}
        onChange={(e) => onThemeChange(e.target.value as ThemePreference)}
        aria-describedby={`${id}-hint`}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
      <span id={`${id}-hint`} className="sr-only">
        Active theme: {resolvedTheme}
      </span>
    </label>
  );
}
