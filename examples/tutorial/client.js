"use strict";
const celery = require("../../dist");

const client = celery.createClient(
  "amqp://myuser:mypassword@localhost:5672",
  "amqp://myuser:mypassword@localhost:5672"
);
// client.conf.TASK_PROTOCOL = 1;

try {
  const result = client.sendTask("tasks.add", [(1, 2)], {
    retry: true,
  });
  result.get().then((value) => {
    console.log(value); // Output: Promise resolved with a value
  });

  result.get().then((value) => {
    console.log(value); // Output: Promise resolved with a value
    client.disconnect();
  });
} catch (error) {
  console.log("Error", error);
}
