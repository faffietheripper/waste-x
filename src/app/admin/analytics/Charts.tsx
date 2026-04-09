"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";

export function ListingsOverTimeChart({ data }: { data: any[] }) {
  return (
    <div className="bg-white p-4 rounded-lg border">
      <h3 className="text-sm font-semibold mb-2">Listings Over Time</h3>

      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="listings" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompletionFunnelChart({ data }: { data: any[] }) {
  return (
    <div className="bg-white p-4 rounded-lg border">
      <h3 className="text-sm font-semibold mb-2">Lifecycle Funnel</h3>

      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="stage" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
