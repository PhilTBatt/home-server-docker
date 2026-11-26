FROM node:26-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc && node dist/fetch-model-run.js /app/models/silero_vad.onnx && node dist/fetch-model-run.js /app/models/voice-id.onnx voice && npm prune --omit=dev && cd node_modules/onnxruntime-node/bin/napi-v6 && rm -rf win32 darwin && find linux -mindepth 1 -maxdepth 1 ! -name "$(node -p process.arch)" -exec rm -rf {} +

FROM node:26-trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends alsa-utils && rm -rf /var/lib/apt/lists/*
ENV ORT_DISABLE_TELEMETRY=1
WORKDIR /app
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/models ./models
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/main.js"]
