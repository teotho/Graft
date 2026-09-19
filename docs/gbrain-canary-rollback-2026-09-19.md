# GBrain Canary and Rollback Runbook — 2026-09-19

## Verified baseline

- Target: `teotho@192.168.1.209`
- Live GBrain version observed during planning: `0.50.0.0`
- Nightly Dream Cycle: active; latest observed run succeeded.
- Dream Cycle scripts are byte-identical:
  - `/home/teotho/scripts/run-gbrain-dream.sh`
  - `/home/teotho/.hermes/bin/run_gbrain_dream.sh`
  - SHA-256: `83aaba1718c8ef614b33cc875eb82370fc3fd31225cbfe947d3f7dd65dca3b95`

No live deployment is performed by this runbook. It defines a reversible canary.

## Preflight

1. Confirm identity and versions:
   ```bash
   ssh -o BatchMode=yes teotho@192.168.1.209 \
     'set -eu; gbrain --version; sha256sum /home/teotho/scripts/run-gbrain-dream.sh /home/teotho/.hermes/bin/run_gbrain_dream.sh'
   ```
2. Run the executable-evidence gate:
   ```bash
   ssh -o BatchMode=yes teotho@192.168.1.209 \
     'python3 /home/teotho/.hermes/bin/vault_sensor_suite.py --phase pre-flight --vault-root /home/teotho/gdrive-ai-vault --workspace hermes --format json'
   ```
3. Create a timestamped backup directory and copy every file that will change:
   ```bash
   stamp=$(date +%Y%m%dT%H%M%S)
   backup=/home/teotho/backups/gbrain-canary-$stamp
   mkdir -p "$backup"
   cp -a /home/teotho/scripts/run-gbrain-dream.sh "$backup/"
   cp -a /home/teotho/.hermes/bin/run_gbrain_dream.sh "$backup/"
   gbrain config export > "$backup/gbrain-config.json"
   printf '%s\n' "$backup"
   ```

## Canary

1. Deploy to a canary path first; do not overwrite the scheduled executable.
2. Validate syntax and permissions:
   ```bash
   bash -n /home/teotho/.hermes/bin/run_gbrain_dream.canary.sh
   test -x /home/teotho/.hermes/bin/run_gbrain_dream.canary.sh
   ```
3. Run the canary once with a dedicated log and the same pre/post sensor gates.
4. Confirm all of the following before promotion:
   - exit code `0`;
   - pre-flight and post-flight gates pass;
   - `gbrain doctor` reports no new hard failures;
   - no unexpected vault writes outside GBrain-managed artifacts;
   - search smoke queries return the expected hubs/notes;
   - Honcho health remains `{"status":"ok"}`.
5. Promote atomically with `install` or same-filesystem `mv`, then verify SHA-256.
6. Keep the backup until at least two scheduled Dream Cycles succeed.

## Rollback triggers

Rollback immediately on any hard sensor failure, non-zero Dream Cycle exit,
unexpected source-file modification, loss of retrieval coverage, or version/config
drift not explained by the release plan.

## Rollback

```bash
set -eu
backup=/home/teotho/backups/gbrain-canary-<timestamp>
install -m 0755 "$backup/run-gbrain-dream.sh" /home/teotho/scripts/run-gbrain-dream.sh
install -m 0755 "$backup/run_gbrain_dream.sh" /home/teotho/.hermes/bin/run_gbrain_dream.sh
gbrain config import "$backup/gbrain-config.json"
sha256sum /home/teotho/scripts/run-gbrain-dream.sh /home/teotho/.hermes/bin/run_gbrain_dream.sh
python3 /home/teotho/.hermes/bin/vault_sensor_suite.py \
  --phase post-flight \
  --vault-root /home/teotho/gdrive-ai-vault \
  --workspace hermes \
  --format json
```

The restored scripts must return to
`83aaba1718c8ef614b33cc875eb82370fc3fd31225cbfe947d3f7dd65dca3b95` unless a
newer approved baseline is recorded before deployment.