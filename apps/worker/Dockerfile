# Build reproduzível das dependências de produção, sem ferramentas de teste na imagem final.
FROM node:22-alpine AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --prod --frozen-lockfile

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production HEALTH_PORT=3001
COPY --from=dependencies --chown=node:node /app /app
COPY --chown=node:node scripts ./scripts
USER node
EXPOSE 3001
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--import","tsx","scripts/start.ts","worker"]
