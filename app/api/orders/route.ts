import {
  orders,
  customers,
  carriers,
  weather,
  computeRiskScore,
} from "@/lib/tools";

export async function GET() {
  const hydrated = orders
    .map((o) => {
      const risk = computeRiskScore(o);
      return {
        order_id: o.order_id,
        item: o.item,
        item_value: o.item_value,
        delivery_window: o.delivery_window,
        days_since_last_scan: o.days_since_last_scan,
        tracking_checks_today: o.tracking_checks_today,
        is_overdue: o.is_overdue,
        days_overdue: o.days_overdue,
        customer: customers[o.customer_id],
        carrier: carriers[o.carrier_id],
        weather: weather[o.ship_zip],
        risk_score: risk.score,
        risk_level: risk.level,
        reasons: risk.reasons,
        triggers_call: risk.score >= 60,
      };
    })
    .sort((a, b) => b.risk_score - a.risk_score);

  return Response.json({ orders: hydrated });
}
