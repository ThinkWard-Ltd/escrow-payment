FROM node:15

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

# Copy local code to the container image.
COPY . ./

RUN npm run build

EXPOSE 8080
CMD [ "npm", "start" ]