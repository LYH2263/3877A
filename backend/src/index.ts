import fs from "node:fs";
import path from "node:path";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { env } from "./config/env";
import { optionalAuth } from "./middleware/auth";
import { errorHandler } from "./middleware/error-handler";
import { notFound } from "./middleware/not-found";
import { authRouter } from "./modules/auth/auth.routes";
import { creatorRouter } from "./modules/creator/creator.routes";
import { discoveryRouter } from "./modules/discovery/discovery.routes";
import { postsRouter } from "./modules/posts/posts.routes";
import { searchRouter } from "./modules/search/search.routes";
import { settingsRouter } from "./modules/settings/settings.routes";
import { topicsRouter } from "./modules/topics/topics.routes";
import { usersRouter } from "./modules/users/users.routes";
import { messagesRouter } from "./modules/messages/messages.routes";
import { ok } from "./utils/response";

const app = express();

fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/uploads", express.static(path.resolve(env.UPLOAD_DIR)));

app.get("/health", (_req, res) => ok(res, { status: "ok", time: new Date().toISOString() }));

app.use("/api", optionalAuth);
app.use("/api/auth", authRouter);
app.use("/api", discoveryRouter);
app.use("/api", searchRouter);
app.use("/api", topicsRouter);
app.use("/api/posts", postsRouter);
app.use("/api/users", usersRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/creator", creatorRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${env.PORT}`);
});
