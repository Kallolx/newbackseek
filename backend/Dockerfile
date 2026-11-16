FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY migrations ./migrations
USER node
EXPOSE 4000
CMD ["npm", "start"]
