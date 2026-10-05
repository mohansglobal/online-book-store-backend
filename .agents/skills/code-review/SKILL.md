After implementation:

1. Read the complete git diff.
2. Check every changed file.
3. Look for:
   - broken existing behavior
   - duplicated logic
   - wrong API contracts
   - missing validation
   - missing authorization
   - incorrect status codes
   - race conditions
   - bad database queries
   - unnecessary abstractions
   - accidental unrelated changes
   - unused imports/code
   - TypeScript issues

4. Trace important changed functions to their callers/callees.
5. Fix discovered problems.
6. Re-read the final diff.
7. Only then declare the task complete.