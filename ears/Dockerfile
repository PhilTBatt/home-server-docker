FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:26-alpine
WORKDIR /app
COPY package.json ./
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/main.js"]
