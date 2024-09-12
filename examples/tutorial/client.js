"use strict";
const celery = require("../../dist");

const client = celery.createClient(
  "amqp://myuser:mypassword@localhost:5672"
  // "amqp://myuser:mypassword@localhost:5672"
);
// client.conf.TASK_PROTOCOL = 1;

try {
  const result = client.sendTask("tasks.error", [(1, 2)], {
    retry: true,
    retryPolicy: {
      maxRetries: 3,
      intervalStart: 0.003,
      intervalMax: 30,
      intervalStep: 0.001,
    },
  });
  // result
  //   .get()
  //   .then((value) => {
  //     console.log(value); // Output: Promise resolved with a value
  //   })
  //   .catch((error) => {
  //     console.log("error", error);
  //   })
  //   .finally(() => {
  //     console.log("Finally");
  //   });

  // result.get().then((value) => {
  //   console.log(value); // Output: Promise resolved with a value
  //   client.disconnect();
  // });
  result
    .get()
    .then((value) => {
      console.log(value); // Output: Promise resolved with a value
    })
    .finally(() => {
      client.disconnect();
    });
} catch (error) {
  console.log("Error", error);
}
