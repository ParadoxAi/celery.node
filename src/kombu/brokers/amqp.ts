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
  connect: Promise<amqplib.Connection> | any;
  channel: Promise<amqplib.Channel>;
  queue: string;
  private maxRetries: number;
  private retryDelay: number;

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
    retryDelay = 1000 * 60 // 60 seconds = 1 minute
  ) {
    this.queue = queue;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    // this.isReconnecting = false;
    this.connect = this.initConnection(url, opts);
    this.channel = this.connect.then((conn) => (conn as any).createChannel());
  }

  /**
   * Creates a RabbitMQ connection with retry logic.
   * @param {string} url
   * @param {object} opts
   * @returns {Promise<amqplib.Connection>}
   */
  private async retryConnection(url: string, opts: object) {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        console.log(
          `[${new Date().toISOString()}] Attempting to connect to RabbitMQ (Attempt ${
            retries + 1
          }/${this.maxRetries})`
        );
        const connection = await amqplib.connect(url, opts);
        console.log(
          `[${new Date().toISOString()}] Retry Connected to RabbitMQ.`
        );
        this.connect = Promise.resolve(connection); // Create a new connection
        this.channel = connection.createChannel(); // Create a new channel
        return connection;
      } catch (err) {
        retries++;
        console.error(
          `[${new Date().toISOString()}] Connection attempt ${retries} failed: ${
            err.message
          }`
        );

        if (retries >= this.maxRetries) {
          console.error(`[${new Date().toISOString()}] Max retries reached.`);
          throw new Error(
            "Failed to connect to RabbitMQ after maximum retries."
          );
        }

        await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
      }
    }
    throw new Error("Connection retries exhausted.");
  }

  public async initConnection(
    url: string,
    opts: object
  ): Promise<amqplib.Connection | any> {
    const connection = await amqplib.connect(url, opts);

    connection.on("error", (err) => {
      this.retryConnection(url, opts);
    });

    connection.on("close", async () => {
      this.retryConnection(url, opts);
    });

    console.log(`Connected to RabbitMQ.`);

    return connection;
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
            .catch(reject);
        })
        .catch(reject);
    });
  }

  /**
   * @method AMQPBroker#disconnect
   * @returns {Promise} promises that continues if amqp disconnected.
   */
  public disconnect(): Promise<void> {
    return this.connect.then((conn) => conn.close());
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
      );
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
            throw new Error(
              `unsupported content type ${rawMsg.properties.contentType}`
            );
          }

          // now supports only utf-8 of content-encoding
          if (rawMsg.properties.contentEncoding !== "utf-8") {
            throw new Error(
              `unsupported content encoding ${rawMsg.properties.contentEncoding}`
            );
          }
          callback(new AMQPMessage(rawMsg));
        })
      );
  }
}
