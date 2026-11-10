FROM node:20-slim
RUN apt-get update && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json .
RUN npm i
COPY . .
RUN npx prisma generate && npm run build
EXPOSE 4000
CMD ["npm","start"]
