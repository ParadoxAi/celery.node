import Client from "./app/client";
import Worker from "./app/worker";
import { CeleryConf, defaultConf } from "./app/conf";
/**
 * @description Basic function for creating celery client
 *
 * @function
 * @returns {Client}
 */
export function createClient(
  broker = "amqp://",
  backend = "amqp://",
  queue = "media",
  conf: CeleryConf = defaultConf()
): Client {
  return new Client(broker, backend, queue, conf);
}

/**
 * @description Basic function for creating celery worker
 *
 * @function
 * @returns {Worker}
 */
export function createWorker(
  broker = "amqp://",
  backend = "amqp://",
  queue = "media",
  conf: CeleryConf = defaultConf()
): Worker {
  return new Worker(broker, backend, queue, conf);
}
