// netlify/functions/finnhub.js
// Secure server-side proxy for Finnhub API — key never exposed to browser

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || 'd73rbepr01qjjol42pl0d73rbepr01qjjol42plg';
const BASE = 'https://finnhub.io/api/v1';

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { endpoint, params = {} } = JSON.parse(event.body || '{}');
  if (!endpoint) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing endpoint' }) };
  }

  const query = new URLSearchParams({ ...params, token: FINNHUB_KEY }).toString();
  const url = `${BASE}${endpoint}?${query}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
}
