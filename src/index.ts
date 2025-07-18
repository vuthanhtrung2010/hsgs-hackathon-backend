import("dotenv/config");
import express from "express";
import cors from "cors";
import { logger, log } from "./logger";

const app = express();
app.use(express.json());
app.use(cors());

// Route imports
import rankingRoutes from "./routes/ranking";
import syncRoutes from "./routes/sync";
import clusterRoutes from "./routes/cluster";
import quizRoutes from "./routes/quiz";
import userRoutes from "./routes/user";
import cronRoutes from "./routes/cron";
import logRoutes from "./routes/log";
import healthRoutes from "./routes/health";

// Route mapping
app.use("/ranking", rankingRoutes);
app.use("/sync", syncRoutes);
app.use("/clusters", clusterRoutes);
app.use("/quizzes", quizRoutes);
app.use("/users", userRoutes);
app.use("/cron", cronRoutes);
app.use("/log", logRoutes);
app.use("/health", healthRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    log.info(`🚀 Student Rating System Backend started`);
    log.info(`📡 Server listening on PORT: ${PORT}`);
    log.info(`📊 Log level: ${['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'][logger.getLevel()]}`);
    log.info(`⏰ Cron job scheduled to run every 45 minutes`);
    log.info(`🎯 Available endpoints:`);
    log.info(`   • GET  /health - Health check`);
    log.info(`   • GET  /ranking - Overall rankings`);
    log.info(`   • GET  /sync/status - Sync system status`);
    log.info(`   • POST /sync - Manual sync trigger`);
});