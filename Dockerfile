FROM node:12.6.0 as builder

WORKDIR /nos-tdf-to-slack

COPY package.json package-lock.json ./
RUN if [ "$(npm -v)" = "6.10.0" ]; \
  then npm install --only=production --silent; \
  else npx npm@6.10.0 install --only=production --silent; \
  fi

###############################################################################
# Runtime image                                                               #
###############################################################################
FROM node:12.6.0-slim

# Install https://github.com/Yelp/dumb-init so the server can be started properly.
RUN curl -sSL "https://github.com/Yelp/dumb-init/releases/download/v1.2.2/dumb-init_1.2.2_amd64" -o /usr/local/bin/dumb-init \
  && echo "37f2c1f0372a45554f1b89924fbb134fc24c3756efaedf11e07f599494e0eff9 */usr/local/bin/dumb-init" | sha256sum -c - \
  && chmod +x /usr/local/bin/dumb-init

# Never run as root
RUN groupadd -r nodejs && useradd -m -r -g nodejs nodejs
USER nodejs

WORKDIR /nos-tdf-to-slack
ENV NODE_ENV=production
ENTRYPOINT ["/usr/local/bin/dumb-init", "node", "index.js"]

COPY --from=builder /nos-tdf-to-slack ./
# Copy remaining files.
COPY ./ ./
