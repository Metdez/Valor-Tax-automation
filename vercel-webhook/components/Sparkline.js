export default function Sparkline({ data = [], width = 200, height = 40, color = "#c0000a" }) {
  if (!data.length) return null;

  const max = Math.max(...data, 1);
  const step = width / Math.max(data.length - 1, 1);

  const points = data
    .map((v, i) => `${i * step},${height - (v / max) * (height - 4) - 2}`)
    .join(" ");

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
