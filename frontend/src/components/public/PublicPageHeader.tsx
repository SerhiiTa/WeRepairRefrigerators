import { PublicHeroSection } from "@/components/public/sections/PublicHeroSection";

type PublicPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function PublicPageHeader({ eyebrow, title, description }: PublicPageHeaderProps) {
  return <PublicHeroSection eyebrow={eyebrow} title={title} description={description} />;
}
