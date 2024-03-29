"use strict";
const celery = require("../../dist");

const worker = celery.createWorker(
  "amqp://myuser:mypassword@localhost:5672",
  "amqp://myuser:mypassword@localhost:5672"
);
worker.register("tasks.error", (a, b) => {
  const c = {};
  c["a"]["b"];
  return a + b;
});

worker.register("tasks.add", (a, b) => {
  return a + b;
});
worker.start();
