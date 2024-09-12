"use strict";
const celery = require("../../dist");

const worker = celery.createWorker(
  "amqp://myuser:mypassword@localhost:5672",
  "amqp://myuser:mypassword@localhost:5672"
);
worker.register("tasks.error", (a, b) => {
  try {
    const c = {};
    console.log("a", a);
    console.log("b", b);
    // if (a === 2) {
    //   c["a"]["b"];
    // }
    return a + b;
  } catch (error) {
    console.log("error", error);
  }
});

worker.register("tasks.add", (a, b) => {
  return a + b;
});
worker.start();
