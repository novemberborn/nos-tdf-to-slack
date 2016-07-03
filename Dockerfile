FROM node:6.2.2-slim

WORKDIR /app
ENV NODE_ENV=production
CMD ["node", "index.js"]

ADD node_modules.tgz ./node_modules/
ADD app.tgz ./
