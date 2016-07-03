#!/bin/bash

set -e

# Build the initial image, from a non-slim base image.
docker build -t nos-tdf-to-slack-build -f build.Dockerfile .

# Create a fresh container from the newly built image.
docker rm nos-tdf-to-slack-build | true
docker create --name nos-tdf-to-slack-build nos-tdf-to-slack-build /bin/true

# Extract production dependencies and built app code from the container.
tmp=$(mktemp -d)
docker cp nos-tdf-to-slack-build:/app/node_modules/. - > ${tmp}/node_modules.tgz
docker cp nos-tdf-to-slack-build:/app/. - > ${tmp}/full.tgz

# Remove dependencies from the app code.
tar -c --exclude './node_modules' -f ${tmp}/app.tgz @${tmp}/full.tgz

# The full.tgz archive is not needed in the build context, remove to improve
# build performance.
rm ${tmp}/full.tgz

# Dockerfile needs to be in the build context directory.
cp Dockerfile ${tmp}

# Build the production image, based on a slim base image.
docker build -t nos-tdf-to-slack -f ${tmp}/Dockerfile ${tmp}

# Cleanup
docker rm nos-tdf-to-slack-build | true
rm -rf ${tmp}
