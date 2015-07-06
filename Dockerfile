FROM iojs:2.3.3

WORKDIR /app
CMD ["node", "index.js"]

RUN npm install -g npm@v3.x-next

COPY package.json npm-shrinkwrap.json ./
RUN npm install

COPY ./ ./
