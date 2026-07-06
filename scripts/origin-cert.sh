#!/usr/bin/env bash
# Create a Cloudflare Origin CA certificate via API for a given zone apex.
# Generates the private key ON this box; only the CSR is sent to Cloudflare.
# Run interactively: prompts for a zone-scoped API token (input hidden, not stored).
#
# Usage: origin-cert.sh <apex-domain> <file-prefix>
#   origin-cert.sh aritoton.com origin          -> certs/origin.pem + certs/origin-key.pem
#   origin-cert.sh gopony.link  gopony-origin   -> certs/gopony-origin.pem + certs/gopony-origin-key.pem
set -euo pipefail

DOMAIN=${1:?usage: origin-cert.sh <apex-domain> <file-prefix>}
PREFIX=${2:?usage: origin-cert.sh <apex-domain> <file-prefix>}
CERTS=/opt/pony-link/certs

read -rsp "Paste Cloudflare API token (Zone / SSL and Certificates / Edit, scoped to $DOMAIN; input hidden): " CF_TOKEN
echo

openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$CERTS/$PREFIX-key.pem" -out /tmp/origin.csr \
  -subj "/CN=$DOMAIN" 2>/dev/null
chmod 600 "$CERTS/$PREFIX-key.pem"

payload=$(python3 -c 'import json, sys; print(json.dumps({
  "hostnames": [sys.argv[1], "*." + sys.argv[1]],
  "requested_validity": 5475,
  "request_type": "origin-rsa",
  "csr": open("/tmp/origin.csr").read()}))' "$DOMAIN")

resp=$(curl -sS -X POST "https://api.cloudflare.com/client/v4/certificates" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  --data "$payload")

echo "$resp" | python3 -c '
import json, sys
d = json.load(sys.stdin)
if not d.get("success"):
    print("API error:", json.dumps(d.get("errors"), indent=2)); sys.exit(1)
open(sys.argv[1], "w").write(d["result"]["certificate"])
print(sys.argv[1], "written")' "$CERTS/$PREFIX.pem"

chmod 644 "$CERTS/$PREFIX.pem"
rm -f /tmp/origin.csr

echo "--- result ---"
openssl x509 -in "$CERTS/$PREFIX.pem" -noout -subject -enddate
ls -la "$CERTS"
