# syntax=docker/dockerfile:1
#
# platebunken-server. ARCHITECTURE.md §3.1.
#
#   docker compose up -d --build
#
# Two things make this image small and dull, and both are deliberate:
#
#   1. There are NO runtime dependencies. Not "few" — none. The store is `node:sqlite`, the
#      server is `node:http`, and the Music Assistant client is the global WebSocket. So the
#      runtime stage carries no node_modules at all, and there is no supply chain to audit or
#      to patch at 11pm. §5.1 made that choice for the database; it turned out to hold for the
#      whole server.
#
#   2. There is no compile step for the server. Node strips the types and runs the .ts files
#      directly, so what is deployed is what is in the repo — no dist/ of compiled server code
#      to drift out of step with its source. Only the PAGE is built, because a browser cannot
#      do the same.
#
# No credential is ever baked in. There is no ENV for a token and no COPY of .env: a layer is
# public the moment the image is, and `docker history` reads it back. Secrets arrive at run
# time through compose's `env_file:`. The test for this image is that it could be published
# without redacting anything.

# ── build the page ────────────────────────────────────────────────────────
FROM node:26-alpine AS build
WORKDIR /app

# Dependencies first, so editing a source file does not re-resolve the whole tree.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY prototypes ./prototypes

# Fail the build on a type error rather than shipping it. This is the only place the check
# is enforced automatically, and the page is the half that cannot be fixed by restarting.
RUN npm run typecheck && npm run build


# ── run ───────────────────────────────────────────────────────────────────
FROM node:26-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    PUBLIC_DIR=/app/dist/public \
    DATABASE_PATH=/data/platebunken.sqlite

# The server's own source, and the built page. No node_modules: see above.
COPY package.json ./
COPY src ./src
COPY --from=build /app/dist/public ./dist/public

# The store's directory, owned by the unprivileged user the process runs as. A named volume
# mounted here on first creation inherits this ownership, which is what stops the container
# coming up unable to write the one file that matters.
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

USER node
EXPOSE 8080

# Ask the app, not the port. A container whose socket is open but whose store will not open
# is a container that must not be reported healthy: it serves an empty crate, which looks to
# a four-year-old exactly like all of his music being gone.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form, so the process is PID 1 and receives SIGTERM directly — index.ts closes the
# store on it rather than being SIGKILLed mid-write ten seconds later.
CMD ["node", "src/server/index.ts"]
