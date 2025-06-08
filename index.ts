import { Database } from "bun:sqlite";
import tmi from "tmi.js";
import { formatDistanceToNow } from 'date-fns';

const db = new Database("crashes.sqlite");
const twitch = new tmi.Client({
    channels: ["richardlewisreports"],
    identity: {
        username: "cstvcrashometer",
        password: import.meta.env.TWITCH_OAUTH_TOKEN,
    },
});

// check if table exists
db.run(`
CREATE TABLE IF NOT EXISTS crashes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL
);
`);

let lastPublicResponse: number | null = null;

twitch.connect();

twitch.on("message", (channel, tags, message, self) => {
    if (self) return; // Ignore messages from the bot itself

    if (!message.startsWith("!")) return; // Ignore non-command messages

    if (message.startsWith("!crashcount") || message.startsWith("!crashes")) {
        if (lastPublicResponse && Date.now() - lastPublicResponse < 5000) {
            // If the last public response was less than 5 seconds ago, ignore this command
            return;
        }
        // Fetch the count of crashes from the database
        const count = db.query("SELECT COUNT(*) as count FROM crashes").get().count;
        twitch.say(channel, `CSTV's had a crash ${count} times!`);
        lastPublicResponse = Date.now(); // Add this line
        return;
    }

    if (message.startsWith("!lastcrash")) {
        const lastCrash = db.query("SELECT * FROM crashes ORDER BY id DESC LIMIT 1").get();
        if (lastCrash) {
            const lastCrashTime = new Date(lastCrash.timestamp);
            const timeAgo = formatDistanceToNow(lastCrashTime, { addSuffix: true });
            twitch.say(channel, `The last crash was ${timeAgo}`);
        } else {
            twitch.say(channel, "No crashes recorded yet.");
        }
        return;
    }

    if (!["index_", "RichardLewisReports", "jyse_"].includes(tags.username)) {
        return; // Ignore messages from other users
        // Insert the message into the database
        // db.run("INSERT INTO crashes (timestamp) VALUES (?)", [new Date().toISOString()]);
    }

    // check the command
    if (message.startsWith("!crash")) {
        const timestamp = new Date().toISOString();
        try {
            db.run("INSERT INTO crashes (timestamp) VALUES (?)", [timestamp]);
            console.log(`Inserted crash at ${timestamp}`);
            const count = db.query("SELECT COUNT(*) as count FROM crashes").get().count;
            twitch.say(channel, `CSTV's had a crash ${count} times!`);
        } catch (error) {
            console.error("Error inserting into database:", error);
        }
        return;
    }

    if (message.startsWith("!uncrash")) {
        // delete the last crash
        try {
            db.run("DELETE FROM crashes WHERE id = (SELECT MAX(id) FROM crashes)");
            console.log("Deleted the last crash");
            const count = db.query("SELECT COUNT(*) as count FROM crashes").get().count;
            twitch.say(channel, `Deleted previous crash. CSTV's had a crash ${count} times!`);
        } catch (error) {
            console.error("Error deleting from database:", error);
        }
        return;
    }

    if (message.startsWith("!setcrashes")) {
        const match = message.match(/!setcrashes (\d+)/);
        if (match) {
            const count = parseInt(match[1], 10);
            if (isNaN(count)) {
                twitch.say(channel, "Invalid number of crashes specified.");
                return;
            }
            // Clear the table and insert the new count
            db.run("DELETE FROM crashes");
            for (let i = 0; i < count; i++) {
                db.run("INSERT INTO crashes (timestamp) VALUES (?)", [new Date().toISOString()]);
            }
            console.log(`Set crash count to ${count}`);
            twitch.say(channel, `CSTV's had a crash ${count} times!`);
        } else {
            twitch.say(channel, "Usage: !setcrashes <number>");
        }
        return;
    }
});
