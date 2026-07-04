import axios from "axios";

const githubClient = axios.create({
    timeout: 5000,
    headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
});

githubClient.interceptors.request.use((config) => {
    const token = process.env.GITHUB_TOKEN;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

githubClient.interceptors.response.use((response) => {
    const remaining = response.headers['x-ratelimit-remaining'];
    if (remaining !== undefined) {
        console.log(`GitHub API rate limit remaining: ${remaining}`);
    }
    return response;
}, (error) => {
    const remaining = error.response?.headers?.['x-ratelimit-remaining'];
    if (remaining !== undefined) {
        console.log(`GitHub API rate limit remaining (error status ${error.response?.status}): ${remaining}`);
    }
    return Promise.reject(error);
});

export async function fetchGithubRepo(owner, repo) {
    const { data } = await githubClient.get(`https://api.github.com/repos/${owner}/${repo}`);
    return data;
}

export async function fetchGithubCommits(owner, repo, sinceDate) {
    const { data } = await githubClient.get(`https://api.github.com/repos/${owner}/${repo}/commits`, {
        params: { since: sinceDate }
    });
    return data;
}

export function formatGithubData(repoData, commits) {
    return {
        name: repoData.name,
        archived: repoData.archived,
        pushedAt: repoData.pushed_at,
        openIssues: repoData.open_issues_count,
        stars: repoData.stargazers_count,
        commitsLast7Days: Array.isArray(commits) ? commits.length : 0,
        checkedAt: new Date().toISOString()
    };
}
