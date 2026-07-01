import axios from "axios";

export async function pingUrl(target) {
    try {
        const res = await axios.head(target, { timeout: 5000 });
        return formatUrlCheck({ url: target, status: res.status, alive: res.status < 400 });
    } catch (err) {
        const status = err.response?.status ?? null;
        return formatUrlCheck({ url: target, status, alive: false })
    }
}

export function formatUrlCheck({ url, status, alive }) {
    return { url, status, alive, checkedAt: new Date().toISOString() };
}