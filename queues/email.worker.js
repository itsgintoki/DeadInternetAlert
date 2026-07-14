import { Worker } from "bullmq";
import redis from "../db/redis.js";
import { sendAlertEmail } from "../utils/email.utils.js";

export const emailWorker = new Worker(
  "emailQueue",
  async (job) => {
    const { email, items } = job.data;
    const subject = `Eulogy Digest: Your dead watch items`;
    const textContent = `Hello,\n\nHere is your daily eulogy digest for items that have been flatlining for over 24 hours:\n\n${items.join("\n")}\n\nBest,\nDeadInternetAlert Team`;
    
    await sendAlertEmail(email, subject, textContent);
  },
  { connection: redis }
);

emailWorker.on("completed", (job) => console.log(`Eulogy email job ${job.id} sent successfully`));
emailWorker.on("failed", (job, err) => console.error(`Eulogy email job ${job?.id} failed: ${err.message}`));
