import { config } from "./config.js";
import express from "express";
import { fileURLToPath } from "node:url";
import { requireAuth } from "./middleware/requireAuth.js";
import { authRouter } from "./routes/auth.js";
import { meetingsRouter } from "./routes/meetings.js";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "../public");
const meetingIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const app = express();

app.use(express.json());
app.use(express.static(publicDir));

app.use("/api/auth", authRouter);
app.use("/api/meetings", requireAuth, meetingsRouter);

app.get("/meetings/:meetingId", (req, res, next) => {
  const meetingId = req.params.meetingId;
  if (!meetingIdPattern.test(meetingId)) {
    next();
    return;
  }
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
});
