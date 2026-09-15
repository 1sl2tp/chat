from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
edge = (ROOT / 'supabase/functions/v21-customer-summary-scan/index.ts').read_text('utf-8')
compact = edge.replace(' ', '').replace('\n', '')

assert 'MAX_AI_CALLS_PER_RUN=15' in compact, 'scanner needs a hard 15-request AI budget'
assert 'MAX_CUSTOMERS_PER_RUN=14' in compact, 'reserve one request slot for one run-level model failover'
assert 'budget.calls' in edge, 'every outbound Gemini request must consume the shared run budget'
assert 'for(letattempt=0;attempt<2;attempt++)' not in compact, 'per-customer hidden retry may not double the 15-call budget'
assert 'FALLBACK_MODEL' in edge, 'scanner needs an alternate model for rate/server failure'
assert 'ai_rate_limited' in edge, '429 must remain visible as ai_rate_limited'
assert 'ai_server_unavailable' in edge, '5xx must remain visible as ai_server_unavailable'

print('Customer summary AI budget + failover contract PASS')
