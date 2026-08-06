# Moment Grid contracts — step 1

This package contains the plaintext scoring reference for Moment Grid.

- A grid is exactly nine bytes in row-major order.
- Each byte is a moment id from `0` to `255`.
- Each tier pool and five-minute result window is a 256-bit moment bitmap.
- Marked cells are represented as a nine-bit row-major mask.
- A zero-line round is a tie between all entrants.
- Tied winners split the whole pot. Any remainder wei is assigned in entry order.
- Every completed line permanently adds one fragment, whether or not that player wins the round.

The game depends only on `IGridStore`. `PlaintextGridStore` remains the readable,
deterministic debugging implementation when an encrypted implementation is added.

```powershell
cd contracts
forge test -vvv
```
