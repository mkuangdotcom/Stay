import type { Commute } from "@/lib/railGraph";

/**
 * Miniature line diagram of a commute: walk legs as dashed stubs,
 * ride legs as solid bars in the line's official color.
 */
export function RouteStrip({
  commute,
  lineColors,
  lineNames,
}: {
  commute: Commute;
  lineColors: Record<string, string>;
  lineNames: Record<string, string>;
}) {
  const legs = commute.legs.filter((l) => l.minutes >= 0.5 || l.type === "ride");
  const total = Math.max(
    legs.reduce((s, l) => s + l.minutes, 0),
    1
  );
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-[18px] flex-1 items-center gap-[3px]" aria-hidden>
        {legs.map((leg, i) => {
          const grow = Math.max(leg.minutes / total, 0.08);
          if (leg.type === "ride") {
            const color = lineColors[leg.route ?? ""] ?? "#888";
            return (
              <div
                key={i}
                className="flex h-[14px] min-w-[30px] items-center justify-center rounded-[4px] px-1"
                style={{ flexGrow: grow, backgroundColor: color }}
                title={`${lineNames[leg.route ?? ""] ?? leg.route}: ${leg.from} → ${leg.to}, ${Math.round(leg.minutes)} min`}
              >
                <span
                  className="font-mono text-[9px] font-semibold leading-none"
                  style={{ color: pickText(color) }}
                >
                  {leg.route}
                </span>
              </div>
            );
          }
          if (leg.type === "xfer") {
            return (
              <div
                key={i}
                className="h-[10px] w-[10px] shrink-0 rounded-full border-2 border-faint bg-transparent"
                title={`Transfer at ${leg.to}, ${Math.round(leg.minutes)} min`}
              />
            );
          }
          return (
            <div
              key={i}
              className="h-0 min-w-[12px] border-t-2 border-dashed border-faint"
              style={{ flexGrow: grow * 0.7 }}
              title={`Walk ${Math.round(leg.minutes)} min${leg.to ? ` to ${leg.to}` : ""}`}
            />
          );
        })}
      </div>
      <span className="font-mono text-[13px] font-semibold leading-none whitespace-nowrap">
        {Math.round(commute.totalMin)}
        <span className="text-[10px] font-normal text-muted"> min</span>
      </span>
    </div>
  );
}

function pickText(bg: string): string {
  const hex = bg.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? "#191500" : "#ffffff";
}
