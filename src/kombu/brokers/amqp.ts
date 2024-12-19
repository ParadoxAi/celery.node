import * as amqplib from "amqplib";
import { CeleryBroker } from ".";
import { Message } from "../message";

class AMQPMessage extends Message {
  constructor(payload: amqplib.ConsumeMessage) {
    super(
      payload.content,
      payload.properties.contentType,
      payload.properties.contentEncoding,
      payload.properties,
      payload.properties.headers
    );
  }
}

export default class AMQPBroker implements CeleryBroker {
  connect: Promise<amqplib.Connection>;
  channel: Promise<amqplib.Channel>;
  queue: string;
  private maxRetries: number;
  private retryDelay: number;
  private isReconnecting: boolean;

  /**
   * AMQP broker class
   * @constructor AMQPBroker
   * @param {string} url the connection string of amqp
   * @param {object} opts the options object for amqp connect of amqplib
   * @param {string} queue optional. the queue to connect to.
   * @param {number} maxRetries optional. Maximum number of retries for reconnecting.
   * @param {number} retryDelay optional. Delay in milliseconds between retries.
   */
  constructor(
    url: string,
    opts: object,
    queue = "media",
    maxRetries = 600,
    retryDelay = 6000 * 10 // 60 seconds = 1 minute
  ) {
    this.queue = queue;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    this.isReconnecting = false;
    this.connect = this.createConnection(url, opts);
    this.channel = this.connect.then((conn) => conn.createChannel());
    this.setupConnectionListeners(url, opts);
  }

  /**
   * Generates the current timestamp for logs
   * @returns {string} The current timestamp in ISO format
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Creates a RabbitMQ connection with retry logic.
   * @param {string} url
   * @param {object} opts
   * @returns {Promise<amqplib.Connection>}
   */
  private async createConnection(
    url: string,
    opts: object
  ): Promise<amqplib.Connection> {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        console.log(
          `[${this.getTimestamp()}] Attempting to connect to RabbitMQ (Attempt ${retries +
            1}/${this.maxRetries})`
        );
        const connection = await amqplib.connect(url, opts);
        console.log(`[${this.getTimestamp()}] Connected to RabbitMQ.`);
        return connection;
      } catch (err) {
        retries++;
        console.error(
          `[${this.getTimestamp()}] Connection attempt ${retries} failed: ${
            err.message
          }`
        );

        if (retries >= this.maxRetries) {
          console.error(`[${this.getTimestamp()}] Max retries reached.`);
          throw new Error(
            "Failed to connect to RabbitMQ after maximum retries."
          );
        }

        console.log(
          `[${this.getTimestamp()}] Retrying in ${this.retryDelay /
            1000} seconds... (${retries}/${this.maxRetries} attempts)`
        );

        // Wait for the retry delay to complete
        await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
      }
    }
    throw new Error("Connection retries exhausted.");
  }

  /**
   * Setup event listeners for reconnecting logic
   */
  private setupConnectionListeners(url: string, opts: object) {
    this.connect.then((connection) => {
      // Listen to connection loss
      connection.on("close", (err) => {
        if (err) {
          console.error(
            `[${this.getTimestamp()}] RabbitMQ connection error: ${err.message}`
          );
        } else {
          console.error(
            `[${this.getTimestamp()}] RabbitMQ connection closed unexpectedly.`
          );
        }
        if (!this.isReconnecting) {
          this.isReconnecting = true;
          this.reconnect(url, opts);
        }
      });
    });
  }

  /**
   * Reconnect to RabbitMQ when the connection is lost
   * @param {string} url
   * @param {object} opts
   */
  private async reconnect(url: string, opts: object) {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        console.log(`[${this.getTimestamp()}] Reconnecting to RabbitMQ...`);
        this.connect = this.createConnection(url, opts); // Create a new connection
        this.channel = this.connect.then((conn) => conn.createChannel()); // Create a new channel
        await this.isReady(); // Ensure the connection is ready
        console.log(`[${this.getTimestamp()}] Reconnected to RabbitMQ.`);
        this.isReconnecting = false; // Reset reconnect flag
        break;
      } catch (err) {
        retries++;
        console.error(
          `[${this.getTimestamp()}] Reconnect attempt ${retries} failed: ${
            err.message
          }`
        );

        if (retries >= this.maxRetries) {
          console.error(`[${this.getTimestamp()}] Max retries reached.`);
          throw new Error(
            "Failed to reconnect to RabbitMQ after maximum retries."
          );
        }

        // Log every 10 seconds during the retry process
        let retryLogInterval = setInterval(() => {
          console.log(
            `[${this.getTimestamp()}] Retrying in ${this.retryDelay /
              1000} seconds... (${retries}/${this.maxRetries} attempts)`
          );
        }, 10000); // Log every 10 seconds

        // Wait for the retry delay to complete
        await new Promise((resolve) => setTimeout(resolve, this.retryDelay));

        // Clear the interval after retrying
        clearInterval(retryLogInterval);
      }
    }
  }

  /**
   * @method AMQPBroker#isReady
   * @returns {Promise} promises that continues if amqp connected.
   */
  public isReady(): Promise<amqplib.Channel> {
    return new Promise((resolve, reject) => {
      this.channel
        .then((ch) => {
          Promise.all([
            ch.assertExchange("default", "direct", {
              durable: true,
              autoDelete: true,
              internal: false,
            }),
            ch.assertQueue(this.queue, {
              durable: true,
              autoDelete: false,
              exclusive: false,
            }),
          ])
            .then(() => resolve(ch))
            .catch((err) => {
              console.error(
                `[${this.getTimestamp()}] Failed to assert exchange/queue: ${
                  err.message
                }`
              );
              reject(err);
            });
        })
        .catch((err) => {
          console.error(
            `[${this.getTimestamp()}] Channel error: ${err.message}`
          );
          reject(err);
        });
    });
  }

  /**
   * @method AMQPBroker#disconnect
   * @returns {Promise} promises that continues if amqp disconnected.
   */
  public disconnect(): Promise<void> {
    return this.connect
      .then((conn) => {
        console.log(`[${this.getTimestamp()}] Disconnecting from RabbitMQ.`);
        return conn.close();
      })
      .catch((err) => {
        console.error(
          `[${this.getTimestamp()}] Error during disconnect: ${err.message}`
        );
        throw err;
      });
  }

  /**
   * @method AMQPBroker#publish
   *
   * @returns {Promise}
   */
  public publish(
    body: object | [Array<any>, object, object],
    exchange: string,
    routingKey: string,
    headers: object,
    properties: object
  ): Promise<boolean> {
    const messageBody = JSON.stringify(body);
    const contentType = "application/json";
    const contentEncoding = "utf-8";

    return this.channel
      .then((ch) =>
        ch
          .assertQueue(routingKey, {
            durable: true,
            autoDelete: false,
            exclusive: false,
          })
          .then(() => Promise.resolve(ch))
      )
      .then((ch) =>
        ch.publish(exchange, routingKey, Buffer.from(messageBody), {
          contentType,
          contentEncoding,
          headers,
          deliveryMode: 2,
          ...properties,
        })
      )
      .catch((err) => {
        console.error(
          `[${this.getTimestamp()}] Error publishing message: ${err.message}`
        );
        throw err;
      });
  }

  /**
   * @method AMQPBroker#subscribe
   * @param {String} queue
   * @param {Function} callback
   * @returns {Promise}
   */
  public subscribe(
    queue: string,
    callback: (message: Message) => void
  ): Promise<amqplib.Replies.Consume> {
    return this.channel
      .then((ch) =>
        ch
          .assertQueue(queue, {
            durable: true,
            autoDelete: false,
            exclusive: false,
          })
          .then(() => Promise.resolve(ch))
      )
      .then((ch) =>
        ch.consume(queue, (rawMsg) => {
          ch.ack(rawMsg);

          // now supports only application/json of content-type
          if (rawMsg.properties.contentType !== "application/json") {
            console.error(
              `[${this.getTimestamp()}] Unsupported content type: ${
                rawMsg.properties.contentType
              }`
            );
            throw new Error(
              `unsupported content type ${rawMsg.properties.contentType}`
            );
          }

          // now supports only utf-8 of content-encoding
          if (rawMsg.properties.contentEncoding !== "utf-8") {
            console.error(
              `[${this.getTimestamp()}] Unsupported content encoding: ${
                rawMsg.properties.contentEncoding
              }`
            );
            throw new Error(
              `unsupported content encoding ${rawMsg.properties.contentEncoding}`
            );
          }

          callback(new AMQPMessage(rawMsg));
        })
      )
      .catch((err) => {
        console.error(
          `[${this.getTimestamp()}] Error in subscription: ${err.message}`
        );
        throw err;
      });
  }
}
