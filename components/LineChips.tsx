"use client";

import type { RailLine } from "@/lib/railGraph";

/** Floating per-line visibility toggles, in official line colors. */
export function LineChips({
  lines,
  visible,
  onChange,
  hasBus = false,
  busEnabled = false,
  onToggleBus,
  heatEnabled = false,
  onToggleHeat,
}: {
  lines: RailLine[];
  visible: string[];
  onChange: (ids: string[]) => void;
  hasBus?: boolean;
  busEnabled?: boolean;
  onToggleBus?: () => void;
  heatEnabled?: boolean;
  onToggleHeat?: () => void;
}) {
  const allOn = visible.length === lines.length;
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-xl border border-edge bg-ink/90 px-2.5 py-2 shadow-lg backdrop-blur">
      <button
        className="chip"
        data-on={allOn}
        onClick={() => onChange(allOn ? [] : lines.map((l) => l.id))}
        title={allOn ? "Hide all lines" : "Show all lines"}
      >
        Rail
      </button>
      {lines.map((l) => {
        const on = visible.includes(l.id);
        return (
          <button
            key={l.id}
            className="chip font-mono text-[10.5px]"
            data-on={on}
            onClick={() =>
              onChange(on ? visible.filter((v) => v !== l.id) : [...visible, l.id])
            }
            title={`${l.name} — every ~${l.headwayMin} min`}
          >
            <span
              className="inline-block h-[9px] w-[9px] rounded-full border border-white/25"
              style={{ backgroundColor: l.color, opacity: on ? 1 : 0.3 }}
            />
            {l.shortName}
          </button>
        );
      })}
      {hasBus && (
        <button
          className="chip font-mono text-[10.5px]"
          data-on={busEnabled}
          onClick={onToggleBus}
          title="MRT/LRT feeder buses — include in commutes and show on the map"
        >
          <span
            className="inline-block h-[9px] w-[9px] rounded-full border border-white/25"
            style={{ backgroundColor: "#2f8f83", opacity: busEnabled ? 1 : 0.3 }}
          />
          Bus
        </button>
      )}
      {onToggleHeat && (
        <button
          className="chip font-mono text-[10.5px]"
          data-on={heatEnabled}
          onClick={onToggleHeat}
          title="Shade the map by door-to-door minutes to your destination"
        >
          <span
            className="inline-block h-[9px] w-[9px] rounded-full border border-white/25"
            style={{
              background: "linear-gradient(135deg,#22a06b,#e7a100,#d64550)",
              opacity: heatEnabled ? 1 : 0.3,
            }}
          />
          Heatmap
        </button>
      )}
    </div>
  );
}
