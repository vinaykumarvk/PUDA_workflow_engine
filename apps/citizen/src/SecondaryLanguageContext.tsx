import { createContext, useContext, type ReactNode } from "react";

type SecondaryLang = "hi" | "pa" | "none";

const Ctx = createContext<SecondaryLang>("none");

export function SecondaryLanguageProvider({ lang, children }: { lang: SecondaryLang; children: ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export function useSecondaryLanguage(): SecondaryLang {
  return useContext(Ctx);
}
