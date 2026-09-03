/*
 * Smart Home Health
 * Copyright (C) 2026 John Carty
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_CHROME } from "../contexts/DashboardThemeContext";
import { pickTimeStep, buildTimeTicks, niceYDomain } from "../utils/chartAxis";

// Series colours are token references: SVG takes var() in a presentation
// attribute, so the trace follows the palette on <html> by itself.
const SERIES_COLORS = {
  blue: 'var(--vc-data-live)',
  green: 'var(--vc-state-complete)',
  orange: 'var(--vc-state-due)',
};
const getColor = (colorName) => SERIES_COLORS[String(colorName).toLowerCase()] || colorName;

const pad2 = (n) => String(n).padStart(2, '0');

/* Streaming line chart for the live dashboard.
 *
 * The x domain is the wall-clock window [now - windowMs, now] with ticks on
 * round boundaries (see utils/chartAxis) rather than recharts' data-derived
 * default: labels then keep their text and slide, instead of renumbering on
 * every incoming sample. `now` is supplied by the caller (useLiveVitalsBuffer's
 * 1 Hz clock) so this component renders purely from its props.
 *
 * `dataset` is already trimmed to the window by the buffer hook — don't
 * re-filter it here. */
function ChartBlock({
  yLabel,
  color,
  dataset,
  showXaxis = true,
  showYaxis = true,
  // A tile-sized trace wants neither: its own card supplies the surface, and
  // on a phone the tooltip latches on the tap that flipped the tile and then
  // sits there over the reading.
  showTooltip = true,
  transparent = false,
  chrome = CHART_CHROME,
  windowMs = 5 * 60 * 1000,
  now,
}) {
  const chartColor = getColor(color);
  const domainEnd = now ?? Date.now();
  const domainStart = domainEnd - windowMs;

  const step = pickTimeStep(windowMs);
  const ticks = useMemo(
    () => buildTimeTicks(domainStart, domainEnd, step),
    [domainStart, domainEnd, step]
  );
  // Seconds only carry information when the ticks are closer together than a
  // minute; above that they're noise that changes on every render.
  const showSeconds = step < 60 * 1000;
  const formatTick = (unixTime) => {
    const d = new Date(unixTime);
    const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    return showSeconds ? `${hm}:${pad2(d.getSeconds())}` : hm;
  };

  const yDomain = useMemo(() => niceYDomain(dataset.map(d => d.y)), [dataset]);

  // Stable identities for the axis style objects (fresh literals would make
  // every render look like a prop change to recharts).
  const axisStyles = useMemo(() => ({
    line: { stroke: chrome.grid },
    tick: { fill: chrome.axis, fontSize: 10 },
    tooltipContent: {
      backgroundColor: chrome.tooltipBg,
      border: `1px solid ${chrome.tooltipBorder}`,
      borderRadius: '4px',
    },
    tooltipLabel: { color: chrome.tooltipText },
  }), [chrome]);
  const yAxisLabel = useMemo(
    () => ({ value: yLabel, angle: -90, position: 'insideLeft', fill: chrome.axis, fontSize: 12 }),
    [yLabel, chrome]
  );
  const seriesStyle = useMemo(() => ({ color: chartColor }), [chartColor]);

  return (
    <div style={{
      width: "100%",
      height: "100%",
      position: "relative",
      backgroundColor: transparent ? 'transparent' : chrome.bg,
      borderRadius: "0px"
    }}>
      {dataset.length === 0 ? (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          color: chrome.axis
        }}>
          Waiting for data...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dataset} margin={{ top: 5, right: 22, bottom: 5, left: 0 }}>
            {showXaxis && (
              <XAxis
                dataKey="x"
                type="number"
                domain={[domainStart, domainEnd]}
                ticks={ticks}
                interval={0}
                allowDataOverflow
                tickFormatter={formatTick}
                axisLine={axisStyles.line}
                tickLine={axisStyles.line}
                tick={axisStyles.tick}
              />
            )}
            {showYaxis && (
              <YAxis
                domain={yDomain}
                allowDataOverflow
                label={yAxisLabel}
                axisLine={axisStyles.line}
                tickLine={axisStyles.line}
                tick={axisStyles.tick}
              />
            )}
            {showTooltip && (
              <Tooltip
                labelFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString()}
                contentStyle={axisStyles.tooltipContent}
                itemStyle={seriesStyle}
                labelStyle={axisStyles.tooltipLabel}
              />
            )}
            <Line
              type="monotone"
              dataKey="y"
              stroke={chartColor}
              dot={false}
              isAnimationActive={false}
              strokeWidth={2.5}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default React.memo(ChartBlock);
