import axios from "axios";
import { db } from "../db/index.js";
import { watchListTable } from "../models/watchlist.models.js";
import { eq } from "drizzle-orm";

async function runTests() {
  console.log("=== STARTING DAY 5 INTEGRATION TESTS ===");

  try {
    // 1. Get tokens by logging in
    console.log("1. Logging in users...");
    const userLogin = await axios.post("http://localhost:8000/auth/login", {
      email: "user@example.com",
      password: "password123"
    });
    const userToken = userLogin.data.token;
    console.log("User logged in successfully.");

    const adminLogin = await axios.post("http://localhost:8000/auth/login", {
      email: "admin@example.com",
      password: "password123"
    });
    const adminToken = adminLogin.data.token;
    console.log("Admin logged in successfully.");

    const api = axios.create({
      baseURL: "http://localhost:8000",
      headers: { Authorization: `Bearer ${userToken}` }
    });

    const adminApi = axios.create({
      baseURL: "http://localhost:8000",
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // 2. Add repo to watchlist
    console.log("\n2. Adding a repository to watchlist...");
    const watchRes = await api.post("/watchlist", {
      type: "repo",
      target: "expressjs/express"
    });
    const watchlistId = watchRes.data.id;
    console.log(`Created watchlist entry ID: ${watchlistId}`);

    // 3. Trigger initial check to set status to 'active'
    console.log("\n3. Triggering initial check to establish status...");
    const initCheckRes = await adminApi.post("/checks/trigger", { watchlistId });
    const initJobId = initCheckRes.data.checkJobId;
    
    // Poll until completed
    console.log("Polling initial check status...");
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusRes = await api.get(`/checks/${initJobId}`);
      if (statusRes.data.status === "COMPLETED") {
        console.log("Initial check completed successfully.");
        break;
      }
    }

    // 4. Manually update last_status to 'archived' to simulate status change
    console.log("\n4. Simulating status change by manually updating last_status to 'archived' in DB...");
    await db.update(watchListTable)
      .set({ lastStatus: "archived" })
      .where(eq(watchListTable.id, watchlistId));

    // 5. Trigger check again to detect change from 'archived' -> 'active'
    console.log("\n5. Triggering second check to detect status change...");
    const changeCheckRes = await adminApi.post("/checks/trigger", { watchlistId });
    const changeJobId = changeCheckRes.data.checkJobId;
    
    // Poll until completed
    console.log("Polling second check status...");
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusRes = await api.get(`/checks/${changeJobId}`);
      if (statusRes.data.status === "COMPLETED") {
        console.log("Second check completed. Status change should have triggered notification.");
        break;
      }
    }

    // Wait a brief moment for notification worker to finish inserting
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 6. Verify in-app notifications
    console.log("\n6. Listing in-app notifications via GET /notifications...");
    const notifsRes = await api.get("/notifications");
    console.log("In-app notifications:", notifsRes.data);
    
    const notification = notifsRes.data.find(n => n.watchlistId === watchlistId);
    if (!notification) {
      throw new Error("Status change notification was not created");
    }
    console.log("Success: Notification found in database.");

    // 7. Mark notification as read
    console.log(`\n7. Marking notification ${notification.id} as read...`);
    const readRes = await api.post(`/notifications/${notification.id}/read`);
    console.log("Read response:", readRes.data);
    if (!readRes.data.read) {
      throw new Error("Notification was not updated to read: true");
    }

    // 8. Test Eulogy Digest daily cron
    console.log("\n8. Testing Eulogy Digest: Simulating a watchlist item dead for > 24 hours...");
    // Update the item to 'dead' and set statusChangedAt to 2 days ago
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await db.update(watchListTable)
      .set({ lastStatus: "dead", statusChangedAt: twoDaysAgo })
      .where(eq(watchListTable.id, watchlistId));

    console.log("Triggering daily digest cron manually via POST /checks/eulogy-trigger...");
    const digestRes = await adminApi.post("/checks/eulogy-trigger");
    console.log("Digest response:", digestRes.data);

    // Wait a moment for emailQueue worker to process the job
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 9. Cleanup watchlist item
    console.log("\n9. Cleaning up watchlist item...");
    await api.delete(`/watchlist/${watchlistId}`);
    console.log("Cleanup complete.");

    console.log("\n=== ALL DAY 5 INTEGRATION TESTS PASSED ===");
  } catch (err) {
    console.error("Test failed:", err.response?.data || err.message);
  }
}

runTests();
