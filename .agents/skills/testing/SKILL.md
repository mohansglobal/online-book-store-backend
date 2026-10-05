For changed business logic:

1. Identify the behavior being changed.
2. Identify existing tests.
3. Add regression tests when fixing a bug.
4. Test:
   - normal case
   - invalid input
   - authorization
   - not-found case
   - edge/boundary cases
   - important concurrency cases when applicable

5. Run targeted tests first.
6. Run typecheck/lint.
7. Run broader tests if the change can affect other modules.

Never:
- delete a failing test just to pass
- weaken assertions
- mock the behavior being tested
- claim tests passed without running them