import { normalizeHttpTarget, requestUrlStatus } from './httpTarget.utils.js';

export async function pingUrl(target) {
    const url = await normalizeHttpTarget(target);
    let status = await requestUrlStatus(url);
    if (status === 405 || status === 501) status = await requestUrlStatus(url, 'GET');
    return formatUrlCheck({ url, status, alive: status < 400 });
}

export function formatUrlCheck({ url, status, alive }) {
    return { url, status, alive, checkedAt: new Date().toISOString() };
}
