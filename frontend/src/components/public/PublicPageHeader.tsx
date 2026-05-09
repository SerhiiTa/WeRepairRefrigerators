import { PublicHeroSection } from "@/components/public/sections/PublicHeroSection";

type PublicPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  variant?: "dark" | "light";
};

export function PublicPageHeader({
  eyebrow,
  title,
  description,
  variant = "dark",
}: PublicPageHeaderProps) {
  return (
    <PublicHeroSection
      eyebrow={eyebrow}
      title={title}
      description={description}
      variant={variant}
    />
  );
}
