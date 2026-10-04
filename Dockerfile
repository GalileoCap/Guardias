FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY package.json ./
RUN mkdir /data && chown node /data
USER node
VOLUME /data
EXPOSE 3000
# el heap tope de 40 MB alcanza de sobra: el proceso guarda casi nada en memoria
CMD ["node", "--max-old-space-size=40", "server/index.mjs"]
