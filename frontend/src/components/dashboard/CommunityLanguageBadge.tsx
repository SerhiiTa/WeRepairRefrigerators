import { StatusBadge } from "@/components/StatusBadge";
import type { CommunityLanguage } from "@/types/community";

type CommunityLanguageBadgeProps = {
  language: CommunityLanguage;
};

const languageLabels: Record<CommunityLanguage, string> = {
  en: "English",
  es: "Spanish",
  ru: "Russian",
  uk: "Ukrainian",
};

export function CommunityLanguageBadge({ language }: CommunityLanguageBadgeProps) {
  return <StatusBadge tone="slate">{languageLabels[language]}</StatusBadge>;
}
