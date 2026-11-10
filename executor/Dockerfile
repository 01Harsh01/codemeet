FROM node:20-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY package.json .
RUN npm i --omit=dev
COPY index.js .
CMD ["node","index.js"]
