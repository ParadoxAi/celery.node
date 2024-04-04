"use strict";
const celery = require("../../dist");

const client = celery.createClient(
  "amqp://myuser:mypassword@localhost:5672",
  "amqp://myuser:mypassword@localhost:5672"
);
// client.conf.TASK_PROTOCOL = 1;

const task = client.createTask("delay_job");

async function main() {
  const result = task.applyAsync();
  const data = await result.get();
  console.log(data);
  await client.disconnect();
}

main();
