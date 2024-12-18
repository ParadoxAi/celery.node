"use strict";
const celery = require("../../dist");
const conf = {
  CELERY_QUEUE: "media2222",
  CELERY_BROKER_OPTIONS: {
    maxRetries: 300,
    initialRetryDelay: 1000, // 60 seconds = 1 minute
  },
};
const worker = celery.createWorker(
  "amqp://myuser:mypassword@localhost:5672",
  null,
  conf.CELERY_QUEUE,
  conf
);

worker.setOnFailed((messageOnFailed) => {
  console.log("setOnFailed");
  console.log("setOnFailed - taskName222", messageOnFailed.taskName);
  console.log("setOnFailed - taskId22", messageOnFailed.taskId);
  console.log("setOnFailed - body222", messageOnFailed.body);
  console.log("setOnFailed - err222", messageOnFailed.error);
});
worker.register("tasks.error", (a) => {
  try {
    const c = {};
    console.log("a", a);
    if (a === 2) {
      c["a"]["b"];
    }
    return a + 1;
  } catch (error) {
    console.log("error", error);
  }
});

worker.register("tasks.error2", (a) => {
  const c = {};
  console.log("a", a);
  if (a["13"] == "34") {
    c["a"]["b"];
  }
  return a + 1;
});

worker.register("tasks.add", (a, b) => {
  if (a === 2) {
    c["a"]["b"];
  }
  return a + b;
});
async function runWorker() {
  try {
    const success = await worker.start();
    if (success) {
      console.log("Worker started successfully.");
    } else {
      console.log("Worker failed to start.");
    }
  } catch (error) {
    console.error("Unexpected error:", error);
  }
}

runWorker();
