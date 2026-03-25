"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  DollarSign, TrendingUp, AlertTriangle, Settings2,
  Loader2, BarChart3, Zap, Save,
} from "lucide-react";

interface UsageRecord {
  id: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  estimatedCost: number;
  timestamp: number;
}

interface BudgetConfig {
  monthlyLimit: number;
  warningThreshold: number;
  enabled: boolean;
}

const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: "bg-emerald-500",
  Anthropic: "bg-orange-500",
  Google: "bg-blue-500",
};

export default function UsagePage() {
  const { formatDate } = useLocale();
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [budget, setBudget] = useState<BudgetConfig>({ monthlyLimit: 50, warningThreshold: 80, enabled: true });
  const [loaded, setLoaded] = useState(false);
  const [editBudget, setEditBudget] = useState(false);
  const [draftLimit, setDraftLimit] = useState(50);
  const [draftThreshold, setDraftThreshold] = useState(80);

  const load = useCallback(async () => {
    const res = await fetch("/api/usage");
    const data = await res.json();
    setRecords(data.records);
    setBudget(data.budget);
    setDraftLimit(data.budget.monthlyLimit);
    setDraftThreshold(data.budget.warningThreshold);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveBudget = async () => {
    const updated = { ...budget, monthlyLimit: draftLimit, warningThreshold: draftThreshold };
    await fetch("/api/usage", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
    setBudget(updated);
    setEditBudget(false);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* ── Computed data ── */
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthRecords = records.filter((r) => r.timestamp >= monthStart);
  const monthSpend = Math.round(monthRecords.reduce((s, r) => s + r.estimatedCost, 0) * 100) / 100;
  const spendPct = budget.monthlyLimit > 0 ? Math.min((monthSpend / budget.monthlyLimit) * 100, 100) : 0;
  const overWarning = spendPct >= budget.warningThreshold;

  // Daily chart for last 14 days
  const dayBuckets: Record<string, number> = {};
  const dayLabels: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    dayLabels.push(key);
    dayBuckets[key] = 0;
  }
  records.forEach((r) => {
    const key = new Date(r.timestamp).toISOString().slice(0, 10);
    if (dayBuckets[key] !== undefined) dayBuckets[key] += r.estimatedCost;
  });
  const maxDayCost = Math.max(...Object.values(dayBuckets), 0.01);

  // Provider breakdown
  const providerSpend: Record<string, number> = {};
  monthRecords.forEach((r) => { providerSpend[r.provider] = (providerSpend[r.provider] || 0) + r.estimatedCost; });
  const totalProviderSpend = Object.values(providerSpend).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto" data-testid="usage-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-6 h-6" /> Cost &amp; Usage
        </h1>
      </div>

      {/* ── Budget Overview ── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-muted-foreground" />
            <span className="font-semibold text-foreground">Monthly Budget</span>
          </div>
          <button data-testid="usage-edit-budget" onClick={() => setEditBudget(!editBudget)} className="text-muted-foreground hover:text-foreground transition-colors">
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-end gap-2 mb-2">
          <span className={`text-3xl font-bold ${overWarning ? "text-red-500" : "text-foreground"}`}>
            ${monthSpend.toFixed(2)}
          </span>
          <span className="text-muted-foreground mb-1">/ ${budget.monthlyLimit.toFixed(2)}</span>
        </div>
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${overWarning ? "bg-red-500" : "bg-emerald-500"}`}
            style={{ width: `${spendPct}%` }}
          />
        </div>
        {overWarning && (
          <div className="flex items-center gap-1.5 mt-2 text-sm text-red-500">
            <AlertTriangle className="w-3.5 h-3.5" /> Spending exceeds {budget.warningThreshold}% warning threshold
          </div>
        )}
        {editBudget && (
          <div className="mt-4 flex flex-wrap items-end gap-4 pt-4 border-t border-border">
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              Monthly Limit ($)
              <input data-testid="usage-limit-input" type="number" value={draftLimit} onChange={(e) => setDraftLimit(Number(e.target.value))}
                className="w-28 px-2 py-1 rounded-md bg-muted border border-border text-foreground text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              Warning (%)
              <input data-testid="usage-threshold-input" type="number" value={draftThreshold} onChange={(e) => setDraftThreshold(Number(e.target.value))}
                className="w-28 px-2 py-1 rounded-md bg-muted border border-border text-foreground text-sm" />
            </label>
            <button data-testid="usage-save-budget" onClick={saveBudget}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity">
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        )}
      </div>

      {/* ── Daily Cost Chart ── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" /> Daily Cost (Last 14 Days)
        </h2>
        <div className="flex items-end gap-1 h-40">
          {dayLabels.map((day) => {
            const cost = dayBuckets[day];
            const pct = (cost / maxDayCost) * 100;
            return (
              <div key={day} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                  ${cost.toFixed(2)}
                </div>
                <div
                  className="w-full bg-emerald-500/80 rounded-t hover:bg-emerald-500 transition-colors min-h-[2px]"
                  style={{ height: `${Math.max(pct, 1)}%` }}
                />
                <span className="text-[9px] text-muted-foreground mt-1 rotate-[-45deg] origin-top-left w-0">
                  {day.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Provider Breakdown ── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-muted-foreground" /> Provider Breakdown (This Month)
        </h2>
        <div className="w-full h-6 rounded-full overflow-hidden flex bg-muted">
          {Object.entries(providerSpend).map(([prov, spend]) => (
            <div
              key={prov}
              className={`${PROVIDER_COLORS[prov] || "bg-violet-500"} h-full transition-all relative group`}
              style={{ width: `${(spend / totalProviderSpend) * 100}%` }}
            >
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                {prov}: ${spend.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          {Object.entries(providerSpend).map(([prov, spend]) => (
            <div key={prov} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className={`w-3 h-3 rounded-full ${PROVIDER_COLORS[prov] || "bg-violet-500"}`} />
              {prov} <span className="text-foreground font-medium">${spend.toFixed(2)}</span>
              <span className="text-xs">({((spend / totalProviderSpend) * 100).toFixed(0)}%)</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Usage Table ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">Recent Usage Records</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Provider</th>
                <th className="px-5 py-3 font-medium">Model</th>
                <th className="px-5 py-3 font-medium text-right">Tokens In</th>
                <th className="px-5 py-3 font-medium text-right">Tokens Out</th>
                <th className="px-5 py-3 font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 30).map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                    {formatDate(new Date(r.timestamp), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${PROVIDER_COLORS[r.provider] || "bg-violet-500"}`} />
                      <span className="text-foreground">{r.provider}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-foreground font-mono text-xs">{r.model}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{r.tokensIn.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{r.tokensOut.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-foreground font-medium">${r.estimatedCost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
