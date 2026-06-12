FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm config set registry https://registry.npmmirror.com

RUN mkdir -p /app/uploads

EXPOSE 38771

CMD ["sh", "-c", "pnpm install --no-frozen-lockfile && pnpm prisma generate && pnpm exec prisma db push && pnpm exec prisma db seed && pnpm dev"]
