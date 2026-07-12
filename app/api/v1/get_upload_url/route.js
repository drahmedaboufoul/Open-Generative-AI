import { NextResponse } from 'next/server';

const MUAPI_BASE = 'https://api.muapi.ai';

function getApiKey(request) {
    // Managed tower deployment: the server key is authoritative and never exposed to
    // the browser. Falls back to a client-supplied key for BYO-key / local dev.
    if (process.env.MUAPI_API_KEY) return process.env.MUAPI_API_KEY;
    const headerKey = request.headers.get('x-api-key');
    if (headerKey) return headerKey;
    // Cookie-based auth removed for security (CWE-522)
    return null;
}

function cleanHeaders(request) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('cookie');
    return headers;
}

export async function GET(request) {
    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/app/get_file_upload_url${search}`;

    const headers = cleanHeaders(request);
    const apiKey = getApiKey(request);
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const response = await fetch(targetUrl, {
            headers,
            method: 'GET',
        });

        const data = await response.json();

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
