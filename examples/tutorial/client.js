"use strict";
const celery = require("../../dist");

const conf = {
  CELERY_BROKER: "amqp://",
  CELERY_BROKER_OPTIONS: {
    maxRetries: 300,
    initialRetryDelay: 1000 * 60, // 60 seconds = 1 minute
  },
  CELERY_BACKEND: "amqp://",
  CELERY_BACKEND_OPTIONS: {},
  CELERY_QUEUE: "media2222",
  TASK_PROTOCOL: 2,
  TASK_PUBLISH_RETRY: false,
  TASK_PUBLISH_RETRY_POLICY: {
    maxRetries: 3,
    intervalStart: 0,
    intervalMax: 1,
    intervalStep: 0.01,
  },
};

const client = celery.createClient(
  "amqp://myuser:mypassword@localhost:5672",
  null,
  conf.CELERY_QUEUE,
  conf
);
// client.conf.TASK_PROTOCOL = 1;
const message = {
  type: "FileUrl",
  mediaId: "20241029",
  mediaUrl:
    "https://royalegroupnyc.com/wp-content/uploads/seating_areas/sample_pdf.pdf",
  isPublic: false,
  operations: {
    convertToPdf: false,
    createThumbnail: true,
    isBlur: true,
    isResume: true,
  },
  jwtToken: "testingfailworker",
  candidateId: "dded9517-ff9f-49a0-9fe2-75788340850e",
  requestId: "f65f642d-2926-49a7-8012-d3e55bc0fe6d",
  urlPath: "/v1.0/documents/process",
  mediaName: "1734494962047.pdf",
  downloadUrl: undefined,
  mediaType: "document",
  uploadType: "FileUrl",
  isFullProcess: undefined,
};
try {
  const result = client.sendTask(
    "tasks.error2",
    [message],
    {
      retry: true,
      retryPolicy: {
        maxRetries: 2,
        intervalStart: 0.003,
        intervalMax: 30,
        intervalStep: 0.001,
      },
    },
    message.requestId
  );
  result.get().then((value) => {
    console.log(value); // Output: Promise resolved with a value
    client.disconnect();
  });
} catch (error) {
  console.log("Error", error);
}
