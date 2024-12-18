const amqp = require("amqplib");
const axios = require("axios");

const RABBITMQ_URL = "amqp://myuser:mypassword@localhost:5672";
const HTTP_API_URL = "http://localhost:15672/api/queues";
const AUTH = {
  username: "myuser",
  password: "mypassword",
};

async function listQueues() {
  try {
    const response = await axios.get(HTTP_API_URL, { auth: AUTH });
    const queues = response.data;

    if (queues.length === 0) {
      console.log("No queues found.");
    } else {
      console.log("Queues:");
      queues.forEach((queue) => {
        console.log(`Queue name: ${queue.name}`);
      });
    }
  } catch (error) {
    console.error(`Error listing queues: ${error.message}`);
  }
}

async function deleteQueue(queueName) {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();

  try {
    // Delete the queue
    await channel.deleteQueue(queueName, { ifUnused: false, ifEmpty: false });
    console.log(`Queue "${queueName}" deleted successfully.`);
  } catch (error) {
    console.error(`Failed to delete queue: ${error.message}`);
  } finally {
    await channel.close();
    await connection.close();
  }
}

async function main() {
  await listQueues(); // List queues first

  // Specify the queue name you want to delete
  const queuesName = [
    "d9bc5442ee514474b9229b59cdb30e24",
    "d60f0c7f5f8e47f99d543fcffdec06c7",
    "71ef8ec11b2f413daf2b121919307b03",
    "dbecb32ff7cc4720abacc6171f8736e5",
  ];
  for (const element of queuesName) {
    await deleteQueue(element);
  }
  // Delete the specified queue
}

main();
