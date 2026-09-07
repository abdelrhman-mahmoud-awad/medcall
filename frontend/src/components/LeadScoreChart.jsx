import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from 'recharts';

const COLORS = { warm: '#ffb300', cold: '#64b5f6' };

/** Lead label distribution bar chart. Expects { warm, cold } counts. */
export default function LeadScoreChart({ byLabel = {} }) {
  const data = ['warm', 'cold'].map(label => ({
    label, count: byLabel[label] || 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <XAxis dataKey="label" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {data.map(d => <Cell key={d.label} fill={COLORS[d.label]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
