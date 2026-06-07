FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
