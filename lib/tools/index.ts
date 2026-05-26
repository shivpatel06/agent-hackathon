import { tool } from "ai";
import { z } from "zod";

/**
 * Wayfair Proactive Delivery Monitoring — mock data + tools.
 *
 * The agent reads from this mock store to find at-risk orders, assess them,
 * and trigger proactive customer outreach. Swap the mock store for real
 * Wayfair APIs to ship.
 */

type Order = {
  order_id: string;
  customer_id: string;
  item: string;
  item_value: number;
  carrier_id: string;
  ship_zip: string;
  delivery_window: string; // ISO date or "today"
  days_since_last_scan: number;
  tracking_checks_today: number;
  is_overdue: boolean;
  days_overdue: number;
};

type Customer = {
  customer_id: string;
  name: string;
  phone: string;
  ltv: number;
};

type Carrier = {
  carrier_id: string;
  name: string;
  on_time_rate: number; // 0..1
};

type WeatherEvent = {
  zip: string;
  forecast: string;
  severity: "none" | "watch" | "warning" | "severe";
};

type Interaction = {
  order_id: string;
  timestamp: string;
  action: string;
  outcome: string;
};

const TODAY = "2026-05-26";

const orders: Order[] = [
  {
    order_id: "WF-10472",
    customer_id: "CUST-001",
    item: "Castleton Sectional Sofa",
    item_value: 1847,
    carrier_id: "CARR-EF",
    ship_zip: "02134",
    delivery_window: TODAY,
    days_since_last_scan: 3,
    tracking_checks_today: 5,
    is_overdue: false,
    days_overdue: 0,
  },
  {
    order_id: "WF-10583",
    customer_id: "CUST-002",
    item: "Modbury King Bed Frame",
    item_value: 2240,
    carrier_id: "CARR-XD",
    ship_zip: "78704",
    delivery_window: "2026-05-22",
    days_since_last_scan: 8,
    tracking_checks_today: 11,
    is_overdue: true,
    days_overdue: 4,
  },
  {
    order_id: "WF-10691",
    customer_id: "CUST-003",
    item: "Hartwell Dining Table Set",
    item_value: 3100,
    carrier_id: "CARR-PL",
    ship_zip: "33139",
    delivery_window: "2026-05-28",
    days_since_last_scan: 0,
    tracking_checks_today: 0,
    is_overdue: false,
    days_overdue: 0,
  },
];

const customers: Record<string, Customer> = {
  "CUST-001": {
    customer_id: "CUST-001",
    name: "James Carter",
    phone: "+1-617-555-0142",
    ltv: 2100,
  },
  "CUST-002": {
    customer_id: "CUST-002",
    name: "Maria Santos",
    phone: "+1-512-555-0188",
    ltv: 3400,
  },
  "CUST-003": {
    customer_id: "CUST-003",
    name: "David Kim",
    phone: "+1-305-555-0173",
    ltv: 8400,
  },
};

const carriers: Record<string, Carrier> = {
  "CARR-EF": { carrier_id: "CARR-EF", name: "Eastern Freight", on_time_rate: 0.64 },
  "CARR-XD": { carrier_id: "CARR-XD", name: "XDL Logistics", on_time_rate: 0.71 },
  "CARR-PL": { carrier_id: "CARR-PL", name: "Pelican Lines", on_time_rate: 0.88 },
};

const weather: Record<string, WeatherEvent> = {
  "02134": { zip: "02134", forecast: "Clear", severity: "none" },
  "78704": { zip: "78704", forecast: "Light rain", severity: "none" },
  "33139": {
    zip: "33139",
    forecast: "Severe thunderstorm system, May 28",
    severity: "severe",
  },
};

const interactions: Interaction[] = [];

function findOrder(order_id: string): Order | undefined {
  return orders.find((o) => o.order_id === order_id);
}

function computeRiskScore(order: Order) {
  const carrier = carriers[order.carrier_id];
  const wx = weather[order.ship_zip];
  const customer = customers[order.customer_id];

  const reasons: string[] = [];
  let score = 0;

  const scanPts = order.days_since_last_scan * 15;
  if (scanPts > 0) {
    reasons.push(`${order.days_since_last_scan}d since last scan (+${scanPts})`);
    score += scanPts;
  }

  const trackPts = order.tracking_checks_today * 8;
  if (trackPts > 0) {
    reasons.push(
      `${order.tracking_checks_today} tracking checks today (+${trackPts})`,
    );
    score += trackPts;
  }

  if (order.is_overdue) {
    reasons.push(`Delivery overdue by ${order.days_overdue}d (+30)`);
    score += 30;
  }

  if (carrier && carrier.on_time_rate < 0.7) {
    reasons.push(
      `${carrier.name} on-time rate ${Math.round(carrier.on_time_rate * 100)}% (+20)`,
    );
    score += 20;
  }

  if (order.item_value > 1500) {
    reasons.push(`Item value $${order.item_value} > $1,500 (+15)`);
    score += 15;
  }

  if (wx && (wx.severity === "warning" || wx.severity === "severe")) {
    reasons.push(`Weather: ${wx.forecast} (+25)`);
    score += 25;
  }

  if (customer && customer.ltv > 5000) {
    reasons.push(`Customer LTV $${customer.ltv} > $5,000 (+20)`);
    score += 20;
  }

  const level =
    score >= 100 ? "critical" : score >= 60 ? "high" : score >= 30 ? "medium" : "low";

  return { score, level, reasons };
}

function recommendAction(order: Order, score: number) {
  if (order.days_since_last_scan >= 7 || order.days_overdue >= 3) {
    return {
      action: "declare_lost_and_reship",
      reason: "Carrier silence + overdue indicates lost shipment",
    };
  }
  const wx = weather[order.ship_zip];
  if (wx && (wx.severity === "warning" || wx.severity === "severe")) {
    return {
      action: "proactive_weather_warning",
      reason: "Severe weather forecast in delivery zip ahead of delivery date",
    };
  }
  if (score >= 60) {
    return {
      action: "delay_outreach",
      reason: "Multiple delay signals trending toward customer escalation",
    };
  }
  return { action: "monitor", reason: "Below trigger threshold" };
}

export const getFlaggedOrders = tool({
  description:
    "Return all orders whose risk score meets the trigger threshold (>= 60). Use this to find which customers need a proactive call right now.",
  inputSchema: z.object({}),
  execute: async () => {
    const flagged = orders
      .map((o) => {
        const risk = computeRiskScore(o);
        return {
          order_id: o.order_id,
          customer_name: customers[o.customer_id]?.name,
          item: o.item,
          item_value: o.item_value,
          risk_score: risk.score,
          risk_level: risk.level,
          top_reasons: risk.reasons.slice(0, 3),
        };
      })
      .filter((o) => o.risk_score >= 60)
      .sort((a, b) => b.risk_score - a.risk_score);

    return { count: flagged.length, orders: flagged };
  },
});

export const getOrderDetail = tool({
  description:
    "Get the full record for one order: item, customer (name/phone/LTV), carrier, tracking signals, delivery window, weather in ship zip.",
  inputSchema: z.object({
    order_id: z.string().describe("Order ID, e.g. WF-10583"),
  }),
  execute: async ({ order_id }) => {
    const order = findOrder(order_id);
    if (!order) return { error: `Order ${order_id} not found` };

    return {
      order,
      customer: customers[order.customer_id],
      carrier: carriers[order.carrier_id],
      weather: weather[order.ship_zip],
    };
  },
});

export const assessRisk = tool({
  description:
    "Compute the current risk score for an order and return level, contributing signals, and recommended intervention.",
  inputSchema: z.object({
    order_id: z.string().describe("Order ID, e.g. WF-10583"),
  }),
  execute: async ({ order_id }) => {
    const order = findOrder(order_id);
    if (!order) return { error: `Order ${order_id} not found` };

    const risk = computeRiskScore(order);
    const rec = recommendAction(order, risk.score);
    return {
      order_id,
      risk_score: risk.score,
      risk_level: risk.level,
      triggers_call: risk.score >= 60,
      reasons: risk.reasons,
      recommended_action: rec.action,
      recommendation_reason: rec.reason,
    };
  },
});

const RESOLUTION_TYPES = [
  "reschedule_with_credit",
  "declare_lost_and_reship",
  "proactive_weather_warning",
  "monitor",
] as const;

export const initiateResolution = tool({
  description:
    "Open a resolution for an order and generate the call script. Pick the resolution type based on assess_risk's recommendation.",
  inputSchema: z.object({
    order_id: z.string(),
    resolution_type: z.enum(RESOLUTION_TYPES),
    credit_amount: z
      .number()
      .optional()
      .describe("USD store credit to offer, if applicable"),
    new_delivery_date: z
      .string()
      .optional()
      .describe("Proposed new delivery date (ISO)"),
  }),
  execute: async ({ order_id, resolution_type, credit_amount, new_delivery_date }) => {
    const order = findOrder(order_id);
    if (!order) return { error: `Order ${order_id} not found` };
    const customer = customers[order.customer_id];
    const carrier = carriers[order.carrier_id];

    let script = "";
    switch (resolution_type) {
      case "reschedule_with_credit": {
        const credit = credit_amount ?? 75;
        const date = new_delivery_date ?? "in 2 business days";
        script = `Hi ${customer.name}, this is Wayfair calling about your ${order.item} scheduled for delivery today. We're seeing a delay with ${carrier.name} and wanted to get ahead of it for you. Your new estimated window is ${date} — I can confirm that, or offer you a $${credit} store credit. What works best?`;
        break;
      }
      case "declare_lost_and_reship": {
        const credit = credit_amount ?? 150;
        script = `Hi ${customer.name}, this is Wayfair calling about your ${order.item}. We've lost contact with your carrier and we're treating this as a lost shipment. We've already initiated a priority replacement — you'll receive it within 5 business days at no charge, plus a $${credit} credit. You don't need to do anything.`;
        break;
      }
      case "proactive_weather_warning": {
        const wx = weather[order.ship_zip];
        const alt = new_delivery_date ?? "later in the week";
        script = `Hi ${customer.name}, this is Wayfair calling ahead of your ${order.item} delivery on ${order.delivery_window}. We're monitoring ${wx?.forecast ?? "a weather system"} in your area that may affect your delivery window. Would you like to keep the ${order.delivery_window} date or move to ${alt} when conditions will be clear?`;
        break;
      }
      case "monitor":
        script = `(No outbound call — continue monitoring ${order_id}.)`;
        break;
    }

    return {
      order_id,
      resolution_type,
      customer_name: customer?.name,
      customer_phone: customer?.phone,
      credit_offered: credit_amount ?? null,
      proposed_date: new_delivery_date ?? null,
      call_script: script,
      status: "ready_to_call",
    };
  },
});

export const logInteraction = tool({
  description:
    "Append a record of an outbound contact attempt and its outcome so reps see it if the customer calls in.",
  inputSchema: z.object({
    order_id: z.string(),
    action: z
      .string()
      .describe("What the agent did, e.g. 'called customer, offered reschedule'"),
    outcome: z
      .string()
      .describe("Result, e.g. 'customer accepted $75 credit'"),
  }),
  execute: async ({ order_id, action, outcome }) => {
    const record: Interaction = {
      order_id,
      timestamp: new Date().toISOString(),
      action,
      outcome,
    };
    interactions.push(record);
    return { logged: true, record, total_interactions: interactions.length };
  },
});

export const chatTools = {
  getFlaggedOrders,
  getOrderDetail,
  assessRisk,
};

export const agentTools = {
  getFlaggedOrders,
  getOrderDetail,
  assessRisk,
  initiateResolution,
  logInteraction,
};
