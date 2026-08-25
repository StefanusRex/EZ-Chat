FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.html styles.css app.js server.js ./
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget --spider -q http://127.0.0.1:8080/ || exit 1
CMD ["npm", "start"]
