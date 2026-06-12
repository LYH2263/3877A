import path from "node:path";

const PORT = Number(process.env.PORT ?? 38771);

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT,
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:38772/social_discovery?schema=public",
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "access-secret-change-me",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "refresh-secret-change-me",
  ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN ?? "15m",
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN ?? "7d",
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), "uploads"),
  MEDIA_PUBLIC_PREFIX: process.env.MEDIA_PUBLIC_PREFIX ?? `http://localhost:${PORT}`
} as const;
