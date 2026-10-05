When debugging:

1. Reproduce or understand the exact failure.
2. Read the error/stack trace completely.
3. Locate the failing function.
4. Trace callers/callees.
5. Determine root cause before editing.
6. Check whether the same pattern exists elsewhere.
7. Make the smallest fix.
8. Add a regression test when appropriate.
9. Run the reproduction again.
10. Review the diff.

Do not fix symptoms when the root cause is known.

Do not make unrelated refactors while debugging.