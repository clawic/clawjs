import { NextResponse } from "next/server";
import {
  readCollection,
  writeCollection,
  readDocument,
  writeDocument,
  generateId,
  type UsageRecord,
  type BudgetConfig,
} from "@/lib/demo-store";

const DEFAULT_BUDGET: BudgetConfig = {
  monthlyLimit: 50,
  warningThreshold: 80,
  enabled: true,
};

function seedUsageRecords(): UsageRecord[] {
  const providers = [
    { name: "OpenAI", models: ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"] },
    { name: "Anthropic", models: ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"] },
    { name: "Google", models: ["gemini-pro", "gemini-pro-vision"] },
  ];
  const costs: Record<string, { inPer1k: number; outPer1k: number }> = {
    "gpt-4": { inPer1k: 0.03, outPer1k: 0.06 },
    "gpt-4-turbo": { inPer1k: 0.01, outPer1k: 0.03 },
    "gpt-3.5-turbo": { inPer1k: 0.0005, outPer1k: 0.0015 },
    "claude-3-opus": { inPer1k: 0.015, outPer1k: 0.075 },
    "claude-3-sonnet": { inPer1k: 0.003, outPer1k: 0.015 },
    "claude-3-haiku": { inPer1k: 0.00025, outPer1k: 0.00125 },
    "gemini-pro": { inPer1k: 0.00025, outPer1k: 0.0005 },
    "gemini-pro-vision": { inPer1k: 0.00025, outPer1k: 0.0005 },
  };

  const now = Date.now();
  const records: UsageRecord[] = [];

  for (let i = 0; i < 22; i++) {
    const prov = providers[i % providers.length];
    const model = prov.models[Math.floor(Math.random() * prov.models.length)];
    const pricing = costs[model];
    const tokensIn = 200 + Math.floor(Math.random() * 3800);
    const tokensOut = 100 + Math.floor(Math.random() * 2000);
    const cost =
      Math.round(
        ((tokensIn / 1000) * pricing.inPer1k + (tokensOut / 1000) * pricing.outPer1k) * 10000
      ) / 10000;
    const daysAgo = Math.floor(Math.random() * 14);
    const ts = now - daysAgo * 86400000 - Math.floor(Math.random() * 86400000);

    records.push({
      id: generateId(),
      provider: prov.name,
      model,
      tokensIn,
      tokensOut,
      estimatedCost: cost,
      timestamp: ts,
    });
  }

  records.sort((a, b) => b.timestamp - a.timestamp);
  return records;
}

export async function GET() {
  let records = readCollection<UsageRecord>("usage-records");
  if (records.length === 0) {
    records = seedUsageRecords();
    writeCollection("usage-records", records);
  }

  let budget = readDocument<BudgetConfig>("budget-config");
  if (!budget) {
    budget = DEFAULT_BUDGET;
    writeDocument("budget-config", budget);
  }

  return NextResponse.json({ records, budget });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const budget: BudgetConfig = {
    monthlyLimit: body.monthlyLimit ?? DEFAULT_BUDGET.monthlyLimit,
    warningThreshold: body.warningThreshold ?? DEFAULT_BUDGET.warningThreshold,
    enabled: body.enabled ?? DEFAULT_BUDGET.enabled,
  };
  writeDocument("budget-config", budget);
  return NextResponse.json(budget);
}
