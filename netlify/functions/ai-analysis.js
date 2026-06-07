// netlify/functions/ai-analysis.js
// Secure server-side proxy for Claude AI — gives investment overview, positives, and cautions

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!ANTHROPIC_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Anthropic API key not configured in Netlify environment variables.' }),
    };
  }

  const { ticker, companyName, metrics, profile, earnings } = JSON.parse(event.body || '{}');
  if (!ticker) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing ticker' }) };
  }

  // Build a rich but concise data summary for Claude to reason about
  const m = metrics || {};
  const dataSnapshot = `
COMPANY: ${companyName} (${ticker})
SECTOR: ${profile?.finnhubIndustry || 'N/A'} | EXCHANGE: ${profile?.exchange || 'N/A'} | COUNTRY: ${profile?.country || 'N/A'}
MARKET CAP: $${profile?.marketCapitalization ? (profile.marketCapitalization / 1000).toFixed(1) + 'B' : 'N/A'}

--- VALUATION ---
P/E (TTM): ${m.peBasicExclExtraTTM ?? 'N/A'}
P/B: ${m.pb ?? 'N/A'}
P/S (TTM): ${m.psTTM ?? 'N/A'}
EV/EBITDA: ${m.enterpriseValue2EbitdaTTM ?? 'N/A'}
Dividend Yield: ${m.dividendYieldIndicatedAnnual ?? 'N/A'}%
Payout Ratio: ${m.payoutRatioTTM ?? 'N/A'}%
FCF/Share: ${m.freeCashFlowPerShareTTM ?? 'N/A'}

--- FINANCIAL HEALTH ---
Debt/Equity: ${m.totalDebt2TotalEquityAnnual ?? 'N/A'}
Current Ratio: ${m.currentRatioAnnual ?? 'N/A'}
Gross Margin: ${m.grossMarginTTM ?? 'N/A'}%
Net Profit Margin: ${m.netProfitMarginTTM ?? 'N/A'}%
ROE: ${m.roeRfy ?? 'N/A'}%
ROA: ${m.roaRfy ?? 'N/A'}%

--- GROWTH ---
EPS (TTM): ${m.epsBasicExclExtraItemsTTM ?? 'N/A'}
EPS Growth (3Y): ${m.epsGrowth3Y ?? 'N/A'}%
Revenue Growth (3Y): ${m.revenueGrowth3Y ?? 'N/A'}%
52-Week Return: ${m['52WeekPriceReturnDaily'] ?? 'N/A'}%
Beta: ${m.beta ?? 'N/A'}

--- RECENT EARNINGS (last 4 quarters) ---
${earnings && earnings.length
  ? earnings.slice(0, 4).map(e =>
      `${e.period}: Actual $${e.actual} vs Est $${e.estimate} → Surprise: $${e.surprise} (${e.surprisePercent?.toFixed(1) ?? '?'}%)`
    ).join('\n')
  : 'N/A'}
`;

  const prompt = `You are a senior equity research analyst providing a concise investment overview for a retail investor.

Here is the latest financial data for ${ticker}:

${dataSnapshot}

Please provide your analysis in EXACTLY this format with these three sections. Keep each section brief and punchy — 3 to 5 bullet points max per section. Use plain language, no jargon. Always end with a one-line disclaimer.

## 🏢 What Does This Company Do?
(2-3 sentences max explaining the business in simple terms — what they sell, who their customers are, how they make money)

## ✅ Why You Might Invest (Positives)
- [bullet]
- [bullet]
- [bullet]

## ⚠️ What to Be Cautious About
- [bullet]
- [bullet]
- [bullet]

---
*Disclaimer: This is AI-generated analysis for informational purposes only. Not financial advice. Always do your own due diligence before investing.*`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: res.status, headers, body: JSON.stringify({ error: errText }) };
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    return { statusCode: 200, headers, body: JSON.stringify({ analysis: text }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
}
