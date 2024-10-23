import Base from "./base";
import { Message } from "../kombu/message";

export default class Worker extends Base {
  handlers: object = {};
  activeTasks: Set<Promise<any>> = new Set();
  onFailed: ((messageOnFailed) => void) | null = null;

  /**
   * Register task handler on worker handlers
   * @method Worker#register
   * @param {String} name the name of task for dispatching.
   * @param {Function} handler the function for task handling
   *
   * @example
   * worker.register('tasks.add', (a, b) => a + b);
   * worker.start();
   */
  public register(name: string, handler: Function): void {
    if (!handler) {
      throw new Error("Undefined handler");
    }
    if (this.handlers[name]) {
      throw new Error("Handler is already set");
    }

    this.handlers[name] = function registHandler(...args: any[]): Promise<any> {
      try {
        return Promise.resolve(handler(...args));
      } catch (err) {
        return Promise.reject(err);
      }
    };
  }

  /**
   * Set the callback to be invoked when a task fails
   * @method Worker#setOnFailed
   * @param {Function} callback the callback function to be called on failure
   */
  public setOnFailed(callback: (messageOnFailed: any) => void): void {
    this.onFailed = callback;
  }

  /**
   * Start celery worker to run
   * @method Worker#start
   * @example
   * worker.register('tasks.add', (a, b) => a + b);
   * worker.start();
   */
  public start(): Promise<any> {
    console.info("celery.node worker starting...");
    console.info(`registered task: ${Object.keys(this.handlers)}`);
    return this.run().catch((err) => console.error(err));
  }

  /**
   * @method Worker#run
   * @private
   *
   * @returns {Promise}
   */
  private run(): Promise<any> {
    return this.isReady().then(() => this.processTasks());
  }

  /**
   * @method Worker#processTasks
   * @private
   *
   * @returns function results
   */
  private processTasks(): Promise<any> {
    const consumer = this.getConsumer(this.conf.CELERY_QUEUE);
    return consumer();
  }

  /**
   * @method Worker#getConsumer
   * @private
   *
   * @param {String} queue queue name for task route
   */
  private getConsumer(queue: string): Function {
    const onMessage = this.createTaskHandler();

    return (): any => this.broker.subscribe(queue, onMessage);
  }

  public createTaskHandler(): Function {
    const onTaskReceived = (message: Message): any => {
      if (!message) {
        return Promise.resolve();
      }

      let payload = null;
      let taskName = message.headers["task"];
      if (!taskName) {
        // protocol v1
        payload = message.decode();
        taskName = payload["task"];
      }

      // strategy
      let body;
      let headers;
      if (payload == null && !("args" in message.decode())) {
        body = message.decode(); // message.body;
        headers = message.headers;
      } else {
        const args = payload["args"] || [];
        const kwargs = payload["kwargs"] || {};
        const embed = {
          callbacks: payload["callbacks"],
          errbacks: payload["errbacks"],
          chord: payload["chord"],
          chain: null,
        };

        body = [args, kwargs, embed];
        headers = {
          lang: payload["lang"],
          task: payload["task"],
          id: payload["id"],
          rootId: payload["root_id"],
          parentId: payload["parentId"],
          group: payload["group"],
          meth: payload["meth"],
          shadow: payload["shadow"],
          eta: payload["eta"],
          expires: payload["expires"],
          retries: payload["retries"] || 0,
          timelimit: payload["timelimit"] || [null, null],
          kwargsrepr: payload["kwargsrepr"],
          origin: payload["origin"],
        };
      }

      // request
      const [args, kwargs /*, embed */] = body;
      const taskId = headers["id"];
      const retries = headers?.["retries"] || 0;
      let retryPolicy = {};

      for (const item of body) {
        if (item && item.retryPolicy) {
          retryPolicy = item.retryPolicy;
          break;
        }
      }

      const handler = this.handlers[taskName];
      if (!handler) {
        throw new Error(`Missing process handler for task ${taskName}`);
      }

      console.info(
        `celery.node Received task: ${taskName}[${taskId}], args: ${args}, kwargs: ${JSON.stringify(
          kwargs
        )}`
      );

      const calculateTimeout = (retryPolicy, attempt) => {
        const { intervalStart, intervalMax, intervalStep } = retryPolicy;

        // Calculate the total number of intervals
        const totalIntervals = Math.ceil(
          (intervalMax - intervalStart) / intervalStep
        );

        // Calculate the total time spent on retries
        const totalTimeRetries = totalIntervals * intervalStep;

        // Calculate the total timeout including retries
        const totalTimeout = totalTimeRetries * 1000 * (attempt + 1); // attempt + 1 to include initial attempt

        return totalTimeout;
      };

      const timeStart = process.hrtime();
      let retryCount = 0;
      let taskPromise: Promise<any>;

      const executeTask = async () => {
        try {
          return await handler(...args, kwargs);
        } catch (err) {
          console.info(
            `celery.node Task ${taskName}[${taskId}] failed: [${err}]`
          );
          this.activeTasks.delete(taskPromise);

          if (retries && retryCount < retries) {
            const delayTime = calculateTimeout(retryPolicy, retryCount) || 1000;
            console.error(
              `celery.node Task ${taskName}[${taskId}] Error processing task. Retrying ${delayTime}ms (Retry ${retryCount +
                1}/${retries})`
            );
            retryCount++;
            // Implementing a delay before retrying the task
            await new Promise((resolve) => setTimeout(resolve, delayTime));
            return executeTask(); // Retry the task
          } else {
            if (retries) {
              console.error(
                `celery.node Task ${taskName}[${taskId}] Maximum retries (${retries}) exceeded. ${err}.`
              );
            }
            if (this?.onFailed) {
              console.error("taskId", taskId);
              const messageOnFailed = {
                body,
                taskName: taskName,
                taskId: taskId,
                message: message,
                error: err,
              };

              this.onFailed(messageOnFailed);
            }
            return null;
          }
        }
      };

      taskPromise = executeTask().then((result) => {
        if (result !== null) {
          const diff = process.hrtime(timeStart);
          console.info(
            `celery.node Task ${taskName}[${taskId}] succeeded in ${diff[0] +
              diff[1] / 1e9}s: ${result}`
          );
        }
        this.activeTasks.delete(taskPromise);
        return result;
      });

      // record the executing task
      this.activeTasks.add(taskPromise);

      return taskPromise;
    };

    return onTaskReceived;
  }

  /**
   * @method Worker#whenCurrentJobsFinished
   *
   * @returns Promise that resolves when all jobs are finished
   */
  public async whenCurrentJobsFinished(): Promise<any[]> {
    return Promise.all(Array.from(this.activeTasks));
  }

  /**
   * @method Worker#stop
   *
   * @todo implement here
   */
  // eslint-disable-next-line class-methods-use-this
  public stop(): any {
    throw new Error("not implemented yet");
  }
}
