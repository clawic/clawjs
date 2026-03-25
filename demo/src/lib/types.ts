export interface Contact {
  id: string;
  label: string;
  messages_sent: number;
  messages_received: number;
  tone_score: number;
  tone_trend: number;
  topics: string[];
  response_latency_avg_seconds: number;
  baseline_deviation: number;
  tier?: number;  // 1=priority, 2=professional, 3=contact, 4=ignored
  role?: string;  // partner, parent, colleague, team:company, etc.
}
