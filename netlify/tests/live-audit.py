"""Controlli HTTP non distruttivi; non crea account e non chiama modelli AI."""
import json
import subprocess
import sys

base = sys.argv[1] if len(sys.argv) > 1 else 'https://ubiquitous-lily-7f46a5.netlify.app'
checks = [('/api/health', None, 200), ('/api/me', None, 401),
          ('/api/public', {'company': 'demo'}, 200),
          ('/api/login', {'email': 'audit-nonexistent@example.invalid',
                          'password': 'Invalid-audit-password-2026'}, 400)]
failed = 0
for path, body, expected in checks:
    args = ['curl', '-sS', '--max-time', '20', '-w', '\n%{http_code}', base + path]
    if body is not None:
        args += ['-H', 'Content-Type: application/json', '--data', json.dumps(body)]
    result = subprocess.run(args, capture_output=True, text=True)
    payload, _, status = result.stdout.rpartition('\n')
    ok = result.returncode == 0 and status == str(expected)
    try:
        data = json.loads(payload)
        if path == '/api/health':
            ok = ok and data.get('database') == 'connected'
        elif path == '/api/public':
            ok = ok and bool(data.get('name')) and bool(data.get('greeting'))
    except ValueError:
        ok = False
    failed += not ok
    print(f'{"PASS" if ok else "FAIL"} {path}: HTTP {status}, atteso {expected}')
sys.exit(bool(failed))
