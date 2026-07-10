require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const http = require("http");
const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const { attachWss, broadcast } = require("./utils/broadcast");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 5001;

/** Allow typical home/LAN dev URLs (new Wi‑Fi = new IP; no need to edit this each time). */

function isPrivateLanOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;

  try {
    const u = new URL(origin);
    if (u.protocol !== "http:") return false;
    const h = u.hostname;
    if (h === "localhost" || h === "127.0.0.1") return true;
    const parts = h.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  } catch {
    return false;
  }
}

const fixedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://10.190.40.206:3000",

  "http://localhost:8081",
  "https://levitica-mangement.netlify.app",
  "https://levitica-data-management.vercel.app",
];

/** Extra origins from env: ALLOWED_ORIGINS=a.com,b.com or single FRONTEND_URL */

function envOriginsList() {
  const raw = process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isVercelPreviewOrigin(origin) {
  try {
    const host = new URL(origin).hostname;
    return host === "vercel.app" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

// Configure CORS for production hosts + same Wi‑Fi / LAN (192.168.x.x, 10.x.x.x, etc.)
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (fixedOrigins.includes(origin)) return cb(null, true);
    if (envOriginsList().includes(origin)) return cb(null, true);
    if (isPrivateLanOrigin(origin)) return cb(null, true);
    if (isVercelPreviewOrigin(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());

// Root — quick check that the HTTP server is up (independent of MongoDB)
app.get("/", (req, res) => {
  res.type("text/plain").send("API is running");
});

// Serve uploaded profile photos
app.use("/api/uploads", express.static(path.join(__dirname, "uploads")));

// Health check – confirms backend is running
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Backend is running" });
});

app.get("/api/debug-deals", async (req, res) => {
  try {
    const Deal = require("./models/Deal");
    const deals = await Deal.find({}).populate('owner', 'name role').lean();
    res.json(deals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DB health — use on Render to confirm the same MongoDB database name as local (login users live here)
app.get("/api/health/db", (req, res) => {
  const ready = mongoose.connection.readyState;
  const labels = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  res.json({
    mongoState: labels[ready] ?? ready,
    dbName: mongoose.connection.name || null,
    hint:
      ready === 1
        ? "Login uses this dbName; users must exist in the `users` collection."
        : "MongoDB not connected — check MONGODB_URI on Render.",
  });
});

/** OAuth redirect target for `npm run google:auth` — shows `code` when Google redirects here */
app.get("/api/v1/auth/google-url", (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const logAuth = (msg) => {
      fs.appendFileSync(path.join(__dirname, "auth_logs.txt"), `[${new Date().toISOString()}] ${msg}\n`, "utf8");
    };
    logAuth("Visited /api/v1/auth/google-url");

    const { google } = require("googleapis");
    const { trimEnv } = require("./services/googleDriveService");
    const oauth2Client = new google.auth.OAuth2(
      trimEnv(process.env.GOOGLE_CLIENT_ID),
      trimEnv(process.env.GOOGLE_CLIENT_SECRET),
      trimEnv(process.env.GOOGLE_REDIRECT_URI)
    );
    const SCOPES = ["https://www.googleapis.com/auth/drive"];
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
    });
    logAuth(`Redirecting to: ${authUrl}`);
    return res.redirect(authUrl);
  } catch (ex) {
    const fs = require("fs");
    const path = require("path");
    fs.appendFileSync(path.join(__dirname, "auth_logs.txt"), `[${new Date().toISOString()}] Error in google-url: ${ex.stack || ex.message}\n`, "utf8");
    return res.status(500).send(`Error generating URL: ${ex.message}`);
  }
});

/** OAuth redirect target — automatically exchanges code and updates .env file */
app.get("/oauth2callback", async (req, res) => {
  const fs = require("fs");
  const path = require("path");
  const logAuth = (msg) => {
    fs.appendFileSync(path.join(__dirname, "auth_logs.txt"), `[${new Date().toISOString()}] ${msg}\n`, "utf8");
  };

  const err = typeof req.query.error === "string" ? req.query.error : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  logAuth(`Callback received. Error: "${err}", Code length: ${code ? code.length : 0}`);

  if (err) {
    logAuth(`Callback error: ${err}`);
    return res
      .status(400)
      .type("html")
      .send(`<html><body><h2>OAuth error</h2><p>${err}</p></body></html>`);
  }
  if (!code) {
    logAuth("Callback error: No code");
    return res
      .type("html")
      .send(
        "<html><body><h2>No authorization code found</h2><p>Please launch the flow from <a href='/api/v1/auth/google-url'>here</a>.</p></body></html>"
      );
  }

  try {
    const { google } = require("googleapis");
    const fsPath = require("path");
    const { trimEnv } = require("./services/googleDriveService");

    const oauth2Client = new google.auth.OAuth2(
      trimEnv(process.env.GOOGLE_CLIENT_ID),
      trimEnv(process.env.GOOGLE_CLIENT_SECRET),
      trimEnv(process.env.GOOGLE_REDIRECT_URI)
    );

    logAuth("Exchanging code for tokens...");
    const { tokens } = await oauth2Client.getToken(code);
    logAuth(`Tokens received: ${Object.keys(tokens).join(", ")}`);

    if (!tokens.refresh_token) {
      logAuth("No refresh token returned. User must revoke permissions and try again.");
      return res.type("html").send(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:640px;margin:2rem auto;">
        <h2 style="color:red;">Failed to get Refresh Token</h2>
        <p>Google did not return a refresh token. This usually happens if you already authorized the app once. To fix this:</p>
        <ol>
          <li>Go to <a href="https://myaccount.google.com/permissions" target="_blank">Google Third-party apps access</a></li>
          <li>Find your app and click **Remove Access** / **Revoke**</li>
          <li>Go back to <a href="/api/v1/auth/google-url">Google Login URL</a> and authorize again.</li>
        </ol>
        </body></html>`
      );
    }

    // Write to .env file
    const envPath = fsPath.join(__dirname, ".env");
    let envContent = fs.readFileSync(envPath, "utf8");
    if (envContent.includes("GOOGLE_REFRESH_TOKEN=")) {
      envContent = envContent.replace(
        /GOOGLE_REFRESH_TOKEN=.*/,
        `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`
      );
    } else {
      envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
    }
    fs.writeFileSync(envPath, envContent, "utf8");
    logAuth("Successfully wrote GOOGLE_REFRESH_TOKEN to .env");

    return res.type("html").send(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:640px;margin:2rem auto;">
      <h2 style="color:green;">Success! Google Drive Authenticated</h2>
      <p>The new refresh token has been successfully written to your <code>.env</code> file:</p>
      <pre style="background:#f4f4f4;padding:12px;word-break:break-all;">GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}</pre>
      <h3 style="color:#e67e22;">CRITICAL STEP: Restart the backend server now!</h3>
      <p>Press <code>Ctrl + C</code> in your backend command prompt / terminal, and run <code>npm start</code> again to apply the changes.</p>
      </body></html>`
    );
  } catch (ex) {
    logAuth(`Error exchanging code: ${ex.stack || ex.message}`);
    return res.status(500).type("html").send(
      `<!DOCTYPE html><html><body><h2>Error Exchanging Code</h2><pre style="color:red;">${ex.stack || ex.message}</pre></body></html>`
    );
  }
});

const { verifyToken, adminOrHRManagement } = require("./middleware/auth");
const asyncHandler = require("express-async-handler");
const { requireFinanceOrAdmin } = require("./middleware/roles");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const candidateRoutes = require("./routes/candidates");
const leadsRoutes = require("./routes/leads");
const contactsRoutes = require("./routes/contacts");
const companiesRoutes = require("./routes/companies");
const dealsRoutes = require("./routes/deals");
const activitiesRoutes = require("./routes/activities");
const tasksRoutes = require("./routes/tasks");
const documentsRoutes = require("./routes/documents");
const importRoutes = require("./routes/import");
const reportsRoutes = require("./routes/reports");
const adminRoutes = require("./routes/admin");
const teamRoutes = require("./routes/team");
const invoicesRoutes = require("./routes/invoices");
const expensesRoutes = require("./routes/expenses");
const paymentsRoutes = require("./routes/payments");
const financeReportsRoutes = require("./routes/financeReports");
const financeRoutes = require("./routes/finance");
const hrRoutes = require("./routes/hr");
const trainingFeesRoutes = require("./routes/trainingFees");
const onboardingRoutes = require("./routes/onboarding");
const onboardingController = require("./controllers/onboardingController");
const uploadController = require("./controllers/uploadController");
const {
  runOnboardingUpload,
  runOfferLetterUpload,
} = require("./middleware/onboardingUpload");
const { runDriveMultipart } = require("./middleware/driveUpload");
const invoiceController = require("./controllers/invoiceController");

app.get("/finance/pay/:invoiceNo", asyncHandler(invoiceController.payInvoice));
app.get("/finance/stripe/success", asyncHandler(invoiceController.stripeSuccess));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/candidates", candidateRoutes);
app.use("/api/hr", hrRoutes);
app.use("/api/training-fees", trainingFeesRoutes);
app.use("/api/onboarding", onboardingRoutes);
/** Spec paths at server root (same handlers as /api/onboarding/*) */
app.post(
  "/send-invite",
  verifyToken,
  adminOrHRManagement,
  asyncHandler(onboardingController.sendInvite)
);
app.post(
  "/send-offer-letter",
  verifyToken,
  adminOrHRManagement,
  runOfferLetterUpload,
  asyncHandler(onboardingController.sendOfferLetter)
);
app.get("/validate-token", asyncHandler(onboardingController.validateToken));
app.post(
  "/submit",
  runOnboardingUpload,
  asyncHandler(onboardingController.submitOnboarding)
);

/** Authenticated: upload file(s) to Google Drive under CandidateUploads (optional subfolder) */
app.post(
  "/upload",
  verifyToken,
  runDriveMultipart,
  asyncHandler(uploadController.uploadToDrive)
);
app.post(
  "/api/upload",
  verifyToken,
  runDriveMultipart,
  asyncHandler(uploadController.uploadToDrive)
);

// Protected API routes — verifyToken applied at app level
app.use("/api/v1/leads", verifyToken, leadsRoutes);
app.use("/api/v1/contacts", verifyToken, contactsRoutes);
app.use("/api/v1/companies", verifyToken, companiesRoutes);
app.use("/api/v1/deals", verifyToken, dealsRoutes);
app.use("/api/v1/activities", verifyToken, activitiesRoutes);
app.use("/api/v1/tasks", verifyToken, tasksRoutes);
app.use("/api/v1/documents", verifyToken, documentsRoutes);
app.use("/api/v1/import", verifyToken, importRoutes);
app.use("/api/v1/reports", verifyToken, reportsRoutes);
app.use("/api/v1/admin", verifyToken, adminRoutes);
app.use("/api/v1/team", verifyToken, teamRoutes);
app.use(
  "/api/v1/finance/invoices",
  verifyToken,
  requireFinanceOrAdmin,
  invoicesRoutes
);
app.use(
  "/api/v1/finance/expenses",
  verifyToken,
  requireFinanceOrAdmin,
  expensesRoutes
);
app.use(
  "/api/v1/finance/payments",
  verifyToken,
  requireFinanceOrAdmin,
  paymentsRoutes
);
app.use(
  "/api/v1/finance/reports",
  verifyToken,
  requireFinanceOrAdmin,
  financeReportsRoutes
);
app.use("/api/finance", verifyToken, requireFinanceOrAdmin, financeRoutes);
app.use("/api/v1/finance", verifyToken, requireFinanceOrAdmin, financeRoutes);

// 404 — no route matched
app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

// Error handler — standard 500 response
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

async function start() {
  await connectDB();

  // Migrate any existing users from Sales Rep to Sales Representative
  try {
    const User = require("./models/User");
    const result = await User.updateMany(
      { role: "Sales Rep" },
      { $set: { role: "Sales Representative" } }
    );
    if (result.modifiedCount > 0) {
      console.log(`Migrated ${result.modifiedCount} users from Sales Rep to Sales Representative`);
    }
  } catch (err) {
    console.error("Error migrating roles:", err);
  }

  // Run onboarding synchronization
  try {
    const { syncAllOnboardingToCandidates } = require("./controllers/onboardingController");
    await syncAllOnboardingToCandidates();
  } catch (syncErr) {
    console.error("Failed to run onboarding candidates sync:", syncErr);
  }

  // Create HTTP server from express app so we can share the port with WebSocket
  const server = http.createServer(app);

  // Attach WebSocket server — clients connect to ws://<host>:<PORT>/ws
  let WebSocketServer;
  try {
    ({ WebSocketServer } = require("ws"));
  } catch (_) {
    // 'ws' package not installed — real-time notifications will not work.
    // Run: npm install ws
    console.warn("[ws] package not found — WebSocket notifications disabled. Run: npm install ws");
  }

  if (WebSocketServer) {
    const wss = new WebSocketServer({ server });
    attachWss(wss);

    wss.on("connection", (ws, req) => {
      // Send a welcome ping so the client knows the socket is alive
      try {
        ws.send(JSON.stringify({ type: "connected", message: "Levitica notification socket ready" }));
      } catch (_) { }

      ws.on("error", () => { });
    });

    console.log(`[ws] WebSocket server active on ws://localhost:${PORT}`);
  }

  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error(
    "Failed to start server:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});

module.exports = { broadcast };
