FROM apify/actor-node:22

COPY package*.json ./
RUN npm install --include=dev --omit=dev

COPY . .

CMD npm run start
