import axios from "axios";

const redditClient = axios.create({
    timeout: 5000,
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
});

export async function fetchSubredditAbout(name) {
    const { data } = await redditClient.get(`https://old.reddit.com/r/${name}/`);
    return data;
}

export async function searchRedditPosts(format) {
    const { data } = await redditClient.get(`https://old.reddit.com/search`, {
        params: { q: format, sort: "new", t: "week" },
    });
    return data;
}

export function formatRedditData(rawHtml) {
    const titleMatch = rawHtml.match(/<title>(.*?)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : "Subreddit";

    const over18 = rawHtml.includes("over18-notice") || rawHtml.includes("class=\"over18\"");

    return {
        name: title.split(":")[0] || title,
        subscribers: "unavailable (requires Reddit API key)",
        type: "public",
        over18,
        url: `/r/`
    };
}

export function countRecentPosts(rawHtml, format) {
    const matches = rawHtml.match(/<div class="search-result\b/g);
    const count = matches ? matches.length : 0;

    return { format, postCount7d: count, checkedAt: new Date().toISOString() };
}
