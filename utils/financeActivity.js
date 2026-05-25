const FinanceActivity = require("../models/FinanceActivity");
const { broadcast } = require("./broadcast");

function getActorName(req) {
  if (!req || !req.user) return "System";
  if (typeof req.user.name === "string" && req.user.name.trim())
    return req.user.name.trim();
  if (typeof req.user.email === "string" && req.user.email.trim())
    return req.user.email.trim();
  if (typeof req.user.role === "string") return req.user.role;
  return "User";
}

async function recordFinanceActivity(
  req,
  { type, title, subtitle, icon, metadata }
) {
  if (!req || !req.user) return null;
  const payload = {
    type,
    title: String(title || "").trim() || "Finance update",
    subtitle: subtitle != null ? String(subtitle).trim() : "",
    icon: icon != null ? String(icon).trim() : "banknote",
    performedBy: getActorName(req),
    metadata: metadata || {},
  };
  try {
    const doc = await FinanceActivity.create(payload);

    // Broadcast real-time notification to all connected WebSocket clients
    broadcast({
      type,
      data: {
        title: payload.title,
        subtitle: payload.subtitle,
        createdAt: doc.createdAt,
        ...metadata,
      },
    });

    return doc;
  } catch (err) {
    console.error("Failed to record finance activity:", err);
    return null;
  }
}

module.exports = {
  recordFinanceActivity,
};

