"use strict";
const celery = require("../../dist");
try {
  const celeryWorker = celery.createWorker(
    "amqp://myuser:mypassword@localhost:5672",
    "amqp://myuser:mypassword@localhost:5672"
  );

  celeryWorker.register("video_conversion", async (name, frames) => {
    console.log(`video_conversion ${name} start`);
    for (let i = 0; i < frames; i++) {
      await new Promise((resolve, reject) => {
        setTimeout(resolve, Math.random * 100);
      });
      console.log(`frame: ${i} done`);
    }
    console.log(`video_conversion ${name} done`);
    return {
      name,
      frames,
    };
  });
  celeryWorker.start();
} catch (error) {
  console.log("error", error);
}
