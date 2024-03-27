export interface CeleryConf {
  CELERY_BROKER: string;
  CELERY_BROKER_OPTIONS: object;
  CELERY_BACKEND: string;
  CELERY_BACKEND_OPTIONS: object;
  CELERY_QUEUE: string;
  TASK_PROTOCOL: number;
  TASK_PUBLISH_RETRY: boolean;
  TASK_PUBLISH_RETRY_POLICY: object;
}

const DEFAULT_CELERY_CONF: CeleryConf = {
  CELERY_BROKER: "amqp://",
  CELERY_BROKER_OPTIONS: {},
  CELERY_BACKEND: "amqp://",
  CELERY_BACKEND_OPTIONS: {},
  CELERY_QUEUE: "celery",
  TASK_PROTOCOL: 2,
  TASK_PUBLISH_RETRY: false,
  TASK_PUBLISH_RETRY_POLICY: {
    max_retries: 3,
    interval_start: 0,
    interval_max: 1,
    interval_step: 0,
  },
};

function cloneObject(obj: object): object {
  const clone = {};
  for (const i in obj) {
    if (typeof obj[i] == "object" && obj[i] != null)
      clone[i] = cloneObject(obj[i]);
    else clone[i] = obj[i];
  }
  return clone;
}

export function defaultConf(): CeleryConf {
  return cloneObject(DEFAULT_CELERY_CONF) as CeleryConf;
}
