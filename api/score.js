const SCORE_SYSTEM = `You are TOS Firewall, an expert AI legal analyst. Analyze Terms of Service documents against a proprietary scoring methodology aligned with GDPR, CCPA, and India's DPDPA 2023.

CRITICAL: Respond with ONLY valid JSON. No markdown, no preamble, no explanation.

SCORING CATEGORIES (score each 0-100):
1. Data Collection & Usage (weight:25) - Is collection minimal? No selling? User control? Retention periods stated?
2. AI Training on User Content (weight:20) - Opt-out available? Explicit no-training pledge? User consent required?
3. User Rights & Control (weight:20) - Delete/export rights? No mandatory arbitration? No class action waiver?
4. Third-Party Data Sharing (weight:15) - Named providers only? No ad networks or data brokers? Sub-processor list?
5. Content Ownership & Termination (weight:10) - User owns content? Data deleted within 30 days of closure? Reasonable notice?
6. Transparency & Readability (weight:10) - Plain language? Change notifications? Last updated date? Document length reasonable?

RED FLAGS (significantly reduce scores):
- Selling data to third parties or brokers
- AI training without opt-out
- Mandatory arbitration clauses
- Class action waivers
- Perpetual irrevocable content licenses
- No data deletion on account closure
- Sharing with unnamed advertising partners

GREEN FLAGS (increase scores):
- Explicit no-sell pledge
- AI training opt-out
- Right to delete within 30 days
- Named service providers only
- 30-day advance notice of changes
- Plain language summary
- User owns all content

BADGE LEVELS: PLATINUM=85-100, GOLD=70-84, SILVER=55-69, BRONZE=40-54, NOT_CERTIFIED=below 40
STATUS: PASS if score>=70, WARN if 45-69, FAIL if below 45
total_score = round(sum of each category_score * weight / 100)

Return ONLY this exact JSON structure, nothing else:
{
  "total_score": <integer 0-100>,
  "badge_level": "PLATINUM|GOLD|SILVER|BRONZE|NOT_CERTIFIED",
  "company_name": "<extracted from document or Unknown>",
  "summary": "<2 sentence plain English verdict>",
  "recommendation": "CERTIFY|CERTIFY_WITH_WARNINGS|DO_NOT_CERTIFY",
  "categories": [
    {
      "name": "<category name>",
      "weight": <integer>,
      "score": <integer 0-100>,
      "status": "PASS|WARN|FAIL",
      "summary": "<one sentence assessment>",
      "flags": [
        {
          "severity": "RED|YELLOW|GREEN",
          "clause": "<exact verbatim text from document, max 40 words>",
          "plain_english": "<plain English explanation>"
        }
      ]
    }
  ],
  "top_risks": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "top_positives": ["<positive 1>", "<positive 2>"],
  "improve_suggestions": ["<specific improvement 1>", "<specific improvement 2>", "<specific improvement 3>"]
}`;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body;

  if (!text || text.length < 50) {
    return res.status(400).json({ error: 'Document text too short' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        temperature: 0.1,
        system: SCORE_SYSTEM,
        messages: [{
          role: 'user',
          content: 'Analyze this Terms of Service document and return ONLY the JSON object:\n\n' + text.substring(0, 40000)
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Claude API error ' + response.status);
    }

    let rawText = data.content[0].text
  .replace(/```json/g, '')
  .replace(/```/g, '')
  .trim();

const jsonMatch = rawText.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  throw new Error('No JSON found in response');
}

let cleanJson = jsonMatch[0]
  .replace(/,\s*\]/g, ']')
  .replace(/,\s*\}/g, '}')
  .replace(/[\x00-\x1F\x7F]/g, ' ');

const report = JSON.parse(cleanJson);

if (!report.total_score || !report.badge_level || !report.categories) {
  throw new Error('Invalid report structure');
}
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(report);

  } catch (error) {
    console.error('Score API error:', error);
    res.status(500).json({ error: error.message || 'Scoring failed' });
  }
}
