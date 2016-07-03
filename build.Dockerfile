FROM node:6.2.2

WORKDIR /app
COPY package.json npm-shrinkwrap.json ./
RUN npm install --silent

COPY index.js ./
