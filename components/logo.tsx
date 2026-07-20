import { IconRun } from "@tabler/icons-react";

const SIZES = {
  sm: { mark: 28, icon: 15, text: "text-base" },
  md: { mark: 32, icon: 17, text: "text-lg" },
} as const;

export function Logo({
  size = "md",
  className = "",
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { mark, icon, text } = SIZES[size];

  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#39D353] to-[#1F9E4C]"
        style={{ width: mark, height: mark }}
      >
        <IconRun size={icon} stroke={2.25} className="text-black" />
      </span>
      <span className={`${text} font-semibold tracking-tight text-white`}>PaceLeague</span>
    </span>
  );
}
