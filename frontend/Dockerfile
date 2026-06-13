FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN pnpm config set registry https://registry.npmmirror.com

ENV FRONTEND_PORT=3000

EXPOSE 3000

CMD ["sh", "-c", "pnpm install --no-frozen-lockfile && pnpm exec vite --host 0.0.0.0 --port ${FRONTEND_PORT:-3000}"]
